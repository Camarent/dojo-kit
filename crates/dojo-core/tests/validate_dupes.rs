mod common;
use common::*;

const COURSE: &str = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;

#[test]
fn same_prompt_diff_answers_gap_japanese_different_readings() {
    // Two gap items with same prompt but different answers [nine,nyu] vs [nine,n]
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"What is 9 in Japanese?","answers":["nine","nyu"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"What is 9 in Japanese?","answers":["nine","n"]}"#;
    let d = run(COURSE, &[l1, l2]);
    let codes = codes(&d);
    assert!(codes.contains(&"same_prompt_different_answers"), "Expected same_prompt_different_answers warning, got {d:?}");
    assert_eq!(d.iter().filter(|d| d.code == "same_prompt_different_answers").count(), 1);
}

#[test]
fn same_prompt_same_answers_no_warning() {
    // Two gap items with same prompt and same answers -> no warning
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"What is 9?","answers":["nine"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"What is 9?","answers":["nine"]}"#;
    let d = run(COURSE, &[l1, l2]);
    let codes = codes(&d);
    assert!(!codes.contains(&"same_prompt_different_answers"), "Should not warn for same prompt and same answers, got {d:?}");
}

#[test]
fn different_prompts_no_warning() {
    // Two gap items with different prompts -> no warning
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"What is 9?","answers":["nine"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"What is 10?","answers":["ten"]}"#;
    let d = run(COURSE, &[l1, l2]);
    let codes = codes(&d);
    assert!(!codes.contains(&"same_prompt_different_answers"), "Should not warn for different prompts, got {d:?}");
}

#[test]
fn same_prompt_diff_case_normalized() {
    // Prompts differing only by case/spaces should be normalized to the same
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"  What is 9?  ","answers":["nine"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"what is 9?","answers":["ten"]}"#;
    let d = run(COURSE, &[l1, l2]);
    let codes = codes(&d);
    assert!(codes.contains(&"same_prompt_different_answers"), "Expected same_prompt_different_answers for normalized same prompt, got {d:?}");
}

#[test]
fn three_conflicting_items_one_warning_listing_all_ids() {
    // Three items: two have same prompt but different answers, third has different prompt
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"What is 9?","answers":["nine"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"What is 9?","answers":["ten"]}"#;
    let l3 = r#"{"type":"gap","id":"u-3","unit":"u","prompt":"What is 9?","answers":["eleven"]}"#;
    let d = run(COURSE, &[l1, l2, l3]);
    let codes = codes(&d);
    assert!(codes.contains(&"same_prompt_different_answers"), "Expected same_prompt_different_answers warning, got {d:?}");
    let w: Vec<_> = d.iter().filter(|d| d.code == "same_prompt_different_answers").collect();
    assert_eq!(w.len(), 1, "one warning per prompt group, got {d:?}");
    for id in ["u-1", "u-2", "u-3"] {
        assert!(w[0].message.contains(id), "message lists {id}: {}", w[0].message);
    }
}

#[test]
fn stimulus_items_not_checked() {
    // Items with stimulus should not be checked
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"What is 9?","answers":["nine"],"stimulus":"s1"}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"What is 9?","answers":["ten"],"stimulus":"s1"}"#;
    let d = run(COURSE, &[l1, l2]);
    let codes = codes(&d);
    assert!(!codes.contains(&"same_prompt_different_answers"), "Should not warn for stimulus items, got {d:?}");
}

#[test]
fn cloze_same_prompt_diff_answers() {
    // Two cloze items with same prompt but different blank answers
    let l1 = r#"{"type":"cloze","id":"u-1","unit":"u","prompt":"The capital of France is ___.","parts":["The capital of France is ",["Paris"],"."]}"#;
    let l2 = r#"{"type":"cloze","id":"u-2","unit":"u","prompt":"The capital of France is ___.","parts":["The capital of France is ",["Lyon"],"."]}"#;
    let d = run(COURSE, &[l1, l2]);
    let codes = codes(&d);
    assert!(codes.contains(&"same_prompt_different_answers"), "Expected same_prompt_different_answers for cloze, got {d:?}");
}

#[test]
fn numeric_same_prompt_diff_answers() {
    // Two numeric items with same prompt but different answers
    let l1 = r#"{"type":"numeric","id":"u-1","unit":"u","prompt":"What is 2+2?","answer":4}"#;
    let l2 = r#"{"type":"numeric","id":"u-2","unit":"u","prompt":"What is 2+2?","answer":5}"#;
    let d = run(COURSE, &[l1, l2]);
    let codes = codes(&d);
    assert!(codes.contains(&"same_prompt_different_answers"), "Expected same_prompt_different_answers for numeric, got {d:?}");
}

#[test]
fn choice_items_same_prompt_different_correct_option_warn() {
    // The answer of a choice item is its correct option, so different correct options warn
    let l1 = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"What is 9?","options":["nine","ten"],"answer":0}"#;
    let l2 = r#"{"type":"choice","id":"u-2","unit":"u","prompt":"What is 9?","options":["eleven","twelve"],"answer":0}"#;
    let d = run(COURSE, &[l1, l2]);
    let codes = codes(&d);
    assert!(codes.contains(&"same_prompt_different_answers"), "Expected same_prompt_different_answers for choice, got {d:?}");
}

#[test]
fn choice_same_prompt_different_options_no_warning() {
    // Same prompt and same correct option, only the distractors differ -> no warning
    let l1 = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"What is 9?","options":["nine","ten"],"answer":0}"#;
    let l2 = r#"{"type":"choice","id":"u-2","unit":"u","prompt":"What is 9?","options":["nine","eleven"],"answer":0}"#;
    let d = run(COURSE, &[l1, l2]);
    assert!(!codes(&d).contains(&"same_prompt_different_answers"), "distractors alone must not warn, got {d:?}");
}

#[test]
fn same_options_diff_answers_warns() {
    // Same prompt and same option set, different correct option -> warning
    let l1 = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"What is 9?","options":["nine","ten"],"answer":0}"#;
    let l2 = r#"{"type":"choice","id":"u-2","unit":"u","prompt":"What is 9?","options":["nine","ten"],"answer":1}"#;
    let d = run(COURSE, &[l1, l2]);
    assert!(codes(&d).contains(&"same_prompt_different_answers"), "same options, different answer must warn, got {d:?}");
}

#[test]
fn choice_and_gap_with_same_prompt_do_not_warn() {
    let l1 = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"nine","options":["\u0434\u0435\u0432\u044f\u0442\u044c","\u0434\u0435\u0441\u044f\u0442\u044c"],"answer":0}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"nine","answers":["\u304d\u3085\u3046"]}"#;
    let d = run(COURSE, &[l1, l2]);
    assert!(!codes(&d).contains(&"same_prompt_different_answers"), "cross-type pair must not warn, got {d:?}");
}

#[test]
fn retired_item_does_not_warn_same_prompt() {
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"What is 9?","answers":["nine"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"What is 9?","answers":["ten"],"status":"retired"}"#;
    let d = run(COURSE, &[l1, l2]);
    assert!(!codes(&d).contains(&"same_prompt_different_answers"), "retired item must not warn, got {d:?}");
}

#[test]
fn gap_answer_order_does_not_matter() {
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"What is 9?","answers":["nine","nyu"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"What is 9?","answers":["nyu","nine"]}"#;
    let d = run(COURSE, &[l1, l2]);
    assert!(!codes(&d).contains(&"same_prompt_different_answers"), "got {d:?}");
}

#[test]
fn cloze_swapped_blank_answers_detected() {
    let l1 = r#"{"type":"cloze","id":"u-1","unit":"u","prompt":"Fill ___ and ___.","parts":["a ",["x"]," b ",["y"],"."]}"#;
    let l2 = r#"{"type":"cloze","id":"u-2","unit":"u","prompt":"Fill ___ and ___.","parts":["a ",["y"]," b ",["x"],"."]}"#;
    let d = run(COURSE, &[l1, l2]);
    assert!(codes(&d).contains(&"same_prompt_different_answers"), "got {d:?}");
}

fn warns(lines: &[&str]) -> bool {
    codes(&run(COURSE, lines)).contains(&"same_prompt_different_answers")
}

#[test]
fn case_sensitive_gap_prompts_differing_in_case_are_distinct() {
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"Nine","answers":["a"],"normalize":{"caseSensitive":true}}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"nine","answers":["b"],"normalize":{"caseSensitive":true}}"#;
    assert!(!warns(&[l1, l2]));
}

#[test]
fn case_sensitive_cloze_prompts_differing_in_case_are_distinct() {
    let l1 = r#"{"type":"cloze","id":"u-1","unit":"u","prompt":"Nine","parts":["x ",["a"]],"normalize":{"caseSensitive":true}}"#;
    let l2 = r#"{"type":"cloze","id":"u-2","unit":"u","prompt":"nine","parts":["x ",["b"]],"normalize":{"caseSensitive":true}}"#;
    assert!(!warns(&[l1, l2]));
}

#[test]
fn case_sensitive_gap_answers_differing_in_case_warn() {
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"p","answers":["A"],"normalize":{"caseSensitive":true}}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"p","answers":["a"],"normalize":{"caseSensitive":true}}"#;
    assert!(warns(&[l1, l2]));
}

#[test]
fn case_sensitive_cloze_answers_differing_in_case_warn() {
    let l1 = r#"{"type":"cloze","id":"u-1","unit":"u","prompt":"p","parts":["x ",["A"]],"normalize":{"caseSensitive":true}}"#;
    let l2 = r#"{"type":"cloze","id":"u-2","unit":"u","prompt":"p","parts":["x ",["a"]],"normalize":{"caseSensitive":true}}"#;
    assert!(warns(&[l1, l2]));
}

fn dup_word_fires(lines: &[&str]) -> bool {
    codes(&run(COURSE, lines)).contains(&"dup_word")
}

#[test]
fn dup_word_hint_prompt_vs_plain_prompt_overlapping_answers() {
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"swim (kana or kanji)","answers":["swim","swam"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"swim","answers":["swam"]}"#;
    let d = run(COURSE, &[l1, l2]);
    let w: Vec<_> = d.iter().filter(|d| d.code == "dup_word").collect();
    assert_eq!(w.len(), 1, "one warning per pair, got {d:?}");
    for id in ["u-1", "u-2"] {
        assert!(w[0].message.contains(id), "message lists {id}: {}", w[0].message);
    }
}

#[test]
fn dup_word_kana_hints_name_different_cards() {
    let l1 = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"\u4e03 (\u0441\u043b\u043e\u0432\u043e)","options":["\u0441\u0435\u043c\u044c","\u0434\u0432\u0430"],"answer":0}"#;
    let l2 = r#"{"type":"choice","id":"u-2","unit":"u","prompt":"\u4e03 (\u3057\u3061)","options":["\u0442\u0440\u0438","\u0441\u0435\u043c\u044c"],"answer":1}"#;
    assert!(!dup_word_fires(&[l1, l2]), "different reading hints are different cards");
}

#[test]
fn dup_word_kana_hint_equal_to_ruby_reading_still_fires() {
    let l1 = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"{\u660e\u65e5|\u3042\u3059}","options":["\u0437\u0430\u0432\u0442\u0440\u0430","\u0434\u0432\u0430"],"answer":0}"#;
    let l2 = r#"{"type":"choice","id":"u-2","unit":"u","prompt":"\u660e\u65e5 (\u3042\u3059)","options":["\u0442\u0440\u0438","\u0437\u0430\u0432\u0442\u0440\u0430"],"answer":1}"#;
    assert!(dup_word_fires(&[l1, l2]), "hint equal to the ruby reading is the same card");
}

#[test]
fn dup_word_ruby_and_case_normalized() {
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"{Swim|swm}  now!","answers":["x"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"swim now","answers":["x"]}"#;
    assert!(dup_word_fires(&[l1, l2]));
}

#[test]
fn dup_word_cloze_same_prompt_same_blanks() {
    let l1 = r#"{"type":"cloze","id":"u-1","unit":"u","prompt":"Capital ___","parts":["Capital ",["Paris"]]}"#;
    let l2 = r#"{"type":"cloze","id":"u-2","unit":"u","prompt":"capital ___ (hint)","parts":["Capital ",["Paris"]]}"#;
    assert!(dup_word_fires(&[l1, l2]));
}

#[test]
fn dup_word_numeric_same_prompt_same_answer() {
    let l1 = r#"{"type":"numeric","id":"u-1","unit":"u","prompt":"2+2?","answer":4}"#;
    let l2 = r#"{"type":"numeric","id":"u-2","unit":"u","prompt":"2+2","answer":4}"#;
    assert!(dup_word_fires(&[l1, l2]));
}

#[test]
fn dup_word_homophone_different_prompts_no_fire() {
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"rain","answers":["ame"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"candy","answers":["ame"]}"#;
    assert!(!dup_word_fires(&[l1, l2]));
}

#[test]
fn dup_word_sentence_drill_different_prompts_no_fire() {
    let l1 = r#"{"type":"gap","id":"sd-1","unit":"u","prompt":"I swim every day.","answers":["swim"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"swim","answers":["swim"]}"#;
    assert!(!dup_word_fires(&[l1, l2]));
}

#[test]
fn dup_word_retired_item_no_fire() {
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"swim","answers":["swim"],"status":"retired"}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"swim","answers":["swim"]}"#;
    assert!(!dup_word_fires(&[l1, l2]));
}

#[test]
fn dup_word_superseded_item_no_fire() {
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"swim","answers":["swim"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"swim","answers":["swim"],"supersedes":["u-1"]}"#;
    assert!(!dup_word_fires(&[l1, l2]));
}

#[test]
fn dup_word_disjoint_answers_no_fire() {
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"swim","answers":["a"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"swim","answers":["b"]}"#;
    assert!(!dup_word_fires(&[l1, l2]));
}

#[test]
fn dup_word_other_unit_no_fire() {
    let two = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"},{"id":"v","title":"V"}]}"#;
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"swim","answers":["swim"]}"#;
    let l2 = r#"{"type":"gap","id":"v-1","unit":"v","prompt":"swim","answers":["swim"]}"#;
    assert!(!codes(&run(two, &[l1, l2])).contains(&"dup_word"));
}

#[test]
fn dup_word_other_type_no_fire() {
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"nine","answers":["9"]}"#;
    let l2 = r#"{"type":"numeric","id":"u-2","unit":"u","prompt":"nine","answer":9}"#;
    assert!(!dup_word_fires(&[l1, l2]));
}

#[test]
fn dup_word_choice_same_prompt_same_correct_option_fires() {
    let l1 = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"swim","options":["swim","sink"],"answer":0}"#;
    let l2 = r#"{"type":"choice","id":"u-2","unit":"u","prompt":"swim","options":["swim","run"],"answer":0}"#;
    assert!(dup_word_fires(&[l1, l2]));
}

#[test]
fn dup_word_unclosed_brace_keeps_rest_of_prompt() {
    // An unclosed `{` is plain text: the readings after `|` must not be dropped
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"swim {x|y","answers":["swim"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"swim {x|z","answers":["swim"]}"#;
    assert!(!dup_word_fires(&[l1, l2]));
}

#[test]
fn dup_word_stimulus_items_not_checked() {
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"swim","answers":["swim"],"stimulus":"s1"}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"swim","answers":["swim"],"stimulus":"s1"}"#;
    assert!(!dup_word_fires(&[l1, l2]));
}

#[test]
fn dup_word_partial_overlap_different_extras_no_fire() {
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"four","answers":["4","yon"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"four","answers":["4","shi"]}"#;
    assert!(!dup_word_fires(&[l1, l2]));
}

#[test]
fn dup_word_subset_answers_fire() {
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"ticket","answers":["ticket","kippu"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"ticket","answers":["kippu"]}"#;
    assert!(dup_word_fires(&[l1, l2]));
}
