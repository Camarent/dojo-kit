mod common;

use common::TempDir;
use dojo_core::content::parse_items;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

fn dojo() -> Command {
    Command::new(env!("CARGO_BIN_EXE_dojo"))
}

fn demo() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/demo")
}

fn copy_dir(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn course(tag: &str) -> io::Result<TempDir> {
    let dir = TempDir::new(&format!("dojo-cli-{tag}"))?;
    copy_dir(&demo(), &dir)?;
    Ok(dir)
}

fn add(dir: &Path, unit: &str, extra: &[&str], input: &str) -> io::Result<Output> {
    let mut child = dojo()
        .arg("add")
        .arg(dir)
        .arg(unit)
        .args(extra)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    // The child may exit before reading stdin (e.g. on a rejected unit id);
    // a broken pipe here is expected and the exit status is checked by the caller.
    let mut stdin = child.stdin.take().ok_or_else(|| io::Error::other("stdin missing"))?;
    match stdin.write_all(input.as_bytes()) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::BrokenPipe => {}
        Err(e) => return Err(e),
    }
    drop(stdin);
    child.wait_with_output()
}

fn code(out: &Output) -> Option<i32> {
    out.status.code()
}

fn stdout(out: &Output) -> String {
    String::from_utf8_lossy(&out.stdout).into_owned()
}

fn stderr(out: &Output) -> String {
    String::from_utf8_lossy(&out.stderr).into_owned()
}

fn read(dir: &Path, rel: &str) -> io::Result<String> {
    fs::read_to_string(dir.join(rel))
}

const CHOICE: &str = r#"{"type":"choice","prompt":"Which?","options":["A","B"],"answer":0}"#;
const GAP: &str = r#"{"type":"gap","prompt":"Fill ___","answers":["x"]}"#;

fn assert_untouched(dir: &Path) -> io::Result<()> {
    assert_eq!(read(dir, "content/geo.jsonl")?, read(&demo(), "content/geo.jsonl")?);
    assert_eq!(read(dir, "content/math.jsonl")?, read(&demo(), "content/math.jsonl")?);
    Ok(())
}

fn last_ids(dir: &Path, file: &str, n: usize) -> io::Result<Vec<String>> {
    let parsed = parse_items(&read(dir, file)?);
    assert!(parsed.errors.is_empty());
    let all: Vec<String> = parsed.items.iter().map(|(_, i)| i.id().to_string()).collect();
    Ok(all.iter().rev().take(n).rev().cloned().collect())
}

#[test]
fn array_input() -> io::Result<()> {
    let dir = course("add-array")?;
    let out = add(&dir, "geo", &[], &format!("[{CHOICE},{GAP}]"))?;
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    let text = stdout(&out);
    let ids = last_ids(&dir, "content/geo.jsonl", 2)?;
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines.first().copied(), Some(format!("added 2 items to content/geo.jsonl: {} .. {}", ids.first().map_or("", String::as_str), ids.get(1).map_or("", String::as_str)).as_str()));
    assert_eq!(lines.get(1).copied(), Some(ids.join(",").as_str()));
    assert_eq!(lines.get(2).copied(), Some(format!("next: ./dojo validate {}", dir.display()).as_str()));
    assert_eq!(ids, ["geo-9", "geo-10"].map(String::from));
    Ok(())
}

#[test]
fn stream_of_one_line_objects() -> io::Result<()> {
    let dir = course("add-stream")?;
    let out = add(&dir, "math", &[], &format!("{CHOICE}\n{GAP}\n"))?;
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    assert_eq!(last_ids(&dir, "content/math.jsonl", 2)?, ["math-8", "math-9"].map(String::from));
    Ok(())
}

#[test]
fn pretty_printed_objects() -> io::Result<()> {
    let dir = course("add-pretty")?;
    let input = "{\n  \"type\": \"choice\",\n  \"prompt\": \"Which?\",\n  \"options\": [\"A\", \"B\"],\n  \"answer\": 0\n}\n{\n  \"type\": \"gap\",\n  \"prompt\": \"Fill ___\",\n  \"answers\": [\"x\"]\n}\n";
    let out = add(&dir, "geo", &[], input)?;
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    assert!(stdout(&out).starts_with("added 2 items to content/geo.jsonl: geo-9 .. geo-10"));
    Ok(())
}

#[test]
fn mixed_array_and_objects_with_unit_set_or_matching() -> io::Result<()> {
    let dir = course("add-mixed")?;
    let with_unit = r#"{"unit":"geo","type":"gap","prompt":"Fill ___","answers":["y"]}"#;
    let out = add(&dir, "geo", &[], &format!("[{CHOICE},\n{with_unit}]\n{GAP}\n"))?;
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    let parsed = parse_items(&read(&dir, "content/geo.jsonl")?);
    assert_eq!(parsed.items.len(), 11);
    assert!(parsed.items.iter().all(|(_, i)| i.unit() == "geo" || i.unit() == "math"));
    assert_eq!(last_ids(&dir, "content/geo.jsonl", 3)?, ["geo-9", "geo-10", "geo-11"].map(String::from));
    Ok(())
}

#[test]
fn ids_continue_after_retired_ids_in_lock() -> io::Result<()> {
    let dir = course("add-retired")?;
    fs::write(dir.join("ids.lock"), "{\"v\":1,\"ids\":[\"geo-1\"],\"retired\":[\"geo-40\"]}")?;
    let out = add(&dir, "geo", &[], CHOICE)?;
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    assert!(stdout(&out).contains("geo-41"));
    Ok(())
}

#[test]
fn explicit_ids_are_kept_and_counted_in_the_batch() -> io::Result<()> {
    let dir = course("add-explicit")?;
    let explicit = r#"{"id":"geo-30","type":"gap","prompt":"Fill ___","answers":["y"]}"#;
    let out = add(&dir, "geo", &[], &format!("[{explicit},{CHOICE}]"))?;
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    assert_eq!(last_ids(&dir, "content/geo.jsonl", 2)?, ["geo-30", "geo-31"].map(String::from));
    Ok(())
}

#[test]
fn explicit_duplicate_id_rejected() -> io::Result<()> {
    let dir = course("add-dup")?;
    let dup = r#"{"id":"geo-1","type":"gap","prompt":"Fill ___","answers":["y"]}"#;
    let out = add(&dir, "geo", &[], &format!("[{CHOICE},{dup}]"))?;
    assert_eq!(code(&out), Some(1));
    assert!(stderr(&out).contains("item 2: id already exists: geo-1"));
    assert_untouched(&dir)?;

    let twice = r#"{"id":"geo-50","type":"gap","prompt":"Fill ___","answers":["y"]}"#;
    let out = add(&dir, "geo", &[], &format!("{twice}{twice}"))?;
    assert_eq!(code(&out), Some(1));
    assert!(stderr(&out).contains("item 2: id already exists: geo-50"));
    Ok(())
}

#[test]
fn explicit_id_in_lock_rejected() -> io::Result<()> {
    let dir = course("add-dup-lock")?;
    fs::write(dir.join("ids.lock"), "{\"v\":1,\"ids\":[],\"retired\":[\"geo-77\"]}")?;
    let out = add(&dir, "geo", &[], r#"{"id":"geo-77","type":"gap","prompt":"Fill ___","answers":["y"]}"#)?;
    assert_eq!(code(&out), Some(1));
    assert!(stderr(&out).contains("item 1: id already exists: geo-77"));
    Ok(())
}

#[test]
fn wrong_unit_rejected() -> io::Result<()> {
    let dir = course("add-wrong-unit")?;
    let out = add(&dir, "geo", &[], r#"{"unit":"math","type":"gap","prompt":"Fill ___","answers":["y"]}"#)?;
    assert_eq!(code(&out), Some(1));
    assert!(stderr(&out).contains("item 1: unit 'math' does not match target unit 'geo'"));
    assert_untouched(&dir)?;
    Ok(())
}

#[test]
fn unknown_unit_rejected() -> io::Result<()> {
    let dir = course("add-unknown-unit")?;
    let out = add(&dir, "nope", &[], CHOICE)?;
    assert_eq!(code(&out), Some(1));
    assert!(stderr(&out).contains("unit 'nope' does not exist in course.json"));
    assert!(!dir.join("content/nope.jsonl").exists());
    Ok(())
}

#[test]
fn unknown_field_names_the_item_and_writes_nothing() -> io::Result<()> {
    let dir = course("add-unknown-field")?;
    let out = add(&dir, "geo", &[], r#"{"type":"choice","prompt":"Which?","options":["A","B"],"answer":0,"bogus":1}"#)?;
    assert_eq!(code(&out), Some(1));
    let err = stderr(&out);
    assert!(err.starts_with("item 1: "), "{err}");
    assert!(err.contains("bogus"));
    assert_untouched(&dir)?;
    Ok(())
}

#[test]
fn one_bad_item_among_three_writes_nothing_and_reports_every_error() -> io::Result<()> {
    let dir = course("add-all-or-nothing")?;
    let out = add(&dir, "geo", &[], &format!("[{CHOICE},{{\"type\":\"choice\"}},{GAP},[1]]"))?;
    assert_eq!(code(&out), Some(1));
    let err = stderr(&out);
    assert!(err.contains("item 2: "));
    assert!(err.contains("item 4: "));
    assert!(!err.contains("item 1: ") && !err.contains("item 3: "));
    assert_untouched(&dir)?;
    assert!(stdout(&out).is_empty());
    Ok(())
}

#[test]
fn file_without_trailing_newline_gets_one_before_append() -> io::Result<()> {
    let dir = course("add-no-newline")?;
    let original = read(&dir, "content/geo.jsonl")?;
    fs::write(dir.join("content/geo.jsonl"), original.trim_end())?;
    let out = add(&dir, "geo", &[], CHOICE)?;
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    let text = read(&dir, "content/geo.jsonl")?;
    assert!(text.starts_with(original.trim_end()));
    assert!(text.ends_with('\n'));
    let parsed = parse_items(&text);
    assert!(parsed.errors.is_empty());
    assert_eq!(parsed.items.len(), 9);
    Ok(())
}

#[test]
fn crlf_input() -> io::Result<()> {
    let dir = course("add-crlf")?;
    let out = add(&dir, "geo", &[], &format!("{CHOICE}\r\n{GAP}\r\n"))?;
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    assert!(!read(&dir, "content/geo.jsonl")?.contains('\r'));
    assert_eq!(last_ids(&dir, "content/geo.jsonl", 2)?, ["geo-9", "geo-10"].map(String::from));
    Ok(())
}

#[test]
fn file_flag_reads_the_file() -> io::Result<()> {
    let dir = course("add-file")?;
    let input = dir.join("batch.json");
    fs::write(&input, GAP)?;
    let out = add(&dir, "geo", &["--file", input.to_str().unwrap_or_default()], "")?;
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    assert_eq!(last_ids(&dir, "content/geo.jsonl", 1)?, ["geo-9"].map(String::from));
    Ok(())
}

#[test]
fn new_unit_file_is_created() -> io::Result<()> {
    let dir = course("add-create")?;
    fs::remove_file(dir.join("content/math.jsonl"))?;
    let out = add(&dir, "math", &[], CHOICE)?;
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    assert!(stdout(&out).starts_with("added 1 items to content/math.jsonl: math-8 .. math-8"));
    assert_eq!(parse_items(&read(&dir, "content/math.jsonl")?).items.len(), 1);
    Ok(())
}

#[test]
fn dry_run_prints_but_writes_nothing() -> io::Result<()> {
    let dir = course("add-dry")?;
    let out = add(&dir, "geo", &["--dry-run"], &format!("[{CHOICE},{GAP}]"))?;
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    assert!(stdout(&out).starts_with("added 2 items to content/geo.jsonl: geo-9 .. geo-10"));
    assert_untouched(&dir)?;
    Ok(())
}

#[test]
fn usage_and_io_errors_exit_2() -> io::Result<()> {
    let dir = course("add-usage")?;
    assert_eq!(code(&add(&dir, "geo", &["--bogus"], CHOICE)?), Some(2));
    assert_eq!(code(&add(&dir, "geo", &[], "  \n")?), Some(2));
    assert_eq!(code(&add(&dir, "geo", &[], "[]")?), Some(2));
    assert_eq!(code(&add(&dir, "geo", &["--file", "/nonexistent/batch.json"], "")?), Some(2));
    assert_eq!(code(&add(&dir.join("missing"), "geo", &[], CHOICE)?), Some(2));
    fs::remove_file(dir.join("course.json"))?;
    assert_eq!(code(&add(&dir, "geo", &[], CHOICE)?), Some(2));
    assert_eq!(code(&dojo().arg("add").arg(&*dir).output()?), Some(2));
    Ok(())
}

#[test]
fn malformed_json_exits_1_and_writes_nothing() -> io::Result<()> {
    let dir = course("add-malformed")?;
    let out = add(&dir, "geo", &[], &format!("{CHOICE}\n{{\"type\":"))?;
    assert_eq!(code(&out), Some(1));
    assert_untouched(&dir)?;
    Ok(())
}

#[test]
fn appended_file_parses_back_and_validates() -> io::Result<()> {
    let dir = course("add-validate")?;
    let before = parse_items(&read(&dir, "content/geo.jsonl")?).items.len();
    let out = add(&dir, "geo", &[], &format!("[{CHOICE},{GAP}]"))?;
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    let parsed = parse_items(&read(&dir, "content/geo.jsonl")?);
    assert!(parsed.errors.is_empty());
    assert_eq!(parsed.items.len(), before + 2);
    let validate = dojo().arg("validate").arg(&*dir).output()?;
    assert_eq!(code(&validate), Some(0), "{}{}", stdout(&validate), stderr(&validate));
    Ok(())
}

#[test]
fn rejects_unit_id_outside_slug_rule() -> io::Result<()> {
    let dir = course("badunit")?;
    let out = add(&dir, "../../escaped", &[], CHOICE)?;
    assert_eq!(code(&out), Some(1));
    assert!(stderr(&out).contains("must match"));
    assert!(!dir.join("../../escaped.jsonl").exists());
    Ok(())
}

#[test]
fn add_refuses_dangling_symlink_target() -> io::Result<()> {
    let dir = course("add-dangling")?;
    let target = dir.join("elsewhere.jsonl");
    std::os::unix::fs::symlink(&target, dir.join("content/geo.jsonl")).ok();
    let _ = fs::remove_file(dir.join("content/geo.jsonl"));
    std::os::unix::fs::symlink(&target, dir.join("content/geo.jsonl"))?;
    let out = add(&dir, "geo", &[], CHOICE)?;
    assert_ne!(code(&out), Some(0));
    assert!(!target.exists());
    Ok(())
}
