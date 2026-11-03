# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.5] - 2026-11-03

### Added

- Codecov: CI collects JS and Rust coverage (lcov) and uploads it; coverage badge in the README.

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
