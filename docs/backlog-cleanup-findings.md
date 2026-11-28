# Backlog-cleanup findings, checks 3-7

Scope: read-only research on the tree. Goal and checks come from the stage brief (the Done criteria are in the task record, no separate Steps section). Gaps are stated in each section, not guessed.

## 3. Audit block

Verdict: block not added. The expected block text cannot be read from the tree.
- `AUDIT.md` is absent from the repo root. It is git-ignored, so any block is a hand edit by the owner.
- The block name appears in no tracked file (`git grep`, empty). The only hits are in transcripts of other projects in the user's home directory. I did not read them.
- Next action: take the exact block from the external check tool's source and add it to `AUDIT.md` by hand.

## 4. CI drift check coverage of pages.yml

Verdict: two gates are uncovered. Record them as a hand edit; the CI drift check stays red for this stage.
- Uncovered steps: `.github/workflows/pages.yml:27` `./dojo build examples/showcase`, and `:30` `rc=0; grep -rEn "(href|src)=\"/|url\(/|fetch\('/" dist/showcase || rc=$?`.
- Next action: add `./dojo build` and `rc=0; grep` to the drift-check ignore list in the pipeline config. That file is git-ignored.
- The ignore list appears in no tracked file. Its current contents are unknown.

## 5. Public word list

Verdict: list is not in the repo. The gate was not run, so no hits are reported.
- No tracked file defines the public word list (`git grep`, empty).
- The stage request places it in a pipeline tools module outside the repo. That module was not found in the usual local workspace folders. A search of the whole home directory was not approved.
- Fixed hits in tracked files: none. The gate could not run.
- Next action: locate the pipeline tools, run the public-words gate over the tracked tree, and fix real hits in a follow-up task.

## 6. Empty relation files (docs-cleanup stage)

Verdict: the premise is wrong. The files are not empty. `wc -l` reports 0 because each file is one line with no trailing newline.
- Evidence: the six `*-rel.md` relation files of the docs-cleanup stage are 251 or 284 bytes each (`wc -c`). The sec relation file, line 1, lists related docs and tests (names only).
- Whether this is a pipeline defect depends on a line-count check that lives outside the repo. Not verified here.
- Next action: if the pipeline gate counts lines, fix the writer to end each file with a newline, with a test, in the pipeline repo. Not a repo task.

## 7. Commits ed84230, 9d508ff, e77a5a9

Verdict: nothing lost. All three are content-present in `6406345`, which is on `master`.
- `ed84230` (`docs/decisions.md`, 3+/3-): its added lines are in `6406345:docs/decisions.md` (3 of 3 phrases matched).
- `9d508ff` (`docs/modules/web.md`, 1+/1-): its added line is in `6406345:docs/modules/web.md` (`Locked cloze parts: ... lockedField`, matched).
- `e77a5a9` (`docs/modules/tests.md`, 1+/1-): its added line is in `6406345:docs/modules/tests.md` (`merge_examDraft_*` case count, matched).
- Commit hashes resolve (`git cat-file -t` returns commit for all three). `6406345` has more changes than these three, so the hashes are not literally on master.

Open: checks 3, 4 (ignore-list entries) and 5 need tooling outside this repo. They stay open until the owner supplies the audit block text, locates the public word list, and makes the hand edits.
