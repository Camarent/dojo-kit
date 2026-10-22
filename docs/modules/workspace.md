---
paths: [workspace/]
summary: Gitignored folder for local courses; only .gitkeep is tracked.
---
# workspace

## Purpose
Default place for a user's course directories (`dojo init` uses `workspace/` under the current directory unless `--workspace DIR`; see `crates/dojo-cli/src/cmd/init.rs`). Contents are not committed.

## Public surface
- `workspace/.gitkeep` - the only tracked file. `.gitignore` ignores `workspace/*` except it.

## Invariants and gotchas
- Never commit course data here; `.githooks` refuses staging under `workspace/` (see `tests/hooks-test.sh`).

## Depends on / used by
- Used by: `dojo init`, authors.
