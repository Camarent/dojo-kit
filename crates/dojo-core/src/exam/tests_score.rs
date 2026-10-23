use super::*;
use crate::exam::DEFAULT_PASS_MARK;

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
