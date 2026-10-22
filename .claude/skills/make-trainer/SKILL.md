---
name: make-trainer
description: Build a practice trainer (quizzes, spaced repetition, mock exam) from the user's own study materials with dojo-kit, and publish it as a private Claude artifact. Use when the user says they are preparing for an exam or course and wants a trainer, test app or quiz built from their materials, or wants to add content to or republish an existing dojo-kit course.
---

# make-trainer

1. Read `AGENTS.md` at the repository root and follow it from section 1 to section 6. It is the single source of truth for the procedure, the content rules and the commands; do not work from memory. With a mock exam, settle the pass rule and the exam-only split with the user first (section 1, items 3 and 7).
2. If the course `uiLanguage` has no `web/i18n/<lang>.json` (only `en` and `ru` ship), translate `web/i18n/en.json` into `workspace/<course-id>/i18n/<lang>.json` (AGENTS.md section 9: keep keys and `{placeholders}`, keep plural suffixes), then run validate. Do not edit the framework for this.
3. Build with `./dojo build workspace/<course-id>` (section 7).
4. Publish with the Artifact tool, privately:
   - `file_path`: `dist/<course-id>/index.html`
   - `files`: `{"data/content.json": "dist/<course-id>/data/content.json"}`
   - `capabilities`: `{"db": {}, "user": {}}` (load the `artifact-capabilities` skill first when it is available)
   - `icon`: a short word such as `quiz`; `description`: one sentence about the course.
   First publish creates a new artifact; to update, call the tool again with the same `file_path` (and the artifact `url` when it comes from an earlier conversation). Never create a second artifact for the same course: progress is stored per artifact.
5. Tell the user the link, that it is private until they share it, how many items per unit/type were built, and what you skipped. Mention the progress export in Settings as the backup.
6. If the user only asked for an update, run validate -> lock -> build -> republish to the same URL; wording edits keep progress, type or answer changes need new ids.
