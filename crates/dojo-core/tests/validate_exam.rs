mod common;
use common::*;

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
    let d = run(c, &[STIM, STIM2]);
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

#[test]
fn breakdown_empty_key() {
    let c = with_course(r#""breakdown":{"key":"","meaning":"meta.en","readings":["meta.on"]}"#);
    fires(&c, &[CHOICE], "bad_breakdown");
}

#[test]
fn breakdown_empty_meaning() {
    let c = with_course(r#""breakdown":{"key":"meta.kanji","meaning":"","readings":["meta.on"]}"#);
    fires(&c, &[CHOICE], "bad_breakdown");
}

#[test]
fn breakdown_empty_reading() {
    let c = with_course(r#""breakdown":{"key":"meta.kanji","meaning":"meta.en","readings":["","meta.on"]}"#);
    fires(&c, &[CHOICE], "bad_breakdown");
}

#[test]
fn breakdown_valid() {
    let c = with_course(r#""breakdown":{"key":"meta.kanji","meaning":"meta.en","readings":["meta.on","meta.kun"]}"#);
    assert!(!codes(&run(&c, &[CHOICE])).contains(&"bad_breakdown"));
}
