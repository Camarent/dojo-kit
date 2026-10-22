use dojo_core::content::{Course, Speak, SpeechConfig, Stimulus};
use dojo_core::validate::{Diagnostic, SourceFile, validate, validate_with_stimuli};

fn file(name: &str, text: &str) -> SourceFile {
    SourceFile { name: name.to_string(), text: text.to_string() }
}

fn has(d: &[Diagnostic], code: &str) -> bool {
    d.iter().any(|d| d.code == code)
}

fn has_message(d: &[Diagnostic], code: &str, msg: &str) -> bool {
    d.iter().any(|d| d.code == code && d.message.contains(msg))
}

#[test]
fn speech_config_parses_and_serializes() {
    let course_json = r#"{
        "id": "c",
        "title": "C",
        "uiLanguage": "en",
        "units": [{"id": "u", "title": "U"}],
        "speech": {
            "lang": "en",
            "rate": 1.5,
            "voices": {
                "male": {"pitch": 1.0, "rate": 1.2, "match": "male"},
                "female": {"pitch": 1.5, "rate": 0.9}
            }
        }
    }"#;
    let course: Course = serde_json::from_str(course_json).unwrap();
    let speech = course.speech.unwrap();
    assert_eq!(speech.lang, Some("en".to_string()));
    assert_eq!(speech.rate, Some(1.5));
    assert!(speech.voices.is_some());
    let voices = speech.voices.as_ref().unwrap();
    assert_eq!(voices.len(), 2);
    assert_eq!(voices.get("male").unwrap().pitch, Some(1.0));
    assert_eq!(voices.get("male").unwrap().rate, Some(1.2));
    assert_eq!(voices.get("male").unwrap().match_, Some("male".to_string()));
    
    // Serialize back to JSON and parse again
    let serialized = serde_json::to_string(&speech).unwrap();
    let parsed: SpeechConfig = serde_json::from_str(&serialized).unwrap();
    assert_eq!(parsed.lang, Some("en".to_string()));
    assert_eq!(parsed.rate, Some(1.5));
}

#[test]
fn speech_config_defaults() {
    let course_json = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;
    let course: Course = serde_json::from_str(course_json).unwrap();
    assert!(course.speech.is_none());
}

#[test]
fn speak_line_round_trip() {
    let json = r#"{"lines":[{"voice":"male","text":"Hello world"},{"text":"Another line"}]}"#;
    let speak: Speak = serde_json::from_str(json).unwrap();
    assert_eq!(speak.lines.len(), 2);
    assert_eq!(speak.lines[0].text, "Hello world");
    assert_eq!(speak.lines[0].voice, Some("male".to_string()));
    assert_eq!(speak.lines[1].text, "Another line");
    assert_eq!(speak.lines[1].voice, None);
    
    // Serialize back
    let serialized = serde_json::to_string(&speak).unwrap();
    let parsed: Speak = serde_json::from_str(&serialized).unwrap();
    assert_eq!(parsed.lines.len(), 2);
    assert_eq!(parsed.lines[0].text, "Hello world");
    assert_eq!(parsed.lines[0].voice.as_ref(), Some(&"male".to_string()));
}

#[test]
fn stimulus_speak_round_trip() {
    let json = r#"{"id":"s1","text":"Passage","speak":{"lines":[{"voice":"narrator","text":"Line one"},{"text":"Line two"}]}}"#;
    let stim: Stimulus = serde_json::from_str(json).unwrap();
    assert!(stim.speak.is_some());
    let speak = stim.speak.as_ref().unwrap();
    assert_eq!(speak.lines.len(), 2);
    assert_eq!(speak.lines[0].voice, Some("narrator".to_string()));
    
    // Serialize back
    let serialized = serde_json::to_string(&stim).unwrap();
    let parsed: Stimulus = serde_json::from_str(&serialized).unwrap();
    assert_eq!(parsed.speak.as_ref().unwrap().lines[0].text, "Line one");
}

#[test]
fn bad_speech_rate_out_of_range() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"speech":{"rate":15.0}}"#;
    let diags = validate(course, &[], None);
    assert!(has(&diags, "bad_speech"));
    assert!(has_message(&diags, "bad_speech", "rate"));
}

#[test]
fn bad_speech_pitch_out_of_range() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"speech":{"voices":{"v1":{"pitch":5.0}}}}"#;
    let diags = validate(course, &[], None);
    assert!(has(&diags, "bad_speech"));
    assert!(has_message(&diags, "bad_speech", "pitch"));
}

#[test]
fn bad_speech_empty_voice_label() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"speech":{"voices":{"":{"rate":1.0}}}}"#;
    let diags = validate(course, &[], None);
    assert!(has(&diags, "bad_speech"));
    assert!(has_message(&diags, "bad_speech", "empty label"));
}

#[test]
fn bad_speech_empty_lines() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;
    let stimuli = r#"{"id":"s1","text":"x","speak":{"lines":[]}}"#;
    let diags = validate_with_stimuli(course, &[file("content/u.jsonl", "")], None, Some(&file("stimuli.jsonl", stimuli)));
    assert!(has(&diags, "bad_speech"));
    assert!(has_message(&diags, "bad_speech", "no lines"));
}

#[test]
fn bad_speech_empty_line_text() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;
    let stimuli = r#"{"id":"s1","text":"x","speak":{"lines":[{"voice":"v1","text":""}]}}"#;
    let diags = validate_with_stimuli(course, &[file("content/u.jsonl", "")], None, Some(&file("stimuli.jsonl", stimuli)));
    assert!(has(&diags, "bad_speech"));
    assert!(has_message(&diags, "bad_speech", "empty text"));
}

#[test]
fn bad_speech_empty_voice_in_line() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;
    let stimuli = r#"{"id":"s1","text":"x","speak":{"lines":[{"voice":"","text":"hello"}]}}"#;
    let diags = validate_with_stimuli(course, &[file("content/u.jsonl", "")], None, Some(&file("stimuli.jsonl", stimuli)));
    assert!(has(&diags, "bad_speech"));
    assert!(has_message(&diags, "bad_speech", "empty voice label"));
}

#[test]
fn unknown_voice_in_stimulus() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"speech":{"voices":{"male":{}}}}"#;
    let stimuli = r#"{"id":"s1","text":"x","speak":{"lines":[{"voice":"female","text":"hello"}]}}"#;
    let diags = validate_with_stimuli(course, &[file("content/u.jsonl", "")], None, Some(&file("stimuli.jsonl", stimuli)));
    assert!(has(&diags, "unknown_voice"));
    assert!(has_message(&diags, "unknown_voice", "female"));
}

#[test]
fn unknown_voice_when_no_voices_defined() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;
    let stimuli = r#"{"id":"s1","text":"x","speak":{"lines":[{"voice":"male","text":"hello"}]}}"#;
    let diags = validate_with_stimuli(course, &[file("content/u.jsonl", "")], None, Some(&file("stimuli.jsonl", stimuli)));
    assert!(has(&diags, "unknown_voice"));
    assert!(has_message(&diags, "unknown_voice", "male"));
}

#[test]
fn voice_without_label_is_fine() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"speech":{"voices":{"male":{}}}}"#;
    let stimuli = r#"{"id":"s1","text":"x","speak":{"lines":[{"text":"hello"}]}}"#;
    let diags = validate_with_stimuli(course, &[file("content/u.jsonl", "")], None, Some(&file("stimuli.jsonl", stimuli)));
    assert!(!has(&diags, "unknown_voice"));
    assert!(!has(&diags, "bad_speech"));
}

#[test]
fn item_speak_empty_string_is_error() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;
    let items = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"P","options":["a"],"answer":0,"speak":""}"#;
    let diags = validate(course, &[file("content/u.jsonl", items)], None);
    assert!(has(&diags, "bad_speech"));
    assert!(has_message(&diags, "bad_speech", "empty"));
}

#[test]
fn item_speak_valid() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}]}"#;
    let items = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"P","options":["a"],"answer":0,"speak":"Hello"}"#;
    let diags = validate(course, &[file("content/u.jsonl", items)], None);
    assert!(!has(&diags, "bad_speech"));
    assert!(!has(&diags, "parse_error"));
}

#[test]
fn bad_speech_voice_rate_out_of_range() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"speech":{"voices":{"v1":{"rate":11.0}}}}"#;
    let diags = validate(course, &[], None);
    assert!(has_message(&diags, "bad_speech", "speech.voices.v1.rate"));
    let low = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"speech":{"voices":{"v1":{"rate":0.05}}}}"#;
    assert!(has_message(&validate(low, &[], None), "bad_speech", "speech.voices.v1.rate"));
}

#[test]
fn bad_speech_empty_voice_match() {
    let course = r#"{"id":"c","title":"C","uiLanguage":"en","units":[{"id":"u","title":"U"}],"speech":{"voices":{"v1":{"match":""}}}}"#;
    let diags = validate(course, &[], None);
    assert!(has_message(&diags, "bad_speech", "match is empty"));
}
