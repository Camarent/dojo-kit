---
paths: [crates/dojo-wasm/]
summary: cdylib exposing dojo-core to the browser through a JSON-string ABI (alloc/dealloc/call).
---
# crates/dojo-wasm

## Purpose
Thin WebAssembly wrapper over `dojo-core`. The browser calls one generic entry point with a function name and JSON arguments, and receives a JSON envelope. No logic lives here.

## Public surface
- `crates/dojo-wasm/src/lib.rs:10` `alloc(len) -> ptr` (exported `extern "C"`).
- `crates/dojo-wasm/src/lib.rs:20` `dealloc(ptr, len)` (unsafe; release each buffer once).
- `crates/dojo-wasm/src/lib.rs:32` `call(name_ptr, name_len, args_ptr, args_len) -> u64` - returns `(ptr << 32) | len` of a UTF-8 JSON envelope; the caller must `dealloc` it.
- Envelope and function names: see `crates/dojo-core/src/api.rs:15`.
- Crate type `cdylib`, no wasm-bindgen (`Cargo.toml`).

## Key files
- `src/lib.rs` - all of the ABI; the functions are compiled only for `wasm32` (`#[cfg(target_arch = "wasm32")]`).
- `Cargo.toml` - depends only on `dojo-core`.

## Invariants and gotchas
- Input that is not valid UTF-8 returns a `bad_utf8` envelope instead of trapping.
- Built with `opt-level="z"`, `lto`, `panic="abort"` from the workspace `Cargo.toml`; a trap discards the instance on the JS side (see `web/dojo-wasm.js`).
- The build command is `scripts/build-wasm.sh` (wraps `cargo build --release -p dojo-wasm --target wasm32-unknown-unknown` with path remapping) (as in the repo-root `dojo` wrapper).
- Size budget 512 KiB is checked by `tests/wasm-smoke.js`.

## Depends on / used by
- Depends on: `crates/dojo-core`.
- Used by: `web/dojo-wasm.js` (loader), `dojo build` (embeds the `.wasm` as base64), `tests/wasm-smoke.js`.
