---
paths: [schema/]
summary: Committed JSON Schemas for course.json and item lines, generated from the Rust types.
---
# schema

## Purpose
Machine-readable description of the authoring format, for editors and AI agents. Both files are generated; they are not hand-written.

## Public surface
- `schema/course.schema.json` - JSON Schema of `course.json` (generated from `Course` in `crates/dojo-core/src/content.rs:231` via `course_schema`, `crates/dojo-core/src/schema.rs:12`). `units[]` (`$defs/Unit`, `Unit` at `crates/dojo-core/src/content.rs:121`) has optional `examOnly` (boolean; exams take these first, training uses them only if the queue would be empty),  optional `newPerDay` (integer, per-unit new-items cap; `course.schema.json:185`), optional `placement` (boolean, `false` excludes the unit from placement; `course.schema.json:202`), `srs` (`$defs/SrsConfig`, `ladder` and `dropOnWrong` (0..10); `course.schema.json:192`) and `newOrder` (`$defs/NewOrder`, string enum `file` | `random`; `course.schema.json:208`). Course-level `newOrder` (`course.schema.json:125`), `learnedStage` (integer or null, `course.schema.json:159`) and `dontKnow` (boolean or null, `course.schema.json:153`) are typed; `learnedStage` is read only by the browser (default stage 4); `dontKnow` has no core logic and the browser reads it (`web/session.js`, see `docs/modules/web.md`). Includes optional `plugins` (`scripts`, `styles`: path lists, `$defs/Plugins`), `markup`, `normalize` (course-level default, `$defs/Normalize`), `speech` (`$defs/SpeechConfig`: `lang`, `rate`, `voices`), `placement` (`$defs/PlacementConfig`: `perUnit`, `course.schema.json:115`), `groups` (array, `$defs/Group` at `course.schema.json:593`: `id`, `title`, `units`, `newPerDay`, `newOrder`, `extraNew`, `extraTags`), `bars` (array, `$defs/Bar` at `:655`), `tagLabels` (object or null, `course.schema.json:178`), and `exams` (array of exam configs with `$defs/TimingGroup` for `timing` and `$defs/ScoringPart` for `scoring`; `passPoints`, `note`, `id`, `title`).
- `schema/item.schema.json` - JSON Schema of one content line (the `Item` enum, `crates/dojo-core/src/content.rs:500`, via `item_schema`, `crates/dojo-core/src/schema.rs:17`). Every item type accepts an optional free-form `meta` object, an optional `stimulus` string (id of a `stimuli.jsonl` entry) and an optional `speak` string (text read aloud for the item). `gap` and `cloze` `normalize` objects accept `fold` (list of `[from, to]` string pairs). Every item type has an optional `entity` string (`item.schema.json:75`, nullable; items sharing an entity count once in group caps).
- Regenerate: `dojo schema --out schema` (`write_schemas`, `crates/dojo-cli/src/main.rs:24`, writes both files). `dojo schema --brief` prints the compact cheat-sheet instead (`crates/dojo-core/src/schema.rs:41`).

## Key files
- `course.schema.json` - top-level course fields.
- `item.schema.json` - one object per item type, discriminated by `type`.

## Invariants and gotchas
- Regenerate after any change to `crates/dojo-core/src/content.rs`; commit the result. A stale file means editors accept content the validator rejects.
- `$defs/Unit` sets `additionalProperties: false` (`course.schema.json:219`); only `id`, `title`, `newPerDay`, `srs`, `placement`, `newOrder` are valid unit keys. `newPerDay` is `integer` or `null` in the schema; negative values and bad ladders pass the schema and are rejected by `dojo validate` (`bad_unit_settings`).
- The schemas describe structure only; semantic rules (ids, unit refs, answer ranges, leaks, speech ranges and voice labels, exam ids and timing/scoring section titles) live in `dojo validate`.
- `speech.voices[role].prefer` is a string array and `inputScript` a string array in `course.schema.json`; their semantic checks are `bad_voice_pattern` and `unknown_input_script` (`validate.rs`).
- `tagLabels` values are `string | {label?, kind?}` (`$defs/TagLabel`, `$defs/TagLabelDetail` in `course.schema.json`).
- There is no JSON Schema file for `stimuli.jsonl` or `intros.jsonl`; their shape (including stimulus `speak.lines`) is in the Rust types and in `dojo schema --brief`.

## Depends on / used by
- Depends on: `crates/dojo-core` (schemars derive on the content types).
- Used by: AI prompts in `prompts/` that tell authors what fields exist; editors via `$schema`.
