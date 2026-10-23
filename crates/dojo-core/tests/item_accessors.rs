use dojo_core::content::{ItemType, parse_items};

const LINES: &[(&str, ItemType)] = &[
    (r#"{"type":"choice","id":"c1","unit":"u-choice","tags":["a","b"],"prompt":"P-choice","options":["x","y"],"answer":0,"status":"retired","supersedes":["o1"],"stimulus":"S1","speak":"K1","entity":"E1"}"#, ItemType::Choice),
    (r#"{"type":"gap","id":"g1","unit":"u-gap","tags":["t"],"prompt":"P-gap","answers":["x"]}"#, ItemType::Gap),
    (r#"{"type":"card","id":"k1","unit":"u-card","prompt":"P-card","back":"b","status":"active"}"#, ItemType::Card),
    (r#"{"type":"multi","id":"m1","unit":"u-multi","tags":["z"],"prompt":"P-multi","options":["a","b"],"correct":[0]}"#, ItemType::Multi),
    (r#"{"type":"match","id":"h1","unit":"u-match","prompt":"P-match","pairs":[{"left":"l","right":"r"}]}"#, ItemType::Match),
    (r#"{"type":"order","id":"o2","unit":"u-order","prompt":"P-order","steps":["a","b"]}"#, ItemType::Order),
    (r#"{"type":"cloze","id":"z1","unit":"u-cloze","prompt":"P-cloze","parts":["a ",["b"]]}"#, ItemType::Cloze),
    (r#"{"type":"numeric","id":"n1","unit":"u-numeric","tags":["q"],"prompt":"P-numeric","answer":1}"#, ItemType::Numeric),
];

#[test]
fn accessors_return_each_variants_own_fields() {
    for (line, ty) in LINES {
        let p = parse_items(line);
        assert!(p.errors.is_empty(), "{line}: {:?}", p.errors);
        let item = &p.items[0].1;
        let name = ty.as_str();
        assert_eq!(item.item_type(), *ty);
        assert_eq!(item.unit(), format!("u-{name}"));
        assert_eq!(item.prompt(), format!("P-{name}"));
        let id = item.id();
        assert!(id.len() == 2, "{id}");
        let retired = id == "c1";
        assert_eq!(item.is_retired(), retired, "{name}");
        let tags: &[&str] = match name {
            "choice" => &["a", "b"],
            "gap" => &["t"],
            "multi" => &["z"],
            "numeric" => &["q"],
            _ => &[],
        };
        assert_eq!(item.tags(), tags, "{name}");
        if id == "c1" {
            assert_eq!(item.supersedes_field(), Some(&["o1".to_string()][..]));
            assert_eq!(item.stimulus(), Some("S1"));
            assert_eq!(item.speak(), Some("K1"));
            assert_eq!(item.entity(), Some("E1"));
        } else {
            assert_eq!(item.supersedes_field(), None);
            assert_eq!(item.stimulus(), None);
            assert_eq!(item.speak(), None);
            assert_eq!(item.entity(), None);
        }
    }
}
