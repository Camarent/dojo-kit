use super::*;
use crate::content::{ChoiceItem, Course, GapItem, CardItem, Status};

fn make_course() -> Course {
    Course {
        id: "test".to_string(),
        title: "Test Course".to_string(),
        ui_language: "en".to_string(),
        detail: None,
        content_language: None,
        audio: None,
        confusions: None,
        timer: None,
        units: vec![
            crate::content::Unit { id: "unit-1".to_string(), title: "Unit 1".to_string(), new_per_day: None, srs: None, placement: None, detail: None, new_order: None, exam_only: None, timer: None },
            crate::content::Unit { id: "unit-2".to_string(), title: "Unit 2".to_string(), new_per_day: None, srs: None, placement: None, detail: None, new_order: None, exam_only: None, timer: None },
        ],
        types: None,
        srs: None,
        srs_by_type: None,
        exam: None,
        exams: vec![],
        storage: None,
        plugins: None,
        markup: None,
        normalize: None,
        speech: None,
        placement: None,
        new_order: None,
        scripts: vec![],
        allow_override: None,
        intro_new: None,
        dont_know: None,
        learned_stage: None,
        groups: vec![],
        bars: vec![],
        tag_labels: None,
        input_script: None,
        ruby: None,
        captions: None,
        breakdown: None,
    }
}

fn choice_item(id: &str, unit: &str) -> Item {
    Item::Choice(ChoiceItem {
        id: id.to_string(),
        unit: unit.to_string(),
        tags: vec![],
        prompt: "Test prompt".to_string(),
        explanation: None,
        source: None,
        status: None,
        supersedes: None,
        options: vec!["a".to_string(), "b".to_string()],
        answer: 0,
        meta: None,
        stimulus: None,
        speak: None,
        entity: None,
        topic: None,
    })
}

fn gap_item(id: &str, unit: &str) -> Item {
    Item::Gap(GapItem {
        id: id.to_string(),
        unit: unit.to_string(),
        tags: vec![],
        prompt: "Test prompt".to_string(),
        explanation: None,
        source: None,
        status: None,
        supersedes: None,
        answers: vec!["answer".to_string()],
        retry: vec![],
        normalize: None,
        input_mode: None,
        meta: None,
        stimulus: None,
        speak: None,
        entity: None,
        topic: None,
    })
}

fn card_item(id: &str, unit: &str, retired: bool) -> Item {
    Item::Card(CardItem {
        id: id.to_string(),
        unit: unit.to_string(),
        tags: vec![],
        prompt: "Test prompt".to_string(),
        explanation: None,
        source: None,
        status: if retired { Some(Status::Retired) } else { None },
        supersedes: None,
        back: "answer".to_string(),
        meta: None,
        stimulus: None,
        speak: None,
        entity: None,
        topic: None,
    })
}

#[test]
fn empty_course() {
    let course = make_course();
    let items: Vec<Item> = vec![];
    let stats = compute(&course, &items);
    assert_eq!(stats.course, "test");
    assert_eq!(stats.units.len(), 2);
    assert_eq!(stats.units[0].id, "unit-1");
    assert_eq!(stats.units[0].active.len(), 0);
    assert_eq!(stats.units[0].retired, 0);
    assert_eq!(stats.totals.total_active, 0);
    assert_eq!(stats.totals.retired, 0);
    assert_eq!(stats.exam.len(), 0);
}

#[test]
fn single_choice_item() {
    let course = make_course();
    let items = vec![choice_item("u1-1", "unit-1")];
    let stats = compute(&course, &items);
    assert_eq!(stats.totals.total_active, 1);
    assert_eq!(stats.totals.active.get("choice"), Some(&1));
    assert_eq!(stats.units[0].active.get("choice"), Some(&1));
    assert_eq!(stats.units[1].active.get("choice"), None);
}

#[test]
fn mixed_items() {
    let course = make_course();
    let items = vec![
        choice_item("u1-1", "unit-1"),
        gap_item("u1-2", "unit-1"),
        card_item("u2-1", "unit-2", false),
    ];
    let stats = compute(&course, &items);
    assert_eq!(stats.totals.total_active, 3);
    assert_eq!(stats.totals.active.get("choice"), Some(&1));
    assert_eq!(stats.totals.active.get("gap"), Some(&1));
    assert_eq!(stats.totals.active.get("card"), Some(&1));
    assert_eq!(stats.units[0].active.get("choice"), Some(&1));
    assert_eq!(stats.units[0].active.get("gap"), Some(&1));
    assert_eq!(stats.units[1].active.get("card"), Some(&1));
}

#[test]
fn retired_item() {
    let course = make_course();
    let items = vec![
        choice_item("u1-1", "unit-1"),
        card_item("u1-2", "unit-1", true),
    ];
    let stats = compute(&course, &items);
    assert_eq!(stats.totals.total_active, 1);
    assert_eq!(stats.totals.retired, 1);
    assert_eq!(stats.units[0].retired, 1);
    assert_eq!(stats.totals.active.get("choice"), Some(&1));
    assert_eq!(stats.totals.active.get("card"), Some(&0));
}

#[test]
fn self_rated_not_exam_eligible() {
    use crate::exam::Section;
    let course = Course {
        id: "test".to_string(),
        title: "Test".to_string(),
        ui_language: "en".to_string(),
        detail: None,
        content_language: None,
        audio: None,
        confusions: None,
        timer: None,
        units: vec![crate::content::Unit { id: "unit-1".to_string(), title: "Unit 1".to_string(), new_per_day: None, srs: None, placement: None, detail: None, new_order: None, exam_only: None, timer: None }],
        types: None,
        srs: None,
        srs_by_type: None,
        exam: Some(crate::content::ExamConfig {
            id: "default".to_string(),
            title: None,
            minutes: Some(10),
            pass_mark: Some(0.7),
            sections: vec![Section {
                title: "Test Section".to_string(),
                count: 10,
                units: None,
                tags: None,
                types: None,
            }],
            timing: None,
            scoring: vec![],
            pass_points: None,
            note: None,
            pass: None,
        }),
        exams: vec![],
        storage: None,
        plugins: None,
        markup: None,
        normalize: None,
        speech: None,
        placement: None,
        new_order: None,
        scripts: vec![],
        allow_override: None,
        intro_new: None,
        dont_know: None,
        learned_stage: None,
        groups: vec![],
        bars: vec![],
        tag_labels: None,
        input_script: None,
        ruby: None,
        captions: None,
        breakdown: None,
    };
    let items = vec![
        choice_item("u1-1", "unit-1"),
        card_item("u1-2", "unit-1", false),
    ];
    let stats = compute(&course, &items);
    assert_eq!(stats.exam.len(), 1);
    assert_eq!(stats.exam[0].title, "Test Section");
    assert_eq!(stats.exam[0].requested, 10);
    assert_eq!(stats.exam[0].available, 1); // Only choice is eligible, not card
}

#[test]
fn tags_counted() {
    let course = make_course();
    let mut choice = choice_item("u1-1", "unit-1");
    if let Item::Choice(ref mut c) = choice {
        c.tags = vec!["tag1".to_string(), "tag2".to_string()];
    }
    let items = vec![choice];
    let stats = compute(&course, &items);
    assert_eq!(stats.tags.len(), 2);
    let tag1_count = stats.tags.iter().find(|t| t.tag == "tag1").map(|t| t.count);
    let tag2_count = stats.tags.iter().find(|t| t.tag == "tag2").map(|t| t.count);
    assert_eq!(tag1_count, Some(1));
    assert_eq!(tag2_count, Some(1));
}
