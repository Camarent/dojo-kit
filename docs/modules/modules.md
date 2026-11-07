---
paths: [modules/]
summary: Optional modules (ja, ru) - validator crates, browser scripts, manifests - and their registry crate.
---
# modules

## Purpose
Optional per-language add-ons. A course enables them with `course.json` `modules` (ids). Each module is a folder `modules/<id>/` with `module.json`, an optional Rust validator crate (`modules/<id>/rust`) and optional browser code.
The `modules/registry` crate maps ids to validator implementations; the CLI and the core validator consume it.

## Public surface
- `modules/registry/src/lib.rs:5` `IDS` = `["ja", "ru"]`; `ids()` at `modules/registry/src/lib.rs:8`.
- `modules/registry/src/lib.rs:13` `validator(id) -> Option<Box<dyn ValidatorModule>>`: `ja` -> `dojo_module_ja::Ja`, `ru` -> `dojo_module_ru::Ru`.
- Trait the modules implement: `ValidatorModule` at `crates/dojo-core/src/validate/module.rs:11` (`fragment_check` :22, `course_checker` :38, `prompt_triggers`, `disambiguation_words`); `ItemChecker` at `crates/dojo-core/src/validate/module.rs:44`.
- `ja` crate `dojo-module-ja`: `pub struct Ja` at `modules/ja/rust/src/lib.rs:15`; codes `ruby_on_skip_kanji`, `ruby_missing` at `modules/ja/rust/src/lib.rs:9`.
- `ru` crate `dojo-module-ru`: `pub struct Ru` at `modules/ru/rust/src/lib.rs:7`; `PROMPT_TRIGGERS` at `modules/ru/rust/src/lib.rs:9`; `DISAMBIGUATION_WORDS` (`любой`, `или`) at `modules/ru/rust/src/lib.rs:14`.
- Manifests: `modules/ja/module.json` (`"id": "ja"` at :3; hooks `markup`, `validator`, `ui`; web scripts `web/ruby-dict.js`, `web/ruby.js`, `web/readings.js`, `web/kanji-rows.js`; style `web/ja.css`; `courseKeys` `ruby`, `breakdown`). `modules/ru/module.json` (`"id": "ru"` at :3; hooks `validator` only).
- CLI loading: `resolve` at `crates/dojo-cli/src/modules.rs:56`, `all_manifests` at `crates/dojo-cli/src/modules.rs:96`, `load` (reads `modules/<id>/module.json`) at `crates/dojo-cli/src/modules.rs:147`.
- Course key: `modules` array in `course.json`, schema at `schema/course.schema.json:276`.

## Key files
- `modules/registry/src/lib.rs` - id list and validator factory; add a new module here and in `Cargo.toml` workspace members (`Cargo.toml:3`).
- `modules/ja/rust/src/ruby.rs` - ruby checks (`RubyChecker`, impl at :99; `skip_set` use in `modules/ja/rust/src/lib.rs:35`).
- `modules/ja/rust/src/lang.rs` - `is_fragment` (`pub(crate)`, :12) used as `fragment_check` for `ja`.
- `modules/ja/web/ruby.js` - built-in `ruby` markup, registered by `registry.registerBuiltinMarkup('ruby', markup)` at :165. `scriptRuns` (:47) splits a base into kanji and non-kanji runs (astral kanji count as kanji); `kanjiEnd` (:52) and `splitRuby` (:56) align readings to kanji runs.
- `modules/ja/rust/src/ruby.rs` - `skip_set` (:52), `RubyChecker` (:94); skip rules run only when `markup` is `ruby` and a skip source is set (:2, :51).
- `modules/ja/web/kanji-rows.js` - default feedback rows via `ext.registerFeedbackRows` at :17.
- `modules/ja/web/readings.js` - `kanjiBreakdown` at :87.
- `modules/ja/examples/ja-readings/ja-readings.js` - example DojoExt plugin (not a module; `registerSetting` :272, `registerMarkup` :287).

## Two tiers of module
- Course tier: ids listed in the course's `course.json` `modules` array. A module ships only when listed (or required by a listed module).
- Pack tier: `web/i18n/packs.json` maps a UI language to `modules`, e.g. `"ru": {"modules": ["ru"]}`. When the course `uiLanguage` matches the key, those modules ship too, even if the course does not list them (`pack_modules` at `crates/dojo-cli/src/modules.rs:146`). A key with `"modules": []` (currently `fr`) adds no module. The shipped packs request logic modules: `ru` to `ru`, `ja` to `ja`.
- Both tiers feed the same `resolve` queue; `dependency_order` puts required modules first.

## Invariants and gotchas
- A module folder without a loadable `module.json` is skipped by `all_manifests` (`crates/dojo-cli/src/modules.rs:96`); a course that lists it gets `module_missing` (`crates/dojo-cli/src/course_files.rs:173`).
- A module `web` script or style whose real path (symlinks followed) lies outside the module folder is rejected by `load` (`escapes_dir`, `crates/dojo-cli/src/modules.rs:184`, used at :165). A missing file is not an escape; the later read reports it.
- A course that uses a `ja` key or markup without listing `ja` in `modules` gets `module_key_unlisted` (`crates/dojo-cli/src/course_files.rs:131`).
- `ru` is validator-only: `modules/ru/module.json:5` has `"hooks": ["validator"]`, no web code.
- `ruby.checkQuestions` runs the `ja` checks only when `markup` is `ruby` and `skip` or `skipTag` is set (`modules/ja/rust/src/ruby.rs:51`).
- Module codes are merged into the validator code list by `all_codes` (`crates/dojo-core/src/validate/codes.rs:121`); core built-in codes stay in `CODES`.
- Core rules read module data only through the trait: `prompt_triggers` and `disambiguation_words` feed `ambiguous_answer` (`crates/dojo-core/src/validate/quality.rs:102`, :143). Language-specific words do not belong in core.
- `ja` web files are loaded only through the manifest `web` list, so course builds need `ja` in `modules`; `module_key_unlisted` fires if a course uses `ruby` markup without it (see `docs/modules/crates.md`).
- JS under `modules/**` is covered by ESLint (`eslint.config.mjs`), knip (`knip.json`) and the `audit:js` madge/jscpd run (`package.json`).

## Depends on / used by
- Depends on: `dojo-core` (`ValidatorModule`, `Course`, `Item`, `ItemType`), `dojo-core` `validate::ItemChecker`.
- Used by: `crates/dojo-cli` (`crates/dojo-cli/src/main.rs:36`, `crates/dojo-cli/src/course_files.rs:181`) via `dojo_modules::validator`; `crates/dojo-cli/tests/build_modules.rs` and `validate_modules.rs`; web build (`crates/dojo-cli/src/modules.rs`) for `web` paths.
- Tests: `modules/ja/tests/*.test.js` and `modules/ru/tests/*.test.js` (run by `scripts/check-all.sh:60`), `modules/ja/rust/tests/*.rs`, `modules/ru/rust/tests/ru_words.rs`, `modules/registry/tests/registry.rs`.
