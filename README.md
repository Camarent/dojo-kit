# dojo-kit

[![CI](https://github.com/Camarent/dojo-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Camarent/dojo-kit/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/Camarent/dojo-kit/graph/badge.svg)](https://codecov.io/gh/Camarent/dojo-kit)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Camarent/dojo-kit)](https://github.com/Camarent/dojo-kit/releases)

A generic exam and test trainer builder: you bring the materials, an AI coding assistant writes the course files, and dojo-kit validates them and builds a single-page trainer app.
Rust core compiled to WASM, a native `dojo` CLI and a Preact web UI; content is plain `course.json` plus one JSONL file per unit.
Spaced repetition, placement test, timed mock exams, per-unit settings, build-time plugins; progress lives in localStorage, a file you paste/export, or the host's artifact store.

Using an AI assistant? Copy a prompt from [docs/PROMPTS.md](docs/PROMPTS.md); the assistant follows [AGENTS.md](AGENTS.md).

## What a trainer looks like

Screens of the `examples/showcase` course (`./dojo build examples/showcase`).

| Home | Practice picker | Question | Feedback | Mock exam |
|---|---|---|---|---|
| ![Home](docs/img/home.png) | ![Practice picker](docs/img/practice-picker.png) | ![Multiple-select question](docs/img/question-multi.png) | ![Feedback](docs/img/feedback-correct.png) | ![Mock exam](docs/img/exam.png) |

Demo: https://camarent.github.io/dojo-kit/ - the [examples/showcase](examples/showcase) course is the demo behind these screens.

## Quick start

Needs a Rust toolchain (https://rustup.rs) with the `wasm32-unknown-unknown` target; the `./dojo` wrapper builds the CLI and WASM on demand.

```
./dojo build examples/showcase --out dist/x       # build the demo trainer into dist/x/showcase/
./dojo init my-course --title "My course"         # scaffold workspace/<course>/
./dojo validate workspace/<course> [--json]      # check course.json and content/*.jsonl
```

`./dojo schema --brief` prints the item-type cheat-sheet (main fields; `schema/course.schema.json` is the complete reference); `./dojo stats <course-dir>` and `./dojo next-id <course-dir> <prefix>` are also available. Exit codes: 0 ok, 1 validation or build refusal, 2 usage or I/O error.

## Requirements

Rust toolchain and Node.js 24 or newer; full list in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## Use it with an AI assistant

Open the repo in your assistant (Claude Code or any other), put your materials into `workspace/<course>/materials/`, and paste a prompt from [docs/PROMPTS.md](docs/PROMPTS.md) (sources in `prompts/`). The assistant follows [AGENTS.md](AGENTS.md): ingest materials, write content, `dojo validate`, `dojo build`, publish. CLAUDE.md is a short pointer for tools that read it.

### Test prompt: textbooks in `workspace/<id>/materials/`

```
Open the repository at <path to dojo-kit>. Read AGENTS.md and docs/FROM-TEXTBOOKS.md completely, then build a practice trainer from my textbooks. Course id: <id>. The textbooks (PDF, scans or EPUB) are in workspace/<id>/materials/.

Course: <topic, level, date>. UI language: <en|ru>. Content language: <language>. Exam format (if known, or "take it from the chapter tests"): <sections, questions, minutes, pass rule>.

Steps: check the requirements (README "Requirements"); tell me what is missing and ask before installing anything; never use sudo without asking. Extract text per chapter, write MAP.md and show me the plan, then for each chapter write items only with ./dojo add, run ./dojo validate and ./dojo lock after it and mark the chapter done in MAP.md. Own wording only, short quotes at most. Use the speak field for listening. Put what cannot be expressed into GAPS.md. At the end ./dojo build and report items per unit and type and everything skipped. Do not publish without asking me.

To continue an unfinished course instead: "Resume workspace/<id> following docs/FROM-TEXTBOOKS.md section 8."
```

## Repository map

- `crates/dojo-core` - pure Rust logic: content model, answer checks, SRS, progress merge, exam sampling, validation.
- `crates/dojo-wasm` - WASM wrapper (JSON-string ABI) over the core.
- `crates/dojo-cli` - the `dojo` binary.
- `web/` - Preact UI, storage adapters, i18n, styles, dev server.
- `schema/` - generated JSON Schemas for `course.json` and items.
- `examples/` - `demo`, `showcase` courses and an example plugin.
- `docs/` - architecture, module docs, authoring guide, prompts.
- `prompts/` - copy-paste prompts for AI assistants.
- `tests/` - golden vectors, vector generator, WASM smoke test, wrapper script.
- `tools/` - frozen reference JS used to generate the vectors.
- `scripts/` - WASM build script.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for tests, lint and the CI script. Run the test suite with `npm test` and lint with `npm run lint`.

Enable the tracked git hooks once per clone: `git config core.hooksPath .githooks`. They refuse a commit whose author or committer email is not the owner's GitHub noreply address (`users.noreply.github.com`, plain or `<id>+` form), or that stages files under the private course folders under `workspace/`, `dist/`, `target/`, `cargo-target/`, or any `*.wasm` file. Hooks accept only the owner's GitHub noreply address; `git config dojo.owner <your-github-login>` pins them to your login. Extra path bans for your own working files go in the untracked `.git/info/guard-paths` (one regular expression per line).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - project map, data flow, build and test commands.
- [docs/AUTHORING.md](docs/AUTHORING.md) - writing courses and content.
- [docs/FROM-TEXTBOOKS.md](docs/FROM-TEXTBOOKS.md) - PDF/scan/EPUB textbooks to a course.
- [docs/PROMPTS.md](docs/PROMPTS.md) - prompts for AI assistants.
- [CONTRACT.md](CONTRACT.md) - the framework's rules.

## How it was built

The code was written with the help of AI agents: Claude (Anthropic) and Mistral (Vibe and Codestral) agents under human direction and review.

## License

MIT, see [LICENSE](LICENSE).
