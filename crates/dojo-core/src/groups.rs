//! Group and entity logic for dojo-core.
//!
//! This module implements entity-based grouping, group caps, and progress bar counting.
//! Key principles:
//! - An entity is a set of items that belong together (e.g., a kanji and its words)
//! - Items in the same entity are introduced together and counted once
//! - Group caps count ENTITIES, not items
//! - A cap never splits an entity (all items of an admitted entity go into fresh)
//! - Items in capped groups are exempt from global and unit caps

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};

/// New order for groups: file order or random.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GroupNewOrder {
    File,
    Random,
}

/// A group of units for daily new item caps.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Group {
    pub id: String,
    pub title: String,
    pub units: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_per_day: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_order: Option<GroupNewOrder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra_new: Option<bool>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub extra_tags: Vec<String>,
}

/// A progress bar configuration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bar {
    pub title: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub units: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub learned_stage: Option<i64>,
}

/// Stage threshold for "learned" when a bar has no `learnedStage`.
pub const DEFAULT_LEARNED_STAGE: i64 = 4;

/// Learned threshold: `bar_stage`, else `course.learnedStage`, else `DEFAULT_LEARNED_STAGE`.
pub fn learned_stage_of(course: &Value, bar_stage: Option<i64>) -> i64 {
    bar_stage.or_else(|| course.get("learnedStage").and_then(Value::as_i64)).unwrap_or(DEFAULT_LEARNED_STAGE)
}

/// Entity state classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntityState {
    /// No active item has a record.
    New,
    /// At least one item is due.
    Due,
    /// Some item has a record, nothing is due, not learned.
    Started,
    /// Every item has a record and the minimum stage is >= the threshold.
    Learned,
}

/// Counts for a group (all numbers count ENTITIES).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GroupCounts {
    pub due: usize,
    /// Entities with no record on any item.
    pub fresh: usize,
    /// Entities that can still be introduced today: min(fresh, cap - used).
    pub new_today: usize,
    /// Entities with at least one record.
    pub started: usize,
    pub total: usize,
}

/// Counts for a bar.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BarCounts {
    pub learned: usize,
    /// Entities with at least one record that are not learned.
    pub started: usize,
    pub total: usize,
}

/// Result of group_counts function.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GroupCountsResult {
    pub groups: HashMap<String, GroupCounts>,
    pub bars: Vec<BarCounts>,
}

/// Item metadata for `group_counts`.
#[derive(Debug, Clone)]
pub struct ItemMeta {
    pub id: String,
    pub unit: String,
    pub entity: String,
    pub tags: Vec<String>,
    pub retired: bool,
}

/// Extract entity id from an item. Defaults to item id if not set.
pub fn entity_id(item: &crate::content::Item) -> &str {
    match item {
        crate::content::Item::Choice(i) => i.entity.as_deref().unwrap_or(&i.id),
        crate::content::Item::Gap(i) => i.entity.as_deref().unwrap_or(&i.id),
        crate::content::Item::Card(i) => i.entity.as_deref().unwrap_or(&i.id),
        crate::content::Item::Multi(i) => i.entity.as_deref().unwrap_or(&i.id),
        crate::content::Item::Match(i) => i.entity.as_deref().unwrap_or(&i.id),
        crate::content::Item::Order(i) => i.entity.as_deref().unwrap_or(&i.id),
        crate::content::Item::Cloze(i) => i.entity.as_deref().unwrap_or(&i.id),
        crate::content::Item::Numeric(i) => i.entity.as_deref().unwrap_or(&i.id),
    }
}

/// Check if an item is active (not retired).
pub fn is_active(item: &crate::content::Item) -> bool {
    !item.is_retired()
}

/// Independent flags of an entity given the ids of its active items.
/// Returns `(any_record, any_due, learned)`; `learned` = every item recorded with min stage >= `learned_stage`, regardless of due.
pub fn entity_flags(item_ids: &[&str], records: &Map<String, Value>, now: i64, learned_stage: i64) -> (bool, bool, bool) {
    let mut any_record = false;
    let mut all_record = true;
    let mut any_due = false;
    let mut min_stage: Option<i64> = None;
    for id in item_ids {
        let rec = records.get(*id);
        if crate::srs::is_new(rec) {
            all_record = false;
            continue;
        }
        any_record = true;
        if crate::srs::is_due(rec, now) {
            any_due = true;
        }
        let s = crate::srs::int_field(rec, "s");
        min_stage = Some(min_stage.map_or(s, |m| m.min(s)));
    }
    let learned = any_record && all_record && min_stage.is_some_and(|s| s >= learned_stage);
    (any_record, any_due, learned)
}

/// `entity_flags` of a scoped entity: judged on `entity_view` (members without a record inherit it).
fn scoped_flags(item_ids: &[&str], records: &Map<String, Value>, now: i64, learned_stage: i64) -> (bool, bool, bool) {
    let view = crate::srs::entity_view(item_ids, records);
    let learned = view.as_ref().is_some_and(|v| crate::srs::int_field(Some(v), "s") >= learned_stage);
    (view.is_some(), crate::srs::is_due(view.as_ref(), now), learned)
}

fn flags_for(
    entity: &str,
    ids: &[&str],
    records: &Map<String, Value>,
    now: i64,
    stage: i64,
    scoped: Option<&HashSet<String>>,
) -> (bool, bool, bool) {
    if scoped.is_some_and(|s| s.contains(entity)) {
        scoped_flags(ids, records, now, stage)
    } else {
        entity_flags(ids, records, now, stage)
    }
}

/// Per-entity summary for the catalog topics view.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntityStats {
    pub members: usize,
    /// Members with a record.
    pub started: usize,
    /// Lowest stage over all members; a member without a record counts as 0.
    pub min_stage: i64,
    pub due: bool,
    pub learned: bool,
    /// Members with a record at stage >= `learned_stage`.
    pub at_learned: usize,
}

/// Summary of an entity given the ids of its active items. `learned` = `entity_flags` learned.
pub fn entity_stats(item_ids: &[&str], records: &Map<String, Value>, now: i64, learned_stage: i64) -> EntityStats {
    entity_stats_scoped(item_ids, records, now, learned_stage, false)
}

/// `entity_stats`; with `scoped` the entity is judged on `entity_view`: `started` = members when a view exists,
/// `min_stage` = view stage, `at_learned` = members or 0 (members without a record inherit the view).
pub fn entity_stats_scoped(item_ids: &[&str], records: &Map<String, Value>, now: i64, learned_stage: i64, scoped: bool) -> EntityStats {
    if scoped {
        let (any, due, learned) = scoped_flags(item_ids, records, now, learned_stage);
        let s = crate::srs::entity_view(item_ids, records).map_or(0, |v| crate::srs::int_field(Some(&v), "s"));
        let n = item_ids.len();
        return EntityStats {
            members: n,
            started: if any { n } else { 0 },
            min_stage: s,
            due,
            learned,
            at_learned: if any && s >= learned_stage { n } else { 0 },
        };
    }
    let (_, due, learned) = entity_flags(item_ids, records, now, learned_stage);
    let mut started = 0;
    let mut at_learned = 0;
    let mut min_stage: Option<i64> = None;
    for id in item_ids {
        let rec = records.get(*id);
        let s = if crate::srs::is_new(rec) {
            0
        } else {
            started += 1;
            let s = crate::srs::int_field(rec, "s");
            if s >= learned_stage {
                at_learned += 1;
            }
            s
        };
        min_stage = Some(min_stage.map_or(s, |m| m.min(s)));
    }
    EntityStats { members: item_ids.len(), started, min_stage: min_stage.unwrap_or(0), due, learned, at_learned }
}

/// State of an entity given the ids of its active items.
/// No records => New; any item due => Due; else all items recorded with min stage >= `learned_stage` => Learned; else Started.
/// Use `entity_flags` when learned must not depend on due.
pub fn entity_state(item_ids: &[&str], records: &Map<String, Value>, now: i64, learned_stage: i64) -> EntityState {
    let (any_record, any_due, learned) = entity_flags(item_ids, records, now, learned_stage);
    if !any_record {
        EntityState::New
    } else if any_due {
        EntityState::Due
    } else if learned {
        EntityState::Learned
    } else {
        EntityState::Started
    }
}

/// Seeded Fisher-Yates shuffle (splitmix64) of entities; seed = hash of `course_id|day|group_id`.
pub fn shuffle_entities(entities: &mut [String], course_id: &str, day: &str, group_id: &str) {
    if entities.len() <= 1 {
        return;
    }
    let mut state = crate::rng::fnv1a(&format!("{course_id}|{day}|{group_id}"));
    crate::rng::seeded_shuffle(entities, &mut state);
}

/// Check if an item matches the bar's filters (unit AND all tags). Empty filters match all.
pub fn item_matches_bar(item_unit: &str, item_tags: &[String], bar: &Bar) -> bool {
    if !bar.units.is_empty() && !bar.units.iter().any(|u| u == item_unit) {
        return false;
    }
    bar.tags.iter().all(|t| item_tags.contains(t))
}

fn parse_groups(course: &Value) -> Vec<Group> {
    course
        .get("groups")
        .and_then(|g| g.as_array())
        .map(|a| a.iter().filter_map(|g| serde_json::from_value::<Group>(g.clone()).ok()).collect())
        .unwrap_or_default()
}

fn ids_of<'a>(items: &[&'a ItemMeta]) -> Vec<&'a str> {
    items.iter().map(|m| m.id.as_str()).collect()
}

/// Group and bar counts over ENTITIES. Retired items are ignored.
/// `used` maps `newBy:g:<group>` to entities introduced today; `extra_new` is added to the cap of the extraNew group.
pub fn group_counts(
    course: &Value,
    items_meta: &[ItemMeta],
    records: &Map<String, Value>,
    now: i64,
    used: &HashMap<String, i64>,
    extra_new: i64,
) -> GroupCountsResult {
    group_counts_scoped(course, items_meta, records, now, used, extra_new, None)
}

/// `group_counts`; entities in `scoped` are judged on `entity_view` (see `entity_stats_scoped`).
pub fn group_counts_scoped(
    course: &Value,
    items_meta: &[ItemMeta],
    records: &Map<String, Value>,
    now: i64,
    used: &HashMap<String, i64>,
    extra_new: i64,
    scoped: Option<&HashSet<String>>,
) -> GroupCountsResult {
    let mut result = GroupCountsResult::default();
    let groups = parse_groups(course);

    // entity -> its active items, in first-appearance order
    let mut entity_order: Vec<&str> = Vec::new();
    let mut entity_items: HashMap<&str, Vec<&ItemMeta>> = HashMap::new();
    for m in items_meta.iter().filter(|m| !m.retired) {
        let e = entity_items.entry(m.entity.as_str()).or_default();
        if e.is_empty() {
            entity_order.push(m.entity.as_str());
        }
        e.push(m);
    }

    for g in &groups {
        let mut c = GroupCounts::default();
        for e in &entity_order {
            let items = &entity_items[e];
            if !items.iter().any(|m| g.units.contains(&m.unit)) {
                continue;
            }
            c.total += 1;
            let ids = ids_of(items);
            let (any_record, any_due, _) = flags_for(e, &ids, records, now, DEFAULT_LEARNED_STAGE, scoped);
            if !any_record {
                c.fresh += 1;
            } else {
                c.started += 1;
                if any_due {
                    c.due += 1;
                }
            }
        }
        let used_today = used.get(&format!("newBy:g:{}", g.id)).copied().unwrap_or(0).max(0);
        let extra = if g.extra_new == Some(true) { extra_new.max(0) } else { 0 };
        c.new_today = match g.new_per_day {
            Some(cap) => {
                let remaining = (i64::from(cap) + extra - used_today).max(0) as usize;
                c.fresh.min(remaining)
            }
            None => c.fresh,
        };
        result.groups.insert(g.id.clone(), c);
    }

    let bars: Vec<Bar> = course
        .get("bars")
        .and_then(|b| b.as_array())
        .map(|a| a.iter().filter_map(|b| serde_json::from_value::<Bar>(b.clone()).ok()).collect())
        .unwrap_or_default();
    for bar in &bars {
        let stage = learned_stage_of(course, bar.learned_stage);
        let mut c = BarCounts::default();
        for e in &entity_order {
            let items = &entity_items[e];
            if !items.iter().any(|m| item_matches_bar(&m.unit, &m.tags, bar)) {
                continue;
            }
            c.total += 1;
            let (any_record, _, learned) = flags_for(e, &ids_of(items), records, now, stage, scoped);
            if learned {
                c.learned += 1;
            } else if any_record {
                c.started += 1;
            }
        }
        result.bars.push(c);
    }
    result
}

type NewItems<'a> = HashMap<String, Vec<&'a str>>;
type GroupEntities<'a> = HashMap<&'a str, Vec<String>>;

/// Per grouped entity: its new items in file order, the started entities, and the new entities per group in emission order.
fn collect_group_entities<'a, 'g>(
    order: &'a [String],
    recs: &Map<String, Value>,
    group_of: &dyn Fn(&str) -> Option<&'g str>,
    entity_of: &dyn Fn(&str) -> String,
) -> (NewItems<'a>, HashSet<String>, GroupEntities<'g>) {
    let mut new_items: NewItems = HashMap::new();
    let mut started: HashSet<String> = HashSet::new();
    let mut group_entities: GroupEntities = HashMap::new();
    for id in order {
        let Some(gid) = group_of(id) else { continue };
        let e = entity_of(id);
        if crate::srs::is_new(recs.get(id.as_str())) {
            let list = new_items.entry(e.clone()).or_default();
            if list.is_empty() {
                group_entities.entry(gid).or_default().push(e);
            }
            list.push(id.as_str());
        } else {
            started.insert(e);
        }
    }
    (new_items, started, group_entities)
}

/// Admission per group: started entities are free, never-started ones cost 1 of the remaining group cap.
fn admit_group_entities<'a>(
    group_entities: GroupEntities<'a>,
    started: &HashSet<String>,
    caps: &HashMap<String, u32>,
    random_groups: Option<&HashSet<String>>,
    used: &HashMap<String, i64>,
    day: &str,
    course_id: &str,
) -> HashMap<&'a str, Vec<String>> {
    let mut admitted: HashMap<&str, Vec<String>> = HashMap::new();
    for (gid, mut list) in group_entities {
        if random_groups.is_some_and(|r| r.contains(gid)) {
            shuffle_entities(&mut list, course_id, day, gid);
        }
        let used_today = used.get(&format!("newBy:g:{gid}")).copied().unwrap_or(0).max(0);
        let mut remaining = i64::from(caps[gid]) - used_today;
        let mut out = Vec::new();
        for e in list {
            if started.contains(&e) {
                out.push(e);
            } else if remaining > 0 {
                remaining -= 1;
                out.push(e);
            }
        }
        admitted.insert(gid, out);
    }
    admitted
}

/// Fresh queue: admitted grouped entities at their group's first new item, ungrouped items under the global and unit caps.
#[allow(clippy::too_many_arguments)]
fn emit_fresh<'g>(
    order: &[String],
    recs: &Map<String, Value>,
    group_of: &dyn Fn(&str) -> Option<&'g str>,
    admitted: &HashMap<&'g str, Vec<String>>,
    new_items: &NewItems,
    new_allowance: i64,
    unit_new_caps: Option<&HashMap<String, u32>>,
    item_units: Option<&HashMap<String, String>>,
) -> Vec<String> {
    let allowance = usize::try_from(new_allowance.max(0)).unwrap_or(usize::MAX);
    let mut ungrouped = 0usize;
    let mut unit_counts: HashMap<&str, usize> = HashMap::new();
    let mut emitted_groups: HashSet<&'g str> = HashSet::new();
    let mut fresh: Vec<String> = Vec::new();
    for id in order {
        if !crate::srs::is_new(recs.get(id.as_str())) {
            continue;
        }
        if let Some(gid) = group_of(id) {
            if emitted_groups.insert(gid) {
                for e in &admitted[gid] {
                    fresh.extend(new_items[e].iter().map(|s| s.to_string()));
                }
            }
            continue;
        }
        if ungrouped >= allowance {
            continue;
        }
        if let (Some(units), Some(caps)) = (item_units, unit_new_caps) {
            if let Some(unit) = units.get(id.as_str()) {
                if let Some(&cap) = caps.get(unit.as_str()) {
                    let n = unit_counts.entry(unit.as_str()).or_insert(0);
                    if *n >= cap as usize {
                        continue;
                    }
                    *n += 1;
                }
            }
        }
        ungrouped += 1;
        fresh.push(id.clone());
    }
    fresh
}

/// Queue with group caps over ENTITIES.
///
/// - `group_units`: group id -> unit ids; `group_new_caps`: group id -> entities allowed today
///   (already includes extra; the function subtracts `used["newBy:g:<id>"]`). A group without a cap entry is
///   treated like ungrouped units.
/// - `random_groups`: groups whose entities are introduced in a seeded shuffle (`course_id|day|group`).
/// - Admitting a never-started entity costs 1 of the group cap and brings ALL its new items (never split);
///   new items of an already started entity are free. Capped-group items ignore the global and unit caps.
/// - Ungrouped items: global `new_allowance` and `unit_new_caps`, per item, as in `build_queue_with_caps`.
/// - Missing/empty `group_units`/`group_new_caps`/`item_entities` => exactly `build_queue_with_caps`.
#[allow(clippy::too_many_arguments)]
pub fn build_queue_with_groups(
    items: &Value,
    order: &[String],
    now: i64,
    new_allowance: i64,
    unit_new_caps: Option<&HashMap<String, u32>>,
    item_units: Option<&HashMap<String, String>>,
    item_entities: Option<&HashMap<String, String>>,
    group_new_caps: Option<&HashMap<String, u32>>,
    group_units: Option<&HashMap<String, Vec<String>>>,
    random_groups: Option<&HashSet<String>>,
    used: &HashMap<String, i64>,
    day: &str,
    course_id: &str,
) -> crate::srs::Queue {
    let (Some(caps), Some(group_units), Some(entities)) = (group_new_caps, group_units, item_entities) else {
        return crate::srs::build_queue_with_caps(items, order, now, new_allowance, unit_new_caps, item_units);
    };
    if group_units.is_empty() || caps.is_empty() {
        return crate::srs::build_queue_with_caps(items, order, now, new_allowance, unit_new_caps, item_units);
    }

    let empty = Map::new();
    let recs = items.as_object().unwrap_or(&empty);
    let in_order: HashSet<&str> = order.iter().map(String::as_str).collect();
    let mut due: Vec<(&str, i64)> = recs
        .iter()
        .filter(|(id, rec)| in_order.contains(id.as_str()) && crate::srs::is_due(Some(rec), now))
        .map(|(id, rec)| (id.as_str(), crate::srs::int_field(Some(rec), "due")))
        .collect();
    due.sort_by_key(|&(_, due)| due);

    let mut unit_group: HashMap<&str, &str> = HashMap::new();
    for (gid, units) in group_units {
        if caps.contains_key(gid) {
            for u in units {
                unit_group.insert(u.as_str(), gid.as_str());
            }
        }
    }
    let group_of = |id: &str| {
        item_units.and_then(|m| m.get(id)).and_then(|u| unit_group.get(u.as_str())).copied()
    };
    let entity_of = |id: &str| -> String { entities.get(id).cloned().unwrap_or_else(|| id.to_string()) };

    let (new_items, started, group_entities) = collect_group_entities(order, recs, &group_of, &entity_of);
    let admitted = admit_group_entities(group_entities, &started, caps, random_groups, used, day, course_id);
    let fresh = emit_fresh(order, recs, &group_of, &admitted, &new_items, new_allowance, unit_new_caps, item_units);

    crate::srs::Queue { due: due.into_iter().map(|(id, _)| id.to_string()).collect(), fresh }
}

/// Scheduling scope for `build_queue_scoped`.
pub struct Scope<'a> {
    /// Scoped entity -> its ACTIVE item ids in file order.
    pub members: &'a HashMap<String, Vec<String>>,
    /// Scoped entity -> items asked per slot (missing = 1).
    pub drill: &'a HashMap<String, u32>,
}

/// `build_queue_with_groups` where every scoped entity is one queue slot.
///
/// Representative pass: of each scoped entity only its first id in `order` is kept and carries the
/// `entity_view` record (no record when the view is `None`); caps, group admission and order are the existing logic.
/// Each representative in `due`/`fresh` is then replaced by `pick_drill` ids. Returns the queue and `{entity: [ids]}`
/// for the scoped entities that made it into the queue. `scope = None` (or no members) is exactly `build_queue_with_groups`.
#[allow(clippy::too_many_arguments)]
pub fn build_queue_scoped(
    items: &Value,
    order: &[String],
    now: i64,
    new_allowance: i64,
    unit_new_caps: Option<&HashMap<String, u32>>,
    item_units: Option<&HashMap<String, String>>,
    item_entities: Option<&HashMap<String, String>>,
    group_new_caps: Option<&HashMap<String, u32>>,
    group_units: Option<&HashMap<String, Vec<String>>>,
    random_groups: Option<&HashSet<String>>,
    used: &HashMap<String, i64>,
    day: &str,
    course_id: &str,
    scope: Option<&Scope>,
) -> (crate::srs::Queue, Map<String, Value>) {
    let plain = |items: &Value, order: &[String]| {
        build_queue_with_groups(
            items, order, now, new_allowance, unit_new_caps, item_units, item_entities, group_new_caps,
            group_units, random_groups, used, day, course_id,
        )
    };
    let Some(scope) = scope.filter(|s| !s.members.is_empty()) else {
        return (plain(items, order), Map::new());
    };
    let mut entity_of: HashMap<&str, &str> = HashMap::new();
    for (e, ids) in scope.members {
        for id in ids {
            entity_of.insert(id.as_str(), e.as_str());
        }
    }
    let empty = Map::new();
    let in_order: HashSet<&str> = order.iter().map(String::as_str).collect();
    let recs = items.as_object().unwrap_or(&empty);
    let mut synthetic = recs.clone();
    let mut rep_order: Vec<String> = Vec::new();
    let mut reps: HashMap<&str, &str> = HashMap::new(); // representative id -> entity
    let mut seen: HashSet<&str> = HashSet::new();
    for id in order {
        match entity_of.get(id.as_str()) {
            None => rep_order.push(id.clone()),
            Some(e) => {
                if seen.insert(e) {
                    rep_order.push(id.clone());
                    reps.insert(id.as_str(), e);
                    let ids: Vec<&str> = scope.members[*e].iter().map(String::as_str).collect();
                    match crate::srs::entity_view(&ids, recs) {
                        Some(v) => synthetic.insert(id.clone(), v),
                        None => synthetic.remove(id),
                    };
                }
            }
        }
    }
    let q = plain(&Value::Object(synthetic), &rep_order);
    let mut drills = Map::new();
    let mut expand = |ids: Vec<String>| -> Vec<String> {
        let mut out = Vec::new();
        for id in ids {
            match reps.get(id.as_str()) {
                None => out.push(id),
                Some(e) => {
                    let n = scope.drill.get(*e).copied().unwrap_or(1) as usize;
                    let avail: Vec<String> = scope.members[*e].iter().filter(|m| in_order.contains(m.as_str())).cloned().collect();
                    let picked = if avail.is_empty() { vec![id.clone()] } else { crate::srs::pick_drill(&avail, n, course_id, day, e) };
                    drills.insert((*e).to_string(), Value::from(picked.clone()));
                    out.extend(picked);
                }
            }
        }
        out
    };
    let queue = crate::srs::Queue { due: expand(q.due), fresh: expand(q.fresh) };
    (queue, drills)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn s(v: &str) -> String {
        v.to_string()
    }

    fn meta(id: &str, unit: &str, entity: &str, tags: &[&str]) -> ItemMeta {
        ItemMeta { id: s(id), unit: s(unit), entity: s(entity), tags: tags.iter().map(|t| s(t)).collect(), retired: false }
    }

    struct Fixture {
        order: Vec<String>,
        units: HashMap<String, String>,
        entities: HashMap<String, String>,
    }

    /// Group unit `k` entities e0..e(n-1); entity `big` index has 4 items, others 1.
    fn kanji_fixture(n: usize, big: usize) -> Fixture {
        let mut f = Fixture { order: vec![], units: HashMap::new(), entities: HashMap::new() };
        for i in 0..n {
            let count = if i == big { 4 } else { 1 };
            for j in 0..count {
                let id = format!("k{i}-{j}");
                f.order.push(id.clone());
                f.units.insert(id.clone(), s("k"));
                f.entities.insert(id, format!("e{i}"));
            }
        }
        f
    }

    fn group_args(cap: u32) -> (HashMap<String, u32>, HashMap<String, Vec<String>>) {
        (HashMap::from([(s("g"), cap)]), HashMap::from([(s("g"), vec![s("k")])]))
    }

    fn queue(f: &Fixture, allowance: i64, cap: u32, used: i64, random: Option<&HashSet<String>>) -> crate::srs::Queue {
        let (caps, gu) = group_args(cap);
        let used = HashMap::from([(s("newBy:g:g"), used)]);
        build_queue_with_groups(
            &json!({}), &f.order, 0, allowance, None, Some(&f.units), Some(&f.entities),
            Some(&caps), Some(&gu), random, &used, "2024-01-01", "c",
        )
    }

    #[test]
    fn cap_never_splits_entity_tenth_brings_four_items() {
        let f = kanji_fixture(12, 9);
        let q = queue(&f, 0, 10, 0, None);
        assert_eq!(q.fresh.len(), 9 + 4);
        assert!(q.fresh.contains(&s("k9-3")));
        assert!(!q.fresh.contains(&s("k10-0")));
    }

    #[test]
    fn cap_is_decremented_per_entity_and_honours_used() {
        let f = kanji_fixture(12, 9);
        assert_eq!(queue(&f, 0, 10, 8, None).fresh, vec!["k0-0", "k1-0"]);
        let g = kanji_fixture(12, 1);
        assert_eq!(queue(&g, 0, 10, 8, None).fresh, vec!["k0-0", "k1-0", "k1-1", "k1-2", "k1-3"]);
        assert!(queue(&f, 0, 10, 10, None).fresh.is_empty());
        assert_eq!(queue(&f, 0, 3, 0, None).fresh, vec!["k0-0", "k1-0", "k2-0"]);
    }

    #[test]
    fn started_entity_new_items_are_free() {
        let f = kanji_fixture(3, 0);
        let (caps, gu) = group_args(1);
        let recs = json!({"k0-0": {"due": 99, "s": 1}});
        let used = HashMap::new();
        let q = build_queue_with_groups(
            &recs, &f.order, 0, 0, None, Some(&f.units), Some(&f.entities),
            Some(&caps), Some(&gu), None, &used, "d", "c",
        );
        assert_eq!(q.fresh, vec!["k0-1", "k0-2", "k0-3", "k1-0"]);
    }

    #[test]
    fn grouped_items_exempt_from_global_and_unit_caps() {
        let mut f = kanji_fixture(4, 99);
        for i in 0..5 {
            let id = format!("w{i}");
            f.order.push(id.clone());
            f.units.insert(id, s("w"));
        }
        let (caps, gu) = group_args(3);
        let unit_caps = HashMap::from([(s("k"), 1u32), (s("w"), 4u32)]);
        let used = HashMap::new();
        let q = build_queue_with_groups(
            &json!({}), &f.order, 0, 2, Some(&unit_caps), Some(&f.units), Some(&f.entities),
            Some(&caps), Some(&gu), None, &used, "d", "c",
        );
        let grouped: Vec<_> = q.fresh.iter().filter(|i| i.starts_with('k')).collect();
        let loose: Vec<_> = q.fresh.iter().filter(|i| i.starts_with('w')).collect();
        assert_eq!(grouped.len(), 3);
        assert_eq!(loose, vec!["w0", "w1"]);
    }

    #[test]
    fn unit_cap_applies_to_ungrouped_units() {
        let mut f = kanji_fixture(1, 99);
        for i in 0..5 {
            let id = format!("w{i}");
            f.order.push(id.clone());
            f.units.insert(id, s("w"));
        }
        let (caps, gu) = group_args(3);
        let unit_caps = HashMap::from([(s("w"), 2u32)]);
        let used = HashMap::new();
        let q = build_queue_with_groups(
            &json!({}), &f.order, 0, 10, Some(&unit_caps), Some(&f.units), Some(&f.entities),
            Some(&caps), Some(&gu), None, &used, "d", "c",
        );
        assert_eq!(q.fresh, vec!["k0-0", "w0", "w1"]);
    }

    #[test]
    fn no_groups_output_identical_to_build_queue() {
        let order: Vec<String> = (0..40).map(|i| format!("i{i}")).collect();
        let mut recs = Map::new();
        for i in (0..40).step_by(3) {
            recs.insert(format!("i{i}"), json!({"due": (i as i64 * 7) % 50, "s": 1}));
        }
        recs.insert(s("i1"), Value::Null);
        let recs = Value::Object(recs);
        let units: HashMap<String, String> =
            order.iter().enumerate().map(|(i, id)| (id.clone(), format!("u{}", i % 3))).collect();
        let ents: HashMap<String, String> = order.iter().map(|id| (id.clone(), format!("e-{id}"))).collect();
        let unit_caps = HashMap::from([(s("u1"), 2u32)]);
        let used = HashMap::new();
        for (allow, caps) in [(5i64, None), (0, None), (100, None), (6, Some(&unit_caps))] {
            let old = crate::srs::build_queue_with_caps(&recs, &order, 30, allow, caps, Some(&units));
            let none = build_queue_with_groups(&recs, &order, 30, allow, caps, Some(&units), None, None, None, None, &used, "d", "c");
            assert_eq!(old, none);
            // groups configured but no item in them
            let gcaps = HashMap::from([(s("g"), 3u32)]);
            let gunits = HashMap::from([(s("g"), vec![s("elsewhere")])]);
            let ungrouped = build_queue_with_groups(
                &recs, &order, 30, allow, caps, Some(&units), Some(&ents), Some(&gcaps), Some(&gunits), None, &used, "d", "c",
            );
            assert_eq!(old, ungrouped);
            // empty group config
            let empty_caps = HashMap::new();
            let empty_units = HashMap::new();
            let empty = build_queue_with_groups(
                &recs, &order, 30, allow, caps, Some(&units), Some(&ents), Some(&empty_caps), Some(&empty_units), None, &used, "d", "c",
            );
            assert_eq!(old, empty);
        }
        let plain = crate::srs::build_queue(&recs, &order, 30, 5);
        let via = build_queue_with_groups(&recs, &order, 30, 5, None, None, None, None, None, None, &used, "d", "c");
        assert_eq!(plain, via);
    }

    #[test]
    fn entity_due_when_any_item_due() {
        let records = json!({"a": {"due": 0, "s": 1}, "b": {"due": 5000, "s": 1}});
        let records = records.as_object().unwrap();
        assert_eq!(entity_state(&["a", "b"], records, 100, 4), EntityState::Due);
        assert_eq!(entity_state(&["b"], records, 100, 4), EntityState::Started);
        assert_eq!(entity_state(&["x", "y"], records, 100, 4), EntityState::New);
    }

    #[test]
    fn group_counts_due_and_learned_entity_counts_in_bars() {
        let course = json!({"groups": [{"id": "g", "title": "G", "units": ["k"]}],
            "bars": [{"title": "B", "learnedStage": 4}]});
        let meta = vec![meta("a", "k", "e", &[]), meta("b", "k", "e", &[])];
        let records = json!({"a": {"due": 0, "s": 5}, "b": {"due": 5000, "s": 4}});
        let r = group_counts(&course, &meta, records.as_object().unwrap(), 100, &HashMap::new(), 0);
        assert_eq!(r.bars[0].learned, 1);
        assert_eq!(r.bars[0].total, 1);
        assert_eq!(r.groups["g"].due, 1);
        assert_eq!(r.groups["g"].started, 1);
    }

    #[test]
    fn entity_stats_min_stage_counts_unrecorded_as_zero() {
        let records = json!({"a": {"due": 0, "s": 5}, "b": {"due": 5000, "s": 3}});
        let records = records.as_object().unwrap();
        let st = entity_stats(&["a", "b"], records, 100, 4);
        assert_eq!((st.members, st.started, st.min_stage, st.due, st.learned, st.at_learned), (2, 2, 3, true, false, 1));
        let st = entity_stats(&["a", "x"], records, 100, 4);
        assert_eq!((st.started, st.min_stage, st.learned, st.at_learned), (1, 0, false, 1));
        let st = entity_stats(&["x"], records, 100, 4);
        assert_eq!((st.started, st.min_stage, st.due), (0, 0, false));
    }

    #[test]
    fn entity_flags_learned_independent_of_due() {
        let records = json!({"a": {"due": 0, "s": 5}, "b": {"due": 5000, "s": 4}});
        let records = records.as_object().unwrap();
        assert_eq!(entity_flags(&["a", "b"], records, 100, 4), (true, true, true));
        assert_eq!(entity_flags(&["a", "x"], records, 100, 4), (true, true, false));
    }

    #[test]
    fn group_counts_entity_due_any_item_and_started() {
        let course = json!({"groups": [{"id": "g", "title": "G", "units": ["k"]}]});
        let meta = vec![meta("a", "k", "e", &[]), meta("b", "k", "e", &[]), meta("c", "k", "f", &[]), meta("d", "k", "h", &[])];
        let records = json!({"a": {"due": 0, "s": 1}, "b": {"due": 5000, "s": 1}, "c": {"due": 5000, "s": 1}});
        let r = group_counts(&course, &meta, records.as_object().unwrap(), 100, &HashMap::new(), 0);
        let g = &r.groups["g"];
        assert_eq!((g.total, g.due, g.started, g.fresh), (3, 1, 2, 1));
    }

    #[test]
    fn bars_learned_needs_min_stage_at_threshold_over_all_items() {
        let course = json!({"bars": [{"title": "T", "units": ["k"], "tags": ["n5"], "learnedStage": 3}]});
        let meta = vec![
            meta("a1", "k", "a", &["n5"]), meta("a2", "k", "a", &["n5"]),
            meta("b1", "k", "b", &["n5"]), meta("b2", "k", "b", &["n5"]),
            meta("c1", "k", "c", &["n5"]), meta("c2", "k", "c", &[]),
            meta("d1", "k", "d", &["n4"]),
            meta("e1", "w", "e", &["n5"]),
        ];
        let records = json!({
            "a1": {"s": 3, "due": 9999}, "a2": {"s": 5, "due": 9999},
            "b1": {"s": 5, "due": 9999}, "b2": {"s": 2, "due": 9999},
            "c1": {"s": 4, "due": 9999}, "c2": {"s": 4, "due": 9999},
        });
        let r = group_counts(&course, &meta, records.as_object().unwrap(), 0, &HashMap::new(), 0);
        // entities a, b, c match (unit AND tag on any item); d wrong tag, e wrong unit.
        assert_eq!(r.bars, vec![BarCounts { learned: 2, started: 1, total: 3 }]);
        let missing = json!({"a1": {"s": 5, "due": 9999}});
        let r = group_counts(&course, &meta, missing.as_object().unwrap(), 0, &HashMap::new(), 0);
        assert_eq!((r.bars[0].learned, r.bars[0].started, r.bars[0].total), (0, 1, 3));
    }

    #[test]
    fn bar_learned_stage_precedence_bar_then_course_then_default() {
        let meta = vec![meta("a1", "k", "a", &[])];
        let records = json!({"a1": {"s": 3, "due": 9999}});
        let learned = |course: Value| {
            group_counts_scoped(&course, &meta, records.as_object().unwrap(), 0, &HashMap::new(), 0, None).bars[0].learned
        };
        assert_eq!(learned(json!({"learnedStage": 2, "bars": [{"title": "T"}]})), 1);
        assert_eq!(learned(json!({"learnedStage": 2, "bars": [{"title": "T", "learnedStage": 5}]})), 0);
        assert_eq!(learned(json!({"bars": [{"title": "T"}]})), 0);
        assert_eq!(learned(json!({"learnedStage": 5, "bars": [{"title": "T", "learnedStage": 3}]})), 1);
    }

    #[test]
    fn bars_skip_retired_items() {
        let course = json!({"bars": [{"title": "T"}]});
        let mut m = vec![meta("a1", "k", "a", &[]), meta("a2", "k", "a", &[])];
        m[1].retired = true;
        let records = json!({"a1": {"s": 4, "due": 9999}});
        let r = group_counts(&course, &m, records.as_object().unwrap(), 0, &HashMap::new(), 0);
        assert_eq!(r.bars, vec![BarCounts { learned: 1, started: 0, total: 1 }]);
    }

    #[test]
    fn new_today_honours_used_and_extra() {
        let course = json!({"groups": [{"id": "g", "title": "G", "units": ["k"], "newPerDay": 3, "extraNew": true}]});
        let meta: Vec<ItemMeta> = (0..10).map(|i| meta(&format!("i{i}"), "k", &format!("e{i}"), &[])).collect();
        let recs = Map::new();
        let at = |used: i64, extra: i64| {
            let u = HashMap::from([(s("newBy:g:g"), used)]);
            group_counts(&course, &meta, &recs, 0, &u, extra).groups["g"].new_today
        };
        assert_eq!(at(0, 0), 3);
        assert_eq!(at(2, 0), 1);
        assert_eq!(at(5, 0), 0);
        assert_eq!(at(2, 5), 6);
        assert_eq!(at(0, 100), 10);
    }

    #[test]
    fn shuffle_is_deterministic_and_seed_sensitive() {
        let base: Vec<String> = (0..20).map(|i| format!("e{i}")).collect();
        let run = |c: &str, d: &str, g: &str| {
            let mut v = base.clone();
            shuffle_entities(&mut v, c, d, g);
            v
        };
        assert_eq!(run("c", "d1", "g"), run("c", "d1", "g"));
        assert_ne!(run("c", "d1", "g"), run("c", "d2", "g"));
        assert_ne!(run("c", "d1", "g"), run("c", "d1", "h"));
        assert_ne!(run("c", "d1", "g"), run("x", "d1", "g"));
        let mut sorted = run("c", "d1", "g");
        sorted.sort();
        let mut want = base.clone();
        want.sort();
        assert_eq!(sorted, want);
    }

    #[test]
    fn random_group_shuffles_entities_not_items_and_caps_entities() {
        let f = kanji_fixture(12, 9);
        let random = HashSet::from([s("g")]);
        let q = queue(&f, 0, 5, 0, Some(&random));
        assert_eq!(q, queue(&f, 0, 5, 0, Some(&random)));
        assert_ne!(q.fresh, queue(&f, 0, 5, 0, None).fresh);
        let ents: HashSet<&String> = q.fresh.iter().map(|i| &f.entities[i]).collect();
        assert_eq!(ents.len(), 5);
        // items of one entity stay contiguous and complete
        for e in &ents {
            let want = f.entities.values().filter(|v| v == e).count();
            assert_eq!(q.fresh.iter().filter(|i| &&f.entities[*i] == e).count(), want);
        }
        let first_pos: Vec<usize> = q.fresh.iter().enumerate().filter(|(_, i)| i.ends_with("-0")).map(|(p, _)| p).collect();
        assert!(first_pos.windows(2).all(|w| w[1] > w[0]));
    }
}
