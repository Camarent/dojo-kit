use dojo_core::content::{parse_items, parse_stimuli};
use dojo_core::exam::{Candidate, Section, sample};
use dojo_core::validate::{Diagnostic, SourceFile, validate_with_stimuli};

const COURSE: &str = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;

fn file(name: &str, text: &str) -> SourceFile {
    SourceFile { name: name.to_string(), text: text.to_string() }
}

fn run(stimuli: Option<&str>, lines: &[&str]) -> Vec<Diagnostic> {
    let s = stimuli.map(|t| file("stimuli.jsonl", t));
    validate_with_stimuli(COURSE, &[file("content/u.jsonl", &lines.join("\n"))], None, s.as_ref())
}

fn has(d: &[Diagnostic], code: &str) -> bool {
    d.iter().any(|d| d.code == code)
}

const S1: &str = r#"{"id":"s1","text":"A passage"}"#;

#[test]
fn stimulus_speak_round_trips() {
    let p = parse_stimuli(r#"{"id":"s1","title":"T","text":"x","hideText":true,"speak":{"lines":[{"voice":"v1","text":"hello"}]}}"#);
    assert!(p.errors.is_empty(), "{:?}", p.errors);
    let s = &p.stimuli[0].1;
    assert_eq!(s.hide_text, Some(true));
    assert!(s.speak.is_some());
    let speak = s.speak.as_ref().unwrap();
    assert_eq!(speak.lines.len(), 1);
    assert_eq!(speak.lines[0].text, "hello");
    assert_eq!(speak.lines[0].voice, Some("v1".to_string()));
    let again = serde_json::to_value(s).unwrap();
    assert_eq!(again["hideText"], true);
    assert_eq!(again["speak"]["lines"][0]["text"], "hello");
    assert_eq!(again["speak"]["lines"][0]["voice"], "v1");
}

#[test]
fn stimulus_unknown_field_and_bad_line_are_parse_errors() {
    let p = parse_stimuli("{\"id\":\"s1\",\"text\":\"x\",\"nope\":1}\nnot json\n{\"id\":\"s2\",\"text\":\"y\"}\n");
    assert_eq!(p.errors.len(), 2);
    assert_eq!(p.errors[0].line, 1);
    assert_eq!(p.errors[1].line, 2);
    assert_eq!(p.stimuli.len(), 1);
    let d = run(Some("{\"id\":\"s1\",\"text\":\"x\",\"nope\":1}"), &[]);
    assert!(d.iter().any(|d| d.code == "parse_error" && d.file == "stimuli.jsonl"), "{d:?}");
}

#[test]
fn item_stimulus_field_round_trips() {
    let p = parse_items(r#"{"type":"choice","id":"u-1","unit":"u","prompt":"P","options":["a","b"],"answer":0,"stimulus":"s1"}"#);
    assert!(p.errors.is_empty());
    assert_eq!(p.items[0].1.stimulus(), Some("s1"));
}

#[test]
fn unknown_stimulus_is_an_error() {
    let item = r#"{"type":"card","id":"u-1","unit":"u","prompt":"P","back":"B","stimulus":"zzz"}"#;
    assert!(has(&run(Some(S1), &[item]), "unknown_stimulus"));
    assert!(has(&run(None, &[item]), "unknown_stimulus"));
}

#[test]
fn duplicate_stimulus_is_an_error_and_unused_is_fine() {
    let d = run(Some(&format!("{S1}\n{S1}")), &[]);
    assert!(has(&d, "duplicate_stimulus"), "{d:?}");
    let d = run(Some(S1), &[r#"{"type":"card","id":"u-1","unit":"u","prompt":"P","back":"B"}"#]);
    assert!(!has(&d, "unknown_stimulus") && !has(&d, "duplicate_stimulus"), "{d:?}");
}

#[test]
fn hide_text_stimulus_skips_answer_in_prompt() {
    let leak = |stim: &str| format!(r#"{{"type":"choice","id":"u-1","unit":"u","prompt":"Is Paris the capital?","options":["Paris","b"],"answer":0,"stimulus":"{stim}"}}"#);
    let hidden = r#"{"id":"h","text":"x","hideText":true}"#;
    assert!(!has(&run(Some(&format!("{S1}\n{hidden}")), &[&leak("h")]), "answer_in_prompt"));
    assert!(has(&run(Some(&format!("{S1}\n{hidden}")), &[&leak("s1")]), "answer_in_prompt"));
}

fn cand(id: &str, stim: Option<&str>) -> Candidate {
    cand_with_exam(id, stim, false)
}

fn cand_with_exam(id: &str, stim: Option<&str>, exam_only: bool) -> Candidate {
    Candidate { id: id.into(), unit: "u".into(), tags: vec![], item_type: "choice".into(), stimulus: stim.map(String::from), exam_only }
}

fn section(count: usize) -> Section {
    Section { title: "S".into(), count, units: None, tags: None, types: None }
}

#[test]
fn group_is_drawn_whole_and_in_order() {
    let mut c = vec![cand("a", None), cand("b", None)];
    for id in ["g1", "g2", "g3", "g4"] {
        c.push(cand(id, Some("s1")));
        c.push(cand(&format!("x{id}"), None));
    }
    for seed in 0..40u64 {
        let r = sample(&c, &[section(6)], seed);
        assert!(r.short.is_empty());
        let pos: Vec<_> = ["g1", "g2", "g3", "g4"].iter().map(|g| r.ids.iter().position(|i| i == g)).collect();
        if pos[0].is_some() {
            let p = pos[0].unwrap();
            assert_eq!(&r.ids[p..p + 4], ["g1", "g2", "g3", "g4"], "seed {seed}: {:?}", r.ids);
        } else {
            assert!(pos.iter().all(Option::is_none), "seed {seed}: {:?}", r.ids);
        }
    }
}

#[test]
fn group_that_does_not_fit_is_skipped_and_reported_short() {
    let c: Vec<_> = ["g1", "g2", "g3", "g4"].iter().map(|g| cand(g, Some("s1"))).collect();
    let r = sample(&c, &[section(3)], 7);
    assert!(r.ids.is_empty());
    assert_eq!(r.short[0].short_by, 3);
    let r = sample(&c, &[section(4)], 7);
    assert_eq!(r.ids, ["g1", "g2", "g3", "g4"]);
    assert!(r.short.is_empty());
}

#[test]
fn ungrouped_sampling_is_unchanged_by_the_stimulus_field() {
    let c: Vec<_> = (0..10).map(|i| cand(&format!("i{i}"), None)).collect();
    let r = sample(&c, &[section(4), section(9)], 42);
    assert_eq!(r.ids.len(), 10);
    assert_eq!(r.short[0].short_by, 3);
}
