# Prompt: build a trainer from my materials (any AI with file access and a shell)

Copy this into your AI assistant, replacing the angle brackets.

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
