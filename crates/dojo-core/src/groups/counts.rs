use super::entity::{flags_for, item_matches_bar};
use super::*;
use serde_json::Map;
use std::collections::HashSet;

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
}
