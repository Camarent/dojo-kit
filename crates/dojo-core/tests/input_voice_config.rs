use dojo_core::content::parse_course;
use dojo_core::validate::validate;

fn course(extra: &str) -> String {
    format!(r#"{{"id":"c","title":"C","uiLanguage":"en","units":[{{"id":"u","title":"U"}}],{extra}}}"#)
}

fn has(extra: &str, code: &str) -> bool {
    validate(&course(extra), &[], None).iter().any(|d| d.code == code)
}

#[test]
fn prefer_and_input_script_parse_and_round_trip() {
    let c = parse_course(&course(r#""inputScript":["han","cyrillic"],"speech":{"voices":{"f":{"prefer":["kyoko","^a.*b"]}}}"#)).unwrap();
    let v = serde_json::to_value(&c).unwrap();
    assert_eq!(v["inputScript"][1], "cyrillic");
    assert_eq!(v["speech"]["voices"]["f"]["prefer"][0], "kyoko");
}

#[test]
fn bad_voice_pattern_is_an_error_and_good_ones_pass() {
    for bad in ["", "(a", "a)", "[a", "*a", "a|+b", "a\\"] {
        let j = format!(r#""speech":{{"voices":{{"f":{{"prefer":[{}]}}}}}}"#, serde_json::to_string(bad).unwrap());
        assert!(has(&j, "bad_voice_pattern"), "{bad:?}");
    }
    assert!(!has(r#""speech":{"voices":{"f":{"prefer":["otoya|ichiro","(?:a)+","[a-z]+?","\\bx"]}}}"#, "bad_voice_pattern"));
}

#[test]
fn unknown_or_empty_input_script_is_an_error() {
    assert!(has(r#""inputScript":["klingon"]"#, "unknown_input_script"));
    assert!(has(r#""inputScript":[]"#, "unknown_input_script"));
    assert!(!has(r#""inputScript":["non-latin","thai"]"#, "unknown_input_script"));
}

#[test]
fn ruby_and_captions_parse_and_unknown_ruby_key_is_rejected() {
    let ok = course(r#""ruby":{"skipTag":"core","skipKey":"meta.kanji","skip":"日"},"captions":{"meaning":"M"}"#);
    let parsed = parse_course(&ok).unwrap();
    assert_eq!(parsed.ruby.unwrap().skip_tag.as_deref(), Some("core"));
    assert_eq!(parsed.captions.unwrap()["meaning"], "M");
    assert!(parse_course(&course(r#""ruby":{"nope":1}"#)).is_err());
}
