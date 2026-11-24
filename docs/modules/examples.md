---
paths: [examples/]
summary: Sample courses used by docs and CLI tests.
---
# examples

## Purpose
Small courses and one plugin that show the course format. Not shipped in builds.

## Public surface
- Module example plugins live under the module, not here: `modules/<id>/examples/` (`ja`: `modules/ja/examples/ja-readings/`). See [modules.md](modules.md).
- `examples/demo/course.json` - minimal course (geography and math units, incl. an `examOnly` unit).
- `examples/listening/course.json` - one-unit listening course ("Count the beeps") with audio stimuli from `make-audio.js`.
- `examples/showcase/course.json` - course (shapes and numbers units) that the CLI test `crates/dojo-cli/tests/showcase.rs` builds and validates.
- The ja-readings plugin moved to `modules/ja/examples/ja-readings/` (see `docs/modules/modules.md`); it is no longer in this folder.

## Invariants and gotchas
- Plugin paths in a course must stay inside the course folder (see `README.md` of the plugin and CONTRACT.md section 4).
- `crates/dojo-cli/tests/*.rs` read these files; changing them can break CLI tests.

## Depends on / used by
- Depends on: `web/ext.js` (`DojoExt`) for the plugin.
- Used by: `crates/dojo-cli/tests/`, `docs/AUTHORING.md` readers.
