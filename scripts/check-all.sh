#!/usr/bin/env bash
# Whole framework check chain, run from the repo root. Stops at the first red step.
# Usage: scripts/check-all.sh [--with-gate]
#   --with-gate  also run the n5 regression gate, default off. The gate script path comes from
#                DOJO_N5_GATE (required with --with-gate).
# Env read by this script:
#   DOJO_QRUN   path to qrun.py. Set: each step runs as python3 -I "$DOJO_QRUN" -- <step>
#               (one OK line, or the failing pieces with the log path). Unset or missing: each step
#               runs directly, output not trimmed. Exit code decides red/green either way.
#   DOJO_N5_GATE  path to the n5 gate script (only with --with-gate).
# Env set by this script (only when not already set):
#   GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*'  (git in the repo and worktrees)
# Env read by the gate (passed through from the caller): N5_DIR, N5_BASELINE, N5_EXPORTS.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QRUN="${DOJO_QRUN:-}"
GATE="${DOJO_N5_GATE:-}"

WITH_GATE=0
for arg in "$@"; do
    case "$arg" in
        --with-gate) WITH_GATE=1 ;;
        *) echo "check-all: unknown argument: $arg" >&2; exit 2 ;;
    esac
done

export GIT_CONFIG_COUNT="${GIT_CONFIG_COUNT:-1}"
export GIT_CONFIG_KEY_0="${GIT_CONFIG_KEY_0:-safe.directory}"
export GIT_CONFIG_VALUE_0="${GIT_CONFIG_VALUE_0:-*}"

cd "$REPO_ROOT"

# step <name> <command...>: run one step through qrun.py, stop the whole script on failure.
step() {
    local name="$1"
    shift
    if [ -n "$QRUN" ] && [ -f "$QRUN" ]; then
        python3 -I "$QRUN" -- "$@" && return 0
    else
        "$@" && return 0
    fi
    echo "CHECK-ALL FAILED at $name"
    exit 1
}

step "scripts/build-wasm.sh" scripts/build-wasm.sh
step "cargo test --workspace" cargo test --workspace
step "node --test web/tests/*.test.js tests/*.test.js" node --test web/tests/*.test.js tests/*.test.js
step "node tests/wasm-smoke.js" node tests/wasm-smoke.js
step "node tests/gen-vectors.js && git diff --exit-code -- tests/vectors" bash -c 'node tests/gen-vectors.js && git diff --exit-code -- tests/vectors'
step "bash tests/hooks-test.sh" bash tests/hooks-test.sh

if [ "$WITH_GATE" -eq 1 ]; then
    if [ -z "$GATE" ] || [ ! -f "$GATE" ]; then
        echo "check-all: --with-gate needs DOJO_N5_GATE set to the gate script" >&2
        echo "CHECK-ALL FAILED at n5 gate (--with-gate)"
        exit 1
    fi
    step "n5 gate (--with-gate)" bash "$GATE"
fi

echo "CHECK-ALL OK"
