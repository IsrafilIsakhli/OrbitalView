#!/usr/bin/env bash
set -euo pipefail

# Keep the scanner version and archive hash together. Values are redacted even
# on failure; only narrowly reviewed public-key fingerprints are allowlisted.
scan_tool_dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/orbital-gitleaks-8.30.1"
mkdir -p "$scan_tool_dir"
curl --fail --location --silent --show-error https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz -o "$scan_tool_dir/gitleaks.tar.gz"
printf '%s  %s\n' '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb' "$scan_tool_dir/gitleaks.tar.gz" | sha256sum --check
tar -xzf "$scan_tool_dir/gitleaks.tar.gz" -C "$scan_tool_dir" gitleaks
"$scan_tool_dir/gitleaks" git . --redact --no-banner --log-opts="--all"
