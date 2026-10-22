---
paths: [tests/]
summary: Golden test vectors shared by Rust and JS, the generator that makes them from the reference JS, the WASM smoke test and the wrapper end-to-end script.
---
# tests

## Purpose
Holds the shared golden data (`tests/vectors/*.json`) that pins progress, SRS, check and exam behaviour, plus the scripts that create and run it. Rust unit and vector tests live in `crates/*/tests`; this module owns only the shared data and the JS-side scripts.

## Public surface
- `tests/gen-vectors.js` - shim: pins `TZ=UTC`, calls `main` from `tests/gen/main.js`, which writes `vectors/srs.json`, `sanitize.json`, `merge.json`, `days.json`, `check.json`, `exam.json`. Layout of `tests/gen/`: `main.js` (`main`, uniqueness check, writer), `builders.js` (re-exports `makeSrsCases`, `makeSanitizeCases`, `makeMergeCases`, `makeDaysCases`, `makeCheckCases`, `makeExamCases`), `cases/*.js` (case builders; `srs`/`check`/`exam` are split into `*A.js`/`*B.js`/`*C.js` parts), `oracles/*.js` (JS oracles: `normalizeJs`, `gapVerdictJs`, `sampleJs`, `scoreJs`, `pickDrillJs`, `unitQueueOracle`, `draftExpectAll`), `ref.js` (loads `tools/reference/*.js`), `const.js`, `utils.js`.
- Unit-level SRS vectors in `vectors/srs.json`: `buildQueue` cases with `unitNewCaps`/`itemUnits` (oracle `unitQueueOracle`, `tests/gen/oracles/srs.js`), and the `ladderForUnit` group (unit ladder, course ladder, default, unknown unit). Entity-group `buildQueue` cases `group_*` and `absent_group_args_unchanged` come from `addGroupCase` (`tests/gen/cases/srsB.js`).
- `tests/wasm-smoke.js` `main()` - loads `target/wasm32-unknown-unknown/release/dojo_wasm.wasm` (or the path in argv[2]) through `web/dojo-wasm.js`, runs every vector, checks the wasm size budget (512 KiB), exits 1 on failure.
- `tests/wrapper.sh` - end-to-end run of the repo-root `dojo` wrapper in a temp directory: `init`, `validate`, `stats`, `next-id`, `build`, and checks the output files.
- Topic-level SRS vectors in `vectors/srs.json` (spec, append-only): groups `entityView`, `applyEntity`, and scoped `buildQueue` cases (`scoped_*`, `started_entity_new_member_not_fresh`, `no_scope_key_absent`); seeded picks use the JS mirror `pickDrillJs` in `tests/gen/oracles/srs.js`.
- `tests/vectors/` - `check.json`, `days.json`, `exam.json`, `merge.json`, `sanitize.json`, `srs.json`.

- New node tests (run after `scripts/build-wasm.sh` with `node --test web/tests/*.test.js tests/*.test.js`): `tests/fw-root.test.js` (4 tests: `DOJO_KIT_ROOT` set, missing `web/dojo-wasm.js`, walk-up, not found), `tests/reference-no-n5.test.js` (2 tests: `tools/reference/srs.js` has no `kanjiChars`/`isN5Readable`/`relatedWords`, keeps the generic functions), `tests/build-wasm-paths.test.js` (2 tests: space-path guard and guard text in `scripts/build-wasm.sh`), `tests/hooks-test.sh` (POSIX sh test of the `.githooks` guards in a scratch repo; run with `bash tests/hooks-test.sh`).

## Key files
- `gen/` - generator modules behind `gen-vectors.js`; reads `tools/reference/*.js` through `gen/ref.js`.
- `wasm-smoke.js` - the only JS test that runs the compiled core.
- `web/tests/loader.js` `checkWasmFresh()` - throws if `target/wasm32-unknown-unknown/release/dojo_wasm.wasm` is missing or older than the sources of `crates/dojo-core` and `crates/dojo-wasm`; used by the web tests (`web/tests/storage.test.js`, `exams.test.js`, `stimulus.test.js`, `session.test.js`).
- `vectors/*.json` - frozen expected outputs; each is compared by a Rust test in `crates/dojo-core/tests/` (`crates/dojo-core/tests/common/mod.rs` reads `tests/vectors`).

## Invariants and gotchas
- Vectors are frozen once the Rust core matches them. Regenerate only on a deliberate contract change; review the diff.
- `srs.json` is append-only for the unit cases: the `buildQueue` and `ladderForUnit` cases were added without changing existing entries; `node tests/gen-vectors.js` run twice gives the same output.
- CONTRACT check: `node tests/gen-vectors.js && git diff --exit-code` must pass with no changes.
- `wasm-smoke.js` needs the release WASM built first (`scripts/build-wasm.sh`, the same command the root `dojo` wrapper runs).
- The `merge` vectors cover diverged documents, foreign documents and unknown fields; do not drop cases to make tests pass.
- `merge.json` has 37 `merge_examDraft_*` cases (closed vs open, ties, `resetAt`, invalid drafts, unknown fields, `_join_*` sets folded in every order). Their `expect` comes from the JS oracle, not from the Rust code. Regenerating them is a deliberate contract change.
- The `gapVerdict` vectors pin the precedence: an input matching an answer is `ok` even when it also matches a `retry` reading. The Rust side runs them through `crates/dojo-core/tests/check_vectors.rs`, which dispatches `gapVerdict` next to the existing `check` cases.
- Wrapper check: `bash tests/wrapper.sh`.

## Depends on / used by
- Depends on: `tools/reference/progress.js`, `tools/reference/srs.js` (generator); `web/dojo-wasm.js` and the WASM build (smoke test); the root `dojo` wrapper (`wrapper.sh`).
- Used by: `crates/dojo-core/tests/*_vectors.rs` (api, check, days, exam, progress, srs vectors); `CONTRACT.md` section 8 defines the testing plan.
