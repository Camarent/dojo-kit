#!/usr/bin/env bash
# Generic course test runner: all node and python tests of one course, from any cwd.
# Usage: scripts/course-test.sh <course-dir> [node|python|all]   (default: all)
# Discovers all tests in the course: *.test.js (node) and every dir with test_*.py (python).
# Skipped paths: any component named node_modules, .git, fixtures, dist, __pycache__, .venv, venv or site-packages.
# Exit: 0 green (or nothing to run in mode all), 1 a suite failed, 2 usage error or unknown dir
#       or explicit mode with nothing found.
# Env read by this script:
#   DOJO_KIT_ROOT     framework root for the node tests (default: this framework's root).
#   DOJO_KIT_ROOT_PY  framework root for the python tests (overrides DOJO_KIT_ROOT for python only).
#   DOJO_QRUN         path to qrun.py. Set: each suite runs as python3 -I "$DOJO_QRUN" -- <cmd>.
#                     Unset: each suite runs directly.
#   DOJO_GIT_SAFE=1   export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*'.
set -u

FW_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
    echo "usage: $0 <course-dir> [node|python|all]" >&2
    exit 2
fi
MODE="${2:-all}"
case "$MODE" in
    python|node|all) ;;
    *) echo "course-test: unknown mode: $MODE" >&2; exit 2 ;;
esac

if ! COURSE="$(cd "$1" 2>/dev/null && pwd)"; then
    echo "course-test: no such course dir: $1" >&2
    exit 2
fi
cd "$COURSE" || exit 2

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

# find_tests <find-args...>: list paths under the course, pruning excluded directories.
find_tests() {
    find . \( -name node_modules -o -name .git -o -name fixtures -o -name dist \
        -o -name __pycache__ -o -name .venv -o -name venv -o -name site-packages \) -prune \
        -o "$@"
}

rc=0
ran=0
node_files=()
py_dirs=()
if [ "$MODE" = "node" ] || [ "$MODE" = "all" ]; then
    mapfile -t node_files < <(find_tests -type f -name '*.test.js' -print)
fi
if [ "$MODE" = "python" ] || [ "$MODE" = "all" ]; then
    mapfile -t py_dirs < <(find_tests -type f -name 'test_*.py' -printf '%h\n' | sort -u)
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
        exit 0
    fi
    echo "course-test: no $MODE tests found in $COURSE" >&2
    exit 2
fi

exit $rc
