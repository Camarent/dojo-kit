use super::{Bar};
use serde_json::{Map, Value};
use std::collections::HashSet;

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
pub(super) fn scoped_flags(item_ids: &[&str], records: &Map<String, Value>, now: i64, learned_stage: i64) -> (bool, bool, bool) {
    let view = crate::srs::entity_view(item_ids, records);
    let learned = view.as_ref().is_some_and(|v| crate::srs::int_field(Some(v), "s") >= learned_stage);
    (view.is_some(), crate::srs::is_due(view.as_ref(), now), learned)
}

pub(super) fn flags_for(
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

/// Check if an item matches the bar's filters (unit AND all tags). Empty filters match all.
pub fn item_matches_bar(item_unit: &str, item_tags: &[String], bar: &Bar) -> bool {
    if !bar.units.is_empty() && !bar.units.iter().any(|u| u == item_unit) {
        return false;
    }
    bar.tags.iter().all(|t| item_tags.contains(t))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
}
