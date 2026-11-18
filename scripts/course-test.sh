#!/usr/bin/env bash
# Generic course test runner: all node and python tests of one course, from any cwd.
# Usage: scripts/course-test.sh <course-dir> [node|python|all|final]   (default: all)
# <course-dir>/tests/final-tests.txt lists the tests of the final set, one course-relative path per line
# (a python test is listed by its dir); '#' starts a comment. Modes node, python and all skip the listed
# tests; mode final runs only them (plus the wasm freshness check), and no validate.
# Before the node suites (modes node and all), when course.json exists, runs `dojo validate <course-dir> --strict`: any warning or error sets exit 1.
# Before the node suites (modes node and all), the wasm at target/wasm32-unknown-unknown/release/dojo_wasm.wasm
# under the framework root must be fresh (same rule as web/tests/loader.js checkWasmFresh: not older than any
# .rs under crates/dojo-core/src or crates/dojo-wasm/src). Stale or missing: runs scripts/build-wasm.sh; if the
# build fails, or DOJO_WASM_NO_BUILD=1 is set, prints 'WASM stale: run scripts/build-wasm.sh' and exits 1.
# Discovers all tests in the course: *.test.js (node) and every dir with test_*.py (python).
# Skipped paths: any component named node_modules, .git, fixtures, dist, __pycache__, .venv, venv or site-packages.
# Exit: 0 green (or nothing to run in mode all and validate clean), 1 a suite failed, 2 usage error or unknown dir
#       or explicit mode with nothing found.
# Env read by this script:
#   DOJO_KIT_ROOT     framework root for the node tests (default: this framework's root).
#   DOJO_KIT_ROOT_PY  framework root for the python tests (overrides DOJO_KIT_ROOT for python only).
#   DOJO_QRUN         path to qrun.py. Set: each suite runs as python3 -I "$DOJO_QRUN" -- <cmd>.
#                     Unset: each suite runs directly.
#   DOJO_GIT_SAFE=1   export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*'.
#   DOJO_BUILD_WASM   wasm build script run when the wasm is stale (default: <framework root>/scripts/build-wasm.sh).
#   DOJO_WASM_NO_BUILD=1  do not build a stale wasm; fail with exit 1 instead.
set -u

FW_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
    echo "usage: $0 <course-dir> [node|python|all|final]" >&2
    exit 2
fi
MODE="${2:-all}"
case "$MODE" in
    python|node|all|final) ;;
    *) echo "course-test: unknown mode: $MODE" >&2; exit 2 ;;
esac

if ! COURSE="$(cd "$1" 2>/dev/null && pwd)"; then
    echo "course-test: no such course dir: $1" >&2
    exit 2
fi
cd "$COURSE" || exit 2

# Final set: course-relative paths from tests/final-tests.txt (blank lines and '#' comments dropped).
FINAL_FILE="tests/final-tests.txt"
FINAL_LIST=()
if [ -f "$FINAL_FILE" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line%%#*}"
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"
        [ -n "$line" ] || continue
        FINAL_LIST+=("${line#./}")
    done < "$FINAL_FILE"
fi

export DOJO_KIT_ROOT="${DOJO_KIT_ROOT:-$FW_ROOT}"
if [ "${DOJO_GIT_SAFE:-}" = "1" ]; then
    export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*'
fi

# run_suite <cmd...>: run one suite, through qrun.py when DOJO_QRUN is set.
run_suite() {
    if [ -n "${DOJO_QRUN:-}" ]; then
        python3 -I "$DOJO_QRUN" -- "$@"
    else
        "$@"
    fi
}

# is_final <path...>: success when one of the course-relative paths is named in the final list.
is_final() {
    local p f
    for p in "$@"; do
        p="${p#./}"
        for f in ${FINAL_LIST[@]+"${FINAL_LIST[@]}"}; do
            [ "$p" = "$f" ] && return 0
        done
    done
    return 1
}

# selected <path...>: success when the test belongs to this run: final mode takes the listed tests, others skip them.
selected() {
    if [ "$MODE" = "final" ]; then
        is_final "$@"
    else
        ! is_final "$@"
    fi
}

# find_tests <find-args...>: list paths under the course, pruning excluded directories.
find_tests() {
    find . \( -name node_modules -o -name .git -o -name fixtures -o -name dist \
        -o -name __pycache__ -o -name .venv -o -name venv -o -name site-packages \) -prune \
        -o "$@"
}

# wasm_stale: success when the wasm is missing or older than a Rust source of the wasm crates.
WASM="$FW_ROOT/target/wasm32-unknown-unknown/release/dojo_wasm.wasm"
wasm_stale() {
    [ -f "$WASM" ] || return 0
    [ -n "$(find "$FW_ROOT/crates/dojo-core/src" "$FW_ROOT/crates/dojo-wasm/src" \
        -name '*.rs' -newer "$WASM" -print -quit 2>/dev/null)" ]
}

rc=0
ran=0
node_files=()
py_dirs=()
mapfile -t all_node < <(find_tests -type f -name '*.test.js' -print)
mapfile -t all_py < <(find_tests -type f -name 'test_*.py' -printf '%h\n' | sort -u)
# Every final-list entry must name a discovered test file or python test dir.
for entry in ${FINAL_LIST[@]+"${FINAL_LIST[@]}"}; do
    found=0
    for f in ${all_node[@]+"${all_node[@]}"} ${all_py[@]+"${all_py[@]}"}; do
        [ "${f#./}" = "$entry" ] && found=1 && break
    done
    if [ "$found" -eq 0 ]; then
        echo "course-test: $FINAL_FILE lists '$entry' but no such test was found" >&2
        exit 2
    fi
done
if [ "$MODE" = "node" ] || [ "$MODE" = "all" ] || [ "$MODE" = "final" ]; then
    for f in ${all_node[@]+"${all_node[@]}"}; do
        selected "$f" && node_files+=("$f")
    done
fi
if [ "$MODE" = "python" ] || [ "$MODE" = "all" ] || [ "$MODE" = "final" ]; then
    for d in ${all_py[@]+"${all_py[@]}"}; do
        selected "$d" && py_dirs+=("$d")
    done
fi

if [ "$MODE" = "node" ] || [ "$MODE" = "all" ] || [ "$MODE" = "final" ]; then
    if wasm_stale; then
        build="${DOJO_BUILD_WASM:-$FW_ROOT/scripts/build-wasm.sh}"
        if [ "${DOJO_WASM_NO_BUILD:-}" = "1" ] || ! (cd "$FW_ROOT" && "$build"); then
            echo "WASM stale: run scripts/build-wasm.sh" >&2
            exit 1
        fi
    fi
    if [ -f course.json ] && [ "$MODE" != "final" ]; then
        run_suite "$FW_ROOT/dojo" validate "$COURSE" --strict || rc=1
    fi
fi
if [ "${#node_files[@]}" -gt 0 ]; then
    ran=1
    run_suite node --test "${node_files[@]}" || rc=1
fi
for dir in ${py_dirs[@]+"${py_dirs[@]}"}; do
    ran=1
    DOJO_KIT_ROOT="${DOJO_KIT_ROOT_PY:-$DOJO_KIT_ROOT}" \
        run_suite python3 -m unittest discover -s "$dir" -t . -q || rc=1
done

if [ "$ran" -eq 0 ]; then
    if [ "$MODE" = "all" ]; then
        echo "course-test: no tests found in $COURSE"
        exit $rc
    fi
    echo "course-test: no $MODE tests found in $COURSE" >&2
    exit 2
fi

exit $rc
