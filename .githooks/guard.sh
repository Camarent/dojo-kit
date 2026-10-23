#!/bin/sh
# Shared checks for pre-commit and commit-msg. Enable: git config core.hooksPath .githooks

# Accepted identity: the owner's GitHub noreply address only
is_owner_email() {
  case "$1" in
    Camarent@users.noreply.github.com) return 0 ;;
    [0-9]*+Camarent@users.noreply.github.com) return 0 ;;
  esac
  return 1
}

# Emails allowed inside commit messages (owner + the agent co-author trailer)
is_msg_email_ok() {
  is_owner_email "$1" && return 0
  [ "$1" = "noreply@anthropic.com" ]
}

# Message must not name jobs (stdin); returns 1 if it does
msg_names_job() {
  grep -qiE 'vibe job|squash of job|(^|[^A-Za-z0-9])job/[A-Za-z0-9._]+(-[A-Za-z0-9._]+)*-task-[0-9]+|^Merge (branch .?)?job/|(^|[^A-Za-z0-9])job/[A-Za-z0-9._-]+-t[0-9]+(-r[0-9]+)?([^A-Za-z0-9]|$)'
}

# First line of a commit message (stdin) must be '<type>(<area>): <what>';
# only the dev->master '--no-ff' merge subject is exempt
subject_ok() {
  first=$(grep -v '^#' | head -n 1)
  echo "$first" | grep -qE '^(feat|fix|refactor|test|docs|chore|perf|build|style)\([^()[:space:]]+\): [^[:space:]]' && return 0
  echo "$first" | grep -qE "^Merge branch 'dev'( into master)?$" && return 0
  return 1
}

# Secret scanner must exist; DOJO_ALLOW_NO_GITLEAKS=1 overrides explicitly
require_gitleaks() {
  command -v gitleaks >/dev/null 2>&1 && return 0
  [ "${DOJO_ALLOW_NO_GITLEAKS:-}" = "1" ] && { echo "guard: gitleaks missing, secret scan skipped (DOJO_ALLOW_NO_GITLEAKS=1)" >&2; return 0; }
  echo "refused: gitleaks not found. Install gitleaks v8.30.1 (https://github.com/gitleaks/gitleaks/releases, verify sha256) onto PATH, or set DOJO_ALLOW_NO_GITLEAKS=1 to skip the secret scan" >&2
  return 1
}

# Check author and committer email; prints error and returns 1 if bad
check_ident() {
  for kind in AUTHOR COMMITTER; do
    ident=$(git var "GIT_${kind}_IDENT" 2>/dev/null) || { echo "refused: no ${kind} identity configured" >&2; return 1; }
    email=${ident#*<}; email=${email%%>*}
    is_owner_email "$email" || { echo "refused: $kind email '$email' is not the Camarent noreply address" >&2; return 1; }
    [ "${ident##* }" = "+0000" ] || { echo "refused: $kind date offset '${ident##* }' is not +0000 (use TZ=UTC)" >&2; return 1; }
  done
  return 0
}

# Check a range of commits (local_sha..remote_sha or local_sha if remote is zeros)
# for bad author/committer email and forbidden content. Prints error and returns 1 if bad.
check_commit_range() {
  local_sha="$1"
  remote_sha="$2"
  range=""

  if [ "$remote_sha" = "0000000000000000000000000000000000000000" ] || ! git cat-file -e "${remote_sha}^{commit}" 2>/dev/null; then
    # new ref, or remote sha unknown locally: scan everything not on a known remote ref
    range=$(git rev-list "$local_sha" --not --remotes) || { echo "refused: cannot list commits for $local_sha" >&2; return 1; }
  else
    range=$(git rev-list "${remote_sha}..${local_sha}") || { echo "refused: cannot list commits ${remote_sha}..${local_sha}" >&2; return 1; }
  fi

  for commit in $range; do
    # Check author and committer for this commit
    commit_short=$(echo "$commit" | cut -c1-7)
    for kind in author committer; do
      case "$kind" in
        author) fmt="%ae" ;;
        committer) fmt="%ce" ;;
      esac
      email=$(git show -s --format="$fmt" "$commit" 2>/dev/null)
      is_owner_email "$email" || { echo "refused: commit ${commit_short}: ${kind} email '$email' is not the Camarent noreply address" >&2; return 1; }
    done

    for kind in ad cd; do
      off=$(git show -s --format="%${kind%d}i" "$commit" 2>/dev/null)
      off=${off##* }
      [ "$off" = "+0000" ] || { echo "refused: commit ${commit_short}: date offset '$off' is not +0000" >&2; return 1; }
    done

    # Check commit message for personal email addresses and private references
    msg=$(git show -s --format=%B "$commit")
    if echo "$msg" | grep -qE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' ; then
      bad_mail=$(echo "$msg" | grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' | while read -r m; do is_msg_email_ok "$m" || echo "$m"; done | head -1)
      if [ -n "$bad_mail" ]; then
        echo "refused: commit ${commit_short}: message contains email '$bad_mail'" >&2
        return 1
      fi
    fi
    if echo "$msg" | msg_names_job; then
      echo "refused: commit ${commit_short}: message names a job" >&2
      return 1
    fi
    if echo "$msg" | grep -qE 'workspace/[A-Za-z0-9_/-]+' && ! echo "$msg" | grep -qE 'workspace/<'; then
      echo "refused: commit ${commit_short}: message references private workspace" >&2
      return 1
    fi

    # Check for forbidden paths in this commit
    bad_paths=$(git show --name-only --pretty=format: "$commit" | grep -E '^(workspace/[^.]|dist/|(.*/)?target/|(.*/)?cargo-target/|.*\.wasm$|\.work/|\.notes/|(TEAM|PROGRESS|PLAN[^/]*)\.md$|(.*/)?progress[^/]*\.json$)' || true)
    if [ -n "$bad_paths" ]; then
      echo "refused: commit ${commit_short}: stages private or generated paths:" >&2
      echo "$bad_paths" | head -10 | sed 's/^/  /' >&2
      return 1
    fi

    # Check for forbidden content in this commit
    check_content_in_commit "$commit" || return 1
  done

  return 0
}

# Check content in a single commit for forbidden workspace references
check_content_in_commit() {
  commit="$1"
  commit_short=$(echo "$commit" | cut -c1-7)
  tmpfile=$(mktemp)
  git show -U0 "$commit" > "$tmpfile"
  line_count=0
  found_bad=false
  current_file=""
  
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      +++\ *)
        current_file="${line#+++ b/}"
        # Skip /dev/null (deleted files)
        if [ "$current_file" = "/dev/null" ]; then
          current_file=""
        fi
        ;;
      +*)
        # Added line (not +++), check if it contains forbidden pattern
        line_content="${line#+}"
        # Skip placeholder patterns
        case "$line_content" in
          *workspace/\<*) ;;
          *)
            # Check for forbidden workspace references
            if echo "$line_content" | grep -qE 'workspace/[A-Za-z0-9_/-]+'; then
              # Check if file is exempt
              case "$current_file" in
                .githooks/*|tests/hooks-test.sh|AUDIT.md|TEAM.md) ;;
                *)
                  if [ "$found_bad" = false ]; then
                    echo "refused: commit ${commit_short}: content references private workspace:" >&2
                    found_bad=true
                  fi
                  if [ "$line_count" -lt 5 ]; then
                    echo "  $line_content" >&2
                    line_count=$((line_count + 1))
                  fi
                  ;;
              esac
            fi
            # Check for non-allowed email addresses
            if echo "$line_content" | grep -qE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'; then
              bad_email=$(echo "$line_content" | grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' | while read -r m; do is_msg_email_ok "$m" || echo "$m"; done | head -1)
              if [ -n "$bad_email" ]; then
                # Check if file is exempt
                case "$current_file" in
                  .githooks/*|tests/hooks-test.sh|AUDIT.md|TEAM.md) ;;
                  *)
                    if [ "$found_bad" = false ]; then
                      echo "refused: commit ${commit_short}: content contains email '$bad_email':" >&2
                      found_bad=true
                    fi
                    if [ "$line_count" -lt 5 ]; then
                      echo "  $line_content" >&2
                      line_count=$((line_count + 1))
                    fi
                    ;;
                esac
              fi
            fi
            # Check for absolute local paths
            case "$line_content" in
              */root/*|*/home/*|*/Users/*)
                # Check if file is exempt
                case "$current_file" in
                  .githooks/*|tests/hooks-test.sh|AUDIT.md|TEAM.md) ;;
                  *)
                    if [ "$found_bad" = false ]; then
                      echo "refused: commit ${commit_short}: content contains absolute path:" >&2
                      found_bad=true
                    fi
                    if [ "$line_count" -lt 5 ]; then
                      echo "  $line_content" >&2
                      line_count=$((line_count + 1))
                    fi
                    ;;
                esac
                ;;
            esac
            ;;
        esac
        ;;
    esac
  done < "$tmpfile"
  rm -f "$tmpfile"
  
  if [ "$found_bad" = true ]; then
    return 1
  fi
  return 0
}

# Main function for pre-commit and commit-msg
main_guard() {
  fail=0

  # Check author and committer emails
  check_ident || fail=1

  # Check staged paths
  bad=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '^(workspace/[^.]|dist/|(.*/)?target/|(.*/)?cargo-target/|.*\.wasm$|\.work/|\.notes/|(TEAM|PROGRESS|PLAN[^/]*)\.md$|(.*/)?progress[^/]*\.json$)' || true)
  if [ -n "$bad" ]; then
    echo "refused: private or generated paths are staged:" >&2
    echo "$bad" | head -10 >&2
    fail=1
  fi

  # Check staged content for forbidden workspace references
  check_content_in_diff || fail=1

  return $fail
}

# Check content in staged changes
check_content_in_diff() {
  tmpfile=$(mktemp)
  git diff --cached -U0 --diff-filter=ACMR > "$tmpfile"
  line_count=0
  found_bad=false
  current_file=""
  
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      +++\ *)
        current_file="${line#+++ b/}"
        # Skip /dev/null (deleted files)
        if [ "$current_file" = "/dev/null" ]; then
          current_file=""
        fi
        ;;
      +*)
        # Added line (not +++), check if it contains forbidden pattern
        line_content="${line#+}"
        # Skip placeholder patterns
        case "$line_content" in
          *workspace/\<*) ;;
          *)
            # Check for forbidden workspace references
            if echo "$line_content" | grep -qE 'workspace/[A-Za-z0-9_/-]+'; then
              # Check if file is exempt
              case "$current_file" in
                .githooks/*|tests/hooks-test.sh|AUDIT.md|TEAM.md) ;;
                *)
                  if [ "$found_bad" = false ]; then
                    echo "refused: staged content references private workspace:" >&2
                    found_bad=true
                  fi
                  if [ "$line_count" -lt 5 ]; then
                    echo "  $line_content" >&2
                    line_count=$((line_count + 1))
                  fi
                  ;;
              esac
            fi
            # Check for non-allowed email addresses
            if echo "$line_content" | grep -qE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'; then
              bad_email=$(echo "$line_content" | grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' | while read -r m; do is_msg_email_ok "$m" || echo "$m"; done | head -1)
              if [ -n "$bad_email" ]; then
                # Check if file is exempt
                case "$current_file" in
                  .githooks/*|tests/hooks-test.sh|AUDIT.md|TEAM.md) ;;
                  *)
                    if [ "$found_bad" = false ]; then
                      echo "refused: staged content contains email '$bad_email':" >&2
                      found_bad=true
                    fi
                    if [ "$line_count" -lt 5 ]; then
                      echo "  $line_content" >&2
                      line_count=$((line_count + 1))
                    fi
                    ;;
                esac
              fi
            fi
            # Check for absolute local paths
            case "$line_content" in
              */root/*|*/home/*|*/Users/*)
                # Check if file is exempt
                case "$current_file" in
                  .githooks/*|tests/hooks-test.sh|AUDIT.md|TEAM.md) ;;
                  *)
                    if [ "$found_bad" = false ]; then
                      echo "refused: staged content contains absolute path:" >&2
                      found_bad=true
                    fi
                    if [ "$line_count" -lt 5 ]; then
                      echo "  $line_content" >&2
                      line_count=$((line_count + 1))
                    fi
                    ;;
                esac
                ;;
            esac
            ;;
        esac
        ;;
    esac
  done < "$tmpfile"
  rm -f "$tmpfile"
  
  if [ "$found_bad" = true ]; then
    return 1
  fi
  return 0
}

# If sourced, don't run main
if [ "${0##*/}" = "guard.sh" ] || [ -z "${0##*/}" ]; then
  main_guard
  exit $?
fi
