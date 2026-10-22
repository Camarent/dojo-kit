---
paths: [crates/dojo-cli/]
summary: The `dojo` binary - validate, lock, build (artifact output), stats, next-id, init, add, schema, import-progress.
---
# crates/dojo-cli

## Purpose
Command-line tool that turns a course directory (`course.json` + `content/*.jsonl` + optional `stimuli.jsonl` + `ids.lock`) into validated data and a published-ready `dist/<course>/` folder. It reads and writes files; all rules come from `dojo-core`.

## Public surface
Commands (usage string at `crates/dojo-cli/src/main.rs:16`, dispatch in `run` at `crates/dojo-cli/src/main.rs:795`, entry `crates/dojo-cli/src/main.rs:816`):
- `dojo schema --brief` and `dojo schema --out <dir>` (writes `course.schema.json`, `item.schema.json`; `crates/dojo-cli/src/main.rs:24`).
- `dojo validate <course-dir> [--json] [--strict]` (`crates/dojo-cli/src/main.rs:128`, `run_validate`). Exit 0 ok, 1 on errors (or warnings with `--strict`).
- `dojo lock <course-dir>` (`crates/dojo-cli/src/main.rs:152`). Rewrites `ids.lock`.
- `dojo build <course-dir> [--out <dir>] [--wasm <file>] [--web <dir>] [--strict]` (`crates/dojo-cli/src/main.rs:244`). Default out `dist`.
- `dojo init <course-id> [--title T] [--ui LANG] [--content-lang LANG] [--workspace DIR]` (`crates/dojo-cli/src/main.rs:679`).
- `dojo stats <course-dir> [--json]` (`crates/dojo-cli/src/main.rs:522`).
- `dojo next-id <course-dir> <prefix> [--count N]` (`crates/dojo-cli/src/main.rs:591`).
- `dojo add <course-dir> <unit-id> [--file F] [--dry-run]` (`crates/dojo-cli/src/add.rs:109`). Reads JSON objects from stdin or file; all-or-nothing. Exits 1 before reading the course when `<unit-id>` does not match the slug rule `^[a-z0-9][a-z0-9_-]{0,47}$` (`validate::is_valid_course_id`).
- `dojo import-progress <old.json> --map <id-map.json> --course <dir> [--out <file>] [--write] [--now <ISO>]` (`crates/dojo-cli/src/import_progress.rs`). Converts legacy progress to v:1 format; dry-run by default (prints report, writes nothing).
- Exit codes (`crates/dojo-cli/src/main.rs:795`): 0 success, 1 validation or build refusal, 2 usage or I/O error.
- `--json` validate output: `{"ok","errors","warnings","diagnostics":[{severity,code,file,line,message}]}` (`print_json`, `crates/dojo-cli/src/main.rs:94`).
- `validate`, `lock` and `build` all run `validate_course` (`crates/dojo-cli/src/main.rs:105`): `dojo-core` validate plus filesystem checks of `course.json` `plugins.{scripts,styles}`. Failures use code `bad_plugin_path` (file `course.json`, line 0).
- Build outputs under `<out>/<course-id>/`: `index.html`, `data/content.json`, `manifest.json`; `ids.lock` is rewritten in the course dir (`crates/dojo-cli/src/main.rs:244`).
- `crates/dojo-cli/src/build.rs:8` `base64`, `:25` `fnv1a64`, `:47` `escape_script_text`, `:64` `escape_style_text`, `:84` `script_tag`, `:95` `license_comment`, `:104` `select_language`, `:119` `fill_template`.
- `crates/dojo-cli/src/add.rs:109` `run` (the `add` command).

## Key files
- `src/main.rs` - command dispatch (`run`, `crates/dojo-cli/src/main.rs:795`), course loading (`crates/dojo-cli/src/main.rs:41`), validate/build/stats/init/next-id, plugin file reading (`plugin_files`, `crates/dojo-cli/src/main.rs:234`).
- `crates/dojo-cli/src/build.rs` - pure helpers for the build step (encoding, escaping, template filling, language pick).
- `crates/dojo-cli/src/add.rs` - the `add` command (id assignment, unit check, append to JSONL).
- `tests/*.rs` - integration tests that spawn the `dojo` binary (`CARGO_BIN_EXE_dojo`) on fixtures and `examples/`.

## Invariants and gotchas
- `build` refuses (exit 1) on any validation error; with `--strict` also on warnings. It runs `validate` first.
- Build needs the WASM file (default `target/wasm32-unknown-unknown/release/dojo_wasm.wasm` next to `web/`; `run_build` at `crates/dojo-cli/src/main.rs:244`) and `web/bundle.json`; `web/` is found by walking up from the current directory unless `--web` is given (`find_web_dir`, `crates/dojo-cli/src/main.rs:202`).
- Plugins: each `plugins.scripts` entry is inlined as a `<script>` at the `@course` marker of `bundle.json` `scripts`; the build fails if the marker is missing while plugin scripts exist. Plugin styles are appended after all `bundle.json` styles (the `@course` entry in `styles` is skipped).
- Plugin CSS goes through `escape_style_text`; plugin JS through `script_tag` / `escape_script_text` (`</script` and, before a `<script`, `<!--` are escaped).
- `content.json` has `v`, `course`, `items`, `version` (16-hex FNV-1a of course + items JSON), and `lock`. When `stimuli.jsonl` has at least one stimulus, `content.json` also has `stimuli` and the hash input gets the stimuli JSON appended; without stimuli the output and version are unchanged. `course.speech` (when set in `course.json`) is in `content.json` `course` (`crates/dojo-cli/tests/build.rs:380`).
- `intros.jsonl` (course root, optional, symlinks refused) is loaded by `load`, checked through `validate_all`, and `build` writes its lines to `content.json` `intros` (only when non-empty; they are hashed into `version` only then, so courses without intros keep their version).
- `stimuli.jsonl` (course root, optional) is read by `load` (`crates/dojo-cli/src/main.rs:41`) and checked by `validate_course` (`crates/dojo-cli/src/main.rs:105`) through `validate_with_stimuli`; `build` writes its parsed entries to `content.json`.
- Size: warn above 8 MiB, fail above 16 MiB total (`WARN_BYTES` and `MAX_BYTES`, `crates/dojo-cli/src/main.rs:174-175`).
- UI language: the build embeds only `en` and the chosen `uiLanguage`. The chosen language is looked up among `web/bundle.json` `i18n` and the course's `i18n/<lang>.json` (`crates/dojo-cli/src/build.rs:110`, `crates/dojo-cli/src/build.rs:150`); with no match the build warns and uses `en` (`crates/dojo-cli/src/main.rs:371`). Per language the web file is loaded first and the course file overlays it key by key (`crates/dojo-cli/src/main.rs:466`). A language listed in `bundle.json` without its web file fails the build.
- `validate`, `lock` and `build` check course UI files (`crates/dojo-cli/src/build.rs:228`): missing and unknown keys are warnings; non-string values and changed placeholders are errors.
- `add` assigns ids `<prefix>-<n>` above the highest existing number and never reuses ids present in content or `ids.lock`.

## Depends on / used by
- Depends on: `crates/dojo-core` (content, validate, lock, stats, schema, slug), `serde_json`.
- Used by: the repo-root `dojo` wrapper script (builds this crate and `crates/dojo-wasm`, then runs the binary); `prompts/` tell AI agents to call `./dojo`.
