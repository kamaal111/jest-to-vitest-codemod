#!/usr/bin/env bash

set -euo pipefail

state_dir="${HOME}/.copilot/devcontainer"
env_file="${state_dir}/copilot.env"

mkdir -p "${state_dir}"
chmod 700 "${state_dir}"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is required on the host to reuse Copilot auth inside the devcontainer." >&2
  exit 1
fi

token="$(gh auth token)"

cat >"${env_file}" <<EOF
GH_TOKEN=${token}
GITHUB_TOKEN=${token}
COPILOT_GITHUB_TOKEN=${token}
EOF

chmod 600 "${env_file}"
