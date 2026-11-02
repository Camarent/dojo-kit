use super::{int_field, is_due, is_new};
use crate::progress::{num_i64, truthy};
use serde_json::{Map, Value};
use std::collections::HashMap;

const DEFAULT_WEAKEST_LIMIT: usize = 10;
const WEAK_STAGE_BELOW: i64 = 3;
const WEAK_STAGE_BONUS: f64 = 0.1;

/// Ids to show now: `due` oldest first, `fresh` in course order.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Queue {
    pub due: Vec<String>,
    pub fresh: Vec<String>,
}


struct Candidate<'a> {
    id: &'a str,
    score: f64,
    bad: i64,
    last: f64,
}

fn candidate<'a>(id: &'a str, rec: &Value) -> Option<Candidate<'a>> {
    let rec = rec.is_object().then_some(rec)?;
    let bad = int_field(Some(rec), "bad");
    if bad <= 0 {
        return None;
    }
    let ok = int_field(Some(rec), "ok");
    let low_stage = rec.get("s").and_then(num_i64).is_some_and(|s| s < WEAK_STAGE_BELOW);
    let score = (bad as f64 + 1.0) / (ok as f64 + bad as f64 + 2.0) + if low_stage { WEAK_STAGE_BONUS } else { 0.0 };
    let last = rec.get("last").and_then(Value::as_f64).unwrap_or(0.0);
    Some(Candidate { id, score, bad, last })
}

/// Ids of records with wrong answers, weakest first (ties keep `items` order).
/// `valid_ids`, when an object `{id: truthy}`, restricts the result; `limit` defaults to 10.
pub fn weakest(items: &Value, limit: Option<usize>, valid_ids: Option<&Value>) -> Vec<String> {
    let Some(items) = items.as_object() else { return Vec::new() };
    let allowed = |id: &str| match valid_ids {
        Some(Value::Object(valid)) => valid.get(id).is_some_and(truthy),
        _ => true,
    };
    let mut list: Vec<Candidate> = items
        .iter()
        .filter(|(id, _)| allowed(id))
        .filter_map(|(id, rec)| candidate(id, rec))
        .collect();
    list.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then(b.bad.cmp(&a.bad))
            .then(b.last.total_cmp(&a.last))
    });
    list.into_iter()
        .take(limit.unwrap_or(DEFAULT_WEAKEST_LIMIT))
        .map(|c| c.id.to_string())
        .collect()
}

/// Due ids (only those listed in `order`, oldest `due` first) and up to `new_allowance` ids of `order` without a record.
pub fn build_queue(items: &Value, order: &[String], now: i64, new_allowance: i64) -> Queue {
    build_queue_with_caps(items, order, now, new_allowance, None, None)
}

/// Due ids (only those listed in `order`, oldest `due` first) and up to `new_allowance` ids of `order` without a record.
/// When `unit_new_caps` and `item_units` are provided, new items are also limited by their unit's cap (in addition to the global cap).
/// The global cap still applies overall.
pub fn build_queue_with_caps(
    items: &Value,
    order: &[String],
    now: i64,
    new_allowance: i64,
    unit_new_caps: Option<&HashMap<String, u32>>,
    item_units: Option<&HashMap<String, String>>,
) -> Queue {
    let empty = Map::new();
    let items = items.as_object().unwrap_or(&empty);

    let mut due: Vec<(&str, i64)> = items
        .iter()
        .filter(|(id, rec)| order.contains(id) && is_due(Some(rec), now))
        .map(|(id, rec)| (id.as_str(), int_field(Some(rec), "due")))
        .collect();
    due.sort_by_key(|&(_, due)| due);

    // Build a map of unit -> count of new items for that unit
    let mut unit_counts: HashMap<String, usize> = HashMap::new();
    let allowance = usize::try_from(new_allowance.max(0)).unwrap_or(usize::MAX);
    
    let fresh: Vec<String> = order
        .iter()
        .filter(|id| is_new(items.get(id.as_str())))
        .filter_map(|id| {
            // Check per-unit cap if provided
            if let Some(item_units_map) = item_units
                && let Some(unit_id) = item_units_map.get(id.as_str())
                    && let Some(caps) = unit_new_caps
                        && let Some(&cap) = caps.get(unit_id.as_str()) {
                            let cap_usize = cap as usize;
                            let current_count = unit_counts.entry(unit_id.clone()).or_insert(0);
                            if *current_count >= cap_usize {
                                return None;
                            }
                            *current_count += 1;
                        }
            Some(id.clone())
        })
        .take(allowance)
        .collect();

    Queue { due: due.into_iter().map(|(id, _)| id.to_string()).collect(), fresh }
}
