//! Wrong-answer re-queue (`requeue`) and the finish summary (`summary`, `denominator`).
use dojo_core::session::{denominator, requeue, summary, Answer};
use serde_json::{json, Map, Value};

const NOW: i64 = 1_760_000_000_000;
const D: i64 = 86_400_000;

fn ans(id: &str, right: bool) -> Answer {
    Answer { id: id.to_string(), right }
}

fn records(v: Value) -> Map<String, Value> {
    v.as_object().cloned().unwrap_or_default()
}

fn ids(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| s.to_string()).collect()
}

#[test]
fn requeue_picks_a_different_question_for_every_seed() {
    let pool = ["a", "b", "c"];
    for seed in 0..64u64 {
        let picked = requeue("u", &pool, "a", 0, 1, seed).expect("pool has other questions");
        assert_ne!(picked, "a", "seed {seed} asked the same question again");
        assert!(pool.contains(&picked.as_str()));
    }
}

#[test]
fn requeue_stops_at_repeat_max() {
    let pool = ["a", "b", "c"];
    assert!(requeue("u", &pool, "a", 1, 1, 7).is_none(), "repeatMax=1 allows one repeat only");
    assert!(requeue("u", &pool, "a", 1, 2, 7).is_some(), "repeatMax=2 allows a second repeat");
    assert!(requeue("u", &pool, "a", 2, 2, 7).is_none(), "repeatMax=2 stops after two repeats");
}

#[test]
fn requeue_single_question_pool_is_none() {
    assert!(requeue("u", &["a"], "a", 0, 3, 1).is_none());
    assert!(requeue("u", &[], "a", 0, 3, 1).is_none());
}

#[test]
fn requeue_is_deterministic_for_a_seed() {
    let pool = ["a", "b", "c", "d"];
    assert_eq!(requeue("u", &pool, "a", 0, 1, 42), requeue("u", &pool, "a", 0, 1, 42));
}

#[test]
fn summary_counts_answers_weak_units_and_next_due() {
    let answers = [ans("a", true), ans("b", false), ans("c", true)];
    let units = vec![ids(&["a", "b"]), ids(&["c"]), ids(&["d"])];
    let recs = records(json!({
        "a": {"due": NOW + D, "wk": 1},
        "b": {"due": NOW + 3 * D},
        "c": {"due": NOW - 1},
    }));
    let s = summary(&answers, &units, &recs, NOW);
    assert_eq!(s.answered, 3);
    assert_eq!(s.right, 2);
    assert_eq!(s.weak_left, 1, "only the unit with wk counts as weak");
    assert_eq!(s.next_due, Some(NOW + D), "earliest due of the non-due recorded units");
}

#[test]
fn summary_next_due_is_none_when_nothing_recorded() {
    let units = vec![ids(&["a"]), ids(&["b"])];
    let s = summary(&[ans("a", false)], &units, &Map::new(), NOW);
    assert_eq!(s.answered, 1);
    assert_eq!(s.right, 0);
    assert_eq!(s.weak_left, 0);
    assert_eq!(s.next_due, None);
}

#[test]
fn summary_skips_due_units_for_next_due() {
    let units = vec![ids(&["a"]), ids(&["b"])];
    let recs = records(json!({"a": {"due": NOW - D}, "b": {"due": NOW + 2 * D}}));
    let s = summary(&[], &units, &recs, NOW);
    assert_eq!(s.next_due, Some(NOW + 2 * D));
}

#[test]
fn denominator_adds_repeats_to_planned() {
    assert_eq!(denominator(5, 2), 7);
    assert_eq!(denominator(0, 0), 0);
}
