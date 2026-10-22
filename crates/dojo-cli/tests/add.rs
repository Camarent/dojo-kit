use dojo_core::content::parse_items;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};

fn dojo() -> Command {
    Command::new(env!("CARGO_BIN_EXE_dojo"))
}

fn demo() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/demo")
}

fn unique_dir(tag: &str) -> PathBuf {
    static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!("dojo-cli-{tag}-{}-{}", std::process::id(), N.fetch_add(1, std::sync::atomic::Ordering::SeqCst)));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).unwrap();
        }
    }
}

fn course(tag: &str) -> PathBuf {
    let dir = unique_dir(tag);
    copy_dir(&demo(), &dir);
    dir
}

fn add(dir: &Path, unit: &str, extra: &[&str], input: &str) -> Output {
    let mut child = dojo()
        .arg("add")
        .arg(dir)
        .arg(unit)
        .args(extra)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.take().unwrap().write_all(input.as_bytes()).unwrap();
    child.wait_with_output().unwrap()
}

fn code(out: &Output) -> Option<i32> {
    out.status.code()
}

fn stdout(out: &Output) -> String {
    String::from_utf8(out.stdout.clone()).unwrap()
}

fn stderr(out: &Output) -> String {
    String::from_utf8(out.stderr.clone()).unwrap()
}

fn read(dir: &Path, rel: &str) -> String {
    fs::read_to_string(dir.join(rel)).unwrap()
}

const CHOICE: &str = r#"{"type":"choice","prompt":"Which?","options":["A","B"],"answer":0}"#;
const GAP: &str = r#"{"type":"gap","prompt":"Fill ___","answers":["x"]}"#;

fn assert_untouched(dir: &Path) {
    assert_eq!(read(dir, "content/geo.jsonl"), read(&demo(), "content/geo.jsonl"));
    assert_eq!(read(dir, "content/math.jsonl"), read(&demo(), "content/math.jsonl"));
}

fn last_ids(dir: &Path, file: &str, n: usize) -> Vec<String> {
    let parsed = parse_items(&read(dir, file));
    assert!(parsed.errors.is_empty());
    let all: Vec<String> = parsed.items.iter().map(|(_, i)| i.id().to_string()).collect();
    all[all.len() - n..].to_vec()
}

#[test]
fn array_input() {
    let dir = course("add-array");
    let out = add(&dir, "geo", &[], &format!("[{CHOICE},{GAP}]"));
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    let text = stdout(&out);
    let ids = last_ids(&dir, "content/geo.jsonl", 2);
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines[0], format!("added 2 items to content/geo.jsonl: {} .. {}", ids[0], ids[1]));
    assert_eq!(lines[1], ids.join(","));
    assert_eq!(lines[2], format!("next: ./dojo validate {}", dir.display()));
    assert_eq!(ids, ["geo-9", "geo-10"].map(String::from));
}

#[test]
fn stream_of_one_line_objects() {
    let dir = course("add-stream");
    let out = add(&dir, "math", &[], &format!("{CHOICE}\n{GAP}\n"));
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    assert_eq!(last_ids(&dir, "content/math.jsonl", 2), ["math-8", "math-9"].map(String::from));
}

#[test]
fn pretty_printed_objects() {
    let dir = course("add-pretty");
    let input = "{\n  \"type\": \"choice\",\n  \"prompt\": \"Which?\",\n  \"options\": [\"A\", \"B\"],\n  \"answer\": 0\n}\n{\n  \"type\": \"gap\",\n  \"prompt\": \"Fill ___\",\n  \"answers\": [\"x\"]\n}\n";
    let out = add(&dir, "geo", &[], input);
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    assert!(stdout(&out).starts_with("added 2 items to content/geo.jsonl: geo-9 .. geo-10"));
}

#[test]
fn mixed_array_and_objects_with_unit_set_or_matching() {
    let dir = course("add-mixed");
    let with_unit = r#"{"unit":"geo","type":"gap","prompt":"Fill ___","answers":["y"]}"#;
    let out = add(&dir, "geo", &[], &format!("[{CHOICE},\n{with_unit}]\n{GAP}\n"));
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    let parsed = parse_items(&read(&dir, "content/geo.jsonl"));
    assert_eq!(parsed.items.len(), 11);
    assert!(parsed.items.iter().all(|(_, i)| i.unit() == "geo" || i.unit() == "math"));
    assert_eq!(last_ids(&dir, "content/geo.jsonl", 3), ["geo-9", "geo-10", "geo-11"].map(String::from));
}

#[test]
fn ids_continue_after_retired_ids_in_lock() {
    let dir = course("add-retired");
    fs::write(dir.join("ids.lock"), "{\"v\":1,\"ids\":[\"geo-1\"],\"retired\":[\"geo-40\"]}").unwrap();
    let out = add(&dir, "geo", &[], CHOICE);
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    assert!(stdout(&out).contains("geo-41"));
}

#[test]
fn explicit_ids_are_kept_and_counted_in_the_batch() {
    let dir = course("add-explicit");
    let explicit = r#"{"id":"geo-30","type":"gap","prompt":"Fill ___","answers":["y"]}"#;
    let out = add(&dir, "geo", &[], &format!("[{explicit},{CHOICE}]"));
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    assert_eq!(last_ids(&dir, "content/geo.jsonl", 2), ["geo-30", "geo-31"].map(String::from));
}

#[test]
fn explicit_duplicate_id_rejected() {
    let dir = course("add-dup");
    let dup = r#"{"id":"geo-1","type":"gap","prompt":"Fill ___","answers":["y"]}"#;
    let out = add(&dir, "geo", &[], &format!("[{CHOICE},{dup}]"));
    assert_eq!(code(&out), Some(1));
    assert!(stderr(&out).contains("item 2: id already exists: geo-1"));
    assert_untouched(&dir);

    let twice = r#"{"id":"geo-50","type":"gap","prompt":"Fill ___","answers":["y"]}"#;
    let out = add(&dir, "geo", &[], &format!("{twice}{twice}"));
    assert_eq!(code(&out), Some(1));
    assert!(stderr(&out).contains("item 2: id already exists: geo-50"));
}

#[test]
fn explicit_id_in_lock_rejected() {
    let dir = course("add-dup-lock");
    fs::write(dir.join("ids.lock"), "{\"v\":1,\"ids\":[],\"retired\":[\"geo-77\"]}").unwrap();
    let out = add(&dir, "geo", &[], r#"{"id":"geo-77","type":"gap","prompt":"Fill ___","answers":["y"]}"#);
    assert_eq!(code(&out), Some(1));
    assert!(stderr(&out).contains("item 1: id already exists: geo-77"));
}

#[test]
fn wrong_unit_rejected() {
    let dir = course("add-wrong-unit");
    let out = add(&dir, "geo", &[], r#"{"unit":"math","type":"gap","prompt":"Fill ___","answers":["y"]}"#);
    assert_eq!(code(&out), Some(1));
    assert!(stderr(&out).contains("item 1: unit 'math' does not match target unit 'geo'"));
    assert_untouched(&dir);
}

#[test]
fn unknown_unit_rejected() {
    let dir = course("add-unknown-unit");
    let out = add(&dir, "nope", &[], CHOICE);
    assert_eq!(code(&out), Some(1));
    assert!(stderr(&out).contains("unit 'nope' does not exist in course.json"));
    assert!(!dir.join("content/nope.jsonl").exists());
}

#[test]
fn unknown_field_names_the_item_and_writes_nothing() {
    let dir = course("add-unknown-field");
    let out = add(&dir, "geo", &[], r#"{"type":"choice","prompt":"Which?","options":["A","B"],"answer":0,"bogus":1}"#);
    assert_eq!(code(&out), Some(1));
    let err = stderr(&out);
    assert!(err.starts_with("item 1: "), "{err}");
    assert!(err.contains("bogus"));
    assert_untouched(&dir);
}

#[test]
fn one_bad_item_among_three_writes_nothing_and_reports_every_error() {
    let dir = course("add-all-or-nothing");
    let out = add(&dir, "geo", &[], &format!("[{CHOICE},{{\"type\":\"choice\"}},{GAP},[1]]"));
    assert_eq!(code(&out), Some(1));
    let err = stderr(&out);
    assert!(err.contains("item 2: "));
    assert!(err.contains("item 4: "));
    assert!(!err.contains("item 1: ") && !err.contains("item 3: "));
    assert_untouched(&dir);
    assert!(stdout(&out).is_empty());
}

#[test]
fn file_without_trailing_newline_gets_one_before_append() {
    let dir = course("add-no-newline");
    let original = read(&dir, "content/geo.jsonl");
    fs::write(dir.join("content/geo.jsonl"), original.trim_end()).unwrap();
    let out = add(&dir, "geo", &[], CHOICE);
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    let text = read(&dir, "content/geo.jsonl");
    assert!(text.starts_with(original.trim_end()));
    assert!(text.ends_with('\n'));
    let parsed = parse_items(&text);
    assert!(parsed.errors.is_empty());
    assert_eq!(parsed.items.len(), 9);
}

#[test]
fn crlf_input() {
    let dir = course("add-crlf");
    let out = add(&dir, "geo", &[], &format!("{CHOICE}\r\n{GAP}\r\n"));
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    assert!(!read(&dir, "content/geo.jsonl").contains('\r'));
    assert_eq!(last_ids(&dir, "content/geo.jsonl", 2), ["geo-9", "geo-10"].map(String::from));
}

#[test]
fn file_flag_reads_the_file() {
    let dir = course("add-file");
    let input = dir.join("batch.json");
    fs::write(&input, GAP).unwrap();
    let out = add(&dir, "geo", &["--file", input.to_str().unwrap()], "");
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    assert_eq!(last_ids(&dir, "content/geo.jsonl", 1), ["geo-9"].map(String::from));
}

#[test]
fn new_unit_file_is_created() {
    let dir = course("add-create");
    fs::remove_file(dir.join("content/math.jsonl")).unwrap();
    let out = add(&dir, "math", &[], CHOICE);
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    assert!(stdout(&out).starts_with("added 1 items to content/math.jsonl: math-8 .. math-8"));
    assert_eq!(parse_items(&read(&dir, "content/math.jsonl")).items.len(), 1);
}

#[test]
fn dry_run_prints_but_writes_nothing() {
    let dir = course("add-dry");
    let out = add(&dir, "geo", &["--dry-run"], &format!("[{CHOICE},{GAP}]"));
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    assert!(stdout(&out).starts_with("added 2 items to content/geo.jsonl: geo-9 .. geo-10"));
    assert_untouched(&dir);
}

#[test]
fn usage_and_io_errors_exit_2() {
    let dir = course("add-usage");
    assert_eq!(code(&add(&dir, "geo", &["--bogus"], CHOICE)), Some(2));
    assert_eq!(code(&add(&dir, "geo", &[], "  \n")), Some(2));
    assert_eq!(code(&add(&dir, "geo", &[], "[]")), Some(2));
    assert_eq!(code(&add(&dir, "geo", &["--file", "/nonexistent/batch.json"], "")), Some(2));
    assert_eq!(code(&add(&dir.join("missing"), "geo", &[], CHOICE)), Some(2));
    fs::remove_file(dir.join("course.json")).unwrap();
    assert_eq!(code(&add(&dir, "geo", &[], CHOICE)), Some(2));
    assert_eq!(code(&dojo().arg("add").arg(&dir).output().unwrap()), Some(2));
}

#[test]
fn malformed_json_exits_1_and_writes_nothing() {
    let dir = course("add-malformed");
    let out = add(&dir, "geo", &[], &format!("{CHOICE}\n{{\"type\":"));
    assert_eq!(code(&out), Some(1));
    assert_untouched(&dir);
}

#[test]
fn appended_file_parses_back_and_validates() {
    let dir = course("add-validate");
    let before = parse_items(&read(&dir, "content/geo.jsonl")).items.len();
    let out = add(&dir, "geo", &[], &format!("[{CHOICE},{GAP}]"));
    assert_eq!(code(&out), Some(0), "{}", stderr(&out));
    let parsed = parse_items(&read(&dir, "content/geo.jsonl"));
    assert!(parsed.errors.is_empty());
    assert_eq!(parsed.items.len(), before + 2);
    let validate = dojo().arg("validate").arg(&dir).output().unwrap();
    assert_eq!(code(&validate), Some(0), "{}{}", stdout(&validate), stderr(&validate));
}

#[test]
fn rejects_unit_id_outside_slug_rule() {
    let dir = course("badunit");
    let out = add(&dir, "../../escaped", &[], CHOICE);
    assert_eq!(code(&out), Some(1));
    assert!(stderr(&out).contains("must match"));
    assert!(!dir.join("../../escaped.jsonl").exists());
}

#[test]
fn add_refuses_dangling_symlink_target() {
    let dir = course("add-dangling");
    let target = dir.join("elsewhere.jsonl");
    std::os::unix::fs::symlink(&target, dir.join("content/geo.jsonl")).ok();
    let _ = fs::remove_file(dir.join("content/geo.jsonl"));
    std::os::unix::fs::symlink(&target, dir.join("content/geo.jsonl")).unwrap();
    let out = add(&dir, "geo", &[], CHOICE);
    assert_ne!(code(&out), Some(0));
    assert!(!target.exists());
}
