use serde::Serialize;
use std::path::Path;
use std::process::{Child, Command, Output, Stdio};

const REPOSITORY: &str = "https://github.com/jakemoshel/open-source-model-editor.git";
const SOURCE_ROOT: &str = env!("CARGO_MANIFEST_DIR");

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalRepoUpdateStatus {
    current_commit: String,
    main_commit: String,
    commits_behind: usize,
}

fn repo_root() -> Result<&'static Path, String> {
    Path::new(SOURCE_ROOT)
        .ancestors()
        .nth(2)
        .filter(|path| path.join(".git").is_dir())
        .ok_or_else(|| {
            "The local source checkout is unavailable. Reinstall from the repository.".to_string()
        })
}

fn git(args: &[&str]) -> Result<Output, String> {
    Command::new("git")
        .args(args)
        .current_dir(repo_root()?)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|_| "Git is unavailable. Install Git and try again.".to_string())
}

fn require_success(output: Output, message: &str) -> Result<String, String> {
    if !output.status.success() {
        return Err(message.to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn verify_checkout_is_safe() -> Result<(), String> {
    repo_root()?;
    let remote = require_success(
        git(&["remote", "get-url", "origin"])?,
        "Could not read the source repository.",
    )?;
    if remote != REPOSITORY && remote != "git@github.com:jakemoshel/open-source-model-editor.git" {
        return Err(
            "Updates are only allowed from the Open Source Model Editor repository.".to_string(),
        );
    }
    let branch = require_success(
        git(&["branch", "--show-current"])?,
        "Could not read the current source branch.",
    )?;
    if branch != "main" {
        return Err("Switch the source checkout to main before updating.".to_string());
    }
    // Untracked local-only files are safe to keep; reject tracked edits only.
    let dirty = require_success(
        git(&["status", "--porcelain", "--untracked-files=no"])?,
        "Could not inspect local source changes.",
    )?;
    if !dirty.is_empty() {
        return Err(format_tracked_changes_error(&dirty));
    }
    Ok(())
}

fn format_tracked_changes_error(status: &str) -> String {
    const MAX_PATHS: usize = 8;
    let changes: Vec<&str> = status.lines().map(str::trim).collect();
    let paths = changes
        .iter()
        .take(MAX_PATHS)
        .copied()
        .collect::<Vec<_>>()
        .join(", ");
    let remaining = changes.len().saturating_sub(MAX_PATHS);
    let more = if remaining > 0 {
        format!(" (and {remaining} more)")
    } else {
        String::new()
    };
    format!("Commit or stash local source changes before updating. Changed files: {paths}{more}")
}

fn fetch_main() -> Result<(), String> {
    verify_checkout_is_safe()?;
    require_success(
        git(&[
            "-c",
            "http.lowSpeedLimit=1000",
            "-c",
            "http.lowSpeedTime=30",
            "fetch",
            "--quiet",
            "origin",
            "main:refs/remotes/origin/main",
        ])?,
        "Could not check the public repository. Check your connection and try again.",
    )?;
    Ok(())
}

fn check_local_repo_update_sync() -> Result<LocalRepoUpdateStatus, String> {
    fetch_main()?;
    let current_commit = require_success(
        git(&["rev-parse", "HEAD"])?,
        "Could not read the local source version.",
    )?;
    let main_commit = require_success(
        git(&["rev-parse", "origin/main"])?,
        "Could not read the public main branch.",
    )?;
    require_success(
        git(&["merge-base", "--is-ancestor", "HEAD", "origin/main"])?,
        "Local main has commits not present on origin/main. Resolve them before updating.",
    )?;
    let behind = require_success(
        git(&["rev-list", "--count", "HEAD..origin/main"])?,
        "Could not compare source versions.",
    )?;
    let commits_behind = behind
        .parse()
        .map_err(|_| "Could not compare source versions.".to_string())?;
    Ok(LocalRepoUpdateStatus {
        current_commit,
        main_commit,
        commits_behind,
    })
}

#[tauri::command]
pub(crate) async fn check_local_repo_update() -> Result<LocalRepoUpdateStatus, String> {
    tokio::task::spawn_blocking(check_local_repo_update_sync)
        .await
        .map_err(|_| "The repository check could not finish.".to_string())?
}

fn update_local_repo_sync() -> Result<LocalRepoUpdateStatus, String> {
    let status = check_local_repo_update_sync()?;
    if status.commits_behind > 0 {
        require_success(
            git(&["merge", "--ff-only", "origin/main"])?,
            "Could not fast-forward the local source. No files were overwritten.",
        )?;
    }
    let current_commit = require_success(
        git(&["rev-parse", "HEAD"])?,
        "Could not verify the updated source.",
    )?;
    Ok(LocalRepoUpdateStatus {
        current_commit: current_commit.clone(),
        main_commit: current_commit,
        commits_behind: 0,
    })
}

#[tauri::command]
pub(crate) async fn update_local_repo(
    app: tauri::AppHandle,
) -> Result<LocalRepoUpdateStatus, String> {
    if !cfg!(target_os = "macos") {
        return Err("One-click local installation is supported on macOS only.".to_string());
    }
    let status = tokio::task::spawn_blocking(update_local_repo_sync)
        .await
        .map_err(|_| "The repository update could not finish.".to_string())??;
    let root = repo_root()?;
    let launcher = std::env::temp_dir().join(format!(
        "jakes-trainer-update-{}.command",
        std::process::id()
    ));
    std::fs::write(&launcher, installer_launcher(root, std::process::id()))
        .map_err(|e| format!("Could not prepare the installer: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&launcher, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| format!("Could not prepare the installer: {e}"))?;
    }
    let log_dir = std::env::var_os("HOME")
        .as_deref()
        .map(Path::new)
        .ok_or_else(|| "Could not find your home folder for the update log.".to_string())?
        .join("Library/Logs/Jake's Model Trainer");
    std::fs::create_dir_all(&log_dir)
        .map_err(|e| format!("Could not prepare the update log: {e}"))?;
    let log = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("update.log"))
        .map_err(|e| format!("Could not prepare the update log: {e}"))?;
    if !crate::spawn_quit_confirmation(&app, None, move |app, proceed| {
        if proceed {
            match spawn_installer(&launcher, &log) {
                Ok(_) => app.exit(0),
                Err(_) => {
                    use tauri_plugin_dialog::DialogExt;
                    app.dialog()
                        .message("Could not start the installer. Retry the update.")
                        .blocking_show();
                }
            }
        }
    }) {
        return Err(
            "A quit is already in progress. Try updating again after it finishes.".to_string(),
        );
    }
    Ok(status)
}

fn installer_launcher(root: &Path, pid: u32) -> String {
    let quoted_root = root.to_string_lossy().replace('\'', "'\"'\"'");
    format!("#!/bin/bash\nset -euo pipefail\ncd '{quoted_root}'\nbash scripts/update-local-macos.sh {pid}\n")
}

fn spawn_installer(launcher: &Path, log: &std::fs::File) -> std::io::Result<Child> {
    Command::new("/bin/bash")
        .arg(launcher)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log.try_clone()?))
        .stderr(Stdio::from(log.try_clone()?))
        .spawn()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installer_quotes_checkout_paths() {
        let script = installer_launcher(Path::new("/tmp/Jake's $(touch nope) trainer"), 42);
        assert!(script.contains("cd '/tmp/Jake'\"'\"'s $(touch nope) trainer'"));
        assert!(script.ends_with("bash scripts/update-local-macos.sh 42\n"));
    }

    #[test]
    fn installer_runs_without_a_terminal_and_logs_output() {
        let dir = tempfile::tempdir().unwrap();
        let launcher = dir.path().join("update.command");
        let log_path = dir.path().join("update.log");
        std::fs::write(&launcher, "echo update-started; echo update-error >&2").unwrap();
        let log = std::fs::File::create(&log_path).unwrap();
        let child = spawn_installer(&launcher, &log).unwrap();
        assert!(child.wait_with_output().unwrap().status.success());
        let output = std::fs::read_to_string(log_path).unwrap();
        assert!(output.contains("update-started"));
        assert!(output.contains("update-error"));
    }

    #[test]
    fn dirty_checkout_error_names_the_tracked_files() {
        let error = format_tracked_changes_error(" M studio/src-tauri/src/main.rs\nM  README.md\n");
        assert!(error.contains("studio/src-tauri/src/main.rs"));
        assert!(error.contains("README.md"));
    }

    #[test]
    fn dirty_checkout_error_caps_the_file_list() {
        let status = (0..10)
            .map(|index| format!(" M file-{index}.rs"))
            .collect::<Vec<_>>()
            .join("\n");
        let error = format_tracked_changes_error(&status);
        assert!(error.contains("file-7.rs"));
        assert!(!error.contains("file-8.rs"));
        assert!(error.contains("and 2 more"));
    }
}
