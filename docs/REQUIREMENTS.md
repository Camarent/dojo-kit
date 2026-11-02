# Requirements

Required to build and run the trainer (the `./dojo` wrapper checks for `cargo`; `scripts/build-wasm.sh` also uses `rustc`, `sed` and `perl`):
- Rust toolchain via rustup (https://rustup.rs), edition 2024 so a recent stable (`Cargo.toml`), with the WASM target (Rust 1.85+ for edition 2024; developed on 1.99). No `wasm-pack` or `npm` is used.
- Node.js: not needed to author or build a course; used only for the web tests, the dev server (`node web/dev/serve.js`) and vectors (`tests/gen-vectors.js`). Node.js 24 or newer (engines in `package.json`; CI runs 22 and 24).

For textbooks (`docs/FROM-TEXTBOOKS.md`; all optional, only needed for that route; the commands and package names below were not run or verified in this repo's environment, where none of them are installed):
- `poppler-utils` (`pdftotext`, `pdfinfo`, `pdftoppm`) for PDFs.
- `tesseract-ocr` plus language packs for scans.
- Optional for EPUB: `pandoc` or calibre (`ebook-convert`).

What the AI model may install itself, after telling the user what and why, and only if the user does not object (never with `sudo` unless the user explicitly says yes to that command; if root is needed, give the user the command instead):
- Rust, user-level: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y` (the rustup installer; installs into `~/.cargo`, no root), then `. "$HOME/.cargo/env"`.
- WASM target: `rustup target add wasm32-unknown-unknown`.
- Nothing else is installed without asking.

What the user must provide or approve:
- The materials (in `workspace/<id>/materials/`), the exam details and the language choices.
- System packages (need root): Debian/Ubuntu `sudo apt-get install poppler-utils tesseract-ocr` (add `tesseract-ocr-<lang>` for the language, optionally `pandoc` or `calibre`). The model gives the command and waits.
- Node.js, if tests or the dev server are wanted.
- Publishing (optional): an assistant or host that can publish the built trainer.
