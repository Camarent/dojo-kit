# From textbooks to a course

Workflow for turning PDF, scanned or EPUB textbooks into a dojo-kit course. The general procedure, hard rules and field lists stay in `AGENTS.md` and `docs/AUTHORING.md`; this file only adds the textbook-specific steps. Install requirements: README "Requirements" (the extraction tools are optional and their command lines here are unverified; if one fails, check `--help` and adapt).

## 1. Extract text (into scratch files, one per chapter)
Work in `workspace/<id>/materials/` (originals) and `workspace/<id>/materials/text/` (your extracted text; the user's originals are never modified). Ask the user before keeping converted text of a copyrighted book (AGENTS.md section 3).
- Text PDF: `pdfinfo book.pdf` (page count), then `pdftotext -layout -f <first> -l <last> book.pdf text/ch01.txt`. Check `pdftotext` output is real text: if a page gives empty or garbage output, it is a scan.
- Scanned PDF or images: `pdftoppm -r 300 -png -f <first> -l <last> book.pdf text/pg` then `tesseract text/pg-<n>.png text/pg-<n> -l <lang>` (language packs, e.g. `eng`, `jpn`, are separate installs; `tesseract --list-langs` shows what is present). Do not guess at unreadable pages: leave those items out and list the pages in `GAPS.md`.
- EPUB: `pandoc book.epub -t plain -o text/book.txt`, or `ebook-convert book.epub text/book.txt` (calibre). If neither is installed and the user does not want installs, ask for a PDF/TXT export.
- Check one extracted chapter by eye (head of the file) before using the rest: column order, hyphenation, lost characters, missing furigana.

## 2. Chunk by chapter and plan units
1. Find chapter boundaries from the table of contents; write `ch01.txt`, `ch02.txt`, ... (one file per chapter, or per chapter section if a chapter is over about 15 pages).
2. In `MAP.md` write one line per planned unit: unit id, title, source file and pages, planned item count (AGENTS.md section 3). Usually one unit per chapter; split large chapters into units of 10-40 items; put vocabulary lists in their own unit.
3. Mark progress in `MAP.md` as you go (status format in section 8).
4. Edit `course.json` units from the plan. Show the user the plan in a few lines.

## 3. Write items, one chapter at a time
Read one chapter chunk, then write items for it with `./dojo add workspace/<id> <unit> --file items.json` (or stdin), 8-15 items per call (AGENTS.md section 4). Never write `content/*.jsonl` by hand. Put the scratch batch files outside the course folder or delete them afterwards.
- Choose types by content: vocabulary and definitions are `card` or `gap`/`choice`; grammar patterns are `cloze`/`gap`/`choice`; matching terms to meanings is `match`; procedures are `order`; numbers are `numeric`.
- Give each item `source` (`materials/<file> p.<n>` or chapter and section) and `tags` (chapter, topic).
- Items stand alone and have one defensible answer (AUTHORING "Unambiguous-answer rules"). If the book gives no answer, leave the item out.

## 4. Per-chapter validate/lock loop
After each chapter (and after every 2-3 `add` calls):
```
./dojo validate workspace/<id> --json     # fix every error; read warnings
./dojo lock workspace/<id>                # records ids
./dojo stats workspace/<id>               # thin units
```
Then mark the chapter done in `MAP.md`, and go to the next. Never end a session with validation errors. Last step of the course: review a 10-15% sample against the text (AGENTS.md section 6), then `./dojo build workspace/<id>`.

## 5. Copyright
The books are copyrighted: write every question and explanation in your own words; quote at most a short phrase (a word, a short sentence). Do not paste paragraphs, full vocabulary tables, whole exercises or answer keys. Facts (a word's meaning, a rule, a date) may be used; the book's wording and layout may not. `source` points at the place, it does not copy it. Exercises in the book may inspire items, but change the sentences. Do not commit `materials/` to a public repository.

## 6. Audio, readings and markup
- Listening: an item or a shared passage cannot carry audio files. Use the text-to-speech field `speak` (a string on an item; on a stimulus `{lines:[{voice,text}]}`, see AUTHORING "Shared passage") so the app reads the text aloud with the browser voice; the prompt asks the question and must not contain the spoken text if the text is the answer. Set `speech` in `course.json` (`lang`, `rate`, `voices` with `pitch`, `rate`, `match`; fields in `schema/course.schema.json`) so the right voice language is used. If the book's own audio (CD, MP3) is the point, say so in `GAPS.md`: the app plays only speech synthesis.
- Readings (furigana, pinyin, any gloss): `"markup": "ruby"` in `course.json` is built in and renders `{base|reading}` annotations (plain text for search and speech drops the reading). Write them only when the user asks. For a course whose answers are typed in a non-Latin script (Cyrillic, Greek, CJK, Arabic, ...) set `"inputScript": ["<script>"]` (or `"non-latin"`): a typed answer with Latin letters is blocked with a hint instead of being graded wrong (a keyboard left on the wrong layout). Prefer particular system voices with `speech.voices.<role>.prefer: ["voice-name-regex", ...]`. For custom reading display modes use the `ja-readings` plugin set up as in `examples/plugins/ja-readings/README.md` (`plugins` and `"markup": "ja-readings"`). Do not copy the markup into `choice`/`multi` options in a "a/b" form (AUTHORING rule 3). Text in a script other than Latin, Cyrillic, Hiragana, Katakana, CJK needs `scripts` in `course.json`.
- Anything no type can express (pronunciation drills, drawings, tables): `GAPS.md`, one factual bullet, what you did instead.

## 7. Exams from chapter tests
Chapter or end-of-book tests give the real format: sections, question counts, minutes, pass rule. Ask the user which test is the model for the exam; then set `exam` or `exams` in `course.json` (AUTHORING "Exams"), with sections filtered by `units`/`tags`/`types`. Ask whether the chapter-test questions are kept for the exam only; if so, write them in `examOnly` units and point the exam sections at those units. Write the items in the test's style, not its text. Check `exam_too_big` warnings with `./dojo validate`. Cards never go into an exam.

## 8. Resume a half-done course
State lives in files, so a new session can continue:
1. Read `workspace/<id>/MAP.md` (plan and done/not done per chapter), `GAPS.md`.
2. Run `./dojo validate workspace/<id> --json` and `./dojo stats workspace/<id>`: fix errors first, then compare counts to the plan.
3. Continue with the first chapter not marked done. Do not rewrite finished chapters; add with `./dojo add` (new ids are assigned), retire wrong items with `"status":"retired"` (AGENTS.md sections 0, 8).
4. If extracted text is missing, re-run section 1 for that chapter only.
Keep in `MAP.md` a status per unit line (`todo` / `in progress, N items` / `done`) so this works.

## 9. When context runs out
- Keep to one chapter at a time: read the chunk, add items, validate, mark `MAP.md`. Do not keep the full text of several chapters in context.
- Never keep information only in your head: after each chapter `MAP.md` says what is done, what is next, and which pages were skipped.
- If you are running low on context or turns: stop adding, run `./dojo validate`, `./dojo lock`, `./dojo build` (AGENTS.md 4a), update `MAP.md`, and tell the user to start a new session with the resume prompt (README "Test prompt", resume line).

## 10. Groups, entities and progress bars
- `entity` (optional string on each item): items that teach one thing together (a headword and its derived forms, a term and its definition) share one entity id. The app introduces them together and counts them once in group caps and bars. Without `entity` each item is its own entity.
- `groups[]`: `{id, title, units[], newPerDay?, newOrder? (file | random), extraNew?, extraTags?}`. A group caps new entities per day; a unit belongs to at most one group. `extraNew` marks at most one group, the one the "more new" buttons add to. `extraTags` are the tags for the "only tagged" toggle: with it on, the extra entities beyond the base share must carry one of these tags.
- Keep an entity inside one group: `entity_spans_groups` warns when its items fall in units of different groups.
- `bars[]`: `{title, units?, tags?, learnedStage?}`, shown on Home, counted in entities. `bar_matches_zero` warns when a bar or `extraTags` matches no item.
- `tagLabels`: `{tag: label}` or `{tag: {label?, kind?}}` for display; a tag without a label is shown uppercased; `kind: "internal"` hides a tag (for example a source or exam tag) from the catalog chips.
- Intro cards: when several items teach one entity (for example four questions about one character or word), write one card for it in `intros.jsonl` instead of repeating the same explanation on every item: `{"id":"<entity id>","title":"...","text":"...","meta":{...}}`. `id` must equal the `entity` of the items (or the item id when there is no `entity`). Set `introNew: true` in `course.json`; the card appears once before the first question of the entity, then never again. `meta` is free data for a plugin (`DojoExt.registerIntro`). Write the text in your own words, as for explanations. `intro_unknown_entity` warns when an id matches no item.
- The learner can change each group's `newPerDay`, `newOrder`, and the two toggles in Settings; those choices never change grading or scheduling of the items themselves.
- Validation codes: `unknown_unit_in_group`, `unit_in_two_groups`, `two_extra_new_groups` (errors), `entity_spans_groups`, `bar_matches_zero` (warnings). Field shapes: CONTRACT section 4.

## Importing legacy progress

When migrating from a pre-v1 course or another system, use `./dojo import-progress` to convert progress files. See AUTHORING.md for details.
