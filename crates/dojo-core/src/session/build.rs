//! `build_session`: unit status from records, category mix, question choice, spread, capacity cut, plan numbers.
use super::choice::pick_questions;
use super::config::SessionConfig;
use super::order::{mix_order, spread, UnitFlags};
use super::plan::{days_for_new, new_today, numbers, PlanNumbers};
use crate::days::day_key;
use crate::groups::{aspect_of, unit_key, AspectRule, ItemMeta};
use crate::rng::fnv1a;
use crate::srs::{int_field, is_due, is_new};
use serde_json::{Map, Value};
use std::collections::HashMap;

/// Restricts every category to units whose entity (topic) and/or aspect match; `None` fields match all.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SessionFilter {
    pub topic: Option<String>,
    pub aspect: Option<String>,
}

/// Everything the session builder reads. `filter` = topic/aspect restriction (None = all units).
/// The shuffle seed is the hash of the UTC day key of `now` and `course_id`: the same inputs give the same queue.
pub struct SessionInput<'a> {
    pub items: &'a [ItemMeta],
    pub records: &'a Map<String, Value>,
    pub rules: &'a [AspectRule],
    pub cfg: &'a SessionConfig,
    pub filter: Option<&'a SessionFilter>,
    pub course_id: &'a str,
    pub now: i64,
    pub days_left: i64,
    pub introduced_today: usize,
    pub answer_ms: &'a [u64],
}

/// Session queue (question ids, asked in this order) and the plan numbers shown before it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Session {
    pub queue: Vec<String>,
    pub plan: PlanNumbers,
}

/// A unit of the course: key, entity, active member item ids in file order.
struct Unit {
    entity: String,
    members: Vec<String>,
}

/// True when the item passes the topic (entity) and aspect filter.
fn matches_filter(m: &ItemMeta, input: &SessionInput) -> bool {
    input.filter.is_none_or(|f| {
        f.topic.as_ref().is_none_or(|t| *t == m.entity)
            && f.aspect.as_ref().is_none_or(|a| *a == aspect_of(&m.tags, &m.unit, input.rules))
    })
}

/// Groups active, kept items into units in first-appearance order.
fn group_units(input: &SessionInput) -> Vec<Unit> {
    let mut index: HashMap<String, usize> = HashMap::new();
    let mut units: Vec<Unit> = Vec::new();
    for m in input.items.iter().filter(|m| !m.retired) {
        if !matches_filter(m, input) {
            continue;
        }
        let key = unit_key(&m.entity, &m.tags, &m.unit, input.rules);
        let i = *index.entry(key).or_insert_with(|| {
            units.push(Unit { entity: m.entity.clone(), members: Vec::new() });
            units.len() - 1
        });
        if let Some(unit) = units.get_mut(i) {
            unit.members.push(m.id.clone());
        }
    }
    units
}

/// Weak: a member has `wk` set. New: no member has a record. Due: a member is due.
fn flags_of(unit: &Unit, input: &SessionInput) -> UnitFlags {
    let recs: Vec<Option<&Value>> = unit.members.iter().map(|id| input.records.get(id)).collect();
    UnitFlags {
        weak: recs.iter().any(|r| int_field(*r, "wk") == 1),
        new: recs.iter().all(|r| is_new(*r)),
        due: recs.iter().any(|r| is_due(*r, input.now)),
    }
}

/// Builds the session: category mix, per-unit question choice, entity spread, capacity cut and plan numbers.
pub fn build_session(input: &SessionInput) -> Session {
    let units = group_units(input);
    let flags: Vec<UnitFlags> = units.iter().map(|u| flags_of(u, input)).collect();
    let never = flags.iter().filter(|f| f.new).count();
    let cap_new = new_today(never, days_for_new(input.days_left, input.cfg.review_days), input.introduced_today);
    let order = mix_order(&flags, &input.cfg.session_mix, fnv1a(&format!("{}|{}", input.course_id, day_key(input.now, 0))));

    let mut new_taken = 0usize;
    let mut weak = 0usize;
    // Plan due counts every due unit, also one placed under "weak" by the mix.
    let due = flags.iter().filter(|f| f.due).count();
    let mut slots: Vec<(String, Vec<String>)> = Vec::new();
    for (i, kind) in order {
        match kind.as_str() {
            "new" if new_taken >= cap_new => continue,
            "new" => new_taken += 1,
            "weak" => weak += 1,
            _ => {}
        }
        let Some(unit) = units.get(i) else { continue };
        let members: Vec<&str> = unit.members.iter().map(String::as_str).collect();
        let questions = pick_questions(&members, input.records, input.cfg.per_unit_max as usize);
        slots.push((unit.entity.clone(), questions));
    }

    let plan = numbers(input.cfg, input.answer_ms, weak, due, never, input.introduced_today, input.days_left);
    let mut queue: Vec<String> = spread(slots, |slot| slot.0.as_str()).into_iter().flat_map(|slot| slot.1).collect();
    if let Some(cap) = plan.capacity {
        queue.truncate(cap as usize);
    }
    Session { queue, plan }
}
