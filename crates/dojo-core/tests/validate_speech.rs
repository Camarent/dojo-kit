use dojo_core::validate::{Severity};
mod common;
use common::*;

// ============ NEW TESTS FOR CONTENT-QUALITY VALIDATORS ============

#[test]
fn foreign_script_warns_on_arabic_in_prompt() {
    // Arabic character "اط" in a Japanese prompt
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"What is this اط?","options":["A","B"],"answer":0}"#;
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;
    let d = run(c, &[l]);
    assert!(d.iter().any(|d| d.code == "foreign_script"), "Expected foreign_script warning, got {d:?}");
    assert_eq!(d[0].severity, Severity::Warning);
}

#[test]
fn foreign_script_whitelisted_via_course_scripts() {
    // Arabic in prompt but Arabic is whitelisted
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"What is this اط?","options":["A","B"],"answer":0}"#;
    let c = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"scripts":["Arabic"]}"#;
    let d = run(c, &[l]);
    assert!(!d.iter().any(|d| d.code == "foreign_script"), "Should not warn when Arabic is whitelisted, got {d:?}");
}

#[test]
fn foreign_script_warns_on_hebrew_in_option() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["א","B"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "foreign_script"));
}

#[test]
fn foreign_script_warns_on_thai_in_answer() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Write in Thai","answers":["สวัสดี"]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "foreign_script"));
}

#[test]
fn foreign_script_allows_latin_extended() {
    // Latin extended characters should be allowed
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Café au lait","answers":["French"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "foreign_script"), "Latin extended should be allowed, got {d:?}");
}

#[test]
fn foreign_script_allows_cyrillic() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Привет","options":["Да","Нет"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "foreign_script"), "Cyrillic should be allowed, got {d:?}");
}

#[test]
fn foreign_script_allows_hiragana() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"こんにちは","options":["はい","いいえ"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "foreign_script"), "Hiragana should be allowed, got {d:?}");
}

#[test]
fn foreign_script_allows_katakana() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"コンピュータ","options":["はい","いいえ"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "foreign_script"), "Katakana should be allowed, got {d:?}");
}

#[test]
fn foreign_script_allows_cjk() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"你好","options":["是","否"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "foreign_script"), "CJK should be allowed, got {d:?}");
}

#[test]
fn prompt_type_mismatch_write_on_choice() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Please write the answer","options":["A","B"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn prompt_type_mismatch_type_on_choice() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Please type the answer","options":["A","B"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn prompt_type_mismatch_na_pisite_on_choice() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"напишите ответ","options":["A","B"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn prompt_type_mismatch_choose_on_gap() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Please choose the answer","answers":["A"]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn prompt_type_mismatch_pick_on_gap() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Please pick the answer","answers":["A"]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn prompt_type_mismatch_vyberite_on_gap() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"выберите ответ","answers":["A"]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn prompt_type_mismatch_no_warning_on_gap_write() {
    // gap items can ask to write
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Please write the answer","answers":["A"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn prompt_type_mismatch_no_warning_on_choice_choose() {
    // choice items can ask to choose
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Please choose the correct answer","options":["A","B"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "prompt_type_mismatch"));
}

#[test]
fn ambiguous_answer_gap_multiple_without_hint() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Как читается 一?","answers":["いち","ひと"]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_gap_ascii_spelling_variants_not_flagged() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"A square has ___ sides.","answers":["4","four"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_gap_multiple_with_digit_hint() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"What are the 2 capitals?","answers":["Paris","Roma"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_gap_multiple_with_any_hint() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"What is any capital?","answers":["Paris","Roma"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_gap_multiple_with_one_of_hint() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"What is one of the capitals?","answers":["Paris","Roma"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_gap_multiple_with_lyuboy_hint() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Назовите любой столицу","answers":["Paris","Roma"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_gap_multiple_with_ili_hint() {
    let l = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Paris или Roma?","answers":["Paris","Roma"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_option_with_slash() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["Yes","No / Maybe","Yes"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_option_with_space_slash_space() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["Yes","No / Maybe","Yes"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_multi_option_with_slash() {
    let l = r#"{"type":"multi","id":"u-1","unit":"u","prompt":"Select all","options":["A","B / C","D"],"correct":[0,1,2]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

// New tests for slash outside brackets detection

#[test]
fn ambiguous_answer_choice_slash_inside_ascii_parens() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["до (места/времени)"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_slash_inside_fullwidth_parens() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["до（места/времени）"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_slash_inside_fullwidth_parens_japanese() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["食べる（たべる/くう）"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_no_space_slash() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["двоюродный брат/сестра"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    let ambig_count = d.iter().filter(|d| d.code == "ambiguous_answer").count();
    assert_eq!(ambig_count, 1);
    let msg = &d.iter().find(|d| d.code == "ambiguous_answer").unwrap().message;
    assert!(msg.contains("split into separate options"));
}

#[test]
fn ambiguous_answer_choice_slash_outside_and_inside_parens() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["брат/сестра (о людях/днях)"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    let ambig_count = d.iter().filter(|d| d.code == "ambiguous_answer").count();
    assert_eq!(ambig_count, 1);
}

#[test]
fn ambiguous_answer_choice_slash_after_closed_parens() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["(a) x/y"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_slash_before_parens() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["x/y (a)"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_nested_parens_no_warning() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["a (b (c/d) e/f)"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_nested_parens_slash_inside_no_warning() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["a (b (c) d/e) f"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_slash_after_fullwidth_closer() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["до（а） x/y"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_fullwidth_slash() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["брат／сестра"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_unbalanced_opener() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["a (b/c"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_stray_closer() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["a) b/c"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_multi_slash_inside_parens() {
    let l = r#"{"type":"multi","id":"u-1","unit":"u","prompt":"Select","options":["до (места/времени)"],"correct":[0]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_multi_slash_outside() {
    let l = r#"{"type":"multi","id":"u-1","unit":"u","prompt":"Select","options":["братья/сёстры"],"correct":[0]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_choice_duplicate_after_normalization() {
    let l = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"Pick","options":["Paris","paris"],"answer":0}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn ambiguous_answer_multi_duplicate_after_normalization() {
    let l = r#"{"type":"multi","id":"u-1","unit":"u","prompt":"Select","options":["A","a","B"],"correct":[0,1]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "ambiguous_answer"));
}

#[test]
fn order_blanks_mismatch_count_differs() {
    let l = r#"{"type":"order","id":"u-1","unit":"u","prompt":"Steps: ___ and ___ and ___","steps":["First","Second"]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "order_blanks_mismatch"));
}

#[test]
fn order_blanks_mismatch_steps_more_than_blanks() {
    let l = r#"{"type":"order","id":"u-1","unit":"u","prompt":"Steps: ___ and ___","steps":["First","Second","Third"]}"#;
    let d = run(COURSE, &[l]);
    assert!(d.iter().any(|d| d.code == "order_blanks_mismatch"));
}

#[test]
fn order_blanks_mismatch_no_blanks() {
    // No blanks in prompt, so no warning
    let l = r#"{"type":"order","id":"u-1","unit":"u","prompt":"Order these steps","steps":["First","Second"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "order_blanks_mismatch"));
}

#[test]
fn order_blanks_mismatch_matching_counts() {
    let l = r#"{"type":"order","id":"u-1","unit":"u","prompt":"Steps: ___ and ___","steps":["First","Second"]}"#;
    let d = run(COURSE, &[l]);
    assert!(!d.iter().any(|d| d.code == "order_blanks_mismatch"));
}
