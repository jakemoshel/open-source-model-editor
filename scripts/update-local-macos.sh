#!/bin/bash
# Terminal owns the installer so it survives the app's normal checkpoint-saving quit.
set -euo pipefail
trap 'echo "Update failed. Your previous app is still installed unless installation already finished. Review the error above; rerun this script to retry." >&2' ERR
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -n "${1:-}" ]]; then
  [[ "$1" =~ ^[0-9]+$ ]] || { echo "Invalid app process ID" >&2; exit 1; }
  echo "Waiting for the trainer to finish saving and quit…"
  for ((attempt=0; attempt<300; attempt++)); do
    kill -0 "$1" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "$1" 2>/dev/null; then
    echo "The trainer is still running. Installation canceled; quit and retry." >&2
    exit 1
  fi
fi
bash "$repo_dir/scripts/setup-local-macos.sh"
