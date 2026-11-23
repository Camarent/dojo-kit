#!/usr/bin/env bash
# Build the release binaries (wasm and the linux musl dojo CLI), then pack them into the release archive.
# Usage: scripts/package-release.sh <tag> <out-dir>
set -euo pipefail

if [ $# -ne 2 ]; then
    echo "usage: $0 <tag> <out-dir>" >&2
    exit 2
fi
TAG="$1"
OUT="$2"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${CARGO_TARGET_DIR:-$REPO_ROOT/target}"

"$REPO_ROOT/scripts/build-wasm.sh"
cd "$REPO_ROOT"
cargo build --release -p dojo-cli --target x86_64-unknown-linux-musl

exec "$REPO_ROOT/scripts/package-release-pack.sh" "$TAG" "$OUT" \
    "$TARGET_DIR/x86_64-unknown-linux-musl/release/dojo" \
    "$TARGET_DIR/wasm32-unknown-unknown/release/dojo_wasm.wasm"
