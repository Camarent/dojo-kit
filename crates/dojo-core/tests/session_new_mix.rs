//! Session queue over days: a small entity (category) is not starved by a large one under the capacity cut.
use dojo_core::content::SessionMode;
use dojo_core::groups::{AspectRule, ItemMeta};
use dojo_core::session::order::{mix_order, spread, UnitFlags};
use dojo_core::session::{build_session, SessionConfig, SessionInput};
use serde_json::{json, Map};

const DAYS: u64 = 10;
const DAY_MS: i64 = 86_400_000;
/// `days_left` 4 with the default `reviewDays` leaves one day for new units: every never-introduced unit fits.
const DAYS_LEFT: i64 = 4;
/// Each category (entity) with its item count; every item is its own unit (aspect tag).
const CATEGORIES: [(&str, &str, usize); 3] = [("v", "vocab", 300), ("k", "kanji", 60), ("g", "grammar", 20)];

fn course() -> (Vec<ItemMeta>, Vec<AspectRule>) {
    let mut items = Vec::new();
    for (prefix, entity, n) in CATEGORIES {
        for i in 0..n {
            let id = format!("{prefix}{i}");
            items.push(ItemMeta { id: id.clone(), unit: "u".into(), entity: entity.into(), tags: vec![id], retired: false });
        }
    }
    let rules = items
        .iter()
        .map(|m| serde_json::from_value(json!({"id": format!("a-{}", m.id), "tags": [m.id.clone()]})).expect("aspect rule"))
        .collect();
    (items, rules)
}

fn category_of(id: &str) -> &'static str {
    CATEGORIES.iter().find(|(prefix, _, _)| id.starts_with(prefix)).map_or("", |(_, entity, _)| entity)
}

#[test]
fn every_category_reaches_the_queue_every_day() {
    let (items, rules) = course();
    let recs = Map::new();
    let cfg = SessionConfig::default();
    for day in 0..DAYS {
        let s = build_session(&SessionInput {
            items: &items,
            records: &recs,
            rules: &rules,
            cfg: &cfg,
            filter: None,
            course_id: "c",
            now: 100 + i64::try_from(day).expect("day") * DAY_MS,
            days_left: DAYS_LEFT,
            introduced_today: 0,
            answer_ms: &[],
            seed: Some(day + 1),
        });
        assert!(!s.queue.is_empty(), "day {day}: empty queue");
        let half = s.queue.len() / 2;
        for (_, entity, _) in CATEGORIES {
            let n = s.queue.iter().filter(|id| category_of(id) == entity).count();
            assert!(n >= 1, "day {day}: {entity} starved, queue {:?}", s.queue);
            // A category never fills more than half the queue: its neighbours must be other categories.
            assert!(n <= half, "day {day}: {entity} holds {n} of {} slots", s.queue.len());
        }
    }
}

/// Entity, item count, recorded as weak. Unrecorded items are new.
type Spec<'a> = &'a [(&'a str, usize, bool)];
/// Queue and the plain entity spread of the same slots as (entity, id, new).
type Built = (Vec<String>, Vec<(String, String, bool)>);

/// Builds a manual-mode session cut to `cap` slots; returns it with the plain spread of the same slots.
fn cut_session(spec: Spec, mix: &[&str], cap: u32) -> Built {
    let mut items = Vec::new();
    let mut rules: Vec<AspectRule> = Vec::new();
    let mut recs = Map::new();
    let mut flags = Vec::new();
    for &(entity, n, weak) in spec {
        for i in 0..n {
            let id = format!("{entity}{i}");
            items.push(ItemMeta { id: id.clone(), unit: "u".into(), entity: entity.into(), tags: vec![id.clone()], retired: false });
            rules.push(serde_json::from_value(json!({"id": format!("a-{id}"), "tags": [id.clone()]})).expect("aspect rule"));
            if weak {
                recs.insert(id, json!({"due": 1_000_000_000_000_i64, "s": 1, "last": 1, "wk": 1, "qok": 0, "qbad": 1, "qlast": 0}));
            }
            flags.push(UnitFlags { weak, new: !weak, due: false });
        }
    }
    let mix: Vec<String> = mix.iter().map(|m| (*m).to_string()).collect();
    let cfg = SessionConfig { session_mix: mix.clone(), session_mode: SessionMode::Manual, session_cap: cap, ..SessionConfig::default() };
    let seed = 7;
    let s = build_session(&SessionInput {
        items: &items,
        records: &recs,
        rules: &rules,
        cfg: &cfg,
        filter: None,
        course_id: "c",
        now: 100,
        days_left: DAYS_LEFT,
        introduced_today: 0,
        answer_ms: &[],
        seed: Some(seed),
    });
    let slots: Vec<(String, String, bool)> = mix_order(&flags, &mix, seed)
        .into_iter()
        .filter_map(|(i, _)| items.get(i).map(|m| (m.entity.clone(), m.id.clone(), flags.get(i).is_some_and(|f| f.new))))
        .collect();
    (s.queue, spread(slots, |s| s.0.as_str()))
}

/// Under a real cut (10 of 14 slots) weak items keep the queue positions the plain entity spread gives them.
#[test]
fn weak_positions_do_not_depend_on_the_new_slice() {
    let spec: Spec = &[("w", 6, true), ("x", 2, true), ("n", 1, false), ("m", 5, false)];
    let (queue, plain) = cut_session(spec, &["weak", "new"], 10);
    assert_eq!(queue.len(), 10);
    assert!(plain.iter().take(10).any(|p| !p.2), "no weak item inside the cut");
    for (pos, (_, id, new)) in plain.iter().take(10).enumerate() {
        if !new {
            assert_eq!(queue.get(pos), Some(id), "weak item moved at {pos}: {queue:?}");
        }
    }
}

/// A queue without new items is byte-identical to the plain entity spread, cut or not.
#[test]
fn queue_without_new_items_is_the_plain_spread() {
    let spec: Spec = &[("w", 6, true), ("x", 2, true), ("y", 3, true)];
    let (queue, plain) = cut_session(spec, &["weak"], 8);
    let expected: Vec<String> = plain.into_iter().take(8).map(|p| p.1).collect();
    assert_eq!(queue, expected);
}
