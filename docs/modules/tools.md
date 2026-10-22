---
paths: [tools/]
summary: Frozen reference JavaScript for progress and spaced repetition, used only to generate golden test vectors.
---
# tools

## Purpose
Reference implementation of the progress document and SRS logic (taken from the earlier JS trainers). Its outputs define the expected behaviour that the Rust core must match. It is never loaded by the app or the CLI.

## Public surface
- `tools/reference/progress.js:181` `api` object (exported with `module.exports`, or `window.ProgressDoc` in a browser): `sanitize`, `merge`, `stableJson`, `sameProgress` (and others listed in that block).
- `tools/reference/srs.js:554` `api` object (`module.exports`, or `window.SRS`): SRS functions including `applyAnswer`, `applyPractice`, `applyRelearn`, `applyPlacement` (`:99`, oracle for the Rust `apply_placement`), `pickVariant`, `usedAfter`, and the point-based helpers. Full list: see the `api` block.
- `tools/reference/README.md` - states the directory is frozen and used only by `tests/gen-vectors.js`.

- `tools/fw-root.js:15` `frameworkRoot(startDir)` (`module.exports`) - returns the dojo-kit root: `DOJO_KIT_ROOT` if set (must contain `web/dojo-wasm.js`, else throws), otherwise the first ancestor of `startDir` containing `web/dojo-wasm.js`, else throws. Used by course tests that need the framework.
- `tools/reference/srs.js` exports only generic functions (no kanji or N5 helpers); pinned by `tests/reference-no-n5.test.js`.

## Key files
- `reference/progress.js` - progress sanitize, merge, stable JSON.
- `reference/srs.js` - ladder scheduling and variant picking.

## Invariants and gotchas
- Do not edit: changing these files changes the expected vectors. Regenerate with `node tests/gen-vectors.js` only when the contract changes, then review the diff.
- These files are not on the runtime path; do not import them from `web/` or `crates/`.

## Depends on / used by
- Depends on: nothing (plain JavaScript).
- Used by: `tests/gen-vectors.js` (requires both files).
