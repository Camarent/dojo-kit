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
fn coerce_f64(v: &Value) -> f64 {
    let n = match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse::<f64>().ok(),
        Value::Bool(b) => Some(f64::from(u8::from(*b))),
        _ => None,
    };
    n.filter(|x| x.is_finite()).unwrap_or(0.0)
}

/// JavaScript `v | 0` (without 32-bit wrapping) for JSON values.
fn coerce_i64(v: &Value) -> i64 {
    num_i64(v).unwrap_or_else(|| coerce_f64(v).trunc() as i64)
}

/// A JSON number; whole values below 2^53 become integers.
fn json_number(f: f64) -> Value {
    if f.is_finite() && f.fract() == 0.0 && f.abs() < MAX_SAFE_INTEGER {
        Value::from(f as i64)
    } else {
        Number::from_f64(f).map_or_else(|| Value::from(0), Value::Number)
    }
}

/// Numeric value of `v` as a JSON number; integers are kept exactly.
fn num_value(v: &Value) -> Value {
    match v {
        Value::Number(n) if n.is_i64() || n.is_u64() => v.clone(),
        _ => json_number(coerce_f64(v)),
    }
}

fn field_f64(map: &Map<String, Value>, key: &str) -> f64 {
    map.get(key).map_or(0.0, coerce_f64)
}

fn is_date_key(k: &str) -> bool {
    let b = k.as_bytes();
    b.len() == 10
        && b.iter().enumerate().all(|(i, c)| if i == 4 || i == 7 { *c == b'-' } else { c.is_ascii_digit() })
}

fn is_day_map(v: &Value) -> bool {
    v.as_object().is_some_and(|m| m.keys().any(|k| is_date_key(k)))
}

fn is_day_stat(key: &str, values: &[Option<&Value>]) -> bool {
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
    let placement_done = out.get("placementDone").is_some_and(truthy);
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

fn rec_last(rec: &Value) -> f64 {
    rec.as_object().map_or(0.0, |r| field_f64(r, "last"))
}

fn rec_stage(rec: &Value) -> f64 {
    rec.as_object().map_or(0.0, |r| field_f64(r, "s"))
}

fn merge_items(docs: [&Map<String, Value>; 2], reset_at: f64) -> Value {
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

fn stats_of(doc: &Map<String, Value>) -> Option<&Map<String, Value>> {
    doc.get("stats").and_then(Value::as_object)
}

fn merge_day_map(key: &str, docs: [&Map<String, Value>; 2], reset_at: f64) -> Value {
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

fn merge_stats(older: &Map<String, Value>, newer: &Map<String, Value>, reset_at: f64) -> Value {
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

/// Intro cards seen: union by entity, earliest timestamp wins, entries older than `reset_at` dropped.
fn merge_intros(docs: [&Map<String, Value>; 2], reset_at: f64) -> Value {
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

fn merge_exams(docs: [&Map<String, Value>; 2], reset_at: f64) -> Value {
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

fn merge_settings(a: &Map<String, Value>, b: &Map<String, Value>) -> Value {
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

fn merge_settings_docs(a: &Map<String, Value>, b: &Map<String, Value>) -> Option<Value> {
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

/// `examDraft` is valid when it is an object with a string `sid` and a numeric `updatedAt`.
fn is_valid_draft(d: &Value) -> bool {
    d.as_object()
        .is_some_and(|o| o.get("sid").is_some_and(Value::is_string) && o.get("updatedAt").is_some_and(Value::is_number))
}

fn is_closed_draft(d: &Value) -> bool {
    d.as_object().is_some_and(|o| o.get("closed").is_some_and(Value::is_string))
}

fn draft_sid(d: &Value) -> &str {
    d.get("sid").and_then(Value::as_str).unwrap_or("")
}

fn draft_updated_at(d: &Value) -> f64 {
    d.get("updatedAt").map_or(0.0, coerce_f64)
}

fn draft_answer_count(d: &Value) -> usize {
    d.get("answers").and_then(Value::as_array).map_or(0, Vec::len)
}

/// Bounds a closedSids list to `CLOSED_SIDS_BOUND` valid entries, keeping the largest `updatedAt` (ties: larger sid).
fn bound_closed_sids(list: &[Value]) -> Vec<Value> {
    if list.len() <= CLOSED_SIDS_BOUND {
        return list.to_vec();
    }
    let mut entries: Vec<(&Value, f64)> = list.iter().filter_map(|e| {
        is_valid_draft(e).then(|| (e, draft_updated_at(e)))
    }).collect();
    entries.sort_by(|a, b| {
        b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal).then_with(|| draft_sid(b.0).cmp(draft_sid(a.0)))
    });
    entries.truncate(CLOSED_SIDS_BOUND);
    entries.into_iter().map(|(v, _)| v.clone()).collect()
}

/// Maximum number of closed-sid entries kept in `examDraft.closedSids`.
const CLOSED_SIDS_MAX: usize = 32;
/// Reason used for tombstones synthesised from `closedSids`; ranks below every other reason.
const SYNTHETIC_REASON: &str = "expired";
/// Bound for input closedSids lists before merging: 4 * CLOSED_SIDS_MAX.
const CLOSED_SIDS_BOUND: usize = 4 * CLOSED_SIDS_MAX;

fn closed_reason(d: &Value) -> &str {
    d.get("closed").and_then(Value::as_str).unwrap_or("")
}

fn tombstone(sid: &str, updated_at: f64, reason: &str) -> Value {
    serde_json::json!({"sid": sid, "updatedAt": json_number(updated_at), "closed": reason})
}

/// `examDraft` without its `closedSids` bookkeeping, for comparing payloads.
fn draft_payload_json(d: &Value) -> String {
    let mut d = d.clone();
    if let Some(o) = d.as_object_mut() {
        o.remove("closedSids");
    }
    stable_json(&d)
}

/// Total order on candidate drafts (the greatest becomes the slot): `updatedAt`, then `sid` (UTF-16), then closed
/// over open, then for closed the reason (`expired` lowest, then UTF-16), for open more `answers` then stable JSON.
fn draft_cmp(x: &Value, y: &Value) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    let (xc, yc) = (is_closed_draft(x), is_closed_draft(y));
    draft_updated_at(x)
        .partial_cmp(&draft_updated_at(y))
        .unwrap_or(Ordering::Equal)
        .then_with(|| utf16_cmp(draft_sid(x), draft_sid(y)))
        .then_with(|| xc.cmp(&yc))
        .then_with(|| {
            if xc && yc {
                let (rx, ry) = (closed_reason(x), closed_reason(y));
                (rx != SYNTHETIC_REASON).cmp(&(ry != SYNTHETIC_REASON)).then_with(|| utf16_cmp(rx, ry))
            } else {
                draft_answer_count(x)
                    .cmp(&draft_answer_count(y))
                    .then_with(|| utf16_cmp(&draft_payload_json(x), &draft_payload_json(y)))
            }
        })
}

/// Outcome of merging the `examDraft` fields of two documents.
enum DraftMerge {
    /// Neither side has a usable draft: keep the generic top-level result.
    Generic,
    /// Valid drafts existed but all predate `resetAt`: remove the key.
    Drop,
    Use(Value),
}

/// Join of the draft state `(closed, slot)`: `closed` is a bounded grow-only map sid -> updatedAt (stored as
/// `closedSids: [{sid, updatedAt}]` inside the slot), `slot` is the greatest candidate under `draft_cmp`. Candidates
/// are the drafts themselves (closed ones reduced to a canonical tombstone) and one tombstone per closed entry.
/// Commutative, associative and idempotent; a sid in `closedSids` is closed whatever the slot holds.
fn merge_draft(a: Option<&Value>, b: Option<&Value>, reset_at: f64) -> DraftMerge {
    merge_draft_bounded(a, b, reset_at, CLOSED_SIDS_MAX)
}

fn merge_draft_bounded(a: Option<&Value>, b: Option<&Value>, reset_at: f64, bound: usize) -> DraftMerge {
    let fresh = |t: f64| reset_at == 0.0 || t >= reset_at;
    let mut valid_seen = false;
    let mut closed: std::collections::BTreeMap<String, f64> = std::collections::BTreeMap::new();
    let mut note_closed = |sid: &str, t: f64| {
        let e = closed.entry(sid.to_string()).or_insert(t);
        if t > *e {
            *e = t;
        }
    };
    let mut best: Option<Value> = None;
    let consider = |c: Value, best: &mut Option<Value>| {
        if best.as_ref().is_none_or(|b| draft_cmp(&c, b) == std::cmp::Ordering::Greater) {
            *best = Some(c);
        }
    };
    for d in [a, b].into_iter().flatten().filter(|d| is_valid_draft(d)) {
        valid_seen = true;
        if let Some(list) = d.get("closedSids").and_then(Value::as_array) {
            let bounded_list = bound_closed_sids(list);
            for e in bounded_list.iter().filter(|e| is_valid_draft(e)) {
                let t = draft_updated_at(e);
                if fresh(t) {
                    note_closed(draft_sid(e), t);
                    consider(tombstone(draft_sid(e), t, SYNTHETIC_REASON), &mut best);
                }
            }
        }
        let t = draft_updated_at(d);
        if !fresh(t) {
            continue;
        }
        if is_closed_draft(d) {
            note_closed(draft_sid(d), t);
            consider(tombstone(draft_sid(d), t, closed_reason(d)), &mut best);
        } else {
            consider(d.clone(), &mut best);
        }
    }
    let Some(mut slot) = best else {
        return if valid_seen { DraftMerge::Drop } else { DraftMerge::Generic };
    };
    let mut entries: Vec<(&String, &f64)> = closed.iter().collect();
    entries.sort_by(|x, y| x.1.partial_cmp(y.1).unwrap_or(std::cmp::Ordering::Equal).then_with(|| utf16_cmp(x.0, y.0)));
    let skip = entries.len().saturating_sub(bound);
    let list: Vec<Value> = entries[skip..]
        .iter()
        .map(|(sid, t)| serde_json::json!({"sid": sid, "updatedAt": json_number(**t)}))
        .collect();
    if let Some(o) = slot.as_object_mut() {
        if list.is_empty() {
            o.remove("closedSids");
        } else {
            o.insert("closedSids".into(), Value::Array(list));
        }
    }
    DraftMerge::Use(slot)
}

/// Merges two progress documents without losing data except through `resetAt`.
///
/// Items: union by id, later `last` wins (higher `s` on ties), records older than the newest `resetAt` dropped.
/// Stats: per-date max over the sides at the newest `resetAt`, newest 150 dates kept. Exams: union by key.
/// Intros: union by entity, minimum timestamp, entries before `resetAt` dropped. Settings: per-field by `ts`. Other top-level fields: union, the document with the larger `t` wins.
pub fn merge(a: &Value, b: &Value) -> Result<Value, MergeError> {
    let (Some(ao), Some(bo)) = (a.as_object(), b.as_object()) else {
        return Err(MergeError::InvalidDocument);
    };
    if let (Some(Value::String(ca)), Some(Value::String(cb))) = (ao.get("course"), bo.get("course")) {
        if ca != cb {
            return Err(MergeError::CourseMismatch);
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
    match merge_draft(ao.get("examDraft"), bo.get("examDraft"), reset_at) {
        DraftMerge::Use(draft) => {
            out.insert("examDraft".into(), draft);
        }
        DraftMerge::Drop => {
            out.remove("examDraft");
        }
        DraftMerge::Generic => {}
    }
    Ok(Value::Object(out))
}

fn utf16_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

fn write_stable(v: &Value, out: &mut String) {
    match v {
        Value::Object(map) => {
            let mut entries: Vec<(&String, &Value)> = map.iter().collect();
            entries.sort_by(|a, b| utf16_cmp(a.0, b.0));
            out.push('{');
            for (i, (key, value)) in entries.into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&Value::String(key.clone()).to_string());
                out.push(':');
                write_stable(value, out);
            }
            out.push('}');
        }
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_stable(item, out);
            }
            out.push(']');
        }
        Value::Number(n) if !n.is_i64() && !n.is_u64() => out.push_str(&json_number(n.as_f64().unwrap_or(0.0)).to_string()),
        other => out.push_str(&other.to_string()),
    }
}

/// Compact JSON text with object keys sorted recursively and whole numbers printed without a fraction.
pub fn stable_json(v: &Value) -> String {
    let mut out = String::new();
    write_stable(v, &mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_writes_float_valued_whole_numbers_as_integers() {
        let text = r#"{"v":1,"items":{"a":{"s":2,"due":1760000000000.0,"ok":1,"bad":0,"last":1760000000000.0}}}"#;
        let doc: Value = serde_json::from_str(text).unwrap();
        let out = serde_json::to_string(&sanitize(&doc).unwrap()["items"]["a"]).unwrap();
        assert!(out.contains(r#""due":1760000000000,"#), "{out}");
        assert!(out.contains(r#""last":1760000000000}"#), "{out}");
        assert!(!out.contains(".0"), "{out}");
    }

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
    fn stable_json_prints_whole_floats_without_fraction() {
        let doc: Value = serde_json::from_str(r#"{"b":2.0,"a":[1.5,3.0]}"#).unwrap();
        assert_eq!(stable_json(&doc), r#"{"a":[1.5,3],"b":2}"#);
    }

    #[test]
    fn merge_never_panics_on_odd_documents() {
        let odd = serde_json::json!({"t": "x", "items": [], "stats": 3, "settings": "s", "exams": 1});
        assert!(merge(&odd, &odd).is_ok());
        assert_eq!(merge(&Value::Null, &odd), Err(MergeError::InvalidDocument));
    }

    use serde_json::json;

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

    fn doc(t: u64, reset: u64, extra: Value) -> Value {
        let mut d = json!({"v": 1, "t": t, "resetAt": reset, "items": {}, "stats": {}, "settings": {}});
        for (k, v) in extra.as_object().unwrap() {
            d[k] = v.clone();
        }
        d
    }

    fn draft_of(a: Value, b: Value) -> Option<Value> {
        let ab = merge(&a, &b).unwrap();
        let ba = merge(&b, &a).unwrap();
        assert_eq!(ab, ba, "merge must be commutative");
        ab.get("examDraft").cloned()
    }

    fn with(t: u64, reset: u64, d: Value) -> Value {
        doc(t, reset, json!({"examDraft": d}))
    }

    #[test]
    fn draft_absent_on_both_stays_absent() {
        assert_eq!(draft_of(doc(1, 0, json!({})), doc(2, 0, json!({}))), None);
    }

    #[test]
    fn draft_one_side_survives_with_unknown_fields() {
        let d = json!({"sid": "s", "updatedAt": 5, "x": {"y": [1]}, "answers": [{"i": 0, "c": true, "g": "a"}]});
        assert_eq!(draft_of(with(1, 0, d.clone()), doc(9, 0, json!({}))), Some(d));
    }

    #[test]
    fn draft_same_sid_closed_is_never_resurrected_by_newer_open() {
        let open = json!({"sid": "s", "updatedAt": 900, "answers": [{"i": 0, "c": true}]});
        let closed = json!({"sid": "s", "updatedAt": 1, "closed": "finished"});
        let got = draft_of(with(1, 0, open.clone()), with(2, 0, closed)).unwrap();
        assert_eq!(got["closedSids"], json!([{"sid": "s", "updatedAt": 1}]));
        assert_eq!(got["sid"], "s");
        assert_eq!(got["updatedAt"], 900);
    }

    #[test]
    fn draft_same_sid_open_later_updated_at_then_more_answers() {
        let old = json!({"sid": "s", "updatedAt": 1});
        let new = json!({"sid": "s", "updatedAt": 2});
        assert_eq!(draft_of(with(5, 0, old), with(1, 0, new.clone())), Some(new));
        let few = json!({"sid": "s", "updatedAt": 2, "answers": []});
        let many = json!({"sid": "s", "updatedAt": 2, "answers": [{"i": 0, "c": false}]});
        assert_eq!(draft_of(with(5, 0, few), with(1, 0, many.clone())), Some(many));
    }

    #[test]
    fn draft_same_sid_full_tie_larger_stable_json() {
        let a = json!({"sid": "s", "updatedAt": 2, "z": 1});
        let b = json!({"sid": "s", "updatedAt": 2, "z": 2});
        assert_eq!(draft_of(with(1, 0, a), with(1, 0, b.clone())), Some(b));
    }

    #[test]
    fn draft_other_sid_later_wins_tie_larger_sid_then_closed() {
        let s1 = json!({"sid": "s1", "updatedAt": 1});
        let s2 = json!({"sid": "s2", "updatedAt": 2});
        assert_eq!(draft_of(with(1, 0, s1.clone()), with(1, 0, s2.clone())), Some(s2));
        let closed = json!({"sid": "s1", "updatedAt": 1, "closed": "abandoned"});
        assert_eq!(draft_of(with(1, 0, s1.clone()), with(1, 0, closed)).unwrap()["closed"], "abandoned");
        let s0 = json!({"sid": "s0", "updatedAt": 1});
        assert_eq!(draft_of(with(1, 0, s0), with(1, 0, s1.clone())), Some(s1));
    }

    #[test]
    fn draft_reset_at_drops_older_drafts_only() {
        let old = json!({"sid": "s", "updatedAt": 50});
        assert_eq!(draft_of(with(1, 100, old.clone()), doc(2, 100, json!({}))), None);
        assert_eq!(draft_of(with(1, 0, old), doc(2, 100, json!({}))), None);
        let fresh = json!({"sid": "t", "updatedAt": 100});
        assert_eq!(draft_of(with(1, 0, json!({"sid": "s", "updatedAt": 50})), with(1, 100, fresh.clone())), Some(fresh));
    }

    #[test]
    fn draft_invalid_keeps_generic_top_level_result() {
        let bad = json!({"updatedAt": 100});
        let other = json!({"sid": 3, "updatedAt": 1});
        // larger t wins whole, as for any unknown top-level field
        assert_eq!(draft_of(with(1, 0, bad.clone()), with(2, 0, other.clone())), Some(other.clone()));
        assert_eq!(draft_of(with(3, 0, bad.clone()), doc(2, 0, json!({}))), Some(bad));
        let good = json!({"sid": "s", "updatedAt": 1});
        assert_eq!(draft_of(with(9, 0, json!("junk")), with(1, 0, good.clone())), Some(good));
    }

    #[test]
    fn draft_sanitize_keeps_draft_byte_identical() {
        let d = json!({"sid": "s", "updatedAt": 5, "extra": [1, {"k": null}], "answers": [{"i": 0, "c": true, "g": "x"}]});
        let out = sanitize(&with(1, 0, d.clone())).unwrap();
        assert_eq!(out.get("examDraft"), Some(&d));
    }

    fn step(a: &Option<Value>, b: &Option<Value>, bound: usize) -> Option<Value> {
        match merge_draft_bounded(a.as_ref(), b.as_ref(), 0.0, bound) {
            DraftMerge::Use(v) => Some(v),
            DraftMerge::Drop => None,
            DraftMerge::Generic => a.clone().or_else(|| b.clone()),
        }
    }

    fn pool() -> Vec<Value> {
        let mut seed = 12345u64;
        let mut next = move |m: u64| {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            (seed >> 33) % m
        };
        let mut out = vec![
            json!({"sid": "s1", "updatedAt": 100}),
            json!({"sid": "s1", "updatedAt": 50, "closed": "finished"}),
            json!({"sid": "s2", "updatedAt": 75}),
        ];
        for _ in 0..24 {
            let sid = format!("s{}", next(4));
            let t = 1 + next(5);
            let mut d = json!({"sid": sid, "updatedAt": t});
            match next(4) {
                0 => d["closed"] = json!(["finished", "abandoned", "expired", "zzz"][next(4) as usize]),
                1 => d["answers"] = json!(vec![json!({"i": 0, "c": true}); next(3) as usize]),
                2 => d["index"] = json!(next(3)),
                _ => {}
            }
            if next(3) == 0 {
                d["closedSids"] = json!([{"sid": format!("s{}", next(4)), "updatedAt": 1 + next(5)}, {"sid": "x", "updatedAt": 2}]);
            }
            out.push(d);
        }
        out
    }

    #[test]
    fn draft_merge_is_a_join_commutative_associative_idempotent() {
        let pool: Vec<Option<Value>> = pool().into_iter().map(Some).collect();
        for bound in [1, 2, 3, CLOSED_SIDS_MAX] {
            for x in &pool {
                assert_eq!(step(x, x, bound), step(&step(x, x, bound), x, bound), "idempotent");
                let xx = step(x, x, bound);
                assert_eq!(step(&xx, &xx, bound), xx);
                for y in &pool {
                    assert_eq!(step(x, y, bound), step(y, x, bound), "commutative");
                    for z in &pool {
                        assert_eq!(step(&step(x, y, bound), z, bound), step(x, &step(y, z, bound), bound), "associative {x:?} {y:?} {z:?}");
                    }
                }
            }
        }
    }

    #[test]
    fn draft_all_fold_orders_give_the_same_result() {
        fn permutations(items: &mut Vec<usize>, k: usize, out: &mut Vec<Vec<usize>>) {
            if k == items.len() {
                out.push(items.clone());
                return;
            }
            for i in k..items.len() {
                items.swap(k, i);
                permutations(items, k + 1, out);
                items.swap(k, i);
            }
        }
        let pool = pool();
        for start in 0..pool.len() - 5 {
            let set: Vec<Option<Value>> = pool[start..start + 5].iter().cloned().map(Some).collect();
            let mut orders = Vec::new();
            permutations(&mut (0..5).collect(), 0, &mut orders);
            let results: Vec<Option<Value>> = orders
                .iter()
                .map(|o| o.iter().skip(1).fold(set[o[0]].clone(), |acc, &i| step(&acc, &set[i], 2)))
                .collect();
            assert!(results.windows(2).all(|w| w[0] == w[1]), "fold order changed the result for start {start}");
        }
    }

    #[test]
    fn draft_reviewer_cycle_x_y_z_gives_one_result_and_stays_closed() {
        let x = json!({"sid": "s1", "updatedAt": 100});
        let y = json!({"sid": "s1", "updatedAt": 50, "closed": "finished"});
        let z = json!({"sid": "s2", "updatedAt": 75});
        let d = |v: &Value| doc(1, 0, json!({"examDraft": v}));
        let (dx, dy, dz) = (d(&x), d(&y), d(&z));
        let m = |p: &Value, q: &Value| merge(p, q).unwrap();
        let first = m(&m(&dx, &dy), &dz);
        for r in [m(&dx, &m(&dy, &dz)), m(&m(&dx, &dz), &dy), m(&m(&dz, &dy), &dx), m(&dz, &m(&dx, &dy))] {
            assert_eq!(r, first);
        }
        let got = &first["examDraft"];
        assert_eq!(got["sid"], "s1");
        assert_eq!(got["closedSids"], json!([{"sid": "s1", "updatedAt": 50}]));
    }

    #[test]
    fn draft_closed_sids_are_bounded_keeping_the_largest() {
        let mk = |i: u64| json!({"sid": format!("s{i}"), "updatedAt": i, "closed": "finished"});
        let all: Vec<Option<Value>> = (1..=6).map(|i| Some(mk(i))).collect();
        let r = all.iter().skip(1).fold(all[0].clone(), |acc, d| step(&acc, d, 3)).unwrap();
        assert_eq!(r["closedSids"].as_array().unwrap().len(), 3);
        assert_eq!(r["closedSids"][0]["sid"], "s4");
    }

    #[test]
    fn draft_reset_at_drops_closed_sids_too() {
        let d = json!({"sid": "s2", "updatedAt": 200, "closedSids": [{"sid": "s1", "updatedAt": 10}]});
        let got = draft_of(with(1, 100, d), doc(1, 0, json!({}))).unwrap();
        assert!(got.get("closedSids").is_none());
    }

    #[test]
    fn draft_closed_sids_bound_large_input() {
        // Create a 200k-entry list - this should be bounded to CLOSED_SIDS_BOUND
        let mut large_list = Vec::with_capacity(200_000);
        for i in 0..200_000u64 {
            large_list.push(json!({"sid": format!("s{i}"), "updatedAt": i}));
        }
        let d = json!({"sid": "s0", "updatedAt": 0, "closedSids": large_list});
        let doc_a = doc(1, 0, json!({"examDraft": d}));
        let doc_b = doc(2, 0, json!({}));
        let got = draft_of(doc_a, doc_b).unwrap();
        // The output should still have at most CLOSED_SIDS_MAX entries
        let closed_sids = got.get("closedSids").and_then(Value::as_array);
        assert!(closed_sids.is_some());
        assert!(closed_sids.unwrap().len() <= CLOSED_SIDS_MAX);
        assert!(closed_sids.unwrap().iter().any(|e| e["sid"] == "s199999"));
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
