use dojo_core::validate::{Severity, validate};
mod common;
use common::*;

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
    fires(&with_course(r#""detail":{"fields":[{"key":"meta.a","type":"unknown"}]}"#), &[CHOICE], "unknown_detail_type");
}

#[test]
fn known_detail_types_pass() {
    let c = with_course(r#""detail":{"fields":[{"key":"meta.a","type":"objects","fields":[{"key":"x","type":"list"}]},{"key":"meta.b"}]}"#);
    let d = run(&c, &[CHOICE]);
    assert!(!d.iter().any(|d| d.code.contains("detail")), "{d:?}");
}

#[test]
fn table_and_pairs_with_keys_pass() {
    let c = with_course(r#""detail":{"fields":[{"key":"meta.t","type":"table"},{"key":"meta.p","type":"pairs","keys":["jp","ru"]},{"key":"meta.q","type":"pairs"}]}"#);
    let d = run(&c, &[CHOICE]);
    assert!(!d.iter().any(|d| d.code.contains("detail")), "{d:?}");
}

#[test]
fn unknown_detail_type_rejected_alongside_valid_ones() {
    let c = with_course(r#""detail":{"fields":[{"key":"meta.t","type":"table"},{"key":"meta.x","type":"grid"}]}"#);
    let d = run(&c, &[CHOICE]);
    assert_eq!(d.iter().filter(|d| d.code == "unknown_detail_type").count(), 1, "{d:?}");
}

#[test]
fn detail_keys_wrong_length_or_wrong_type_rejected() {
    fires(&with_course(r#""detail":{"fields":[{"key":"meta.p","type":"pairs","keys":["jp"]}]}"#), &[CHOICE], "bad_detail_keys");
    fires(&with_course(r#""detail":{"fields":[{"key":"meta.p","type":"list","keys":["a","b"]}]}"#), &[CHOICE], "bad_detail_keys");
}
