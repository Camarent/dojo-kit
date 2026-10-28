// Snapshot tests for validate: byte-equal diagnostics over examples and fixtures.
// discovers every course.json, runs `dojo validate <dir> --json`, compares stdout+exit code.
// UPDATE_SNAPSHOT=1 rewrites snapshots.

use serde_json::Value;
use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

fn dojo() -> Command {
    Command::new(env!("CARGO_BIN_EXE_dojo"))
}

/// Normalise an absolute path to be repo-relative.
fn to_rel(path: &str, repo_root: &Path) -> String {
    let p = Path::new(path);
    if let Ok(canonical) = fs::canonicalize(p)
        && let Ok(stripped) = canonical.strip_prefix(repo_root) {
            return stripped.to_string_lossy().to_string();
        }
    path.to_string()
}

/// Find the repo root by walking up from CARGO_MANIFEST_DIR until we find crates/.
fn repo_root() -> PathBuf {
    let mut cur = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    loop {
        if cur.join("crates").is_dir() {
            return cur;
        }
        if !cur.pop() {
            break;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

/// Discover all directories that contain a course.json under examples/ and crates/*/tests/fixtures/.
fn discover_course_dirs() -> Vec<PathBuf> {
    let root = repo_root();
    let mut out = Vec::new();

    // examples/*/course.json
    let examples = root.join("examples");
    if examples.is_dir() {
        for entry in fs::read_dir(&examples).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            if path.is_dir() && path.join("course.json").is_file() {
                out.push(path);
            }
        }
    }

    // crates/*/tests/fixtures/*/course.json
    let crates = root.join("crates");
    if crates.is_dir() {
        for entry in fs::read_dir(&crates).unwrap() {
            let entry = entry.unwrap();
            let crate_dir = entry.path();
            if crate_dir.is_dir() {
                let tests_fixtures = crate_dir.join("tests/fixtures");
                if tests_fixtures.is_dir() {
                    for entry in fs::read_dir(&tests_fixtures).unwrap() {
                        let entry = entry.unwrap();
                        let path = entry.path();
                        if path.is_dir() && path.join("course.json").is_file() {
                            out.push(path);
                        }
                    }
                }
            }
        }
    }

    out.sort();
    out
}

fn code(out: &Output) -> Option<i32> {
    out.status.code()
}

fn stdout(out: &Output) -> String {
    String::from_utf8(out.stdout.clone()).unwrap()
}

/// Name for snapshot files: replace / with _ and add .txt
fn snapshot_name(dir: &Path, repo_root: &Path) -> String {
    let rel = to_rel(&dir.display().to_string(), repo_root);
    rel.replace(['/', '\\'], "_") + ".txt"
}

/// Check path is relative or normalise it.
fn normalise_output(output: &str, repo_root: &Path) -> String {
    let mut result = output.to_string();
    
    // Replace Windows-style backslashes with forward slashes for consistency
    result = result.replace('\\', "/");
    
    // Replace the repo root path with empty string
    let root_str = repo_root.to_string_lossy().to_string();
    if result.contains(&root_str) {
        result = result.replace(&root_str, "");
    }
    
    result
}

/// Run validate on a course directory and return (exit_code, normalised_stdout)
fn validate_course(dir: &Path) -> (i32, String) {
    let repo = repo_root();
    let mut cmd = dojo();
    cmd.arg("validate");
    cmd.arg(dir);
    cmd.arg("--json");
    
    let out = cmd.output().unwrap();
    let exit_code = code(&out).unwrap_or(2);
    let text = normalise_output(&stdout(&out), &repo);
    (exit_code, text)
}

/// Write a snapshot file.
fn write_snapshot(name: &str, exit_code: i32, output: &str) {
    let snap_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/snapshots/validate");
    fs::create_dir_all(&snap_dir).unwrap();
    let path = snap_dir.join(name);
    let content = format!("exit: {}\noutput:\n{}", exit_code, output);
    fs::write(&path, content).unwrap();
}

/// Read a snapshot file.
fn read_snapshot(name: &str) -> Option<(i32, String)> {
    let snap_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/snapshots/validate");
    let path = snap_dir.join(name);
    if !path.is_file() {
        return None;
    }
    let content = fs::read_to_string(&path).unwrap();
    let (head, output) = content.split_once("\noutput:\n")?;
    let exit_code: i32 = head.trim_start_matches("exit: ").trim().parse().ok()?;
    let output = output.to_string();
    Some((exit_code, output))
}

/// Assert that the output and exit code match the snapshot.
fn assert_snapshot(dir: &Path, expected: (i32, String), actual: (i32, String)) {
    let (expected_exit, expected_out) = expected;
    let (actual_exit, actual_out) = actual;
    
    if expected_exit != actual_exit {
        panic!(
            "exit code mismatch for {}: expected {}, got {}",
            dir.display(),
            expected_exit,
            actual_exit
        );
    }
    
    if expected_out != actual_out {
        panic!(
            "output mismatch for {}:\n\nEXPECTED:\n{}\n\nACTUAL:\n{}",
            dir.display(),
            expected_out,
            actual_out
        );
    }
}

/// Synthetic broken courses that together trigger >= 25 distinct diagnostic codes.
/// We create 4 courses inline, each triggering different error codes.
fn create_synthetic_courses() -> Vec<(String, Vec<u8>)> {
    // Course 1: Basic structural errors (parse_error, no_units, bad_course_id, duplicate_unit, bad_unit_id, bad_plugin_path, bad_pass_mark, pass_mark_ignored)
    let course1 = r#"{
  "id": "bad-id!",
  "title": "Test",
  "types": ["choice"],
  "uiLanguage": "en",
  "passMark": 2.0,
  "plugins": {"scripts": ["/etc/bad.js"]},
  "units": [
    {"id": "a", "title": "A"},
    {"id": "a", "title": "B"},
    {"id": "bad unit id!", "title": "C"}
  ],
  "exam": {"passMark": 1.5}
}"#;
    
    // Content with bad items - also add answer_in_prompt and prompt_too_long
    // Long prompt to trigger prompt_too_long
    let long_prompt = "A".repeat(601);
    let content1 = format!(r#"{{"type":"choice","id":"c-1","unit":"a","prompt":"Q","options":["A"],"answer":0}}
{{"type":"gap","id":"g-1","unit":"a","prompt":"Q","answers":[]}}
{{"type":"card","id":"card-1","unit":"a","prompt":"Q","back":""}}
{{"type":"multi","id":"m-1","unit":"a","prompt":"Q","options":["A","B"],"correct":[]}}
{{"type":"match","id":"ma-1","unit":"a","prompt":"Q","pairs":[]}}
{{"type":"order","id":"o-1","unit":"a","prompt":"Q","steps":[]}}
{{"type":"cloze","id":"cl-1","unit":"a","prompt":"Q","parts":[]}}
{{"type":"numeric","id":"n-1","unit":"a","prompt":"Q","answer":null}}
{{"type":"choice","id":"c-2","unit":"a","prompt":"The answer is the answer","options":["A","The answer"],"answer":1}}
{{"type":"choice","id":"c-3","unit":"a","prompt":"{}","options":["A","B"],"answer":0}}"#, long_prompt);

    // Course 2: ID-related errors (duplicate_id, bad_id, unknown_unit, retired_id_reused)
    let course2 = r#"{
  "id": "course2",
  "title": "Test 2",
  "units": [{"id": "u1", "title": "U1"}]
}"#;
    
    let content2 = r#"{"type":"choice","id":"bad id","unit":"u1","prompt":"Q1","options":["A","B"],"answer":0}
{"type":"choice","id":"dup-1","unit":"u1","prompt":"Q2","options":["A","B"],"answer":0}
{"type":"choice","id":"dup-1","unit":"u1","prompt":"Q3","options":["A","B"],"answer":0}
{"type":"choice","id":"x-1","unit":"unknown","prompt":"Q4","options":["A","B"],"answer":0}"#;

    // Course 3: Item type validation errors (choice_few_options, choice_answer_out_of_range, choice_duplicate_options, multi_few_options, multi_bad_correct, gap_no_answers, gap_empty_answer)
    let course3 = r#"{
  "id": "course3",
  "title": "Test 3",
  "units": [{"id": "u3", "title": "U3"}]
}"#;
    
    let content3 = r#"{"type":"choice","id":"c-1","unit":"u3","prompt":"Q","options":["A"],"answer":0}
{"type":"choice","id":"c-2","unit":"u3","prompt":"Q","options":["A","B"],"answer":5}
{"type":"choice","id":"c-3","unit":"u3","prompt":"Q","options":["A","A"],"answer":0}
{"type":"multi","id":"m-1","unit":"u3","prompt":"Q","options":["A","B"],"correct":[0]}
{"type":"multi","id":"m-2","unit":"u3","prompt":"Q","options":["A","B","C"],"correct":[0,1,2]}
{"type":"gap","id":"g-1","unit":"u3","prompt":"Q","answers":[]}
{"type":"gap","id":"g-2","unit":"u3","prompt":"Q","answers":["  "]}
{"type":"match","id":"ma-1","unit":"u3","prompt":"Q","pairs":[{"left":"A","right":"1"},{"left":"A","right":"2"}]}
{"type":"match","id":"ma-2","unit":"u3","prompt":"Q","pairs":[{"left":"A","right":"B"},{"left":"C","right":"B"}]}
{"type":"order","id":"o-1","unit":"u3","prompt":"Q","steps":["A"]}
{"type":"order","id":"o-2","unit":"u3","prompt":"Q","steps":["A","A"]}
{"type":"cloze","id":"cl-1","unit":"u3","prompt":"Q","parts":[{"Text":"text"}]}
{"type":"cloze","id":"cl-2","unit":"u3","prompt":"Q","parts":[{"Text":"a"},{"Blank":[]},{"Text":"b"},{"Blank":[]},{"Text":"c"},{"Blank":[]},{"Text":"d"},{"Blank":[]},{"Text":"e"},{"Blank":[]},{"Text":"f"},{"Blank":[]},{"Text":"g"}]}
{"type":"numeric","id":"n-1","unit":"u3","prompt":"Q","answer":1.0,"tolerance":-1.0}
{"type":"numeric","id":"n-2","unit":"u3","prompt":"Q","answer":1.0,"tolerance":Infinity}"#;

    // Course 4: More validation errors (type_not_enabled, empty_prompt, card_empty_back, bad_ladder, bad_drop, bad_drill, bad_placement, bad_learned_stage, bad_exam, no_units)
    let course4 = r#"{
  "id": "course4",
  "title": "Test 4",
  "types": ["choice"],
  "units": [{"id": "u4", "title": "U4"}],
  "srs": {"drill": 0, "dropOnWrong": 20, "ladder": [1, 2]},
  "placement": {"perUnit": 0, "mode": "bad"},
  "learnedStage": 0,
  "exam": {"passMark": 2.0, "sections": [{"title": "S1", "count": 0, "units": ["unknown_unit"]}], "timing": [{"minutes": 0, "sections": []}]}
}"#;
    
    let content4 = r#"{"type":"gap","id":"g-1","unit":"u4","prompt":"","answers":["A"]}
{"type":"card","id":"card-1","unit":"u4","prompt":"Q","back":""}
{"type":"multi","id":"m-1","unit":"u4","prompt":"Q","options":["A","B","C"],"correct":[0,1]}
{"type":"match","id":"ma-1","unit":"u4","prompt":"Q","pairs":[{"left":"A","right":"1"},{"left":"B","right":"2"},{"left":"C","right":"3"},{"left":"D","right":"4"},{"left":"E","right":"5"},{"left":"F","right":"6"},{"left":"G","right":"7"},{"left":"H","right":"8"}]}
{"type":"order","id":"o-1","unit":"u4","prompt":"Q","steps":["A","B","C","D","E","F","G","H","I","J","K"]}
{"type":"cloze","id":"cl-1","unit":"u4","prompt":"Q","parts":[{"Text":"a"},{"Blank":["x"]},{"Text":"b"},{"Blank":["y"]},{"Text":"c"},{"Blank":["z"]},{"Text":"d"},{"Blank":["w"]},{"Text":"e"}]}
{"type":"numeric","id":"n-1","unit":"u4","prompt":"Q","answer":1.0,"tolerance":-1.0}"#;

    // Lock file with retired ids
    let lock_content = r#"{"v":1,"ids":["x-1"],"retired":["dup-1"]}"#;

    vec![
        ("synthetic-1".to_string(), course1.as_bytes().to_vec()),
        ("synthetic-1-content".to_string(), content1.as_bytes().to_vec()),
        ("synthetic-1-lock".to_string(), lock_content.as_bytes().to_vec()),
        ("synthetic-2".to_string(), course2.as_bytes().to_vec()),
        ("synthetic-2-content".to_string(), content2.as_bytes().to_vec()),
        ("synthetic-3".to_string(), course3.as_bytes().to_vec()),
        ("synthetic-3-content".to_string(), content3.as_bytes().to_vec()),
        ("synthetic-4".to_string(), course4.as_bytes().to_vec()),
        ("synthetic-4-content".to_string(), content4.as_bytes().to_vec()),
    ]
}

/// Create a temporary course directory with the given files.
fn create_temp_course(tag: &str, files: &[(String, Vec<u8>)]) -> PathBuf {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "dojo-snapshot-{tag}-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::SeqCst)
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    
    for (name, content) in files {
        let path = dir.join(name);
        if name.ends_with("/") || name.contains("/") {
            // Handle as path
            let path = dir.join(name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(&path, content).unwrap();
        } else {
            fs::write(&path, content).unwrap();
        }
    }
    
    dir
}

/// Extract diagnostic codes from JSON output.
fn extract_codes(output: &str) -> BTreeSet<String> {
    let mut codes = BTreeSet::new();
    if let Ok(v) = serde_json::from_str::<Value>(output)
        && let Some(diags) = v.get("diagnostics").and_then(|d| d.as_array()) {
            for d in diags {
                if let Some(code) = d.get("code").and_then(|c| c.as_str()) {
                    codes.insert(code.to_string());
                }
            }
        }
    codes
}

/// Test all discovered course directories.
#[test]
fn test_all_course_dirs() {
    let dirs = discover_course_dirs();
    assert!(!dirs.is_empty(), "no course directories found");
    
    let repo = repo_root();
    let update = env::var("UPDATE_SNAPSHOT").is_ok();
    
    for dir in &dirs {
        let snap_name = snapshot_name(dir, &repo);
        let (actual_exit, actual_out) = validate_course(dir);
        
        if update {
            write_snapshot(&snap_name, actual_exit, &actual_out);
        } else {
            let expected = read_snapshot(&snap_name).unwrap_or_else(|| panic!("missing snapshot for {} (run with UPDATE_SNAPSHOT=1 to create)",
                dir.display()));
            assert_snapshot(dir, expected, (actual_exit, actual_out));
        }
    }
}

/// Test synthetic broken courses that trigger >= 25 distinct codes.
#[test]
fn test_synthetic_courses() {
    let repo = repo_root();
    let update = env::var("UPDATE_SNAPSHOT").is_ok();
    
    let files = create_synthetic_courses();
    
    // We have 4 courses, each needs to be set up properly
    // Course 1: course1 + content1 + lock
    let course1_files = vec![
        ("course.json".to_string(), files[0].1.clone()),
        ("content/u.jsonl".to_string(), files[1].1.clone()),
        ("ids.lock".to_string(), files[2].1.clone()),
    ];
    let dir1 = create_temp_course("synth1", &course1_files);
    let (exit1, out1) = validate_course(&dir1);
    let codes1 = extract_codes(&out1);
    
    // Course 2: course2 + content2
    let course2_files = vec![
        ("course.json".to_string(), files[3].1.clone()),
        ("content/u.jsonl".to_string(), files[4].1.clone()),
    ];
    let dir2 = create_temp_course("synth2", &course2_files);
    let (exit2, out2) = validate_course(&dir2);
    let codes2 = extract_codes(&out2);
    
    // Course 3: course3 + content3
    let course3_files = vec![
        ("course.json".to_string(), files[5].1.clone()),
        ("content/u.jsonl".to_string(), files[6].1.clone()),
    ];
    let dir3 = create_temp_course("synth3", &course3_files);
    let (exit3, out3) = validate_course(&dir3);
    let codes3 = extract_codes(&out3);
    
    // Course 4: course4 + content4
    let course4_files = vec![
        ("course.json".to_string(), files[7].1.clone()),
        ("content/u.jsonl".to_string(), files[8].1.clone()),
    ];
    let dir4 = create_temp_course("synth4", &course4_files);
    let (exit4, out4) = validate_course(&dir4);
    let codes4 = extract_codes(&out4);
    
    // Collect all codes
    let all_codes: BTreeSet<String> = codes1.into_iter()
        .chain(codes2)
        .chain(codes3)
        .chain(codes4)
        .collect();
    
    // Assert we have >= 25 distinct codes
    assert!(
        all_codes.len() >= 25,
        "synthetic courses trigger only {} distinct codes, need >= 25. Codes: {:?}",
        all_codes.len(),
        all_codes
    );
    
    // Snapshot each synthetic course
    if update {
        write_snapshot("synthetic-1.txt", exit1, &normalise_output(&out1, &repo));
        write_snapshot("synthetic-2.txt", exit2, &normalise_output(&out2, &repo));
        write_snapshot("synthetic-3.txt", exit3, &normalise_output(&out3, &repo));
        write_snapshot("synthetic-4.txt", exit4, &normalise_output(&out4, &repo));
    } else {
        for (i, (exit, out, dir)) in [
            (exit1, out1, dir1),
            (exit2, out2, dir2),
            (exit3, out3, dir3),
            (exit4, out4, dir4),
        ].iter().enumerate() {
            let snap_name = format!("synthetic-{}.txt", i + 1);
            let expected = read_snapshot(&snap_name).unwrap_or_else(|| panic!("missing snapshot for synthetic-{}.txt (run with UPDATE_SNAPSHOT=1 to create)",
                i + 1));
            let normalised = normalise_output(out, &repo);
            assert_snapshot(dir, expected, (*exit, normalised));
        }
    }
}

/// Test that all discovered directories are covered.
#[test]
fn test_coverage_report() {
    let update = env::var("UPDATE_SNAPSHOT").is_ok();
    if update {
        return; // Skip coverage check when updating snapshots
    }
    
    let dirs = discover_course_dirs();
    let repo = repo_root();
    let mut covered = Vec::new();
    
    // Check real fixtures
    for dir in &dirs {
        let snap_name = snapshot_name(dir, &repo);
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/snapshots/validate")
            .join(&snap_name);
        if path.is_file() {
            covered.push(dir.display().to_string());
        }
    }
    
    // Check synthetic snapshots
    let synthetic_count = [
        "synthetic-1.txt",
        "synthetic-2.txt", 
        "synthetic-3.txt",
        "synthetic-4.txt",
    ].iter().filter(|name| {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/snapshots/validate")
            .join(name);
        path.is_file()
    }).count();
    
    assert_eq!(covered.len(), dirs.len(), 
        "coverage: {} of {} real course dirs have snapshots\nMissing: {:?}",
        covered.len(), dirs.len(),
        dirs.iter().filter(|d| !covered.contains(&d.display().to_string())).collect::<Vec<_>>()
    );
    assert_eq!(synthetic_count, 4, "expect 4 synthetic snapshots");
}
