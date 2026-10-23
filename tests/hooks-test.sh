#!/bin/sh
# POSIX sh test for git hooks

# Compute framework .githooks path from script location
guard_dir=$(cd "$(dirname "$0")/.." && pwd)/.githooks

# Sandboxes may lack gitleaks; Tests 24-25 cover the strict path
export DOJO_ALLOW_NO_GITLEAKS=1
export TZ=UTC

# Create scratch repo
scratch=$(mktemp -d)
trap "rm -rf $scratch" EXIT

cd "$scratch"

# Initialize git repo
git init --quiet
git config core.hooksPath "$guard_dir"
git config user.email "Camarent@users.noreply.github.com"
git config user.name "Test User"

# Create a test file and commit it
echo "test" > test.txt
git add test.txt
git commit --quiet --message "chore(test): initial" --author="Test <Camarent@users.noreply.github.com>" --no-verify

fail_count=0

# Test 1: staging workspace/n5/x is refused
# (This will be tested by pre-commit)
echo "Test 1: staging workspace/n5/x is refused"
mkdir -p workspace/n5
echo "x" > workspace/n5/x
git add workspace/n5/x
if git commit --quiet --message "chore(test): add n5" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
  echo "FAIL: staging workspace/n5/x was accepted"
  fail_count=$((fail_count + 1))
else
  echo "PASS"
fi
git reset --hard HEAD >/dev/null 2>&1

# Test 2: adding a line mentioning workspace/n5/tools to docs/a.md is refused
echo "Test 2: adding line mentioning workspace/n5/tools to docs/a.md is refused"
mkdir -p docs
echo "ref" > docs/a.md
git add docs/a.md
git commit --quiet --message "chore(test): add docs" --author="Test <Camarent@users.noreply.github.com>" --no-verify

echo "See workspace/n5/tools for details" >> docs/a.md
git add docs/a.md
if git commit --quiet --message "chore(test): add n5 ref" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
  echo "FAIL: adding line mentioning workspace/n5/tools was accepted"
  fail_count=$((fail_count + 1))
else
  echo "PASS"
fi
git reset --hard HEAD >/dev/null 2>&1

# Test 3: adding the line workspace/<course-id> is accepted
echo "Test 3: adding line workspace/<course-id> is accepted"
echo "Use workspace/<course-id> for courses" >> docs/a.md
git add docs/a.md
if git commit --quiet --message "chore(test): add placeholder" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
  echo "PASS"
else
  echo "FAIL: adding line workspace/<course-id> was refused"
  fail_count=$((fail_count + 1))
fi

# Test 4: workspace/.gitkeep is accepted
echo "Test 4: workspace/.gitkeep is accepted"
mkdir -p workspace
echo "" > workspace/.gitkeep
git add workspace/.gitkeep
if git commit --quiet --message "chore(test): add gitkeep" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
  echo "PASS"
else
  echo "FAIL: workspace/.gitkeep was refused"
  fail_count=$((fail_count + 1))
fi
git reset --hard HEAD~1 >/dev/null 2>&1

# Test 5: commit with personal email is refused by pre-commit
echo "Test 5: commit with personal email is refused"
echo "test2" >> test.txt
git add test.txt
if git commit --quiet --message "chore(test): personal" --author="Someone <someone@gmail.com>" 2>/dev/null; then
  echo "FAIL: commit with personal email was accepted"
  fail_count=$((fail_count + 1))
else
  echo "PASS"
fi

# Test 6: pre-push refuses a range containing a bad commit
echo "Test 6: pre-push refuses range with bad commit"
# Create a bare remote
remote=$(mktemp -d)
rm -rf "$remote"
git init --bare "$remote"
git remote add origin "$remote"

# Make a good commit
echo "good" >> test.txt
git add test.txt
git commit --quiet --message "chore(test): good commit" --author="Test <Camarent@users.noreply.github.com>" --no-verify

# Make a bad commit (with personal email)
echo "bad" >> test.txt
git add test.txt
git commit --quiet --message "chore(test): bad commit" --author="Bad <bad@example.com>" --no-verify

# Try to push - should be refused by pre-push
if git push origin HEAD 2>/dev/null; then
  echo "FAIL: pre-push accepted bad commit"
  fail_count=$((fail_count + 1))
else
  echo "PASS"
fi

# Helper: fresh repo with hooks, one clean noreply root commit, in a new dir
new_repo() {
  d=$(mktemp -d)
  cd "$d"
  git init --quiet
  git config core.hooksPath "$guard_dir"
  git config user.email "Camarent@users.noreply.github.com"
  git config user.name "Test User"
  echo "root" > root.txt
  git add root.txt
  git commit --quiet --message "chore(test): root" --no-verify
}

A="Test <Camarent@users.noreply.github.com>"
expect_refused() { # name, reason regex, then command
  name="$1"; reason="$2"; shift 2
  echo "$name"
  out=$("$@" 2>&1)
  if [ $? -ne 0 ] && echo "$out" | grep -qE "$reason"; then echo "PASS"; else echo "FAIL: not refused for '$reason'"; fail_count=$((fail_count + 1)); fi
}
expect_ok() {
  name="$1"; shift
  echo "$name"
  if "$@" >/dev/null 2>&1; then echo "PASS"; else echo "FAIL: refused"; fail_count=$((fail_count + 1)); fi
}

new_repo; echo a > a.txt; git add a.txt
expect_refused "Test 21: commit message naming a job is refused (vibe job)" "names a job" git commit --quiet -m "chore(test): vibe job foo" --author="$A"
expect_refused "Test 22: commit message naming job/ branch is refused" "names a job" git commit --quiet -m "Merge job/foo-task-12 into dev" --author="$A"
expect_refused "Test 22b: job/<stage>-task-N is refused" "names a job" git commit --quiet -m "from job/audit-fixes-1-task-70" --author="$A"
expect_refused "Test 22d: Merge job/<name>-tN without -task is refused" "names a job" git commit --quiet -m "Merge job/n5-dojo-sync-t3 into dev" --author="$A"
expect_refused "Test 22e: Merge job/<name> plain is refused" "names a job" git commit --quiet -m "Merge job/audit-setup into dev" --author="$A"
expect_refused "Test 23: non-UTC author date is refused" "date offset" env GIT_AUTHOR_DATE="2026-01-01T10:00:00 +0300" git commit --quiet -m "chore(test): dated" --author="$A"
expect_refused "Test 23b: non-UTC committer date is refused" "date offset" env GIT_COMMITTER_DATE="2026-01-01T10:00:00 +0300" git commit --quiet -m "chore(test): dated" --author="$A"
expect_ok "Test 22c: legit messages with subtask-1, job/queue, task-3 pass" git commit --quiet -m "chore(test): subtask-1 style ids; job/queue docs; see task-3" --author="$A"
echo '{}' > progress-export.json; git add -f progress-export.json
expect_refused "Test 22f: forced progress*.json is refused by pre-commit" "private or generated" git commit --quiet -m "chore(test): export" --author="$A"
git rm --quiet --cached -f progress-export.json; rm -f progress-export.json
echo a2 > a2.txt; git add a2.txt
expect_ok "Test 23c: UTC dates and plain message pass" git commit --quiet -m "chore(test): plain" --author="$A"
# pre-push range check with a non-UTC / job commit made with --no-verify
echo b > b.txt; git add b.txt
GIT_AUTHOR_DATE="2026-01-01T10:00:00 +0300" git commit --quiet --no-verify -m "chore(test): late" --author="$A"
expect_refused "Test 23d: pre-push refuses non-UTC date in range" "date offset" sh -c "printf 'refs/heads/m %s refs/heads/m 0000000000000000000000000000000000000000\n' \"\$(git rev-parse HEAD)\" | '$guard_dir/pre-push'"
echo c > c.txt; git add c.txt
git commit --quiet --no-verify -m "chore(test): Squash of job x" --author="$A"
expect_refused "Test 23e: pre-push refuses job message in range" "names a job" sh -c "printf 'refs/heads/m %s refs/heads/m 0000000000000000000000000000000000000000\n' \"\$(git rev-parse HEAD)\" | '$guard_dir/pre-push'"

# gitleaks missing: fails without the override (empty PATH dir without gitleaks)
new_repo; echo d > d.txt; git add d.txt
nogl=$(mktemp -d)
for t in git sh grep sed cut head mktemp rm dirname tr cat env; do ln -s "$(command -v $t)" "$nogl/$t"; done
expect_refused "Test 24: pre-commit fails without gitleaks and without override" "gitleaks not found" env -u DOJO_ALLOW_NO_GITLEAKS PATH="$nogl" git commit --quiet -m "chore(test): nogl" --author="$A"
expect_refused "Test 25: pre-push fails without gitleaks and without override" "gitleaks not found" sh -c "printf 'refs/heads/m %s refs/heads/m 0000000000000000000000000000000000000000\\n' \"\$(git rev-parse HEAD)\" | env -u DOJO_ALLOW_NO_GITLEAKS PATH='$nogl' '$guard_dir/pre-push'"
expect_ok "Test 25b: delete-only push does not need gitleaks" sh -c "printf 'refs/heads/m 0000000000000000000000000000000000000000 refs/heads/m abc\\n' | env -u DOJO_ALLOW_NO_GITLEAKS PATH='$nogl' '$guard_dir/pre-push'"
expect_ok "Test 26: override lets commit pass" git commit --quiet -m "chore(test): withov" --author="$A"
cd "$scratch"

# Forbidden build artifact target/x is refused
echo "Test: staging target/x is refused"
mkdir -p "$(dirname target/x)"
echo "x" > target/x
git add -f target/x
if git commit --quiet --message "chore(test): add artifact" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
  echo "FAIL: staging target/x was accepted"
  fail_count=$((fail_count + 1))
else
  echo "PASS"
fi
git reset --hard HEAD >/dev/null 2>&1
git clean -fdq

# Forbidden build artifact cargo-target/x is refused
echo "Test: staging cargo-target/x is refused"
mkdir -p "$(dirname cargo-target/x)"
echo "x" > cargo-target/x
git add -f cargo-target/x
if git commit --quiet --message "chore(test): add artifact" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
  echo "FAIL: staging cargo-target/x was accepted"
  fail_count=$((fail_count + 1))
else
  echo "PASS"
fi
git reset --hard HEAD >/dev/null 2>&1
git clean -fdq

# Forbidden build artifact crates/x/a.wasm is refused
echo "Test: staging crates/x/a.wasm is refused"
mkdir -p "$(dirname crates/x/a.wasm)"
echo "x" > crates/x/a.wasm
git add -f crates/x/a.wasm
if git commit --quiet --message "chore(test): add artifact" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
  echo "FAIL: staging crates/x/a.wasm was accepted"
  fail_count=$((fail_count + 1))
else
  echo "PASS"
fi
git reset --hard HEAD >/dev/null 2>&1
git clean -fdq

# Forbidden build artifact crates/x/cargo-target/y is refused
echo "Test: staging crates/x/cargo-target/y is refused"
mkdir -p "$(dirname crates/x/cargo-target/y)"
echo "x" > crates/x/cargo-target/y
git add -f crates/x/cargo-target/y
if git commit --quiet --message "chore(test): add artifact" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
  echo "FAIL: staging crates/x/cargo-target/y was accepted"
  fail_count=$((fail_count + 1))
else
  echo "PASS"
fi
git reset --hard HEAD >/dev/null 2>&1
git clean -fdq

# Cleanup
rm -rf "$remote"
git remote remove origin >/dev/null 2>&1

# Test 7: pre-push refuses forbidden content (clean history, noreply only)
echo "Test 7: pre-push refuses range with forbidden content"
new_repo
remote7=$(mktemp -d)
git init --quiet --bare "$remote7"
git remote add origin "$remote7"
echo "see workspace/n5/x" > notes.md
git add notes.md
git commit --quiet --message "chore(test): content commit" --no-verify
if git push origin HEAD >/dev/null 2>&1; then
  echo "FAIL: pre-push accepted commit with forbidden content"
  fail_count=$((fail_count + 1))
else
  echo "PASS"
fi
cd "$scratch"
rm -rf "$remote7"

# Test 7b: new branch scans only commits unknown to remotes
echo "Test 7b: new branch push ignores already-pushed commits"
new_repo
remote7b=$(mktemp -d)
git init --quiet --bare "$remote7b"
git remote add origin "$remote7b"
echo "see workspace/n5/x" > old.md
git add old.md
git commit --quiet --message "chore(test): old bad" --no-verify
git push --no-verify --quiet origin HEAD:refs/heads/main >/dev/null 2>&1
git fetch --quiet origin
git checkout --quiet -b feature
echo "fine" > new.md
git add new.md
git commit --quiet --message "chore(test): new clean" --no-verify
if git push origin feature >/dev/null 2>&1; then
  echo "PASS"
else
  echo "FAIL: new branch push rescanned already-pushed commits"
  fail_count=$((fail_count + 1))
fi
cd "$scratch"
rm -rf "$remote7b"

# Test 8: exempt file (tests/hooks-test.sh) with forbidden string is accepted
echo "Test 8: exempt file tests/hooks-test.sh with forbidden string is accepted"
git reset --hard HEAD~1 >/dev/null 2>&1
mkdir -p tests
echo "workspace/n5/x" > tests/hooks-test.sh
git add tests/hooks-test.sh
if git commit --quiet --message "chore(test): add exempt file" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
  echo "PASS"
else
  echo "FAIL: exempt file tests/hooks-test.sh was refused"
  fail_count=$((fail_count + 1))
fi

# Test 9: exempt file (.githooks/*) with forbidden string is accepted
echo "Test 9: exempt file .githooks/guard.sh with forbidden string is accepted"
git reset --hard HEAD >/dev/null 2>&1
mkdir -p .githooks
echo "workspace/n5/x" > .githooks/guard.sh
git add .githooks/guard.sh
if git commit --quiet --message "chore(test): add exempt githook" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
  echo "PASS"
else
  echo "FAIL: exempt file .githooks/guard.sh was refused"
  fail_count=$((fail_count + 1))
fi

# Test 10: 5-line cap on content refusal
echo "Test 10: content refusal prints at most 5 offending lines"
git reset --hard HEAD >/dev/null 2>&1
mkdir -p docs
echo "workspace/n5/x" > docs/b.md
echo "workspace/n5/y" >> docs/b.md
echo "workspace/n5/z" >> docs/b.md
echo "workspace/n5/a" >> docs/b.md
echo "workspace/n5/b" >> docs/b.md
echo "workspace/n5/c" >> docs/b.md
echo "workspace/n5/d" >> docs/b.md
git add docs/b.md
output=$(git commit --quiet --message "chore(test): 7 lines" --author="Test <Camarent@users.noreply.github.com>" 2>&1 || true)
# Count lines in output that contain workspace/n5/
offending_count=$(echo "$output" | grep -c 'workspace/n5/' || true)
if [ "$offending_count" -eq 5 ]; then
  echo "PASS"
else
  echo "FAIL: expected 5 offending lines, got $offending_count"
  echo "Output was: $output"
  fail_count=$((fail_count + 1))
fi
git reset --hard HEAD >/dev/null 2>&1

# Test 11: pre-push accepts a clean noreply commit
echo "Test 11: pre-push accepts a clean noreply commit"
git reset --hard $(git rev-list --max-parents=0 HEAD) >/dev/null 2>&1
remote=$(mktemp -d)
rm -rf "$remote"
git init --bare "$remote"
git remote add origin "$remote"

echo "clean" >> test.txt
git add test.txt
git commit --quiet --message "chore(test): clean commit" --author="Test <Camarent@users.noreply.github.com>" --no-verify

push_output=$(git push origin HEAD 2>&1)
if [ $? -eq 0 ]; then
  echo "PASS"
else
  echo "FAIL: pre-push refused clean noreply commit"
  echo "Push output: $push_output"
  fail_count=$((fail_count + 1))
fi

# Test 12: pre-push does not fail open when the remote sha is unknown locally
echo "Test 12: pre-push scans commits when remote sha is unknown"
new_repo
remote12=$(mktemp -d)
git init --quiet --bare "$remote12"
git remote add origin "$remote12"
echo "see workspace/n5/x" > bad.md
git add bad.md
git commit --quiet --message "chore(test): bad content" --no-verify
fake=1111111111111111111111111111111111111111
out=$(printf 'refs/heads/main %s refs/heads/main %s\n' "$(git rev-parse HEAD)" "$fake" | "$guard_dir/pre-push" origin "$remote12" 2>&1)
if [ $? -ne 0 ]; then echo "PASS"; else echo "FAIL: unknown remote sha skipped checks"; fail_count=$((fail_count + 1)); fi
cd "$scratch"
rm -rf "$remote12"

# Test 13: author must be the Camarent noreply address, not any noreply
echo "Test 13: commit by other noreply address is refused"
new_repo
echo a > a.txt
git add a.txt
if git -c user.email="evil@users.noreply.github.com" commit --quiet --message "chore(test): x" 2>/dev/null; then
  echo "FAIL: foreign noreply address accepted"; fail_count=$((fail_count + 1))
else
  echo "PASS"
fi
if git -c user.email="3629354+Camarent@users.noreply.github.com" commit --quiet --message "chore(test): x" 2>/dev/null; then
  echo "PASS"
else
  echo "FAIL: numeric Camarent noreply refused"; fail_count=$((fail_count + 1))
fi
cd "$scratch"

# Test 14: pre-push refuses foreign noreply author in range
echo "Test 14: pre-push refuses foreign noreply author"
new_repo
echo a > a.txt
git add a.txt
git -c user.email="evil@users.noreply.github.com" commit --quiet --message "chore(test): x" --no-verify
out=$(printf 'refs/heads/main %s refs/heads/main %s\n' "$(git rev-parse HEAD)" 0000000000000000000000000000000000000000 | "$guard_dir/pre-push" 2>&1)
if [ $? -ne 0 ]; then echo "PASS"; else echo "FAIL: foreign author passed pre-push"; fail_count=$((fail_count + 1)); fi
cd "$scratch"

# Test 15: commit messages with personal email or private path are refused
echo "Test 15: commit-msg and pre-push scan the message"
new_repo
echo a > a.txt
git add a.txt
if git commit --quiet --message "chore(test): contact me@gmail.com" 2>/dev/null; then
  echo "FAIL: commit-msg accepted personal email"; fail_count=$((fail_count + 1))
else
  echo "PASS"
fi
if git commit --quiet --message "chore(test): see workspace/n5/private" 2>/dev/null; then
  echo "FAIL: commit-msg accepted private path"; fail_count=$((fail_count + 1))
else
  echo "PASS"
fi
if git commit --quiet --message "chore(test): ok

Co-Authored-By: Claude <noreply@anthropic.com>"; then
  echo "PASS"
else
  echo "FAIL: co-author trailer refused"; fail_count=$((fail_count + 1))
fi
echo b > b.txt
git add b.txt
git commit --quiet --message "chore(test): mail me@gmail.com" --no-verify
out=$(printf 'refs/heads/main %s refs/heads/main %s\n' "$(git rev-parse HEAD)" 0000000000000000000000000000000000000000 | "$guard_dir/pre-push" 2>&1)
if [ $? -ne 0 ]; then echo "PASS"; else echo "FAIL: pre-push passed message with email"; fail_count=$((fail_count + 1)); fi
cd "$scratch"

# Test 16: staged file with fake GitHub token is refused (skip if gitleaks missing)
echo "Test 16: staged file with fake GitHub token is refused"
new_repo
# Generate exactly 36 alphanumeric characters for a realistic GitHub token
fake_token=$(printf 'ghp_%s' "$(tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c36)")
echo "token: $fake_token" > secret.txt
git add secret.txt
if command -v gitleaks >/dev/null 2>&1; then
  if git commit --quiet --message "chore(test): add secret" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
    echo "FAIL: fake GitHub token was accepted"
    fail_count=$((fail_count + 1))
  else
    echo "PASS"
  fi
else
  echo "SKIP"
fi
cd "$scratch"

# Test 17: staged file with foreign email is refused
echo "Test 17: staged file with foreign email is refused"
new_repo
echo "contact someone@gmail.com" > contact.txt
git add contact.txt
if git commit --quiet --message "chore(test): add contact" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
  echo "FAIL: foreign email was accepted"
  fail_count=$((fail_count + 1))
else
  echo "PASS"
fi
cd "$scratch"

# Test 18: staged file with /root/ path is refused
echo "Test 18: staged file with /root/ path is refused"
new_repo
echo "path: /root/x" > paths.txt
git add paths.txt
if git commit --quiet --message "chore(test): add path" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
  echo "FAIL: /root/ path was accepted"
  fail_count=$((fail_count + 1))
else
  echo "PASS"
fi
cd "$scratch"

# Test 19: clean staged file passes
echo "Test 19: clean staged file passes"
new_repo
echo "This is a clean file with no secrets or paths" > clean.txt
git add clean.txt
if git commit --quiet --message "chore(test): add clean" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
  echo "PASS"
else
  echo "FAIL: clean file was refused"
  fail_count=$((fail_count + 1))
fi
cd "$scratch"

# Test 20: forbidden lines inside tests/hooks-test.sh itself are accepted (exempt path)
echo "Test 20: forbidden lines in tests/hooks-test.sh are accepted"
new_repo
mkdir -p tests
# Create a minimal hooks-test.sh with forbidden content
cat > tests/hooks-test.sh << 'TESTEOF'
#!/bin/sh
# This file contains someone@gmail.com and /root/x which should be exempt
echo "someone@gmail.com /root/x"
TESTEOF
git add tests/hooks-test.sh
if git commit --quiet --message "chore(test): add test script" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
  echo "PASS"
else
  echo "FAIL: exempt file tests/hooks-test.sh was refused"
  fail_count=$((fail_count + 1))
fi
cd "$scratch"


# Cleanup
rm -rf "$remote"
git remote remove origin >/dev/null 2>&1
new_repo; echo s > s.txt; git add s.txt
expect_refused "Test 27: bare subject is refused" "subject must match" git commit --quiet -m "add thing" --author="$A"
expect_refused "Test 27b: type without area is refused" "subject must match" git commit --quiet -m "fix: thing" --author="$A"
expect_ok "Test 27c: typed subject with area is accepted" git commit --quiet -m "feat(core): add thing" --author="$A"

if [ "$fail_count" -gt 0 ]; then
  echo "FAIL: $fail_count test(s) failed"
  exit 1
fi

echo "all passed"
exit 0
