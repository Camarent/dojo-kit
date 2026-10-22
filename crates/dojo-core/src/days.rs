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

fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

fn days_in_month(year: i64, month: i64) -> i64 {
    let days: [i64; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if month == 2 && is_leap_year(year) {
        29
    } else {
        days[month as usize - 1]
    }
}

/// Parse an ISO timestamp string and return milliseconds since Unix epoch.
/// Accepts `YYYY-MM-DD` and `YYYY-MM-DDTHH:MM:SS[.fff]Z`.
/// Returns `None` for invalid or out-of-range values.
pub fn parse_iso_ms(s: &str) -> Option<i64> {
    let s = s.trim();
    if !s.is_ascii() { return None; }
    if let Ok(n) = s.parse::<i64>() {
        return Some(n);
    }
    if s.ends_with('Z') && s.len() >= 20 {
        parse_datetime(&s[..s.len() - 1])
    } else if s.len() == 10 && s.chars().nth(4) == Some('-') && s.chars().nth(7) == Some('-') {
        parse_date(s)
    } else {
        None
    }
}

const MAX_YEAR: i64 = 9999;

fn parse_datetime(no_z: &str) -> Option<i64> {
    let parts: Vec<&str> = no_z.split('T').collect();
    if parts.len() != 2 { return None; }
    let date_parts: Vec<&str> = parts[0].split('-').collect();
    if date_parts.len() != 3 { return None; }
    let year: i64 = date_parts[0].parse().ok()?;
    let month: i64 = date_parts[1].parse().ok()?;
    let day: i64 = date_parts[2].parse().ok()?;
    let time_parts: Vec<&str> = parts[1].split(':').collect();
    if time_parts.len() != 3 { return None; }
    let hour: i64 = time_parts[0].parse().ok()?;
    let minute: i64 = time_parts[1].parse().ok()?;
    let sec_part = time_parts[2];
    let (second, millis): (i64, i64) = if let Some(idx) = sec_part.find('.') {
        let sec: i64 = sec_part[..idx].parse().ok()?;
        let frac_str = &sec_part[idx + 1..sec_part.len().min(idx + 4)];
        let m: i64 = frac_str.parse().unwrap_or(0);
        let m = match frac_str.len() { 1 => m * 100, 2 => m * 10, _ => m };
        (sec, m)
    } else {
        let sec: i64 = sec_part.parse().ok()?;
        (sec, 0)
    };
    if !(1970..=MAX_YEAR).contains(&year) || month < 1 || month > 12 || day < 1 || day > days_in_month(year, month) {
        return None;
    }
    if hour > 23 || minute > 59 || second > 59 { return None; }
    let days = days_from_civil(year, month, day);
    Some(days * 86400000 + hour * 3600000 + minute * 60000 + second * 1000 + millis)
}

fn parse_date(s: &str) -> Option<i64> {
    let date_parts: Vec<&str> = s.split('-').collect();
    if date_parts.len() != 3 { return None; }
    let year: i64 = date_parts[0].parse().ok()?;
    let month: i64 = date_parts[1].parse().ok()?;
    let day: i64 = date_parts[2].parse().ok()?;
    if !(1970..=MAX_YEAR).contains(&year) || month < 1 || month > 12 || day < 1 || day > days_in_month(year, month) {
        return None;
    }
    Some(days_from_civil(year, month, day) * MS_PER_DAY)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_iso_ms_date_only() {
        assert_eq!(parse_iso_ms("1970-01-01"), Some(0));
        assert_eq!(parse_iso_ms("2024-02-29"), Some(1709164800000));
    }

    #[test]
    fn test_parse_iso_ms_datetime() {
        assert_eq!(
            parse_iso_ms("2025-12-31T23:59:59Z"),
            Some(1767225599000)
        );
        assert_eq!(
            parse_iso_ms("2026-01-15T10:20:30.5Z"),
            Some(1768472430500)
        );
    }

    #[test]
    fn parse_iso_ms_year_cap() {
        assert_eq!(parse_iso_ms("10000-01-01"), None);
        assert_eq!(parse_iso_ms("10000-01-01T00:00:00Z"), None);
        assert_eq!(parse_iso_ms("300000000-01-01T00:00:00Z"), None);
        assert_eq!(parse_iso_ms("9999-12-31"), Some(253402214400000));
        assert_eq!(parse_iso_ms("9999-12-31T23:59:59Z"), Some(253402300799000));
    }

    #[test]
    fn test_parse_iso_ms_accepts_valid_leap_day() {
        assert!(parse_iso_ms("2024-02-29").is_some());
    }

    #[test]
    fn test_parse_iso_ms_rejects_invalid() {
        assert_eq!(parse_iso_ms("2026-01-00"), None);
        assert_eq!(parse_iso_ms("2026-00-10"), None);
        assert_eq!(parse_iso_ms("2026-13-01"), None);
        assert_eq!(parse_iso_ms("2025-02-29"), None);
        assert_eq!(parse_iso_ms("1969-12-31"), None);
        assert_eq!(parse_iso_ms("2026-01-15T24:00:00Z"), None);
    }

    #[test]
    fn test_parse_iso_ms_rejects_non_ascii_without_panic() {
        assert_eq!(parse_iso_ms("2026-01-15T10:20:30.éé0Z"), None);
    }

    #[test]
    fn test_parse_iso_ms_numeric() {
        assert_eq!(parse_iso_ms("12345"), Some(12345));
    }
}
