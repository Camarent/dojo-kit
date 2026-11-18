use super::{COURSE_FILE, Sink};
use crate::content::{Course, SrsScope};
use std::collections::HashSet;

const MAX_SESSION_CAP: u32 = 500;

/// The grammar word followed by ` #<number>`: a catalogue title that names no grammar point.
pub(super) fn is_grammar_number_title(topic: &str) -> bool {
    topic
        .trim()
        .strip_prefix("\u{0413}\u{0440}\u{0430}\u{043c}\u{043c}\u{0430}\u{0442}\u{0438}\u{043a}\u{0430} #")
        .is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
}

/// The answer word followed by `:` and a `;`-separated list: an answer list used as the catalogue entry text.
pub(super) fn is_answer_list(topic: &str) -> bool {
    topic
        .trim()
        .strip_prefix("\u{041f}\u{0440}\u{0430}\u{0432}\u{0438}\u{043b}\u{044c}\u{043d}\u{043e}:")
        .is_some_and(|rest| rest.split(';').all(|part| !part.trim().is_empty()))
}

pub(super) fn check_topics(course: &Course, sink: &mut Sink) {
    let Some(topics) = &course.topics else {
        // A unit key is `<entity>|<aspect>`; without topics there are no aspects to key by.
        for unit in &course.units {
            let scope = unit.srs.as_ref().and_then(|s| s.scope).or(course.srs.as_ref().and_then(|s| s.scope));
            if scope == Some(SrsScope::Unit) {
                sink.error("unit_scope_no_topics", COURSE_FILE, 0, format!("unit '{}' has srs.scope unit but the course has no topics", unit.id));
            }
        }
        return;
    };

    for unit_id in &topics.units {
        match course.units.iter().find(|u| &u.id == unit_id) {
            None => sink.error("topics_unit_unknown", COURSE_FILE, 0, format!("topics unit '{unit_id}' is not in course units")),
            Some(unit) if unit.srs.as_ref().and_then(|s| s.scope) == Some(SrsScope::Entity) => sink.error(
                "topics_unit_scoped",
                COURSE_FILE,
                0,
                format!("topics unit '{unit_id}' has srs.scope entity; topics need item scope"),
            ),
            Some(_) => {}
        }
    }

    let mut seen: HashSet<&str> = HashSet::new();
    for rule in &topics.aspects {
        if !seen.insert(rule.id.as_str()) {
            sink.error("topics_aspect_duplicate", COURSE_FILE, 0, format!("topics aspect '{}' is listed twice", rule.id));
        }
        let has_tags = rule.tags.as_ref().is_some_and(|t| !t.is_empty());
        let has_units = rule.units.as_ref().is_some_and(|u| !u.is_empty());
        if !has_tags && !has_units {
            sink.error("topics_aspect_empty", COURSE_FILE, 0, format!("topics aspect '{}' needs tags or units", rule.id));
        }
    }

    for pool in topics.pool_aspects.iter().flatten() {
        if !topics.aspects.iter().any(|rule| &rule.id == pool) {
            sink.error("topics_pool_unknown", COURSE_FILE, 0, format!("topics poolAspects '{pool}' is not a listed aspect id"));
        }
    }

    if let Some(cap) = topics.session_cap
        && (cap == 0 || cap > MAX_SESSION_CAP)
    {
        sink.error("topics_cap_range", COURSE_FILE, 0, format!("topics sessionCap must be 1 to {MAX_SESSION_CAP}, got {cap}"));
    }
}
