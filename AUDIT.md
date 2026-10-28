# AUDIT: tools and commands (dojo-kit)
Thresholds: the shared practices files {rust,rust-wasm,js}.md outside the repo (no project overrides). Versions as installed 2026-10-22. No package.json in repo: JS tools live in a scratch directory outside the repo, nothing added to project).

## Stacks
| Stack | Where |
|---|---|
| Rust | Cargo workspace: crates/dojo-core, dojo-cli, dojo-wasm |
| Rust->WASM | crates/dojo-wasm (build: scripts/build-wasm.sh) |
| JS (ES modules, Preact-style) | web/ (ui, session.js, storage.js, ...), tools/, tests/ |

## Tools (all from official registries; source facts)
| Tool | Version | Source / maintainer / licence / popularity |
|---|---|---|
| clippy | rustup stable | official rustup component, rust-lang |
| cargo-audit | 0.22.2 | crates.io, rustsec/rustsec, 13.7M downloads, Apache-2.0/MIT, updated 2026-06 |
| cargo-deny | 0.20.2 | crates.io, EmbarkStudios/cargo-deny, 6.7M dl, Apache-2.0/MIT, updated 2026-07 |
| cargo-machete | 0.9.2 | crates.io, bnjbvr/cargo-machete, 3.1M dl, MIT/Apache-2.0, updated 2026-04 |
| cargo-bloat | 0.12.1 | crates.io, RazrFalcon/cargo-bloat, 430K dl, MIT, last release 2024-05 (stale but stable) |
| eslint | 10.13.0 | npm, eslint org (OpenJS), MIT |
| knip | 6.42.1 | npm, webpro-nl/knip, ISC |
| jscpd | 5.4.2 | npm, kucherenko/jscpd, MIT |
| madge | 8.0.0 | npm, pahen/madge, MIT |
| gitleaks | 8.30.1 | official GitHub release gitleaks/gitleaks (sha256 checked vs checksums.txt), MIT; not preinstalled: install onto PATH outside the repo; hooks refuse to run without it unless `DOJO_ALLOW_NO_GITLEAKS=1` is set |
Not installed: cargo-udeps (needs nightly; only stable present; cargo-machete covers), twiggy/wasm-opt (not requested; wasm-pack not checked), trufflehog (gitleaks suffices).

## Commands (verified, run from repo root; B=<tools dir outside repo>/node_modules/.bin)
| Goal | Command |
|---|---|
| Clippy size/complexity | `cargo clippy --workspace --all-targets -- -W clippy::too_many_lines -W clippy::cognitive_complexity -W clippy::too_many_arguments -W clippy::type_complexity -W clippy::excessive_nesting -W clippy::fn_params_excessive_bools -W clippy::struct_excessive_bools` (add `-D warnings` for gate; thresholds in clippy.toml, not yet present) |
| Panics | `cargo clippy --workspace -- -W clippy::unwrap_used -W clippy::expect_used -W clippy::indexing_slicing -W clippy::panic` (gate: same with each `-W` replaced by `-D`, plus `-D warnings` once other lints are clean; 0 panic warnings expected; needs `rustup component add clippy`) |
| WASM clippy | `cargo clippy -p dojo-wasm --target wasm32-unknown-unknown -- -D warnings` (target not checked) |
| CVEs | `cargo audit` (clean at setup) |
| Licenses/bans/sources | `cargo deny check` (deny.toml in repo; at setup fails only on foldhash = Zlib, flagged) |
| Unused deps | `cargo machete --with-metadata` (exit 1 = found) |
| Binary size | `cargo bloat --release -n 20 -p dojo-cli` ; `--crates` (no WASM support) |
| Secrets | `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*' gitleaks git --redact --no-banner .; GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*' gitleaks dir --redact --no-banner .` (clean at setup); check scanned bytes > 0: a refused repo prints no leaks after 0 bytes; fallback `git grep -nEi "(api[_-]?key\|secret\|token\|password)\s*[:=]"` |
| ESLint | copy of flat config from js.md into <tools dir>/proj/eslint.config.js; `cd <tools dir>/proj && $B/eslint -c eslint.config.js web tools` (proj has symlinks web, tools) |
| Dead code JS | `cd <tools dir>/proj && $B/knip --no-config-hints` (needs the package.json there; ran, exit 0) |
| Duplicates JS | `$B/jscpd web --min-lines 10 --min-tokens 70 --threshold 5 --ignore "**/vendor/**,**/tests/**,**/n5/**"` |
| Import cycles | `$B/madge --circular --extensions js web` |

## Exclusions
target/, cargo-target/, dist/, node_modules/, the private-courses directory, tests/vectors, web/vendor (third party), web/bundle.json and other generated files, pkg/ (wasm-pack output).

## Licenses
Allowed: MIT, Apache-2.0, BSD-2/3-Clause, ISC, Unicode-3.0 (deny.toml). Anything else (Zlib, MPL, GPL, ...) = flag for owner decision.
Zlib allowed only for foldhash (serde_json preserve_order dependency, required by CONTRACT); any other Zlib crate is flagged.

## Install missing
Rust tools: `cargo install cargo-audit cargo-deny cargo-machete cargo-bloat --locked`; `rustup component add clippy`. JS: `mkdir -p <tools dir outside repo> && cd <tools dir outside repo> && npm init -y && npm i knip jscpd madge eslint`. gitleaks: download release tarball from github.com/gitleaks/gitleaks/releases, verify against checksums.txt, put binary in PATH.

## Coverage
Measured 2026-10-22 on dev @ 98b22b5. Tool: cargo-llvm-cov 0.9.1 (crates.io, `cargo install cargo-llvm-cov --locked`) + `rustup component add llvm-tools-preview`; JS: built-in `node --test --experimental-test-coverage` (node v24.22.1).

| Area | Command |
|---|---|
| Rust | `CARGO_LLVM_COV_TARGET_DIR=<dir outside repo> cargo llvm-cov --workspace --summary-only` (profiles and build outside the repo) |
| JS | `scripts/build-wasm.sh` first (loader.js needs dojo_wasm.wasm in target/), then `node --test --experimental-test-coverage web/tests/*.test.js tests/*.test.js` |

Baseline Rust (lines): total 92.96% (regions 92.62%, functions 85.28%); dojo-core ~93.5% lines (lowest: api.rs 81.5%, content.rs 89.1%, validate.rs 91.1%); dojo-cli ~88.5% lines (main.rs 84.4%, import_progress.rs 90.5%, add.rs 93.1%, build.rs 96.1%); dojo-wasm: 0 tests, not in the report (no instrumented code run).
Baseline JS (1086 tests, 1085 pass, 1 todo): all files 93.10% lines / 89.56% branch / 93.46% funcs; session.js 98.79 / 91.40 / 98.63; ext.js 96.54 / 88.18 / 92.00; storage.js 98.17; speech.js 78.57; dojo-wasm.js 84.21; tools/reference/srs.js 43.33.

Current @7256c6d: JS 93.17 / 87.05 / 90.01 (lines / branch / funcs); Rust 95.48 / 94.63 / 87.54 (lines / regions / funcs). Baseline above is the target.

Exclusions / not measured:
- tests/ and web/tests files appear in the JS report but are not product code; web/vendor, tests/vectors, web/bundle.json, generated files and pkg/ are excluded by intent.
- web/ui/app.js and web/types/{choice,gap,card}.js are NOT in the JS report: app-harness.js runs them via `vm.runInContext` and node coverage does not track vm scripts, so their real coverage is unknown (the 93% overstates nothing, but omits them).
- The WASM boundary (dojo-wasm crate, wasm32 build) has no Rust coverage; it is exercised only by JS tests through loader.js, uncounted.
- Branch coverage for Rust is not produced (stable toolchain, 0 branches reported).

## Machine-readable tool list

Read by `/root/.claude/tools/audit_run.py` (`name | cwd | command | parser`; cwd relative to the repo or absolute).

```audit-tools
clippy | . | cargo clippy --workspace --all-targets --message-format=json -- -W clippy::too_many_lines -W clippy::cognitive_complexity -W clippy::too_many_arguments -W clippy::type_complexity -W clippy::excessive_nesting -W clippy::fn_params_excessive_bools -W clippy::struct_excessive_bools -W clippy::unwrap_used -W clippy::expect_used -W clippy::indexing_slicing -W clippy::panic | clippy
cargo-audit | . | cargo audit --json | cargo-audit
cargo-deny | . | cargo deny --format json check | cargo-deny
cargo-machete | . | cargo machete --with-metadata | cargo-machete
eslint | /opt/jstools/proj | /opt/jstools/node_modules/.bin/eslint -c eslint.config.js -f json web tools | eslint
knip | /opt/jstools/proj | /opt/jstools/node_modules/.bin/knip --no-config-hints --reporter json | knip
jscpd | . | d=$(mktemp -d) && /opt/jstools/node_modules/.bin/jscpd web --min-lines 10 --min-tokens 70 --ignore "**/vendor/**,**/tests/**,**/n5/**" --silent --reporters json --output $d >/dev/null; cat $d/jscpd-report.json | jscpd
madge | . | /opt/jstools/node_modules/.bin/madge --circular --extensions js --json web | madge
gitleaks | . | GITLEAKS_CONFIG_TOML=$'[extend]\nuseDefault = true\n[[allowlists]]\npaths = ["^target/", "^workspace/"]' GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0='*' gitleaks dir --redact --no-banner --report-format json --report-path /dev/stdout . | gitleaks
```

Secrets history (G1): `gitleaks git --redact --no-banner --log-opts=--all .`
