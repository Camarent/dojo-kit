#![allow(dead_code)]
use dojo_core::content::{Item, parse_items};
use dojo_core::lock::IdLock;
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::PathBuf;

pub fn load(name: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/vectors").join(name);
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&text).unwrap()
}

/// `(fn, cases)` pairs of a vector file, whether it has `groups` or a single `fn`/`cases`.
pub fn groups(file: &Value) -> Vec<(String, Vec<Value>)> {
    let one = |g: &Value| {
        (g["fn"].as_str().unwrap().to_string(), g["cases"].as_array().unwrap().clone())
    };
    match file.get("groups") {
        Some(gs) => gs.as_array().unwrap().iter().map(one).collect(),
        None => vec![one(file)],
    }
}

/// Structural equality: object key order is ignored, numbers compare by value.
pub fn json_eq(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| json_eq(p, q)),
        (Value::Object(x), Value::Object(y)) => {
            x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| json_eq(v, w)))
        }
        _ => a == b,
    }
}

/// Panics listing every failed case of a group.
pub fn report(group: &str, failures: Vec<String>) {
    assert!(failures.is_empty(), "{group}: {} failed:\n{}", failures.len(), failures.join("\n"));
}

use dojo_core::validate::{Diagnostic, SourceFile, validate};

pub const COURSE: &str = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;

pub fn file(name: &str, text: &str) -> SourceFile {
    SourceFile { name: name.to_string(), text: text.to_string() }
}

pub fn run(course: &str, lines: &[&str]) -> Vec<Diagnostic> {
    validate(course, &[file("content/u.jsonl", &lines.join("\n"))], None)
}

pub fn codes(d: &[Diagnostic]) -> Vec<&'static str> {
    d.iter().map(|d| d.code).collect()
}

pub fn fires(course: &str, lines: &[&str], code: &str) {
    let d = run(course, lines);
    assert!(d.iter().any(|d| d.code == code), "{code} not in {d:?}");
}

pub const CHOICE: &str = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["a","b"],"answer":0}"#;

pub fn with_course(extra: &str) -> String {
    format!(r#"{{"id":"c","title":"C","uiLanguage":"en","units":[{{"id":"u","title":"U"}}],{extra}}}"#)
}


pub fn items(lines: &[&str]) -> Vec<Item> {
    parse_items(&lines.join("\n")).items.into_iter().map(|(_, i)| i).collect()
}

pub fn card(id: &str, retired: bool) -> String {
    let status = if retired { r#","status":"retired""# } else { "" };
    format!(r#"{{"type":"card","id":"{id}","unit":"u","prompt":"p {id}","back":"b"{status}}}"#)
}

pub fn with_cards(mut lock: IdLock, ids: &[&str]) -> IdLock {
    lock.types.extend(ids.iter().map(|i| (i.to_string(), "card".to_string())));
    lock
}

pub fn lock_of(ids: &[&str], retired: &[&str]) -> IdLock {
    IdLock { v: 1, ids: ids.iter().map(|s| s.to_string()).collect(), retired: retired.iter().map(|s| s.to_string()).collect(), types: BTreeMap::new() }
}
