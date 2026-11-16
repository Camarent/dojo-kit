//! Session order: category mix over units, seeded order inside a category, spread of one entity's units.
use crate::rng::seeded_shuffle;
use std::cmp::Reverse;
use std::collections::{HashMap, HashSet, VecDeque};

/// Category flags of one unit. A unit joins the first mix kind it fits.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UnitFlags {
    pub weak: bool,
    pub new: bool,
    pub due: bool,
}

fn fits(flags: UnitFlags, kind: &str) -> bool {
    match kind {
        "weak" => flags.weak,
        "new" => flags.new,
        "due" => flags.due,
        _ => false,
    }
}

/// Unit indices in session order with the mix kind each one was taken for. Kinds follow `mix` order;
/// inside a kind the units are shuffled by `seed`. A unit appears once.
pub fn mix_order(flags: &[UnitFlags], mix: &[String], seed: u64) -> Vec<(usize, String)> {
    let mut taken: HashSet<usize> = HashSet::new();
    let mut state = seed;
    let mut out = Vec::new();
    for kind in mix {
        let mut picked: Vec<usize> = flags
            .iter()
            .enumerate()
            .filter(|(i, f)| !taken.contains(i) && fits(**f, kind))
            .map(|(i, _)| i)
            .collect();
        seeded_shuffle(&mut picked, &mut state);
        for i in picked {
            taken.insert(i);
            out.push((i, kind.clone()));
        }
    }
    out
}

/// Interleaves `seq` so that no two neighbours share an entity while another entity is left.
/// Each step takes the front of the entity group with the most items left, skipping the previous group;
/// ties go to the group that appears first in `seq`, so distinct entities keep their order.
pub fn spread<T, F: Fn(&T) -> &str>(seq: Vec<T>, entity: F) -> Vec<T> {
    let mut groups: Vec<(String, VecDeque<T>)> = Vec::new();
    let mut slot: HashMap<String, usize> = HashMap::new();
    for t in seq {
        let e = entity(&t).to_string();
        let i = *slot.entry(e.clone()).or_insert_with(|| {
            groups.push((e, VecDeque::new()));
            groups.len() - 1
        });
        if let Some(g) = groups.get_mut(i) {
            g.1.push_back(t);
        }
    }
    let total: usize = groups.iter().map(|g| g.1.len()).sum();
    let mut out = Vec::with_capacity(total);
    let mut prev: Option<usize> = None;
    for _ in 0..total {
        let other = (0..groups.len())
            .filter(|&i| Some(i) != prev && groups.get(i).is_some_and(|g| !g.1.is_empty()))
            .max_by_key(|&i| (groups.get(i).map_or(0, |g| g.1.len()), Reverse(i)));
        let Some(i) = other.or(prev) else { break };
        let Some(g) = groups.get_mut(i) else { break };
        if let Some(t) = g.1.pop_front() {
            out.push(t);
        }
        prev = Some(i);
    }
    out
}
