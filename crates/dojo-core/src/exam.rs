use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use crate::content::{ScoringPart, PassRule, PassMode};

/// Default pass mark (60%).
pub const DEFAULT_PASS_MARK: f64 = 0.6;

/// Resolves the pass mode from the pass rule and whether scoring parts are present.
pub fn resolve_mode(pass: Option<&PassRule>, has_scoring: bool) -> PassMode {
    pass.and_then(|p| p.mode).unwrap_or(if has_scoring { PassMode::Points } else { PassMode::Percent })
}

/// One exam section: how many items to draw and from where. `None` filters match everything.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Section {
    pub title: String,
    pub count: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub units: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub types: Option<Vec<String>>,
}

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

/// One part's scored result.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PartResult {
    pub title: String,
    pub raw: usize,
    pub total: usize,
    pub points: u32,
    pub pass: bool,
}

/// Full score result with optional parts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Score {
    pub raw: usize,
    pub total: usize,
    pub fraction: f64,
    pub pass: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub parts: Vec<PartResult>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_points: Option<u32>,
    #[serde(skip_serializing_if = "std::ops::Not::not", default)]
    pub estimate: bool,
}

/// splitmix64 step: advances `state` and returns the next value.
pub fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E3779B97F4A7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

fn matches_section(c: &Candidate, section: &Section) -> bool {
    section.units.as_ref().is_none_or(|units| units.contains(&c.unit))
        && section.tags.as_ref().is_none_or(|tags| c.tags.iter().any(|t| tags.contains(t)))
        && section.types.as_ref().is_none_or(|types| types.contains(&c.item_type))
}

/// Draw groups from a pool with the given count, using the provided splitmix64 state.
/// Returns (picked_indices, remaining_count)
fn draw_tier(units: &mut Vec<Vec<usize>>, count: usize, state: &mut u64) -> (Vec<usize>, usize) {
    for i in (1..units.len()).rev() {
        let j = (splitmix64(state) % (i as u64 + 1)) as usize;
        units.swap(i, j);
    }
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

/// `results` holds one `(id, correct)` per answered question; `total` is the exam size.
pub fn score(results: &[(String, bool)], total: usize, pass_mark: f64) -> Score {
    let raw = results.iter().filter(|(_, correct)| *correct).count();
    let fraction = if total == 0 {
        0.0
    } else {
        raw as f64 / total as f64
    };
    let pass = total > 0 && fraction >= pass_mark;
    Score { raw, total, fraction, pass, parts: Vec::new(), total_points: None, estimate: false }
}

/// Computes one result per scoring part and the summed points.
/// `results[i]` is the answer to sampled question `i` (sample order); a section's questions are the index range
/// in `section_ranges`. An unanswered question must be passed as `correct: false`.
/// A part's total is the size of its sections; `points = round(points * raw / total)` (0 when total is 0).
/// Errors when a part names a section absent from `section_ranges` or a section is used by two parts.
pub fn compute_parts(
    results: &[(String, bool)],
    section_ranges: &[SectionRange],
    scoring_parts: &[ScoringPart],
) -> Result<(Vec<PartResult>, u64), String> {
    let mut used: HashSet<&str> = HashSet::new();
    let mut part_results = Vec::new();
    let mut total_points: u64 = 0;

    for part in scoring_parts {
        let mut part_raw = 0usize;
        let mut part_total = 0usize;
        for title in &part.sections {
            let sr = section_ranges
                .iter()
                .find(|sr| &sr.title == title)
                .ok_or_else(|| format!("scoring part '{}' references unknown section '{title}'", part.title))?;
            if !used.insert(title.as_str()) {
                return Err(format!("section '{title}' is used by more than one scoring part"));
            }
            part_total += sr.count;
            part_raw += results.iter().skip(sr.start).take(sr.count).filter(|(_, correct)| *correct).count();
        }
        let points = if part_total == 0 {
            0
        } else {
            (part.points as f64 * part_raw as f64 / part_total as f64).round() as u64
        };
        total_points += points;
        let pass = part.min_points.is_none_or(|min_p| points >= min_p as u64);
        let points_u32 = u32::try_from(points).map_err(|_| format!("part '{}' points {} overflows u32", part.title, points))?;
        part_results.push(PartResult { title: part.title.clone(), raw: part_raw, total: part_total, points: points_u32, pass });
    }
    Ok((part_results, total_points))
}

/// Grouped arguments of `score_with_parts`.
pub struct PartsInput<'a> {
    pub section_ranges: &'a [SectionRange],
    pub scoring_parts: &'a [ScoringPart],
    pub pass_points: Option<i64>,
    pub pass_mode: PassMode,
    pub scaled: bool,
}

/// Score with scoring parts. Percent mode: pass = total > 0 AND fraction >= pass_mark.
/// Points mode: pass = all parts pass AND (when `pass_points` is set) total_points >= pass_points;
/// `estimate` is set only for points mode with `scaled`.
pub fn score_with_parts(
    results: &[(String, bool)],
    total: usize,
    pass_mark: f64,
    input: PartsInput<'_>,
) -> Result<Score, String> {
    let base = score(results, total, pass_mark);
    let (parts, total_points) = compute_parts(results, input.section_ranges, input.scoring_parts)?;
    let parts_pass = parts.iter().all(|p| p.pass);
    let points_pass = input.pass_points.is_none_or(|pp| total_points as i64 >= pp);
    let total_points_u32 = u32::try_from(total_points).map_err(|_| format!("total points {} overflows u32", total_points))?;
    let (pass, estimate) = match input.pass_mode {
        PassMode::Percent => (base.pass, false),
        PassMode::Points => (parts_pass && points_pass, input.scaled),
    };
    Ok(Score {
        pass,
        parts,
        total_points: Some(total_points_u32),
        estimate,
        ..base
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grouped(sizes: &[usize]) -> Vec<Candidate> {
        let mut out = Vec::new();
        for (g, &n) in sizes.iter().enumerate() {
            for k in 0..n {
                out.push(Candidate {
                    id: format!("g{g}-{k}"),
                    unit: "u".to_string(),
                    tags: vec![],
                    item_type: "choice".to_string(),
                    stimulus: Some(format!("g{g}")),
                    exam_only: false,
                });
            }
        }
        out
    }

    #[test]
    fn sample_fill_property_200_seeds() {
        let cands = grouped(&[3, 2, 2]);
        let sections = vec![Section { title: "s".to_string(), count: 4, units: None, tags: None, types: None }];
        for seed in 0..200u64 {
            let s = sample(&cands, &sections, seed);
            assert_eq!(s.ids.len(), 4, "seed {seed}");
            assert!(s.short.is_empty(), "seed {seed}");
            let mut seen = HashSet::new();
            for id in &s.ids {
                assert!(seen.insert(id), "duplicate id in output for seed {seed}");
            }
        }
        let sections = vec![Section { title: "s".to_string(), count: 5, units: None, tags: None, types: None }];
        let cands = grouped(&[4, 4]);
        for seed in 0..200u64 {
            let s = sample(&cands, &sections, seed);
            assert_eq!(s.ids.len(), 4, "seed {seed}");
            assert_eq!(s.short.len(), 1, "seed {seed}");
            assert_eq!(s.short[0].short_by, 1, "seed {seed}");
            let mut seen = HashSet::new();
            for id in &s.ids {
                assert!(seen.insert(id), "duplicate id in output for seed {seed}");
            }
            for group in &cands {
                if group.stimulus.is_some() {
                    let group_ids: Vec<&str> = cands.iter().filter(|c| c.stimulus == group.stimulus).map(|c| c.id.as_str()).collect();
                    for id in &s.ids {
                        if group_ids.contains(&id.as_str()) {
                            for gid in &group_ids {
                                assert!(s.ids.contains(&gid.to_string()), "stimulus group not kept whole for seed {seed}");
                            }
                            break;
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn sample_huge_count_clamped_to_pool() {
        let cands = grouped(&[2, 3]);
        let sections = vec![Section { title: "s".to_string(), count: 1_000_000_000, units: None, tags: None, types: None }];
        let s = sample(&cands, &sections, 42);
        assert_eq!(s.ids.len(), 5);
        assert_eq!(s.short.len(), 1);
        assert_eq!(s.short[0].title, "s");
        assert_eq!(s.short[0].short_by, 999_999_995);
        let mut seen = HashSet::new();
        for id in &s.ids {
            assert!(seen.insert(id), "duplicate id");
        }
    }

    #[test]
    fn score_simple() {
        let results = vec![("q1".to_string(), true), ("q2".to_string(), true), ("q3".to_string(), false)];
        let s = score(&results, 3, 0.7);
        assert_eq!(s.raw, 2);
        assert_eq!(s.total, 3);
        assert!((s.fraction - 0.6666666666666666).abs() < 0.0001);
        assert!(!s.pass);
        assert!(s.parts.is_empty());
        assert!(s.total_points.is_none());
    }

    #[test]
    fn score_with_parts_basic() {
        let results = vec![
            ("q1".to_string(), true),
            ("q2".to_string(), true),
            ("q3".to_string(), false),
            ("q4".to_string(), true),
        ];
        let section_ranges = vec![
            SectionRange { title: "s1".to_string(), start: 0, count: 2 },
            SectionRange { title: "s2".to_string(), start: 2, count: 2 },
        ];
        let scoring_parts = vec![
            ScoringPart {
                title: "Part1".to_string(),
                sections: vec!["s1".to_string()],
                points: 60,
                min_points: None,
            },
            ScoringPart {
                title: "Part2".to_string(),
                sections: vec!["s2".to_string()],
                points: 60,
                min_points: None,
            },
        ];
        let s = score_with_parts(
            &results,
            4,
            0.7,
            PartsInput {
                section_ranges: &section_ranges,
                scoring_parts: &scoring_parts,
                pass_points: None,
                pass_mode: PassMode::Points,
                scaled: false,
            },
        ).unwrap();
        assert_eq!(s.raw, 3);
        assert_eq!(s.total, 4);
        assert!(s.fraction >= 0.7);
        assert!(s.pass);
        assert_eq!(s.parts.len(), 2);
        // Part1: 2/2 correct, points = round(60 * 2 / 2) = 60
        assert_eq!(s.parts[0].raw, 2);
        assert_eq!(s.parts[0].total, 2);
        assert_eq!(s.parts[0].points, 60);
        assert!(s.parts[0].pass);
        // Part2: 1/2 correct, points = round(60 * 1 / 2) = 30
        assert_eq!(s.parts[1].raw, 1);
        assert_eq!(s.parts[1].total, 2);
        assert_eq!(s.parts[1].points, 30);
        assert!(s.parts[1].pass);
        assert_eq!(s.total_points, Some(90));
    }

    #[test]
    fn score_with_parts_rounding_half_up() {
        let results: Vec<(String, bool)> = (0..8).map(|i| (format!("q{i}"), i == 0)).collect();
        let section_ranges = vec![SectionRange { title: "s1".to_string(), start: 0, count: 8 }];
        let scoring_parts = vec![ScoringPart { title: "P".to_string(), sections: vec!["s1".to_string()], points: 60, min_points: None }];
        let s = score_with_parts(
            &results,
            8,
            0.0,
            PartsInput {
                section_ranges: &section_ranges,
                scoring_parts: &scoring_parts,
                pass_points: None,
                pass_mode: PassMode::Points,
                scaled: false,
            },
        ).unwrap();
        assert_eq!(s.parts[0].points, 8); // 60 * 1 / 8 = 7.5
    }

    #[test]
    fn score_with_parts_unknown_section_errors() {
        let results = vec![("q1".to_string(), true)];
        let section_ranges = vec![SectionRange { title: "s1".to_string(), start: 0, count: 1 }];
        let scoring_parts = vec![ScoringPart { title: "P".to_string(), sections: vec!["nope".to_string()], points: 10, min_points: None }];
        assert!(score_with_parts(
            &results,
            1,
            0.0,
            PartsInput {
                section_ranges: &section_ranges,
                scoring_parts: &scoring_parts,
                pass_points: None,
                pass_mode: PassMode::Points,
                scaled: false,
            },
        ).is_err());
    }

    #[test]
    fn score_with_parts_section_in_two_parts_errors() {
        let results = vec![("q1".to_string(), true)];
        let section_ranges = vec![SectionRange { title: "s1".to_string(), start: 0, count: 1 }];
        let part = |t: &str| ScoringPart { title: t.to_string(), sections: vec!["s1".to_string()], points: 10, min_points: None };
        assert!(score_with_parts(
            &results,
            1,
            0.0,
            PartsInput {
                section_ranges: &section_ranges,
                scoring_parts: &[part("A"), part("B")],
                pass_points: None,
                pass_mode: PassMode::Points,
                scaled: false,
            },
        ).is_err());
    }

    #[test]
    fn score_with_parts_partial_results_use_total() {
        let results = vec![("q1".to_string(), true)];
        let section_ranges = vec![SectionRange { title: "s1".to_string(), start: 0, count: 4 }];
        let scoring_parts = vec![ScoringPart { title: "P".to_string(), sections: vec!["s1".to_string()], points: 100, min_points: None }];
        let s = score_with_parts(
            &results,
            4,
            0.5,
            PartsInput {
                section_ranges: &section_ranges,
                scoring_parts: &scoring_parts,
                pass_points: None,
                pass_mode: PassMode::Percent,
                scaled: false,
            },
        ).unwrap();
        assert_eq!(s.parts[0].points, 25);
        assert!(!s.pass); // 1/4 < 0.5
    }

    #[test]
    fn score_with_parts_min_points_fail() {
        let results = vec![
            ("q1".to_string(), true),
            ("q2".to_string(), false),
        ];
        let section_ranges = vec![
            SectionRange { title: "s1".to_string(), start: 0, count: 2 },
        ];
        let scoring_parts = vec![
            ScoringPart {
                title: "Part1".to_string(),
                sections: vec!["s1".to_string()],
                points: 100,
                min_points: Some(60), // Need at least 60 points to pass this part
            },
        ];
        let s = score_with_parts(
            &results,
            2,
            0.5,
            PartsInput {
                section_ranges: &section_ranges,
                scoring_parts: &scoring_parts,
                pass_points: None,
                pass_mode: PassMode::Points,
                scaled: false,
            },
        ).unwrap();
        assert_eq!(s.parts.len(), 1);
        // 1/2 correct: points = round(100 * 1 / 2) = 50
        assert_eq!(s.parts[0].points, 50);
        assert!(!s.parts[0].pass); // 50 < 60
        assert!(!s.pass); // Overall pass requires all parts to pass
    }

    #[test]
    fn score_with_parts_total_points_fail() {
        let results = vec![
            ("q1".to_string(), true),
            ("q2".to_string(), true),
        ];
        let section_ranges = vec![
            SectionRange { title: "s1".to_string(), start: 0, count: 2 },
        ];
        let scoring_parts = vec![
            ScoringPart {
                title: "Part1".to_string(),
                sections: vec!["s1".to_string()],
                points: 100,
                min_points: None,
            },
        ];
        let s = score_with_parts(
            &results,
            2,
            0.5,
            PartsInput {
                section_ranges: &section_ranges,
                scoring_parts: &scoring_parts,
                pass_points: Some(80),
                pass_mode: PassMode::Points,
                scaled: false,
            },
        ).unwrap();
        assert_eq!(s.parts.len(), 1);
        // 2/2 correct: points = round(100 * 2 / 2) = 100
        assert_eq!(s.parts[0].points, 100);
        assert!(s.parts[0].pass);
        assert!(s.fraction >= 0.5);
        assert!(s.total_points == Some(100));
        assert!(s.pass); // total_points (100) >= passPoints (80)
    }

    #[test]
    fn score_with_parts_total_points_exact_threshold() {
        let results = vec![
            ("q1".to_string(), true),
        ];
        let section_ranges = vec![
            SectionRange { title: "s1".to_string(), start: 0, count: 2 },
        ];
        let scoring_parts = vec![
            ScoringPart {
                title: "Part1".to_string(),
                sections: vec!["s1".to_string()],
                points: 100,
                min_points: None,
            },
        ];
        let s = score_with_parts(
            &results,
            2,
            0.0,
            PartsInput {
                section_ranges: &section_ranges,
                scoring_parts: &scoring_parts,
                pass_points: Some(50),
                pass_mode: PassMode::Points,
                scaled: false,
            },
        ).unwrap();
        // 1/2 correct: points = round(100 * 1 / 2) = 50
        assert_eq!(s.total_points, Some(50));
        assert!(s.pass); // 50 >= 50
    }

    #[test]
    fn sample_basic() {
        let candidates = vec![
            Candidate { id: "c1".to_string(), unit: "u1".to_string(), tags: vec![], item_type: "choice".to_string(), stimulus: None, exam_only: false },
            Candidate { id: "c2".to_string(), unit: "u1".to_string(), tags: vec![], item_type: "choice".to_string(), stimulus: None, exam_only: false },
            Candidate { id: "c3".to_string(), unit: "u1".to_string(), tags: vec![], item_type: "choice".to_string(), stimulus: None, exam_only: false },
        ];
        let sections = vec![
            Section { title: "s1".to_string(), count: 2, units: None, tags: None, types: None },
        ];
        let r = sample(&candidates, &sections, 42);
        assert_eq!(r.ids.len(), 2);
        assert_eq!(r.sections.len(), 1);
        assert_eq!(r.sections[0].title, "s1");
        assert_eq!(r.sections[0].start, 0);
        assert_eq!(r.sections[0].count, 2);
        assert!(r.short.is_empty());
    }

    #[test]
    fn sample_with_sections_output() {
        let candidates = vec![
            Candidate { id: "c1".to_string(), unit: "u1".to_string(), tags: vec![], item_type: "choice".to_string(), stimulus: None, exam_only: false },
            Candidate { id: "c2".to_string(), unit: "u1".to_string(), tags: vec![], item_type: "choice".to_string(), stimulus: None, exam_only: false },
            Candidate { id: "c3".to_string(), unit: "u1".to_string(), tags: vec![], item_type: "choice".to_string(), stimulus: None, exam_only: false },
            Candidate { id: "c4".to_string(), unit: "u1".to_string(), tags: vec![], item_type: "choice".to_string(), stimulus: None, exam_only: false },
        ];
        let sections = vec![
            Section { title: "s1".to_string(), count: 2, units: None, tags: None, types: None },
            Section { title: "s2".to_string(), count: 2, units: None, tags: None, types: None },
        ];
        let r = sample(&candidates, &sections, 42);
        assert_eq!(r.sections.len(), 2);
        assert_eq!(r.sections[0].title, "s1");
        assert_eq!(r.sections[1].title, "s2");
    }

    #[test]
    fn points_mode_ignores_pass_mark() {
        let results = vec![
            ("q1".to_string(), true),
            ("q2".to_string(), false),
            ("q3".to_string(), false),
            ("q4".to_string(), false),
        ];
        let section_ranges = vec![
            SectionRange { title: "s1".to_string(), start: 0, count: 4 },
        ];
        let scoring_parts = vec![
            ScoringPart {
                title: "Part1".to_string(),
                sections: vec!["s1".to_string()],
                points: 100,
                min_points: None,
            },
        ];
        let pass_mark = 0.9;
        let s = score_with_parts(&results, 4, pass_mark, PartsInput { section_ranges: &section_ranges, scoring_parts: &scoring_parts, pass_points: None, pass_mode: PassMode::Points, scaled: false }).unwrap();
        assert!(s.pass); // Passes because parts_pass && points_pass, fraction is ignored
        assert!(!s.estimate);
    }

    #[test]
    fn percent_mode_ignores_part_minimums() {
        let results = vec![
            ("q1".to_string(), true),
            ("q2".to_string(), false),
            ("q3".to_string(), true),
            ("q4".to_string(), true),
        ];
        let section_ranges = vec![
            SectionRange { title: "s1".to_string(), start: 0, count: 2 },
            SectionRange { title: "s2".to_string(), start: 2, count: 2 },
        ];
        let scoring_parts = vec![
            ScoringPart {
                title: "Part1".to_string(),
                sections: vec!["s1".to_string()],
                points: 100,
                min_points: Some(100), // Requires all points
            },
            ScoringPart {
                title: "Part2".to_string(),
                sections: vec!["s2".to_string()],
                points: 100,
                min_points: None,
            },
        ];
        let s = score_with_parts(
            &results,
            4,
            0.7,
            PartsInput {
                section_ranges: &section_ranges,
                scoring_parts: &scoring_parts,
                pass_points: None,
                pass_mode: PassMode::Percent,
                scaled: false,
            },
        ).unwrap();
        assert!(s.pass); // Passes because fraction (0.75) >= pass_mark (0.7), part min_points are ignored
        assert!(!s.estimate);
    }

    #[test]
    fn missing_pass_mark_defaults_to_60_percent() {
        let results = vec![
            ("q1".to_string(), true),
            ("q2".to_string(), true),
            ("q3".to_string(), true),
        ];
        assert!(score(&results, 3, DEFAULT_PASS_MARK).pass);
        let six: Vec<(String, bool)> = (0..10).map(|i| (format!("q{i}"), i < 6)).collect();
        assert!(score(&six, 10, DEFAULT_PASS_MARK).pass);
        let five: Vec<(String, bool)> = (0..10).map(|i| (format!("q{i}"), i < 5)).collect();
        assert!(!score(&five, 10, DEFAULT_PASS_MARK).pass);
    }

    #[test]
    fn explicit_zero_pass_mark_is_not_the_default() {
        let none: Vec<(String, bool)> = (0..3).map(|i| (format!("q{i}"), false)).collect();
        assert!(score(&none, 3, 0.0).pass);
    }

    #[test]
    fn estimate_only_for_scaled_points() {
        let results = vec![
            ("q1".to_string(), true),
            ("q2".to_string(), true),
        ];
        let section_ranges = vec![
            SectionRange { title: "s1".to_string(), start: 0, count: 2 },
        ];
        let scoring_parts = vec![
            ScoringPart {
                title: "Part1".to_string(),
                sections: vec!["s1".to_string()],
                points: 100,
                min_points: None,
            },
        ];
        let s_points = score_with_parts(
            &results,
            2,
            0.5,
            PartsInput {
                section_ranges: &section_ranges,
                scoring_parts: &scoring_parts,
                pass_points: None,
                pass_mode: PassMode::Points,
                scaled: false,
            },
        ).unwrap();
        let s_percent = score_with_parts(
            &results,
            2,
            0.5,
            PartsInput {
                section_ranges: &section_ranges,
                scoring_parts: &scoring_parts,
                pass_points: None,
                pass_mode: PassMode::Percent,
                scaled: false,
            },
        ).unwrap();
        let s_scaled = score_with_parts(&results, 2, 0.5, PartsInput { section_ranges: &section_ranges, scoring_parts: &scoring_parts, pass_points: None, pass_mode: PassMode::Points, scaled: true }).unwrap();
        let s_percent_scaled = score_with_parts(&results, 2, 0.5, PartsInput { section_ranges: &section_ranges, scoring_parts: &scoring_parts, pass_points: None, pass_mode: PassMode::Percent, scaled: true }).unwrap();
        assert!(!s_points.estimate);
        assert!(!s_percent.estimate);
        assert!(s_scaled.estimate);
        assert!(!s_percent_scaled.estimate);
    }

    fn cand(id: &str, stim: Option<&str>, exam_only: bool) -> Candidate {
        Candidate {
            id: id.to_string(),
            unit: "u".to_string(),
            tags: vec![],
            item_type: "choice".to_string(),
            stimulus: stim.map(str::to_string),
            exam_only,
        }
    }

    fn section(title: &str, count: usize) -> Section {
        Section { title: title.to_string(), count, units: None, tags: None, types: None }
    }

    #[test]
    fn exam_only_items_are_drawn_before_regular() {
        let cands = vec![
            cand("r1", None, false),
            cand("e1", None, true),
            cand("r2", None, false),
            cand("e2", None, true),
            cand("r3", None, false),
        ];
        for seed in 0..50u64 {
            let s = sample(&cands, &[section("s", 3)], seed);
            let mut first_two: Vec<&str> = s.ids[..2].iter().map(String::as_str).collect();
            first_two.sort();
            assert_eq!(first_two, ["e1", "e2"], "seed {seed}");
            assert!(s.ids[2].starts_with('r'), "seed {seed}");
            assert!(s.short.is_empty());
        }
    }

    #[test]
    fn too_few_exam_only_items_are_topped_up_from_regular() {
        let cands = vec![cand("e1", None, true), cand("r1", None, false), cand("r2", None, false), cand("r3", None, false)];
        for seed in 0..50u64 {
            let s = sample(&cands, &[section("s", 3)], seed);
            assert_eq!(s.ids.len(), 3, "seed {seed}");
            assert_eq!(s.ids[0], "e1", "seed {seed}");
            assert!(s.short.is_empty());
        }
        let s = sample(&cands, &[section("s", 6)], 1);
        assert_eq!(s.ids.len(), 4);
        assert_eq!(s.short, vec![Shortage { title: "s".to_string(), short_by: 2 }]);
    }

    #[test]
    fn all_exam_only_matches_unflagged_for_200_seeds() {
        let build = |flag: bool| {
            vec![
                cand("a", None, flag),
                cand("b", Some("s1"), flag),
                cand("c", Some("s1"), flag),
                cand("d", None, flag),
                cand("e", Some("s2"), flag),
                cand("f", Some("s2"), flag),
                cand("g", Some("s2"), flag),
                cand("h", None, flag),
            ]
        };
        let sections = [section("x", 4), section("y", 3)];
        for seed in 0..200u64 {
            assert_eq!(sample(&build(true), &sections, seed), sample(&build(false), &sections, seed), "seed {seed}");
        }
    }

    #[test]
    fn regular_stimulus_group_without_exam_only_keeps_input_order() {
        let cands = vec![cand("f0", None, false), cand("f1", Some("s2"), false), cand("f2", Some("s2"), false)];
        let s = sample(&cands, &[section("a", 3), section("b", 2)], 15);
        assert_eq!(s.ids, ["f0", "f1", "f2"]);
        assert_eq!(s.short.len(), 1);
        assert_eq!(s.short[0].title, "b");
        assert_eq!(s.short[0].short_by, 2);
    }

    #[test]
    fn stimulus_group_with_one_exam_only_member_is_drawn_whole_and_first() {
        let cands = vec![
            cand("r1", None, false),
            cand("g1", Some("g"), false),
            cand("g2", Some("g"), true),
            cand("r2", None, false),
        ];
        for seed in 0..50u64 {
            let s = sample(&cands, &[section("s", 3)], seed);
            assert_eq!(&s.ids[..2], ["g1", "g2"], "seed {seed}");
            assert_eq!(s.ids.len(), 3);
        }
    }

    #[test]
    fn later_section_skips_used_exam_only_items() {
        let cands = vec![cand("e1", None, true), cand("e2", None, true), cand("r1", None, false), cand("r2", None, false)];
        for seed in 0..50u64 {
            let s = sample(&cands, &[section("a", 2), section("b", 2)], seed);
            let mut a: Vec<&str> = s.ids[..2].iter().map(String::as_str).collect();
            a.sort();
            assert_eq!(a, ["e1", "e2"], "seed {seed}");
            let mut b: Vec<&str> = s.ids[2..].iter().map(String::as_str).collect();
            b.sort();
            assert_eq!(b, ["r1", "r2"], "seed {seed}");
        }
    }
}
