use std::fs;
use std::io;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicUsize, Ordering};

fn dojo() -> Command {
    Command::new(env!("CARGO_BIN_EXE_dojo"))
}

/// Copies the checks fixture into a fresh dir, adds one check `c1` running `ok.sh`, and writes `ok.sh`
/// (`body`, default exit 0), made executable here: the fixture itself has no check, so no snapshot runs a script.
fn course_with(tag: &str, body: Option<&str>) -> io::Result<PathBuf> {
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!("dojo-checks-{tag}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
    let _ = fs::remove_dir_all(&dir);
    let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/checks");
    fs::create_dir_all(dir.join("content"))?;
    let base = fs::read_to_string(fixture.join("course.json"))?;
    let base = base.trim_end().strip_suffix('}').ok_or_else(|| io::Error::other("fixture course.json is not an object"))?;
    fs::write(dir.join("course.json"), format!(r#"{base},"checks":[{{"id":"c1","script":"ok.sh"}}]}}"#))?;
    fs::copy(fixture.join("content/u.jsonl"), dir.join("content/u.jsonl"))?;
    let script = dir.join("ok.sh");
    match body {
        Some(body) => fs::write(&script, body)?,
        None => fs::copy(fixture.join("ok.sh"), &script).map(|_| ())?,
    }
    fs::set_permissions(&script, fs::Permissions::from_mode(0o755))?;
    Ok(dir)
}

fn validate(dir: &Path, extra: &[&str]) -> Output {
    dojo().arg("validate").arg(dir).args(extra).output().unwrap()
}

fn text(out: &Output) -> String {
    String::from_utf8_lossy(&out.stdout).into_owned()
}

#[test]
fn passing_script_adds_no_findings() {
    let dir = course_with("pass", None).unwrap();
    let out = validate(&dir, &[]);
    assert_eq!(out.status.code(), Some(0));
    assert_eq!(text(&out), "0 errors, 0 warnings\n");
}

#[test]
fn script_receives_course_dir_as_cwd_and_first_argument() {
    let body = "#!/bin/sh\n[ \"$(pwd -P)\" = \"$1\" ] || echo '{\"code\":\"X\",\"severity\":\"error\",\"item\":\"u-1\",\"message\":\"cwd\"}'\n";
    let dir = course_with("cwd", Some(body)).unwrap();
    let out = validate(&dir, &[]);
    assert_eq!(out.status.code(), Some(0), "{}", text(&out));
    assert_eq!(text(&out), "0 errors, 0 warnings\n");
}

#[test]
fn error_finding_joins_output_as_check_failed() {
    let body = "#!/bin/sh\necho '{\"code\":\"E1\",\"severity\":\"error\",\"item\":\"u-1\",\"message\":\"wrong gap\"}'\n";
    let dir = course_with("error", Some(body)).unwrap();
    let out = validate(&dir, &[]);
    assert_eq!(out.status.code(), Some(1));
    assert_eq!(text(&out), "error[check_failed] course.json: E1 [u-1]: wrong gap\n1 errors, 0 warnings\n");
}

#[test]
fn strict_fails_on_warning_finding() {
    let body = "#!/bin/sh\necho '{\"code\":\"W1\",\"severity\":\"warning\",\"item\":\"u-2\",\"message\":\"long\"}'\n";
    let dir = course_with("warn", Some(body)).unwrap();
    let plain = validate(&dir, &[]);
    assert_eq!(plain.status.code(), Some(0));
    assert_eq!(text(&plain), "warning[check_failed] course.json: W1 [u-2]: long\n0 errors, 1 warnings\n");
    let strict = validate(&dir, &["--strict"]);
    assert_eq!(strict.status.code(), Some(1));
}

#[test]
fn missing_script_is_check_missing() {
    let dir = course_with("missing", None).unwrap();
    let course = fs::read_to_string(dir.join("course.json")).unwrap();
    fs::write(dir.join("course.json"), course.replace("ok.sh", "gone.sh")).unwrap();
    let out = validate(&dir, &[]);
    assert_eq!(out.status.code(), Some(1));
    assert_eq!(text(&out), "error[check_missing] course.json: checks 'c1' script 'gone.sh' does not exist\n1 errors, 0 warnings\n");
}

#[test]
fn non_zero_exit_is_check_failed() {
    let dir = course_with("exit", Some("#!/bin/sh\nexit 3\n")).unwrap();
    let out = validate(&dir, &[]);
    assert_eq!(out.status.code(), Some(1));
    assert_eq!(text(&out), "error[check_failed] course.json: checks 'c1': exited with code 3\n1 errors, 0 warnings\n");
}

#[test]
fn bad_output_line_is_check_bad_output() {
    let dir = course_with("bad", Some("#!/bin/sh\necho not-json\n")).unwrap();
    let out = validate(&dir, &[]);
    assert_eq!(out.status.code(), Some(1));
    let t = text(&out);
    assert!(t.starts_with("error[check_bad_output] course.json:1: line is not a finding object: "), "{t}");
    assert!(t.ends_with("\n1 errors, 0 warnings\n"), "{t}");
}
