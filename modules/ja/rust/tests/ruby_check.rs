mod common;
use common::*;

const SKIP: &str = r#""markup":"ruby","ruby":{"checkQuestions":true,"skip":"日"}"#;
const DRILL: &str = r#""markup":"ruby","ruby":{"checkQuestions":true,"skip":"日","drillUnits":["d"]}"#;

fn choice(id: &str, unit: &str, prompt: &str, options: &str, extra: &str) -> String {
    format!(r#"{{"type":"choice","id":"{id}","unit":"{unit}","prompt":"{prompt}","options":{options},"answer":0{extra}}}"#)
}

#[test]
fn skip_from_ruby_skip_hides_ruby_base() {
    let hidden = choice("u-1", "u", "{日|にち}", r#"["a","b"]"#, "");
    fires(&with_course(SKIP), &[&hidden], "ruby_on_skip_kanji");
    // a base with one non-skip kanji keeps its ruby
    let shown = choice("u-1", "u", "{日本|にほん}", r#"["a","b"]"#, "");
    assert!(!codes(&run(&with_course(SKIP), &[&shown])).contains(&"ruby_on_skip_kanji"));
}

#[test]
fn skip_from_option_text_hides_ruby_base() {
    let hidden = choice("u-1", "u", "Pick", r#"["{日|にち}","b"]"#, "");
    fires(&with_course(SKIP), &[&hidden], "ruby_on_skip_kanji");
}

#[test]
fn skip_tag_items_contribute_meta_kanji() {
    let course = with_course(r#""markup":"ruby","ruby":{"checkQuestions":true,"skipTag":"core"}"#);
    let source = r#"{"type":"card","id":"k-1","unit":"u","prompt":"p","back":"b","tags":["core"],"meta":{"kanji":"学"}}"#;
    let ruby = choice("u-1", "u", "{学|がく}", r#"["a","b"]"#, "");
    fires(&course, &[source, &ruby], "ruby_on_skip_kanji");
    // an item without the tag does not feed the skip set
    let plain = r#"{"type":"card","id":"k-2","unit":"u","prompt":"p","back":"b","meta":{"kanji":"学"}}"#;
    assert!(!codes(&run(&course, &[plain, &ruby])).contains(&"ruby_on_skip_kanji"));
}

#[test]
fn skip_key_reads_custom_meta_path() {
    let course = with_course(r#""markup":"ruby","ruby":{"checkQuestions":true,"skipTag":"core","skipKey":"meta.k.jp"}"#);
    let source = r#"{"type":"card","id":"k-1","unit":"u","prompt":"p","back":"b","tags":["core"],"meta":{"k":{"jp":"学"}}}"#;
    let ruby = choice("u-1", "u", "{学|がく}", r#"["a","b"]"#, "");
    fires(&course, &[source, &ruby], "ruby_on_skip_kanji");
    // a path that does not start with `meta` resolves to nothing
    let bad = with_course(r#""markup":"ruby","ruby":{"checkQuestions":true,"skipTag":"core","skipKey":"kanji"}"#);
    assert!(!codes(&run(&bad, &[source, &ruby])).contains(&"ruby_on_skip_kanji"));
}

#[test]
fn rules_off_without_markup_ruby_or_skip_source() {
    let hidden = choice("u-1", "u", "{日|にち}", r#"["a","b"]"#, "");
    let bare = choice("u-2", "u", "日本", r#"["a","b"]"#, "");
    let no_markup = with_course(r#""ruby":{"checkQuestions":true,"skip":"日"}"#);
    let d = codes(&run(&no_markup, &[&hidden, &bare]));
    assert!(!d.contains(&"ruby_on_skip_kanji") && !d.contains(&"ruby_missing"));
    let no_source = with_course(r#""markup":"ruby","ruby":{"checkQuestions":true,"drillUnits":["x"]}"#);
    let d = codes(&run(&no_source, &[&hidden, &bare]));
    assert!(!d.contains(&"ruby_on_skip_kanji") && !d.contains(&"ruby_missing"));
}

#[test]
fn non_drill_bare_non_skip_kanji_needs_ruby() {
    let course = with_course(SKIP);
    // bare non-skip kanji in the prompt
    let prompt = choice("u-1", "u", "学校", r#"["a","b"]"#, "");
    fires(&course, &[&prompt], "ruby_missing");
    // bare non-skip kanji in an option
    let opt = choice("u-2", "u", "Pick", r#"["学校","b"]"#, "");
    fires(&course, &[&opt], "ruby_missing");
    // decoy: bare skip kanji is fine
    let skip_bare = choice("u-3", "u", "日", r#"["a","b"]"#, "");
    assert!(!codes(&run(&course, &[&skip_bare])).contains(&"ruby_missing"));
    // decoy: non-Han text is ignored
    let kana = choice("u-4", "u", "がっこう", r#"["カタカナ","abc"]"#, "");
    assert!(!codes(&run(&course, &[&kana])).contains(&"ruby_missing"));
    // ruby on the non-skip kanji satisfies the rule
    let ruby = choice("u-5", "u", "{学|がく}{校|こう}", r#"["a","b"]"#, "");
    assert!(!codes(&run(&course, &[&ruby])).contains(&"ruby_missing"));
}

#[test]
fn drill_item_exempt_from_skip_rules() {
    let course = with_course(DRILL);
    // a drill item with a bare non-skip kanji only in options: the skip rule does not apply
    let opt = choice("d-1", "d", "Pick", r#"["学校","b"]"#, "");
    assert!(!codes(&run(&course, &[&opt])).contains(&"ruby_missing"));
    // a drill item with ruby on a skip kanji: no ruby_on_skip_kanji
    let hidden = choice("d-2", "d", "{日|にち}", r#"["a","b"]"#, "");
    assert!(!codes(&run(&course, &[&hidden])).contains(&"ruby_on_skip_kanji"));
    // a bare kanji in a drill prompt is exempt; the same item outside the drill unit warns
    let bare = choice("d-3", "d", "日本", r#"["a","b"]"#, "");
    assert!(!codes(&run(&course, &[&bare])).contains(&"ruby_missing"));
    let non_drill = choice("u-3", "u", "日本", r#"["a","b"]"#, "");
    fires(&course, &[&non_drill], "ruby_missing");
}

#[test]
fn retired_items_are_not_checked() {
    let course = with_course(SKIP);
    let retired = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"学校","options":["a","b"],"answer":0,"status":"retired"}"#;
    assert!(!codes(&run(&course, &[retired])).contains(&"ruby_missing"));
}

#[test]
fn skip_rules_off_without_check_questions() {
    let course = with_course(r#""markup":"ruby","ruby":{"skip":"日"}"#);
    let hidden = choice("u-1", "u", "{日|にち}", r#"["a","b"]"#, "");
    let bare = choice("u-2", "u", "学校", r#"["a","b"]"#, "");
    let d = codes(&run(&course, &[&hidden, &bare]));
    assert!(!d.contains(&"ruby_on_skip_kanji") && !d.contains(&"ruby_missing"));
}

#[test]
fn fires_ruby_on_skip_kanji_and_ruby_missing() {
    // ruby on a kanji the skip set already hides
    let skip = with_course(r#""markup":"ruby","ruby":{"checkQuestions":true,"skip":"日"}"#);
    let hidden = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"{日|にち}","options":["a","b"],"answer":0}"#;
    fires(&skip, &[hidden], "ruby_on_skip_kanji");
    let shown = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"{学|がく}","options":["a","b"],"answer":0}"#;
    assert!(!codes(&run(&skip, &[shown])).contains(&"ruby_on_skip_kanji"));

    // drill item keeps its headword bare: exempt from ruby_missing
    let drill = with_course(r#""markup":"ruby","ruby":{"checkQuestions":true,"skip":"x","drillUnits":["u"]}"#);
    let bare = r#"{"type":"choice","id":"u-1","unit":"u","prompt":"日本","options":["a","b"],"answer":0}"#;
    assert!(!codes(&run(&drill, &[bare])).contains(&"ruby_missing"));

    // no drill scope configured: bare kanji is fine
    assert!(!codes(&run(COURSE, &[bare])).contains(&"ruby_missing"));
}
