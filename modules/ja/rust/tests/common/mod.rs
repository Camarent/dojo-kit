//! Shared fixtures for the ja module tests. Courses run with the `ja` module active.
#![allow(dead_code)]
use dojo_core::validate::{Diagnostic, SourceFile, ValidatorModule, validate_with_modules};
use dojo_module_ja::Ja;

pub const COURSE: &str = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;

pub fn file(name: &str, text: &str) -> SourceFile {
    SourceFile { name: name.to_string(), text: text.to_string() }
}

pub fn run(course: &str, lines: &[&str]) -> Vec<Diagnostic> {
    let modules: Vec<Box<dyn ValidatorModule>> = vec![Box::new(Ja)];
    validate_with_modules(course, &[file("content/u.jsonl", &lines.join("\n"))], None, None, None, &modules)
}

pub fn codes(d: &[Diagnostic]) -> Vec<&'static str> {
    d.iter().map(|d| d.code).collect()
}

pub fn fires(course: &str, lines: &[&str], code: &str) {
    let d = run(course, lines);
    assert!(d.iter().any(|d| d.code == code), "{code} not in {d:?}");
}

pub const CHOICE: &str = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["a","b"],"answer":0}"#;

pub fn with_course(extra: &str) -> String {
    format!(r#"{{"id":"c","title":"C","uiLanguage":"en","units":[{{"id":"u","title":"U"}}],{extra}}}"#)
}
