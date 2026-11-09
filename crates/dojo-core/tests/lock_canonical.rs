use dojo_core::diagnostic::Severity;
use dojo_core::lock::canonical_diagnostic;

const CANONICAL: &str = "{\n  \"v\": 1,\n  \"ids\": [\n    \"u-1\",\n    \"u-2\"\n  ],\n  \"retired\": [\n    \"r-1\",\n    \"r-2\"\n  ]\n}\n";

#[test]
fn canonical_text_has_no_diagnostic() {
    assert_eq!(canonical_diagnostic(CANONICAL), None);
}

#[test]
fn unparseable_text_is_left_to_the_bad_lock_error() {
    assert_eq!(canonical_diagnostic("not json"), None);
}

#[test]
fn non_canonical_texts_warn() {
    let decoys = [
        // ids out of order
        CANONICAL.replace("\"u-1\",\n    \"u-2\"", "\"u-2\",\n    \"u-1\""),
        // duplicate id
        CANONICAL.replace("\"u-2\"", "\"u-1\""),
        // retired out of order
        CANONICAL.replace("\"r-1\",\n    \"r-2\"", "\"r-2\",\n    \"r-1\""),
        // missing trailing newline
        CANONICAL.trim_end().to_string(),
    ];
    for text in &decoys {
        let d = canonical_diagnostic(text).unwrap_or_else(|| panic!("no diagnostic for {text:?}"));
        assert_eq!((d.code, d.severity, d.file.as_str(), d.line), ("ids_lock_not_canonical", Severity::Warning, "ids.lock", 0));
        assert!(d.message.contains("dojo lock"), "{}", d.message);
    }
}
