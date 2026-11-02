use super::*;

fn grouped(sizes: &[usize]) -> Vec<Candidate> {
    let mut out = Vec::new();
    for (g, &n) in sizes.iter().enumerate() {
        for k in 0..n {
            out.push(Candidate {
                id: format!("g{g}-{k}"),
                unit: "u".to_string(),
                tags: vec![],
                item_type: "choice".to_string(),
                stimulus: Some(format!("g{g}")),
                exam_only: false,
            });
        }
    }
    out
}

#[test]
fn sample_fill_property_200_seeds() {
    let cands = grouped(&[3, 2, 2]);
    let sections = vec![Section { title: "s".to_string(), count: 4, units: None, tags: None, types: None }];
    for seed in 0..200u64 {
        let s = sample(&cands, &sections, seed);
        assert_eq!(s.ids.len(), 4, "seed {seed}");
        assert!(s.short.is_empty(), "seed {seed}");
        let mut seen = HashSet::new();
        for id in &s.ids {
            assert!(seen.insert(id), "duplicate id in output for seed {seed}");
        }
    }
    let sections = vec![Section { title: "s".to_string(), count: 5, units: None, tags: None, types: None }];
    let cands = grouped(&[4, 4]);
    for seed in 0..200u64 {
        let s = sample(&cands, &sections, seed);
        assert_eq!(s.ids.len(), 4, "seed {seed}");
        assert_eq!(s.short.len(), 1, "seed {seed}");
        assert_eq!(s.short[0].short_by, 1, "seed {seed}");
        let mut seen = HashSet::new();
        for id in &s.ids {
            assert!(seen.insert(id), "duplicate id in output for seed {seed}");
        }
        for group in &cands {
            if group.stimulus.is_some() {
                let group_ids: Vec<&str> = cands.iter().filter(|c| c.stimulus == group.stimulus).map(|c| c.id.as_str()).collect();
                for id in &s.ids {
                    if group_ids.contains(&id.as_str()) {
                        for gid in &group_ids {
                            assert!(s.ids.contains(&gid.to_string()), "stimulus group not kept whole for seed {seed}");
                        }
                        break;
                    }
                }
            }
        }
    }
}

#[test]
fn sample_huge_count_clamped_to_pool() {
    let cands = grouped(&[2, 3]);
    let sections = vec![Section { title: "s".to_string(), count: 1_000_000_000, units: None, tags: None, types: None }];
    let s = sample(&cands, &sections, 42);
    assert_eq!(s.ids.len(), 5);
    assert_eq!(s.short.len(), 1);
    assert_eq!(s.short[0].title, "s");
    assert_eq!(s.short[0].short_by, 999_999_995);
    let mut seen = HashSet::new();
    for id in &s.ids {
        assert!(seen.insert(id), "duplicate id");
    }
}
#[test]
fn sample_basic() {
    let candidates = vec![
        Candidate { id: "c1".to_string(), unit: "u1".to_string(), tags: vec![], item_type: "choice".to_string(), stimulus: None, exam_only: false },
        Candidate { id: "c2".to_string(), unit: "u1".to_string(), tags: vec![], item_type: "choice".to_string(), stimulus: None, exam_only: false },
        Candidate { id: "c3".to_string(), unit: "u1".to_string(), tags: vec![], item_type: "choice".to_string(), stimulus: None, exam_only: false },
    ];
    let sections = vec![
        Section { title: "s1".to_string(), count: 2, units: None, tags: None, types: None },
    ];
    let r = sample(&candidates, &sections, 42);
    assert_eq!(r.ids.len(), 2);
    assert_eq!(r.sections.len(), 1);
    assert_eq!(r.sections[0].title, "s1");
    assert_eq!(r.sections[0].start, 0);
    assert_eq!(r.sections[0].count, 2);
    assert!(r.short.is_empty());
}

#[test]
fn sample_with_sections_output() {
    let candidates = vec![
        Candidate { id: "c1".to_string(), unit: "u1".to_string(), tags: vec![], item_type: "choice".to_string(), stimulus: None, exam_only: false },
        Candidate { id: "c2".to_string(), unit: "u1".to_string(), tags: vec![], item_type: "choice".to_string(), stimulus: None, exam_only: false },
        Candidate { id: "c3".to_string(), unit: "u1".to_string(), tags: vec![], item_type: "choice".to_string(), stimulus: None, exam_only: false },
        Candidate { id: "c4".to_string(), unit: "u1".to_string(), tags: vec![], item_type: "choice".to_string(), stimulus: None, exam_only: false },
    ];
    let sections = vec![
        Section { title: "s1".to_string(), count: 2, units: None, tags: None, types: None },
        Section { title: "s2".to_string(), count: 2, units: None, tags: None, types: None },
    ];
    let r = sample(&candidates, &sections, 42);
    assert_eq!(r.sections.len(), 2);
    assert_eq!(r.sections[0].title, "s1");
    assert_eq!(r.sections[1].title, "s2");
}
fn cand(id: &str, stim: Option<&str>, exam_only: bool) -> Candidate {
    Candidate {
        id: id.to_string(),
        unit: "u".to_string(),
        tags: vec![],
        item_type: "choice".to_string(),
        stimulus: stim.map(str::to_string),
        exam_only,
    }
}

fn section(title: &str, count: usize) -> Section {
    Section { title: title.to_string(), count, units: None, tags: None, types: None }
}

#[test]
fn exam_only_items_are_drawn_before_regular() {
    let cands = vec![
        cand("r1", None, false),
        cand("e1", None, true),
        cand("r2", None, false),
        cand("e2", None, true),
        cand("r3", None, false),
    ];
    for seed in 0..50u64 {
        let s = sample(&cands, &[section("s", 3)], seed);
        let mut first_two: Vec<&str> = s.ids[..2].iter().map(String::as_str).collect();
        first_two.sort();
        assert_eq!(first_two, ["e1", "e2"], "seed {seed}");
        assert!(s.ids[2].starts_with('r'), "seed {seed}");
        assert!(s.short.is_empty());
    }
}

#[test]
fn too_few_exam_only_items_are_topped_up_from_regular() {
    let cands = vec![cand("e1", None, true), cand("r1", None, false), cand("r2", None, false), cand("r3", None, false)];
    for seed in 0..50u64 {
        let s = sample(&cands, &[section("s", 3)], seed);
        assert_eq!(s.ids.len(), 3, "seed {seed}");
        assert_eq!(s.ids[0], "e1", "seed {seed}");
        assert!(s.short.is_empty());
    }
    let s = sample(&cands, &[section("s", 6)], 1);
    assert_eq!(s.ids.len(), 4);
    assert_eq!(s.short, vec![Shortage { title: "s".to_string(), short_by: 2 }]);
}

#[test]
fn all_exam_only_matches_unflagged_for_200_seeds() {
    let build = |flag: bool| {
        vec![
            cand("a", None, flag),
            cand("b", Some("s1"), flag),
            cand("c", Some("s1"), flag),
            cand("d", None, flag),
            cand("e", Some("s2"), flag),
            cand("f", Some("s2"), flag),
            cand("g", Some("s2"), flag),
            cand("h", None, flag),
        ]
    };
    let sections = [section("x", 4), section("y", 3)];
    for seed in 0..200u64 {
        assert_eq!(sample(&build(true), &sections, seed), sample(&build(false), &sections, seed), "seed {seed}");
    }
}

#[test]
fn regular_stimulus_group_without_exam_only_keeps_input_order() {
    let cands = vec![cand("f0", None, false), cand("f1", Some("s2"), false), cand("f2", Some("s2"), false)];
    let s = sample(&cands, &[section("a", 3), section("b", 2)], 15);
    assert_eq!(s.ids, ["f0", "f1", "f2"]);
    assert_eq!(s.short.len(), 1);
    assert_eq!(s.short[0].title, "b");
    assert_eq!(s.short[0].short_by, 2);
}

#[test]
fn stimulus_group_with_one_exam_only_member_is_drawn_whole_and_first() {
    let cands = vec![
        cand("r1", None, false),
        cand("g1", Some("g"), false),
        cand("g2", Some("g"), true),
        cand("r2", None, false),
    ];
    for seed in 0..50u64 {
        let s = sample(&cands, &[section("s", 3)], seed);
        assert_eq!(&s.ids[..2], ["g1", "g2"], "seed {seed}");
        assert_eq!(s.ids.len(), 3);
    }
}

#[test]
fn later_section_skips_used_exam_only_items() {
    let cands = vec![cand("e1", None, true), cand("e2", None, true), cand("r1", None, false), cand("r2", None, false)];
    for seed in 0..50u64 {
        let s = sample(&cands, &[section("a", 2), section("b", 2)], seed);
        let mut a: Vec<&str> = s.ids[..2].iter().map(String::as_str).collect();
        a.sort();
        assert_eq!(a, ["e1", "e2"], "seed {seed}");
        let mut b: Vec<&str> = s.ids[2..].iter().map(String::as_str).collect();
        b.sort();
        assert_eq!(b, ["r1", "r2"], "seed {seed}");
    }
}
