use serde_json::{Map, Value};

use super::{coerce_f64, coerce_i64, field_f64, is_date_key, is_day_stat, json_number, num_value, DEFAULT_NEW_PER_DAY, MAX_INTRO_KEY_LEN, MAX_INTROS, MAX_NEW_PER_DAY};

fn sanitize_record(rec: &Map<String, Value>) -> Map<String, Value> {
    let mut out = rec.clone();
    let get = |k: &str| rec.get(k).unwrap_or(&Value::Null);
    out.insert("s".into(), Value::from(coerce_i64(get("s")).max(0)));
    out.insert("due".into(), num_value(get("due")));
    out.insert("ok".into(), Value::from(coerce_i64(get("ok"))));
    out.insert("bad".into(), Value::from(coerce_i64(get("bad"))));
    out.insert("last".into(), num_value(get("last")));
    out
}

fn is_valid_record(rec: &Map<String, Value>) -> bool {
    rec.get("s").is_some_and(Value::is_number) && rec.get("due").is_some_and(Value::is_number)
}

fn sanitize_day_map(v: &Value) -> Value {
    let mut out = Map::new();
    if let Some(map) = v.as_object() {
        for (date, count) in map.iter().filter(|(d, _)| is_date_key(d)) {
            out.insert(date.clone(), Value::from(coerce_i64(count)));
        }
    }
    Value::Object(out)
}

fn sanitize_stats(stats: Option<&Value>) -> Value {
    let mut src = stats.and_then(Value::as_object).cloned().unwrap_or_default();
    for key in ["days", "newByDay"] {
        src.entry(key).or_insert_with(|| Value::Object(Map::new()));
    }
    let out = src
        .into_iter()
        .map(|(key, value)| {
            let value = if is_day_stat(&key, &[Some(&value)]) { sanitize_day_map(&value) } else { value };
            (key, value)
        })
        .collect();
    Value::Object(out)
}

fn sanitize_settings(settings: Option<&Value>) -> Value {
    let mut out = settings.and_then(Value::as_object).cloned().unwrap_or_default();
    let new_per_day = match out.get("newPerDay") {
        Some(v @ Value::Number(_)) => coerce_i64(v).clamp(0, MAX_NEW_PER_DAY),
        _ => DEFAULT_NEW_PER_DAY,
    };
    out.insert("newPerDay".into(), Value::from(new_per_day));
    let placement_done = out.get("placementDone").is_some_and(super::truthy);
    out.insert("placementDone".into(), Value::Bool(placement_done));
    let t = out.get("t").map_or(0.0, coerce_f64);
    out.insert("t".into(), json_number(t));
    if out.get("ts").is_some_and(|ts| !ts.is_object()) {
        out.remove("ts");
    }
    Value::Object(out)
}

/// Keys that are dangerous to keep in arbitrary JSON maps (prototype pollution).
const DANGEROUS_KEYS: &[&str] = &["__proto__", "constructor", "prototype"];

/// Recursively remove dangerous keys from a JSON map.
fn sanitize_map(map: Map<String, Value>) -> Map<String, Value> {
    use std::collections::HashSet;
    let dangerous: HashSet<&str> = DANGEROUS_KEYS.iter().copied().collect();
    
    map.into_iter()
        .filter(|(k, _)| !dangerous.contains(k.as_str()))
        .map(|(k, v)| {
            let v = match v {
                Value::Object(obj) => Value::Object(sanitize_map(obj)),
                Value::Array(arr) => Value::Array(
                    arr.into_iter()
                        .map(|item| match item {
                            Value::Object(obj) => Value::Object(sanitize_map(obj)),
                            other => other,
                        })
                        .collect()
                ),
                other => other,
            };
            (k, v)
        })
        .collect()
}

/// Coerces `doc` into a normalized `v:1` progress document, keeping unknown fields; `None` when `doc` is not one.
pub fn sanitize(doc: &Value) -> Option<Value> {
    let obj = doc.as_object()?;
    if obj.get("v").and_then(Value::as_i64) != Some(1) {
        return None;
    }
    let items = obj.get("items")?.as_object()?;

    let mut out = obj.clone();
    out.insert("t".into(), json_number(field_f64(obj, "t")));
    out.insert("resetAt".into(), json_number(field_f64(obj, "resetAt")));
    let items = items
        .iter()
        .map(|(id, rec)| {
            let rec = match rec.as_object() {
                Some(r) if is_valid_record(r) => Value::Object(sanitize_record(r)),
                _ => rec.clone(),
            };
            (id.clone(), rec)
        })
        .collect();
    out.insert("items".into(), Value::Object(items));
    out.insert("stats".into(), sanitize_stats(obj.get("stats")));
    out.insert("settings".into(), sanitize_settings(obj.get("settings")));
    if let Some(intros) = obj.get("intros") {
        out.insert("intros".into(), Value::Object(numeric_entries(intros)));
    }

    // Remove dangerous keys from the final output
    let out = sanitize_map(out);
    
    Some(Value::Object(out))
}

/// The entries of `v` (when an object) whose value is a number and whose key is at most
/// `MAX_INTRO_KEY_LEN` bytes, first `MAX_INTROS` in key order.
fn numeric_entries(v: &Value) -> Map<String, Value> {
    v.as_object()
        .map(|m| {
            m.iter()
                .filter(|(k, t)| {
                    t.is_number() && k.len() <= MAX_INTRO_KEY_LEN && !matches!(k.as_str(), "__proto__" | "constructor" | "prototype")
                })
                .take(MAX_INTROS)
                .map(|(k, t)| (k.clone(), num_value(t)))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn sanitize_writes_float_valued_whole_numbers_as_integers() {
        let text = r#"{"v":1,"items":{"a":{"s":2,"due":1760000000000.0,"ok":1,"bad":0,"last":1760000000000.0}}}"#;
        let doc: Value = serde_json::from_str(text).unwrap();
        let out = serde_json::to_string(&sanitize(&doc).unwrap()["items"]["a"]).unwrap();
        assert!(out.contains(r#""due":1760000000000,"#), "{out}");
        assert!(out.contains(r#""last":1760000000000}"#), "{out}");
        assert!(!out.contains(".0"), "{out}");
    }

    #[test]
    fn sanitize_removes_proto_keys() {
        let doc: Value = serde_json::from_str(r#"{"v":1,"items":{},"stats":{},"settings":{},"__proto__":{"malicious":true}}"#).unwrap();
        let sanitized = sanitize(&doc).unwrap();
        assert!(sanitized.get("__proto__").is_none());
        assert!(sanitized.get("items").is_some());
    }

    #[test]
    fn sanitize_removes_constructor_keys() {
        let doc: Value = serde_json::from_str(r#"{"v":1,"items":{},"stats":{},"settings":{},"constructor":{"malicious":true}}"#).unwrap();
        let sanitized = sanitize(&doc).unwrap();
        assert!(sanitized.get("constructor").is_none());
    }

    #[test]
    fn sanitize_removes_prototype_keys() {
        let doc: Value = serde_json::from_str(r#"{"v":1,"items":{},"stats":{},"settings":{},"prototype":{"malicious":true}}"#).unwrap();
        let sanitized = sanitize(&doc).unwrap();
        assert!(sanitized.get("prototype").is_none());
    }

    #[test]
    fn sanitize_removes_nested_proto_keys() {
        let doc: Value = serde_json::from_str(r#"{"v":1,"items":{"a-1":{"s":1,"__proto__":{"nested":true}}},"stats":{},"settings":{}}"#).unwrap();
        let sanitized = sanitize(&doc).unwrap();
        let items = sanitized.get("items").and_then(Value::as_object).unwrap();
        let item = items.get("a-1").and_then(Value::as_object).unwrap();
        assert!(item.get("__proto__").is_none());
        assert!(item.get("s").is_some());
    }
}
