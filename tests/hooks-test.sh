#!/bin/sh
# POSIX sh test for git hooks

# Compute framework .githooks path from script location
guard_dir=$(cd "$(dirname "$0")/.." && pwd)/.githooks

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
git commit --quiet --message "initial" --author="Test <Camarent@users.noreply.github.com>" --no-verify

fail_count=0

# Test 1: staging workspace/n5/x is refused
# (This will be tested by pre-commit)
echo "Test 1: staging workspace/n5/x is refused"
mkdir -p workspace/n5
echo "x" > workspace/n5/x
git add workspace/n5/x
if git commit --quiet --message "add n5" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
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
git commit --quiet --message "add docs" --author="Test <Camarent@users.noreply.github.com>" --no-verify

echo "See workspace/n5/tools for details" >> docs/a.md
git add docs/a.md
if git commit --quiet --message "add n5 ref" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
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
if git commit --quiet --message "add placeholder" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
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
if git commit --quiet --message "add gitkeep" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
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
if git commit --quiet --message "personal" --author="Someone <someone@gmail.com>" 2>/dev/null; then
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
git commit --quiet --message "good commit" --author="Test <Camarent@users.noreply.github.com>" --no-verify

# Make a bad commit (with personal email)
echo "bad" >> test.txt
git add test.txt
git commit --quiet --message "bad commit" --author="Bad <bad@example.com>" --no-verify

# Try to push - should be refused by pre-push
if git push origin HEAD 2>/dev/null; then
  echo "FAIL: pre-push accepted bad commit"
  fail_count=$((fail_count + 1))
else
  echo "PASS"
fi

# Cleanup
rm -rf "$remote"
git remote remove origin >/dev/null 2>&1

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
  git commit --quiet --message "root" --no-verify
}

# Test 7: pre-push refuses forbidden content (clean history, noreply only)
echo "Test 7: pre-push refuses range with forbidden content"
new_repo
remote7=$(mktemp -d)
git init --quiet --bare "$remote7"
git remote add origin "$remote7"
echo "see workspace/n5/x" > notes.md
git add notes.md
git commit --quiet --message "content commit" --no-verify
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
git commit --quiet --message "old bad" --no-verify
git push --no-verify --quiet origin HEAD:refs/heads/main >/dev/null 2>&1
git fetch --quiet origin
git checkout --quiet -b feature
echo "fine" > new.md
git add new.md
git commit --quiet --message "new clean" --no-verify
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
if git commit --quiet --message "add exempt file" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
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
if git commit --quiet --message "add exempt githook" --author="Test <Camarent@users.noreply.github.com>" 2>/dev/null; then
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
output=$(git commit --quiet --message "7 lines" --author="Test <Camarent@users.noreply.github.com>" 2>&1 || true)
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
git commit --quiet --message "clean commit" --author="Test <Camarent@users.noreply.github.com>" --no-verify

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
git commit --quiet --message "bad content" --no-verify
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
if git -c user.email="evil@users.noreply.github.com" commit --quiet --message "x" 2>/dev/null; then
  echo "FAIL: foreign noreply address accepted"; fail_count=$((fail_count + 1))
else
  echo "PASS"
fi
if git -c user.email="3629354+Camarent@users.noreply.github.com" commit --quiet --message "x" 2>/dev/null; then
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
git -c user.email="evil@users.noreply.github.com" commit --quiet --message "x" --no-verify
out=$(printf 'refs/heads/main %s refs/heads/main %s\n' "$(git rev-parse HEAD)" 0000000000000000000000000000000000000000 | "$guard_dir/pre-push" 2>&1)
if [ $? -ne 0 ]; then echo "PASS"; else echo "FAIL: foreign author passed pre-push"; fail_count=$((fail_count + 1)); fi
cd "$scratch"

# Test 15: commit messages with personal email or private path are refused
echo "Test 15: commit-msg and pre-push scan the message"
new_repo
echo a > a.txt
git add a.txt
if git commit --quiet --message "contact me@gmail.com" 2>/dev/null; then
  echo "FAIL: commit-msg accepted personal email"; fail_count=$((fail_count + 1))
else
  echo "PASS"
fi
if git commit --quiet --message "see workspace/n5/private" 2>/dev/null; then
  echo "FAIL: commit-msg accepted private path"; fail_count=$((fail_count + 1))
else
  echo "PASS"
fi
if git commit --quiet --message "ok

Co-Authored-By: Claude <noreply@anthropic.com>"; then
  echo "PASS"
else
  echo "FAIL: co-author trailer refused"; fail_count=$((fail_count + 1))
fi
echo b > b.txt
git add b.txt
git commit --quiet --message "mail me@gmail.com" --no-verify
out=$(printf 'refs/heads/main %s refs/heads/main %s\n' "$(git rev-parse HEAD)" 0000000000000000000000000000000000000000 | "$guard_dir/pre-push" 2>&1)
if [ $? -ne 0 ]; then echo "PASS"; else echo "FAIL: pre-push passed message with email"; fail_count=$((fail_count + 1)); fi
cd "$scratch"


# Cleanup
rm -rf "$remote"
git remote remove origin >/dev/null 2>&1

if [ "$fail_count" -gt 0 ]; then
  echo "FAIL: $fail_count test(s) failed"
  exit 1
fi

echo "All tests passed"
exit 0
