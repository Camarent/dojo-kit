use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};

/// Seeded Fisher-Yates shuffle (splitmix64) of entities; seed = hash of `course_id|day|group_id`.
pub fn shuffle_entities(entities: &mut [String], course_id: &str, day: &str, group_id: &str) {
    if entities.len() <= 1 {
        return;
    }
    let mut state = crate::rng::fnv1a(&format!("{course_id}|{day}|{group_id}"));
    crate::rng::seeded_shuffle(entities, &mut state);
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
        if let (Some(units), Some(caps)) = (item_units, unit_new_caps)
            && let Some(unit) = units.get(id.as_str())
                && let Some(&cap) = caps.get(unit.as_str()) {
                    let n = unit_counts.entry(unit.as_str()).or_insert(0);
                    if *n >= cap as usize {
                        continue;
                    }
                    *n += 1;
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
