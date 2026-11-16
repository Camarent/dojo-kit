//! Session settings resolution, answer-time stats and plan numbers (plan-notes D2).
use dojo_core::content::{SessionMode, SessionSettings};
use dojo_core::session::config::{resolve, SessionConfig, DEFAULT_SEC_PER_ANSWER, DEFAULT_SESSION_MIX};
use dojo_core::session::plan::{capacity, ms_per_answer, new_today, numbers, warn_minutes};
use dojo_core::stats::{median_answer_ms, push_answer_ms, ANSWER_MS_KEEP};
use serde_json::{json, Value};
use std::collections::BTreeMap;

fn auto_cfg() -> SessionConfig {
    SessionConfig::default()
}

fn manual_cfg(cap: u32) -> SessionConfig {
    SessionConfig { session_mode: SessionMode::Manual, session_cap: cap, ..SessionConfig::default() }
}

#[test]
fn defaults_are_named_constants() {
    let cfg = auto_cfg();
    assert_eq!(cfg.session_mix, DEFAULT_SESSION_MIX.to_vec());
    assert_eq!(cfg.session_mode, SessionMode::Auto);
    assert_eq!(cfg.sec_per_answer, DEFAULT_SEC_PER_ANSWER);
    assert_eq!(cfg.daily_minutes, 30);
    assert_eq!(cfg.session_max, 60);
    assert_eq!(cfg.review_days, 3);
}

#[test]
fn auto_capacity_examples() {
    // 30 min / 20 s = 90, clamped to sessionMax 60.
    assert_eq!(capacity(&auto_cfg(), &[]), Some(60));
    // 1 s answers: 1800 raw, clamped to sessionMax 60.
    assert_eq!(capacity(&auto_cfg(), &[1_000, 1_000, 1_000]), Some(60));
    // 0 minutes: raw 0, clamped up to 1.
    let zero = SessionConfig { daily_minutes: 0, ..auto_cfg() };
    assert_eq!(capacity(&zero, &[]), Some(1));
    // 20 s answers under a larger max: 90 unclamped.
    let big = SessionConfig { session_max: 200, ..auto_cfg() };
    assert_eq!(capacity(&big, &[]), Some(90));
}

#[test]
fn manual_cap_zero_is_unlimited() {
    assert_eq!(capacity(&manual_cfg(0), &[]), None);
    assert_eq!(capacity(&manual_cfg(5), &[]), Some(5));
}

#[test]
fn exam_passed_gives_no_new_units_and_no_divide_by_zero() {
    let n = numbers(&auto_cfg(), &[], 2, 3, 10, 0, -4);
    assert_eq!(n.new, 0);
    assert_eq!(n.days_left, -4);
    assert_eq!(n.total, 5);
    assert_eq!(new_today(10, 0, 0), 0);
    assert_eq!(new_today(10, -1, 0), 0);
}

#[test]
fn new_today_spreads_units_and_subtracts_introduced() {
    // 10 units over 3 days: ceil(10/3) = 4.
    assert_eq!(new_today(10, 3, 0), 4);
    assert_eq!(new_today(10, 3, 1), 3);
    assert_eq!(new_today(10, 3, 9), 0);
}

#[test]
fn warn_minutes_zero_under_capacity_and_ceil_over() {
    assert_eq!(warn_minutes(3, 20_000, Some(3)), 0);
    assert_eq!(warn_minutes(100, 20_000, None), 0);
    // 1 minute budget = capacity 3; 10 questions * 20 s = 200 s -> ceil(3.33) = 4 minutes.
    let small = SessionConfig { daily_minutes: 1, ..auto_cfg() };
    let n = numbers(&small, &[], 10, 0, 0, 0, 100);
    assert_eq!(n.capacity, Some(3));
    assert_eq!(n.warn_minutes, 4);
}

#[test]
fn median_even_odd_and_empty() {
    assert_eq!(median_answer_ms(&[3, 1, 2]), Some(2));
    assert_eq!(median_answer_ms(&[40, 10, 30, 20]), Some(25));
    assert_eq!(median_answer_ms(&[]), None);
}

#[test]
fn empty_stats_uses_setting() {
    assert_eq!(ms_per_answer(&auto_cfg(), &[]), 20_000);
    let custom = SessionConfig { sec_per_answer: 5, ..auto_cfg() };
    assert_eq!(ms_per_answer(&custom, &[]), 5_000);
}

#[test]
fn push_answer_ms_keeps_last_hundred() {
    let mut durations = Vec::new();
    for ms in 0..150u64 {
        push_answer_ms(&mut durations, ms);
    }
    assert_eq!(durations.len(), ANSWER_MS_KEEP);
    assert_eq!(durations.first().copied(), Some(50));
    assert_eq!(durations.last().copied(), Some(149));
}

#[test]
fn resolve_applies_course_block_then_overrides() {
    let settings: SessionSettings = serde_json::from_value(json!({"dailyMinutes": 10, "sessionMode": "manual"})).unwrap_or_else(|e| panic!("{e}"));
    let mut overrides = BTreeMap::new();
    overrides.insert("session:dailyMinutes".to_string(), json!(45));
    overrides.insert("unrelated".to_string(), json!(1));
    let cfg = resolve(Some(&settings), &overrides).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(cfg.daily_minutes, 45);
    assert_eq!(cfg.session_mode, SessionMode::Manual);
    assert_eq!(cfg.session_max, 60);
}

#[test]
fn resolve_rejects_unknown_override_name() {
    let mut overrides = BTreeMap::new();
    overrides.insert("session:bogus".to_string(), Value::from(1));
    assert!(resolve(None, &overrides).is_err());
}
