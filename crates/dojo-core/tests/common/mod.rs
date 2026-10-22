#![allow(dead_code)]
use serde_json::Value;
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
