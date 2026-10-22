use dojo_core::content::parse_intros;
use dojo_core::validate::{Diagnostic, SourceFile, validate_all};

const COURSE: &str = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;
const ITEMS: &str = concat!(
    r#"{"id":"k-1","type":"gap","unit":"u","prompt":"a ___","answers":["b"],"entity":"e-1"}"#, "\n",
    r#"{"id":"k-2","type":"gap","unit":"u","prompt":"c ___","answers":["d"],"entity":"e-1"}"#, "\n",
    r#"{"id":"k-3","type":"gap","unit":"u","prompt":"e ___","answers":["f"]}"#, "\n",
);

fn file(name: &str, text: &str) -> SourceFile {
    SourceFile { name: name.to_string(), text: text.to_string() }
}

fn run(intros: &str) -> Vec<Diagnostic> {
    validate_all(COURSE, &[file("content/u.jsonl", ITEMS)], None, None, Some(&file("intros.jsonl", intros)))
}

fn has(d: &[Diagnostic], code: &str) -> bool {
    d.iter().any(|d| d.code == code)
}

#[test]
fn parses_all_fields() {
    let p = parse_intros(r#"{"id":"e-1","title":"T","text":"x","meta":{"a":[1]},"speak":"s"}"#);
    assert!(p.errors.is_empty());
    let i = &p.stimuli[0].1;
    assert_eq!((i.title.as_deref(), i.speak.as_deref()), (Some("T"), Some("s")));
    assert_eq!(i.meta.as_ref().unwrap()["a"][0], 1);
}

#[test]
fn entity_and_default_item_id_match() {
    let d = run("{\"id\":\"e-1\",\"text\":\"x\"}\n{\"id\":\"k-3\",\"text\":\"y\"}\n");
    assert!(!has(&d, "intro_unknown_entity") && !has(&d, "duplicate_intro") && !has(&d, "bad_intro"), "{d:?}");
}

#[test]
fn unknown_entity_warns_and_item_id_of_entity_item_does_not_match() {
    let d = run("{\"id\":\"zz-9\",\"text\":\"x\"}\n{\"id\":\"k-1\",\"text\":\"y\"}\n");
    assert_eq!(d.iter().filter(|d| d.code == "intro_unknown_entity").count(), 2, "{d:?}");
}

#[test]
fn duplicate_empty_and_unknown_fields_are_reported() {
    let d = run("{\"id\":\"e-1\",\"text\":\"x\"}\n{\"id\":\"e-1\",\"text\":\"y\"}\n");
    assert!(has(&d, "duplicate_intro"), "{d:?}");
    assert!(has(&run("{\"id\":\"e-1\"}\n"), "bad_intro"));
    assert!(has(&run("{\"id\":\"e-1\",\"text\":\"x\",\"nope\":1}\n"), "parse_error"));
}
