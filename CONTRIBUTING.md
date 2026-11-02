# Contributing

Thanks for helping with dojo-kit. This file lists the checks a change must pass.

## Setup

- Rust toolchain (edition 2024, see `Cargo.toml`) with the `wasm32-unknown-unknown` target.
- Node.js 22 or newer (the web tests use `node:test`).
- Enable the tracked git hooks once per clone: `git config core.hooksPath .githooks`.

## Checks

- Tests: `npm test` (runs `scripts/check-all.sh`).
- Lint: `npm run lint` (ESLint, config in `eslint.config.mjs`).
- CI script: `scripts/ci.sh` runs the same checks as the CI workflow. Run it locally before you push.

A change is ready when `npm test`, `npm run lint` and `scripts/ci.sh` all pass.

## Rules

- Follow [CONTRACT.md](CONTRACT.md) for framework rules.
- Do not commit course content, private materials, build output or `*.wasm` files. See the README "Contributing" section for the hooks that enforce this.
- Keep docs in step with the code.

## Conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md). Do not open public issues for them.
