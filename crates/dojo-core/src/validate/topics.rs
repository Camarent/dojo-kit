use super::{COURSE_FILE, Sink};
use crate::content::{Course, SrsScope};
use std::collections::HashSet;

const MAX_SESSION_CAP: u32 = 500;

pub(super) fn check_topics(course: &Course, sink: &mut Sink) {
    let Some(topics) = &course.topics else {
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
