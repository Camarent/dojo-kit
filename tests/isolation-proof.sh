#!/usr/bin/env bash
# Isolation proof: runs one command as two concurrent copies, then twice in a row,
# and fails when the shared dir gains entries (names new since the start of the run).
# Usage: bash tests/isolation-proof.sh -- <cmd...>
# Each run gets its own TMPDIR; the run fails when the command leaves entries in it (checked before it is removed).
# Shared dir: the proof also fails when that dir gains entries. Default /tmp; set ISOLATION_PROOF_DIR to override.
# Pipeline writers (qrun-*, ptest-*, pyright-*, qrun-tmp-*) are ignored, so they do not turn the proof red.
# Exit: 1 a run failed or the count grew, 2 usage error.
set -u

usage() { echo "usage: bash tests/isolation-proof.sh -- <cmd...>" >&2; exit 2; }

[ "${1:-}" = "--" ] || usage
shift
[ $# -gt 0 ] || usage

dir=${ISOLATION_PROOF_DIR:-/tmp}
# names: sorted entry names of the counted dir (one per line, empty when the dir is empty).
names() { [ -n "$dir" ] && ls -A "$dir" | sort; true; }
# grown_since <before>: entries that appeared since the snapshot. An entry that was removed and another
# one created in its place still counts. qrun-<pid>-<n>.log files are skipped: other pipeline runs write
# them into the shared dir while the proof runs. The command under test gets its own TMPDIR (run_one),
# so qrun logs of its own land there, not here.
grown_since() { grep -Fxv -f <(printf '%s\n' "$1") <(names) | grep -v -E '^(qrun-[0-9]+-[0-9]+\.log|qrun-tmp-.*|ptest-.*|pyright-.*)$' || true; }

# run_one: one run of the command with a fresh TMPDIR, removed by trap when the run ends.
run_one() {
    (
        own=$(mktemp -d) || exit 2
        trap 'rm -rf "$own"' EXIT
        TMPDIR=$own "$@"
        code=$?
        left=$(ls -A "$own" | grep -v -E '^qrun-[0-9]+-[0-9]+\.log$')
        if [ -n "$left" ]; then
            echo "isolation-proof: command left entries in its TMPDIR:" >&2
            printf '%s\n' "$left" >&2
            exit 1
        fi
        exit "$code"
    )
}

fail=0
before=$(names)

pids=()
for i in 1 2; do
    run_one "$@" &
    pids+=("$!")
done
for i in 1 2; do
    wait "${pids[$((i - 1))]}"
    code=$?
    echo "copy $i exit=$code"
    [ "$code" -eq 0 ] || fail=1
done

for i in 1 2; do
    run_one "$@"
    code=$?
    echo "seq $i exit=$code"
    [ "$code" -eq 0 ] || fail=1
done

new=
[ -n "$dir" ] && new=$(grown_since "$before")
if [ -n "$new" ]; then
    echo "isolation-proof: count grew in $dir; new entries:" >&2
    printf '%s\n' "$new" >&2
    fail=1
fi

exit "$fail"
