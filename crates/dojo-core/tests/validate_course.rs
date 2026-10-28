use dojo_core::lock::{parse_lock, update};
use dojo_core::validate::{CODES, Severity, SourceFile, validate};
mod common;
use common::*;

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
    let d = run(c, &[exam_item, normal_item, normal_item, normal_item, normal_item]);
    assert!(!codes(&d).contains(&"exam_few_unique"), "should not warn at exactly 20%");
}

#[test]
fn exam_few_unique_19_percent() {
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"},{"id":"e","title":"E","examOnly":true}],"exam":{"passMark":0.5,"sections":[{"title":"s","count":10}]}}"#;
    let exam_item = r#"{"type":"choice","id":"e-1","unit":"e","prompt":"Exam","options":["a","b"],"answer":0}"#;
    let normal_item = CHOICE;
    let items: Vec<&str> = vec![exam_item, normal_item, normal_item, normal_item, normal_item, normal_item, normal_item, normal_item, normal_item, normal_item];
    let d = run(c, &items);
    assert!(codes(&d).contains(&"exam_few_unique"), "should warn at 10% (need 20% = 2)");
}

#[test]
fn exam_few_unique_retired_exam_only_not_counted() {
    let retired_exam = r#"{"type":"choice","id":"e-1","unit":"e","prompt":"Retired Exam","options":["a","b"],"answer":0,"status":"retired"}"#;
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"},{"id":"e","title":"E","examOnly":true}],"exam":{"passMark":0.5,"sections":[{"title":"s","count":5}]}}"#;
    let d = run(c, &[retired_exam, CHOICE, CHOICE, CHOICE, CHOICE, CHOICE]);
    assert!(codes(&d).contains(&"exam_few_unique"), "retired examOnly item should not count");
}

#[test]
fn exam_few_unique_in_exams_array() {
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"exams":[{"id":"n1","passMark":0.5,"sections":[{"title":"s","count":5}]}]}"#;
    let d = run(c, &[CHOICE]);
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
