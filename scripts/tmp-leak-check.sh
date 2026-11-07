#!/usr/bin/env bash
# Leak guard: runs one command, then fails if it left new entries in ${TMPDIR:-/tmp} matching a glob.
# Usage: scripts/tmp-leak-check.sh [--pattern GLOB]... -- <command> [args...]
# Default pattern: dojo-*. --pattern is repeatable and replaces the default.
# Exit: 1 the entry count grew (new names printed to stderr), 2 usage error,
#       otherwise the command's own exit status.
set -u

DEFAULT_PATTERN='dojo-*'
patterns=()
while [ $# -gt 0 ]; do
    case "$1" in
        --pattern)
            if [ $# -lt 2 ]; then echo "tmp-leak-check: --pattern needs a glob" >&2; exit 2; fi
            patterns+=("$2")
            shift 2
            ;;
        --) shift; break ;;
        *) echo "usage: $0 [--pattern GLOB]... -- <command> [args...]" >&2; exit 2 ;;
    esac
done
if [ "${#patterns[@]}" -eq 0 ]; then
    patterns=("$DEFAULT_PATTERN")
fi
if [ $# -eq 0 ]; then
    echo "usage: $0 [--pattern GLOB]... -- <command> [args...]" >&2
    exit 2
fi

dir="${TMPDIR:-/tmp}"

# list_matches: sorted names of entries directly in $dir matching any pattern.
list_matches() {
    local args=() p
    for p in "${patterns[@]}"; do
        [ "${#args[@]}" -gt 0 ] && args+=(-o)
        args+=(-name "$p")
    done
    find "$dir" -mindepth 1 -maxdepth 1 \( "${args[@]}" \) -printf '%f\n' | sort
}

mapfile -t before < <(list_matches)
"$@"
status=$?
mapfile -t after < <(list_matches)

if [ "${#after[@]}" -gt "${#before[@]}" ]; then
    echo "tmp-leak-check: ${#before[@]} -> ${#after[@]} matching entries in $dir; new:" >&2
    for name in "${after[@]}"; do
        seen=0
        for old in "${before[@]}"; do
            if [ "$old" = "$name" ]; then seen=1; break; fi
        done
        if [ "$seen" -eq 0 ]; then echo "  $name" >&2; fi
    done
    exit 1
fi
exit "$status"
