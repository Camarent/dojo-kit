use crate::progress::sanitize;
use crate::supersedes::Links;
use serde_json::{Map, Value};

/// Why a migration was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MigrateError {
    InvalidDocument,
}

/// Result of [`migrate_progress`]: `doc` is the sanitized document with folds applied, `None` when nothing folded.
#[derive(Debug, Clone, PartialEq)]
pub struct Migration {
    pub doc: Option<Value>,
    pub folded: Vec<String>,
    pub skipped: Vec<String>,
}

fn valid(rec: &Value) -> Option<&Map<String, Value>> {
    let r = rec.as_object()?;
    (r.get("s")?.is_number() && r.get("due")?.is_number()).then_some(r)
}

fn num(r: &Map<String, Value>, k: &str) -> f64 {
    r.get(k).and_then(Value::as_f64).unwrap_or(0.0)
}

fn pick<'a>(recs: &[&'a Map<String, Value>], k: &str, max: bool) -> Option<&'a Value> {
    let (first, rest) = recs.split_first()?;
    let mut best = *first;
    for r in rest {
        let (a, b) = (num(r, k), num(best, k));
        if (max && a > b) || (!max && a < b) {
            best = r;
        }
    }
    Some(&best[k])
}

/// Folds records of retired predecessors into their successors. Fold applies to a successor when a valid predecessor
/// exists and the successor has no record or some predecessor has a strictly greater `last`. Folded record:
/// `s`, `due` = min; `ok`, `bad`, `last` = max; other fields from the record with the greatest `last`
/// (ties: successor first, then predecessors by ascending id). Invalid successor records are kept and listed in `skipped`.
/// Predecessors with `last < resetAt` are ignored when `resetAt != 0`. Idempotent.
pub fn migrate_progress(doc: &Value, links: &Links) -> Result<Migration, MigrateError> {
    let mut doc = sanitize(doc).ok_or(MigrateError::InvalidDocument)?;
    let reset_at = doc.get("resetAt").and_then(Value::as_f64).unwrap_or(0.0);
    let mut items = doc.get("items").and_then(Value::as_object).cloned().unwrap_or_default();
    let (mut folded, mut skipped) = (Vec::new(), Vec::new());
    for (succ, preds) in links.iter() {
        let mut sorted: Vec<&String> = preds.iter().collect();
        sorted.sort_by_key(|p| p.encode_utf16().collect::<Vec<u16>>());
        let pred_recs: Vec<&Map<String, Value>> = sorted
            .iter()
            .filter_map(|p| items.get(*p).and_then(valid))
            .filter(|r| reset_at == 0.0 || num(r, "last") >= reset_at)
            .collect();
        if pred_recs.is_empty() {
            continue;
        }
        let own = items.get(succ);
        let own_valid = own.and_then(valid);
        if own.is_some() && own_valid.is_none() {
            skipped.push(succ.clone());
            continue;
        }
        if let Some(s) = own_valid
            && !pred_recs.iter().any(|p| num(p, "last") > num(s, "last")) {
                continue;
            }
        let mut recs: Vec<&Map<String, Value>> = own_valid.into_iter().collect();
        recs.extend(pred_recs);
        let Some((first, rest)) = recs.split_first() else { continue; };
        let mut out = (*first).clone();
        for r in rest {
            if num(r, "last") > num(&out, "last") {
                out = (*r).clone();
            }
        }
        for (key, max) in [("s", false), ("due", false), ("ok", true), ("bad", true), ("last", true)] {
            if let Some(v) = pick(&recs, key, max) {
                out.insert(key.into(), v.clone());
            }
        }
        items.insert(succ.clone(), Value::Object(out));
        folded.push(succ.clone());
    }
    let doc = if folded.is_empty() {
        None
    } else {
        if let Some(obj) = doc.as_object_mut() {
            obj.insert("items".into(), Value::Object(items));
        }
        Some(doc)
    };
    Ok(Migration { doc, folded, skipped })
}

/// One item's unit membership for [`migrate_doc`]: `unit` is the course unit id (its ladder), `key` the unit key
/// (`<entity>|<aspect>`) that `unify` groups by.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Member {
    pub id: String,
    pub unit: String,
    pub key: String,
}

/// New-ladder stage for an old interval: 0 stays 0; any other interval goes to the nearest step of `ladder`
/// (stage 0 excluded), a tie goes up.
fn remap_stage(interval: f64, ladder: &[i64]) -> i64 {
    if interval <= 0.0 || ladder.len() < 2 {
        return 0;
    }
    let dist = |step: i64| (step as f64 - interval).abs(); // ladder steps are far below 2^53 ms: exact in f64
    let mut best: Option<(usize, i64)> = None;
    for (i, step) in ladder.iter().enumerate().skip(1) {
        if best.is_none_or(|(_, b)| dist(*step) <= dist(b)) {
            best = Some((i, *step));
        }
    }
    best.and_then(|(i, _)| i64::try_from(i).ok()).unwrap_or(0)
}

fn migrate_spec(course: &Value) -> Option<(&str, &Value)> {
    let m = course.get("srs")?.get("migrate")?;
    Some((m.get("id")?.as_str()?, m))
}

fn rec_mut<'a>(items: &'a mut Map<String, Value>, id: &str) -> Option<&'a mut Map<String, Value>> {
    let r = items.get_mut(id)?.as_object_mut()?;
    (r.get("s").is_some_and(Value::is_number) && r.get("due").is_some_and(Value::is_number)).then_some(r)
}

const STATS: [&str; 5] = ["s", "due", "ok", "bad", "last"];

/// Generic progress migration declared by `course.srs.migrate {id, ladderFrom:{<unit>:[old ladder ms]}, unify}`.
/// Runs only when `doc.migrated[id]` is absent, then writes `doc.migrated[id] = now`; `doc` is `None` when nothing
/// ran (no declaration, or already migrated). Order: (3) supersedes fold, (1) ladder remap by the interval of the
/// old stage in the record's own unit (old stage kept in `s0`), (2) `unify` per unit key with 2+ recorded members
/// (max `s`, latest `due`, max `ok`/`bad`/`last`; changed fields kept in `m0`). Never sets `wk`. Deterministic;
/// `members` maps items to units and unit keys. `undo` names a prior id whose marker is reversed first
/// ([`unmigrate`]). `keepLearned {<unit>: minOldStage}` lifts remapped stages of items whose old stage is at least
/// `minOldStage` to the course learned stage (`learned_stage_of`) or higher.
pub fn migrate_doc(doc: &Value, course: &Value, links: &Links, members: &[Member], now: i64) -> Result<Migration, MigrateError> {
    let fold = migrate_progress(doc, links)?;
    let Some((id, spec)) = migrate_spec(course) else {
        return Ok(Migration { doc: None, ..fold });
    };
    let mut out = match fold.doc.clone() {
        Some(d) => d,
        None => sanitize(doc).ok_or(MigrateError::InvalidDocument)?,
    };
    if out.get("migrated").and_then(|m| m.get(id)).is_some() {
        return Ok(Migration { doc: None, folded: Vec::new(), skipped: Vec::new() });
    }
    if let Some(undo) = spec.get("undo").and_then(Value::as_str) {
        out = unmigrate(&out, undo);
    }
    let learned = crate::groups::learned_stage_of(course, None);
    let keep = spec.get("keepLearned").and_then(Value::as_object);
    let mut items = out.get("items").and_then(Value::as_object).cloned().unwrap_or_default();
    for m in members {
        let Some(old) = spec.get("ladderFrom").and_then(|l| l.get(&m.unit)).and_then(Value::as_array) else { continue };
        let old: Vec<f64> = old.iter().map(|v| v.as_f64().unwrap_or(0.0)).collect();
        let new = crate::srs::ladder_for_unit_json(course, &m.unit, None);
        let Some(r) = rec_mut(&mut items, &m.id) else { continue };
        let s = r.get("s").and_then(Value::as_i64).unwrap_or(0).max(0);
        let idx = usize::try_from(s).unwrap_or(0).min(old.len().saturating_sub(1));
        let interval = old.get(idx).copied().unwrap_or(0.0);
        let mut next = remap_stage(interval, &new);
        if let Some(min) = keep.and_then(|k| k.get(&m.unit)).and_then(Value::as_i64)
            && s >= min
        {
            next = next.max(learned);
        }
        r.insert("s0".into(), Value::from(s));
        r.insert("s".into(), Value::from(next));
    }
    if spec.get("unify").and_then(Value::as_bool) == Some(true) {
        let mut groups: Vec<(&str, Vec<&str>)> = Vec::new();
        for m in members.iter().filter(|m| items.get(&m.id).and_then(valid).is_some()) {
            match groups.iter_mut().find(|g| g.0 == m.key) {
                Some(g) => g.1.push(&m.id),
                None => groups.push((&m.key, vec![&m.id])),
            }
        }
        for (_, ids) in groups.into_iter().filter(|g| g.1.len() > 1) {
            let recs: Vec<&Map<String, Value>> = ids.iter().filter_map(|i| items.get(*i).and_then(valid)).collect();
            let best: Vec<(&str, Value)> = STATS.iter().filter_map(|k| Some((*k, pick(&recs, k, true)?.clone()))).collect();
            for i in ids {
                let Some(r) = rec_mut(&mut items, i) else { continue };
                let orig = r.clone();
                if !r.contains_key("s0") {
                    r.insert("s0".into(), orig.get("s").cloned().unwrap_or(Value::from(0)));
                }
                for (k, v) in &best {
                    r.insert((*k).into(), v.clone());
                }
                let changed: Map<String, Value> =
                    STATS[1..].iter().filter(|k| orig.get(**k) != r.get(**k)).filter_map(|k| Some(((*k).to_string(), orig.get(*k)?.clone()))).collect();
                if !changed.is_empty() && !r.contains_key("m0") {
                    r.insert("m0".into(), Value::Object(changed));
                }
            }
        }
    }
    if let Some(obj) = out.as_object_mut() {
        obj.insert("items".into(), Value::Object(items));
        let mut marker = obj.get("migrated").and_then(Value::as_object).cloned().unwrap_or_default();
        marker.insert(id.to_string(), Value::from(now));
        obj.insert("migrated".into(), Value::Object(marker));
    }
    Ok(Migration { doc: Some(out), folded: fold.folded, skipped: fold.skipped })
}

/// Reverse of [`migrate_doc`] for `id`: restores `s` from `s0` and the fields in `m0` (removing both) and removes
/// the marker. Folds are not undone. A doc without the marker is returned unchanged.
pub fn unmigrate(doc: &Value, id: &str) -> Value {
    let mut out = doc.clone();
    let Some(obj) = out.as_object_mut() else { return out };
    let Some(marker) = obj.get_mut("migrated").and_then(Value::as_object_mut) else { return out };
    if marker.remove(id).is_none() {
        return out;
    }
    if marker.is_empty() {
        obj.remove("migrated");
    }
    if let Some(items) = obj.get_mut("items").and_then(Value::as_object_mut) {
        for r in items.values_mut().filter_map(Value::as_object_mut) {
            if let Some(s0) = r.remove("s0") {
                r.insert("s".into(), s0);
            }
            if let Some(Value::Object(m0)) = r.remove("m0") {
                r.extend(m0);
            }
        }
    }
    out
}
