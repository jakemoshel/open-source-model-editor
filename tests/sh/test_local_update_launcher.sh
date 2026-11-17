#!/bin/bash
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/../.." && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
cat > "$fixture/bash" <<'MOCK'
#!/bin/sh
printf '%s\n' "$@" > "$UPDATE_TEST_CALL"
MOCK
chmod +x "$fixture/bash"
export UPDATE_TEST_CALL="$fixture/call"
PATH="$fixture:$PATH" /bin/bash "$repo_dir/scripts/update-local-macos.sh" 99999999
[[ "$(cat "$fixture/call")" == "$repo_dir/scripts/setup-local-macos.sh" ]]
rm "$fixture/call"
if PATH="$fixture:$PATH" /bin/bash "$repo_dir/scripts/update-local-macos.sh" invalid; then
  echo 'Invalid PID must fail' >&2
  exit 1
fi
[[ ! -e "$fixture/call" ]]
echo 'Local update launcher checks passed'
