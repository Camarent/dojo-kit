//! Finish screen numbers: answered and right counts, weak units left, and the next due time.
use crate::srs::{int_field, is_due};
use serde_json::{Map, Value};

/// One answer of the session, in the order given.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Answer {
    pub id: String,
    pub right: bool,
}

/// Summary shown on the finish screen. `next_due` is `None` when nothing is recorded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Summary {
    pub answered: usize,
    pub right: usize,
    pub weak_left: usize,
    pub next_due: Option<i64>,
}

/// Question count of the run: the planned questions plus the repeats re-queued in this session.
pub fn denominator(planned: usize, repeats_added: usize) -> usize {
    planned + repeats_added
}

/// Summary of `answers` against the records after the session. `units` lists the member item ids of each unit.
/// A unit is weak when a member has `wk` set. `next_due` is the earliest due of the units with records
/// that are not due at `now`.
pub fn summary(answers: &[Answer], units: &[Vec<String>], records: &Map<String, Value>, now: i64) -> Summary {
    let right = answers.iter().filter(|a| a.right).count();
    let mut weak_left = 0usize;
    let mut next_due: Option<i64> = None;
    for members in units {
        let recs: Vec<Option<&Value>> = members.iter().map(|id| records.get(id)).collect();
        if recs.iter().any(|r| int_field(*r, "wk") == 1) {
            weak_left += 1;
        }
        let recorded = recs.iter().filter(|r| r.is_some()).count();
        if recorded == 0 || recs.iter().any(|r| is_due(*r, now)) {
            continue;
        }
        let earliest = recs.iter().flatten().map(|r| int_field(Some(*r), "due")).min();
        next_due = match (next_due, earliest) {
            (Some(a), Some(b)) => Some(a.min(b)),
            (a, b) => a.or(b),
        };
    }
    Summary { answered: answers.len(), right, weak_left, next_due }
}
