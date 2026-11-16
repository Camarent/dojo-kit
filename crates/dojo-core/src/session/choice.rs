//! Question choice inside one unit: never seen, then missed, then oldest asked; never the question asked last.
use crate::srs::int_field;
use serde_json::{Map, Value};

/// A question counts as seen once it has a recorded right or wrong answer.
fn seen(rec: Option<&Value>) -> bool {
    int_field(rec, "qok") + int_field(rec, "qbad") > 0
}

/// Up to `take` question ids of one unit, best first. The question asked last in this unit (max `qlast`)
/// is skipped when another question exists. Ties keep file order.
pub fn pick_questions(members: &[&str], records: &Map<String, Value>, take: usize) -> Vec<String> {
    let rec = |id: &str| records.get(id);
    let last = members
        .iter()
        .copied()
        .filter(|id| seen(rec(id)) && int_field(rec(id), "qlast") > 0)
        .max_by_key(|id| int_field(rec(id), "qlast"));
    let mut candidates: Vec<&str> = members.iter().copied().filter(|id| Some(*id) != last).collect();
    if candidates.is_empty() {
        candidates = members.to_vec();
    }
    candidates.sort_by_key(|id| (seen(rec(id)), int_field(rec(id), "qbad") <= 0, int_field(rec(id), "qlast")));
    candidates.into_iter().take(take).map(String::from).collect()
}
