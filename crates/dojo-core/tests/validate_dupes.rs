mod common;
use common::*;

const COURSE: &str = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;

#[test]
fn same_prompt_diff_answers_gap_japanese_different_readings() {
    // Two gap items with same prompt but different answers [九,きゅう] vs [九,く]
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"What is 9 in Japanese?","answers":["九","きゅう"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"What is 9 in Japanese?","answers":["九","く"]}"#;
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
fn choice_items_not_checked() {
    // Choice items should not be checked (only gap, cloze, numeric)
    let l1 = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"What is 9?","options":["nine","ten"],"answer":0}"#;
    let l2 = r#"{"type":"choice","id":"u-2","unit":"u","prompt":"What is 9?","options":["eleven","twelve"],"answer":0}"#;
    let d = run(COURSE, &[l1, l2]);
    let codes = codes(&d);
    assert!(!codes.contains(&"same_prompt_different_answers"), "Should not warn for choice items, got {d:?}");
}

#[test]
fn gap_answer_order_does_not_matter() {
    let l1 = r#"{"type":"gap","id":"u-1","unit":"u","prompt":"What is 9?","answers":["九","きゅう"]}"#;
    let l2 = r#"{"type":"gap","id":"u-2","unit":"u","prompt":"What is 9?","answers":["きゅう","九"]}"#;
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
