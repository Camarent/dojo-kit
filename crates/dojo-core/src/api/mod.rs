mod check;
mod exam;
mod groups;
mod progress;
mod srs;

use serde_json::{Map, Value, json};
use std::collections::{HashMap, HashSet};

struct CallError {
    code: &'static str,
    message: String,
}

fn bad(message: impl Into<String>) -> CallError {
    CallError { code: "bad_args", message: message.into() }
}

/// Runs the named core function on JSON `args` and returns the JSON envelope
/// `{"ok":true,"value":..}` or `{"ok":false,"error":{"code":..,"message":..}}`.
pub fn call(name: &str, args: &str) -> String {
    let result = match serde_json::from_str::<Value>(args) {
        Ok(value) => dispatch(name, &value),
        Err(e) => Err(CallError { code: "bad_json", message: e.to_string() }),
    };
    match result {
        Ok(value) => json!({ "ok": true, "value": value }),
        Err(e) => json!({ "ok": false, "error": { "code": e.code, "message": e.message } }),
    }
    .to_string()
}

fn field<'a>(args: &'a Value, key: &str) -> Result<&'a Value, CallError> {
    args.get(key).ok_or_else(|| bad(format!("missing argument `{key}`")))
}

fn rec<'a>(args: &'a Value) -> Option<&'a Value> {
    args.get("rec").filter(|v| !v.is_null())
}

fn int(args: &Value, key: &str) -> Result<i64, CallError> {
    let v = field(args, key)?;
    v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)).ok_or_else(|| bad(format!("`{key}` must be a number")))
}

fn text<'a>(args: &'a Value, key: &str) -> Result<&'a str, CallError> {
    field(args, key)?.as_str().ok_or_else(|| bad(format!("`{key}` must be a string")))
}

fn flag(args: &Value, key: &str) -> bool {
    args.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn strings(v: &Value, what: &str) -> Result<Vec<String>, CallError> {
    let list = v.as_array().ok_or_else(|| bad(format!("`{what}` must be an array of strings")))?;
    list.iter()
        .map(|s| s.as_str().map(str::to_string).ok_or_else(|| bad(format!("`{what}` must be an array of strings"))))
        .collect()
}

fn opt_bool(v: &Value, key: &str) -> Result<bool, CallError> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(false),
        Some(b) => b.as_bool().ok_or_else(|| bad(format!("`{key}` must be a boolean"))),
    }
}

fn opt_string(v: &Value, key: &str) -> Result<Option<String>, CallError> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(s) => s.as_str().map(|s| Some(s.to_string())).ok_or_else(|| bad(format!("`{key}` must be a string"))),
    }
}

fn opt_strings(v: &Value, key: &str) -> Result<Option<Vec<String>>, CallError> {
    v.get(key).map(|s| strings(s, key)).transpose()
}

fn indices(v: &Value, what: &str) -> Result<Vec<usize>, CallError> {
    let list = v.as_array().ok_or_else(|| bad(format!("`{what}` must be an array of non-negative integers")))?;
    list.iter()
        .map(|n| n.as_u64().map(|n| n as usize).ok_or_else(|| bad(format!("`{what}` must be an array of non-negative integers"))))
        .collect()
}

fn count(args: &Value, key: &str) -> Result<usize, CallError> {
    field(args, key)?.as_u64().map(|n| n as usize).ok_or_else(|| bad(format!("`{key}` must be a non-negative integer")))
}

fn seed(args: &Value) -> Result<u64, CallError> {
    text(args, "seed")?.parse().map_err(|_| bad("`seed` must be a decimal u64 string"))
}

fn drop(args: &Value) -> Result<i64, CallError> {
    match args.get("drop") {
        None | Some(Value::Null) => Ok(crate::srs::LEGACY_VECTOR_DROP),
        Some(d) => d.as_i64().filter(|n| *n >= 0).ok_or_else(|| bad("`drop` must be a non-negative integer")),
    }
}

fn ladder(args: &Value) -> Result<Vec<i64>, CallError> {
    match args.get("ladder") {
        None | Some(Value::Null) => Ok(crate::srs::DEFAULT_LADDER.to_vec()),
        Some(l) => l
            .as_array()
            .ok_or_else(|| bad("`ladder` must be an array of numbers"))?
            .iter()
            .map(|n| n.as_i64().ok_or_else(|| bad("`ladder` must be an array of numbers")))
            .collect(),
    }
}

fn normalize_opts(args: &Value) -> Result<crate::check::Normalize, CallError> {
    match args.get("opts") {
        None | Some(Value::Null) => Ok(crate::check::Normalize::default()),
        Some(o) => {
            let norm: crate::check::Normalize = serde_json::from_value(o.clone()).map_err(|e| bad(format!("`opts`: {e}")))?;
            for (from, to) in &norm.fold {
                if !crate::check::fold_entry_ok(from, to) {
                    return Err(bad(format!("`opts.fold` entry '{from}' -> '{to}' must be a single char or an equal-length range like 'A-Z' -> 'a-z'")));
                }
            }
            Ok(norm)
        }
    }
}

fn used_map(a: &Value) -> Result<HashMap<String, i64>, CallError> {
    match a.get("used") {
        Some(Value::Object(obj)) => obj
            .iter()
            .map(|(k, v)| v.as_i64().map(|n| (k.clone(), n)).ok_or_else(|| bad("`used` values must be integers")))
            .collect(),
        Some(Value::Null) | None => Ok(HashMap::new()),
        _ => Err(bad("`used` must be an object")),
    }
}

/// Ids of the non-retired entries of `members: [{id, status?, retired?}]`.
fn active_members(a: &Value) -> Result<Vec<String>, CallError> {
    let list = field(a, "members")?.as_array().ok_or_else(|| bad("`members` must be an array"))?;
    let mut out = Vec::new();
    for m in list {
        if flag(m, "retired") || m.get("status").and_then(Value::as_str) == Some("retired") {
            continue;
        }
        out.push(text(m, "id")?.to_string());
    }
    Ok(out)
}

fn scoped_set(a: &Value) -> Result<Option<HashSet<String>>, CallError> {
    Ok(opt_strings(a, "scopedEntities")?.map(|l| l.into_iter().collect()))
}

fn dispatch(name: &str, a: &Value) -> Result<Value, CallError> {
    match name {
        "emptyProgress" | "sanitize" | "merge" | "migrateProgress" | "dayKey" | "streak" => progress::progress_call(name, a),
        "applyAnswer" | "applyPractice" | "applyRelearn" | "applyPlacement" | "entityView" | "applyEntity" | "isDue" | "isNew" | "weakest" | "ladderForUnit" | "dropForUnit" | "unitConfig" => srs::srs_call(name, a),
        "buildQueue" | "groupCounts" | "entityStates" => groups::groups_call(name, a),
        "normalize" | "checkGap" | "gapVerdict" | "checkChoice" | "checkMulti" | "checkMatch" | "checkOrder" | "checkCloze" | "checkNumeric" => check::check_call(name, a),
        "splitmix64" | "sample" | "score" => exam::exam_call(name, a),
        other => Err(CallError { code: "unknown_function", message: format!("unknown function `{other}`") }),
    }
}
