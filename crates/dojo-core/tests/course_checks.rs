use dojo_core::validate::{CODES, Severity, parse_findings};
mod common;
use common::*;

fn with_checks(checks: &str) -> String {
    with_course(&format!(r#""checks":[{checks}]"#))
}

#[test]
fn course_checks_relative_script_is_accepted() {
    let d = run(&with_checks(r#"{"id":"alpha","script":"checks/alpha.sh"}"#), &[CHOICE]);
    assert_eq!(d, vec![]);
}

#[test]
fn course_checks_unsafe_script_path_is_rejected() {
    for script in ["/etc/alpha.sh", "\\\\alpha.sh", "C:/alpha.sh", "../alpha.sh", "checks/../../alpha.sh", ""] {
        let d = run(&with_checks(&format!(r#"{{"id":"alpha","script":"{script}"}}"#)), &[CHOICE]);
        assert_eq!(codes(&d), vec!["bad_plugin_path"], "script {script:?}");
    }
}

#[test]
fn course_checks_unknown_field_is_parse_error() {
    let d = run(&with_checks(r#"{"id":"alpha","script":"a.sh","extra":1}"#), &[CHOICE]);
    assert_eq!(codes(&d), vec!["parse_error"]);
}

#[test]
fn course_checks_finding_line_maps_to_check_failed() {
    let d = parse_findings(r#"{"code":"alpha-1","severity":"error","item":"beta-7","message":"wrong gap"}"#);
    assert_eq!(d.len(), 1);
    assert_eq!((d[0].code, d[0].severity), ("check_failed", Severity::Error));
    assert_eq!(d[0].message, "alpha-1 [beta-7]: wrong gap");
}

#[test]
fn course_checks_warning_severity_maps_to_warning() {
    let d = parse_findings(r#"{"code":"alpha-2","severity":"warning","item":"beta-8","message":"long"}"#);
    assert_eq!((d[0].code, d[0].severity), ("check_failed", Severity::Warning));
}

#[test]
fn course_checks_bad_line_is_bad_output_with_line_number() {
    let stdout = "{\"code\":\"alpha-1\",\"severity\":\"error\",\"item\":\"beta-7\",\"message\":\"m\"}\nnot json\n";
    let d = parse_findings(stdout);
    assert_eq!(d.len(), 2);
    assert_eq!((d[1].code, d[1].severity, d[1].line), ("check_bad_output", Severity::Error, 2));
}

#[test]
fn course_checks_unknown_severity_is_bad_output() {
    let d = parse_findings(r#"{"code":"alpha-3","severity":"info","item":"beta-9","message":"m"}"#);
    assert_eq!((d[0].code, d[0].severity), ("check_bad_output", Severity::Error));
}

#[test]
fn course_checks_blank_lines_are_skipped() {
    assert_eq!(parse_findings("\n  \n\n"), vec![]);
}

#[test]
fn course_checks_codes_are_listed() {
    for code in ["check_failed", "check_missing", "check_bad_output"] {
        assert!(CODES.iter().any(|c| c.0 == code), "{code} missing from CODES");
    }
}
