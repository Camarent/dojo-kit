# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
