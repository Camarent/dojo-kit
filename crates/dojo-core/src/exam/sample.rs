use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use super::Section;
use crate::rng::seeded_shuffle;

/// A section range in sample output: start index and count of items for a section.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SectionRange {
    pub title: String,
    pub start: usize,
    pub count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Candidate {
    pub id: String,
    pub unit: String,
    pub tags: Vec<String>,
    pub item_type: String,
    pub stimulus: Option<String>,
    pub exam_only: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Shortage {
    pub title: String,
    pub short_by: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    pub ids: Vec<String>,
    pub short: Vec<Shortage>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sections: Vec<SectionRange>,
}
fn matches_section(c: &Candidate, section: &Section) -> bool {
    section.units.as_ref().is_none_or(|units| units.contains(&c.unit))
        && section.tags.as_ref().is_none_or(|tags| c.tags.iter().any(|t| tags.contains(t)))
        && section.types.as_ref().is_none_or(|types| types.contains(&c.item_type))
}

/// Draw groups from a pool with the given count, using the provided splitmix64 state.
/// Returns (picked_indices, remaining_count)
// Contract: `reach` has `units.len() + 1` rows of `effective_count + 1` columns; `i < units.len()`, `s <= effective_count`, `size <= s` before `s - size`; `units[i]` bounded by `n`.
#[allow(clippy::indexing_slicing)]
fn draw_tier(units: &mut [Vec<usize>], count: usize, state: &mut u64) -> (Vec<usize>, usize) {
    seeded_shuffle(units, state);
    let pool_size: usize = units.iter().map(|u| u.len()).sum();
    let mut remaining = count;
    let mut picked: Vec<usize> = Vec::new();
    for (i, unit) in units.iter().enumerate() {
        if remaining == 0 {
            break;
        }
        if unit.len() > remaining {
            continue;
        }
        remaining -= unit.len();
        picked.push(i);
    }
    if remaining > 0 && units.iter().any(|u| u.len() > 1) {
        let effective_count = count.min(pool_size);
        let n = units.len();
        let mut reach = vec![vec![false; effective_count + 1]; n + 1];
        reach[n][0] = true;
        for i in (0..n).rev() {
            let size = units[i].len();
            for s in 0..=effective_count {
                reach[i][s] = reach[i + 1][s] || (size <= s && reach[i + 1][s - size]);
            }
        }
        let best = (0..=effective_count).rev().find(|&s| reach[0][s]).unwrap_or(0);
        if remaining <= effective_count && best > effective_count - remaining {
            let mut s = best;
            picked.clear();
            for i in 0..n {
                let size = units[i].len();
                if size <= s && reach[i + 1][s - size] {
                    picked.push(i);
                    s -= size;
                }
            }
            remaining = count - best;
        }
    }
    (picked, remaining)
}

/// Draws each section's items from the candidates not yet used, shuffled with a splitmix64 stream seeded by `seed`.
/// Candidates sharing a `stimulus` form a group drawn whole and in input order; `count` counts items.
/// Candidates with `exam_only: true` are drawn first, then the remaining count is filled from other candidates.
/// A group larger than the remaining count is skipped and the unfilled rest is reported in `short`.
/// If `section.count` exceeds the candidate pool, it is clamped to the pool size before sampling.
/// Returns section ranges that map each section to its index range in the output `ids`.
// Contract: group indices come from `groups.len() - 1` at push time; `picked` indices are produced by `draw_tier` over `tier`; candidate indices come from `enumerate`.
#[allow(clippy::indexing_slicing)]
pub fn sample(candidates: &[Candidate], sections: &[Section], seed: u64) -> Sample {
    let mut state = seed;
    let mut used: HashSet<&str> = HashSet::new();
    let mut ids = Vec::new();
    let mut short = Vec::new();
    let mut section_ranges = Vec::new();
    let mut start_idx = 0;

    for section in sections {
        let section_start = start_idx;

        let mut groups: Vec<Vec<usize>> = Vec::new();
        let mut stim_to_group: HashMap<&str, usize> = HashMap::new();
        for (idx, c) in candidates.iter().enumerate() {
            if used.contains(c.id.as_str()) || !matches_section(c, section) {
                continue;
            }
            match c.stimulus.as_deref() {
                Some(stim) => {
                    let g = *stim_to_group.entry(stim).or_insert_with(|| {
                        groups.push(Vec::new());
                        groups.len() - 1
                    });
                    groups[g].push(idx);
                }
                None => groups.push(vec![idx]),
            }
        }

        let (exam_only_groups, regular_groups): (Vec<Vec<usize>>, Vec<Vec<usize>>) =
            groups.into_iter().partition(|g| g.iter().any(|&i| candidates[i].exam_only));
        let first_tier_used = !exam_only_groups.is_empty();

        let count = section.count;
        let mut remaining = count;
        let mut picked_indices: Vec<usize> = Vec::new();
        for (tier_no, mut tier) in [exam_only_groups, regular_groups].into_iter().enumerate() {
            let second_tier = tier_no == 1;
            if tier.is_empty() {
                continue;
            }
            if second_tier && first_tier_used && remaining == 0 {
                continue;
            }
            let (picked, left) = draw_tier(&mut tier, remaining, &mut state);
            remaining = left;
            for g in picked {
                picked_indices.extend(tier[g].iter().copied());
            }
        }

        for &idx in &picked_indices {
            let c = &candidates[idx];
            used.insert(c.id.as_str());
            ids.push(c.id.clone());
        }

        let section_count = count - remaining;
        section_ranges.push(SectionRange { title: section.title.clone(), start: section_start, count: section_count });
        start_idx += section_count;

        if remaining > 0 {
            short.push(Shortage { title: section.title.clone(), short_by: remaining });
        }
    }

    Sample { ids, short, sections: section_ranges }
}

#[cfg(test)]
#[path = "tests_sample.rs"]
mod tests;
