#!/usr/bin/env bash
# Whole framework check chain, run from the repo root. Stops at the first red step.
# Usage: scripts/check-all.sh [--unit | --premerge | --smoke] [--with-course-gate] [--with-courses]
# Modes (no mode flag runs the full chain, which npm test runs):
#   --unit      build-wasm, cargo test, node tests only.
#   --premerge  isolation proof only: tests/isolation-proof.sh runs --unit twice concurrently and twice in sequence.
#   --smoke     wasm-smoke, vectors drift, hooks-test, then course-test for every course dir with a course.json.
#               Mode flags exclude each other: a combination exits 2.
#   --with-course-gate  also run the course regression gate, default off. The gate script path
#                comes from DOJO_COURSE_GATE (required with --with-course-gate).
#   --with-courses  after the framework steps, run scripts/course-test.sh for every workspace/*/ with
#                course.json, one step each, default off. DOJO_KIT_ROOT, DOJO_KIT_ROOT_PY, DOJO_GIT_SAFE pass through.
# Env read by this script:
#   DOJO_QRUN   path to qrun.py. Set: each step runs as python3 -I "$DOJO_QRUN" -- <step>
#               (one OK line, or the failing pieces with the log path). Unset or missing: each step
#               runs directly, output not trimmed. Exit code decides red/green either way.
#   DOJO_COURSE_GATE  path to the course gate script (only with --with-course-gate).
#   DOJO_COVERAGE_DIR  directory for lcov files. Set: the cargo and node test steps also write
#               <dir>/rust.lcov.info (cargo llvm-cov) and <dir>/js.lcov.info (node coverage). Unset: plain runs.
# Env set by this script (only when not already set):
#   GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*'  (git in the repo and worktrees)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QRUN="${DOJO_QRUN:-}"
GATE="${DOJO_COURSE_GATE:-}"

WITH_GATE=0
WITH_COURSES=0
MODE_FLAG=""
for arg in "$@"; do
    case "$arg" in
        --unit|--premerge|--smoke)
            if [ -n "$MODE_FLAG" ]; then
                echo "check-all: mode flags cannot be combined: $MODE_FLAG $arg" >&2
                exit 2
            fi
            MODE_FLAG="$arg"
            ;;
        --with-course-gate) WITH_GATE=1 ;;
        --with-courses) WITH_COURSES=1 ;;
        *) echo "check-all: unknown argument: $arg" >&2; exit 2 ;;
    esac
done
MODE="${MODE_FLAG#--}"
MODE="${MODE:-full}"

export GIT_CONFIG_COUNT="${GIT_CONFIG_COUNT:-1}"
export GIT_CONFIG_KEY_0="${GIT_CONFIG_KEY_0:-safe.directory}"
export GIT_CONFIG_VALUE_0="${GIT_CONFIG_VALUE_0:-*}"

cd "$REPO_ROOT"

# run_cmd <command...>: run one command through qrun.py when DOJO_QRUN is set, else directly.
# Returns the command's exit status and prints nothing on its own.
run_cmd() {
    if [ -n "$QRUN" ] && [ -f "$QRUN" ]; then
        python3 -I "$QRUN" -- "$@"
    else
        "$@"
    fi
}

# step <name> <command...>: run one step through run_cmd, stop the whole script on failure.
step() {
    local name="$1"
    shift
    if run_cmd "$@"; then
        return 0
    fi
    echo "CHECK-ALL FAILED at $name"
    exit 1
}

# run_bg <tmpdir> <command...>: run one command in the background with its own TMPDIR.
# Output goes to <tmpdir>/log; the pid is left in BG_PID. Failure is read back by wait_bg.
run_bg() {
    local tdir="$1"
    shift
    (
        export TMPDIR="$tdir"
        run_cmd "$@"
    ) > "$tdir/log" 2>&1 &
    BG_PID="$!"
}

# wait_bg <pid>: wait for one background step, return its exit status (never aborts under set -e).
wait_bg() {
    local rc=0
    wait "$1" || rc=$?
    return "$rc"
}

# run_unit_tests: cargo and node tests (the --unit and full modes).
run_unit_tests() {
    # Cargo and node tests run at the same time, each with its own TMPDIR, so the leak guard
    # in tmp-leak-check.sh never counts node-side temp dirs. Both are waited for before going on.
    # The coverage branch runs in parallel too: cargo llvm-cov and node --experimental-test-coverage
    # share no state (own TMPDIR, own lcov file), so the same split is safe there.
    CARGO_TMP="$(mktemp -d)"
    NODE_TMP="$(mktemp -d)"
    CARGO_PID=""
    NODE_PID=""
    # kill_tree <pid>: kill the pid and all its descendants (children first, so none respawns).
    # The background subshell's children (tmp-leak-check.sh, cargo, node) would outlive a plain kill.
    # Children come from /proc (bash only, no pgrep/pkill): pkill -P would miss grandchildren.
    kill_tree() {
        local child children=""
        if [ -r "/proc/$1/task/$1/children" ]; then
            read -r children < "/proc/$1/task/$1/children" || true
        fi
        for child in $children; do kill_tree "$child"; done
        kill "$1" 2>/dev/null || true
    }
    # cleanup: stop any still-running background step and its children, then remove both TMPDIRs (runs on every exit).
    cleanup() {
        [ -z "$CARGO_PID" ] || kill_tree "$CARGO_PID"
        [ -z "$NODE_PID" ] || kill_tree "$NODE_PID"
        rm -rf "$CARGO_TMP" "$NODE_TMP"
    }
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    COV="${DOJO_COVERAGE_DIR:-}"
    if [ -n "$COV" ]; then
        mkdir -p "$COV"
        CARGO_NAME="cargo llvm-cov --workspace"
        run_bg "$CARGO_TMP" cargo llvm-cov --workspace --lcov --output-path "$COV/rust.lcov.info"
        CARGO_PID="$BG_PID"
        NODE_NAME="node --test modules/ja/tests/*.test.js modules/ru/tests/*.test.js web/tests/*.test.js tests/*.test.js (coverage)"
        run_bg "$NODE_TMP" node --test --experimental-test-coverage --test-coverage-exclude='**/tests/**' --test-coverage-exclude='**/vendor/**' --test-reporter=spec --test-reporter-destination=stdout --test-reporter=lcov --test-reporter-destination="$COV/js.lcov.info" modules/ja/tests/*.test.js modules/ru/tests/*.test.js web/tests/*.test.js tests/*.test.js
        NODE_PID="$BG_PID"
    else
        CARGO_NAME="cargo test --workspace"
        run_bg "$CARGO_TMP" bash scripts/tmp-leak-check.sh -- cargo test --workspace
        CARGO_PID="$BG_PID"
        NODE_NAME="node --test modules/ja/tests/*.test.js modules/ru/tests/*.test.js web/tests/*.test.js tests/*.test.js"
        run_bg "$NODE_TMP" node --test modules/ja/tests/*.test.js modules/ru/tests/*.test.js web/tests/*.test.js tests/*.test.js
        NODE_PID="$BG_PID"
    fi
    CARGO_RC=0
    wait_bg "$CARGO_PID" || CARGO_RC=$?
    NODE_RC=0
    wait_bg "$NODE_PID" || NODE_RC=$?

    echo "== $CARGO_NAME =="
    cat "$CARGO_TMP/log"
    echo "== $NODE_NAME =="
    cat "$NODE_TMP/log"
    if [ "$CARGO_RC" -ne 0 ]; then
        echo "CHECK-ALL FAILED at $CARGO_NAME"
    fi
    if [ "$NODE_RC" -ne 0 ]; then
        echo "CHECK-ALL FAILED at $NODE_NAME"
    fi
    if [ "$CARGO_RC" -ne 0 ] || [ "$NODE_RC" -ne 0 ]; then
        exit 1
    fi
}

if [ "$MODE" = premerge ]; then
    step "isolation-proof (--premerge)" bash tests/isolation-proof.sh -- bash scripts/check-all.sh --unit
    echo "CHECK-ALL OK"
    exit 0
fi

if [ "$MODE" != smoke ]; then
    step "scripts/build-wasm.sh" scripts/build-wasm.sh
    run_unit_tests
fi

if [ "$MODE" != unit ]; then
    step "node tests/wasm-smoke.js" node tests/wasm-smoke.js
    step "node tests/gen-vectors.js && git diff --exit-code -- tests/vectors" bash -c 'node tests/gen-vectors.js && git diff --exit-code -- tests/vectors'
    step "bash tests/hooks-test.sh" bash tests/hooks-test.sh
fi

if [ "$WITH_GATE" -eq 1 ]; then
    if [ -z "$GATE" ] || [ ! -f "$GATE" ]; then
        echo "check-all: --with-course-gate needs DOJO_COURSE_GATE set to the gate script" >&2
        echo "CHECK-ALL FAILED at course gate (--with-course-gate)"
        exit 1
    fi
    step "course gate (--with-course-gate)" bash "$GATE"
fi

# --smoke always runs the course tests, like --with-courses.
if [ "$MODE" = smoke ]; then
    WITH_COURSES=1
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
