#!/usr/bin/env bash
# Release WASM build with build-machine paths (cargo registry, repo, sysroot, /rustc/<hash>) removed from the binary.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CARGO_HOME_DIR="${CARGO_HOME:-$HOME/.cargo}"
RUSTC_HASH="$(rustc -vV | sed -n 's/^commit-hash: //p')"
SYSROOT="$(rustc --print sysroot)"

# Paths must not contain spaces
for var in REPO_ROOT CARGO_HOME_DIR SYSROOT; do
    if [[ "${!var}" == *" "* ]]; then
        echo "build-wasm: path contains a space: $var" >&2
        exit 1
    fi
done

flags="--remap-path-prefix=$REPO_ROOT=/dojo-kit --remap-path-prefix=$CARGO_HOME_DIR=/cargo --remap-path-prefix=$SYSROOT=/rustup"
if [ -n "$RUSTC_HASH" ]; then
    flags="$flags --remap-path-prefix=/rustc/$RUSTC_HASH=/rustc"
fi

cd "$REPO_ROOT"
RUSTFLAGS="${RUSTFLAGS:+$RUSTFLAGS }$flags" cargo build --release -p dojo-wasm --target wasm32-unknown-unknown "$@"

# The prebuilt std embeds /rustc/<hash>/ locations that remapping cannot reach: overwrite them in place, same length.
if [ -n "$RUSTC_HASH" ]; then
    WASM="${CARGO_TARGET_DIR:-$REPO_ROOT/target}/wasm32-unknown-unknown/release/dojo_wasm.wasm"
    HASH="$RUSTC_HASH" perl -0777 -pi -e 'BEGIN { $h = "/rustc/$ENV{HASH}"; $r = "x" x length($h); } s/\Q$h\E/$r/g' "$WASM"
fi
