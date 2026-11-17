#!/bin/bash
# Build/install this checkout and cache the exact requested MLX model; never run the upstream updater.
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || {
  echo "Run this script on native Apple Silicon macOS." >&2
  exit 1
}
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
command -v node >/dev/null
command -v npm >/dev/null
xcrun --find clang >/dev/null

if ! command -v cargo >/dev/null; then
  rust_setup="$(mktemp -t unsloth-rustup)"
  trap 'rm -f "$rust_setup"' EXIT
  curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs -o "$rust_setup"
  sh "$rust_setup" -y --profile minimal --no-modify-path
fi

npm ci --prefix studio --no-fund --no-audit
npm ci --prefix studio/frontend --no-fund --no-audit

# Use the project's installer for its existing MLX/training dependency constraints.
# --local installs this source; skipping autostart avoids an unmanaged background server.
UNSLOTH_SKIP_AUTOSTART=1 bash ./install.sh --local --tauri

backend_python="$HOME/.unsloth/studio/unsloth_studio/bin/python"
[[ -x "$backend_python" ]] || {
  echo "Expected the default local backend at $backend_python. Check the installer output." >&2
  exit 1
}
command -v uv >/dev/null
npm --prefix studio/frontend run build
# Finder launches must not import an editable backend from the protected Desktop folder.
uv pip install --python "$backend_python" --no-deps --reinstall --no-cache "$repo_dir"
"$backend_python" tests/studio/test_local_quit_selfcheck.py
"$backend_python" tests/studio/test_neuron_steering_selfcheck.py
uv pip install --python "$backend_python" pytest
"$backend_python" -m pytest -q \
  studio/backend/tests/test_graceful_shutdown_saves_training.py \
  studio/backend/tests/test_training_shutdown_stop.py \
  studio/backend/tests/test_inference_worker_shutdown_exit.py \
  studio/backend/tests/test_process_lifetime.py \
  studio/backend/tests/test_orphaned_children.py

export UNSLOTH_DESKTOP_BACKEND_VERSION
UNSLOTH_DESKTOP_BACKEND_VERSION="$("$backend_python" -c 'import runpy; print(runpy.run_path("unsloth/_version.py")["__version__"])')"
cargo test --manifest-path studio/src-tauri/Cargo.toml macos_process_cleanup::tests -- --test-threads=1
cargo test --manifest-path studio/src-tauri/Cargo.toml macos_checkpoint_shutdown_tests
cargo test --manifest-path studio/src-tauri/Cargo.toml local_build_cannot_update
cargo test --manifest-path studio/src-tauri/Cargo.toml quit_

# Build an ad-hoc signed app for this Mac. No GitHub release, updater signature or notarization.
export APPLE_SIGNING_IDENTITY=-
(
  cd studio
  ./node_modules/.bin/tauri build --bundles app --config src-tauri/tauri.macos.conf.json
)

HF_HUB_DISABLE_XET=1 "$backend_python" - <<'PY'
from huggingface_hub import snapshot_download
path = snapshot_download("SiddhJagani/Qwen3.8-4B-mlx-4Bit")
print(f"Qwen 3.8 4B MLX weights cached on SSD: {path}")
PY

app_source="$repo_dir/studio/src-tauri/target/release/bundle/macos/Jake's Model Trainer.app"
app_dest="/Applications/Jake's Model Trainer.app"
[[ -d "$app_source" ]]
if pgrep -x unsloth-studio >/dev/null; then
  echo "Quit Unsloth before installing the local build." >&2
  exit 1
fi
mkdir -p "$repo_dir/local-build"
stage_dir="$(mktemp -d /Applications/.unsloth-local.XXXXXX)"
ditto "$app_source" "$stage_dir/Jake's Model Trainer.app"
# Finder metadata on Desktop/iCloud app bundles invalidates strict signature checks.
for metadata in com.apple.FinderInfo com.apple.ResourceFork; do
  xattr -dr "$metadata" "$stage_dir/Jake's Model Trainer.app" 2>/dev/null || true
done
codesign --verify --deep --strict "$stage_dir/Jake's Model Trainer.app"
backup_app="$repo_dir/local-build/Jakes-Model-Trainer-before-local-$(date +%Y%m%d-%H%M%S).app"
legacy_backup_app="$repo_dir/local-build/Unsloth-before-rebrand-$(date +%Y%m%d-%H%M%S).app"
if [[ -e "$app_dest" ]]; then
  mv "$app_dest" "$backup_app"
fi
if [[ -e /Applications/Unsloth.app ]]; then
  mv /Applications/Unsloth.app "$legacy_backup_app"
fi
if ! mv "$stage_dir/Jake's Model Trainer.app" "$app_dest"; then
  [[ ! -e "$backup_app" ]] || mv "$backup_app" "$app_dest"
  [[ ! -e "$legacy_backup_app" ]] || mv "$legacy_backup_app" /Applications/Unsloth.app
  exit 1
fi
rmdir "$stage_dir"
echo "Installed Jake's Model Trainer at $app_dest"
echo "Chat: click Load Qwen 3.8 4B. Model Hub opens to Installed."
if /usr/bin/open -n "$app_dest"; then
  for ((attempt=0; attempt<30; attempt++)); do
    if pgrep -x unsloth-studio >/dev/null; then
      echo "Jake's Model Trainer reopened."
      break
    fi
    sleep 1
  done
  if ! pgrep -x unsloth-studio >/dev/null; then
    echo "The app installed, but macOS did not reopen it. Open Jake's Model Trainer from Applications."
  fi
else
  echo "The app installed, but macOS could not reopen it. Open Jake's Model Trainer from Applications."
fi
echo "Keep the original ZIP until the app opens, Qwen loads from disk, and quit verification passes."
