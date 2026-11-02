mod common;
use common::{groups, load, report};
use dojo_core::days::{day_key, streak};
use serde_json::Value;

#[test]
fn days_vectors() {
    let mut failures = vec![];
    for (f, cases) in groups(&load("days.json")) {
        for c in cases {
            let i = &c["input"];
            let got: Value = match f.as_str() {
                "dayKey" => {
                    let off = i.get("tzOffsetMin").and_then(Value::as_i64).unwrap_or(0) as i32;
                    Value::String(day_key(i["ms"].as_i64().unwrap(), off))
                }
                "streak" => serde_json::json!(streak(&i["days"], i["todayKey"].as_str().unwrap())),
                other => panic!("unknown group {other}"),
            };
            if got != c["expect"] {
                failures.push(format!("{f}/{} => got {got}", c["name"]));
            }
        }
    }
    report("days", failures);
}
