use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

fn dojo() -> Command {
    Command::new(env!("CARGO_BIN_EXE_dojo"))
}

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name)
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

fn code(out: &Output) -> Option<i32> {
    out.status.code()
}

fn stderr(out: &Output) -> String {
    String::from_utf8_lossy(&out.stderr).into_owned()
}

fn stdout(out: &Output) -> String {
    String::from_utf8(out.stdout.clone()).unwrap()
}

// ========== INIT TESTS ==========

#[test]
fn init_creates_required_files() {
    let dir = unique_dir("init-creates");
    let out = dojo().arg("init").arg("test-course").arg("--workspace").arg(&dir).output().unwrap();
    assert_eq!(code(&out), Some(0));
    
    let course_dir = dir.join("test-course");
    assert!(course_dir.exists());
    assert!(course_dir.join("course.json").exists());
    assert!(course_dir.join("content/unit-1.jsonl").exists());
    assert!(course_dir.join("materials/.gitkeep").exists());
    assert!(course_dir.join("MAP.md").exists());
    
    let course_json = fs::read_to_string(course_dir.join("course.json")).unwrap();
    let v: Value = serde_json::from_str(&course_json).unwrap();
    assert_eq!(v["id"], "test-course");
    assert_eq!(v["uiLanguage"], "en");
    assert_eq!(v["units"], serde_json::json!([{"id": "unit-1", "title": "Unit 1"}]));
}

#[test]
fn init_refuses_existing_directory() {
    let dir = unique_dir("init-exists");
    fs::create_dir_all(dir.join("test-course")).unwrap();
    let out = dojo().arg("init").arg("test-course").arg("--workspace").arg(&dir).output().unwrap();
    assert_eq!(code(&out), Some(1));
    assert!(stderr(&out).contains("already exists"));
}

#[test]
fn init_refuses_invalid_id() {
    let dir = unique_dir("init-bad-id");
    let out = dojo().arg("init").arg("BadID").arg("--workspace").arg(&dir).output().unwrap();
    assert_eq!(code(&out), Some(1));
    assert!(stderr(&out).contains("invalid course id"));
    assert!(!dir.join("BadID").exists());
}

#[test]
fn init_respects_workspace_flag() {
    let dir = unique_dir("init-workspace");
    let out = dojo().arg("init").arg("mycourse").arg("--workspace").arg(&dir).arg("--title").arg("My Course").output().unwrap();
    assert_eq!(code(&out), Some(0));
    assert!(dir.join("mycourse/course.json").exists());
    let course_json = fs::read_to_string(dir.join("mycourse/course.json")).unwrap();
    let v: Value = serde_json::from_str(&course_json).unwrap();
    assert_eq!(v["title"], "My Course");
}

#[test]
fn init_default_title() {
    let dir = unique_dir("init-default-title");
    let out = dojo().arg("init").arg("my-course").arg("--workspace").arg(&dir).output().unwrap();
    assert_eq!(code(&out), Some(0));
    let course_json = fs::read_to_string(dir.join("my-course/course.json")).unwrap();
    let v: Value = serde_json::from_str(&course_json).unwrap();
    assert_eq!(v["title"], "My course");
}

#[test]
fn init_content_lang_defaults_to_ui() {
    let dir = unique_dir("init-content-lang");
    let out = dojo().arg("init").arg("mycourse").arg("--workspace").arg(&dir).arg("--ui").arg("fr").output().unwrap();
    assert_eq!(code(&out), Some(0));
    let course_json = fs::read_to_string(dir.join("mycourse/course.json")).unwrap();
    let v: Value = serde_json::from_str(&course_json).unwrap();
    assert_eq!(v["uiLanguage"], "fr");
    assert_eq!(v["contentLanguage"], "fr");
}

#[test]
fn init_created_course_passes_validate_except_unit_empty() {
    let dir = unique_dir("init-validates");
    let out = dojo().arg("init").arg("valid-test").arg("--workspace").arg(&dir).output().unwrap();
    assert_eq!(code(&out), Some(0));
    
    let validate_out = dojo().arg("validate").arg(dir.join("valid-test")).output().unwrap();
    let text = stdout(&validate_out);
    assert!(text.contains("warning[unit_empty]"));
    assert!(text.contains("0 errors"));
}

// ========== STATS TESTS ==========

#[test]
fn stats_demo_counts() {
    let out = dojo().arg("stats").arg(demo()).output().unwrap();
    assert_eq!(code(&out), Some(0));
    let text = stdout(&out);
    
    // Demo has: 6 choice (3 geo + 3 math), 4 gap (2 geo + 2 math), 5 card (3 geo + 2 math, 1 retired)
    // geo: 3 choice, 2 gap, 3 card (1 retired) = 5 active, 1 retired
    // math: 3 choice, 2 gap, 2 card = 5 active, 0 retired
    // Total: 6 choice, 4 gap, 4 card active (5 card total, 1 retired)
    
    assert!(text.contains("geo"));
    assert!(text.contains("math"));
    assert!(text.contains("choice"));
    assert!(text.contains("gap"));
    assert!(text.contains("card"));
}

#[test]
fn stats_json_demo_deterministic() {
    let out1 = dojo().arg("stats").arg(demo()).arg("--json").output().unwrap();
    let out2 = dojo().arg("stats").arg(demo()).arg("--json").output().unwrap();
    assert_eq!(code(&out1), Some(0));
    assert_eq!(code(&out2), Some(0));
    assert_eq!(stdout(&out1), stdout(&out2));
    
    let v: Value = serde_json::from_str(&stdout(&out1)).unwrap();
    assert!(v["course"].is_string());
    assert!(v["units"].is_array());
    assert!(v["totals"].is_object());
    assert!(v["tags"].is_array());
    
    // Check that geo unit exists
    let units: Vec<Value> = serde_json::from_value(v["units"].clone()).unwrap();
    let geo_unit = units.iter().find(|u| u["id"] == "geo").unwrap();
    assert_eq!(geo_unit["retired"], 1); // geo-8 is retired
}

#[test]
fn stats_json_structure() {
    let out = dojo().arg("stats").arg(demo()).arg("--json").output().unwrap();
    assert_eq!(code(&out), Some(0));
    
    let v: Value = serde_json::from_str(&stdout(&out)).unwrap();
    
    // Check structure
    assert!(v.get("course").is_some());
    assert!(v.get("units").is_some_and(|u| u.is_array()));
    assert!(v.get("totals").is_some_and(|t| t.is_object()));
    assert!(v.get("tags").is_some_and(|t| t.is_array()));
    assert!(v.get("exam").is_some_and(|e| e.is_array()));
    
    let units: Vec<Value> = serde_json::from_value(v["units"].clone()).unwrap();
    for unit in &units {
        assert!(unit.get("id").is_some());
        assert!(unit.get("title").is_some());
        assert!(unit.get("active").is_some_and(|a| a.is_object()));
        assert!(unit.get("retired").is_some_and(|r| r.is_number()));
    }
    
    let totals = &v["totals"];
    assert!(totals.get("active").is_some_and(|a| a.is_object()));
    assert!(totals.get("retired").is_some_and(|r| r.is_number()));
    assert!(totals.get("total_active").is_some_and(|t| t.is_number()));
}

#[test]
fn stats_on_empty_course() {
    let dir = unique_dir("stats-empty");
    copy_dir(&fixture("warn"), &dir);
    let out = dojo().arg("stats").arg(&dir).output().unwrap();
    assert_eq!(code(&out), Some(0));
}

// ========== NEXT-ID TESTS ==========

#[test]
fn next_id_known_prefix() {
    let dir = unique_dir("next-id-known");
    copy_dir(&demo(), &dir);
    let out = dojo().arg("next-id").arg(&dir).arg("geo").output().unwrap();
    assert_eq!(code(&out), Some(0));
    let text = stdout(&out);
    let text = text.trim();
    // geo has ids: geo-1 through geo-8, so next should be geo-9
    assert_eq!(text, "geo-9");
}

#[test]
fn next_id_new_prefix() {
    let dir = unique_dir("next-id-new");
    copy_dir(&demo(), &dir);
    let out = dojo().arg("next-id").arg(&dir).arg("new").output().unwrap();
    assert_eq!(code(&out), Some(0));
    let text = stdout(&out);
    let text = text.trim();
    assert_eq!(text, "new-1");
}

#[test]
fn next_id_with_count() {
    let dir = unique_dir("next-id-count");
    copy_dir(&demo(), &dir);
    let out = dojo().arg("next-id").arg(&dir).arg("geo").arg("--count").arg("3").output().unwrap();
    assert_eq!(code(&out), Some(0));
    let text = stdout(&out);
    assert_eq!(text.trim(), "geo-9\ngeo-10\ngeo-11");
}

#[test]
fn next_id_honors_retired_ids() {
    let dir = unique_dir("next-id-retired");
    copy_dir(&demo(), &dir);
    // geo-8 is retired in ids.lock, but geo-9 should still be next
    let out = dojo().arg("next-id").arg(&dir).arg("geo").output().unwrap();
    assert_eq!(code(&out), Some(0));
    assert_eq!(stdout(&out).trim(), "geo-9");
}

#[test]
fn next_id_count_zero_exit_2() {
    let dir = unique_dir("next-id-zero");
    copy_dir(&demo(), &dir);
    let out = dojo().arg("next-id").arg(&dir).arg("geo").arg("--count").arg("0").output().unwrap();
    assert_eq!(code(&out), Some(2));
}

#[test]
fn next_id_count_too_large_exit_2() {
    let dir = unique_dir("next-id-large");
    copy_dir(&demo(), &dir);
    let out = dojo().arg("next-id").arg(&dir).arg("geo").arg("--count").arg("501").output().unwrap();
    assert_eq!(code(&out), Some(2));
}

#[test]
fn next_id_invalid_prefix_exit_2() {
    let dir = unique_dir("next-id-bad");
    copy_dir(&demo(), &dir);
    let out = dojo().arg("next-id").arg(&dir).arg("BadPrefix").output().unwrap();
    assert_eq!(code(&out), Some(2));
}

#[test]
fn next_id_prefix_with_underscore_exit_2() {
    let dir = unique_dir("next-id-underscore");
    copy_dir(&demo(), &dir);
    let out = dojo().arg("next-id").arg(&dir).arg("my_prefix").output().unwrap();
    assert_eq!(code(&out), Some(2));
}

#[test]
fn next_id_prefix_with_hyphen_exit_2() {
    let dir = unique_dir("next-id-hyphen");
    copy_dir(&demo(), &dir);
    let out = dojo().arg("next-id").arg(&dir).arg("my-prefix").output().unwrap();
    assert_eq!(code(&out), Some(2));
}

#[test]
fn next_id_prefix_valid_with_numbers() {
    let dir = unique_dir("next-id-nums");
    copy_dir(&demo(), &dir);
    let out = dojo().arg("next-id").arg(&dir).arg("test123").output().unwrap();
    assert_eq!(code(&out), Some(0));
    assert_eq!(stdout(&out).trim(), "test123-1");
}
