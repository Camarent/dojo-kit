use dojo_core::api::call;
use serde_json::Value;

type TestResult = Result<(), Box<dyn std::error::Error>>;

fn env(name: &str, args: &str) -> Result<Value, serde_json::Error> {
    serde_json::from_str(&call(name, args))
}

#[test]
fn score_without_results_is_error_envelope() -> TestResult {
    let v = env("score", r#"{"total": 1}"#)?;
    assert_eq!(v["ok"], false);
    Ok(())
}

#[test]
fn score_results_not_array_is_error_envelope() -> TestResult {
    let v = env("score", r#"{"results": 3, "total": 1}"#)?;
    assert_eq!(v["ok"], false);
    Ok(())
}

#[test]
fn score_empty_results_is_ok() -> TestResult {
    let v = env("score", r#"{"results": [], "total": 0}"#)?;
    assert_eq!(v["ok"], true);
    Ok(())
}

#[test]
fn score_empty_scoring_is_graceful() -> TestResult {
    let v = env("score", r#"{"results": [], "total": 0, "scoring": []}"#)?;
    assert!(v["ok"].is_boolean());
    Ok(())
}

#[test]
fn score_scoring_not_array_is_error_envelope() -> TestResult {
    let v = env("score", r#"{"results": [], "total": 0, "scoring": 5}"#)?;
    assert_eq!(v["ok"], false);
    Ok(())
}
