#!/usr/bin/env bash
# Isolation proof: runs one command as two concurrent copies, then twice in a row,
# and fails when the entry count of the shared dir grows.
# Usage: bash tests/isolation-proof.sh -- <cmd...>
# Counted dir: ISOLATION_PROOF_DIR, default /tmp. Each run gets its own TMPDIR, removed when the run ends.
# Exit: 1 a run failed or the count grew, 2 usage error.
set -u

usage() { echo "usage: bash tests/isolation-proof.sh -- <cmd...>" >&2; exit 2; }

[ "${1:-}" = "--" ] || usage
shift
[ $# -gt 0 ] || usage

dir=${ISOLATION_PROOF_DIR:-/tmp}
count() { ls "$dir" | wc -l; }

# run_one: one run of the command with a fresh TMPDIR, removed by trap when the run ends.
run_one() {
    (
        own=$(mktemp -d) || exit 2
        trap 'rm -rf "$own"' EXIT
        TMPDIR=$own "$@"
    )
}

fail=0
before=$(( $(count) ))

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

after=$(( $(count) ))
echo "count before=$before after=$after"
if [ "$after" -gt "$before" ]; then
    echo "isolation-proof: count grew in $dir" >&2
    fail=1
fi

exit "$fail"
