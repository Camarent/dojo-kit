#!/usr/bin/env bash
# Whole framework check chain, run from the repo root. Stops at the first red step.
# Usage: scripts/check-all.sh [--with-course-gate] [--with-courses]
#   --with-course-gate  also run the course regression gate, default off. The gate script path
#                comes from DOJO_COURSE_GATE (required with --with-course-gate).
#                Alias: --with-gate and DOJO_N5_GATE work the same (kept for older callers).
#   --with-courses  after the framework steps, run scripts/course-test.sh for every workspace/*/ with
#                course.json, one step each, default off. DOJO_KIT_ROOT, DOJO_KIT_ROOT_PY, DOJO_GIT_SAFE pass through.
# Env read by this script:
#   DOJO_QRUN   path to qrun.py. Set: each step runs as python3 -I "$DOJO_QRUN" -- <step>
#               (one OK line, or the failing pieces with the log path). Unset or missing: each step
#               runs directly, output not trimmed. Exit code decides red/green either way.
#   DOJO_COURSE_GATE  path to the course gate script (only with --with-course-gate).
#                 DOJO_N5_GATE is an alias, used when DOJO_COURSE_GATE is unset.
# Env set by this script (only when not already set):
#   GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*'  (git in the repo and worktrees)
# Env read by the gate (passed through from the caller): N5_DIR, N5_BASELINE, N5_EXPORTS.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QRUN="${DOJO_QRUN:-}"
GATE="${DOJO_COURSE_GATE:-${DOJO_N5_GATE:-}}"

WITH_GATE=0
WITH_COURSES=0
for arg in "$@"; do
    case "$arg" in
        --with-course-gate|--with-gate) WITH_GATE=1 ;;
        --with-courses) WITH_COURSES=1 ;;
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

if [ "$WITH_COURSES" -eq 1 ]; then
    found=0
    for cj in workspace/*/course.json; do
        [ -f "$cj" ] || continue
        found=1
        cdir="$(dirname "$cj")"
        step "course-test $cdir (--with-courses)" scripts/course-test.sh "$cdir"
    done
    [ "$found" -eq 1 ] || echo "check-all: no courses under workspace/"
fi

echo "CHECK-ALL OK"
