mod common;
use common::{groups, json_eq, load, report};
use dojo_core::api::call;
use serde_json::{json, Value};

fn run(file: &str) {
    let mut failures = vec![];
    for (f, cases) in groups(&load(file)) {
        for c in cases {
            let out: Value = serde_json::from_str(&call(&f, &c["input"].to_string())).unwrap();
            if out["ok"] != json!(true) || !json_eq(&out["value"], &c["expect"]) {
                failures.push(format!("{f}/{}: {out}", c["name"]));
            }
        }
    }
    report(file, failures);
}

#[test]
fn timer_vectors() {
    run("timer.json");
}

#[test]
fn extras_vectors() {
    run("extras.json");
}

#[test]
fn non_object_arguments_are_bad_args() {
    for f in ["timerNext", "timerLimit", "applyExtras"] {
        let out: Value = serde_json::from_str(&call(f, "5")).unwrap();
        assert_eq!(out["error"]["code"], "bad_args", "{f}");
    }
}
