use dojo_core::lock::{parse_lock, update};
use dojo_core::validate::{Severity, validate};
mod common;
use common::*;

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
