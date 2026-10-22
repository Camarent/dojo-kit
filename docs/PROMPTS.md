# Prompts for an AI assistant

Ready-to-paste prompts live in `prompts/`. Replace each `<...>` placeholder. The assistant follows `AGENTS.md` (procedure) and `docs/AUTHORING.md` (reference rules). All commands below exist in `crates/dojo-cli/src/main.rs`: `init`, `add`, `next-id`, `validate`, `lock`, `stats`, `build`, `schema`.

| file | use when | placeholders | expected result |
|---|---|---|---|
| `prompts/build-from-materials.md` | new course; assistant has file access and a shell | repo path, exam/course/level/date, UI language, content language, exam format, question types, materials path, course id | `workspace/<course-id>/` with valid content, per-unit/type counts, list of skipped items; nothing published without asking |
| `prompts/from-textbooks.md` | course from PDF/scan/EPUB textbooks in `workspace/<id>/materials/` | repo path, course id, course/level/date, languages, exam format | extracted text per chapter, `MAP.md` plan, validated items per chapter, build; resumable |
| `prompts/add-content.md` | extend an existing course | repo path, course id, new files or topic | new items with new ids, wrong items retired (listed with reasons), new counts from `./dojo stats` |
| `prompts/review-course.md` | independent check of a course | repo path, course id | a findings list (item id, problem, suggested fix); no edits |
| `prompts/chat-only.md` | assistant cannot run commands | exam/course, pasted material | course files as text blocks; the user saves them, runs `./dojo validate workspace/<course-id>`, pastes errors back, then `./dojo build workspace/<course-id>` |

## build-from-materials.md
```
Open the repository at <path to dojo-kit> and read AGENTS.md completely. Then build a practice trainer for me following it exactly.

I am preparing for: <exam or course, level, date>.
UI language: <en|ru>. Content language: <language>.
Exam format (if known): <sections, number of questions, minutes, pass rule (the official one if it exists; if there is none, at least 60% correct; if even that does not fit, ask me)>.
Question types I want: <e.g. mostly multiple choice, some typed answers, some fill-in-the-blank; or "you decide">.
My materials are in: <path> (copy them into workspace/<course-id>/materials/ if they are elsewhere).
Course id: <short-lowercase-id>

Rules: only my materials are the source of facts; write your own questions, do not copy long passages; run ./dojo validate after every batch of about 30 items and fix every error; do not stop with validation errors; at the end show me the number of items per unit and type and list anything you skipped. Do not publish anything without telling me first.
```

## from-textbooks.md
Workflow: `docs/FROM-TEXTBOOKS.md`.
```
Open the repository at <path to dojo-kit>. Read AGENTS.md and docs/FROM-TEXTBOOKS.md completely, then build a practice trainer from my textbooks. Course id: <id>. The textbooks (PDF, scans or EPUB) are in workspace/<id>/materials/.

Course: <topic, level, date>. UI language: <en|ru>. Content language: <language>. Exam format (if known, or "take it from the chapter tests"): <sections, questions, minutes, pass rule (the official one if it exists; if there is none, at least 60% correct; if even that does not fit, ask me)>.

Steps: check the requirements (README "Requirements"); tell me what is missing and ask before installing anything; never use sudo without asking. Extract text per chapter, write MAP.md and show me the plan, then for each chapter write items only with ./dojo add, run ./dojo validate and ./dojo lock after it and mark the chapter done in MAP.md. Own wording only, short quotes at most. Use the speak field for listening. Put what cannot be expressed into GAPS.md. At the end ./dojo build and report items per unit and type and everything skipped. Do not publish without asking me.

To continue an unfinished course instead: "Resume workspace/<id> following docs/FROM-TEXTBOOKS.md section 8."
```

## add-content.md
```
Open <path to dojo-kit>, read AGENTS.md (sections 0, 4, 5, 8) and then extend the course workspace/<course-id>/ with material from <new files or topic>. Use ./dojo next-id for ids, never reuse or renumber ids, validate and lock after each batch, and show me the new counts with ./dojo stats. Do not change existing items except to retire wrong ones; tell me which ones and why.
```

## review-course.md
```
Open <path to dojo-kit>. Read AGENTS.md section 4 (content rules) and 8a (Unambiguous answers). Review workspace/<course-id>/ as a strict examiner: run ./dojo validate workspace/<course-id> --json, then check a random 15% of items against workspace/<course-id>/materials/ for factual errors, ambiguous prompts, more than one defensible correct option, implausible distractors, answers leaked in the prompt, prompt/type mismatches, and script mixing. Report findings as a list (item id, problem, suggested fix). Do not edit anything.
```

## chat-only.md
The file starts with the heading "Prompt: AI without file or shell access (chat only)" and the line "You cannot run `dojo`, so ask the AI to produce the course files as text and run the tool yourself." Then the prompt:
```
I want a practice trainer for <exam/course>. Produce, as separate code blocks with the file name above each block:
1. course.json (fields: id, title, uiLanguage, contentLanguage, units [{id,title}], optional exam {minutes, passMark?, pass?, sections [{title,count,units?,types?}]}).
2. One JSONL file per unit (content/<unit-id>.jsonl), one JSON object per line, with these types: choice {type,id,unit,prompt,options,answer(index from 0),explanation}, multi {options, correct[]}, gap {answers[]}, cloze {parts: strings and arrays-of-alternatives}, numeric {answer, tolerance?, unitLabel?}, match {pairs[{left,right}]}, order {steps in correct order}, card {prompt, back}. Ids look like geo-1, geo-2 and must be unique.
Base every fact on this material only: <paste material>. Write your own questions; do not copy long passages.
```
After the reply: save the blocks into `workspace/<course-id>/` in the repository, run `./dojo validate workspace/<course-id>`, paste the errors back to the AI, and repeat until it passes. Then `./dojo build workspace/<course-id>`.

## Example user requests
1. "Build a trainer for the B1 English exam on 15 March. My PDFs are in ~/exam/b1. UI in English, three sections (reading, grammar, vocabulary), 60 minutes, pass mark 0.7, mostly multiple choice. Course id: b1-english." (use `build-from-materials.md`)
2. "Add the chapter in new/ch5.md to the course b1-english. Keep old ids and show me the counts afterwards." (use `add-content.md`)
3. "Review the course b1-english like a strict examiner and list problems; change nothing." (use `review-course.md`)
