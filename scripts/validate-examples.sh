#!/usr/bin/env bash
# Runs `dojo validate <dir> --strict` on every shipped example course: any warning or error sets exit 1.
# Usage: scripts/validate-examples.sh [course-dir...]   (default: examples/demo examples/showcase examples/listening)
# Relative dirs resolve from the framework root, so the script runs from any cwd.
# Exit: 0 every course validates clean, 1 a course has a warning or error, 2 a course dir does not exist.
set -u

FW_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ $# -eq 0 ]; then
    set -- examples/demo examples/showcase examples/listening
fi

rc=0
for arg in "$@"; do
    case "$arg" in
        /*) dir="$arg" ;;
        *) dir="$FW_ROOT/$arg" ;;
    esac
    if ! dir="$(cd "$dir" 2>/dev/null && pwd)"; then
        echo "validate-examples: no such course dir: $arg" >&2
        exit 2
    fi
    if ! "$FW_ROOT/dojo" validate "$dir" --strict; then
        echo "validate-examples: FAIL $arg" >&2
        rc=1
    fi
done

exit $rc
