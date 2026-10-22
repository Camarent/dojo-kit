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

// Contract: `recs` is non-empty: its only caller passes a vector holding at least one predecessor record.
#[allow(clippy::indexing_slicing)]
fn pick<'a>(recs: &[&'a Map<String, Value>], k: &str, max: bool) -> &'a Value {
    let mut best = recs[0];
    for r in &recs[1..] {
        let (a, b) = (num(r, k), num(best, k));
        if (max && a > b) || (!max && a < b) {
            best = r;
        }
    }
    &best[k]
}

/// Folds records of retired predecessors into their successors. Fold applies to a successor when a valid predecessor
/// exists and the successor has no record or some predecessor has a strictly greater `last`. Folded record:
/// `s`, `due` = min; `ok`, `bad`, `last` = max; other fields from the record with the greatest `last`
/// (ties: successor first, then predecessors by ascending id). Invalid successor records are kept and listed in `skipped`.
/// Predecessors with `last < resetAt` are ignored when `resetAt != 0`. Idempotent.
// Contract: `recs` holds at least the predecessor records (`pred_recs` is non-empty, checked above); `doc` is an object when `items` is assigned.
#[allow(clippy::indexing_slicing)]
pub fn migrate_progress(doc: &Value, links: &Links) -> Result<Migration, MigrateError> {
    let mut doc = sanitize(doc).ok_or(MigrateError::InvalidDocument)?;
    let reset_at = doc.get("resetAt").and_then(Value::as_f64).unwrap_or(0.0);
    let mut items = doc["items"].as_object().cloned().unwrap_or_default();
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
        if let Some(s) = own_valid {
            if !pred_recs.iter().any(|p| num(p, "last") > num(s, "last")) {
                continue;
            }
        }
        let mut recs: Vec<&Map<String, Value>> = own_valid.into_iter().collect();
        recs.extend(pred_recs);
        let mut out = recs[0].clone();
        for r in &recs[1..] {
            if num(r, "last") > num(&out, "last") {
                out = (*r).clone();
            }
        }
        out.insert("s".into(), pick(&recs, "s", false).clone());
        out.insert("due".into(), pick(&recs, "due", false).clone());
        out.insert("ok".into(), pick(&recs, "ok", true).clone());
        out.insert("bad".into(), pick(&recs, "bad", true).clone());
        out.insert("last".into(), pick(&recs, "last", true).clone());
        items.insert(succ.clone(), Value::Object(out));
        folded.push(succ.clone());
    }
    let doc = if folded.is_empty() {
        None
    } else {
        doc["items"] = Value::Object(items);
        Some(doc)
    };
    Ok(Migration { doc, folded, skipped })
}
