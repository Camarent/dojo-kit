---
paths: [modules/ja/]
summary: The optional `ja` module - ruby markup and checks, readings, kanji breakdown rows, example plugin.
---
# module-ja

## Purpose
Japanese add-on. Adds `{base|reading}` ruby markup, ruby validation, word readings and kanji breakdown rows in feedback. Enabled per course with `"modules": ["ja"]` in `course.json`. General module rules: [module-system.md](module-system.md).

## Public surface
- Manifest `modules/ja/module.json`: `"id": "ja"`; hooks `markup`, `validator`, `ui`; `markups` `ruby`; `courseKeys` `ruby`, `breakdown`.
- Web scripts (manifest `web.scripts`): `web/ruby-dict.js`, `web/ruby.js`, `web/readings.js`, `web/kanji-rows.js`. Style: `web/ja.css`.
- Rust crate `dojo-module-ja`: `pub struct Ja` in `modules/ja/rust/src/lib.rs`; validator codes `ruby_on_skip_kanji`, `ruby_missing`.
- Built-in ruby renderer: `registry.registerBuiltinMarkup('ruby', markup)` in `modules/ja/web/ruby.js`.
- Feedback rows: `ext.registerFeedbackRows` in `modules/ja/web/kanji-rows.js`.
- Readings: `kanjiBreakdown` in `modules/ja/web/readings.js`.

## Key files
- `modules/ja/rust/src/ruby.rs` - ruby checks (`RubyChecker`); `skip_set` is used from `modules/ja/rust/src/lib.rs`.
- `modules/ja/rust/src/lang.rs` - `is_fragment`, used as `fragment_check` for `ja`.
- `modules/ja/examples/ja-readings/` - example DojoExt plugin, not a module. It registers the `readings` setting and the `ja-readings` markup. Opt-in with `plugins` plus `"markup": "ja-readings"` in `course.json`.

## Invariants and gotchas
- The `ja` validator checks `course.ruby` keys `checkQuestions`, `drillTags`, `drillUnits`; the browser reads the display keys `skip`, `skipTag`, `skipKey` ([web.md](web.md)).
- `ja` must be listed in `modules` for its keys or markup to be accepted; otherwise `module_key_unlisted` (see [module-system.md](module-system.md)).
- Tests: `modules/ja/tests/*.test.js` (run by `scripts/check-all.sh`), `modules/ja/rust/tests/*.rs`.
