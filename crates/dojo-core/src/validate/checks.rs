use super::audio::escapes;
use super::{COURSE_FILE, Sink};
use crate::content::CourseCheck;
use crate::diagnostic::{Diagnostic, Severity};
use serde::Deserialize;

/// One output line of a course check: `{code, severity, item, message}`.
#[derive(Deserialize)]
struct Finding {
    code: String,
    severity: String,
    item: String,
    message: String,
}

/// Checks each `checks` entry: `script` must be a relative path inside the course dir.
pub(super) fn check_checks(checks: &[CourseCheck], sink: &mut Sink) {
    for check in checks {
        let drive = check.script.as_bytes().get(1) == Some(&b':');
        if check.script.is_empty() || drive || escapes(&check.script) {
            sink.error("bad_plugin_path", COURSE_FILE, 0, format!("checks '{}' script '{}' is absolute, empty or contains '..'", check.id, check.script));
        }
    }
}

/// Parses a check's stdout: one JSON finding per line, blank lines skipped.
/// A line that is not a finding, or has another severity, is a `check_bad_output` error.
pub fn parse_findings(stdout: &str) -> Vec<Diagnostic> {
    stdout
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty())
        .map(|(i, line)| {
            let bad = |message: String| Diagnostic { severity: Severity::Error, code: "check_bad_output", file: COURSE_FILE.to_string(), line: i + 1, message };
            match serde_json::from_str::<Finding>(line) {
                Ok(f) => {
                    let severity = match f.severity.as_str() {
                        "error" => Severity::Error,
                        "warning" => Severity::Warning,
                        other => return bad(format!("severity '{other}' is not error or warning")),
                    };
                    Diagnostic { severity, code: "check_failed", file: COURSE_FILE.to_string(), line: 0, message: format!("{} [{}]: {}", f.code, f.item, f.message) }
                }
                Err(e) => bad(format!("line is not a finding object: {e}")),
            }
        })
        .collect()
}
