# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- feat(topics): opt-in poolAspects, one item per topic x pooled aspect
- fix(session): apply topic x aspect pool rule to practice queue
- fix(session): onlyTags filters practice and daily queues after selection
- fix(session): Next checks a typed answer; empty input keeps don't-know
- fix(web): check button gets a gap to the answer input
- fix(validate): hint_leaks_answer covers order items

## [0.3.10] - 2026-11-11

- chore(n5-gokaku-gaps): n5-gokaku-gaps/phases/03-finish

## [0.3.9] - 2026-11-10

- chore(n5-feedback-3): n5-feedback-3/phases/03-finish

## [0.3.8] - 2026-11-09

- fix(n5): remove furigana answer leaks in reading questions

## [0.3.7] - 2026-11-09

- fix(web): favicon, footer tap target, Далее without answer counts as don't know

## [0.3.6] - 2026-11-09

- fix(web): 44px tap target for home group toggles

## [0.3.5] - 2026-11-09

- feat(review): one question per topic in review, canonical ids.lock guard

## [0.3.4] - 2026-11-08

- chore(n5-feedback-2): n5-feedback-2/phases/03-finish

## [0.3.3] - 2026-11-07

- test(dojo-kit): remove temp dirs created by tests and add leak guard

## [0.3.2] - 2026-11-07

- feat(i18n): optional ru/fr/ja language packs, English-only core bundle

## [0.3.1] - 2026-11-07

- chore(release-v0-3-0): release-v0-3-0/phases/06-finish

## [0.3.0] - 2026-11-07

Validator fixes, web and ja test hardening, CLI symlink fix, session review counts. Items below.

- fix(cli): reject web paths that resolve through a symlink out of the module
- fix(validate): same-prompt skips retired items; dup_word keeps kana reading hints apart; same_prompt_different_answers compares items of one type only
- fix(dup_word): cover choice items, unclosed brace, pairing by prompt key, rename check
- fix(ja): applyAliases copies row; splitRuby astral kanji, lower complexity
- fix(session): home review count uses the session queue
- fix(web-tests): load ja harness from its own dir; loader discovers module scripts
- feat(i18n): add fr pack entry and document module tiers
- feat(hooks): allow commit type ci, warn when AUDIT.md is missing
- refactor(validate): precompute closing brace index in dupes prompt parser
- refactor(tests): move double-ruby test out of the kit; justify or drop dead_code allows in shared test helpers
- test(cli): cover module manifest, i18n and bundle load errors; core trait defaults
- test(web): core fixtures part 3 drop ja ruby scripts from loadBundle lists; intro-card test uses core ext harness
- test(session): cover gap retry variations not counted
- test(ext): compare feedback rows by structure, applyAliases returns copies
- test(ja): keep double-ruby test data Latin-only for core-latin guard
- docs(modules): sync crates, modules, web and schema docs with stage code

## [0.2.0] - 2026-11-06

Optional language packs and logic modules (ja, ru); dojo-kit core is English only. Items below.

- feat(validate): validator modules (`ValidatorModule`, `modules/registry`); `dojo schema --brief` lists module codes; new codes `module_missing`, `module_key_unlisted`
- docs(modules): course.json `modules`, `web/i18n/packs.json` language packs, missing-module error; AUTHORING, CONTRACT section 13, AGENTS section 9a

## [0.1.12] - 2026-11-06

- chore(optional-modules): optional-modules/phases/04-finish

## [0.1.11] - 2026-11-06

- fix(n5): retire duplicate feedback vocab items, add duplicate-word validator

## [0.1.10] - 2026-11-05

- feat(n5): reading drills follow N5-kanji rule; sentence grammar gaps; retry docs

## [0.1.9] - 2026-11-05

- feat(validate): ruby skip-set check for question furigana

## [0.1.8] - 2026-11-05

- feat(validate): generic course-checks extension point

## [0.1.7] - 2026-11-04

- docs: copying of source material is left to the user's decision; AGENTS.md, docs and prompts no longer forbid copying, they warn once about sharing

## [0.1.6] - 2026-11-03

- docs(readme): light and dark screenshot grid

## [0.1.5] - 2026-11-03

### Added

- Codecov: CI collects JS and Rust coverage (lcov) in the `check` job and uploads each with its own Codecov flag; coverage badge in the README.
- `scripts/check-all.sh`: `DOJO_COVERAGE_DIR` makes the cargo and node test steps write lcov files.

## [0.1.4] - 2026-11-03

### Added

- GitHub Pages workflow that deploys the showcase demo, with a test for it.
- README demo link, screenshots and badges; Pages entry in `docs/REQUIREMENTS.md`.

## [0.1.3] - 2026-11-02

### Added

- Issue templates: feature request and config.
- Runtime test for the unknown-screen fallback to the home screen.

### Changed

- CI: timeouts, concurrency and npm cache added to the workflows.
- Docs checked against the code; stale statements corrected.

## [0.1.2] - 2026-11-02

### Fixed

- `app.js`: an unknown screen name now falls back to the home screen (`SCREENS.home`). The 0.1.1 split left a reference to an undefined `homeScreen`, which failed `npm run lint`.
- CI: pinned `actions/checkout` and `actions/setup-node` to their v7 releases; dependency refresh with grouped Dependabot updates.
- Hooks: internal paths are read from the untracked `.git/info/guard-paths`; the retired `dev` merge subject exemption is removed.

## [0.1.1] - 2026-11-02

### Added

- Configurable hook identity via `git config dojo.owner`.
- Package metadata in `package.json`.
- Issue and PR templates, and dependabot configuration.

### Changed

- README Node requirement fixed.
- `app.js` split into `app-screens.js`.
- Internal process files untracked (see `AUDIT.md`); ignore rules moved out of `.gitignore`.

## [0.1.0] - 2026-11-02

### Added

- First public release of dojo-kit: generic exam-trainer builder.
- Rust workspace (`crates/dojo-core`) and web runtime (`web/`).
- Course validation (`dojo validate`) and course test runner.
- Progress save format with artifact progress migration.
