mod common;
use common::{groups, json_eq, load, report};
use dojo_core::api::call;
use serde_json::{json, Value};

fn run(file: &str) -> Result<(), Box<dyn std::error::Error>> {
    let null = Value::Null;
    let mut failures = vec![];
    for (f, cases) in groups(&load(file)) {
        for c in cases {
            let name = c.get("name").unwrap_or(&null);
            let out: Value = serde_json::from_str(&call(&f, &c.get("input").unwrap_or(&null).to_string()))?;
            let value = out.get("value").unwrap_or(&null);
            if out.get("ok") != Some(&json!(true)) || !json_eq(value, c.get("expect").unwrap_or(&null)) {
                failures.push(format!("{f}/{name}: {out}"));
            }
        }
    }
    report(file, failures);
    Ok(())
}

#[test]
fn timer_vectors() -> Result<(), Box<dyn std::error::Error>> {
    run("timer.json")
}

#[test]
fn extras_vectors() -> Result<(), Box<dyn std::error::Error>> {
    run("extras.json")
}

#[test]
fn non_object_arguments_are_bad_args() {
    for f in ["timerNext", "timerLimit", "applyExtras"] {
        let out: Value = serde_json::from_str(&call(f, "5")).unwrap();
        assert_eq!(out["error"]["code"], "bad_args", "{f}");
    }
}
