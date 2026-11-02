use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use super::sample::SectionRange;
use crate::content::{PassMode, ScoringPart};

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
#[path = "tests_score.rs"]
mod tests;
