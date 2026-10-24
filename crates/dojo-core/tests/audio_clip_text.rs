//! Tests for the optional clip `text`, `tr` and `mt` manifest fields.

use dojo_core::content::Course;
use dojo_core::validate::{check_audio_files, Diagnostic};
use std::fs;
use std::path::Path;


fn write_manifest(dir: &Path, rel: &str, text: &str) {
    let path = dir.join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

fn audio_diags(dir: &Path, manifest: &str) -> Vec<Diagnostic> {
    let course = format!(
        r#"{{"id":"c","title":"C","uiLanguage":"en","units":[{{"id":"u","title":"U"}}],"audio":{{"manifest":"{manifest}"}}}}"#
    );
    let course: Course = serde_json::from_str(&course).unwrap();
    check_audio_files(&course, dir, &None)
}

fn diags_for(m: &str) -> Vec<Diagnostic> {
    static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let n = N.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let dir = std::env::temp_dir().join(format!("dojo-cliptext-{}-{n}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    write_manifest(&dir, "manifest.json", m);
    fs::write(dir.join("p.bin"), vec![0u8; 12]).unwrap();
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

fn msgs(extra: &str) -> Vec<String> {
    diags_for(&manifest(&format!(r#""a":{}"#, clip(extra)))).into_iter().map(|d| {
        assert_eq!(d.code, "audio_bad_manifest");
        d.message
    }).collect()
}

#[test]
fn valid_text_tr_mt_is_accepted() {
    assert!(msgs(r#","text":"Il est midi","tr":{"ru":"Полдень","en-GB":"Noon"},"mt":true"#).is_empty());
}

#[test]
fn old_manifest_has_no_diagnostics() {
    assert!(msgs("").is_empty());
}

#[test]
fn text_length_counts_characters() {
    assert!(msgs(&format!(r#","text":"{}""#, "é".repeat(400))).is_empty());
    let m = msgs(&format!(r#","text":"{}""#, "é".repeat(401)));
    assert_eq!(m.len(), 1);
    assert!(m[0].contains("text: longer than 400 characters"), "{m:?}");
}

#[test]
fn cyrillic_400_chars_is_accepted() {
    assert!(msgs(&format!(r#","text":"x","tr":{{"ru":"{}"}}"#, "ж".repeat(400))).is_empty());
    assert_eq!(msgs(&format!(r#","text":"x","tr":{{"ru":"{}"}}"#, "ж".repeat(401))).len(), 1);
}

#[test]
fn empty_or_blank_text_is_rejected() {
    assert_eq!(msgs(r#","text":"""#).len(), 1);
    assert_eq!(msgs(r#","text":"  ""#).len(), 1);
}

#[test]
fn control_char_is_rejected() {
    assert_eq!(msgs(r#","text":"a\nb""#).len(), 1);
    assert_eq!(msgs(r#","text":"a\u007fb""#).len(), 1);
    assert_eq!(msgs(r#","text":"x","tr":{"ru":"a\tb"}"#).len(), 1);
}

#[test]
fn bad_tr_keys_are_rejected() {
    assert_eq!(msgs(r#","text":"x","tr":{"RU":"a"}"#).len(), 1);
    assert_eq!(msgs(r#","text":"x","tr":{"russian":"a"}"#).len(), 1);
    assert_eq!(msgs(r#","text":"x","tr":{"pt-BR":"a","zh-Hant":"b"}"#).len(), 0);
}

#[test]
fn tr_entry_count_is_limited() {
    let nine: Vec<String> = (b'a'..=b'i').map(|c| format!(r#""a{}":"v""#, c as char)).collect();
    assert_eq!(msgs(&format!(r#","text":"x","tr":{{{}}}"#, nine.join(","))).len(), 1);
    assert_eq!(msgs(r#","text":"x","tr":{}"#).len(), 1);
}

#[test]
fn tr_without_text_is_rejected() {
    assert_eq!(msgs(r#","tr":{"ru":"a"}"#).len(), 1);
}

#[test]
fn mt_without_tr_is_rejected() {
    assert_eq!(msgs(r#","text":"x","mt":true"#).len(), 1);
    assert!(msgs(r#","text":"x","mt":false"#).is_empty());
}

#[test]
fn wrong_type_is_one_parser_error() {
    assert_eq!(msgs(r#","text":5"#).len(), 1);
    assert_eq!(msgs(r#","text":"x","tr":"x""#).len(), 1);
}

#[test]
fn diagnostics_follow_clip_id_order() {
    let m = manifest(&format!(r#""b":{},"a":{}"#, clip(r#","text":"""#), clip(r#","mt":true"#)));
    let d: Vec<String> = diags_for(&m).into_iter().map(|d| d.message).collect();
    assert_eq!(d.len(), 2);
    assert!(d[0].contains("'a'") && d[1].contains("'b'"), "{d:?}");
}

#[test]
fn bidi_control_code_points_are_rejected_at_range_edges() {
    for cp in ['\u{202A}', '\u{202E}', '\u{2066}', '\u{2069}'] {
        let m = msgs(&format!(r#","text":"a{cp}b""#));
        assert_eq!(m.len(), 1, "U+{:04X}", cp as u32);
        assert!(m[0].contains("contains a bidi control character"), "{}", m[0]);
        let m = msgs(&format!(r#","text":"ok","tr":{{"ru":"a{cp}b"}}"#));
        assert_eq!(m.len(), 1, "tr U+{:04X}", cp as u32);
    }
}

#[test]
fn code_points_next_to_bidi_ranges_and_french_diacritics_pass() {
    assert!(msgs(r#","text":"Où est l'élève ? À l'école, ça va \u2029\u2065\u206A""#).is_empty());
    assert!(msgs(r#","text":"Où est l'élève ? Ça va très bien""#).is_empty());
}
