//! Russian trigger and disambiguation words, supplied by the `ru` module.
use dojo_core::validate::{Diagnostic, SourceFile, ValidatorModule, validate_with_modules};
use dojo_module_ru::Ru;

const COURSE: &str = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;

fn run_ru(lines: &[&str]) -> Vec<Diagnostic> {
    let modules: Vec<Box<dyn ValidatorModule>> = vec![Box::new(Ru)];
    let files = [SourceFile { name: "content/u.jsonl".to_string(), text: lines.join("\n") }];
    validate_with_modules(COURSE, &files, None, None, None, &modules)
}

#[test]
fn prompt_type_mismatch_na_pisite_on_choice() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"напишите ответ","options":["A","B"],"answer":0}"#;
    let d = run_ru(&[l]);
    assert!(d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn prompt_type_mismatch_na_pisite_not_warned_without_module() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"напишите ответ","options":["A","B"],"answer":0}"#;
    let d = dojo_core::validate::validate(COURSE, &[SourceFile { name: "content/u.jsonl".to_string(), text: l.to_string() }], None);
    assert!(!d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn prompt_type_mismatch_vyberite_on_gap() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"выберите ответ","answers":["A"]}"#;
    let d = run_ru(&[l]);
    assert!(d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn ambiguous_answer_gap_multiple_without_hint_warns() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Как читается 一?","answers":["いち","ひと"]}"#;
    let d = run_ru(&[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_gap_multiple_with_lyuboy_hint() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Назовите любой вариант: 一?","answers":["いち","ひと"]}"#;
    let d = run_ru(&[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_gap_multiple_with_ili_hint() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Как читается 一 или нет?","answers":["いち","ひと"]}"#;
    let d = run_ru(&[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}
