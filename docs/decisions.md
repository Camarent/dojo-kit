# Decisions

## grammar-862

Input: a manually exported progress file (read only, not copied). Its `migrated` marker is already set for the unit migration, so that migration does not run again on load.

Actual after load through `web/storage/store.js` (`s.migrated`, `web/storage/store.js:103` and `web/storage/store.js:160`): the `m0` and `s0` record is replaced by the fold's output. The original `m0` and `s0` are lost, and `bad` rises above its stored value because the fold takes the retired duplicate's `bad` count (max pick).

Producing line: `crates/dojo-core/src/migrate.rs:76-78`. The supersedes fold (`migrate_progress`, `crates/dojo-core/src/migrate.rs:45-97`) replaces the successor record with a clone of the retired duplicate when that duplicate has a later `last`. The clone carries the duplicate's `m0` and `s0` and drops the successor's own. `migrate_doc` runs this fold at `crates/dojo-core/src/migrate.rs:155` before the `migrated[id]` marker check at `crates/dojo-core/src/migrate.rs:163`, so the fold runs on every load even when `migrated["n5-units-2"]` is set. The unit step does not cause it: `crates/dojo-core/src/migrate.rs:186` (unguarded `s0` write) is past the marker check at `:163`, so it does not run on that load; `crates/dojo-core/src/migrate.rs:203` is guarded by `contains_key`. `web/migrate.js` has no `m0`/`s0` handling.

Failing tests (run with `cs-qrun -- node --test`):
- Three private course migration tests failed with the same `m0`/`s0` diff (historical, not in the public clone).

Verdict: real migration bug

The expected values are the learner's stored `m0` and `s0`, and the load path drops them. The test expectations are correct, so they are not stale.

Proposed fix for phase 02: add a failing test first that loads a minimal synthetic doc with `migrated["n5-units-2"]` set and a record with `m0` and `s0` through the store load and asserts `m0` and `s0` are unchanged. Find the step that rewrites the record, then fix it at that step. Do not loosen the three assertions above; they stay as written.

## grammar-862 fix (phase 02, task-1)

Step changed: `migrate_progress` (`crates/dojo-core/src/migrate.rs`). `m0` and `s0` now always come from the successor's own record (absent when it has none) and are never taken from a retired predecessor. The supersedes fold no longer drops them.

Tests: `web/tests/migrate-grammar-862.test.js` (file `web/tests/migrate-grammar-862.test.js`, test `load keeps grammar-862 m0 and s0 when the unit migration is already marked`) and `crates/dojo-core/tests/migrate.rs`. The three assertions in the grammar-862 section above stay as written.

## Storage seam audit (phase 02)

Existing seam before phase 02: `web/storage.js` (loader and `DojoStorage` export), `web/storage/*` (adapters, store, write, remote parts), and `web/ext/registry.js` `registerStorage`. Only `openRef` was checked at registration.

Gaps found: optional members (`cancelRetry`, `setWithRetry`, `readRemote`) were not checked, so a wrong type failed late in the store. No contract test covered the interface, and the built-in adapters had no shared test.

What task-3 changed: `web/ext/registry.js` validates the full interface at registration (optional members must be functions when set). The built-in artifact and local adapters run through `runContract` (`web/tests/storage-provider-contract.test.js`). `adapters.js`, `connect.js` and `storage.js` are unchanged. The provider section is in `docs/modules/web.md`.

## Migration verdict for phase 02: no migration needed

Reason: no stored shape changed. Task-1 changed only the fold logic in `migrate_progress` (which fields are copied from which record). Task-3 changed only registration checks. The progress doc stays `v:1`, the localStorage key is unchanged, and item ids are unchanged. Existing stored docs need no conversion, and the grammar-862 fix applies on the next load.

## Stale docs/tests fixed in phase 01

- None from task-2 (`stale-notes.md` says `none`).
