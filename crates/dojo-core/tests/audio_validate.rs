//! Tests for audio, timer, and srs.mode validation.

use dojo_core::content::{Course, Unit};
use dojo_core::validate::{check_audio_files, Diagnostic, Severity, SourceFile};
use std::fs;
use std::path::Path;

mod common;
use common::*;

/// Minimal valid item
const BASE_ITEM: &str = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["a","b"],"answer":0}"#;

fn make_course(extra: &str) -> Course {
    let json = format!(r#"{{"id":"c","title":"C","uiLanguage":"en","units":[{{"id":"u","title":"U"}}],{}}}"#, extra);
    serde_json::from_str(&json).unwrap()
}

fn make_unit() -> Unit {
    Unit {
        id: "u".to_string(),
        title: "U".to_string(),
        new_per_day: None,
        srs: None,
        placement: None,
        new_order: None,
        exam_only: None,
        detail: None,
        timer: None,
    }
}

// ============================================================================
// Timer validation tests
// ============================================================================

#[test]
fn timer_base_ms_too_low() {
    let c = with_course(r#""timer":{"baseMs":1999}"#);
    let d = run(&c, &[BASE_ITEM]);
    assert!(d.iter().any(|d| d.code == "bad_timer"), "bad_timer not in {d:?}");
}

#[test]
fn timer_base_ms_too_high() {
    let c = with_course(r#""timer":{"baseMs":30001}"#);
    let d = run(&c, &[BASE_ITEM]);
    assert!(d.iter().any(|d| d.code == "bad_timer"), "bad_timer not in {d:?}");
}

#[test]
fn timer_replays_too_high() {
    let c = with_course(r#""timer":{"replays":4}"#);
    let d = run(&c, &[BASE_ITEM]);
    assert!(d.iter().any(|d| d.code == "bad_timer"), "bad_timer not in {d:?}");
}

#[test]
fn timer_valid() {
    let c = with_course(r#""timer":{"baseMs":5000,"replays":2}"#);
    let d = run(&c, &[BASE_ITEM]);
    assert!(!d.iter().any(|d| d.code == "bad_timer"), "unexpected bad_timer in {d:?}");
}

#[test]
fn timer_default_valid() {
    let c = with_course(r#""timer":{}"#);
    let d = run(&c, &[BASE_ITEM]);
    assert!(!d.iter().any(|d| d.code == "bad_timer"), "unexpected bad_timer in {d:?}");
}

// ============================================================================
// Mode by type validation tests
// ============================================================================

#[test]
fn mode_by_type_in_srs_by_type() {
    let c = with_course(r#""srsByType":{"choice":{"mode":"errorWeighted"}}"#);
    let d = run(&c, &[BASE_ITEM]);
    assert!(d.iter().any(|d| d.code == "mode_by_type"), "mode_by_type not in {d:?}");
}

#[test]
fn mode_in_srs_valid() {
    let c = with_course(r#""srs":{"mode":"errorWeighted"}"#);
    let d = run(&c, &[BASE_ITEM]);
    assert!(!d.iter().any(|d| d.code == "mode_by_type"), "unexpected mode_by_type in {d:?}");
}

// ============================================================================
// Round-trip test: course without new fields validates unchanged
// ============================================================================

#[test]
fn round_trip_demo_course() {
    let course_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/demo/course.json");
    let text = std::fs::read_to_string(course_path).expect("Failed to read demo course");
    let course: Course = serde_json::from_str(&text).unwrap();
    let out = serde_json::to_value(&course).unwrap();
    let orig: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(out, orig, "demo course must re-serialise unchanged");
}

#[test]
fn stimulus_without_audio_serialises_unchanged() {
    let text = r#"{"id":"s1","text":"Test"}"#;
    let st: dojo_core::content::Stimulus = serde_json::from_str(text).unwrap();
    assert_eq!(serde_json::to_string(&st).unwrap(), text);
}

// ============================================================================
// Audio file validation tests (require file I/O)
// ============================================================================

/// Creates a temporary directory for testing
fn create_temp_dir() -> (std::path::PathBuf, impl Drop) {
    static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let n = N.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let base = std::env::temp_dir().join(format!("dojo-audio-test-{}-{}", std::process::id(), n));
    let path = base.join("test");
    let _ = fs::remove_dir_all(&path);
    fs::create_dir_all(&path).unwrap();
    
    struct Cleanup(std::path::PathBuf);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    
    (path, Cleanup(base))
}

fn make_course_with_audio(manifest_path: &str) -> Course {
    Course {
        id: "test".to_string(),
        title: "Test".to_string(),
        ui_language: "en".to_string(),
        content_language: None,
        units: vec![make_unit()],
        types: None,
        srs: None,
        srs_by_type: None,
        exam: None,
        exams: vec![],
        storage: None,
        plugins: None,
        markup: None,
        input_script: None,
        captions: None,
        ruby: None,
        normalize: None,
        speech: None,
        placement: None,
        new_order: None,
        scripts: vec![],
        allow_override: None,
        intro_new: None,
        dont_know: None,
        learned_stage: None,
        groups: vec![],
        bars: vec![],
        tag_labels: None,
        detail: None,
        breakdown: None,
        audio: Some(dojo_core::content::AudioConfig {
            manifest: manifest_path.to_string(),
            base: None,
        }),
        timer: None,
        confusions: None,
    }
}

#[test]
fn audio_without_manifest_path() {
    let course = make_course_with_audio("");
    
    let (temp_dir, _cleanup) = create_temp_dir();
    let d = check_audio_files(&course, &temp_dir, &None);
    
    assert!(d.iter().any(|d| d.code == "audio_without_manifest"), "audio_without_manifest not in {d:?}");
}

#[test]
fn audio_manifest_file_missing() {
    let course = make_course_with_audio("audio/manifest.json");
    
    let (temp_dir, _cleanup) = create_temp_dir();
    let d = check_audio_files(&course, &temp_dir, &None);
    
    assert!(d.iter().any(|d| d.code == "audio_manifest_missing"), "audio_manifest_missing not in {d:?}");
}

#[test]
fn audio_unknown_clip() {
    // Create a temp dir with a good manifest
    let (temp_dir, _cleanup) = create_temp_dir();
    let manifest_path = temp_dir.join("manifest.json");
    fs::write(&manifest_path, r#"{"v":1,"packs":[{"file":"p.bin","bytes":100,"enc":"raw"}],"clips":{}}"#).unwrap();
    
    // Create a pack file with the right size
    let pack_path = temp_dir.join("p.bin");
    fs::write(&pack_path, vec![0u8; 100]).unwrap();
    
    // Create a course with audio config
    let course = make_course_with_audio("manifest.json");
    
    // Create a stimuli source file with a clip that's not in the manifest
    let stimuli = Some(SourceFile {
        name: "stimuli.jsonl".to_string(),
        text: r#"{"id":"s1","text":"Test","audio":["unknown-clip"]}"#.to_string(),
    });
    
    let d = check_audio_files(&course, &temp_dir, &stimuli);
    
    assert!(d.iter().any(|d| d.code == "audio_unknown_clip"), "audio_unknown_clip not in {d:?}");
}

#[test]
fn audio_pack_missing() {
    // Create a temp dir with a manifest referencing a missing pack
    let (temp_dir, _cleanup) = create_temp_dir();
    let manifest_path = temp_dir.join("manifest.json");
    fs::write(&manifest_path, r#"{"v":1,"packs":[{"file":"missing.bin","bytes":100,"enc":"raw"}],"clips":{}}"#).unwrap();
    
    let course = make_course_with_audio("manifest.json");
    
    let d = check_audio_files(&course, &temp_dir, &None);
    
    assert!(d.iter().any(|d| d.code == "audio_pack_missing"), "audio_pack_missing not in {d:?}");
}

#[test]
fn audio_pack_mismatch() {
    // Create a temp dir with a manifest and a pack file with wrong size
    let (temp_dir, _cleanup) = create_temp_dir();
    let manifest_path = temp_dir.join("manifest.json");
    fs::write(&manifest_path, r#"{"v":1,"packs":[{"file":"p.bin","bytes":100,"enc":"raw"}],"clips":{}}"#).unwrap();
    
    // Create pack with different size
    let pack_path = temp_dir.join("p.bin");
    fs::write(&pack_path, vec![0u8; 50]).unwrap();
    
    let course = make_course_with_audio("manifest.json");
    
    let d = check_audio_files(&course, &temp_dir, &None);
    
    assert!(d.iter().any(|d| d.code == "audio_pack_mismatch"), "audio_pack_mismatch not in {d:?}");
}

#[test]
fn audio_good_course_no_errors() {
    // Create a complete valid setup
    let (temp_dir, _cleanup) = create_temp_dir();
    
    // Create manifest
    let manifest_path = temp_dir.join("manifest.json");
    fs::write(&manifest_path, r#"{"v":1,"packs":[{"file":"p.bin","bytes":100,"enc":"raw"}],"clips":{"clip-1":{"pack":0,"off":0,"len":100,"ms":1000,"mime":"audio/mp3"}}}"#).unwrap();
    
    // Create pack with correct size
    let pack_path = temp_dir.join("p.bin");
    fs::write(&pack_path, vec![0u8; 100]).unwrap();
    
    let course = make_course_with_audio("manifest.json");
    
    // Create stimuli with a valid clip reference
    let stimuli = Some(SourceFile {
        name: "stimuli.jsonl".to_string(),
        text: r#"{"id":"s1","text":"Test","audio":["clip-1"]}"#.to_string(),
    });
    
    let d = check_audio_files(&course, &temp_dir, &stimuli);
    
    // Should have no errors (may have warnings but we check errors only)
    let errors: Vec<_> = d.iter().filter(|d| d.severity == Severity::Error).collect();
    assert_eq!(errors.len(), 0, "unexpected errors: {errors:?}");
}

#[test]
fn audio_bad_manifest_version() {
    let (temp_dir, _cleanup) = create_temp_dir();
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/audio/bad_version_manifest.json");
    fs::copy(fixture, temp_dir.join("manifest.json")).unwrap();
    fs::write(temp_dir.join("p.bin"), vec![0u8; 100]).unwrap();
    let course = make_course_with_audio("manifest.json");
    let d = check_audio_files(&course, &temp_dir, &None);
    assert_eq!(d.len(), 1, "{d:?}");
    assert!(d[0].code == "audio_bad_manifest" && d[0].message.contains("version"), "{d:?}");
}

#[test]
fn check_audio_files_does_not_repeat_pure_checks() {
    let (temp_dir, _cleanup) = create_temp_dir();
    let course = make_course(r#""timer":{"baseMs":100},"srsByType":{"choice":{"mode":"errorWeighted"}}"#);
    let d = check_audio_files(&course, &temp_dir, &None);
    assert!(d.is_empty(), "{d:?}");
    let all = run(&with_course(r#""timer":{"baseMs":100},"srsByType":{"choice":{"mode":"errorWeighted"}}"#), &[BASE_ITEM]);
    assert_eq!(all.iter().filter(|d| d.code == "bad_timer").count(), 1, "{all:?}");
    assert_eq!(all.iter().filter(|d| d.code == "mode_by_type").count(), 1, "{all:?}");
}

#[test]
fn audio_bad_clip_id() {
    let (temp_dir, _cleanup) = create_temp_dir();
    fs::write(temp_dir.join("manifest.json"), r#"{"v":1,"packs":[{"file":"p.bin","bytes":10}],"clips":{"Bad_ID":{"pack":0,"off":0,"len":10,"ms":1,"mime":"audio/mp3"}}}"#).unwrap();
    fs::write(temp_dir.join("p.bin"), vec![0u8; 10]).unwrap();
    let d = check_audio_files(&make_course_with_audio("manifest.json"), &temp_dir, &None);
    assert!(d.iter().any(|d| d.code == "audio_bad_manifest" && d.message.contains("Bad_ID")), "{d:?}");
}

#[test]
fn audio_stimulus_clip_count() {
    let (temp_dir, _cleanup) = create_temp_dir();
    let many: Vec<String> = (0..33).map(|i| format!("\"c{i}\"")).collect();
    for list in ["[]".to_string(), format!("[{}]", many.join(","))] {
        let stim = Some(SourceFile { name: "stimuli.jsonl".into(), text: format!(r#"{{"id":"s1","text":"T","audio":{list}}}"#) });
        let course = make_course(r#""confusions":true"#);
        let d = check_audio_files(&course, &temp_dir, &stim);
        assert!(d.iter().any(|d| d.code == "audio_bad_stimulus"), "{list}: {d:?}");
    }
}

#[test]
fn audio_manifest_path_escape() {
    let (temp_dir, _cleanup) = create_temp_dir();
    for m in ["../manifest.json", "/etc/passwd", "a/../../m.json"] {
        let d = check_audio_files(&make_course_with_audio(m), &temp_dir, &None);
        assert!(d.iter().any(|d| d.code == "audio_path_escape"), "{m}: {d:?}");
    }
}

#[test]
fn audio_pack_path_escape() {
    let (temp_dir, _cleanup) = create_temp_dir();
    fs::write(temp_dir.join("manifest.json"), r#"{"v":1,"packs":[{"file":"../p.bin","bytes":10}],"clips":{}}"#).unwrap();
    let d = check_audio_files(&make_course_with_audio("manifest.json"), &temp_dir, &None);
    assert!(d.iter().any(|d| d.code == "audio_bad_manifest"), "{d:?}");
}

#[test]
fn audio_bad_manifest_not_json() {
    let (temp_dir, _cleanup) = create_temp_dir();
    fs::write(temp_dir.join("manifest.json"), "{nope").unwrap();
    let course = make_course_with_audio("manifest.json");
    let d = check_audio_files(&course, &temp_dir, &None);
    assert!(d.iter().any(|d| d.code == "audio_bad_manifest"), "audio_bad_manifest not in {d:?}");
}

// ============================================================================
// Contract 12.1 / 12.2 / 12.4 details
// ============================================================================

fn write_manifest(dir: &Path, rel: &str, text: &str) {
    let path = dir.join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

fn audio_diags(dir: &Path, manifest: &str, stim: Option<&str>) -> Vec<Diagnostic> {
    let stimuli = stim.map(|t| SourceFile { name: "stimuli.jsonl".into(), text: t.to_string() });
    check_audio_files(&make_course_with_audio(manifest), dir, &stimuli)
}

fn triples(d: &[Diagnostic]) -> Vec<(&'static str, String, usize)> {
    d.iter().map(|d| (d.code, d.file.clone(), d.line)).collect()
}

const ONE_PACK: &str = r#"{"v":1,"packs":[{"file":"pack-00.bin","bytes":100}],"clips":{"a":{"pack":0,"off":0,"len":100,"ms":1,"mime":"audio/mp3"}}}"#;

#[test]
fn pack_resolved_against_manifest_dir() {
    let (dir, _c) = create_temp_dir();
    write_manifest(&dir, "audio/manifest.json", ONE_PACK);
    fs::write(dir.join("audio/pack-00.bin"), vec![0u8; 100]).unwrap();
    assert!(audio_diags(&dir, "audio/manifest.json", None).is_empty());
}

#[test]
fn pack_in_course_root_is_missing_for_subdir_manifest() {
    let (dir, _c) = create_temp_dir();
    write_manifest(&dir, "audio/manifest.json", ONE_PACK);
    fs::write(dir.join("pack-00.bin"), vec![0u8; 100]).unwrap();
    let d = audio_diags(&dir, "audio/manifest.json", None);
    assert_eq!(triples(&d), vec![("audio_pack_missing", "audio/manifest.json".to_string(), 0)]);
}

#[test]
fn pack_file_with_separator_is_bad_manifest() {
    let (dir, _c) = create_temp_dir();
    let m = ONE_PACK.replace("pack-00.bin", "audio/p.bin");
    write_manifest(&dir, "manifest.json", &m);
    let d = audio_diags(&dir, "manifest.json", None);
    assert_eq!(triples(&d), vec![("audio_bad_manifest", "manifest.json".to_string(), 0)]);
}

const STIMS_NO_AUDIO_CFG: &str = "{\"id\":\"s1\",\"text\":\"T\",\"audio\":[\"a\"]}\n{\"id\":\"s2\",\"text\":\"T\",\"audio\":[\"a\"]}\n{\"id\":\"s3\",\"text\":\"T\"}";

#[test]
fn stimulus_audio_without_course_audio() {
    let (dir, _c) = create_temp_dir();
    let stim = Some(SourceFile { name: "stimuli.jsonl".into(), text: STIMS_NO_AUDIO_CFG.into() });
    let d = check_audio_files(&make_course(r#""confusions":true"#), &dir, &stim);
    assert_eq!(
        triples(&d),
        vec![
            ("audio_without_manifest", "stimuli.jsonl".to_string(), 1),
            ("audio_without_manifest", "stimuli.jsonl".to_string(), 2)
        ]
    );
    let plain = Some(SourceFile { name: "stimuli.jsonl".into(), text: r#"{"id":"s","text":"T"}"#.into() });
    assert!(check_audio_files(&make_course(r#""confusions":true"#), &dir, &plain).is_empty());
}

#[test]
fn stimulus_duplicate_clip_ids() {
    let (dir, _c) = create_temp_dir();
    write_manifest(&dir, "manifest.json", ONE_PACK);
    fs::write(dir.join("pack-00.bin"), vec![0u8; 100]).unwrap();
    let d = audio_diags(&dir, "manifest.json", Some(r#"{"id":"s","text":"T","audio":["a","a"]}"#));
    assert_eq!(triples(&d), vec![("audio_bad_stimulus", "stimuli.jsonl".to_string(), 1)]);
}

#[test]
fn diagnostics_have_contract_order_and_are_repeatable() {
    let (dir, _c) = create_temp_dir();
    let m = r#"{"v":1,"packs":[{"file":"p0.bin","bytes":10},{"file":"p1.bin","bytes":10}],"clips":{"zz":{"pack":5,"off":0,"len":1,"ms":1,"mime":"m"},"aa":{"pack":0,"off":0,"len":0,"ms":1,"mime":"m"}}}"#;
    write_manifest(&dir, "manifest.json", m);
    fs::write(dir.join("p1.bin"), vec![0u8; 3]).unwrap();
    let stims = "{\"id\":\"s1\",\"text\":\"T\",\"audio\":[\"q\",\"p\",\"q\"]}\n{\"id\":\"s2\",\"text\":\"T\",\"audio\":[\"aa\",\"r\"]}";
    let d = audio_diags(&dir, "manifest.json", Some(stims));
    let mf = "manifest.json".to_string();
    let st = "stimuli.jsonl".to_string();
    let expected = vec![
        ("audio_bad_manifest", mf.clone(), 0),
        ("audio_bad_manifest", mf.clone(), 0),
        ("audio_pack_missing", mf.clone(), 0),
        ("audio_pack_mismatch", mf.clone(), 0),
        ("audio_bad_stimulus", st.clone(), 1),
        ("audio_unknown_clip", st.clone(), 1),
        ("audio_unknown_clip", st.clone(), 1),
        ("audio_unknown_clip", st.clone(), 2),
    ];
    assert_eq!(triples(&d), expected);
    assert!(d[0].message.contains("'aa'") && d[1].message.contains("'zz'"), "{d:?}");
    assert!(d[5].message.contains("'q'") && d[6].message.contains("'p'"), "{d:?}");
    assert_eq!(triples(&audio_diags(&dir, "manifest.json", Some(stims))), expected);
}

fn manifest_with_clip(pack: &str, clip: &str) -> String {
    format!(r#"{{"v":1,"packs":[{pack}],"clips":{{"a":{clip}}}}}"#)
}

fn bad_manifest_count(m: &str) -> usize {
    let (dir, _c) = create_temp_dir();
    write_manifest(&dir, "manifest.json", m);
    fs::write(dir.join("p.bin"), vec![0u8; 12]).unwrap();
    audio_diags(&dir, "manifest.json", None).iter().filter(|d| d.code == "audio_bad_manifest").count()
}

#[test]
fn clip_pack_index_out_of_range() {
    let m = manifest_with_clip(r#"{"file":"p.bin","bytes":12}"#, r#"{"pack":1,"off":0,"len":1,"ms":1,"mime":"m"}"#);
    assert_eq!(bad_manifest_count(&m), 1);
}

#[test]
fn clip_len_zero() {
    let m = manifest_with_clip(r#"{"file":"p.bin","bytes":12}"#, r#"{"pack":0,"off":0,"len":0,"ms":1,"mime":"m"}"#);
    assert_eq!(bad_manifest_count(&m), 1);
}

#[test]
fn clip_raw_range_overflow_and_bound() {
    let pack = r#"{"file":"p.bin","bytes":12}"#;
    let over = manifest_with_clip(pack, r#"{"pack":0,"off":10,"len":3,"ms":1,"mime":"m"}"#);
    assert_eq!(bad_manifest_count(&over), 1);
    let wrap = manifest_with_clip(pack, r#"{"pack":0,"off":18446744073709551615,"len":2,"ms":1,"mime":"m"}"#);
    assert_eq!(bad_manifest_count(&wrap), 1);
    let exact = manifest_with_clip(pack, r#"{"pack":0,"off":10,"len":2,"ms":1,"mime":"m"}"#);
    assert_eq!(bad_manifest_count(&exact), 0);
}

#[test]
fn clip_base64_range_bound() {
    let pack = r#"{"file":"p.bin","bytes":12,"enc":"base64"}"#;
    let exact = manifest_with_clip(pack, r#"{"pack":0,"off":4,"len":5,"ms":1,"mime":"m"}"#);
    assert_eq!(bad_manifest_count(&exact), 0);
    let over = manifest_with_clip(pack, r#"{"pack":0,"off":4,"len":6,"ms":1,"mime":"m"}"#);
    assert_eq!(bad_manifest_count(&over), 1);
}

#[test]
fn manifest_unknown_fields_are_ignored() {
    let m = r#"{"v":1,"x":1,"packs":[{"file":"p.bin","bytes":12,"x":1}],"clips":{"a":{"pack":0,"off":0,"len":1,"ms":1,"mime":"m","x":1}}}"#;
    assert_eq!(bad_manifest_count(m), 0);
}

#[test]
fn manifest_wrong_type_names_parser_error() {
    let (dir, _c) = create_temp_dir();
    write_manifest(&dir, "manifest.json", r#"{"v":1,"packs":[{"file":"p.bin","bytes":"12"}],"clips":{}}"#);
    let d = audio_diags(&dir, "manifest.json", None);
    assert_eq!(d.len(), 1, "{d:?}");
    assert!(d[0].code == "audio_bad_manifest" && d[0].message.contains("invalid type"), "{d:?}");
}

#[test]
fn srs_mode_is_an_enum() {
    let err = serde_json::from_str::<Course>(&with_course(r#""srs":{"mode":"errorweighted"}"#)).unwrap_err();
    assert!(err.to_string().contains("unknown variant"), "{err}");
    let c: Course = serde_json::from_str(&with_course(r#""srs":{"mode":"ladder"}"#)).unwrap();
    assert!(serde_json::to_string(&c).unwrap().contains(r#""mode":"ladder""#));
}

#[test]
fn srs_mode_unknown_value_is_parse_error_in_validate() {
    let d = run(&with_course(r#""srs":{"mode":"errorweighted"}"#), &[BASE_ITEM]);
    assert!(d.iter().any(|d| d.code == "parse_error" && d.file == "course.json" && d.message.contains("unknown variant")), "{d:?}");
}

#[test]
fn timer_defaults_are_materialised() {
    let c = make_course(r#""timer":{"baseMs":8000}"#);
    let v = serde_json::to_value(&c).unwrap();
    assert_eq!(v["timer"], serde_json::json!({"baseMs":8000,"adaptive":true,"replays":1}));
}

#[test]
fn empty_manifest_path_still_checks_stimulus_lists() {
    let (dir, _c) = create_temp_dir();
    let d = audio_diags(&dir, "", Some(r#"{"id":"s","text":"T","audio":["a","a"]}"#));
    assert_eq!(
        triples(&d),
        vec![("audio_without_manifest", "course.json".to_string(), 0), ("audio_bad_stimulus", "stimuli.jsonl".to_string(), 1)]
    );
}
