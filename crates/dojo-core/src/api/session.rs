use super::*;
use super::topics;
use crate::groups::ItemMeta;
use crate::session::{self, Answer, SessionFilter, SessionInput};
use crate::content::SessionSettings;
use std::collections::BTreeMap;

pub(super) fn session_call(name: &str, a: &Value) -> Result<Value, CallError> {
    match name {
        "buildSession" => build_session(a),
        "sessionRequeue" => requeue(a),
        "sessionFinish" => finish(a),
        other => Err(CallError { code: "unknown_function", message: format!("unknown function `{other}`") }),
    }
}

/// Optional `seed` as a decimal u64 string; absent or null is `None`.
fn opt_seed(a: &Value) -> Result<Option<u64>, CallError> {
    match a.get("seed") {
        None | Some(Value::Null) => Ok(None),
        Some(v) => v.as_str().and_then(|s| s.parse().ok()).map(Some).ok_or_else(|| bad("`seed` must be a decimal u64 string")),
    }
}

/// Optional non-negative integer; absent or null is `default`.
fn opt_count(a: &Value, key: &str, default: usize) -> Result<usize, CallError> {
    match a.get(key) {
        None | Some(Value::Null) => Ok(default),
        Some(v) => v.as_u64().and_then(|n| usize::try_from(n).ok()).ok_or_else(|| bad(format!("`{key}` must be an integer >= 0"))),
    }
}

/// `items` as `ItemMeta`, same fields as `groupCounts`: `id`, `unit`, optional `entity`, `tags`, `retired`/`status`.
fn item_metas(a: &Value) -> Result<Vec<ItemMeta>, CallError> {
    let mut out = Vec::new();
    for m in field(a, "items")?.as_array().ok_or_else(|| bad("`items` must be an array"))? {
        let id = text(m, "id")?.to_string();
        out.push(ItemMeta {
            unit: text(m, "unit")?.to_string(),
            entity: opt_string(m, "entity")?.unwrap_or_else(|| id.clone()),
            tags: opt_strings(m, "tags")?.unwrap_or_default(),
            retired: flag(m, "retired") || m.get("status").and_then(Value::as_str) == Some("retired"),
            id,
        });
    }
    Ok(out)
}

/// Optional `filter` `{topic?, aspect?}` (strings); absent or null is `None`.
fn opt_filter(a: &Value) -> Result<Option<SessionFilter>, CallError> {
    match a.get("filter") {
        None | Some(Value::Null) => Ok(None),
        Some(f) => Ok(Some(SessionFilter { topic: opt_string(f, "topic")?, aspect: opt_string(f, "aspect")? })),
    }
}

/// `buildSession {items, records, units (course.json object), settings?, overrides?, now, seed?, courseId?,
/// daysLeft, introducedToday?, answerMs?, filter?}` -> `{queue, plan}`.
fn build_session(a: &Value) -> Result<Value, CallError> {
    let course = field(a, "units")?;
    let items = item_metas(a)?;
    let rules = topics::course_rules(course)?.unwrap_or_default();
    let empty = Map::new();
    let records = a.get("records").and_then(Value::as_object).unwrap_or(&empty);
    let settings: Option<SessionSettings> = match a.get("settings") {
        None | Some(Value::Null) => None,
        Some(v) => Some(serde_json::from_value(v.clone()).map_err(|e| bad(format!("`settings`: {e}")))?),
    };
    let overrides: BTreeMap<String, Value> = match a.get("overrides") {
        None | Some(Value::Null) => BTreeMap::new(),
        Some(Value::Object(o)) => o.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
        Some(_) => return Err(bad("`overrides` must be an object")),
    };
    let cfg = session::resolve(settings.as_ref(), &overrides).map_err(|e| bad(format!("session config: {e}")))?;
    let answer_ms: Vec<u64> = match a.get("answerMs") {
        None | Some(Value::Null) => Vec::new(),
        Some(v) => v
            .as_array()
            .ok_or_else(|| bad("`answerMs` must be an array of integers >= 0"))?
            .iter()
            .map(|x| x.as_u64().ok_or_else(|| bad("`answerMs` must be an array of integers >= 0")))
            .collect::<Result<_, _>>()?,
    };
    let filter = opt_filter(a)?;
    let course_id = opt_string(a, "courseId")?.unwrap_or_default();
    let input = SessionInput {
        items: &items,
        records,
        rules: &rules,
        cfg: &cfg,
        filter: filter.as_ref(),
        course_id: &course_id,
        now: int(a, "now")?,
        days_left: int(a, "daysLeft")?,
        introduced_today: opt_count(a, "introducedToday", 0)?,
        answer_ms: &answer_ms,
        seed: opt_seed(a)?,
    };
    let s = session::build_session(&input);
    let p = s.plan;
    Ok(json!({
        "queue": s.queue,
        "plan": {
            "weak": p.weak, "new": p.new, "due": p.due, "total": p.total,
            "capacity": p.capacity, "daysLeft": p.days_left, "unitsLeft": p.units_left, "warnMinutes": p.warn_minutes,
        }
    }))
}

/// `sessionRequeue {unit, pool, answered, alreadyRepeated, repeatMax, seed}` -> question id or null.
fn requeue(a: &Value) -> Result<Value, CallError> {
    let pool = strings(field(a, "pool")?, "pool")?;
    let pool_refs: Vec<&str> = pool.iter().map(String::as_str).collect();
    let picked = session::requeue(
        text(a, "unit")?,
        &pool_refs,
        text(a, "answered")?,
        opt_count(a, "alreadyRepeated", 0)?,
        opt_count(a, "repeatMax", 0)?,
        seed(a)?,
    );
    Ok(json!(picked))
}

/// `sessionFinish {answers:[{id,right}], units:[[itemId]], records, now, planned?, repeatsAdded?}`
/// -> `{answered, right, weakLeft, nextDue, denominator}`.
fn finish(a: &Value) -> Result<Value, CallError> {
    let mut answers = Vec::new();
    for x in field(a, "answers")?.as_array().ok_or_else(|| bad("`answers` must be an array"))? {
        answers.push(Answer { id: text(x, "id")?.to_string(), right: flag(x, "right") });
    }
    let mut units: Vec<Vec<String>> = Vec::new();
    for u in field(a, "units")?.as_array().ok_or_else(|| bad("`units` must be an array of arrays"))? {
        units.push(strings(u, "units")?);
    }
    let empty = Map::new();
    let records = a.get("records").and_then(Value::as_object).unwrap_or(&empty);
    let sum = session::summary(&answers, &units, records, int(a, "now")?);
    let denominator = session::denominator(opt_count(a, "planned", 0)?, opt_count(a, "repeatsAdded", 0)?);
    Ok(json!({
        "answered": sum.answered, "right": sum.right, "weakLeft": sum.weak_left,
        "nextDue": sum.next_due, "denominator": denominator,
    }))
}
