#!/usr/bin/env bash
# Pack a release archive from already-built binaries: no build here, only layout, tar and checksum.
# Usage: scripts/package-release-pack.sh <tag> <out-dir> <dojo-bin> <wasm-file>
# Archive <out-dir>/dojo-<tag>-linux-x86_64.tar.gz holds dojo, dojo.wasm, web/ and THIRD_PARTY_NOTICES.md.
# web/ = the files bundle.json lists (scripts, styles, licenses, i18n packs) + index.template.html + bundle.json,
# only the ones tracked by git. Checksum: <out-dir>/<archive>.sha256 with one line '<sha>  <archive name>'.
# Env: SOURCE_DATE_EPOCH  archive mtime (default: git log -1 --format=%ct of the repo).
set -euo pipefail

if [ $# -ne 4 ]; then
    echo "usage: $0 <tag> <out-dir> <dojo-bin> <wasm-file>" >&2
    exit 2
fi
TAG="$1"
OUT="$2"
DOJO_BIN="$3"
WASM_FILE="$4"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$REPO_ROOT/web"
NAME="dojo-${TAG}-linux-x86_64.tar.gz"
EPOCH="${SOURCE_DATE_EPOCH:-$(git -C "$REPO_ROOT" log -1 --format=%ct)}"

# Tracked files under web/, as a lookup set.
declare -A tracked=()
while IFS= read -r f; do
    tracked["$f"]=1
done < <(git -C "$REPO_ROOT" ls-files -- web)

# Candidate web files: bundle.json lists (marker entries like @modules / @course are not files) and the two fixed files.
mapfile -t candidates < <(jq -r '(.scripts[], .styles[], .licenses[]) | select(startswith("@") | not) | "web/" + .' "$WEB/bundle.json")
mapfile -t i18n < <(jq -r '.i18n[] | "web/i18n/" + . + ".json"' "$WEB/bundle.json")
candidates+=("${i18n[@]}" web/index.template.html web/bundle.json)

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

install -D -m 0755 "$DOJO_BIN" "$STAGE/dojo"
install -D -m 0644 "$WASM_FILE" "$STAGE/dojo.wasm"
install -D -m 0644 "$REPO_ROOT/THIRD_PARTY_NOTICES.md" "$STAGE/THIRD_PARTY_NOTICES.md"
for f in "${candidates[@]}"; do
    if [ -z "${tracked[$f]:-}" ]; then
        echo "error: listed web file is not tracked by git: $f" >&2
        exit 1
    fi
    install -D -m 0644 "$REPO_ROOT/$f" "$STAGE/$f"
done

mkdir -p "$OUT"
# Deterministic tar: sorted names, root owner, fixed mtime; gzip -n drops the name and time header.
tar --sort=name --owner=0 --group=0 --numeric-owner --mtime="@$EPOCH" \
    -C "$STAGE" -cf - dojo dojo.wasm web THIRD_PARTY_NOTICES.md \
    | gzip -n > "$OUT/$NAME"

(cd "$OUT" && sha256sum "$NAME" > "$NAME.sha256")
echo "packed $OUT/$NAME"
