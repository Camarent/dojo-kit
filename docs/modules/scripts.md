---
paths: [scripts/]
summary: Repo build scripts (WASM release build).
---
# scripts

## Purpose
Holds `scripts/build-wasm.sh`, the release build of `dojo-wasm`.

## Public surface
- `scripts/build-wasm.sh [cargo args]` - runs `cargo build --release -p dojo-wasm --target wasm32-unknown-unknown` with `--remap-path-prefix` flags so build-machine paths are not embedded; then overwrites remaining `/rustc/<hash>` strings in `dojo_wasm.wasm` in place (same length). Output: `$CARGO_TARGET_DIR` or `target/` + `wasm32-unknown-unknown/release/dojo_wasm.wasm`.

## Invariants and gotchas
- Exits 1 if the repo root, `CARGO_HOME` or the rustc sysroot path contains a space (`tests/build-wasm-paths.test.js`).
- Run before `tests/wasm-smoke.js`, web tests and `dojo build`.

## Depends on / used by
- Depends on: `cargo`, `rustc`, `perl`.
- Used by: the root `dojo` wrapper, `tests/`, `web/tests/loader.js`.
