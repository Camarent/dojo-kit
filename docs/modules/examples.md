---
paths: [examples/]
summary: Sample courses and the ja-readings plugin used by docs and CLI tests.
---
# examples

## Purpose
Small courses and one plugin that show the course format. Not shipped in builds.

## Public surface
- `examples/demo/course.json` - minimal course (units incl. an `examOnly` unit).
- `examples/showcase/course.json` - course the CLI test `crates/dojo-cli/tests/showcase.rs` builds and validates.
- `examples/plugins/ja-readings/` - `ja-readings.js`, `ja-readings.css`, `README.md`: DojoExt plugin for `{kanji|reading}` markup and a `readings` setting; copy into a course folder and list under `course.json` `plugins`.

## Invariants and gotchas
- Plugin paths in a course must stay inside the course folder (see `README.md` of the plugin and CONTRACT.md section 4).
- `crates/dojo-cli/tests/*.rs` read these files; changing them can break CLI tests.

## Depends on / used by
- Depends on: `web/ext.js` (`DojoExt`) for the plugin.
- Used by: `crates/dojo-cli/tests/`, `docs/AUTHORING.md` readers.
