//! Keep process identities across reparenting: a backend exiting is not proof its workers exited.
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::mpsc::{self, Sender};
use std::sync::Mutex;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

// A failed quit must retain identities: reparented survivors won't be descendants on retry.
static PENDING: Mutex<BTreeMap<u32, f64>> = Mutex::new(BTreeMap::new());

struct Row {
    parent: u32,
    group: u32,
    identity: String,
    started: f64,
}

fn snapshot() -> Result<BTreeMap<u32, Row>, String> {
    let output = Command::new("/bin/ps")
        .args(["-axo", "pid=,ppid=,pgid=,lstart=,comm="])
        .env("TZ", "UTC")
        .output()
        .map_err(|e| format!("Could not enumerate owned processes: {e}"))?;
    if !output.status.success() {
        return Err("Could not enumerate owned processes".into());
    }
    let mut rows = BTreeMap::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let mut rest = line.trim();
        let mut ids = Vec::new();
        for _ in 0..3 {
            let Some((id, tail)) = rest.split_once(char::is_whitespace) else { break };
            let Ok(id) = id.parse::<u32>() else { break };
            ids.push(id);
            rest = tail.trim_start();
        }
        if ids.len() != 3 || ids[0] <= 1 { continue; }
        let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
        let size = std::mem::size_of_val(&info) as i32;
        let written = unsafe { libc::proc_pidinfo(ids[0] as i32, libc::PROC_PIDTBSDINFO, 0,
            &mut info as *mut _ as *mut libc::c_void, size) };
        // Recheck the relationship natively: ps's snapshot may predate a PID being recycled.
        if written == size && info.pbi_ppid == ids[1] && info.pbi_pgid == ids[2] {
            let started = info.pbi_start_tvsec as f64 + info.pbi_start_tvusec as f64 / 1_000_000.0;
            rows.insert(ids[0], Row {
                parent: ids[1], group: ids[2], identity: rest.to_string(), started,
            });
        }
    }
    Ok(rows)
}

struct OwnedProcesses {
    root: u32,
    known: BTreeMap<u32, f64>,
    record_owners: BTreeMap<u32, String>,
    records: PathBuf,
}

fn same_recorded_identity(recorded: Option<&str>, current: &str) -> bool {
    // Python's macOS records use lstart; a Python.app re-exec can change comm.
    let recorded: Vec<_> = recorded.unwrap_or("").split_whitespace().take(5).collect();
    recorded.len() == 5 && recorded == current.split_whitespace().take(5).collect::<Vec<_>>()
}

impl OwnedProcesses {
    fn refresh(&mut self) -> Result<(), String> {
        let rows = snapshot()?;
        loop {
            let before = (self.known.len(), self.record_owners.len());
            let mut changed_identity = false;
            for (&pid, row) in &rows {
                if rows.get(&row.parent).is_some_and(|parent| {
                    self.known.get(&row.parent) == Some(&parent.started)
                }) {
                    if self.known.get(&pid) != Some(&row.started) {
                        self.known.insert(pid, row.started);
                        changed_identity = true;
                    }
                }
            }
            // Python records detached workers as well as ordinary children. Read only records
            // whose owner is already ours, and match the writer's PID identity before adopting.
            for (&pid, &started) in &self.known {
                if let Some(owner) = rows.get(&pid).filter(|r| r.started == started) {
                    self.record_owners.insert(pid, owner.identity.clone());
                }
            }
            for (pid, identity) in self.record_owners.clone() {
                if rows.get(&pid).is_some_and(|r| !same_recorded_identity(Some(&identity), &r.identity)) {
                    continue;
                }
                let path = self.records.join(format!("{pid}.json"));
                let Ok(body) = std::fs::read(path) else { continue };
                let Ok(record) = serde_json::from_slice::<serde_json::Value>(&body) else { continue };
                if record["owner_pid"].as_u64() != Some(pid as u64)
                    || !same_recorded_identity(record["owner_identity"].as_str(), &identity) {
                    continue;
                }
                for child in record["children"].as_array().into_iter().flatten() {
                    let Some(child_pid) = child["pid"].as_u64().and_then(|v| u32::try_from(v).ok()) else { continue };
                    if child_pid <= 1 { continue; }
                    let Some(identity) = child["identity"].as_str() else { continue };
                    if rows.get(&child_pid).is_none_or(|r| same_recorded_identity(Some(identity), &r.identity)) {
                        // Follow the records of dead workers too: their detached children may still live.
                        self.record_owners.entry(child_pid).or_insert_with(|| identity.to_string());
                    }
                    if let Some(row) = rows.get(&child_pid) {
                        if same_recorded_identity(child["identity"].as_str(), &row.identity) {
                            self.known.entry(child_pid).or_insert(row.started);
                        }
                    } else if child["pgid"].as_u64() == Some(child_pid as u64) {
                        // A process-group number cannot be recycled while its members survive.
                        for (&member, row) in rows.iter().filter(|(_, r)| r.group == child_pid) {
                            self.known.entry(member).or_insert(row.started);
                        }
                    }
                }
            }
            if !changed_identity && before == (self.known.len(), self.record_owners.len()) { break; }
        }
        Ok(())
    }

    fn survivors(&self) -> Vec<u32> {
        self.known.iter().filter_map(|(&pid, &started)| {
            (pid != self.root
                && crate::process_identity::process_start_time_secs(pid) == Some(started)
                && !crate::process_identity::is_zombie(pid)).then_some(pid)
        }).collect()
    }

    fn signal(&self, signal: i32) {
        for pid in self.survivors() {
            // Never signal by executable name, and never signal a recycled PID.
            unsafe { libc::kill(pid as i32, signal); }
        }
    }

    fn finish(mut self) -> Result<(), String> {
        PENDING.lock().unwrap_or_else(|e| e.into_inner()).extend(self.known.clone());
        self.refresh()?;
        PENDING.lock().unwrap_or_else(|e| e.into_inner()).extend(self.known.clone());
        for signal in [libc::SIGTERM, libc::SIGKILL] {
            self.signal(signal);
            let deadline = Instant::now() + Duration::from_secs(2);
            while !self.survivors().is_empty() && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(50));
                self.refresh()?;
                PENDING.lock().unwrap_or_else(|e| e.into_inner()).extend(self.known.clone());
                if signal == libc::SIGKILL { self.signal(signal); }
            }
        }
        let survivors = self.survivors();
        if survivors.is_empty() {
            let mut pending = PENDING.lock().unwrap_or_else(|e| e.into_inner());
            for (pid, started) in self.known {
                if pending.get(&pid) == Some(&started) { pending.remove(&pid); }
            }
            Ok(())
        } else {
            PENDING.lock().unwrap_or_else(|e| e.into_inner()).extend(self.known);
            Err(format!("Unsloth processes survived shutdown: {survivors:?}"))
        }
    }
}

pub(crate) struct ShutdownSweep {
    stop: Sender<()>,
    worker: JoinHandle<Result<(), String>>,
}

impl ShutdownSweep {
    pub(crate) fn start(records: PathBuf) -> Result<Self, String> {
        let root = std::process::id();
        let started = crate::process_identity::process_start_time_secs(root)
            .ok_or("Could not identify the desktop process")?;
        Self::start_for_backend(root, started, records)
    }

    pub(crate) fn start_for_backend(pid: u32, started: f64, records: PathBuf) -> Result<Self, String> {
        let mut known = PENDING.lock().unwrap_or_else(|e| e.into_inner()).clone();
        known.insert(pid, started);
        let mut owned = OwnedProcesses {
            root: std::process::id(), known,
            record_owners: BTreeMap::new(), records,
        };
        // Capture before any shutdown signal: workers may immediately become orphans.
        owned.refresh()?;
        let (stop, receiver) = mpsc::channel();
        let worker = std::thread::Builder::new().name("quit-process-sweep".into()).spawn(move || {
            while receiver.recv_timeout(Duration::from_millis(100)) == Err(mpsc::RecvTimeoutError::Timeout) {
                // Keep the last verified identities if one enumeration fails during teardown.
                let _ = owned.refresh();
            }
            owned.finish()
        }).map_err(|e| e.to_string())?;
        Ok(Self { stop, worker })
    }

    pub(crate) fn finish(self) -> Result<(), String> {
        let _ = self.stop.send(());
        self.worker.join().map_err(|_| "Process cleanup thread panicked")?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::process::Stdio;

    fn tree(pid: u32, records: PathBuf) -> OwnedProcesses {
        OwnedProcesses {
            root: std::process::id(),
            known: BTreeMap::from([(pid, crate::process_identity::process_start_time_secs(pid).unwrap())]),
            record_owners: BTreeMap::new(),
            records,
        }
    }

    #[test]
    fn reaps_a_detached_worker_after_its_parent_exits_and_preserves_an_unrelated_process() {
        let dir = tempfile::tempdir().unwrap();
        let mut unrelated = Command::new("/bin/sleep").arg("30").spawn().unwrap();
        let mut parent = Command::new("/usr/bin/python3").args(["-u", "-c", r#"
import subprocess, sys, time
p = subprocess.Popen([sys.executable, '-u', '-c',
    'import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); print("ready",flush=True); time.sleep(30)'],
    start_new_session=True, stdout=subprocess.PIPE, text=True)
assert p.stdout.readline().strip() == 'ready'
print(p.pid, flush=True)
time.sleep(30)
"#]).stdout(Stdio::piped()).spawn().unwrap();
        let mut line = String::new();
        BufReader::new(parent.stdout.take().unwrap()).read_line(&mut line).unwrap();
        let worker: u32 = line.trim().parse().unwrap();
        let mut owned = tree(parent.id(), dir.path().into());
        owned.refresh().unwrap();
        assert!(owned.known.contains_key(&worker));
        parent.kill().unwrap();
        parent.wait().unwrap();
        let result = owned.finish();
        let unrelated_alive = unrelated.try_wait().unwrap().is_none();
        unrelated.kill().unwrap();
        unrelated.wait().unwrap();
        result.unwrap();
        assert!(unrelated_alive);
        assert!(crate::process_identity::process_start_time_secs(worker).is_none()
            || crate::process_identity::is_zombie(worker));
    }

    #[test]
    fn follows_only_identity_matched_child_records_without_removing_disk_artifacts() {
        let dir = tempfile::tempdir().unwrap();
        let weights = dir.path().join("model.safetensors");
        std::fs::write(&weights, b"preserve weights and checkpoints").unwrap();
        let mut owner = Command::new("/bin/sleep").arg("30").spawn().unwrap();
        let mut detached = Command::new("/bin/sleep").arg("30").spawn().unwrap();
        let rows = snapshot().unwrap();
        let record = serde_json::json!({
            "owner_pid": owner.id(), "owner_identity": rows[&owner.id()].identity,
            "children": [{"pid": detached.id(), "identity": rows[&detached.id()].identity}]
        });
        std::fs::write(dir.path().join(format!("{}.json", owner.id())), record.to_string()).unwrap();
        let mut owned = tree(owner.id(), dir.path().into());
        owned.refresh().unwrap();
        assert!(owned.known.contains_key(&detached.id()));
        owned.finish().unwrap();
        owner.wait().unwrap();
        detached.wait().unwrap();
        assert_eq!(std::fs::read(weights).unwrap(), b"preserve weights and checkpoints");
    }

    #[test]
    fn stale_pid_identity_is_never_signalled() {
        let dir = tempfile::tempdir().unwrap();
        let mut child = Command::new("/bin/sleep").arg("30").spawn().unwrap();
        let mut owned = tree(child.id(), dir.path().into());
        *owned.known.get_mut(&child.id()).unwrap() += 10.0;
        owned.finish().unwrap();
        let alive = child.try_wait().unwrap().is_none();
        child.kill().unwrap();
        child.wait().unwrap();
        assert!(alive);
    }
}
