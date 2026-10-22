mod common;
use common::{groups, json_eq, load, report};
use dojo_core::progress::{merge, sanitize, MergeError};
use serde_json::Value;

#[test]
fn sanitize_vectors() {
    let mut failures = vec![];
    for (_, cases) in groups(&load("sanitize.json")) {
        for c in cases {
            let got = sanitize(&c["input"]);
            let ok = match (&got, &c["expect"]) {
                (None, Value::Null) => true,
                (Some(g), e) => json_eq(g, e),
                _ => false,
            };
            if !ok {
                failures.push(format!("{} => got {got:?}", c["name"]));
            }
        }
    }
    report("sanitize", failures);
}

#[test]
fn merge_vectors() {
    let mut failures = vec![];
    for (_, cases) in groups(&load("merge.json")) {
        for c in cases {
            let (a, b) = (&c["input"]["a"], &c["input"]["b"]);
            let got = merge(a, b);
            let ok = match (&got, c["expect"]["error"].as_str()) {
                (Err(MergeError::CourseMismatch), Some("course_mismatch")) => true,
                (Err(MergeError::InvalidDocument), Some("invalid_document")) => true,
                (Ok(g), None) => json_eq(g, &c["expect"]),
                _ => false,
            };
            if !ok {
                failures.push(format!("{} => got {got:?}", c["name"]));
            }
            if c["commutes"] == Value::Bool(true) {
                let back = merge(b, a);
                if !matches!((&got, &back), (Ok(x), Ok(y)) if json_eq(x, y)) {
                    failures.push(format!("{} => not commutative", c["name"]));
                }
            }
        }
    }
    report("merge", failures);
}
