#!/usr/bin/env bash
# Local mirror of .github/workflows/ci.yml: the same steps, in the same order, on one Node version.
# Usage: scripts/ci.sh   (run from anywhere; cd's to the framework root)
# Each `step <command...>` line is one CI step. tests/ci-workflow.test.js checks that every
# step line appears verbatim in ci.yml, so keep the two in sync.
# Exit: 0 every step passed, otherwise the exit code of the first failing step.
set -euo pipefail

FW_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$FW_ROOT"

step() {
    echo "==> $*"
    "$@"
}

step bash scripts/build-wasm.sh
step npm ci
step npm run lint
step npm run audit:js
step cargo clippy --workspace --all-targets -- -D warnings
step bash scripts/validate-examples.sh
step npm test
step cargo audit
step cargo deny check
step cargo machete

echo "CI-LOCAL OK"
