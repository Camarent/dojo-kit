mod common;
use common::*;
use dojo_core::content::{Course, Item, ItemType};
use dojo_core::validate::{CODES, Diagnostic, ItemChecker, Severity, ValidatorModule, all_codes, validate_with_modules};

/// Fires one code through every hook: checker, fragment table, prompt trigger, disambiguation word.
struct Fake;

const FAKE_CODES: &[(&str, Severity, &str)] = &[("fake_checker", Severity::Warning, "fake module checker finding")];

fn is_ing(text: &str) -> bool {
    text == "ing"
}

impl ValidatorModule for Fake {
    fn id(&self) -> &'static str {
        "fake"
    }

    fn codes(&self) -> &'static [(&'static str, Severity, &'static str)] {
        FAKE_CODES
    }

    fn fragment_check(&self, language: &str) -> Option<fn(&str) -> bool> {
        (language == "xx").then_some(is_ing as fn(&str) -> bool)
    }

    fn prompt_triggers(&self) -> &'static [(&'static str, &'static [ItemType])] {
        &[("zap", &[ItemType::Choice])]
    }

    fn disambiguation_words(&self) -> &'static [&'static str] {
        &["cat"]
    }

    fn course_checker(&self, _course: &Course, _items: &[&Item]) -> Option<Box<dyn ItemChecker>> {
        Some(Box::new(FakeChecker))
    }
}

struct FakeChecker;

impl ItemChecker for FakeChecker {
    fn check(&self, item: &Item, _course: Option<&Course>, file: &str, line: usize) -> Vec<Diagnostic> {
        vec![Diagnostic { severity: Severity::Warning, code: "fake_checker", file: file.to_string(), line, message: format!("checked {}", item.id()) }]
    }
}

fn fake_modules() -> Vec<Box<dyn ValidatorModule>> {
    vec![Box::new(Fake)]
}

const ZAP: &str = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Zap the answer","options":["a","b"],"answer":0}"#;
const ORDER: &str = r#"{"type":"order","id":"u-2","unit":"u","prompt":"Order","steps":["a","ing"]}"#;
const CAT: &str = r#"{"type":"gap","id":"u-3","unit":"u","prompt":"Word for cat","answers":["кот","кошка"]}"#;

fn run_with(modules: &[Box<dyn ValidatorModule>]) -> Vec<Diagnostic> {
    let course = with_course(r#""contentLanguage":"xx""#);
    let files = [file("content/u.jsonl", &[ZAP, ORDER, CAT].join("\n"))];
    validate_with_modules(&course, &files, None, None, None, modules)
}

#[test]
fn module_hooks_fire_only_when_module_is_passed() {
    let with = codes(&run_with(&fake_modules()));
    assert!(with.contains(&"fake_checker"), "{with:?}");
    assert!(with.contains(&"order_split_word"), "{with:?}");
    assert!(with.contains(&"prompt_type_mismatch"), "{with:?}");
    assert!(!with.contains(&"ambiguous_answer"), "disambiguation word should suppress it: {with:?}");

    let without = codes(&run_with(&[]));
    assert!(!without.contains(&"fake_checker"), "{without:?}");
    assert!(!without.contains(&"order_split_word"), "{without:?}");
    assert!(!without.contains(&"prompt_type_mismatch"), "{without:?}");
    assert!(without.contains(&"ambiguous_answer"), "{without:?}");
}

#[test]
fn empty_module_list_matches_validate() {
    let course = with_course(r#""contentLanguage":"xx""#);
    let files = [file("content/u.jsonl", &[ZAP, ORDER, CAT].join("\n"))];
    assert_eq!(validate_with_modules(&course, &files, None, None, None, &[]), dojo_core::validate::validate(&course, &files, None));
}

#[test]
fn all_codes_merges_module_codes() {
    let all = all_codes(&fake_modules());
    assert_eq!(all.len(), CODES.len() + FAKE_CODES.len());
    assert_eq!(&all[..CODES.len()], &CODES[..]);
    assert_eq!(all.last().map(|c| c.0), Some("fake_checker"));
    let mut names: Vec<&str> = all.iter().map(|c| c.0).collect();
    names.sort_unstable();
    names.dedup();
    assert_eq!(names.len(), all.len(), "duplicate code in all_codes");
    assert_eq!(all_codes(&[]).len(), CODES.len());
}
