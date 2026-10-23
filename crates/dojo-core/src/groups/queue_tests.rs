use super::*;
use serde_json::json;

use std::collections::{HashMap, HashSet};
use serde_json::{Map, Value};

    fn s(v: &str) -> String {
        v.to_string()
    }

    struct Fixture {
        order: Vec<String>,
        units: HashMap<String, String>,
        entities: HashMap<String, String>,
    }

    /// Group unit `k` entities e0..e(n-1); entity `big` index has 4 items, others 1.
    fn kanji_fixture(n: usize, big: usize) -> Fixture {
        let mut f = Fixture { order: vec![], units: HashMap::new(), entities: HashMap::new() };
        for i in 0..n {
            let count = if i == big { 4 } else { 1 };
            for j in 0..count {
                let id = format!("k{i}-{j}");
                f.order.push(id.clone());
                f.units.insert(id.clone(), s("k"));
                f.entities.insert(id, format!("e{i}"));
            }
        }
        f
    }

    fn group_args(cap: u32) -> (HashMap<String, u32>, HashMap<String, Vec<String>>) {
        (HashMap::from([(s("g"), cap)]), HashMap::from([(s("g"), vec![s("k")])]))
    }

    fn queue(f: &Fixture, allowance: i64, cap: u32, used: i64, random: Option<&HashSet<String>>) -> crate::srs::Queue {
        let (caps, gu) = group_args(cap);
        let used = HashMap::from([(s("newBy:g:g"), used)]);
        build_queue_with_groups(
            &json!({}), &f.order, 0, allowance, None, Some(&f.units), Some(&f.entities),
            Some(&caps), Some(&gu), random, &used, "2024-01-01", "c",
        )
    }

    #[test]
    fn cap_never_splits_entity_tenth_brings_four_items() {
        let f = kanji_fixture(12, 9);
        let q = queue(&f, 0, 10, 0, None);
        assert_eq!(q.fresh.len(), 9 + 4);
        assert!(q.fresh.contains(&s("k9-3")));
        assert!(!q.fresh.contains(&s("k10-0")));
    }

    #[test]
    fn cap_is_decremented_per_entity_and_honours_used() {
        let f = kanji_fixture(12, 9);
        assert_eq!(queue(&f, 0, 10, 8, None).fresh, vec!["k0-0", "k1-0"]);
        let g = kanji_fixture(12, 1);
        assert_eq!(queue(&g, 0, 10, 8, None).fresh, vec!["k0-0", "k1-0", "k1-1", "k1-2", "k1-3"]);
        assert!(queue(&f, 0, 10, 10, None).fresh.is_empty());
        assert_eq!(queue(&f, 0, 3, 0, None).fresh, vec!["k0-0", "k1-0", "k2-0"]);
    }

    #[test]
    fn started_entity_new_items_are_free() {
        let f = kanji_fixture(3, 0);
        let (caps, gu) = group_args(1);
        let recs = json!({"k0-0": {"due": 99, "s": 1}});
        let used = HashMap::new();
        let q = build_queue_with_groups(
            &recs, &f.order, 0, 0, None, Some(&f.units), Some(&f.entities),
            Some(&caps), Some(&gu), None, &used, "d", "c",
        );
        assert_eq!(q.fresh, vec!["k0-1", "k0-2", "k0-3", "k1-0"]);
    }

    #[test]
    fn grouped_items_exempt_from_global_and_unit_caps() {
        let mut f = kanji_fixture(4, 99);
        for i in 0..5 {
            let id = format!("w{i}");
            f.order.push(id.clone());
            f.units.insert(id, s("w"));
        }
        let (caps, gu) = group_args(3);
        let unit_caps = HashMap::from([(s("k"), 1u32), (s("w"), 4u32)]);
        let used = HashMap::new();
        let q = build_queue_with_groups(
            &json!({}), &f.order, 0, 2, Some(&unit_caps), Some(&f.units), Some(&f.entities),
            Some(&caps), Some(&gu), None, &used, "d", "c",
        );
        let grouped: Vec<_> = q.fresh.iter().filter(|i| i.starts_with('k')).collect();
        let loose: Vec<_> = q.fresh.iter().filter(|i| i.starts_with('w')).collect();
        assert_eq!(grouped.len(), 3);
        assert_eq!(loose, vec!["w0", "w1"]);
    }

    #[test]
    fn unit_cap_applies_to_ungrouped_units() {
        let mut f = kanji_fixture(1, 99);
        for i in 0..5 {
            let id = format!("w{i}");
            f.order.push(id.clone());
            f.units.insert(id, s("w"));
        }
        let (caps, gu) = group_args(3);
        let unit_caps = HashMap::from([(s("w"), 2u32)]);
        let used = HashMap::new();
        let q = build_queue_with_groups(
            &json!({}), &f.order, 0, 10, Some(&unit_caps), Some(&f.units), Some(&f.entities),
            Some(&caps), Some(&gu), None, &used, "d", "c",
        );
        assert_eq!(q.fresh, vec!["k0-0", "w0", "w1"]);
    }

    #[test]
    fn no_groups_output_identical_to_build_queue() {
        let order: Vec<String> = (0..40).map(|i| format!("i{i}")).collect();
        let mut recs = Map::new();
        for i in (0..40).step_by(3) {
            recs.insert(format!("i{i}"), json!({"due": (i as i64 * 7) % 50, "s": 1}));
        }
        recs.insert(s("i1"), Value::Null);
        let recs = Value::Object(recs);
        let units: HashMap<String, String> =
            order.iter().enumerate().map(|(i, id)| (id.clone(), format!("u{}", i % 3))).collect();
        let ents: HashMap<String, String> = order.iter().map(|id| (id.clone(), format!("e-{id}"))).collect();
        let unit_caps = HashMap::from([(s("u1"), 2u32)]);
        let used = HashMap::new();
        for (allow, caps) in [(5i64, None), (0, None), (100, None), (6, Some(&unit_caps))] {
            let old = crate::srs::build_queue_with_caps(&recs, &order, 30, allow, caps, Some(&units));
            let none = build_queue_with_groups(&recs, &order, 30, allow, caps, Some(&units), None, None, None, None, &used, "d", "c");
            assert_eq!(old, none);
            // groups configured but no item in them
            let gcaps = HashMap::from([(s("g"), 3u32)]);
            let gunits = HashMap::from([(s("g"), vec![s("elsewhere")])]);
            let ungrouped = build_queue_with_groups(
                &recs, &order, 30, allow, caps, Some(&units), Some(&ents), Some(&gcaps), Some(&gunits), None, &used, "d", "c",
            );
            assert_eq!(old, ungrouped);
            // empty group config
            let empty_caps = HashMap::new();
            let empty_units = HashMap::new();
            let empty = build_queue_with_groups(
                &recs, &order, 30, allow, caps, Some(&units), Some(&ents), Some(&empty_caps), Some(&empty_units), None, &used, "d", "c",
            );
            assert_eq!(old, empty);
        }
        let plain = crate::srs::build_queue(&recs, &order, 30, 5);
        let via = build_queue_with_groups(&recs, &order, 30, 5, None, None, None, None, None, None, &used, "d", "c");
        assert_eq!(plain, via);
    }


    #[test]
    fn shuffle_is_deterministic_and_seed_sensitive() {
        let base: Vec<String> = (0..20).map(|i| format!("e{i}")).collect();
        let run = |c: &str, d: &str, g: &str| {
            let mut v = base.clone();
            shuffle_entities(&mut v, c, d, g);
            v
        };
        assert_eq!(run("c", "d1", "g"), run("c", "d1", "g"));
        assert_ne!(run("c", "d1", "g"), run("c", "d2", "g"));
        assert_ne!(run("c", "d1", "g"), run("c", "d1", "h"));
        assert_ne!(run("c", "d1", "g"), run("x", "d1", "g"));
        let mut sorted = run("c", "d1", "g");
        sorted.sort();
        let mut want = base.clone();
        want.sort();
        assert_eq!(sorted, want);
    }

    #[test]
    fn random_group_shuffles_entities_not_items_and_caps_entities() {
        let f = kanji_fixture(12, 9);
        let random = HashSet::from([s("g")]);
        let q = queue(&f, 0, 5, 0, Some(&random));
        assert_eq!(q, queue(&f, 0, 5, 0, Some(&random)));
        assert_ne!(q.fresh, queue(&f, 0, 5, 0, None).fresh);
        let ents: HashSet<&String> = q.fresh.iter().map(|i| &f.entities[i]).collect();
        assert_eq!(ents.len(), 5);
        // items of one entity stay contiguous and complete
        for e in &ents {
            let want = f.entities.values().filter(|v| v == e).count();
            assert_eq!(q.fresh.iter().filter(|i| &&f.entities[*i] == e).count(), want);
        }
        let first_pos: Vec<usize> = q.fresh.iter().enumerate().filter(|(_, i)| i.ends_with("-0")).map(|(p, _)| p).collect();
        assert!(first_pos.windows(2).all(|w| w[1] > w[0]));
    }
