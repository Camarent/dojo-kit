use std::collections::BTreeMap;
use dojo_core::content::{Item, parse_items};
use dojo_core::lock::{IdLock, parse_lock, update};
use dojo_core::validate::{CODES, Diagnostic, Severity, SourceFile, validate};

const COURSE: &str = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;

fn file(name: &str, text: &str) -> SourceFile {
    SourceFile { name: name.to_string(), text: text.to_string() }
}

fn run(course: &str, lines: &[&str]) -> Vec<Diagnostic> {
    validate(course, &[file("content/u.jsonl", &lines.join("\n"))], None)
}

fn codes(d: &[Diagnostic]) -> Vec<&'static str> {
    d.iter().map(|d| d.code).collect()
}

fn fires(course: &str, lines: &[&str], code: &str) {
    let d = run(course, lines);
    assert!(d.iter().any(|d| d.code == code), "{code} not in {d:?}");
}

const CHOICE: &str = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["a","b"],"answer":0}"#;

fn with_course(extra: &str) -> String {
    format!(r#"{{"id":"c","title":"C","uiLanguage":"en","units":[{{"id":"u","title":"U"}}],{extra}}}"#)
}

#[test]
fn clean_course_has_no_diagnostics() {
    assert_eq!(run(COURSE, &[CHOICE]), vec![]);
}

#[test]
fn every_code_is_listed_once() {
    let mut names: Vec<&str> = CODES.iter().map(|c| c.0).collect();
    names.sort();
    names.dedup();
    assert_eq!(names.len(), CODES.len());
}

#[test]
fn course_parse_error() {
    let d = validate("{", &[], None);
    assert_eq!((d[0].code, d[0].file.as_str()), ("parse_error", "course.json"));
}

#[test]
fn item_parse_error_has_line() {
    let d = run(COURSE, &[CHOICE, "nope"]);
    assert_eq!((d[0].code, d[0].line, d[0].severity), ("parse_error", 2, Severity::Error));
}

#[test]
fn duplicate_unit_and_no_units() {
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"},{"id":"u","title":"V"}]}"#;
    fires(c, &[CHOICE], "duplicate_unit");
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[]}"#;
    fires(c, &[], "no_units");
}

#[test]
fn unit_id_validation() {
    for bad_id in ["", "../../escaped", "A", "a/b", "-a", &"a".repeat(49)] {
        let c = format!(r#"{{"id":"c","title":"C","uiLanguage":"en","units":[{{"id":"{bad_id}","title":"U"}}]}}"#);
        fires(&c, &[], "bad_unit_id");
    }
}

#[test]
fn course_id_validation() {
    for bad_id in ["", "Demo", "has space", "-abc", &"a".repeat(49)] {
        let c = format!(r#"{{"id":"{bad_id}","title":"C","uiLanguage":"en","units":[{{"id":"u","title":"U"}}]}}"#);
        fires(&c, &[CHOICE], "bad_course_id");
    }
    for good_id in ["demo", "a_b-1", "a"] {
        let c = format!(r#"{{"id":"{good_id}","title":"C","uiLanguage":"en","units":[{{"id":"u","title":"U"}}]}}"#);
        assert_eq!(run(&c, &[CHOICE]), vec![]);
    }
}

#[test]
fn bad_ladders() {
    for ladder in ["[0]", "[1,2]", "[0,-1]", "[0,5,3]"] {
        fires(&with_course(&format!(r#""srs":{{"ladder":{ladder}}}"#)), &[CHOICE], "bad_ladder");
        fires(&with_course(&format!(r#""srsByType":{{"gap":{{"ladder":{ladder}}}}}"#)), &[CHOICE], "bad_ladder");
    }
    let ok = with_course(r#""srs":{"ladder":[0,5,5]}"#);
    assert_eq!(run(&ok, &[CHOICE]), vec![]);
}

#[test]
fn bad_drop() {
    for drop in ["-1", "11", "100"] {
        fires(&with_course(&format!(r#""srs":{{"dropOnWrong":{drop}}}"#)), &[CHOICE], "bad_drop");
        fires(&with_course(&format!(r#""srsByType":{{"gap":{{"dropOnWrong":{drop}}}}}"#)), &[CHOICE], "bad_drop");
        let c = format!(r#"{{"id":"c","title":"C","uiLanguage":"en","units":[{{"id":"u","title":"U","srs":{{"dropOnWrong":{drop}}}}}]}}"#);
        fires(&c, &[CHOICE], "bad_drop");
    }
    for drop in ["0", "5", "10"] {
        assert_eq!(run(&with_course(&format!(r#""srs":{{"dropOnWrong":{drop}}}"#)), &[CHOICE]), vec![]);
    }
}

#[test]
fn bad_placement() {
    fires(&with_course(r#""placement":{"perUnit":0}"#), &[CHOICE], "bad_placement");
    assert_eq!(run(&with_course(r#""placement":{"perUnit":3}"#), &[CHOICE]), vec![]);
    assert_eq!(run(&with_course(r#""placement":{}"#), &[CHOICE]), vec![]);
    // Course.placement set but all units have placement:false
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U","placement":false}],"placement":{"perUnit":3}}"#;
    let d = run(c, &[CHOICE]);
    assert!(d.iter().any(|d| d.code == "bad_placement"), "bad_placement not in {d:?}");
}

#[test]
fn placement_unused() {
    // Unit with placement:false but course.placement is absent
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U","placement":false}]}"#;
    let d = run(c, &[CHOICE]);
    assert!(d.iter().any(|d| d.code == "placement_unused"), "placement_unused not in {d:?}");
    // Multiple units with placement:false, no course.placement
    let c2 = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U","placement":false},{"id":"u2","title":"U2","placement":false}]}"#;
    let d2 = run(c2, &[CHOICE]);
    assert!(d2.iter().any(|d| d.code == "placement_unused"), "placement_unused not in {d2:?}");
    // placement_unused is silent when course.placement is set
    let c3 = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U","placement":false},{"id":"u2","title":"U2"}],"placement":{"perUnit":3}}"#;
    let d3 = run(c3, &[CHOICE]);
    assert!(!d3.iter().any(|d| d.code == "placement_unused"), "placement_unused should be silent when course.placement is set, got {d3:?}");
}

#[test]
fn srs_by_type_unknown_key() {
    fires(&with_course(r#""srsByType":{"quiz":{"ladder":[0,1]}}"#), &[CHOICE], "srs_by_type_unknown");
}

#[test]
fn bad_pass_mark() {
    for m in ["1.5", "-0.1"] {
        let c = with_course(&format!(r#""exam":{{"passMark":{m},"sections":[{{"title":"s","count":1}}]}}"#));
        fires(&c, &[CHOICE], "bad_pass_mark");
    }
}

#[test]
fn bad_exam_sections() {
    let cases = [
        r#"{"title":"s","count":0}"#,
        r#"{"title":"s","count":1,"units":["zzz"]}"#,
        r#"{"title":"s","count":1,"types":["card"]}"#,
        r#"{"title":"s","count":1,"types":["bogus"]}"#,
    ];
    for s in cases {
        fires(&with_course(&format!(r#""exam":{{"passMark":0.5,"sections":[{s}]}}"#)), &[CHOICE], "bad_exam_section");
    }
    let c = with_course(r#""types":["choice"],"exam":{"passMark":0.5,"sections":[{"title":"s","count":1,"types":["gap"]}]}"#);
    fires(&c, &[CHOICE], "bad_exam_section");
}

#[test]
fn exam_too_big_counts_only_active_matching() {
    let retired = r#"{"type":"choice","id":"u-2","unit":"u","prompt":"Other","options":["a","b"],"answer":0,"status":"retired"}"#;
    let c = with_course(r#""exam":{"passMark":0.5,"sections":[{"title":"s","count":2}]}"#);
    let d = run(&c, &[CHOICE, retired]);
    assert_eq!(codes(&d), vec!["exam_too_big", "exam_few_unique"]);
    assert_eq!(d[0].severity, Severity::Warning);
}

#[test]
fn exam_few_unique_no_exam_only_units() {
    let c = with_course(r#""exam":{"passMark":0.5,"sections":[{"title":"s","count":5}]}"#);
    let i1 = CHOICE;
    let i2 = r#"{"type":"choice","id":"u-2","unit":"u","prompt":"Pick 2","options":["a","b"],"answer":0}"#;
    let i3 = r#"{"type":"choice","id":"u-3","unit":"u","prompt":"Pick 3","options":["a","b"],"answer":0}"#;
    let i4 = r#"{"type":"choice","id":"u-4","unit":"u","prompt":"Pick 4","options":["a","b"],"answer":0}"#;
    let i5 = r#"{"type":"choice","id":"u-5","unit":"u","prompt":"Pick 5","options":["a","b"],"answer":0}"#;
    let d = run(&c, &[i1, i2, i3, i4, i5]);
    assert_eq!(codes(&d), vec!["exam_few_unique"]);
}

#[test]
fn exam_few_unique_exactly_20_percent() {
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"},{"id":"e","title":"E","examOnly":true}],"exam":{"passMark":0.5,"sections":[{"title":"s","count":5}]}}"#;
    let exam_item = r#"{"type":"choice","id":"e-1","unit":"e","prompt":"Exam","options":["a","b"],"answer":0}"#;
    let normal_item = CHOICE;
    let d = run(&c, &[exam_item, normal_item, normal_item, normal_item, normal_item]);
    assert!(!codes(&d).contains(&"exam_few_unique"), "should not warn at exactly 20%");
}

#[test]
fn exam_few_unique_19_percent() {
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"},{"id":"e","title":"E","examOnly":true}],"exam":{"passMark":0.5,"sections":[{"title":"s","count":10}]}}"#;
    let exam_item = r#"{"type":"choice","id":"e-1","unit":"e","prompt":"Exam","options":["a","b"],"answer":0}"#;
    let normal_item = CHOICE;
    let items: Vec<&str> = vec![exam_item, normal_item, normal_item, normal_item, normal_item, normal_item, normal_item, normal_item, normal_item, normal_item];
    let d = run(&c, &items);
    assert!(codes(&d).contains(&"exam_few_unique"), "should warn at 10% (need 20% = 2)");
}

#[test]
fn exam_few_unique_retired_exam_only_not_counted() {
    let retired_exam = r#"{"type":"choice","id":"e-1","unit":"e","prompt":"Retired Exam","options":["a","b"],"answer":0,"status":"retired"}"#;
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"},{"id":"e","title":"E","examOnly":true}],"exam":{"passMark":0.5,"sections":[{"title":"s","count":5}]}}"#;
    let d = run(&c, &[retired_exam, CHOICE, CHOICE, CHOICE, CHOICE, CHOICE]);
    assert!(codes(&d).contains(&"exam_few_unique"), "retired examOnly item should not count");
}

#[test]
fn exam_few_unique_in_exams_array() {
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"exams":[{"id":"n1","passMark":0.5,"sections":[{"title":"s","count":5}]}]}"#;
    let d = run(&c, &[CHOICE]);
    assert!(codes(&d).contains(&"exam_few_unique"), "should warn for exams[] too");
}

#[test]
fn duplicate_id_names_first_occurrence() {
    let files = [file("content/a.jsonl", CHOICE), file("content/b.jsonl", &format!("\n{CHOICE}"))];
    let d = validate(COURSE, &files, None);
    let dup = d.iter().find(|d| d.code == "duplicate_id").unwrap();
    assert_eq!((dup.file.as_str(), dup.line), ("content/b.jsonl", 2));
    assert!(dup.message.contains("content/a.jsonl:1"));
}

#[test]
fn bad_ids() {
    for id in ["U-1", "u1", "u-", "-1", "u-1a", "1u-1", "u_x-1", ""] {
        let l = format!(r#"{{"type":"card","id":"{id}","unit":"u","prompt":"p","back":"b"}}"#);
        fires(COURSE, &[&l], "bad_id");
    }
    for id in ["u-1", "geo2-10", "a-0"] {
        let l = format!(r#"{{"type":"card","id":"{id}","unit":"u","prompt":"p","back":"b"}}"#);
        assert_eq!(run(COURSE, &[&l]), vec![]);
    }
}

#[test]
fn unit_and_type_checks() {
    fires(COURSE, &[r#"{"type":"card","id":"u-1","unit":"x","prompt":"p","back":"b"}"#], "unknown_unit");
    let c = with_course(r#""types":["choice"]"#);
    fires(&c, &[r#"{"type":"card","id":"u-1","unit":"u","prompt":"p","back":"b"}"#], "type_not_enabled");
}

#[test]
fn choice_checks() {
    fires(COURSE, &[r#"{"type":"choice","id":"u-1","unit":"u","prompt":" ","options":["a","b"],"answer":0}"#], "empty_prompt");
    fires(COURSE, &[r#"{"type":"choice","id":"u-1","unit":"u","prompt":"p","options":["a"],"answer":0}"#], "choice_few_options");
    fires(COURSE, &[r#"{"type":"choice","id":"u-1","unit":"u","prompt":"p","options":["a","b"],"answer":2}"#], "choice_answer_out_of_range");
    fires(COURSE, &[r#"{"type":"choice","id":"u-1","unit":"u","prompt":"p","options":["Yes","b"," yes "],"answer":0}"#], "choice_duplicate_options");
}

#[test]
fn gap_and_card_checks() {
    fires(COURSE, &[r#"{"type":"gap","id":"u-1","unit":"u","prompt":"p","answers":[]}"#], "gap_no_answers");
    fires(COURSE, &[r#"{"type":"gap","id":"u-1","unit":"u","prompt":"p","answers":["x","  "]}"#], "gap_empty_answer");
    fires(COURSE, &[r#"{"type":"gap","id":"u-1","unit":"u","prompt":"p","answers":["!"],"normalize":{"stripPunctuation":true}}"#], "gap_empty_answer");
    fires(COURSE, &[r#"{"type":"card","id":"u-1","unit":"u","prompt":"p","back":" "}"#], "card_empty_back");
}

#[test]
fn duplicate_prompt_same_type_active_only() {
    let a = r#"{"type":"card","id":"u-1","unit":"u","prompt":"Hello  World","back":"b"}"#;
    let b = r#"{"type":"card","id":"u-2","unit":"u","prompt":"hello world","back":"b"}"#;
    let other_type = r#"{"type":"gap","id":"u-3","unit":"u","prompt":"hello world","answers":["zzz"]}"#;
    let retired = r#"{"type":"card","id":"u-4","unit":"u","prompt":"hello world","back":"b","status":"retired"}"#;
    let d = run(COURSE, &[a, b, other_type, retired]);
    assert_eq!(codes(&d), vec!["duplicate_prompt"]);
    assert_eq!(d[0].line, 2);
}

#[test]
fn answer_in_prompt_cases() {
    fires(COURSE, &[r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Rome is the capital of ___ (Rome)","answers":["ROME"]}"#], "answer_in_prompt");
    fires(COURSE, &[r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Is Paris the capital?","options":["Paris","b"],"answer":0}"#], "answer_in_prompt");
    let short = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"1 + 1 = ___ (12)","answers":["12"]}"#;
    assert_eq!(run(COURSE, &[short]), vec![]);
    let retired = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Rome ___","answers":["Rome"],"status":"retired"}"#;
    assert!(run(COURSE, &[retired]).iter().all(|d| d.code != "answer_in_prompt"));
}

#[test]
fn prompt_too_long_and_unit_empty() {
    let long = format!(r#"{{"type":"card","id":"u-1","unit":"u","prompt":"{}","back":"b"}}"#, "x".repeat(601));
    fires(COURSE, &[&long], "prompt_too_long");
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"},{"id":"w","title":"W"}]}"#;
    let d = run(c, &[CHOICE]);
    assert_eq!(codes(&d), vec!["unit_empty"]);
    assert!(d[0].message.contains("'w'"));
}

#[test]
fn diagnostics_are_ordered_course_then_files_by_line() {
    let c = with_course(r#""srs":{"ladder":[0]}"#);
    let bad = r#"{"type":"card","id":"BAD","unit":"x","prompt":"p","back":"b"}"#;
    let files = [file("content/b.jsonl", &format!("{bad}\nnope")), file("content/a.jsonl", CHOICE)];
    let d = validate(&c, &files, None);
    assert_eq!(d[0].file, "course.json");
    let files_seen: Vec<&str> = d.iter().map(|d| d.file.as_str()).collect();
    assert_eq!(files_seen.first(), Some(&"course.json"));
    assert!(files_seen.iter().all(|f| *f != "content/a.jsonl"));
    let lines: Vec<usize> = d.iter().filter(|d| d.file == "content/b.jsonl").map(|d| d.line).collect();
    assert!(lines.len() >= 2 && lines.windows(2).all(|w| w[0] <= w[1]));
}

#[test]
fn demo_course_is_clean() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/demo");
    let course = std::fs::read_to_string(root.join("course.json")).unwrap();
    let files: Vec<SourceFile> = ["geo", "math"]
        .iter()
        .map(|n| file(&format!("content/{n}.jsonl"), &std::fs::read_to_string(root.join(format!("content/{n}.jsonl"))).unwrap()))
        .collect();
    let diagnostics = validate(&course, &files, None);
    // Check that there are no errors (warnings are OK)
    assert!(!diagnostics.iter().any(|d| d.severity == Severity::Error), "Demo course should have no errors, got {diagnostics:?}");
}

fn items(lines: &[&str]) -> Vec<Item> {
    parse_items(&lines.join("\n")).items.into_iter().map(|(_, i)| i).collect()
}

fn card(id: &str, retired: bool) -> String {
    let status = if retired { r#","status":"retired""# } else { "" };
    format!(r#"{{"type":"card","id":"{id}","unit":"u","prompt":"p {id}","back":"b"{status}}}"#)
}

fn with_cards(mut lock: IdLock, ids: &[&str]) -> IdLock {
    lock.types.extend(ids.iter().map(|i| (i.to_string(), "card".to_string())));
    lock
}

fn lock_of(ids: &[&str], retired: &[&str]) -> IdLock {
    IdLock { v: 1, ids: ids.iter().map(|s| s.to_string()).collect(), retired: retired.iter().map(|s| s.to_string()).collect(), types: BTreeMap::new() }
}

#[test]
fn lock_detects_removed_and_reused_ids() {
    let lock = lock_of(&["u-1", "u-2", "u-3"], &["u-2"]);
    let d = validate(COURSE, &[file("content/u.jsonl", &card("u-1", false)), file("content/v.jsonl", &card("u-2", false))], Some(&lock));
    let lock_codes: Vec<(&str, &str)> = d.iter().map(|d| (d.code, d.file.as_str())).collect();
    assert_eq!(lock_codes, vec![("retired_id_reused", "content/v.jsonl"), ("id_removed", "ids.lock")]);
}

#[test]
fn lock_allows_new_ids_and_retired_items() {
    let lock = lock_of(&["u-1", "u-2"], &["u-2"]);
    let text = format!("{}\n{}\n{}", card("u-1", false), card("u-2", true), card("u-3", false));
    assert_eq!(validate(COURSE, &[file("content/u.jsonl", &text)], Some(&lock)), vec![]);
}

#[test]
fn lock_update_merges_and_is_idempotent() {
    let first = update(None, &items(&[&card("u-2", false), &card("u-1", true)]));
    assert_eq!(first, with_cards(lock_of(&["u-1", "u-2"], &["u-1"]), &["u-1", "u-2"]));
    let second = update(Some(&first), &items(&[&card("u-3", false)]));
    assert_eq!(second, with_cards(lock_of(&["u-1", "u-2", "u-3"], &["u-1"]), &["u-1", "u-2", "u-3"]));
    assert_eq!(update(Some(&second), &items(&[&card("u-3", false)])), second);
}

#[test]
fn lock_update_keeps_retired_in_ids() {
    let lock = lock_of(&["u-1"], &["u-9"]);
    let next = update(Some(&lock), &[]);
    assert_eq!(next, lock_of(&["u-1", "u-9"], &["u-9"]));
}

#[test]
fn parse_lock_normalizes_and_roundtrips() {
    let l = parse_lock(r#"{"v":1,"ids":["b","a","b"],"retired":["b","b"]}"#).unwrap();
    assert_eq!(l, lock_of(&["a", "b"], &["b"]));
    let text = l.to_text();
    assert!(text.ends_with("}\n"));
    assert_eq!(parse_lock(&text).unwrap(), l);
}

#[test]
fn parse_lock_rejects_bad_input() {
    for t in ["", "[]", r#"{"v":2,"ids":[],"retired":[]}"#, r#"{"v":1,"ids":[]}"#, r#"{"v":1,"ids":[],"retired":[],"x":1}"#] {
        assert!(parse_lock(t).is_err(), "{t}");
    }
}

fn has(lines: &[&str], code: &str) -> bool {
    run(COURSE, lines).iter().any(|d| d.code == code)
}

fn item(body: &str) -> String {
    format!(r#"{{"id":"u-1","unit":"u",{body}}}"#)
}

fn multi(options: &str, correct: &str) -> String {
    item(&format!(r#""type":"multi","prompt":"Pick","options":{options},"correct":{correct}"#))
}

fn matching(pairs: &str, distractors: &str) -> String {
    item(&format!(r#""type":"match","prompt":"Link","pairs":{pairs},"distractors":{distractors}"#))
}

fn pairs(n: usize) -> String {
    let p: Vec<String> = (0..n).map(|i| format!(r#"{{"left":"l{i}","right":"r{i}"}}"#)).collect();
    format!("[{}]", p.join(","))
}

fn order(n: usize) -> String {
    let s: Vec<String> = (0..n).map(|i| format!(r#""s{i}""#)).collect();
    item(&format!(r#""type":"order","prompt":"Sort","steps":[{}]"#, s.join(",")))
}

fn order_of(steps: &str) -> String {
    item(&format!(r#""type":"order","prompt":"Sort","steps":{steps}"#))
}

fn cloze(parts: &str) -> String {
    item(&format!(r#""type":"cloze","prompt":"Fill in the blanks","parts":{parts}"#))
}

fn blanks(n: usize) -> String {
    let p: Vec<String> = (0..n).map(|i| format!(r#""t{i} ",["a{i}"]"#)).collect();
    format!("[{}]", p.join(","))
}

fn numeric(extra: &str) -> String {
    item(&format!(r#""type":"numeric","prompt":"How many","answer":3{extra}"#))
}

#[test]
fn multi_few_options() {
    assert!(has(&[&multi(r#"["a","b"]"#, "[0]")], "multi_few_options"));
    assert!(!has(&[&multi(r#"["a","b","c"]"#, "[0]")], "multi_few_options"));
}

#[test]
fn multi_duplicate_options() {
    assert!(has(&[&multi(r#"["a","A ","c"]"#, "[0]")], "multi_duplicate_options"));
    assert!(!has(&[&multi(r#"["a","b","c"]"#, "[0]")], "multi_duplicate_options"));
}

#[test]
fn multi_bad_correct() {
    let opts = r#"["a","b","c"]"#;
    for bad in ["[]", "[0,0]", "[3]", "[0,1,2]"] {
        assert!(has(&[&multi(opts, bad)], "multi_bad_correct"), "{bad}");
    }
    assert!(!has(&[&multi(opts, "[0,2]")], "multi_bad_correct"));
}

#[test]
fn match_pair_count() {
    for n in [1, 9] {
        assert!(has(&[&matching(&pairs(n), "[]")], "match_pair_count"), "{n}");
    }
    for n in [2, 8] {
        assert!(!has(&[&matching(&pairs(n), "[]")], "match_pair_count"), "{n}");
    }
}

#[test]
fn match_duplicate_left_and_right() {
    let dup_left = r#"[{"left":"A","right":"1"},{"left":" a ","right":"2"}]"#;
    assert!(has(&[&matching(dup_left, "[]")], "match_duplicate_left"));
    assert!(!has(&[&matching(&pairs(3), "[]")], "match_duplicate_left"));
    let dup_right = r#"[{"left":"a","right":"1"},{"left":"b","right":"1"}]"#;
    assert!(has(&[&matching(dup_right, "[]")], "match_duplicate_right"));
    assert!(has(&[&matching(&pairs(3), r#"["R0"]"#)], "match_duplicate_right"));
    assert!(!has(&[&matching(&pairs(3), r#"["x"]"#)], "match_duplicate_right"));
}

#[test]
fn order_step_count() {
    for n in [1, 11] {
        assert!(has(&[&order(n)], "order_step_count"), "{n}");
    }
    for n in [2, 10] {
        assert!(!has(&[&order(n)], "order_step_count"), "{n}");
    }
}

#[test]
fn order_duplicate_step() {
    assert!(has(&[&order_of(r#"["Go","go!"," GO "]"#)], "order_duplicate_step"));
    assert!(!has(&[&order_of(r#"["a","b"]"#)], "order_duplicate_step"));
}

#[test]
fn cloze_no_blank() {
    assert!(has(&[&cloze(r#"["just text"]"#)], "cloze_no_blank"));
    assert!(!has(&[&cloze(r#"["x ",["a"]]"#)], "cloze_no_blank"));
}

#[test]
fn cloze_too_many_blanks() {
    assert!(has(&[&cloze(&blanks(11))], "cloze_too_many_blanks"));
    assert!(!has(&[&cloze(&blanks(10))], "cloze_too_many_blanks"));
}

#[test]
fn cloze_empty_alternative() {
    assert!(has(&[&cloze(r#"["x ",["a",""]]"#)], "cloze_empty_alternative"));
    assert!(has(&[&cloze(r#"["x ",[]]"#)], "cloze_empty_alternative"));
    assert!(!has(&[&cloze(r#"["x ",["a","b"]]"#)], "cloze_empty_alternative"));
}

#[test]
fn cloze_empty_parts() {
    assert!(has(&[&cloze(r#"[" ",[""]]"#)], "cloze_empty_parts"));
    assert!(has(&[&cloze("[]")], "cloze_empty_parts"));
    assert!(!has(&[&cloze(r#"[" ",["a"]]"#)], "cloze_empty_parts"));
    assert!(!has(&[&cloze(r#"["x",[""]]"#)], "cloze_empty_parts"));
}

#[test]
fn numeric_bad_answer() {
    let bad = item(r#""type":"numeric","prompt":"p","answer":1e999"#);
    let d = run(COURSE, &[&bad]);
    assert!(d.iter().any(|d| d.code == "numeric_bad_answer" || d.code == "parse_error"), "{d:?}");
    assert!(!has(&[&numeric("")], "numeric_bad_answer"));
}

#[test]
fn numeric_bad_tolerance() {
    assert!(has(&[&numeric(r#","tolerance":-0.5"#)], "numeric_bad_tolerance"));
    assert!(!has(&[&numeric(r#","tolerance":0.5"#)], "numeric_bad_tolerance"));
    assert!(!has(&[&numeric("")], "numeric_bad_tolerance"));
}

#[test]
fn cloze_many_blanks_warns_above_five() {
    assert!(has(&[&cloze(&blanks(6))], "cloze_many_blanks"));
    assert!(!has(&[&cloze(&blanks(5))], "cloze_many_blanks"));
    let d = run(COURSE, &[&cloze(&blanks(6))]);
    assert_eq!(d[0].severity, Severity::Warning);
}

#[test]
fn match_many_pairs_warns_above_six() {
    assert!(has(&[&matching(&pairs(7), "[]")], "match_many_pairs"));
    assert!(!has(&[&matching(&pairs(6), "[]")], "match_many_pairs"));
}

#[test]
fn order_many_steps_warns_above_seven() {
    assert!(has(&[&order(8)], "order_many_steps"));
    assert!(!has(&[&order(7)], "order_many_steps"));
}

#[test]
fn empty_prompt_for_every_type() {
    let blank = |t: &str, rest: &str| format!(r#"{{"type":"{t}","id":"u-1","unit":"u","prompt":" ",{rest}}}"#);
    let all = [
        blank("choice", r#""options":["a","b"],"answer":0"#),
        blank("gap", r#""answers":["a"]"#),
        blank("card", r#""back":"b""#),
        blank("multi", r#""options":["a","b","c"],"correct":[0]"#),
        blank("match", &format!(r#""pairs":{}"#, pairs(2))),
        blank("order", r#""steps":["a","b"]"#),
        blank("cloze", r#""parts":["x",["a"]]"#),
        blank("numeric", r#""answer":1"#),
    ];
    for line in &all {
        assert!(has(&[line], "empty_prompt"), "{line}");
    }
    assert!(!has(&[&numeric("")], "empty_prompt"));
}

#[test]
fn duplicate_prompt_is_keyed_on_prompt_and_body() {
    let a = item(r#""type":"cloze","prompt":"Fill in the blanks","parts":["x ",["a"]]"#);
    let b = a.replace("u-1", "u-2").replace(r#""x ""#, r#""y ""#);
    assert!(!has(&[&a, &b], "duplicate_prompt"));
    let same = a.replace("u-1", "u-2");
    assert!(has(&[&a, &same], "duplicate_prompt"));
    let n1 = numeric("");
    let n2 = numeric("").replace("u-1", "u-2").replace(r#""answer":3"#, r#""answer":4"#);
    assert!(!has(&[&n1, &n2], "duplicate_prompt"));
    let o1 = order_of(r#"["ab","c"]"#);
    let o2 = order_of(r#"["a","bc"]"#).replace("u-1", "u-2");
    assert!(!has(&[&o1, &o2], "duplicate_prompt"));
    let c1 = CHOICE.to_string();
    let c2 = CHOICE.replace("u-1", "u-2");
    assert!(has(&[&c1, &c2], "duplicate_prompt"));
}

#[test]
fn exam_sections_accept_new_types_and_reject_card() {
    let ok = with_course(r#""exam":{"passMark":0.5,"sections":[{"title":"S","count":1,"types":["multi","match","order","cloze","numeric","choice","gap"]}]}"#);
    assert!(!run(&ok, &[CHOICE]).iter().any(|d| d.code == "bad_exam_section"));
    let card = with_course(r#""exam":{"passMark":0.5,"sections":[{"title":"S","count":1,"types":["card"]}]}"#);
    let d = run(&card, &[CHOICE]);
    let e = d.iter().find(|d| d.code == "bad_exam_section").expect("card rejected");
    assert!(e.message.contains("self-rated"), "{}", e.message);
    let unknown = with_course(r#""exam":{"passMark":0.5,"sections":[{"title":"S","count":1,"types":["nope"]}]}"#);
    fires(&unknown, &[CHOICE], "bad_exam_section");
}

#[test]
fn exam_section_with_disabled_type_is_rejected() {
    let c = with_course(r#""types":["choice"],"exam":{"passMark":0.5,"sections":[{"title":"S","count":1,"types":["multi"]}]}"#);
    let d = run(&c, &[CHOICE]);
    let e = d.iter().find(|d| d.code == "bad_exam_section").expect("disabled rejected");
    assert!(e.message.contains("not enabled"), "{}", e.message);
    let c = with_course(r#""types":["choice","multi"],"exam":{"passMark":0.5,"sections":[{"title":"S","count":1,"types":["multi"]}]}"#);
    assert!(!run(&c, &[CHOICE]).iter().any(|d| d.code == "bad_exam_section"));
}

#[test]
fn type_not_enabled_and_srs_by_type_cover_all_types() {
    let cfg = r#"{"ladder":[0,1]}"#;
    for t in ["choice", "gap", "card", "multi", "match", "order", "cloze", "numeric"] {
        let c = with_course(&format!(r#""srsByType":{{"{t}":{cfg}}}"#));
        assert!(!run(&c, &[CHOICE]).iter().any(|d| d.code == "srs_by_type_unknown"), "{t}");
    }
    let c = with_course(&format!(r#""srsByType":{{"nope":{cfg}}}"#));
    fires(&c, &[CHOICE], "srs_by_type_unknown");
    let c = with_course(r#""types":["choice","gap","card","multi","match","order","cloze","numeric"]"#);
    assert!(!run(&c, &[&multi(r#"["a","b","c"]"#, "[0]")]).iter().any(|d| d.code == "type_not_enabled"));
    let c = with_course(r#""types":["choice"]"#);
    fires(&c, &[&multi(r#"["a","b","c"]"#, "[0]")], "type_not_enabled");
}

#[test]
fn lock_types_parse_old_files_and_omit_when_empty() {
    let old = parse_lock(r#"{"v":1,"ids":["a"],"retired":[]}"#).unwrap();
    assert!(old.types.is_empty());
    assert!(!old.to_text().contains("types"));
    let l = parse_lock(r#"{"v":1,"ids":["a"],"retired":[],"types":{"a":"card"}}"#).unwrap();
    assert_eq!(l.types.get("a").map(String::as_str), Some("card"));
    assert_eq!(parse_lock(&l.to_text()).unwrap(), l);
}

#[test]
fn lock_update_records_types_and_keeps_old_entries() {
    let mut lock = lock_of(&["u-9"], &[]);
    lock.types.insert("u-9".into(), "gap".into());
    let next = update(Some(&lock), &items(&[&card("u-1", false), &multi(r#"["a","b","c"]"#, "[0]").replace("u-1", "u-2")]));
    let got: Vec<(&str, &str)> = next.types.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
    assert_eq!(got, vec![("u-1", "card"), ("u-2", "multi"), ("u-9", "gap")]);
}

#[test]
fn item_type_changed_warns_at_item_line() {
    let mut lock = lock_of(&["u-1"], &[]);
    lock.types.insert("u-1".into(), "gap".into());
    let f = [file("content/u.jsonl", &format!("{}\n{}", card("u-2", false), card("u-1", false)))];
    let d = validate(COURSE, &f, Some(&lock));
    let w = d.iter().find(|d| d.code == "item_type_changed").expect("warns");
    assert_eq!((w.severity, w.file.as_str(), w.line), (Severity::Warning, "content/u.jsonl", 2));
}

#[test]
fn item_type_unchanged_or_unrecorded_is_silent() {
    let mut lock = lock_of(&["u-1", "u-2"], &[]);
    lock.types.insert("u-1".into(), "card".into());
    let f = [file("content/u.jsonl", &format!("{}\n{}", card("u-1", false), card("u-2", false)))];
    assert_eq!(validate(COURSE, &f, Some(&lock)), vec![]);
}

#[test]
fn plugin_paths_must_stay_inside_the_course_folder() {
    for bad in ["../x.js", "a/../../x.js", "/etc/x.js", "C:/x.js", "a\\..\\x.js"] {
        let course = with_course(&format!(r#""plugins":{{"scripts":["{}"]}}"#, bad.replace('\\', "\\\\")));
        fires(&course, &[CHOICE], "bad_plugin_path");
        let course = with_course(&format!(r#""plugins":{{"styles":["{}"]}}"#, bad.replace('\\', "\\\\")));
        fires(&course, &[CHOICE], "bad_plugin_path");
    }
    let ok = with_course(r#""plugins":{"scripts":["plugins/a..b.js"],"styles":["plugins/p.css"]},"markup":"m""#);
    assert_eq!(run(&ok, &[CHOICE]), vec![]);
}

#[test]
fn item_meta_is_accepted_and_opaque() {
    let item = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["a","b"],"answer":0,"meta":{"on":["x"],"n":1}}"#;
    assert_eq!(run(COURSE, &[item]), vec![]);
}

const GAP_FOLD: &str = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"p","answers":["a"],"normalize":{"fold":FOLD}}"#;

fn gap_fold(fold: &str) -> String {
    GAP_FOLD.replace("FOLD", fold)
}

#[test]
fn bad_fold_empty_from_in_item() {
    fires(COURSE, &[&gap_fold(r#"[["","x"]]"#)], "bad_fold");
}

#[test]
fn bad_fold_range_length_mismatch_in_item() {
    fires(COURSE, &[&gap_fold(r#"[["A-Z","a-y"]]"#)], "bad_fold");
}

#[test]
fn bad_fold_in_cloze_item() {
    let l = r#"{"type":"cloze","id":"u-1","unit":"u","prompt":"p","parts":["a ",["b"]],"normalize":{"fold":[["ab","c"]]}}"#;
    fires(COURSE, &[l], "bad_fold");
}

#[test]
fn bad_fold_at_course_level() {
    let course = with_course(r#""normalize":{"fold":[["","x"]]}"#);
    fires(&course, &[CHOICE], "bad_fold");
}

#[test]
fn valid_fold_has_no_bad_fold() {
    let d = run(COURSE, &[&gap_fold(r#"[["A-Z","a-z"],["ё","е"],["。",""]]"#)]);
    assert!(!d.iter().any(|d| d.code == "bad_fold"), "{d:?}");
}

#[test]
fn fold_too_large_in_item() {
    let long = "a".repeat(17);
    fires(COURSE, &[&gap_fold(&format!(r#"[["b","{long}"]]"#))], "fold_too_large");
}

#[test]
fn fold_target_limit_counts_chars_not_bytes() {
    let ok = "あ".repeat(16);
    let d = run(COURSE, &[&gap_fold(&format!(r#"[["b","{ok}"]]"#))]);
    assert!(!d.iter().any(|d| d.code == "fold_too_large"), "{d:?}");
    let long = "あ".repeat(17);
    fires(COURSE, &[&gap_fold(&format!(r#"[["b","{long}"]]"#))], "fold_too_large");
}

#[test]
fn fold_too_many_pairs_in_item() {
    let pairs = (0..257).map(|i| format!(r#"["a{i}","b{i}"]"#)).collect::<Vec<_>>().join(",");
    fires(COURSE, &[&gap_fold(&format!("[{pairs}]"))], "fold_too_large");
}

#[test]
fn non_pair_fold_entry_is_parse_error() {
    fires(COURSE, &[&gap_fold(r#"[["a"]]"#)], "parse_error");
}

#[test]
fn normalize_without_fold_keeps_default_duplicate_and_leak_verdict() {
    let a = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Cat!","answers":["x"],"normalize":{"caseSensitive":true,"stripPunctuation":true}}"#;
    let b = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"cat","answers":["x"],"normalize":{"caseSensitive":true,"stripPunctuation":true}}"#;
    let d = run(COURSE, &[a, b]);
    assert!(!d.iter().any(|d| d.code == "duplicate_prompt"), "{d:?}");
    let cl = r#"{"type":"cloze","id":"u-3","unit":"u","prompt":"the cat sat","parts":["a ",["cat"]]}"#;
    let d = run(COURSE, &[cl]);
    assert!(!d.iter().any(|d| d.code == "answer_in_prompt"), "{d:?}");
    let g = r#"{"type":"gap","id":"u-4","unit":"u","prompt":"Cat!","answers":["cat"],"normalize":{"stripPunctuation":true}}"#;
    let d = run(COURSE, &[g]);
    assert!(d.iter().any(|d| d.code == "answer_in_prompt"), "{d:?}");
}

#[test]
fn course_normalize_is_fallback_for_duplicate_prompt_check() {
    let course = with_course(r#""normalize":{"fold":[["ё","е"]]}"#);
    let a = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"ёлка","answers":["a"]}"#;
    let b = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"елка","answers":["a"]}"#;
    fires(&course, &[a, b], "duplicate_prompt");
    let d = run(COURSE, &[a, b]);
    assert!(!d.iter().any(|d| d.code == "duplicate_prompt"), "{d:?}");
}

fn exam_course(exam_json: &str) -> String {
    with_course(&format!(r#""exams":[{exam_json}]"#))
}

const SECS: &str = r#""passMark":0.5,"sections":[{"title":"a","count":1},{"title":"b","count":1}]"#;

const SECS_NO_PM: &str = r#""sections":[{"title":"a","count":1},{"title":"b","count":1}]"#;

fn exam_codes(course: &str) -> Vec<&'static str> {
    codes(&run(course, &[CHOICE]))
}

#[test]
fn valid_exams_array_is_clean() {
    let c = exam_course(&format!(
        r#"{{"id":"n1","title":"N1",{SECS_NO_PM},"timing":[{{"sections":["a","b"],"minutes":10}}],"scoring":[{{"title":"P","sections":["a"],"points":60,"minPoints":19}},{{"title":"Q","sections":["b"],"points":60}}],"passPoints":80,"note":"x"}}"#
    ));
    let d = run(&c, &[CHOICE]);
    assert_eq!(codes(&d), vec!["exam_few_unique", "exam_few_unique"]);
}

#[test]
fn exams_entry_without_id_is_bad_id() {
    assert_eq!(exam_codes(&exam_course(&format!("{{{SECS}}}"))), vec!["bad_id", "exam_few_unique", "exam_few_unique"]);
}

#[test]
fn exams_bad_id_charset() {
    assert!(exam_codes(&exam_course(&format!(r#"{{"id":"Bad Id",{SECS}}}"#))).contains(&"bad_id"));
}

#[test]
fn exams_duplicate_id_and_legacy_collision() {
    let dup = exam_course(&format!(r#"{{"id":"x",{SECS}}},{{"id":"x",{SECS}}}"#));
    assert_eq!(exam_codes(&dup), vec!["bad_exam", "exam_few_unique", "exam_few_unique", "exam_few_unique", "exam_few_unique"]);
    let c = with_course(&format!(r#""exam":{{{SECS}}},"exams":[{{"id":"default",{SECS}}}]"#));
    assert_eq!(exam_codes(&c), vec!["bad_exam", "exam_few_unique", "exam_few_unique", "exam_few_unique", "exam_few_unique"]);
    let c = with_course(&format!(r#""exam":{{{SECS}}},"exams":[{{"id":"other",{SECS}}}]"#));
    let d = run(&c, &[CHOICE]);
    assert_eq!(codes(&d), vec!["exam_few_unique", "exam_few_unique", "exam_few_unique", "exam_few_unique"]);
}

#[test]
fn legacy_exam_with_foreign_id_is_bad_exam() {
    let c = with_course(&format!(r#""exam":{{"id":"zzz",{SECS}}}"#));
    assert_eq!(exam_codes(&c), vec!["bad_exam", "exam_few_unique", "exam_few_unique"]);
}

#[test]
fn unknown_section_in_timing_and_scoring() {
    let t = exam_course(&format!(r#"{{"id":"x",{SECS},"timing":[{{"sections":["zz"],"minutes":5}}]}}"#));
    assert_eq!(exam_codes(&t), vec!["unknown_section", "exam_few_unique", "exam_few_unique"]);
    let s = exam_course(&format!(r#"{{"id":"x",{SECS_NO_PM},"scoring":[{{"title":"P","sections":["zz"],"points":5}}]}}"#));
    assert_eq!(exam_codes(&s), vec!["unknown_section", "exam_few_unique", "exam_few_unique"]);
}

#[test]
fn bad_exam_variants() {
    for extra in [
        r#""timing":[{"sections":["a"],"minutes":0}]"#,
        r#""timing":[]"#,
        r#""timing":[{"sections":[],"minutes":5}]"#,
        r#""timing":[{"sections":["a"],"minutes":5},{"sections":["a","b"],"minutes":5}]"#,
        r#""scoring":[{"title":"P","sections":["a"],"points":0}]"#,
        r#""scoring":[{"title":"P","sections":["a"],"points":10,"minPoints":11}]"#,
        r#""scoring":[{"title":"P","sections":[],"points":10}]"#,
        r#""scoring":[{"title":"P","sections":["a"],"points":10},{"title":"Q","sections":["a"],"points":10}]"#,
        r#""passPoints":-1"#,
    ] {
        let c = exam_course(&format!(r#"{{"id":"x",{SECS},{extra}}}"#));
        assert!(exam_codes(&c).contains(&"bad_exam"), "{extra}");
    }
}

#[test]
fn duplicate_section_titles_referenced_are_bad_exam() {
    let dup = r#""sections":[{"title":"a","count":1},{"title":"a","count":1}]"#;
    let c = exam_course(&format!(r#"{{"id":"x",{dup},"scoring":[{{"title":"P","sections":["a"],"points":10}}]}}"#));
    assert_eq!(exam_codes(&c), vec!["bad_exam", "exam_few_unique", "exam_few_unique"]);
    let unreferenced = exam_course(&format!(r#"{{"id":"x","passMark":0.5,{dup}}}"#));
    let d = run(&unreferenced, &[CHOICE]);
    assert_eq!(codes(&d), vec!["exam_few_unique", "exam_few_unique"]);
}

#[test]
fn exam_checks_run_for_every_exam() {
    let c = exam_course(&format!(
        r#"{{"id":"x",{SECS}}},{{"id":"y","passMark":2,"sections":[{{"title":"a","count":0}}]}}"#
    ));
    let d = exam_codes(&c);
    assert!(d.contains(&"bad_pass_mark") && d.contains(&"bad_exam_section"), "{d:?}");
}

#[test]
fn exam_messages_name_the_exam() {
    let c = exam_course(&format!(r#"{{"id":"n1",{SECS},"timing":[{{"sections":["zz"],"minutes":5}}]}}"#));
    assert!(run(&c, &[CHOICE]).iter().any(|d| d.message.contains("'n1'")));
}

#[test]
fn timing_groups_non_consecutive_sections() {
    // exam has sections ["a", "b", "c"], timing group has ["a", "c"] which skips "b"
    let c = exam_course(r#"{"id":"x","passMark":0.5,"sections":[{"title":"a","count":1},{"title":"b","count":1},{"title":"c","count":1}],"timing":[{"sections":["a","c"],"minutes":5}]}"#);
    assert!(exam_codes(&c).contains(&"bad_exam"));
}

#[test]
fn timing_groups_overlapping() {
    // exam has sections ["a", "b", "c"], timing groups are [a,c] and [b] - ranges [0,2] and [1,1] overlap
    let c = exam_course(r#"{"id":"x","passMark":0.5,"sections":[{"title":"a","count":1},{"title":"b","count":1},{"title":"c","count":1}],"timing":[{"sections":["a","c"],"minutes":5},{"sections":["b"],"minutes":5}]}"#);
    assert!(exam_codes(&c).contains(&"bad_exam"));
}

#[test]
fn timing_groups_consecutive_is_ok() {
    let c = exam_course(&format!(r#"{{"id":"x",{SECS},"timing":[{{"sections":["a","b"],"minutes":5}},{{"sections":["c"],"minutes":5}}]}}"#));
    assert!(!exam_codes(&c).contains(&"bad_exam"));
}

#[test]
fn stimulus_group_split_different_unit() {
    const STIM: &str = r#"{"id":"u-1","unit":"u","type":"gap","prompt":"P","answers":["a"],"stimulus":"s1"}"#;
    const STIM2: &str = r#"{"id":"u-2","unit":"v","type":"gap","prompt":"P","answers":["a"],"stimulus":"s1"}"#;
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"},{"id":"v","title":"V"}]}"#;
    let d = run(&c, &[STIM, STIM2]);
    assert!(d.iter().any(|d| d.code == "stimulus_group_split"));
}

#[test]
fn stimulus_group_split_different_type() {
    const STIM: &str = r#"{"id":"u-1","unit":"u","type":"gap","prompt":"P","answers":["a"],"stimulus":"s1"}"#;
    const STIM2: &str = r#"{"id":"u-2","unit":"u","type":"choice","prompt":"P","options":["a","b"],"answer":0,"stimulus":"s1"}"#;
    let d = run(COURSE, &[STIM, STIM2]);
    assert!(d.iter().any(|d| d.code == "stimulus_group_split"));
}

#[test]
fn stimulus_group_split_with_card() {
    const STIM: &str = r#"{"id":"u-1","unit":"u","type":"gap","prompt":"P","answers":["a"],"stimulus":"s1"}"#;
    const STIM2: &str = r#"{"id":"u-2","unit":"u","type":"card","prompt":"F","back":"B","stimulus":"s1"}"#;
    let d = run(COURSE, &[STIM, STIM2]);
    assert!(d.iter().any(|d| d.code == "stimulus_group_split"));
}

#[test]
fn stimulus_group_split_same_properties_is_ok() {
    const STIM: &str = r#"{"id":"u-1","unit":"u","type":"gap","prompt":"P","answers":["a"],"stimulus":"s1","tags":["t"]}"#;
    const STIM2: &str = r#"{"id":"u-2","unit":"u","type":"gap","prompt":"Q","answers":["b"],"stimulus":"s1","tags":["t"]}"#;
    let d = run(COURSE, &[STIM, STIM2]);
    assert!(!d.iter().any(|d| d.code == "stimulus_group_split"));
}

#[test]
fn stimulus_group_same_choice_items_with_reordered_tags_is_ok() {
    const A: &str = r#"{"id":"u-1","unit":"u","type":"choice","prompt":"P","options":["a","b"],"answer":0,"stimulus":"s1","tags":["a","b"]}"#;
    const B: &str = r#"{"id":"u-2","unit":"u","type":"choice","prompt":"Q","options":["a","b"],"answer":1,"stimulus":"s1","tags":["b","a"]}"#;
    let d = run(COURSE, &[A, B]);
    assert!(!d.iter().any(|d| d.code == "stimulus_group_split"));
}

#[test]
fn stimulus_group_split_different_tags() {
    const A: &str = r#"{"id":"u-1","unit":"u","type":"choice","prompt":"P","options":["a","b"],"answer":0,"stimulus":"s1","tags":["a"]}"#;
    const B: &str = r#"{"id":"u-2","unit":"u","type":"choice","prompt":"Q","options":["a","b"],"answer":1,"stimulus":"s1","tags":["b"]}"#;
    let d = run(COURSE, &[A, B]);
    assert!(d.iter().any(|d| d.code == "stimulus_group_split"));
}

fn gap_retry(fold: &str, answers: &str, retry: &str) -> String {
    format!(r#"{{"type":"gap","id":"u-1","unit":"u","prompt":"p","answers":{answers},"retry":{retry}{fold}}}"#)
}

#[test]
fn bad_retry_equal_to_answer_after_normalization() {
    fires(COURSE, &[&gap_retry("", r#"["Paris"]"#, r#"["  paris "]"#)], "bad_retry");
}

#[test]
fn bad_retry_equal_after_fold() {
    let l = gap_retry(r#","normalize":{"fold":[["ё","е"]]}"#, r#"["елка"]"#, r#"["Ёлка"]"#);
    fires(COURSE, &[&l], "bad_retry");
}

#[test]
fn distinct_retry_has_no_bad_retry() {
    let d = run(COURSE, &[&gap_retry("", r#"["Paris"]"#, r#"["Pariz"]"#)]);
    assert!(!d.iter().any(|d| d.code == "bad_retry"), "{d:?}");
}

#[test]
fn retry_on_non_gap_item_is_parse_error() {
    let l = r#"{"type":"card","id":"u-1","unit":"u","prompt":"p","back":"b","retry":["x"]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "parse_error"), "{d:?}");
    assert!(!d.iter().any(|d| d.code == "bad_retry"), "{d:?}");
}

fn unit_course(unit_extra: &str) -> String {
    format!(r#"{{"id":"c","title":"C","uiLanguage":"en","units":[{{"id":"u","title":"U"{unit_extra}}}]}}"#)
}

#[test]
fn bad_unit_settings() {
    for extra in [
        r#","newPerDay":-1"#,
        r#","srs":{"ladder":[]}"#,
        r#","srs":{"ladder":[0]}"#,
        r#","srs":{"ladder":[1,2]}"#,
        r#","srs":{"ladder":[0,-1]}"#,
        r#","srs":{"ladder":[0,5,3]}"#,
    ] {
        fires(&unit_course(extra), &[CHOICE], "bad_unit_settings");
    }
    for extra in [r#","newPerDay":0"#, r#","newPerDay":3,"srs":{"ladder":[0,5,5]}"#, r#","srs":{}"#] {
        assert_eq!(run(&unit_course(extra), &[CHOICE]), vec![], "{extra}");
    }
    fires(&unit_course(r#","bogus":1"#), &[CHOICE], "parse_error");
}

// ============ NEW TESTS FOR CONTENT-QUALITY VALIDATORS ============

#[test]
fn foreign_script_warns_on_arabic_in_prompt() {
    // Arabic character "اط" in a Japanese prompt
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"What is this اط?","options":["A","B"],"answer":0}"#;
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;
    let d = run(c, &[l]);
    assert!(d.iter().any(|d| d.code == "foreign_script"), "Expected foreign_script warning, got {d:?}");
    assert_eq!(d[0].severity, Severity::Warning);
}

#[test]
fn foreign_script_whitelisted_via_course_scripts() {
    // Arabic in prompt but Arabic is whitelisted
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"What is this اط?","options":["A","B"],"answer":0}"#;
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"scripts":["Arabic"]}"#;
    let d = run(c, &[l]);
    assert!(!d.iter().any(|d| d.code == "foreign_script"), "Should not warn when Arabic is whitelisted, got {d:?}");
}

#[test]
fn foreign_script_warns_on_hebrew_in_option() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["א","B"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "foreign_script"));
}

#[test]
fn foreign_script_warns_on_thai_in_answer() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Write in Thai","answers":["สวัสดี"]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "foreign_script"));
}

#[test]
fn foreign_script_allows_latin_extended() {
    // Latin extended characters should be allowed
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Café au lait","answers":["French"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "foreign_script"), "Latin extended should be allowed, got {d:?}");
}

#[test]
fn foreign_script_allows_cyrillic() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Привет","options":["Да","Нет"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "foreign_script"), "Cyrillic should be allowed, got {d:?}");
}

#[test]
fn foreign_script_allows_hiragana() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"こんにちは","options":["はい","いいえ"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "foreign_script"), "Hiragana should be allowed, got {d:?}");
}

#[test]
fn foreign_script_allows_katakana() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"コンピュータ","options":["はい","いいえ"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "foreign_script"), "Katakana should be allowed, got {d:?}");
}

#[test]
fn foreign_script_allows_cjk() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"你好","options":["是","否"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "foreign_script"), "CJK should be allowed, got {d:?}");
}

#[test]
fn prompt_type_mismatch_write_on_choice() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Please write the answer","options":["A","B"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn prompt_type_mismatch_type_on_choice() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Please type the answer","options":["A","B"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn prompt_type_mismatch_na_pisite_on_choice() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"напишите ответ","options":["A","B"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn prompt_type_mismatch_choose_on_gap() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Please choose the answer","answers":["A"]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn prompt_type_mismatch_pick_on_gap() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Please pick the answer","answers":["A"]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn prompt_type_mismatch_vyberite_on_gap() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"выберите ответ","answers":["A"]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn prompt_type_mismatch_no_warning_on_gap_write() {
    // gap items can ask to write
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Please write the answer","answers":["A"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn prompt_type_mismatch_no_warning_on_choice_choose() {
    // choice items can ask to choose
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Please choose the correct answer","options":["A","B"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn ambiguous_answer_gap_multiple_without_hint() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Как читается 一?","answers":["いち","ひと"]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_gap_ascii_spelling_variants_not_flagged() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"A square has ___ sides.","answers":["4","four"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_gap_multiple_with_digit_hint() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"What are the 2 capitals?","answers":["Paris","Roma"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_gap_multiple_with_any_hint() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"What is any capital?","answers":["Paris","Roma"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_gap_multiple_with_one_of_hint() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"What is one of the capitals?","answers":["Paris","Roma"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_gap_multiple_with_lyuboy_hint() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Назовите любой столицу","answers":["Paris","Roma"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_gap_multiple_with_ili_hint() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Paris или Roma?","answers":["Paris","Roma"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_option_with_slash() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["Yes","No / Maybe","Yes"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_option_with_space_slash_space() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["Yes","No / Maybe","Yes"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_multi_option_with_slash() {
    let l = r#"{"type":"multi","id":"u-1","unit":"u","prompt":"Select all","options":["A","B / C","D"],"correct":[0,1,2]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

// New tests for slash outside brackets detection

#[test]
fn ambiguous_answer_choice_slash_inside_ascii_parens() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["до (места/времени)"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_slash_inside_fullwidth_parens() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["до（места/времени）"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_slash_inside_fullwidth_parens_japanese() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["食べる（たべる/くう）"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_no_space_slash() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["двоюродный брат/сестра"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    let ambig_count = d.iter().filter(|d| d.code == "ambiguous_answer").count();
    assert_eq!(ambig_count, 1);
    let msg = &d.iter().find(|d| d.code == "ambiguous_answer").unwrap().message;
    assert!(msg.contains("split into separate options"));
}

#[test]
fn ambiguous_answer_choice_slash_outside_and_inside_parens() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["брат/сестра (о людях/днях)"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    let ambig_count = d.iter().filter(|d| d.code == "ambiguous_answer").count();
    assert_eq!(ambig_count, 1);
}

#[test]
fn ambiguous_answer_choice_slash_after_closed_parens() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["(a) x/y"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_slash_before_parens() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["x/y (a)"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_nested_parens_no_warning() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["a (b (c/d) e/f)"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_nested_parens_slash_inside_no_warning() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["a (b (c) d/e) f"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_slash_after_fullwidth_closer() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["до（а） x/y"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_fullwidth_slash() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["брат／сестра"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_unbalanced_opener() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["a (b/c"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_stray_closer() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["a) b/c"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_multi_slash_inside_parens() {
    let l = r#"{"type":"multi","id":"u-1","unit":"u","prompt":"Select","options":["до (места/времени)"],"correct":[0]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_multi_slash_outside() {
    let l = r#"{"type":"multi","id":"u-1","unit":"u","prompt":"Select","options":["братья/сёстры"],"correct":[0]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_duplicate_after_normalization() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["Paris","paris"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_multi_duplicate_after_normalization() {
    let l = r#"{"type":"multi","id":"u-1","unit":"u","prompt":"Select","options":["A","a","B"],"correct":[0,1]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn order_blanks_mismatch_count_differs() {
    let l = r#"{"type":"order","id":"u-1","unit":"u","prompt":"Steps: ___ and ___ and ___","steps":["First","Second"]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "order_blanks_mismatch"));
}

#[test]
fn order_blanks_mismatch_steps_more_than_blanks() {
    let l = r#"{"type":"order","id":"u-1","unit":"u","prompt":"Steps: ___ and ___","steps":["First","Second","Third"]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "order_blanks_mismatch"));
}

#[test]
fn order_blanks_mismatch_no_blanks() {
    // No blanks in prompt, so no warning
    let l = r#"{"type":"order","id":"u-1","unit":"u","prompt":"Order these steps","steps":["First","Second"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "order_blanks_mismatch"));
}

#[test]
fn order_blanks_mismatch_matching_counts() {
    let l = r#"{"type":"order","id":"u-1","unit":"u","prompt":"Steps: ___ and ___","steps":["First","Second"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "order_blanks_mismatch"));
}

#[test]
fn learned_stage_parses() {
    let course = with_course(r#""learnedStage":4"#);
    let d = run(&course, &[CHOICE]);
    assert_eq!(d.len(), 0, "learnedStage=4 should be valid");
}

#[test]
fn bad_learned_stage_zero() {
    let course = with_course(r#""learnedStage":0"#);
    fires(&course, &[CHOICE], "bad_learned_stage");
}

#[test]
fn bad_learned_stage_negative() {
    let course = with_course(r#""learnedStage":-1"#);
    fires(&course, &[CHOICE], "bad_learned_stage");
}

#[test]
fn learned_stage_missing_is_ok() {
    let d = run(COURSE, &[CHOICE]);
    assert!(!d.iter().any(|d| d.code == "bad_learned_stage"));
}

#[test]
fn group_with_unknown_unit_is_an_error() {
    let course = with_course(r#""groups":[{"id":"g","title":"G","units":["nope"]}]"#);
    let d = run(&course, &[CHOICE]);
    assert!(d.iter().any(|d| d.code == "unknown_unit_in_group" && d.severity == Severity::Error), "{d:?}");
    let ok = with_course(r#""groups":[{"id":"g","title":"G","units":["u"]}]"#);
    assert_eq!(run(&ok, &[CHOICE]), vec![]);
}

#[test]
fn unit_new_per_day_inside_group_warns() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U","newPerDay":3}],"groups":[{"id":"g","title":"G","units":["u"]}]}"#;
    let d = run(course, &[CHOICE]);
    assert!(d.iter().any(|d| d.code == "unit_cap_in_group" && d.severity == Severity::Warning), "{d:?}");
}

#[test]
fn scope_by_type() {
    fires(&with_course(r#""srsByType":{"choice":{"scope":"entity"}}"#), &[CHOICE], "scope_by_type");
    fires(&with_course(r#""srsByType":{"choice":{"drill":2}}"#), &[CHOICE], "scope_by_type");
}

#[test]
fn bad_drill() {
    for drill in [0, 6] {
        fires(&with_course(&format!(r#""srs":{{"scope":"entity","drill":{drill}}}"#)), &[CHOICE], "bad_drill");
    }
    let d = run(&with_course(r#""srs":{"scope":"entity","drill":5}"#), &[CHOICE]);
    assert!(!codes(&d).contains(&"bad_drill"), "{d:?}");
}

#[test]
fn mixed_entity_scope() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U","srs":{"scope":"entity"}},{"id":"v","title":"V"}]}"#;
    let a = r#"{"type":"choice","id":"u-1","unit":"u","entity":"e","prompt":"Pick","options":["a","b"],"answer":0}"#;
    let b = r#"{"type":"choice","id":"v-1","unit":"v","entity":"e","prompt":"Pick two","options":["a","b"],"answer":0}"#;
    let d = validate(course, &[file("content/u.jsonl", a), file("content/v.jsonl", b)], None);
    assert!(codes(&d).contains(&"mixed_entity_scope"), "{d:?}");
    let ok = r#"{"type":"choice","id":"v-1","unit":"v","entity":"f","prompt":"Pick two","options":["a","b"],"answer":0}"#;
    let d = validate(course, &[file("content/u.jsonl", a), file("content/v.jsonl", ok)], None);
    assert!(!codes(&d).contains(&"mixed_entity_scope"), "{d:?}");
}

#[test]
fn unknown_detail_type_is_an_error() {
    fires(&with_course(r#""detail":{"fields":[{"key":"meta.a","type":"table"}]}"#), &[CHOICE], "unknown_detail_type");
}

#[test]
fn known_detail_types_pass() {
    let c = with_course(r#""detail":{"fields":[{"key":"meta.a","type":"objects","fields":[{"key":"x","type":"list"}]},{"key":"meta.b"}]}"#);
    let d = run(&c, &[CHOICE]);
    assert!(!d.iter().any(|d| d.code.contains("detail")), "{d:?}");
}

#[test]
fn bad_pass_rule_points_without_scoring() {
    let c = exam_course(r#"{"id":"x","passMark":0.5,"sections":[{"title":"s","count":1}],"pass":{"mode":"points"}}"#);
    fires(&c, &[CHOICE], "bad_pass_rule");
    let c_ok = exam_course(r#"{"id":"x","passMark":0.5,"sections":[{"title":"s","count":1}],"pass":{"mode":"percent"}}"#);
    assert!(!exam_codes(&c_ok).contains(&"bad_pass_rule"));
}

#[test]
fn pass_mark_ignored_in_points_mode() {
    let c = exam_course(r#"{"id":"x","passMark":0.5,"sections":[{"title":"s","count":1}],"pass":{"mode":"points"},"scoring":[{"title":"P","sections":["s"],"points":100}]}"#);
    fires(&c, &[CHOICE], "pass_mark_ignored");
    let c_ok = exam_course(r#"{"id":"x","passMark":0.5,"sections":[{"title":"s","count":1}],"pass":{"mode":"percent"}}"#);
    assert!(!exam_codes(&c_ok).contains(&"pass_mark_ignored"));
}

#[test]
fn pass_mark_ignored_by_default_points_mode() {
    let c = exam_course(r#"{"id":"x","passMark":0.5,"sections":[{"title":"s","count":1}],"scoring":[{"title":"P","sections":["s"],"points":100}]}"#);
    fires(&c, &[CHOICE], "pass_mark_ignored");
}

#[test]
fn pass_rule_no_source_for_official_basis() {
    let c = exam_course(r#"{"id":"x","passMark":0.5,"sections":[{"title":"s","count":1}],"pass":{"basis":"official"}}"#);
    fires(&c, &[CHOICE], "pass_rule_no_source");
    let c_ok = exam_course(r#"{"id":"x","passMark":0.5,"sections":[{"title":"s","count":1}],"pass":{"basis":"official","source":"http://example.com"}}"#);
    assert!(!exam_codes(&c_ok).contains(&"pass_rule_no_source"));
}

#[test]
fn pass_rule_no_source_with_empty_source() {
    let c = exam_course(r#"{"id":"x","passMark":0.5,"sections":[{"title":"s","count":1}],"pass":{"basis":"official","source":"   "}}"#);
    fires(&c, &[CHOICE], "pass_rule_no_source");
}

#[test]
fn pass_rule_default_no_pass_no_mark_no_scoring() {
    let c = exam_course(r#"{"id":"x","sections":[{"title":"s","count":1}]}"#);
    fires(&c, &[CHOICE], "pass_rule_default");
    let c_ok = exam_course(r#"{"id":"x","passMark":0.5,"sections":[{"title":"s","count":1}]}"#);
    assert!(!exam_codes(&c_ok).contains(&"pass_rule_default"));
}

#[test]
fn pass_rule_default_with_pass() {
    let c = exam_course(r#"{"id":"x","sections":[{"title":"s","count":1}],"pass":{"mode":"percent"}}"#);
    assert!(!exam_codes(&c).contains(&"pass_rule_default"));
}

#[test]
fn pass_rule_default_with_scoring() {
    let c = exam_course(r#"{"id":"x","sections":[{"title":"s","count":1}],"scoring":[{"title":"P","sections":["s"],"points":100}]}"#);
    assert!(!exam_codes(&c).contains(&"pass_rule_default"));
}
