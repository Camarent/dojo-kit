mod common;
use common::*;
use dojo_core::validate::{CODES, Severity};

// Cyrillic words written as code points (the core-latin guard forbids literal Cyrillic in crates/).
const GRAMMAR: &str = "\u{0413}\u{0440}\u{0430}\u{043c}\u{043c}\u{0430}\u{0442}\u{0438}\u{043a}\u{0430}";
const ANSWER: &str = "\u{041f}\u{0440}\u{0430}\u{0432}\u{0438}\u{043b}\u{044c}\u{043d}\u{043e}";
const TIMES: &str = "\u{0432}\u{0440}\u{0435}\u{043c}\u{0435}\u{043d}\u{0430}";
const ANSWER_WORD: &str = "\u{043e}\u{0442}\u{0432}\u{0435}\u{0442}";
const CAT: &str = "\u{043a}\u{043e}\u{0448}\u{043a}\u{0430}";
const VERB_TIMES: &str = "\u{0432}\u{0440}\u{0435}\u{043c}\u{0435}\u{043d}\u{0430} \u{0433}\u{043b}\u{0430}\u{0433}\u{043e}\u{043b}\u{0430}";

fn codes(topic: &str) -> Vec<String> {
    let l = format!(r#"{{"type":"card","id":"u-1","unit":"u","prompt":"What?","back":"b","topic":"{topic}"}}"#);
    run(COURSE, &[&l]).into_iter().map(|d| d.code.to_string()).collect()
}

fn has(topic: &str, code: &str) -> bool {
    codes(topic).iter().any(|c| c == code)
}

#[test]
fn grammar_number_title_fires() {
    assert!(has(&format!("{GRAMMAR} #1"), "topic_grammar_number"));
    assert!(has(&format!("{GRAMMAR} #42"), "topic_grammar_number"));
    assert!(has(&format!("  {GRAMMAR} #7  "), "topic_grammar_number"));
}

#[test]
fn grammar_number_title_negatives_stay_clean() {
    let topics = [
        format!("{GRAMMAR} #"),
        format!("{GRAMMAR} #1a"),
        GRAMMAR.to_string(),
        format!("{GRAMMAR}: {TIMES}"),
        format!("{GRAMMAR} #one"),
    ];
    for topic in topics {
        assert!(!has(&topic, "topic_grammar_number"), "{topic}");
    }
}

#[test]
fn answer_list_entry_fires() {
    assert!(has(&format!("{ANSWER}: a; b; c"), "topic_answer_list"));
    assert!(has(&format!("{ANSWER}: {CAT}"), "topic_answer_list"));
}

#[test]
fn answer_list_negatives_stay_clean() {
    let topics = [
        ANSWER.to_string(),
        format!("{ANSWER}:"),
        format!("{ANSWER}: a;"),
        format!("{ANSWER}: a;; b"),
        format!("{ANSWER} {ANSWER_WORD}: a"),
    ];
    for topic in topics {
        assert!(!has(&topic, "topic_answer_list"), "{topic}");
    }
}

#[test]
fn ordinary_topic_is_clean_of_both_codes() {
    let good = codes(VERB_TIMES);
    assert!(!good.iter().any(|c| c == "topic_grammar_number" || c == "topic_answer_list"));
}

#[test]
fn both_codes_are_registered_as_warnings() {
    for code in ["topic_grammar_number", "topic_answer_list"] {
        let entry = CODES.iter().find(|(c, _, _)| *c == code);
        assert!(matches!(entry, Some((_, Severity::Warning, _))), "{code}");
    }
}
