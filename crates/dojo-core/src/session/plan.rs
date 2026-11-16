//! Pure plan numbers for the session header: capacity, new units per day, warning minutes.
use super::config::SessionConfig;
use crate::content::SessionMode;
use crate::stats::median_answer_ms;
use serde::Serialize;

const MS_PER_SECOND: u64 = 1_000;
const SECONDS_PER_MINUTE: u64 = 60;
const MS_PER_MINUTE: u64 = SECONDS_PER_MINUTE * MS_PER_SECOND;

/// Numbers shown on the plan block. `capacity` None = unlimited (manual `sessionCap` 0).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanNumbers {
    pub weak: usize,
    pub new: usize,
    pub due: usize,
    pub total: usize,
    pub capacity: Option<u32>,
    pub days_left: i64,
    pub units_left: usize,
    pub warn_minutes: u64,
}

/// Milliseconds per answer: median of `answer_ms` when recorded, else `secPerAnswer` from the setting.
pub fn ms_per_answer(cfg: &SessionConfig, answer_ms: &[u64]) -> u64 {
    median_answer_ms(answer_ms)
        .unwrap_or(u64::from(cfg.sec_per_answer) * MS_PER_SECOND)
        .max(1)
}

/// Questions per session. Manual: `sessionCap` (0 = None). Auto: `dailyMinutes` over the answer time,
/// clamped to 1..=`sessionMax`.
pub fn capacity(cfg: &SessionConfig, answer_ms: &[u64]) -> Option<u32> {
    match cfg.session_mode {
        SessionMode::Manual => (cfg.session_cap > 0).then_some(cfg.session_cap),
        SessionMode::Auto => {
            let budget_ms = u64::from(cfg.daily_minutes) * MS_PER_MINUTE;
            let raw = budget_ms / ms_per_answer(cfg, answer_ms);
            let clamped = raw.clamp(1, u64::from(cfg.session_max).max(1));
            Some(u32::try_from(clamped).unwrap_or(u32::MAX))
        }
    }
}

/// Days of new units left before the review window: days to exam minus `reviewDays`, never below 0.
pub fn days_for_new(days_left: i64, review_days: u32) -> i64 {
    (days_left - i64::from(review_days)).max(0)
}

/// New units to introduce today: 0 when no days remain for new units, else the never-introduced units
/// spread over those days, minus the ones already introduced today (never below 0).
pub fn new_today(never_introduced: usize, days_for_new: i64, introduced_today: usize) -> usize {
    let Ok(days) = u64::try_from(days_for_new) else { return 0 };
    if days == 0 {
        return 0;
    }
    let per_day = u64::try_from(never_introduced).unwrap_or(u64::MAX).div_ceil(days);
    usize::try_from(per_day).unwrap_or(usize::MAX).saturating_sub(introduced_today)
}

/// Minutes to warn about when `total` questions exceed `capacity`, else 0.
pub fn warn_minutes(total: usize, ms_per_answer: u64, capacity: Option<u32>) -> u64 {
    let over = capacity.is_some_and(|cap| u64::try_from(total).unwrap_or(u64::MAX) > u64::from(cap));
    if !over {
        return 0;
    }
    u64::try_from(total).unwrap_or(u64::MAX).saturating_mul(ms_per_answer).div_ceil(MS_PER_MINUTE)
}

/// Plan numbers from the caller's counts: `weak` and `due` are existing questions, `never_introduced`
/// the units never answered, `introduced_today` the new units already started today.
pub fn numbers(
    cfg: &SessionConfig,
    answer_ms: &[u64],
    weak: usize,
    due: usize,
    never_introduced: usize,
    introduced_today: usize,
    days_left: i64,
) -> PlanNumbers {
    let days = days_for_new(days_left, cfg.review_days);
    let new = new_today(never_introduced, days, introduced_today);
    let total = weak + new + due;
    let capacity = capacity(cfg, answer_ms);
    let warn_minutes = warn_minutes(total, ms_per_answer(cfg, answer_ms), capacity);
    PlanNumbers { weak, new, due, total, capacity, days_left, units_left: never_introduced, warn_minutes }
}
