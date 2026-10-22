use dojo_core::api::call;
use serde_json::Value;

fn env(name: &str, args: &str) -> Value {
    serde_json::from_str(&call(name, args)).unwrap()
}

#[test]
fn score_without_results_is_error_envelope() {
    let v = env("score", r#"{"total": 1}"#);
    assert_eq!(v["ok"], false);
}

#[test]
fn score_results_not_array_is_error_envelope() {
    let v = env("score", r#"{"results": 3, "total": 1}"#);
    assert_eq!(v["ok"], false);
}

#[test]
fn score_empty_results_is_ok() {
    let v = env("score", r#"{"results": [], "total": 0}"#);
    assert_eq!(v["ok"], true);
}

#[test]
fn score_empty_scoring_is_graceful() {
    let v = env("score", r#"{"results": [], "total": 0, "scoring": []}"#);
    assert!(v["ok"].is_boolean());
}

#[test]
fn score_scoring_not_array_is_error_envelope() {
    let v = env("score", r#"{"results": [], "total": 0, "scoring": 5}"#);
    assert_eq!(v["ok"], false);
}
