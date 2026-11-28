use dojo_core::days::{format_iso_ms, parse_iso_ms};

#[test]
fn format_epoch_zero() {
    assert_eq!(format_iso_ms(0), "1970-01-01T00:00:00.000Z");
}

#[test]
fn format_known_leap_day() {
    assert_eq!(format_iso_ms(1709164800000), "2024-02-29T00:00:00.000Z");
}

#[test]
fn format_keeps_millis_and_time_of_day() {
    assert_eq!(format_iso_ms(1768472430500), "2026-01-15T10:20:30.500Z");
    assert_eq!(format_iso_ms(1767225599000), "2025-12-31T23:59:59.000Z");
}

#[test]
fn format_negative_ms_floors_to_previous_instant() {
    assert_eq!(format_iso_ms(-1), "1969-12-31T23:59:59.999Z");
    assert_eq!(format_iso_ms(-86_400_000), "1969-12-31T00:00:00.000Z");
}

#[test]
fn round_trip_parse_format() {
    for ms in [0, 1709164800000, 1767225599000, 1768472430500, 253402300799000] {
        assert_eq!(parse_iso_ms(&format_iso_ms(ms)), Some(ms), "ms={ms}");
    }
}
