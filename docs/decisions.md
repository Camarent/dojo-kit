# Decisions

## grammar-862

Input: `workspace/progress/n5/n5-progress-2026-11-23 manually exported.json` (read only, not copied). Record `items["grammar-862"]` before load: `m0 {bad:1, ok:5, due:1794940617734, last:1794595017734}`, `s0 5`, `s 4`, `ok 25`, `bad 4`. The export has `migrated["n5-units-2"]`, so the unit migration does not run again on load.

Actual after load through `web/storage/store.js` (`s.migrated`, `web/storage/store.js:103` and `web/storage/store.js:160`): `m0 {bad:1, due:1793831306871, last:1793831306871, ok:0}`, `s0 0`, `s 4`, `ok 25`, `bad 10`. The original `m0` and `s0` are lost, and `bad` rises from 4 to 10 because the fold takes the retired duplicate's `bad` count (max pick).

Producing line: `crates/dojo-core/src/migrate.rs:76-78`. The supersedes fold (`migrate_progress`, `crates/dojo-core/src/migrate.rs:45-97`) replaces the successor record with a clone of the retired duplicate when that duplicate has a later `last`. The clone carries the duplicate's `m0` and `s0` and drops the successor's own. `migrate_doc` runs this fold at `crates/dojo-core/src/migrate.rs:145` before the `migrated[id]` marker check at `crates/dojo-core/src/migrate.rs:153`, so the fold runs on every load even when `migrated["n5-units-2"]` is set. The unit step does not cause it: `crates/dojo-core/src/migrate.rs:176` (unguarded `s0` write) is past the marker check at `:153`, so it does not run on this export; `crates/dojo-core/src/migrate.rs:193` and `:201` are guarded by `contains_key`. `web/migrate.js` has no `m0`/`s0` handling.

Failing tests (run with `cs-qrun -- node --test`):
- [historical, private: workspace/n5 is not in the public clone] `workspace/n5/tests/kana-removal-migration.test.js:54` (test at :54:3): `AssertionError: items.grammar-862 changed` (assert at :62:16), actual `"m0":{"bad":1,"due":1793831306871,"last":1793831306871,"ok":0}`, `"s0":0`; expected `m0.ok 5`, `s0 5`.
- [historical, private: workspace/n5 is not in the public clone] `workspace/n5/tests/reading-drill-migration.test.js:143` (assert at :102 in `checkFold`): `AssertionError: grammar-862 changed`, same actual/expected diff.
- [historical, private: workspace/n5 is not in the public clone] `workspace/n5/tests/scope-progress.test.js:80`: `AssertionError: n5-progress-2026-11-23 manually exported.json: grammar-862 rewritten` (assert at :42, `assertRecordsKept`), same diff.

Verdict: real migration bug

The expected values are the learner's stored `m0` and `s0`, and the load path drops them. The test expectations are correct, so they are not stale.

Proposed fix for phase 02: add a failing test first that loads the export (or a minimal synthetic doc with `migrated["n5-units-2"]` set and a record with `m0` and `s0`) through the store load and asserts `m0` and `s0` are unchanged. Find the step that rewrites the record, then fix it at that step. Do not loosen the three assertions above; they stay as written.

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
- Fixture move [historical, private: workspace/n5 is not in the public clone]: `workspace/n5/tests/migrate-learned.test.js:19` reads `workspace/n5/tools/fixtures/live-progress-SYNTHETIC.json` (no longer the old path).
