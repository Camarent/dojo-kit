# Architecture

## What this is
dojo-kit is a public MIT framework for building exam or practice trainers from your own materials. An AI assistant writes the course files (`course.json`, `content/*.jsonl`); the `dojo` CLI validates and builds them; the result is a single-page app (`index.html` with WASM inlined, plus `data/content.json`) that is published as a Claude artifact. The repo holds no course content and no progress data. Framework rules: `CONTRACT.md`.

## Modules
- [crates/dojo-core](modules/crates.md) - pure Rust logic: content model, answer checks (incl. gap retry readings, `gapVerdict`), SRS and placement marking (per-unit `newPerDay` caps, unit `srs.ladder` and `dropOnWrong`, `buildQueue`, `ladderForUnit`, `dropForUnit`, `newOrder`), entity groups and progress bars (`groupCounts`, group caps in `buildQueue`; `groups/`), progress merge, exam sampling and scoring (timing, scoring parts), validation.
- [crates/dojo-cli](modules/crates.md) - the `dojo` binary: validate, lock, build, stats, next-id, init, add, schema, import-progress.
- [crates/dojo-wasm](modules/crates.md) - cdylib with a JSON-string ABI over dojo-core for the browser.
- [web](modules/web.md) - Preact app shell, catalog (browse, search, item detail), home screen (exam countdown, extra new items, group cards, progress bars), settings (theme, exam date, per-unit and per-group overrides, plugin settings), exam picker, storage adapters, session engine (per-unit new caps, practice, exams with timer groups, training, scored results, exam resume from a saved draft, placement self-assessment, gap retry, override, intro for new items), question-type UIs, speech playback (`DojoSpeech`), audio pack playback (`DojoAudio`), per-question timer, errorWeighted queue, `DojoExt` plugin hooks, i18n, styles, dev server.
- [schema](modules/schema.md) - generated JSON Schemas for `course.json` and item lines.
- [tools](modules/tools.md) - frozen reference JS for progress and SRS, used only to generate vectors.
- [tests](modules/tests.md) - golden vectors, vector generator, WASM smoke test, wrapper end-to-end script.
- [prompts](modules/prompts.md) - copy-paste prompts for AI assistants (build, add content, review, chat-only).
- [examples](modules/examples.md) - sample courses and the ja-readings plugin.
- [scripts](modules/scripts.md) - `scripts/build-wasm.sh`.
- [workspace](modules/workspace.md) - gitignored folder for local courses.

## Layering (CONTRACT section 3)
- Rules that decide what is correct or scheduled live in `dojo-core`. The browser reaches them only through `dojo-wasm`.
- JS owns rendering, navigation, storage adapters, i18n lookup and timers.
- The WASM boundary is stateless: JSON in, JSON out, `now` and `seed` passed in. Errors come back as `{ok:false,error:{code,message}}`.

## Data and control flow
1. Authoring: a course directory (default `workspace/<course>/`, see CONTRACT section 11) = `course.json` + `content/<unit>.jsonl` + optional `stimuli.jsonl` (shared passages, one `{id,title?,text,hideText?,speak?}` object per line, referenced by items' `stimulus` id) + `ids.lock`.
2. `dojo validate` runs `dojo-core::validate` (`crates/dojo-core/src/validate/`) on those files; diagnostics are text or `--json`.
3. `dojo build` (`crates/dojo-cli/src/cmd/build.rs`, `run_build`) validates again, refuses on errors, then reads `web/bundle.json`, `web/index.template.html`, `web/i18n/*.json` (each overlaid key by key by the course's `i18n/<lang>.json`, when present), styles and scripts, the release WASM, and writes `dist/<course>/{index.html, data/content.json, manifest.json}`. It rewrites `ids.lock`. Optional `course.json` `plugins.{scripts,styles}` files are inlined at the `@course` marker of `web/bundle.json` (scripts go after `types/*.js`, before `ui/app.js`).
4. Runtime in the browser: `web/boot.js` loads WASM via `web/dojo-wasm.js` and fetches `data/content.json`, then `ui/app.js` `start` creates the store (`web/storage.js`) and engine (`web/session.js`).
5. Every grading, scheduling, merge and sampling call goes to WASM `call(name, args)`, which dispatches in `crates/dojo-core/src/api/`.
6. Progress is loaded, merged and saved through `store.update`; storage is localStorage, the artifact database, or paste export.
7. Precedence, highest first: per-field override `doc.settings["unit:<unitId>:<field>"]` (Settings screen; `null` is a tombstone) > course-level config from WASM `unitConfig` (unit `srs` (`ladder`, `dropOnWrong`) and unit `newPerDay`/`newOrder` > `srsByType[type]` (ladder and drop) > course `srs` / `newOrder` > defaults `DEFAULT_LADDER`, drop `COURSE_DEFAULT_DROP` = 1, order `file`). `unitConfig` (`crates/dojo-core/src/srs/`) is the only course-level resolver. The global daily allowance is `doc.settings.newPerDay` (default 10, `engine.globalNewPerDay()`); unit caps apply on top of it. Learned threshold: `course.learnedStage`, else `DEFAULT_LEARNED_STAGE` = 4 (`web/session/util.js`; Rust has its own copy in `crates/dojo-core/src/groups/`, used for bars). Groups (`course.groups`, entity-based): a group's daily entity cap is override `group:<id>:newPerDay` > group `newPerDay` > uncapped; units of a capped group skip unit caps and the global allowance. Entities come from item `entity` (default the item id). `counts().groups` / `.bars` come from WASM `groupCounts`. Details in `modules/web.md` and `modules/crates.md`.
8. Placement (only when `course.placement` is set): the session samples per unit, the learner answers known/again, each answer is stored by WASM `applyPlacement`, and finishing sets `settings.placementDone`. It does not touch streak or daily stats.

## Entry points
- `./dojo` (repo root) - bash wrapper: builds `dojo-cli` (and the WASM for `build`) when sources are newer, then runs the binary. Honours `CARGO_TARGET_DIR`. Path arguments are resolved against the caller's cwd, not the repo root.
- `dojo` binary: `crates/dojo-cli/src/main.rs` `main`; commands dispatched in `run` at `crates/dojo-cli/src/main.rs`.
- Browser: `web/boot.js` (runs on load, `index.html` embeds it).
- Dev server: `node web/dev/serve.js <dist/courseId> [port]`.
- WASM exports: `alloc`, `dealloc`, `call` in `crates/dojo-wasm/src/lib.rs`.

## Build and test
Source of these commands: `CONTRACT.md`, `Cargo.toml`, `dojo` wrapper, `tests/wrapper.sh`. The repo has no Makefile, no package.json and no CI workflow.
- Build workspace: `cargo build --workspace` (CONTRACT section 9).
- Release CLI: `cargo build -q --release -p dojo-cli`.
- WASM: `scripts/build-wasm.sh -q` (cargo release build with `--remap-path-prefix` so no build-machine paths land in the wasm).
- Rust tests: `cargo test -p dojo-core`, `cargo test -p dojo-cli`.
- Vectors: `node tests/gen-vectors.js && git diff --exit-code` (must be a no-op).
- WASM smoke test: `node tests/wasm-smoke.js` (needs the WASM build).
- Exam resume: `node --test web/tests/exam-resume.test.js web/tests/app-resume.test.js`.
- Groups: `node --test web/tests/groups.test.js web/tests/groups-ui.test.js web/tests/groups-build.test.js`.
- Web unit test: `node --test web/tests/storage.test.js`; exam flow: `node --test web/tests/exams.test.js`; placement: `node --test web/tests/placement.test.js`; unit caps and unit ladders: `node --test web/tests/unit-settings.test.js`.
- Full web test run: the directory form `node --test web/tests` fails (checked on Node 24.22.1: `Cannot find module '…/web/tests'`; Node 22 not checked, TODO(verify)); web test files live under `web/tests/`, Node test files also live in `tests/` (`tests/fw-root.test.js`, `tests/reference-no-n5.test.js`, `tests/build-wasm-paths.test.js`).
- Full suite (from repo root, replaces the web-only run): `scripts/build-wasm.sh && cargo test --workspace && node --test web/tests/*.test.js tests/*.test.js && node tests/wasm-smoke.js && node tests/gen-vectors.js && git diff --exit-code -- tests/vectors && bash tests/hooks-test.sh`.
- End-to-end wrapper check: `tests/wrapper.sh` (`bash tests/wrapper.sh`).
- Build a course: `./dojo validate <course-dir>` then `./dojo build <course-dir>`.
- Section 12 (audio, timers, weighted sessions): `node --test web/tests/audio.test.js web/tests/question-timer.test.js web/tests/weighted-session.test.js`; Rust `crates/dojo-core/tests/audio_validate.rs`, `timer_extras_vectors.rs`, `weighted_vectors.rs`; CLI `crates/dojo-cli/tests/build_audio.rs`.

## Constraints that cut across modules
- Frozen before users have data: progress doc shape `v:1`, localStorage key, artifact db path, id strings, `exams[].id` once published, timestamps in ms, day keys `YYYY-MM-DD`. Schema changes are additive only (CONTRACT section 5).
- Item ids are opaque and append-only; `ids.lock` records them and their types; retired items stay in shipped data.
- Output limits: 8 MiB warning, 16 MiB hard limit on the artifact build; WASM budget 512 KiB. Audio packs: `dojo build` fails above 16 MiB per file, 60 MiB per dist, 250 files (`crates/dojo-cli/src/cmd/build_audio.rs`).
- Audio and timers (CONTRACT section 12): packs are served as raw bytes; the framework ships no audio; `data/content.json` carries materialised timer defaults; the web reads them and falls back to 8000 only when `baseMs` is missing or not finite (`web/session/qtimer.js`). Module map in `modules/web.md` and `modules/crates.md`.
- Artifact sandbox: no network at runtime; Preact and htm are vendored and inlined.
- Privacy: app code makes no network calls except fetching its own `data/content.json` (`web/boot.js`), and progress stays in localStorage and, when the artifact platform grants its `db` and `user` capabilities, also in that platform's per-user storage (`web/storage/adapters.js`, `web/storage/store.js`); it is sent nowhere else. Spoken text goes to `window.speechSynthesis` (`web/speech.js`); browser speech voices may be provided by the browser vendor's cloud, in which case that spoken text leaves the device.
- Course fields read by the browser without a plugin: `markup` (built-in `ruby` = `{base|reading}`), `normalize.fold`, `tagLabels`, `groups`, `bars`, `introNew`, `captions`, `ruby` (skip set), `contentLanguage` (page `lang`, speech voice language), `speech.voices[role].prefer`, `inputScript` (CONTRACT section 4). Plugin hooks: `registerMarkup`, `registerBeforeSubmit`, `registerDetail`, `registerIntro`, `registerVoiceRank`, `registerSetting`.
- Course plugins are build-time only (CONTRACT section 4): never fetched or loaded at runtime; they may block submit with a message but never change graded input, scheduling or progress.
- Plugin settings (`DojoExt.registerSetting`) are per-browser choices stored in `doc.settings["plugin:<key>"]`; hooks read them with `getSetting`. They never change grading, scheduling or progress. Example: `examples/plugins/ja-readings/`.
