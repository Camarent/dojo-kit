use dojo_core::content::{Course, CourseCheck};
use dojo_core::validate::{Diagnostic, Severity, parse_findings};
use serde_json::json;
use std::fs;
use std::io::Read;
use std::os::unix::process::CommandExt;
use std::path::{Component, Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};
use crate::course_files::*;
use crate::cmd::build::find_web_dir;
use crate::USAGE;

/// Wall-clock limit for one course check script.
const CHECK_TIMEOUT: Duration = Duration::from_secs(60);
/// How often the timeout loop polls the child.
const CHECK_POLL: Duration = Duration::from_millis(10);
/// How long stdout may stay open after the script exited before the check fails.
const CHECK_READ_GRACE: Duration = Duration::from_secs(2);
/// Largest stdout a check script may write; more fails the check as truncated.
const CHECK_STDOUT_CAP: u64 = 16 * 1024 * 1024;
/// Bytes of stderr kept (the last ones) for a failed check.
const CHECK_STDERR_TAIL: usize = 2048;

/// What the stdout reader hands back: the text, or a marker that the cap was passed.
enum Captured {
    Text(String),
    TooLarge,
}

pub(crate) fn count(diags: &[Diagnostic], severity: Severity) -> usize {
    diags.iter().filter(|d| d.severity == severity).count()
}

pub(crate) fn print_text(diags: &[Diagnostic]) {
    for d in diags {
        let place = if d.line == 0 { d.file.clone() } else { format!("{}:{}", d.file, d.line) };
        println!("{}[{}] {place}: {}", d.severity.as_str(), d.code, d.message);
    }
    println!("{} errors, {} warnings", count(diags, Severity::Error), count(diags, Severity::Warning));
}

pub(crate) fn print_json(diags: &[Diagnostic]) {
    let errors = count(diags, Severity::Error);
    let list: Vec<_> = diags
        .iter()
        .map(|d| json!({"severity": d.severity.as_str(), "code": d.code, "file": d.file, "line": d.line, "message": d.message}))
        .collect();
    let out = json!({"ok": errors == 0, "errors": errors, "warnings": count(diags, Severity::Warning), "diagnostics": list});
    println!("{out}");
}


fn check_diag(severity: Severity, code: &'static str, message: String) -> Diagnostic {
    Diagnostic { severity, code, file: "course.json".to_string(), line: 0, message }
}

/// Runs every `checks` script of the course in `dir`. Unparsable course or unusable paths give nothing: core reports those.
pub(crate) fn run_checks(dir: &Path, course_text: &str) -> Vec<Diagnostic> {
    run_checks_with(dir, course_text, CHECK_TIMEOUT)
}

fn run_checks_with(dir: &Path, course_text: &str, timeout: Duration) -> Vec<Diagnostic> {
    let Ok(course) = serde_json::from_str::<Course>(course_text) else { return Vec::new() };
    let Ok(root) = fs::canonicalize(dir) else { return Vec::new() };
    let mut out = Vec::new();
    for check in &course.checks {
        if !runnable(&check.script) {
            continue;
        }
        if !root.join(&check.script).is_file() {
            out.push(check_diag(Severity::Error, "check_missing", format!("checks '{}' script '{}' does not exist", check.id, check.script)));
            continue;
        }
        let Ok(script) = fs::canonicalize(root.join(&check.script)) else { continue };
        if !script.starts_with(&root) {
            out.push(check_diag(Severity::Error, "check_failed", format!("checks '{}': script '{}' resolves outside the course dir", check.id, check.script)));
            continue;
        }
        out.extend(run_check(&root, &script, check, timeout));
    }
    out
}

/// Relative and inside the course dir; the core check already reports the other cases.
fn runnable(script: &str) -> bool {
    let path = Path::new(script);
    !script.is_empty() && path.is_relative() && !path.components().any(|c| c == Component::ParentDir)
}

/// Runs one script with cwd and first argument set to the course dir, then turns its stdout and exit into diagnostics.
fn run_check(root: &Path, script: &Path, check: &CourseCheck, timeout: Duration) -> Vec<Diagnostic> {
    let fail = |message: String| vec![check_diag(Severity::Error, "check_failed", format!("checks '{}': {message}", check.id))];
    let too_large = format!("stdout is over {} MiB, truncated", CHECK_STDOUT_CAP >> 20);
    let mut child = match Command::new(script)
        .arg(root)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0)
        .spawn()
    {
        Ok(child) => child,
        Err(e) => return fail(format!("cannot run '{}': {e}", check.script)),
    };
    let (Some(mut stdout), Some(stderr)) = (child.stdout.take(), child.stderr.take()) else {
        kill_group(&mut child);
        return fail("stdout is not piped".to_string());
    };
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut text = String::new();
        let _ = stdout.by_ref().take(CHECK_STDOUT_CAP + 1).read_to_string(&mut text);
        let captured = if text.len() as u64 > CHECK_STDOUT_CAP { Captured::TooLarge } else { Captured::Text(text) };
        let _ = tx.send(captured);
    });
    let (err_tx, err_rx) = mpsc::channel();
    thread::spawn(move || {
        let _ = err_tx.send(read_tail(stderr, CHECK_STDERR_TAIL));
    });
    let deadline = Instant::now() + timeout;
    let mut captured = None;
    let status = loop {
        if captured.is_none() {
            captured = rx.try_recv().ok();
        }
        if matches!(captured, Some(Captured::TooLarge)) {
            kill_group(&mut child);
            return fail(too_large);
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(CHECK_POLL),
            Ok(None) => {
                kill_group(&mut child);
                return fail(format!("timed out after {timeout:?}"));
            }
            Err(e) => {
                kill_group(&mut child);
                return fail(format!("cannot wait for it: {e}"));
            }
        }
    };
    // A grandchild may keep the pipe open after the script exits; do not wait for it past the grace period.
    let text = match captured.or_else(|| rx.recv_timeout(CHECK_READ_GRACE).ok()) {
        Some(Captured::Text(text)) => text,
        Some(Captured::TooLarge) => {
            kill_group(&mut child);
            return fail(too_large);
        }
        None => {
            kill_group(&mut child);
            return fail("its output did not close after it exited".to_string());
        }
    };
    let tail = err_rx.recv_timeout(CHECK_READ_GRACE).unwrap_or_default();
    let mut out = parse_findings(&text);
    if !status.success() {
        let code = status.code().map_or_else(|| "no exit code".to_string(), |c| format!("code {c}"));
        let message = if tail.is_empty() { format!("exited with {code}") } else { format!("exited with {code}; stderr: {tail}") };
        out.extend(fail(message));
    }
    out
}

/// Kills the child and every process in its group. The child leads the group (`process_group(0)`), so grandchildren die too.
fn kill_group(child: &mut Child) {
    let _ = Command::new("kill").args(["-KILL", "--"]).arg(format!("-{}", child.id())).status();
    let _ = child.kill();
    let _ = child.wait();
}

/// Reads a stream to its end and keeps only its last `keep` bytes, trimmed.
fn read_tail(mut reader: impl Read, keep: usize) -> String {
    let mut tail: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 8192];
    while let Ok(n) = reader.read(&mut chunk) {
        if n == 0 {
            break;
        }
        tail.extend_from_slice(chunk.get(..n).unwrap_or_default());
        if tail.len() > keep {
            tail.drain(..tail.len() - keep);
        }
    }
    String::from_utf8_lossy(&tail).trim().to_string()
}

pub(crate) fn run_validate(args: &[String]) -> Result<u8, String> {
    let mut dir = None;
    let (mut as_json, mut strict, mut web, mut no_checks) = (false, false, None, false);
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--json" => as_json = true,
            "--strict" => strict = true,
            "--no-checks" => no_checks = true,
            "--web" => web = Some(PathBuf::from(it.next().ok_or_else(|| USAGE.to_string())?)),
            f if f.starts_with("--") => return Err(USAGE.to_string()),
            _ if dir.is_none() => dir = Some(a),
            _ => return Err(USAGE.to_string()),
        }
    }
    let dir = dir.ok_or_else(|| USAGE.to_string())?;
    let course = load(Path::new(dir))?;
    let web = web.or_else(|| find_web_dir().ok());
    let mut diags = validate_course(Path::new(dir), &course, web.as_deref());
    if !no_checks {
        diags.extend(run_checks(Path::new(dir), &course.course_text));
    }
    if as_json {
        print_json(&diags);
    } else {
        print_text(&diags);
    }
    let failed = count(&diags, Severity::Error) > 0 || (strict && count(&diags, Severity::Warning) > 0);
    Ok(u8::from(failed))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn script_over_timeout_is_killed_and_reported_as_check_failed() {
        let dir = std::env::temp_dir().join(format!("dojo-check-timeout-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let script = dir.join("slow.sh");
        fs::write(&script, "#!/bin/sh\nexec sleep 30\n").unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
        let text = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"checks":[{"id":"slow","script":"slow.sh"}]}"#;
        let diags = run_checks_with(&dir, text, Duration::from_millis(200));
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(diags.len(), 1, "{diags:?}");
        assert_eq!((diags[0].code, diags[0].severity), ("check_failed", Severity::Error));
        assert_eq!(diags[0].message, "checks 'slow': timed out after 200ms");
    }

    #[test]
    fn script_symlink_out_of_course_dir_is_check_failed() {
        let base = std::env::temp_dir().join(format!("dojo-check-symlink-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let (dir, outside) = (base.join("course"), base.join("outside"));
        fs::create_dir_all(&dir).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let target = outside.join("evil.sh");
        fs::write(&target, "#!/bin/sh\necho '{\"severity\":\"warning\",\"code\":\"x\",\"item\":\"i\",\"message\":\"m\"}'\n").unwrap();
        fs::set_permissions(&target, fs::Permissions::from_mode(0o755)).unwrap();
        std::os::unix::fs::symlink(&target, dir.join("link.sh")).unwrap();
        let text = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"checks":[{"id":"link","script":"link.sh"}]}"#;
        let diags = run_checks_with(&dir, text, CHECK_TIMEOUT);
        let _ = fs::remove_dir_all(&base);
        assert_eq!(diags.len(), 1, "{diags:?}");
        assert_eq!((diags[0].code, diags[0].severity), ("check_failed", Severity::Error));
        assert_eq!(diags[0].message, "checks 'link': script 'link.sh' resolves outside the course dir");
    }

    #[test]
    fn grandchild_holding_stdout_fails_after_grace_instead_of_hanging() {
        let dir = std::env::temp_dir().join(format!("dojo-check-grandchild-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let script = dir.join("bg.sh");
        fs::write(&script, "#!/bin/sh\nsleep 5 &\n").unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
        let text = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"checks":[{"id":"bg","script":"bg.sh"}]}"#;
        let diags = run_checks_with(&dir, text, CHECK_TIMEOUT);
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(diags.len(), 1, "{diags:?}");
        assert_eq!((diags[0].code, diags[0].severity), ("check_failed", Severity::Error));
        assert_eq!(diags[0].message, "checks 'bg': its output did not close after it exited");
    }

    #[test]
    fn timeout_kills_the_whole_process_group() {
        let dir = std::env::temp_dir().join(format!("dojo-check-group-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let script = dir.join("tree.sh");
        fs::write(&script, "#!/bin/sh\n(sleep 1; touch \"$1/late\") &\nsleep 30\n").unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
        let text = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"checks":[{"id":"tree","script":"tree.sh"}]}"#;
        let diags = run_checks_with(&dir, text, Duration::from_millis(300));
        thread::sleep(Duration::from_millis(1500));
        let late = dir.join("late").exists();
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(diags.len(), 1, "{diags:?}");
        assert_eq!(diags[0].message, "checks 'tree': timed out after 300ms");
        assert!(!late, "grandchild survived the timeout kill");
    }

    #[test]
    fn stdout_over_cap_is_check_failed_truncated() {
        let dir = std::env::temp_dir().join(format!("dojo-check-cap-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let script = dir.join("big.sh");
        fs::write(&script, "#!/bin/sh\nyes x | head -c 17000000\n").unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
        let text = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"checks":[{"id":"big","script":"big.sh"}]}"#;
        let diags = run_checks_with(&dir, text, CHECK_TIMEOUT);
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(diags.len(), 1, "{diags:?}");
        assert_eq!((diags[0].code, diags[0].severity), ("check_failed", Severity::Error));
        assert_eq!(diags[0].message, "checks 'big': stdout is over 16 MiB, truncated");
    }

    #[test]
    fn failed_check_message_ends_with_stderr_tail() {
        let dir = std::env::temp_dir().join(format!("dojo-check-stderr-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let script = dir.join("err.sh");
        fs::write(&script, "#!/bin/sh\nhead -c 5000 /dev/zero | tr '\\0' a >&2\necho END >&2\nexit 3\n").unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
        let text = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"checks":[{"id":"err","script":"err.sh"}]}"#;
        let diags = run_checks_with(&dir, text, CHECK_TIMEOUT);
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(diags.len(), 1, "{diags:?}");
        let tail = diags[0].message.split("exited with code 3; stderr: ").nth(1).unwrap_or_default();
        assert!(tail.ends_with("END"), "{diags:?}");
        assert!(tail.len() > 2000 && tail.len() <= 2048, "tail is {} bytes", tail.len());
    }

    #[test]
    fn no_checks_flag_skips_check_scripts() {
        let dir = std::env::temp_dir().join(format!("dojo-check-nochecks-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("content")).unwrap();
        fs::write(dir.join("course.json"), r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"checks":[{"id":"c1","script":"ok.sh"}]}"#).unwrap();
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/checks/content/u.jsonl");
        fs::copy(fixture, dir.join("content/u.jsonl")).unwrap();
        let script = dir.join("ok.sh");
        fs::write(&script, "#!/bin/sh\necho '{\"code\":\"E1\",\"severity\":\"error\",\"item\":\"u-1\",\"message\":\"wrong gap\"}'\n").unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
        let d = dir.to_string_lossy().into_owned();
        let with = run_validate(std::slice::from_ref(&d));
        let without = run_validate(&[d, "--no-checks".to_string()]);
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(with, Ok(1));
        assert_eq!(without, Ok(0));
    }
}
