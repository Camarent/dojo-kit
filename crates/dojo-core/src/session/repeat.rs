//! Wrong-answer re-queue: a different question of the same unit is asked again later in the session.
use crate::rng::splitmix64;

/// Picks the question to insert later in the queue after a wrong answer to `answered`.
/// `_unit` is the id of the unit that `pool` belongs to; the pool already holds only its questions,
/// so the id is not used for the pick. Returns `None` when `already_repeated` has reached `repeat_max`,
/// or when `pool` has no question other than `answered` (a single-question unit stays weak).
/// The pick is a pure function of `seed`: the same inputs give the same question.
pub fn requeue(
    _unit: &str,
    pool: &[&str],
    answered: &str,
    already_repeated: usize,
    repeat_max: usize,
    seed: u64,
) -> Option<String> {
    if already_repeated >= repeat_max {
        return None;
    }
    let others: Vec<&str> = pool.iter().copied().filter(|id| *id != answered).collect();
    if others.is_empty() {
        return None;
    }
    let mut state = seed;
    let index = usize::try_from(splitmix64(&mut state) % others.len() as u64).ok()?;
    others.get(index).map(|id| (*id).to_string())
}
