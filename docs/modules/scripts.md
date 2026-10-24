---
paths: [scripts/]
summary: Repo build and check scripts (WASM build, whole check chain).
---
# scripts

## Purpose
Holds `scripts/build-wasm.sh`, the release build of `dojo-wasm`.

## Public surface
- `scripts/build-wasm.sh [cargo args]` - runs `cargo build --release -p dojo-wasm --target wasm32-unknown-unknown` with `--remap-path-prefix` flags so build-machine paths are not embedded; then overwrites remaining `/rustc/<hash>` strings in `dojo_wasm.wasm` in place (same length). Output: `$CARGO_TARGET_DIR` or `target/` + `wasm32-unknown-unknown/release/dojo_wasm.wasm`.

- `scripts/check-all.sh [--with-course-gate] [--with-courses]` - the whole check chain (build-wasm, `cargo test --workspace`, node tests, wasm smoke, vectors no-op, hooks test), each step through `qrun.py` when `DOJO_QRUN` names it (agents export `DOJO_QRUN=<path to qrun.py>`; unset means plain run, untrimmed output); stops at the first red step and prints `CHECK-ALL FAILED at <step>` or `CHECK-ALL OK`. `--with-course-gate` adds the course gate (off by default; gate path from `DOJO_COURSE_GATE`). The older `--with-gate` flag and `DOJO_N5_GATE` env are aliases and behave the same. `--with-courses` (off by default) then runs `scripts/course-test.sh` as its own step for each `workspace/*/` holding `course.json`; none found prints a line and stays green. Sets `GIT_CONFIG_*` safe.directory `*` if unset.
- `scripts/course-test.sh <course-dir> [node|python|all]` - generic course test runner: discovers all tests in the course (`*.test.js` for node, dirs with `test_*.py` for python; paths under `node_modules`, `.git`, `fixtures`, `dist`, `__pycache__`, `.venv`, `venv`, `site-packages` skipped) and runs them; each suite through `qrun.py` when `DOJO_QRUN` is set; `DOJO_KIT_ROOT` (node) and `DOJO_KIT_ROOT_PY` (python) choose the framework root; `DOJO_GIT_SAFE=1` sets safe.directory `*`. Exit 0 green, 1 a suite failed, 2 usage error or nothing found in an explicit mode.
>
## Invariants and gotchas
- Exits 1 if the repo root, `CARGO_HOME` or the rustc sysroot path contains a space (`tests/build-wasm-paths.test.js`).
- Run before `tests/wasm-smoke.js`, web tests and `dojo build`.

## Depends on / used by
- Depends on: `cargo`, `rustc`, `perl`.
- Used by: the root `dojo` wrapper, `tests/`, `web/tests/loader.js`.
