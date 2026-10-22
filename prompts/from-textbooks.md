# Prompt: build a trainer from textbooks (AI with file access and a shell)

Copy this into your AI assistant, replacing the angle brackets.

```
Open the repository at <path to dojo-kit>. Read AGENTS.md and docs/FROM-TEXTBOOKS.md completely, then build a practice trainer from my textbooks. Course id: <id>. The textbooks (PDF, scans or EPUB) are in workspace/<id>/materials/.

Course: <topic, level, date>. UI language: <en|ru>. Content language: <language>. Exam format (if known, or "take it from the chapter tests"): <sections, questions, minutes, pass rule (the official one if it exists; if there is none, at least 60% correct; if even that does not fit, ask me)>.

Steps: check the requirements (README "Requirements"); tell me what is missing and ask before installing anything; never use sudo without asking. Extract text per chapter, write MAP.md and show me the plan, then for each chapter write items only with ./dojo add, run ./dojo validate and ./dojo lock after it and mark the chapter done in MAP.md. Own wording only, short quotes at most. Use the speak field for listening. Put what cannot be expressed into GAPS.md. At the end ./dojo build and report items per unit and type and everything skipped. Do not publish without asking me.

To continue an unfinished course instead: "Resume workspace/<id> following docs/FROM-TEXTBOOKS.md section 8."
```
