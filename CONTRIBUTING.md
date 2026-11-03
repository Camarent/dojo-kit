# Contributing

Thanks for helping with dojo-kit. This file lists the checks a change must pass.

## Setup

- Rust toolchain (edition 2024, see `Cargo.toml`) with the `wasm32-unknown-unknown` target.
- Node.js 24 or newer (the web tests use `node:test`).
- Enable the tracked git hooks once per clone: `git config core.hooksPath .githooks`.

## Checks

- Tests: `npm test` (runs `scripts/check-all.sh`).
- Lint: `npm run lint` (ESLint, config in `eslint.config.mjs`).
- CI script: `scripts/ci.sh` runs the same checks as the CI workflow. Run it locally before you push.

A change is ready when `npm test`, `npm run lint` and `scripts/ci.sh` all pass.

## Rules

- Follow [CONTRACT.md](CONTRACT.md) for framework rules.
- Do not commit course content, private materials, build output or `*.wasm` files. See the "Git hooks" section below for the hooks that enforce this.
- Keep docs in step with the code.

## Git hooks

Optional for outside contributors: the owner's clone enforces these rules; you may skip the hooks.

- Enable once per clone: `git config core.hooksPath .githooks`.
- The hooks refuse a commit whose author or committer email is not a GitHub noreply address (`users.noreply.github.com`, plain or `<id>+` form).
- `git config dojo.owner <your-github-login>` pins the hooks to one login: only that login's noreply address may commit. When it is unset, any `*@users.noreply.github.com` address passes.
- The hooks refuse a commit that stages files under the private course folders `workspace/`, `dist/`, `target/`, `cargo-target/`, or any `*.wasm` file.
- Extra path bans for your own working files go in the untracked `.git/info/guard-paths` (one regular expression per line).
- The pre-commit and pre-push hooks need `gitleaks` on PATH. Without it they refuse, unless you set `DOJO_ALLOW_NO_GITLEAKS=1` to skip the secret scan.
- Commit subject format: `<type>(<area>): <what>` (types: feat fix refactor test docs chore perf build style).

## AI-assisted changes

- Any AI tool is allowed to help write a change.
- A `Co-Authored-By` trailer is optional.
- You review and own the change: you must understand it and answer for it in review.

## Conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md). Do not open public issues for them.
