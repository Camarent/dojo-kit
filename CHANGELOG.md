# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
