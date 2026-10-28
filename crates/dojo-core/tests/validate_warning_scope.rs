mod common;
use common::*;

const TWO_UNITS: &str = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"},{"id":"v","title":"V"}]}"#;

fn dup(lines: &[&str]) -> bool {
    run(TWO_UNITS, lines).iter().any(|d| d.code == "duplicate_prompt")
}

fn amb(answers: &str) -> bool {
    let l = format!(r#"{{"id":"u-1","unit":"u","type":"gap","prompt":"Write it","answers":{answers}}}"#);
    run(TWO_UNITS, &[&l]).iter().any(|d| d.code == "ambiguous_answer")
}

fn card(id: &str, unit: &str, stim: &str) -> String {
    format!(r#"{{"id":"{id}","unit":"{unit}","type":"card","prompt":"Same","back":"b"{stim}}}"#)
}

#[test]
fn same_prompt_other_unit_is_no_duplicate() {
    assert!(!dup(&[&card("u-1", "u", ""), &card("v-1", "v", "")]));
}

#[test]
fn same_unit_other_stimulus_is_no_duplicate() {
    assert!(!dup(&[&card("u-1", "u", r#","stimulus":"s1""#), &card("u-2", "u", r#","stimulus":"s2""#)]));
}

#[test]
fn same_unit_and_stimulus_is_duplicate() {
    assert!(dup(&[&card("u-1", "u", r#","stimulus":"s1""#), &card("u-2", "u", r#","stimulus":"s1""#)]));
    assert!(dup(&[&card("u-1", "u", ""), &card("u-2", "u", "")]));
}

#[test]
fn number_format_answers_are_not_ambiguous() {
    assert!(!amb(r#"["2,50 €","2,5 €"]"#));
}

#[test]
fn alphabetic_non_ascii_answers_are_ambiguous() {
    assert!(amb(r#"["はし","ばし"]"#));
}
