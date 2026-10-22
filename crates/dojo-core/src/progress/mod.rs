use serde_json::{Map, Number, Value};

/// Why `merge` refused to combine two documents.
#[derive(Debug, PartialEq, Eq)]
pub enum MergeError {
    /// Both documents carry a string `course` and the two differ.
    CourseMismatch,
    /// At least one side is not a JSON object.
    InvalidDocument,
}

const DAY_LOG_KEEP: usize = 150;
const MAX_NEW_PER_DAY: i64 = 50;
const DEFAULT_NEW_PER_DAY: i64 = 10;
const MAX_INTROS: usize = 5000;
const MAX_INTRO_KEY_LEN: usize = 128;
const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_992.0;

/// JavaScript truthiness of a JSON value.
pub(crate) fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Value::String(s) => !s.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// Integer value of a JSON number, truncating fractions; `None` for non-numbers.
pub(crate) fn num_i64(v: &Value) -> Option<i64> {
    let n = v.as_number()?;
    n.as_i64().or_else(|| n.as_f64().map(|f| f.trunc() as i64))
}

/// JavaScript `+v || 0` for JSON values.
pub(crate) fn coerce_f64(v: &Value) -> f64 {
    let n = match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse::<f64>().ok(),
        Value::Bool(b) => Some(f64::from(u8::from(*b))),
        _ => None,
    };
    n.filter(|x| x.is_finite()).unwrap_or(0.0)
}

/// JavaScript `v | 0` (without 32-bit wrapping) for JSON values.
pub(crate) fn coerce_i64(v: &Value) -> i64 {
    num_i64(v).unwrap_or_else(|| coerce_f64(v).trunc() as i64)
}

/// A JSON number; whole values below 2^53 become integers.
pub(crate) fn json_number(f: f64) -> Value {
    if f.is_finite() && f.fract() == 0.0 && f.abs() < MAX_SAFE_INTEGER {
        Value::from(f as i64)
    } else {
        Number::from_f64(f).map_or_else(|| Value::from(0), Value::Number)
    }
}

/// Numeric value of `v` as a JSON number; integers are kept exactly.
pub(crate) fn num_value(v: &Value) -> Value {
    match v {
        Value::Number(n) if n.is_i64() || n.is_u64() => v.clone(),
        _ => json_number(coerce_f64(v)),
    }
}

pub(crate) fn field_f64(map: &Map<String, Value>, key: &str) -> f64 {
    map.get(key).map_or(0.0, coerce_f64)
}

pub(crate) fn is_date_key(k: &str) -> bool {
    let b = k.as_bytes();
    b.len() == 10
        && b.iter().enumerate().all(|(i, c)| if i == 4 || i == 7 { *c == b'-' } else { c.is_ascii_digit() })
}

pub(crate) fn is_day_map(v: &Value) -> bool {
    v.as_object().is_some_and(|m| m.keys().any(|k| is_date_key(k)))
}

pub(crate) fn is_day_stat(key: &str, values: &[Option<&Value>]) -> bool {
    key == "days" || key == "newByDay" || values.iter().flatten().any(|v| is_day_map(v))
}

/// A new, empty `v:1` progress document.
pub fn empty_progress() -> Value {
    serde_json::json!({
        "v": 1,
        "t": 0,
        "resetAt": 0,
        "items": {},
        "stats": { "days": {}, "newByDay": {} },
        "settings": { "newPerDay": DEFAULT_NEW_PER_DAY, "placementDone": false, "t": 0 }
    })
}

mod sanitize;
mod merge;
mod draft;
mod stable_json;

pub(crate) fn utf16_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}


pub use merge::merge;
pub use sanitize::sanitize;
pub use stable_json::stable_json;
