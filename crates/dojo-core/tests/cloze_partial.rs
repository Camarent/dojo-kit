use dojo_core::api;
use dojo_core::check::{check_cloze, Normalize};
use serde_json::{json, Value};

fn blanks(b: &[&[&str]]) -> Vec<Vec<String>> {
    b.iter().map(|alts| alts.iter().map(|s| s.to_string()).collect()).collect()
}

fn inputs(i: &[&str]) -> Vec<String> {
    i.iter().map(|s| s.to_string()).collect()
}

#[test]
fn two_blanks_one_right_is_partial_not_correct() {
    let r = check_cloze(&blanks(&[&["Paris"], &["Rome"]]), &inputs(&["Paris", "X"]), &Normalize::default());
    assert!(r.partial);
    assert!(!r.correct);
    assert_eq!(r.results, vec![true, false]);
}

#[test]
fn both_right_is_correct_not_partial() {
    let r = check_cloze(&blanks(&[&["Paris"], &["Rome"]]), &inputs(&["Paris", "Rome"]), &Normalize::default());
    assert!(r.correct);
    assert!(!r.partial);
}

#[test]
fn both_wrong_is_neither_partial_nor_correct() {
    let r = check_cloze(&blanks(&[&["Paris"], &["Rome"]]), &inputs(&["X", "Y"]), &Normalize::default());
    assert!(!r.correct);
    assert!(!r.partial);
}

#[test]
fn one_blank_is_never_partial() {
    let right = check_cloze(&blanks(&[&["Paris"]]), &inputs(&["Paris"]), &Normalize::default());
    let wrong = check_cloze(&blanks(&[&["Paris"]]), &inputs(&["X"]), &Normalize::default());
    assert!(right.correct && !right.partial);
    assert!(!wrong.correct && !wrong.partial);
}

#[test]
fn empty_blanks_is_never_partial() {
    let r = check_cloze(&[], &[], &Normalize::default());
    assert!(!r.correct);
    assert!(!r.partial);
}

#[test]
fn missing_input_counts_as_wrong_for_partial() {
    let r = check_cloze(&blanks(&[&["Paris"], &["Rome"]]), &inputs(&["Paris"]), &Normalize::default());
    assert!(r.partial);
    assert_eq!(r.results, vec![true, false]);
}

#[test]
fn api_check_cloze_reports_partial() {
    let args = json!({ "blanks": [["Paris"], ["Rome"]], "inputs": ["Paris", "X"] }).to_string();
    let env: Value = serde_json::from_str(&api::call("checkCloze", &args)).unwrap();
    assert_eq!(env["ok"], json!(true));
    let out = &env["value"];
    assert_eq!(out["partial"], json!(true));
    assert_eq!(out["correct"], json!(false));
    assert_eq!(out["results"], json!([true, false]));
}
