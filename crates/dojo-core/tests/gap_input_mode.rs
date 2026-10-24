use dojo_core::content::{parse_items, Item};

fn line(extra: &str) -> String {
    let sep = if extra.is_empty() { "" } else { "," };
    format!(
        r#"{{"type":"gap","id":"g1","unit":"u1","prompt":"p","answers":["4"]{sep}{extra}}}"#
    )
}

fn parse_gap(text: &str) -> dojo_core::content::GapItem {
    let p = parse_items(text);
    assert!(p.errors.is_empty(), "unexpected errors: {:?}", p.errors);
    match &p.items[0].1 {
        Item::Gap(g) => g.clone(),
        other => panic!("expected gap item, got {other:?}"),
    }
}

#[test]
fn input_mode_parses_each_value() {
    for (raw, want) in [
        ("numeric", dojo_core::content::InputMode::Numeric),
        ("decimal", dojo_core::content::InputMode::Decimal),
        ("text", dojo_core::content::InputMode::Text),
    ] {
        let g = parse_gap(&line(&format!(r#""inputMode":"{raw}""#)));
        assert_eq!(g.input_mode, Some(want), "value {raw}");
    }
}

#[test]
fn unknown_input_mode_is_a_parse_error() {
    let p = parse_items(&line(r#""inputMode":"phone""#));
    assert!(p.items.is_empty());
    assert_eq!(p.errors.len(), 1);
}

#[test]
fn absent_input_mode_is_none_and_round_trips_without_key() {
    let raw = line("");
    let g = parse_gap(&raw);
    assert_eq!(g.input_mode, None);
    let out = serde_json::to_string(&Item::Gap(g)).unwrap();
    assert_eq!(out, raw);
    assert!(!out.contains("inputMode"));
}

#[test]
fn present_input_mode_round_trips() {
    let raw = line(r#""inputMode":"numeric""#);
    let g = parse_gap(&raw);
    let out = serde_json::to_string(&Item::Gap(g)).unwrap();
    assert_eq!(out, raw);
}
