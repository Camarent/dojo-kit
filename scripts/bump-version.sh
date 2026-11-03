#!/usr/bin/env bash
# Release hook for the pipeline (pipeline.json "release_script"). Run from the repo root.
#   bump-version.sh current [REF]            print X.Y.Z (package.json at REF, default: working tree)
#   bump-version.sh set OLD NEW "ENTRY"      move our own version from OLD to NEW, print the changed files
#
# Only this project's own version is ever touched. Each edit is anchored to a place that can only be ours:
# the top-level "version" of package.json, the root entry of package-lock.json, Cargo.toml [workspace.package],
# and Cargo.lock entries named like a workspace member. A dependency that shares the number is never matched.
# A guard then counts the changed lines per file; any other count restores every file and exits 1.
set -euo pipefail

# Every file below MUST hold the new version after `set`; a missing file or an unmatched pattern is an error, never a skip.
REQUIRED=(package.json package-lock.json Cargo.toml Cargo.lock CHANGELOG.md)

current() {
  local ref="${1:-}" text
  if [ -n "$ref" ]; then text=$(git show "$ref:package.json"); else text=$(cat package.json); fi
  printf '%s\n' "$text" | perl -ne 'if (/^  "version"\s*:\s*"(\d+\.\d+\.\d+)"/) { print "$1\n"; exit }'
}

# Package names of the workspace members listed in Cargo.toml (these are the crates that carry our version).
members() {
  local dir
  perl -0ne 'if (/^\[workspace\]\n(?:(?!\[)[^\n]*\n)*?members\s*=\s*\[(.*?)\]/ms) { my $m = $1; print "$1\n" while $m =~ /"([^"]+)"/g; exit }' Cargo.toml |
    while read -r dir; do
      # shellcheck disable=SC2086 # a members entry may be a glob
      for d in $dir; do perl -0ne 'print "$1\n" if /^\[package\]\n(?:(?!\[)[^\n]*\n)*?name\s*=\s*"([^"]+)"/m' "$d/Cargo.toml"; done
    done
}

# Run perl code $2 over file $1 when it exists (a missing REQUIRED file is reported by verify).
edit() { [ -f "$1" ] && perl -0pi -e "$2" "$1" || true; }

# Exit 1 naming every REQUIRED file that does not hold $NEW (and, in Cargo.lock, no member left at $OLD).
verify() {
  local bad=() f
  for f in "${REQUIRED[@]}"; do
    [ -f "$f" ] || { bad+=("$f (missing)"); continue; }
    case "$f" in
      package.json) [ "$(current)" = "$NEW" ] || bad+=("$f") ;;
      package-lock.json)
        perl -0ne 'exit(/^  "version"\s*:\s*"\Q$ENV{NEW}\E"/m && /"packages"\s*:\s*\{\s*""\s*:\s*\{[^}]*?"version"\s*:\s*"\Q$ENV{NEW}\E"/s ? 0 : 1)' "$f" || bad+=("$f") ;;
      Cargo.toml)
        perl -0ne 'exit(/^\[workspace\.package\]\n(?:(?!\[)[^\n]*\n)*?version\s*=\s*"\Q$ENV{NEW}\E"/m ? 0 : 1)' "$f" || bad+=("$f") ;;
      Cargo.lock)
        perl -0ne 'my $n = () = /\[\[package\]\]\nname = "(?:$ENV{NAMES})"\nversion = "\Q$ENV{NEW}\E"/g;
                   exit($n == $ENV{N} && !/\[\[package\]\]\nname = "(?:$ENV{NAMES})"\nversion = "\Q$ENV{OLD}\E"/ ? 0 : 1)' "$f" || bad+=("$f") ;;
      CHANGELOG.md) grep -q "^## \[$NEW\]" "$f" || bad+=("$f") ;;
    esac
  done
  [ ${#bad[@]} -eq 0 ] || { echo "bump-version: not at $NEW: ${bad[*]}" >&2; return 1; }
}

# Lines each file may change: 0 (already done) or exactly this many. Anything else means a pattern hit something that is not ours.
expected() {
  case "$1" in
    package.json | Cargo.toml) echo 1 ;;
    package-lock.json) echo 2 ;;
    Cargo.lock) echo "$N" ;;
  esac
}

set_version() {
  local f added want
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  export OLD="$1" NEW="$2" ENTRY="$3" DATE
  DATE=$(date -u +%F)
  NAMES=$(members | paste -sd'|')
  N=$(members | grep -c .) || true
  export NAMES N
  for f in "${REQUIRED[@]}"; do [ -f "$f" ] && cp "$f" "$TMP/$f"; done

  edit package.json 's/^(  "version"\s*:\s*")\Q$ENV{OLD}\E"/$1$ENV{NEW}"/m'
  edit package-lock.json 's/^(  "version"\s*:\s*")\Q$ENV{OLD}\E"/$1$ENV{NEW}"/m; s/("packages"\s*:\s*\{\s*""\s*:\s*\{[^}]*?"version"\s*:\s*")\Q$ENV{OLD}\E"/$1$ENV{NEW}"/s'
  edit Cargo.toml 's/(^\[workspace\.package\]\n(?:(?!\[)[^\n]*\n)*?version\s*=\s*")\Q$ENV{OLD}\E"/$1$ENV{NEW}"/m'
  edit Cargo.lock 's/(\[\[package\]\]\nname = "(?:$ENV{NAMES})"\nversion = ")\Q$ENV{OLD}\E"/$1$ENV{NEW}"/g'
  if [ -f CHANGELOG.md ] && ! grep -q "^## \[$NEW\]" CHANGELOG.md; then
    edit CHANGELOG.md 'my $h = "## [$ENV{NEW}] - $ENV{DATE}\n\n- $ENV{ENTRY}\n\n"; s/^(?=## \[(?!Unreleased))/$h/m or $_ .= "\n$h"'
  fi

  for f in "${REQUIRED[@]}"; do
    [ -f "$f" ] || continue
    want=$(expected "$f")
    [ -n "$want" ] || continue
    added=$(diff "$TMP/$f" "$f" | grep -c '^>' || true)
    if [ "$added" -ne 0 ] && [ "$added" -ne "$want" ]; then
      for f in "${REQUIRED[@]}"; do [ -f "$TMP/$f" ] && cp "$TMP/$f" "$f"; done
      echo "bump-version: $f changed $added line(s), expected $want: nothing written" >&2
      return 1
    fi
  done
  if ! verify; then
    for f in "${REQUIRED[@]}"; do [ -f "$TMP/$f" ] && cp "$TMP/$f" "$f"; done
    return 1
  fi
  for f in "${REQUIRED[@]}"; do [ -f "$f" ] && [ -f "$TMP/$f" ] && ! cmp -s "$TMP/$f" "$f" && echo "$f"; done
  return 0
}

case "${1:-}" in
  current) current "${2:-}" ;;
  set) [ $# -eq 4 ] || { echo "usage: $0 set OLD NEW ENTRY" >&2; exit 2; }; set_version "$2" "$3" "$4" ;;
  *) echo "usage: $0 current [REF] | set OLD NEW ENTRY" >&2; exit 2 ;;
esac
