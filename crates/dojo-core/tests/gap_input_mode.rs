use dojo_core::content::{parse_items, Item};

fn line(extra: &str) -> String {
    let sep = if extra.is_empty() { "" } else { "," };
    format!(
        r#"{{"type":"gap","id":"g1","unit":"u1","prompt":"p","answers":["4"]{sep}{extra}}}"#
    )
}

type TestResult = Result<(), Box<dyn std::error::Error>>;

fn parse_gap(text: &str) -> Result<dojo_core::content::GapItem, Box<dyn std::error::Error>> {
    let p = parse_items(text);
    assert!(p.errors.is_empty(), "unexpected errors: {:?}", p.errors);
    match p.items.first().map(|(_, i)| i) {
        Some(Item::Gap(g)) => Ok(g.clone()),
        other => Err(format!("expected gap item, got {other:?}").into()),
    }
}

#[test]
fn input_mode_parses_each_value() -> TestResult {
    for (raw, want) in [
        ("numeric", dojo_core::content::InputMode::Numeric),
        ("decimal", dojo_core::content::InputMode::Decimal),
        ("text", dojo_core::content::InputMode::Text),
    ] {
        let g = parse_gap(&line(&format!(r#""inputMode":"{raw}""#)))?;
        assert_eq!(g.input_mode, Some(want), "value {raw}");
    }
    Ok(())
}

#[test]
fn unknown_input_mode_is_a_parse_error() {
    let p = parse_items(&line(r#""inputMode":"phone""#));
    assert!(p.items.is_empty());
    assert_eq!(p.errors.len(), 1);
}

#[test]
fn absent_input_mode_is_none_and_round_trips_without_key() -> TestResult {
    let raw = line("");
    let g = parse_gap(&raw)?;
    assert_eq!(g.input_mode, None);
    let out = serde_json::to_string(&Item::Gap(g))?;
    assert_eq!(out, raw);
    assert!(!out.contains("inputMode"));
    Ok(())
}

#[test]
fn present_input_mode_round_trips() -> TestResult {
    let raw = line(r#""inputMode":"numeric""#);
    let g = parse_gap(&raw)?;
    let out = serde_json::to_string(&Item::Gap(g))?;
    assert_eq!(out, raw);
    Ok(())
}
