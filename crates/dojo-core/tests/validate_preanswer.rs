use dojo_core::validate::{Diagnostic, SourceFile, validate_all};

const COURSE: &str = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;
const ITEMS: &str = concat!(
    r#"{"id":"k-1","type":"gap","unit":"u","prompt":"Capital of Italy: ___","answers":["Rome"],"entity":"e-1"}"#, "\n",
    r#"{"id":"k-2","type":"choice","unit":"u","prompt":"Capital of France?","options":["Paris","Lyon"],"answer":0,"entity":"e-2"}"#, "\n",
);

fn file(name: &str, text: &str) -> SourceFile {
    SourceFile { name: name.to_string(), text: text.to_string() }
}

fn leaks(intros: &str) -> bool {
    let d: Vec<Diagnostic> = validate_all(COURSE, &[file("content/u.jsonl", ITEMS)], None, None, Some(&file("intros.jsonl", intros)));
    d.iter().any(|d| d.code == "preanswer_leaks_answer")
}

fn leaks_in(course: &str, intros: &str) -> bool {
    let d: Vec<Diagnostic> = validate_all(course, &[file("content/u.jsonl", ITEMS)], None, None, Some(&file("intros.jsonl", intros)));
    d.iter().any(|d| d.code == "preanswer_leaks_answer")
}

#[test]
fn exempt_kinds_custom_list_replaces_default() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"validate":{"preanswerExemptKinds":["grammar"]}}"#;
    // Listed kind is exempt.
    assert!(!leaks_in(course, r#"{"id":"e-1","title":"Italy","text":"Its capital is Rome.","meta":{"kind":"grammar"}}"#));
    // Former default kinds are no longer exempt once the list is set.
    assert!(leaks_in(course, r#"{"id":"e-1","title":"Italy","text":"Its capital is Rome.","meta":{"kind":"kanji"}}"#));
    assert!(leaks_in(course, r#"{"id":"e-1","title":"Italy","text":"Its capital is Rome.","meta":{"kind":"word"}}"#));
}

#[test]
fn exempt_kinds_empty_list_exempts_nothing() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"validate":{"preanswerExemptKinds":[]}}"#;
    assert!(leaks_in(course, r#"{"id":"e-1","title":"Italy","text":"Its capital is Rome.","meta":{"kind":"kanji"}}"#));
    assert!(leaks_in(course, r#"{"id":"e-1","title":"Italy","text":"Its capital is Rome.","meta":{"kind":"word"}}"#));
}

#[test]
fn intro_text_with_answer_flagged() {
    assert!(leaks(r#"{"id":"e-1","title":"Italy","text":"Its capital is Rome."}"#));
    assert!(leaks(r#"{"id":"e-2","title":"Paris","text":"A city."}"#));
    assert!(leaks(r#"{"id":"e-1","title":"Italy","text":"A country. Its capital is Rome."}"#));
}

#[test]
fn kanji_and_word_intros_exempt() {
    assert!(!leaks(r#"{"id":"e-1","title":"Italy","text":"Its capital is Rome.","meta":{"kind":"kanji"}}"#));
    assert!(!leaks(r#"{"id":"e-1","title":"Italy","text":"Its capital is Rome.","meta":{"kind":"word"}}"#));
    assert!(leaks(r#"{"id":"e-1","title":"Italy","text":"Its capital is Rome.","meta":{"kind":"grammar"}}"#));
}

#[test]
fn intro_leak_flagged_for_any_entity_kind() {
    // Items of a non-grammar, non-exam entity (vocabulary ids): the check applies to every entity.
    const VOCAB: &str = concat!(
        r#"{"id":"vocab-1","type":"gap","unit":"u","prompt":"Fruit: ___","answers":["apple"],"entity":"v-1"}"#, "\n",
    );
    let d: Vec<Diagnostic> = validate_all(COURSE, &[file("content/v.jsonl", VOCAB)], None, None, Some(&file("intros.jsonl", r#"{"id":"v-1","title":"Fruit","text":"An apple is red."}"#)));
    assert!(d.iter().any(|d| d.code == "preanswer_leaks_answer"));
}

#[test]
fn intro_without_answer_not_flagged() {
    assert!(!leaks(r#"{"id":"e-1","title":"Italy","text":"A country in Europe."}"#));
    // Answer of another entity does not count.
    assert!(!leaks(r#"{"id":"e-2","title":"France","text":"Rome is elsewhere."}"#));
}
