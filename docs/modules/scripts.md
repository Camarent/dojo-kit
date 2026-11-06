---
paths: [scripts/]
summary: Repo build and check scripts (WASM build, whole check chain).
---
# scripts

## Purpose
Holds `scripts/build-wasm.sh`, the release build of `dojo-wasm`, plus the check chain, the example validator and the local CI mirror.

## Public surface
- `scripts/build-wasm.sh [cargo args]` - runs `cargo build --release -p dojo-wasm --target wasm32-unknown-unknown` with `--remap-path-prefix` flags so build-machine paths are not embedded; then overwrites remaining `/rustc/<hash>` strings in `dojo_wasm.wasm` in place (same length). Output: `$CARGO_TARGET_DIR` or `target/` + `wasm32-unknown-unknown/release/dojo_wasm.wasm`.

- `scripts/ci.sh` - local mirror of `.github/workflows/ci.yml`: runs `build-wasm.sh`, `npm ci`, `npm run lint`, `npm run audit:js`, `cargo clippy --workspace --all-targets -- -D warnings`, `validate-examples.sh`, `npm test`, `cargo audit`, `cargo deny check`, `cargo machete` in that order (step lines `scripts/ci.sh:17-26`); stops at the first failing step; prints `CI-LOCAL OK` on success.
- `scripts/ci-local.sh [ci.sh args]` - refuses unless `node` is on PATH and its major version is 22 or newer (`scripts/ci-local.sh:13`), then `exec`s `scripts/ci.sh` (`scripts/ci-local.sh:19`).
- `scripts/validate-examples.sh [course-dir...]` - runs `dojo validate <dir> --strict` on each dir; default `examples/demo examples/showcase examples/listening` (`scripts/validate-examples.sh:11`); exit 0 all clean, 1 a course has a warning or error, 2 a dir does not exist.
- `scripts/check-all.sh [--with-course-gate] [--with-courses]` - the whole check chain (build-wasm, `cargo test --workspace`, node tests (`modules/ja/tests/*.test.js`, `web/tests/*.test.js`, `tests/*.test.js`; `scripts/check-all.sh:60`), wasm smoke, vectors no-op, hooks test), each step through `qrun.py` when `DOJO_QRUN` names it (agents export `DOJO_QRUN=<path to qrun.py>`; unset means plain run, untrimmed output); stops at the first red step and prints `CHECK-ALL FAILED at <step>` or `CHECK-ALL OK`. `--with-course-gate` adds the course gate (off by default; gate path from `DOJO_COURSE_GATE`). `--with-courses` (off by default) then runs `scripts/course-test.sh` as its own step for each `workspace/*/` holding `course.json`; none found prints a line and stays green. Sets `GIT_CONFIG_*` safe.directory `*` if unset.
- `scripts/course-test.sh <course-dir> [node|python|all]` - generic course test runner: discovers all tests in the course (`*.test.js` for node, dirs with `test_*.py` for python; paths under `node_modules`, `.git`, `fixtures`, `dist`, `__pycache__`, `.venv`, `venv`, `site-packages` skipped) and runs them; each suite through `qrun.py` when `DOJO_QRUN` is set; `DOJO_KIT_ROOT` (node) and `DOJO_KIT_ROOT_PY` (python) choose the framework root; `DOJO_GIT_SAFE=1` sets safe.directory `*`. Before the node suites (modes `node` and `all`), when `course.json` exists, it runs `dojo validate <course-dir> --strict` (`scripts/course-test.sh:69`); any warning or error fails the run (exit 1). Exit 0 green, 1 a suite or the strict validate failed, 2 usage error or nothing found in an explicit mode.
>
## Invariants and gotchas
- Exits 1 if the repo root, `CARGO_HOME` or the rustc sysroot path contains a space (`tests/build-wasm-paths.test.js`).
- Run before `tests/wasm-smoke.js`, web tests and `dojo build`.
- `tests/ci-workflow.test.js` fails when a `scripts/ci.sh` step line does not appear verbatim in `ci.yml`: edit both together.

## Depends on / used by
- Depends on: `cargo`, `rustc`, `perl`; `ci.sh` also needs `node` 22+ and `npm`.
- Used by: the root `dojo` wrapper, `tests/`, `web/tests/loader.js`; `package.json` scripts (`test` runs `scripts/check-all.sh`); `.github/workflows/ci.yml` (`build-wasm.sh`, `validate-examples.sh`, `npm test`).
