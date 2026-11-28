# Backlog-cleanup findings, checks 3-7

Scope: read-only research on the tree. Goal and checks taken from `TASKS.md` and `request.md` (`task-3.md` has the Done criteria but no separate Steps section). Gaps are stated in each section, not guessed.

## 3. audit-tools block

Verdict: block not added. The expected block text cannot be read from the tree.
- `AUDIT.md` is absent from the repo root. It is git-ignored (`.git/info/exclude:8`), so any block is a lead hand edit.
- `audit-tools` appears in no tracked file (`git grep`, empty). The only hits are in `~/.claude/projects/*.jsonl` transcripts from other projects. I did not read them.
- Lead action: take the exact block from the `tools-check` source, which is outside this repo, and add it to `AUDIT.md` by hand.

## 4. ci-drift coverage of pages.yml

Verdict: two gates are uncovered. Record them as a lead hand edit; ci-drift stays red for this stage.
- Uncovered steps: `.github/workflows/pages.yml:27` `./dojo build examples/showcase`, and `:30` `rc=0; grep -rEn "(href|src)=\"/|url\(/|fetch\('/" dist/showcase || rc=$?`.
- Lead action: add `./dojo build` and `rc=0; grep` to `ci_drift_ignore` in `pipeline.json`. That file is git-ignored (`.git/info/exclude:7`).
- `ci_drift_ignore` appears in no tracked file. Its current contents are unknown.

## 5. public_forbidden_words

Verdict: list is not in the repo. The gate was not run, so no hits are reported.
- No tracked file defines `public_forbidden_words` (`git grep`, empty).
- The stage request (`.work/backlog-cleanup/request.md`, check 5) places it in `tools/pipeline/configuration/public.py` outside the repo. That file was not found under `/workspace` or `/home/cam/workspace/claude-safe`. A search of `/home/cam` was not approved.
- Fixed hits in tracked files: none. The gate could not run.
- Lead action: locate the pipeline tools, run the public-words gate over the tracked tree, and fix real hits in a follow-up task.

## 6. Empty leads-*-rel.md (docs-cleanup)

Verdict: the premise is wrong. The files are not empty. `wc -l` reports 0 because each file is one line with no trailing newline.
- Evidence: `.work/docs-cleanup/leads/leads-audit-{arch,arch-2,arch-3,sec,sec-2,sec-3}-rel.md` are 251 or 284 bytes each (`wc -c`). `leads-audit-sec-rel.md` line 1 lists related docs and tests (names only).
- Whether this is a pipeline defect depends on a line-count check that lives outside the repo. Not verified here.
- Lead action: if the pipeline gate counts lines, fix the writer to end each file with a newline, with a test, in the pipeline repo. Not a repo task.

## 7. Commits ed84230, 9d508ff, e77a5a9

Verdict: nothing lost. All three are content-present in `6406345`, which is on `master`.
- `ed84230` (`docs/decisions.md`, 3+/3-): its added lines are in `6406345:docs/decisions.md` (3 of 3 phrases matched).
- `9d508ff` (`docs/modules/web.md`, 1+/1-): its added line is in `6406345:docs/modules/web.md` (`Locked cloze parts: ... lockedField`, matched).
- `e77a5a9` (`docs/modules/tests.md`, 1+/1-): its added line is in `6406345:docs/modules/tests.md` (`merge_examDraft_*` case count, matched).
- Commit hashes resolve (`git cat-file -t` returns commit for all three). `6406345` has more changes than these three, so the hashes are not literally on master.

Files changed: `docs/backlog-cleanup-findings.md` (this document, lead saves it). Test result: not run. Affected tests: none (docs only).

ESCALATE: checks 3, 4 (ci_drift_ignore entries), and 5 need the pipeline tools and `pipeline.json`, which are outside the repo. The lead must supply the audit-tools block text, locate `public_forbidden_words`, and do the hand edits.
