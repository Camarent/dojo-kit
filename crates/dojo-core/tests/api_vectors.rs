mod common;
use common::{groups, json_eq, load, report};
use dojo_core::api::call;
use serde_json::Value;

#[test]
fn every_vector_through_the_api() {
    let mut failures = vec![];
    let mut total = 0;
    for file in ["sanitize", "merge", "srs", "days", "check", "exam", "groups"] {
        for (f, cases) in groups(&load(&format!("{file}.json"))) {
            for c in cases {
                total += 1;
                let out: Value = serde_json::from_str(&call(&f, &c["input"].to_string())).unwrap();
                if out["ok"] != Value::Bool(true) || !json_eq(&out["value"], &c["expect"]) {
                    failures.push(format!("{f}/{} => {out}", c["name"]));
                }
            }
        }
    }
    assert!(total >= 170, "only {total} vector cases ran");
    report("api", failures);
}

#[test]
fn errors_use_the_envelope() {
    let unknown: Value = serde_json::from_str(&call("nope", "{}")).unwrap();
    assert_eq!(unknown["error"]["code"], "unknown_function");
    let broken: Value = serde_json::from_str(&call("sanitize", "{not json")).unwrap();
    assert_eq!(broken["error"]["code"], "bad_json");
    let missing: Value = serde_json::from_str(&call("applyAnswer", "{}")).unwrap();
    assert_eq!(missing["error"]["code"], "bad_args");
}

#[test]
fn score_without_pass_mark_uses_default() {
    let result = call("score", r#"{"results": [{"id": "q1", "correct": true}, {"id": "q2", "correct": true}], "total": 2}"#);
    let out: Value = serde_json::from_str(&result).unwrap();
    assert_eq!(out["ok"], Value::Bool(true));
    let value = &out["value"];
    assert_eq!(value["raw"], 2);
    assert_eq!(value["total"], 2);
    assert_eq!(value["pass"], true); // 2/2 = 1.0 >= 0.6 (default)
}

#[test]
fn score_explicit_zero_pass_mark_is_kept() {
    let result = call("score", r#"{"results": [{"id": "q1", "correct": false}], "total": 1, "passMark": 0}"#);
    let out: Value = serde_json::from_str(&result).unwrap();
    assert_eq!(out["value"]["pass"], true);
}

#[test]
fn sample_reads_optional_exam_only_flag() {
    let run = |flag: &str| -> Value {
        let args = format!(
            r#"{{"candidates":[{{"id":"a","unit":"u","tags":[],"type":"choice"}},{{"id":"b","unit":"u","tags":[],"type":"choice"{flag}}}],"sections":[{{"title":"s","count":1}}],"seed":"7"}}"#
        );
        serde_json::from_str(&call("sample", &args)).unwrap()
    };
    assert_eq!(run(r#","examOnly":true"#)["value"]["ids"][0], "b");
    assert_eq!(run(r#","examOnly":null"#)["ok"], Value::Bool(true));
    assert_eq!(run(r#","examOnly":"yes""#)["error"]["code"], "bad_args");
}
