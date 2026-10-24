---
paths: [schema/]
summary: Committed JSON Schemas for course.json and item lines, generated from the Rust types.
---
# schema

## Purpose
Machine-readable description of the authoring format, for editors and AI agents. Both files are generated; they are not hand-written.

## Public surface
- `schema/course.schema.json` - JSON Schema of `course.json` (generated from `Course` in `crates/dojo-core/src/content/` via `course_schema`, `crates/dojo-core/src/schema.rs`). `units[]` (`$defs/Unit`, `Unit` at `crates/dojo-core/src/content/`) has optional `examOnly` (boolean; exams take these first, training uses them only if the queue would be empty),  optional `newPerDay` (integer, per-unit new-items cap; `course.schema.json`), optional `placement` (boolean, `false` excludes the unit from placement; `course.schema.json`), `srs` (`$defs/SrsConfig`, `ladder` and `dropOnWrong` (0..10); `course.schema.json`) and `newOrder` (`$defs/NewOrder`, string enum `file` | `random`; `course.schema.json`). Course-level `newOrder` (`course.schema.json`), `learnedStage` (integer or null, `course.schema.json`) and `dontKnow` (boolean or null, `course.schema.json`) are typed; `learnedStage` is read only by the browser (default stage 4); `dontKnow` has no core logic and the browser reads it (`web/session.js`, see `docs/modules/web.md`). Includes optional `plugins` (`scripts`, `styles`: path lists, `$defs/Plugins`), `markup`, `normalize` (course-level default, `$defs/Normalize`), `speech` (`$defs/SpeechConfig`: `lang`, `rate`, `voices`), `placement` (`$defs/PlacementConfig`: `perUnit`, `course.schema.json`), `groups` (array, `$defs/Group` at `course.schema.json`: `id`, `title`, `units`, `newPerDay`, `newOrder`, `extraNew`, `extraTags`), `bars` (array, `$defs/Bar`), `tagLabels` (object or null, `course.schema.json`), and `exams` (array of exam configs with `$defs/TimingGroup` for `timing` and `$defs/ScoringPart` for `scoring`; `passPoints`, `note`, `id`, `title`).
- `schema/item.schema.json` - JSON Schema of one content line (the `Item` enum, `crates/dojo-core/src/content/`, via `item_schema`, `crates/dojo-core/src/schema.rs`). Every item type accepts an optional free-form `meta` object, an optional `stimulus` string (id of a `stimuli.jsonl` entry) and an optional `speak` string (text read aloud for the item). `gap` and `cloze` `normalize` objects accept `fold` (list of `[from, to]` string pairs). `gap` accepts an optional `inputMode` (`numeric` | `decimal` | `text`, enum at `schema/item.schema.json:835`, Rust `InputMode` at `crates/dojo-core/src/content/input_mode.rs:7`); it is nullable and display only. Every item type has an optional `supersedes` array of retired ids (progress migration, see `docs/AUTHORING.md`). Every item type has an optional `entity` string (`item.schema.json`, nullable; items sharing an entity count once in group caps).
- Regenerate: `dojo schema --out schema` (`write_schemas`, `crates/dojo-cli/src/main.rs`, writes both files). `dojo schema --brief` prints the compact cheat-sheet instead (`crates/dojo-core/src/schema.rs`).

## Key files
- `course.schema.json` - top-level course fields.
- `item.schema.json` - one object per item type, discriminated by `type`.

## Invariants and gotchas
- Regenerate after any change to `crates/dojo-core/src/content/`; commit the result. A stale file means editors accept content the validator rejects.
- `$defs/Unit` sets `additionalProperties: false` (`course.schema.json`); only `id`, `title`, `newPerDay`, `srs`, `placement`, `newOrder` are valid unit keys. `newPerDay` is `integer` or `null` in the schema; negative values and bad ladders pass the schema and are rejected by `dojo validate` (`bad_unit_settings`).
- The schemas describe structure only; semantic rules (ids, unit refs, answer ranges, leaks, speech ranges and voice labels, exam ids and timing/scoring section titles) live in `dojo validate`.
- `speech.voices[role].prefer` is a string array and `inputScript` a string array in `course.schema.json`; their semantic checks are `bad_voice_pattern` and `unknown_input_script` (`crates/dojo-core/src/validate/`).
- `tagLabels` values are `string | {label?, kind?}` (`$defs/TagLabel`, `$defs/TagLabelDetail` in `course.schema.json`).
- There is no JSON Schema file for `stimuli.jsonl` or `intros.jsonl`; their shape (including stimulus `speak.lines`) is in the Rust types and in `dojo schema --brief`.

## Depends on / used by
- Depends on: `crates/dojo-core` (schemars derive on the content types).
- Used by: AI prompts in `prompts/` that tell authors what fields exist; editors via `$schema`.
