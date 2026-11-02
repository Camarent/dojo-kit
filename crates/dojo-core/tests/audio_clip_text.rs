//! Tests for the optional clip `text`, `tr` and `mt` manifest fields.

use dojo_core::content::Course;
use dojo_core::validate::{check_audio_files, Diagnostic};
use std::fs;
use std::path::Path;

type TestResult = Result<(), Box<dyn std::error::Error>>;


fn write_manifest(dir: &Path, rel: &str, text: &str) -> std::io::Result<()> {
    let path = dir.join(rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, text)
}

fn audio_diags(dir: &Path, manifest: &str) -> Result<Vec<Diagnostic>, Box<dyn std::error::Error>> {
    let course = format!(
        r#"{{"id":"c","title":"C","uiLanguage":"en","units":[{{"id":"u","title":"U"}}],"audio":{{"manifest":"{manifest}"}}}}"#
    );
    let course: Course = serde_json::from_str(&course)?;
    Ok(check_audio_files(&course, dir, &None))
}

fn diags_for(m: &str) -> Result<Vec<Diagnostic>, Box<dyn std::error::Error>> {
    static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let n = N.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let dir = std::env::temp_dir().join(format!("dojo-cliptext-{}-{n}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    write_manifest(&dir, "manifest.json", m)?;
    fs::write(dir.join("p.bin"), vec![0u8; 12])?;
    let d = audio_diags(&dir, "manifest.json");
    let _ = fs::remove_dir_all(&dir);
    d
}

fn clip(extra: &str) -> String {
    format!(r#"{{"pack":0,"off":0,"len":1,"ms":1,"mime":"m"{extra}}}"#)
}

fn manifest(clips: &str) -> String {
    format!(r#"{{"v":1,"packs":[{{"file":"p.bin","bytes":12}}],"clips":{{{clips}}}}}"#)
}

fn msgs(extra: &str) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    Ok(diags_for(&manifest(&format!(r#""a":{}"#, clip(extra))))?.into_iter().map(|d| {
        assert_eq!(d.code, "audio_bad_manifest");
        d.message
    }).collect())
}

#[test]
fn valid_text_tr_mt_is_accepted() -> TestResult {
    assert!(msgs(r#","text":"Il est midi","tr":{"ru":"Полдень","en-GB":"Noon"},"mt":true"#)?.is_empty());
    Ok(())
}

#[test]
fn old_manifest_has_no_diagnostics() -> TestResult {
    assert!(msgs("")?.is_empty());
    Ok(())
}

#[test]
fn text_length_counts_characters() -> TestResult {
    assert!(msgs(&format!(r#","text":"{}""#, "é".repeat(400)))?.is_empty());
    let m = msgs(&format!(r#","text":"{}""#, "é".repeat(401)))?;
    assert_eq!(m.len(), 1);
    assert!(m.first().ok_or("no diagnostic")?.contains("text: longer than 400 characters"), "{m:?}");
    Ok(())
}

#[test]
fn cyrillic_400_chars_is_accepted() -> TestResult {
    assert!(msgs(&format!(r#","text":"x","tr":{{"ru":"{}"}}"#, "ж".repeat(400)))?.is_empty());
    assert_eq!(msgs(&format!(r#","text":"x","tr":{{"ru":"{}"}}"#, "ж".repeat(401)))?.len(), 1);
    Ok(())
}

#[test]
fn empty_or_blank_text_is_rejected() -> TestResult {
    assert_eq!(msgs(r#","text":"""#)?.len(), 1);
    assert_eq!(msgs(r#","text":"  ""#)?.len(), 1);
    Ok(())
}

#[test]
fn control_char_is_rejected() -> TestResult {
    assert_eq!(msgs(r#","text":"a\nb""#)?.len(), 1);
    assert_eq!(msgs(r#","text":"a\u007fb""#)?.len(), 1);
    assert_eq!(msgs(r#","text":"x","tr":{"ru":"a\tb"}"#)?.len(), 1);
    Ok(())
}

#[test]
fn bad_tr_keys_are_rejected() -> TestResult {
    assert_eq!(msgs(r#","text":"x","tr":{"RU":"a"}"#)?.len(), 1);
    assert_eq!(msgs(r#","text":"x","tr":{"russian":"a"}"#)?.len(), 1);
    assert_eq!(msgs(r#","text":"x","tr":{"pt-BR":"a","zh-Hant":"b"}"#)?.len(), 0);
    Ok(())
}

#[test]
fn tr_entry_count_is_limited() -> TestResult {
    let nine: Vec<String> = (b'a'..=b'i').map(|c| format!(r#""a{}":"v""#, c as char)).collect();
    assert_eq!(msgs(&format!(r#","text":"x","tr":{{{}}}"#, nine.join(",")))?.len(), 1);
    assert_eq!(msgs(r#","text":"x","tr":{}"#)?.len(), 1);
    Ok(())
}

#[test]
fn tr_without_text_is_rejected() -> TestResult {
    assert_eq!(msgs(r#","tr":{"ru":"a"}"#)?.len(), 1);
    Ok(())
}

#[test]
fn mt_without_tr_is_rejected() -> TestResult {
    assert_eq!(msgs(r#","text":"x","mt":true"#)?.len(), 1);
    assert!(msgs(r#","text":"x","mt":false"#)?.is_empty());
    Ok(())
}

#[test]
fn wrong_type_is_one_parser_error() -> TestResult {
    assert_eq!(msgs(r#","text":5"#)?.len(), 1);
    assert_eq!(msgs(r#","text":"x","tr":"x""#)?.len(), 1);
    Ok(())
}

#[test]
fn diagnostics_follow_clip_id_order() -> TestResult {
    let m = manifest(&format!(r#""b":{},"a":{}"#, clip(r#","text":"""#), clip(r#","mt":true"#)));
    let d: Vec<String> = diags_for(&m)?.into_iter().map(|d| d.message).collect();
    assert_eq!(d.len(), 2);
    assert!(
        d.first().is_some_and(|s| s.contains("'a'")) && d.get(1).is_some_and(|s| s.contains("'b'")),
        "{d:?}"
    );
    Ok(())
}

#[test]
fn bidi_control_code_points_are_rejected_at_range_edges() -> TestResult {
    for cp in ['\u{202A}', '\u{202E}', '\u{2066}', '\u{2069}'] {
        let m = msgs(&format!(r#","text":"a{cp}b""#))?;
        assert_eq!(m.len(), 1, "U+{:04X}", cp as u32);
        assert!(m.first().ok_or("no diagnostic")?.contains("contains a bidi control character"), "{m:?}");
        let m = msgs(&format!(r#","text":"ok","tr":{{"ru":"a{cp}b"}}"#))?;
        assert_eq!(m.len(), 1, "tr U+{:04X}", cp as u32);
    }
    Ok(())
}

#[test]
fn lrm_rlm_alm_marks_are_allowed() -> TestResult {
    for cp in ['\u{200E}', '\u{200F}', '\u{061C}'] {
        assert!(msgs(&format!(r#","text":"a{cp}b""#))?.is_empty(), "U+{:04X}", cp as u32);
        assert!(msgs(&format!(r#","text":"ok","tr":{{"ru":"a{cp}b"}}"#))?.is_empty(), "tr U+{:04X}", cp as u32);
    }
    Ok(())
}

#[test]
fn code_points_next_to_bidi_ranges_and_french_diacritics_pass() -> TestResult {
    assert!(msgs(r#","text":"Où est l'élève ? À l'école, ça va  ⁥⁪""#)?.is_empty());
    assert!(msgs(r#","text":"Où est l'élève ? Ça va très bien""#)?.is_empty());
    Ok(())
}
