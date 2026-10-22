use serde_json::{Map, Value};

use super::{coerce_f64, coerce_i64, field_f64, is_date_key, is_day_stat, json_number, num_value, DAY_LOG_KEEP, MAX_INTRO_KEY_LEN, MAX_INTROS, truthy};

fn rec_last(rec: &Value) -> f64 {
    rec.as_object().map_or(0.0, |r| field_f64(r, "last"))
}

fn rec_stage(rec: &Value) -> f64 {
    rec.as_object().map_or(0.0, |r| field_f64(r, "s"))
}

pub(super) fn merge_items(docs: [&Map<String, Value>; 2], reset_at: f64) -> Value {
    let mut out: Map<String, Value> = Map::new();
    for doc in docs {
        let Some(items) = doc.get("items").and_then(Value::as_object) else { continue };
        for (id, rec) in items {
            if reset_at != 0.0 && rec_last(rec) < reset_at {
                continue;
            }
            let wins = out.get(id).is_none_or(|cur| {
                let (last, cur_last) = (rec_last(rec), rec_last(cur));
                last > cur_last || (last == cur_last && rec_stage(rec) > rec_stage(cur))
            });
            if wins {
                out.insert(id.clone(), rec.clone());
            }
        }
    }
    Value::Object(out)
}

pub(super) fn stats_of(doc: &Map<String, Value>) -> Option<&Map<String, Value>> {
    doc.get("stats").and_then(Value::as_object)
}

pub(super) fn merge_day_map(key: &str, docs: [&Map<String, Value>; 2], reset_at: f64) -> Value {
    let mut days: Map<String, Value> = Map::new();
    for doc in docs.iter().filter(|d| field_f64(d, "resetAt") == reset_at) {
        let Some(map) = stats_of(doc).and_then(|s| s.get(key)).and_then(Value::as_object) else { continue };
        for (date, count) in map.iter().filter(|(d, _)| is_date_key(d)) {
            let best = days.get(date).and_then(Value::as_i64).unwrap_or(0).max(coerce_i64(count));
            days.insert(date.clone(), Value::from(best));
        }
    }
    let mut entries: Vec<(String, Value)> = days.into_iter().collect();
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    let excess = entries.len().saturating_sub(DAY_LOG_KEEP);
    Value::Object(entries.into_iter().skip(excess).collect())
}

pub(super) fn merge_stats(older: &Map<String, Value>, newer: &Map<String, Value>, reset_at: f64) -> Value {
    let mut keys: Vec<&String> = Vec::new();
    for doc in [older, newer] {
        for key in stats_of(doc).into_iter().flat_map(Map::keys) {
            if !keys.contains(&key) {
                keys.push(key);
            }
        }
    }
    let days = String::from("days");
    let new_by_day = String::from("newByDay");
    for key in [&days, &new_by_day] {
        if !keys.contains(&key) {
            keys.push(key);
        }
    }

    let mut out = Map::new();
    for key in keys {
        let (o, n) = (stats_of(older).and_then(|s| s.get(key)), stats_of(newer).and_then(|s| s.get(key)));
        let value = if is_day_stat(key, &[o, n]) {
            merge_day_map(key, [older, newer], reset_at)
        } else {
            n.or(o).cloned().unwrap_or(Value::Null)
        };
        out.insert(key.clone(), value);
    }
    Value::Object(out)
}

/// The entries of `v` (when an object) whose value is a number and whose key is at most
/// `MAX_INTRO_KEY_LEN` bytes, first `MAX_INTROS` in key order.
pub(super) fn numeric_entries(v: &Value) -> Map<String, Value> {
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

/// Intro cards seen: union by entity, earliest timestamp wins, entries older than `reset_at` dropped.
pub(super) fn merge_intros(docs: [&Map<String, Value>; 2], reset_at: f64) -> Value {
    let mut out: Map<String, Value> = Map::new();
    for doc in docs {
        let Some(intros) = doc.get("intros") else { continue };
        for (k, t) in numeric_entries(intros) {
            let ts = coerce_f64(&t);
            if reset_at != 0.0 && ts < reset_at {
                continue;
            }
            if out.get(&k).is_none_or(|cur| ts < coerce_f64(cur)) {
                out.insert(k, t);
            }
        }
    }
    Value::Object(out)
}

pub(super) fn merge_exams(docs: [&Map<String, Value>; 2], reset_at: f64) -> Value {
    let mut out = Map::new();
    for doc in docs.iter().filter(|d| field_f64(d, "resetAt") == reset_at) {
        let Some(exams) = doc.get("exams").and_then(Value::as_object) else { continue };
        for (key, exam) in exams {
            if !out.contains_key(key) {
                out.insert(key.clone(), exam.clone());
            }
        }
    }
    Value::Object(out)
}

fn field_time(settings: &Map<String, Value>, field: &str) -> f64 {
    settings
        .get("ts")
        .and_then(Value::as_object)
        .and_then(|ts| ts.get(field))
        .and_then(Value::as_f64)
        .unwrap_or_else(|| field_f64(settings, "t"))
}

pub(super) fn merge_settings(a: &Map<String, Value>, b: &Map<String, Value>) -> Value {
    let (a_t, b_t) = (field_f64(a, "t"), field_f64(b, "t"));
    let newer_first = if b_t > a_t { [b, a] } else { [a, b] };

    let mut fields: Vec<&String> = Vec::new();
    for key in a.keys().chain(b.keys()).filter(|k| *k != "t" && *k != "ts") {
        if !fields.contains(&key) {
            fields.push(key);
        }
    }

    let mut out = Map::new();
    let mut ts = Map::new();
    for field in fields {
        let mut sides = newer_first.iter().filter(|s| s.contains_key(field));
        let Some(first) = sides.next() else { continue };
        let best = match sides.next() {
            Some(second) if field_time(second, field) > field_time(first, field) => *second,
            _ => *first,
        };
        out.insert(field.clone(), best[field].clone());
        let stamp = best.get("ts").and_then(Value::as_object).and_then(|t| t.get(field));
        if let Some(stamp) = stamp.filter(|s| s.is_number()) {
            ts.insert(field.clone(), stamp.clone());
        }
    }
    let placement_done = [a, b].iter().any(|s| s.get("placementDone").is_some_and(truthy));
    out.insert("placementDone".into(), Value::Bool(placement_done));
    out.insert("t".into(), json_number(a_t.max(b_t)));
    if !ts.is_empty() {
        out.insert("ts".into(), Value::Object(ts));
    }
    Value::Object(out)
}

pub(super) fn merge_settings_docs(a: &Map<String, Value>, b: &Map<String, Value>) -> Option<Value> {
    let object = |d: &Map<String, Value>| d.get("settings").and_then(Value::as_object).cloned();
    match (object(a), object(b)) {
        (Some(sa), Some(sb)) => {
            let (ra, rb) = (field_f64(a, "resetAt"), field_f64(b, "resetAt"));
            Some(if ra > rb {
                Value::Object(sa)
            } else if rb > ra {
                Value::Object(sb)
            } else {
                merge_settings(&sa, &sb)
            })
        }
        (Some(s), None) | (None, Some(s)) => Some(Value::Object(s)),
        (None, None) => None,
    }
}

/// Merges two progress documents without losing data except through `resetAt`.
///
/// Items: union by id, later `last` wins (higher `s` on ties), records older than the newest `resetAt` dropped.
/// Stats: per-date max over the sides at the newest `resetAt`, newest 150 dates kept. Exams: union by key.
/// Intros: union by entity, minimum timestamp, entries before `resetAt` dropped. Settings: per-field by `ts`. Other top-level fields: union, the document with the larger `t` wins.
pub fn merge(a: &Value, b: &Value) -> Result<Value, super::MergeError> {
    let (Some(ao), Some(bo)) = (a.as_object(), b.as_object()) else {
        return Err(super::MergeError::InvalidDocument);
    };
    if let (Some(Value::String(ca)), Some(Value::String(cb))) = (ao.get("course"), bo.get("course")) {
        if ca != cb {
            return Err(super::MergeError::CourseMismatch);
        }
    }

    let (a_t, b_t) = (field_f64(ao, "t"), field_f64(bo, "t"));
    let (older, newer) = if a_t > b_t { (bo, ao) } else { (ao, bo) };
    let reset_at = field_f64(ao, "resetAt").max(field_f64(bo, "resetAt"));
    let docs = [ao, bo];

    let mut out = older.clone();
    for (key, value) in newer {
        out.insert(key.clone(), value.clone());
    }
    out.insert("v".into(), Value::from(1));
    out.insert("resetAt".into(), json_number(reset_at));
    out.insert("t".into(), json_number(a_t.max(b_t)));
    out.insert("items".into(), merge_items(docs, reset_at));
    out.insert("stats".into(), merge_stats(older, newer, reset_at));
    if docs.iter().any(|d| d.get("exams").is_some_and(Value::is_object)) || out.contains_key("exams") {
        out.insert("exams".into(), merge_exams(docs, reset_at));
    }
    if docs.iter().any(|d| d.contains_key("intros")) {
        out.insert("intros".into(), merge_intros(docs, reset_at));
    }
    if let Some(settings) = merge_settings_docs(ao, bo) {
        out.insert("settings".into(), settings);
    }
    match super::draft::merge_draft(ao.get("examDraft"), bo.get("examDraft"), reset_at) {
        super::draft::DraftMerge::Use(draft) => {
            out.insert("examDraft".into(), draft);
        }
        super::draft::DraftMerge::Drop => {
            out.remove("examDraft");
        }
        super::draft::DraftMerge::Generic => {}
    }
    Ok(Value::Object(out))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::progress::{sanitize, MergeError, MAX_INTROS, MAX_INTRO_KEY_LEN};
    use serde_json::json;

    fn pdoc(t: i64, reset: i64, intros: Option<Value>) -> Value {
        let mut d = json!({"v": 1, "t": t, "resetAt": reset, "items": {}, "stats": {}});
        if let Some(i) = intros {
            d["intros"] = i;
        }
        d
    }

    #[test]
    fn intros_sanitize_drops_non_numeric_and_keeps_old_docs_unchanged() {
        let out = sanitize(&pdoc(1, 0, Some(json!({"k-1": 5, "k-2": "x", "k-3": null, "k-4": {"a": 1}, "k-5": 2.5})))).unwrap();
        assert_eq!(out["intros"], json!({"k-1": 5, "k-5": 2.5}));
        assert_eq!(sanitize(&pdoc(1, 0, Some(json!("bad")))).unwrap()["intros"], json!({}));
        assert!(sanitize(&pdoc(1, 0, None)).unwrap().get("intros").is_none());
    }

    #[test]
    fn intros_sanitize_rejects_prototype_keys() {
        let d = pdoc(1, 0, Some(json!({"__proto__": 1, "constructor": 2, "prototype": 3, "k-1": 4})));
        assert_eq!(sanitize(&d).unwrap()["intros"], json!({"k-1": 4}));
        let m = merge(&d, &d).unwrap();
        assert_eq!(m["intros"], json!({"k-1": 4}));
    }

    #[test]
    fn intros_sanitize_caps_key_length_and_count() {
        let mut m = Map::new();
        m.insert("k".repeat(MAX_INTRO_KEY_LEN), json!(1));
        m.insert("k".repeat(MAX_INTRO_KEY_LEN + 1), json!(2));
        let out = sanitize(&pdoc(1, 0, Some(Value::Object(m)))).unwrap();
        assert_eq!(out["intros"].as_object().unwrap().len(), 1);
        let many: Map<String, Value> = (0..MAX_INTROS + 10).map(|i| (format!("k-{i}"), json!(i))).collect();
        let out = sanitize(&pdoc(1, 0, Some(Value::Object(many.clone())))).unwrap();
        assert_eq!(out["intros"].as_object().unwrap().len(), MAX_INTROS);
        let a = pdoc(1, 0, Some(Value::Object(many)));
        assert_eq!(merge(&a, &a).unwrap()["intros"].as_object().unwrap().len(), MAX_INTROS);
    }

    #[test]
    fn intros_merge_is_union_with_min_timestamp() {
        let a = pdoc(10, 0, Some(json!({"k-1": 500, "k-2": 100})));
        let b = pdoc(20, 0, Some(json!({"k-1": 300, "k-3": 700})));
        let m = merge(&a, &b).unwrap();
        assert_eq!(m["intros"], json!({"k-1": 300, "k-2": 100, "k-3": 700}));
        assert_eq!(merge(&b, &a).unwrap()["intros"], m["intros"]);
    }

    #[test]
    fn intros_merge_drops_entries_before_reset_and_ignores_junk() {
        let a = pdoc(10, 0, Some(json!({"k-1": 100, "k-2": 900, "k-3": "x"})));
        let b = pdoc(20, 500, Some(json!({"k-4": 600})));
        let m = merge(&a, &b).unwrap();
        assert_eq!(m["intros"], json!({"k-2": 900, "k-4": 600}));
    }

    #[test]
    fn intros_merge_leaves_docs_without_intros_alone() {
        let m = merge(&pdoc(1, 0, None), &pdoc(2, 0, None)).unwrap();
        assert!(m.get("intros").is_none());
        let m = merge(&pdoc(1, 0, None), &pdoc(2, 0, Some(json!({"k-1": 5})))).unwrap();
        assert_eq!(m["intros"], json!({"k-1": 5}));
    }

    #[test]
    fn merge_never_panics_on_odd_documents() {
        let odd = serde_json::json!({"t": "x", "items": [], "stats": 3, "settings": "s", "exams": 1});
        assert!(merge(&odd, &odd).is_ok());
        assert_eq!(merge(&Value::Null, &odd), Err(MergeError::InvalidDocument));
    }

    #[test]
    fn null_tombstone_settings_survive_sanitize_and_merge() {
        let key = "unit:u1:dropOnWrong";
        let mk = |t: u64, val: Value, ts: u64| {
            let mut d = json!({"v": 1, "t": t, "resetAt": 0, "items": {}, "stats": {}, "settings": {"t": t, "ts": {}}});
            d["settings"][key] = val;
            d["settings"]["ts"][key] = json!(ts);
            d
        };
        let old = mk(10, json!(3), 10);
        let cleared = mk(20, Value::Null, 20);
        assert_eq!(sanitize(&cleared).unwrap()["settings"][key], Value::Null);
        assert!(sanitize(&cleared).unwrap()["settings"].as_object().unwrap().contains_key(key));
        for (a, b) in [(&old, &cleared), (&cleared, &old)] {
            let m = merge(a, b).unwrap();
            assert!(m["settings"].as_object().unwrap().contains_key(key));
            assert_eq!(m["settings"][key], Value::Null);
            assert_eq!(m["settings"]["ts"][key], json!(20));
        }
    }
}
