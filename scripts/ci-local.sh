#!/usr/bin/env bash
# Optional wrapper: refuse to run unless the local Node is >= 22 (the CI floor), then run scripts/ci.sh.
# Usage: scripts/ci-local.sh [ci.sh args...]
set -euo pipefail

FW_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
    echo "ci-local: node not found on PATH" >&2
    exit 2
fi

major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$major" -lt 22 ]; then
    echo "ci-local: node $major is below the CI floor 22" >&2
    exit 2
fi

exec "$FW_ROOT/scripts/ci.sh" "$@"
