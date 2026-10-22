use crate::progress::truthy;
use serde_json::Value;

const MS_PER_MINUTE: i64 = 60_000;
const MS_PER_DAY: i64 = 86_400_000;
const DAYS_FROM_0000_TO_1970: i64 = 719_468;
const DAYS_PER_ERA: i64 = 146_097;

fn civil_from_days(days_since_epoch: i64) -> (i64, i64, i64) {
    let z = days_since_epoch.saturating_add(DAYS_FROM_0000_TO_1970);
    let era = z.div_euclid(DAYS_PER_ERA);
    let doe = z.rem_euclid(DAYS_PER_ERA);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = era * 400 + yoe + i64::from(month <= 2);
    (year, month, day)
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = year - i64::from(month <= 2);
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * DAYS_PER_ERA + doe - DAYS_FROM_0000_TO_1970
}

fn format_key(days_since_epoch: i64) -> String {
    let (y, m, d) = civil_from_days(days_since_epoch);
    format!("{y:04}-{m:02}-{d:02}")
}

/// Calendar date "YYYY-MM-DD" of `ms` shifted by `tz_offset_min` minutes.
pub fn day_key(ms: i64, tz_offset_min: i32) -> String {
    let shifted = ms.saturating_add(i64::from(tz_offset_min) * MS_PER_MINUTE);
    format_key(shifted.div_euclid(MS_PER_DAY))
}

/// Day number of a well-formed "YYYY-MM-DD" key; `None` for anything else or a non-existent date.
fn parse_key(key: &str) -> Option<i64> {
    let b = key.as_bytes();
    let well_formed = b.len() == 10
        && b.iter().enumerate().all(|(i, c)| if i == 4 || i == 7 { *c == b'-' } else { c.is_ascii_digit() });
    if !well_formed {
        return None;
    }
    let year: i64 = key[..4].parse().ok()?;
    let month: i64 = key[5..7].parse().ok()?;
    let day: i64 = key[8..].parse().ok()?;
    let n = days_from_civil(year, month, day);
    (format_key(n) == key).then_some(n)
}

/// Consecutive study days ending `today_key` (or the day before, when today has no study yet).
/// `days` is `{ "YYYY-MM-DD": count }`; a day counts when its value is truthy.
pub fn streak(days: &Value, today_key: &str) -> u32 {
    let (Some(days), Some(today)) = (days.as_object(), parse_key(today_key)) else { return 0 };
    let studied = |n: i64| days.get(&format_key(n)).is_some_and(truthy);
    let mut day = if studied(today) { today } else { today - 1 };
    let mut count = 0;
    while studied(day) {
        count += 1;
        day -= 1;
    }
    count
}
