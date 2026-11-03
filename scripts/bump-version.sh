#!/usr/bin/env bash
# Release hook for the pipeline (pipeline.json "release_script"). Run from the repo root.
#   bump-version.sh current [REF]            print X.Y.Z (package.json at REF, default: working tree)
#   bump-version.sh set OLD NEW "ENTRY"      move every version file from OLD to NEW, print the changed files
set -euo pipefail

semver='[0-9]+\.[0-9]+\.[0-9]+'

# Every file below MUST hold the new version after `set`; a missing file or an unmatched pattern is an error, never a skip.
REQUIRED=(package.json package-lock.json Cargo.toml Cargo.lock CHANGELOG.md)

current() {
  local ref="${1:-}" text
  if [ -n "$ref" ]; then text=$(git show "$ref:package.json"); else text=$(cat package.json); fi
  printf '%s\n' "$text" | grep -Eo "\"version\"[[:space:]]*:[[:space:]]*\"$semver\"" | head -1 | grep -Eo "$semver"
}

# Rewrite FILE with a perl substitution; print FILE when it changed.
sub() {
  local file="$1" expr="$2" before
  [ -f "$file" ] || return 0  # a missing REQUIRED file is reported by verify
  before=$(cksum <"$file")
  perl -0pi -e "$expr" "$file"
  [ "$before" = "$(cksum <"$file")" ] || echo "$file"
}

# Exit 1 naming every REQUIRED file that does not hold $1 (OLD in $2 must be gone from the path crates).
verify() {
  local new="$1" old="$2" n=${1//./\\.} o=${2//./\\.} bad=() f
  for f in "${REQUIRED[@]}"; do
    [ -f "$f" ] || { bad+=("$f (missing)"); continue; }
    case "$f" in
      package.json) [ "$(current)" = "$new" ] || bad+=("$f") ;;
      package-lock.json) perl -0ne "exit(/^  \"version\"\\s*:\\s*\"$n\"/m ? 0 : 1)" "$f" || bad+=("$f") ;;
      Cargo.toml) perl -0ne "exit(/^\\[workspace\\.package\\].*?^version\\s*=\\s*\"$n\"/ms ? 0 : 1)" "$f" || bad+=("$f") ;;
      Cargo.lock) perl -0ne "exit(/\\nversion = \"$n\"\\n(?!source)/ && !/\\[\\[package\\]\\]\\nname = \"[^\"]+\"\\nversion = \"$o\"\\n(?!source)/ ? 0 : 1)" "$f" || bad+=("$f") ;;
      CHANGELOG.md) grep -q "^## \\[$new\\]" "$f" || bad+=("$f") ;;
    esac
  done
  [ ${#bad[@]} -eq 0 ] || { echo "bump-version: not at $new: ${bad[*]}" >&2; exit 1; }
}

set_version() {
  local old="$1" new="$2" entry="$3" o
  o=${old//./\\.}

  sub package.json "s/(\"version\"\\s*:\\s*\")$o\"/\${1}$new\"/"
  # lockfile: the top-level version (2-space indent) and the root entry packages[""], never a dependency that shares the number
  sub package-lock.json "s/(^  \"version\"\\s*:\\s*\")$o\"/\${1}$new\"/m; s/(\"packages\"\\s*:\\s*\\{\\s*\"\"\\s*:\\s*\\{[^}]*?\"version\"\\s*:\\s*\")$o\"/\${1}$new\"/s"
  sub Cargo.toml "s/(^\\[workspace\\.package\\].*?^version\\s*=\\s*\")$o\"/\${1}$new\"/ms"
  # path crates (workspace members) have no `source` line in Cargo.lock; registry crates with the same number do
  sub Cargo.lock "s/(\\[\\[package\\]\\]\\nname = \"[^\"]+\"\\nversion = \")$o\"(\\n(?!source))/\${1}$new\"\${2}/g"
  if [ -f CHANGELOG.md ] && ! grep -q "^## \\[$new\\]" CHANGELOG.md; then
    ENTRY="$entry" NEW="$new" DATE="$(date -u +%F)" perl -0pi -e '
      my $h = "## [$ENV{NEW}] - $ENV{DATE}\n\n- $ENV{ENTRY}\n\n";
      s/^(?=## \[(?!Unreleased))/$h/m or $_ .= "\n$h"' CHANGELOG.md
    echo CHANGELOG.md
  fi
  verify "$new" "$old"
}

case "${1:-}" in
  current) current "${2:-}" ;;
  set) [ $# -eq 4 ] || { echo "usage: $0 set OLD NEW ENTRY" >&2; exit 2; }; set_version "$2" "$3" "$4" ;;
  *) echo "usage: $0 current [REF] | set OLD NEW ENTRY" >&2; exit 2 ;;
esac
