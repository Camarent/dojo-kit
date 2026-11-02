use super::*;
use serde_json::{Map, Value};

/// `None` when no member has a record. `s` = min, `due` = min of present dues, `ok`/`bad`/`last` = max;
/// other fields come from the member with the greatest `last` (tie: first in `members`).
pub fn entity_view(members: &[&str], records: &Map<String, Value>) -> Option<Value> {
    let recs: Vec<&Value> = members.iter().filter_map(|id| records.get(*id)).filter(|r| r.is_object()).collect();
    let mut latest: Option<&Value> = None;
    for r in &recs {
        if latest.is_none_or(|l| int_field(Some(r), "last") > int_field(Some(l), "last")) {
            latest = Some(r);
        }
    }
    let mut out = record_fields(latest);
    let min_of = |key: &str| recs.iter().filter_map(|r| r.get(key).and_then(num_i64)).min();
    out.insert("s".into(), Value::from(recs.iter().map(|r| int_field(Some(r), "s")).min()?));
    if let Some(due) = min_of("due") {
        out.insert("due".into(), Value::from(due));
    }
    for key in ["ok", "bad", "last"] {
        out.insert(key.into(), Value::from(recs.iter().map(|r| int_field(Some(r), key)).max().unwrap_or(0)));
    }
    Some(Value::Object(out))
}

/// How `apply_entity` grades.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntityMode {
    Answer,
    Practice,
    Relearn,
    Placement { seed: u64 },
}

/// One grade for a whole entity: grades `entity_view` with the matching `apply_*` and returns
/// `{member_id: record}` for EVERY member (members without a record inherit). Each record is the member's own
/// record with `s,due,ok,bad,last` replaced. Relearn on a view with `s != 0` (or no view), and placement with
/// `correct = false` or a view already at the target, return an empty map (no writes).
pub fn apply_entity(
    members: &[&str],
    records: &Map<String, Value>,
    mode: EntityMode,
    correct: bool,
    now: i64,
    ladder: &[i64],
    drop: i64,
) -> Map<String, Value> {
    let view = entity_view(members, records);
    let next = match mode {
        EntityMode::Answer => apply_answer_drop(view.as_ref(), correct, now, ladder, drop),
        EntityMode::Practice => apply_practice_drop(view.as_ref(), correct, now, ladder, drop),
        EntityMode::Relearn => match view.as_ref() {
            Some(v) if int_field(Some(v), "s") == 0 => apply_relearn(Some(v), now, ladder).unwrap_or(Value::Null),
            _ => return Map::new(),
        },
        EntityMode::Placement { seed } => {
            if !correct {
                return Map::new();
            }
            let next = apply_placement(view.as_ref(), true, now, ladder, seed);
            if Some(&next) == view.as_ref() {
                return Map::new();
            }
            next
        }
    };
    let mut out = Map::new();
    for id in members {
        let mut rec = records.get(*id).filter(|r| r.is_object()).and_then(Value::as_object).cloned().unwrap_or_default();
        for key in ["s", "due", "ok", "bad", "last"] {
            if let Some(v) = next.get(key) {
                rec.insert(key.into(), v.clone());
            }
        }
        out.insert((*id).to_string(), Value::Object(rec));
    }
    out
}

/// Members to ask for one entity slot: seeded shuffle (`course|day|entity`) of `members`, first `min(n, len)`; `n = 0` counts as 1.
pub fn pick_drill(members: &[String], n: usize, course_id: &str, day: &str, entity: &str) -> Vec<String> {
    let mut list = members.to_vec();
    let mut state = crate::rng::fnv1a(&format!("{course_id}|{day}|{entity}"));
    crate::rng::seeded_shuffle(&mut list, &mut state);
    list.truncate(n.max(1));
    list
}
