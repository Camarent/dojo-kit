mod common;
use common::*;

const JA: &str = r#"{"id":"c","title":"C","uiLanguage":"en","contentLanguage":"ja","units":[{"id":"u","title":"U"}]}"#;
const EN: &str = r#"{"id":"c","title":"C","uiLanguage":"en","contentLanguage":"en","units":[{"id":"u","title":"U"}]}"#;

fn item(steps: &[&str]) -> String {
    let blanks = vec!["___"; steps.len()].join(" ");
    let st = steps.iter().map(|s| format!("\"{s}\"")).collect::<Vec<_>>().join(",");
    format!(r#"{{"type":"order","id":"u-1","unit":"u","prompt":"{blanks}","steps":[{st}]}}"#)
}

fn warns(course: &str, steps: &[&str]) -> bool {
    run(course, &[&item(steps)]).iter().any(|d| d.code == "order_split_word")
}

#[test]
fn owner_examples_warn() {
    assert!(warns(JA, &["どこへも", "行き", "ませ", "ん"]));
    assert!(warns(JA, &["郵便局は", "どこ", "です", "か"]));
    assert!(warns(JA, &["どこで", "パーティーを", "しました", "か"]));
    assert!(warns(JA, &["どこへも", "行か", "ない", "よ"]));
    assert!(warns(JA, &["友達と", "海へ", "行った", "よ"]));
}

#[test]
fn rechunked_forms_do_not_warn() {
    assert!(!warns(JA, &["私は日曜日に", "どこへも", "行きません"]));
    assert!(!warns(JA, &["郵便局は", "どこですか"]));
    assert!(!warns(JA, &["どこで", "パーティーを", "しましたか"]));
    assert!(!warns(JA, &["日曜日は", "どこへも", "行かないよ"]));
}

#[test]
fn noun_particle_and_separate_desu_do_not_warn() {
    assert!(!warns(JA, &["私は", "学生", "です"]));
    assert!(!warns(JA, &["これは", "本", "でした"]));
    assert!(!warns(JA, &["友達と", "海へ", "行きます"]));
}

#[test]
fn bare_particle_warns_and_message_names_step() {
    let d = run(JA, &[&item(&["私", "を", "見る"])]);
    let w = d.iter().find(|d| d.code == "order_split_word").expect("warn");
    assert!(w.message.contains("step 2 'を'"), "{}", w.message);
}

#[test]
fn first_step_never_flagged() {
    assert!(!warns(JA, &["た", "海へ", "行く"]));
}

#[test]
fn non_ja_course_never_warns() {
    assert!(!warns(EN, &["どこへも", "行き", "ませ", "ん"]));
}
