//! Record extras `e`, `cf`, `to` (contract 12.3). Unknown record fields are kept.

use serde_json::{Map, Value};

const MAX_INT: f64 = 9007199254740991.0;
const CF_MAX_KEYS: usize = 8;
const CF_MAX_LEN: usize = 16;

fn round4(x: f64) -> f64 {
    (x * 1e4).round() / 1e4
}

fn finite(v: Option<&Value>) -> Option<f64> {
    v.and_then(Value::as_f64).filter(|x| x.is_finite())
}

fn valid_key(k: &str) -> bool {
    (1..=CF_MAX_LEN).contains(&k.chars().count())
}

fn pair(p: &Value) -> Option<(String, u64)> {
    let a = p.as_array().filter(|a| a.len() == 2)?;
    let key = a[0].as_str().filter(|k| valid_key(k))?;
    let n = a[1].as_f64().filter(|n| n.fract() == 0.0 && (1.0..=MAX_INT).contains(n))?;
    Some((key.to_string(), n as u64))
}

fn normalize_cf(cf: Option<&Value>) -> Vec<(String, u64)> {
    let mut out: Vec<(String, u64)> = Vec::new();
    for p in cf.and_then(Value::as_array).into_iter().flatten().filter_map(pair) {
        if !out.iter().any(|(k, _)| *k == p.0) {
            out.push(p);
        }
    }
    out
}

fn add_confusion(cf: Option<&Value>, key: &str) -> Value {
    let mut list = normalize_cf(cf);
    match list.iter_mut().find(|(k, _)| k == key) {
        Some((_, n)) => *n = (*n + 1).min(MAX_INT as u64),
        None => list.push((key.to_string(), 1)),
    }
    while list.len() > CF_MAX_KEYS {
        let mut drop: Option<usize> = None;
        for (i, (k, n)) in list.iter().enumerate() {
            if k != key && drop.is_none_or(|d| *n < list[d].1) {
                drop = Some(i);
            }
        }
        let Some(d) = drop else { unreachable!("more than one entry") };
        list.remove(d);
    }
    Value::Array(list.into_iter().map(|(k, n)| Value::Array(vec![Value::from(k), Value::from(n)])).collect())
}

/// Flags that are not exactly `true` count as false.
pub struct Outcome<'a> {
    pub correct: bool,
    pub given: Option<&'a str>,
    pub timed_out: bool,
    pub weighted: bool,
}

/// Returns a copy of `rec` (a non-object becomes `{}`) with `e`, `cf`, `to` updated per `o`.
pub fn apply_extras(rec: Option<&Value>, o: &Outcome) -> Value {
    let mut out: Map<String, Value> = rec.and_then(Value::as_object).cloned().unwrap_or_default();
    if o.weighted {
        let e0 = finite(out.get("e")).map_or(0.5, |e| e.clamp(0.0, 1.0));
        let x = if o.correct { 0.0 } else { 1.0 };
        out.insert("e".into(), Value::from(round4((0.7 * e0) + (0.3 * x))));
    }
    if let (false, false, Some(given)) = (o.correct, o.timed_out, o.given) {
        let key = given.trim();
        if valid_key(key) {
            let cf = add_confusion(out.get("cf"), key);
            out.insert("cf".into(), cf);
        }
    }
    if o.timed_out {
        let t = finite(out.get("to")).filter(|t| *t >= 0.0).map_or(0.0, f64::floor);
        out.insert("to".into(), Value::from((t + 1.0).min(MAX_INT) as u64));
    }
    Value::Object(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn wrong(given: &str) -> Outcome<'_> {
        Outcome { correct: false, given: Some(given), timed_out: false, weighted: false }
    }

    #[test]
    fn non_object_rec_becomes_empty() {
        let got = apply_extras(Some(&json!([1])), &wrong(" x "));
        assert_eq!(got, json!({"cf": [["x", 1]]}));
    }

    #[test]
    fn ninth_key_evicts_lowest_other_earliest() {
        let cf: Vec<Value> = (0..8).map(|i| json!([format!("k{i}"), 2])).collect();
        let got = apply_extras(Some(&json!({"cf": cf})), &wrong("new"));
        let keys: Vec<&str> = got["cf"].as_array().unwrap().iter().map(|p| p[0].as_str().unwrap()).collect();
        assert_eq!(keys, ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "new"]);
    }

    #[test]
    fn timeout_counts_without_confusion() {
        let o = Outcome { correct: false, given: Some("x"), timed_out: true, weighted: false };
        assert_eq!(apply_extras(Some(&json!({"to": 2.7})), &o), json!({"to": 3}));
    }
}
