# AUDIT: tools and commands (dojo-kit)
Thresholds: /root/.claude/practices/{rust,rust-wasm,js}.md (no project overrides). Versions as installed 2026-10-22. No package.json in repo: JS tools live in /tmp/audit-tools (outside repo, nothing added to project).

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
| gitleaks | 8.30.1 | official GitHub release gitleaks/gitleaks (sha256 checked vs checksums.txt), MIT; in /opt/cargo/bin |
Not installed: cargo-udeps (needs nightly; only stable present; cargo-machete covers), twiggy/wasm-opt (not requested; wasm-pack not checked), trufflehog (gitleaks suffices).

## Commands (verified, run from repo root; B=/tmp/audit-tools/node_modules/.bin)
| Goal | Command |
|---|---|
| Clippy size/complexity | `cargo clippy --workspace --all-targets -- -W clippy::too_many_lines -W clippy::cognitive_complexity -W clippy::too_many_arguments -W clippy::type_complexity -W clippy::excessive_nesting -W clippy::fn_params_excessive_bools -W clippy::struct_excessive_bools` (add `-D warnings` for gate; thresholds in clippy.toml, not yet present) |
| Panics | `cargo clippy --workspace -- -W clippy::unwrap_used -W clippy::expect_used -W clippy::indexing_slicing -W clippy::panic` |
| WASM clippy | `cargo clippy -p dojo-wasm --target wasm32-unknown-unknown -- -D warnings` (target not checked) |
| CVEs | `cargo audit` (clean at setup) |
| Licenses/bans/sources | `cargo deny check` (deny.toml in repo; at setup fails only on foldhash = Zlib, flagged) |
| Unused deps | `cargo machete --with-metadata` (exit 1 = found) |
| Binary size | `cargo bloat --release -n 20 -p dojo-cli` ; `--crates` (no WASM support) |
| Secrets | `gitleaks detect --no-banner -s . --redact` (clean at setup); fallback `git grep -nEi "(api[_-]?key\|secret\|token\|password)\s*[:=]"` |
| ESLint | copy of flat config from js.md into /tmp/audit-tools/proj/eslint.config.js; `cd /tmp/audit-tools/proj && $B/eslint -c eslint.config.js web tools` (proj has symlinks web, tools) |
| Dead code JS | `cd /tmp/audit-tools/proj && $B/knip --no-config-hints` (needs the package.json there; ran, exit 0) |
| Duplicates JS | `$B/jscpd web --min-lines 10 --min-tokens 70 --threshold 5 --ignore "**/vendor/**,**/tests/**,**/n5/**"` |
| Import cycles | `$B/madge --circular --extensions js web` |

## Exclusions
target/, cargo-target/, dist/, node_modules/, the private-courses directory, tests/vectors, web/vendor (third party), web/bundle.json and other generated files, pkg/ (wasm-pack output).

## Licenses
Allowed: MIT, Apache-2.0, BSD-2/3-Clause, ISC, Unicode-3.0 (deny.toml). Anything else (Zlib, MPL, GPL, ...) = flag for owner decision.

## Install missing
Rust tools: `cargo install cargo-audit cargo-deny cargo-machete cargo-bloat --locked`; `rustup component add clippy`. JS: `mkdir -p /tmp/audit-tools && cd /tmp/audit-tools && npm init -y && npm i knip jscpd madge eslint`. gitleaks: download release tarball from github.com/gitleaks/gitleaks/releases, verify against checksums.txt, put binary in PATH.
