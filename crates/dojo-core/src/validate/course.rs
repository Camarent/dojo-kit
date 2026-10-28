use super::exam;
use super::speech::{INPUT_SCRIPTS, validate_speech_config};
use super::{COURSE_FILE, Sink, check_detail_config, is_valid_course_id, parse_type, validate_fold};
use super::groups::{check_bars, check_groups};
use crate::content::{Course, TagLabel};
use std::collections::HashSet;

pub(super) fn check_plugin_path(path: &str, kind: &str, sink: &mut Sink) {
    let absolute = path.starts_with('/') || path.starts_with('\\') || path.as_bytes().get(1) == Some(&b':');
    if absolute || path.split(['/', '\\']).any(|seg| seg == "..") {
        sink.error("bad_plugin_path", COURSE_FILE, 0, format!("plugins.{kind} path '{}' is absolute or contains '..'", path));
    }
}

// Contract: `ladder.len() >= 2` is checked before `ladder[0]`; `windows(2)` yields two-element slices.
#[allow(clippy::indexing_slicing)]
pub(super) fn ladder_problem(ladder: &[i64]) -> Option<&'static str> {
    if ladder.len() < 2 {
        Some("has fewer than 2 entries")
    } else if ladder.iter().any(|&x| x < 0) {
        Some("has a negative entry")
    } else if ladder[0] != 0 {
        Some("must start with 0")
    } else if ladder.windows(2).any(|w| w[1] < w[0]) {
        Some("is not non-decreasing")
    } else {
        None
    }
}


fn check_units(course: &Course, sink: &mut Sink) {
    if !is_valid_course_id(&course.id) {
        sink.error("bad_course_id", COURSE_FILE, 0, format!("course id '{}' must match ^[a-z0-9][a-z0-9_-]{{0,47}}$", course.id));
    }
    let mut seen = HashSet::new();
    let has_placement = course.placement.is_some();
    for unit in &course.units {
        if !is_valid_course_id(&unit.id) {
            sink.error("bad_unit_id", COURSE_FILE, 0, format!("unit id '{}' must match ^[a-z0-9][a-z0-9_-]{{0,47}}$", unit.id));
        }
        if !seen.insert(unit.id.as_str()) {
            sink.error("duplicate_unit", COURSE_FILE, 0, format!("unit id '{}' is used more than once", unit.id));
        }
        if unit.new_per_day.is_some_and(|n| n < 0) {
            sink.error("bad_unit_settings", COURSE_FILE, 0, format!("unit '{}' has a negative newPerDay", unit.id));
        }
        if let Some(ladder) = unit.srs.as_ref().and_then(|s| s.ladder.as_ref())
            && let Some(problem) = ladder_problem(ladder) {
                sink.error("bad_unit_settings", COURSE_FILE, 0, format!("unit '{}' srs.ladder {problem}", unit.id));
            }
        if unit.placement == Some(false) && !has_placement {
            sink.warning("placement_unused", COURSE_FILE, 0, format!("unit '{}' has placement:false but course.placement is absent", unit.id));
        }
    }
    if course.units.is_empty() {
        sink.error("no_units", COURSE_FILE, 0, "course has no units".to_string());
    }
}

fn check_course_misc(course: &Course, sink: &mut Sink) {
    if let Some(plugins) = &course.plugins {
        for path in &plugins.scripts {
            check_plugin_path(path, "scripts", sink);
        }
        for path in &plugins.styles {
            check_plugin_path(path, "styles", sink);
        }
    }
    if let Some(norm) = &course.normalize {
        validate_fold(&norm.fold, COURSE_FILE, 0, sink);
    }
    if let Some(speech) = &course.speech {
        validate_speech_config(speech, COURSE_FILE, sink);
    }
    if let Some(scripts) = &course.input_script {
        if scripts.is_empty() {
            sink.error("unknown_input_script", COURSE_FILE, 0, "inputScript is empty".to_string());
        }
        for name in scripts {
            if !INPUT_SCRIPTS.contains(&name.as_str()) {
                sink.error("unknown_input_script", COURSE_FILE, 0, format!("inputScript '{}' is not one of {}", name, INPUT_SCRIPTS.join(", ")));
            }
        }
    }
    if let Some(labels) = &course.tag_labels {
        for (tag, label) in labels {
            if let TagLabel::Detail(d) = label
                && let Some(kind) = d.kind.as_deref()
                    && kind != "public" && kind != "internal" {
                        sink.warning("unknown_tag_kind", COURSE_FILE, 0, format!("tagLabels.{tag}.kind '{kind}' is not 'public' or 'internal'"));
                    }
        }
    }
    if let Some(placement) = &course.placement {
        if placement.per_unit < 1 {
            sink.error("bad_placement", COURSE_FILE, 0, format!("placement.perUnit must be >= 1, got {}", placement.per_unit));
        }
        if placement.mode != "check" && placement.mode != "self" {
            sink.error("bad_placement", COURSE_FILE, 0, format!("placement.mode must be 'check' or 'self', got '{}'", placement.mode));
        }
    }
    if let Some(ls) = course.learned_stage
        && ls < 1 {
            sink.error("bad_learned_stage", COURSE_FILE, 0, format!("learnedStage must be >= 1, got {}", ls));
        }
    
    // Validate groups
    check_groups(course, sink);
    
    // Validate bars
    check_bars(course, sink);
    
    // Validate detail config
    check_detail_config(&course.detail, COURSE_FILE, sink);
    for unit in &course.units {
        check_detail_config(&unit.detail, COURSE_FILE, sink);
    }
    
    // Validate scripts field - just check that it's a valid list (no structural validation needed)
    // The actual validation happens during foreign script checking
    if !course.scripts.is_empty() {
        // For now, just ensure it's not excessive
        if course.scripts.len() > 20 {
            sink.error("bad_course_id", COURSE_FILE, 0, "course.scripts has too many entries (> 20)".to_string());
        }
    }
}

fn check_srs(course: &Course, sink: &mut Sink) {
    if let Some(ladder) = course.srs.as_ref().and_then(|s| s.ladder.as_ref())
        && let Some(problem) = ladder_problem(ladder) {
            sink.error("bad_ladder", COURSE_FILE, 0, format!("srs.ladder {problem}"));
        }
    if let Some(map) = &course.srs_by_type {
        for (key, cfg) in map {
            if parse_type(key).is_none() {
                sink.error("srs_by_type_unknown", COURSE_FILE, 0, format!("srsByType key '{key}' is not an item type"));
            }
            if let Some(problem) = cfg.ladder.as_ref().and_then(|l| ladder_problem(l)) {
                sink.error("bad_ladder", COURSE_FILE, 0, format!("srsByType.{key}.ladder {problem}"));
            }
            if cfg.scope.is_some() || cfg.drill.is_some() {
                sink.error("scope_by_type", COURSE_FILE, 0, format!("srsByType.{key} cannot set scope or drill"));
            }
        }
    }

    let drops = course
        .srs
        .iter()
        .map(|s| ("srs".to_string(), s))
        .chain(course.srs_by_type.iter().flatten().map(|(k, s)| (format!("srsByType.{k}"), s)))
        .chain(course.units.iter().filter_map(|u| u.srs.as_ref().map(|s| (format!("unit '{}' srs", u.id), s))));
    for (place, cfg) in drops {
        if cfg.drop_on_wrong.is_some_and(|d| !(0..=10).contains(&d)) {
            sink.error("bad_drop", COURSE_FILE, 0, format!("{place}.dropOnWrong must be an integer from 0 to 10"));
        }
        if cfg.drill.is_some_and(|d| !(1..=5).contains(&d)) {
            sink.error("bad_drill", COURSE_FILE, 0, format!("{place}.drill must be an integer from 1 to 5"));
        }
    }
}

pub(super) fn check_course(course: &Course, sink: &mut Sink) {
    check_units(course, sink);
    check_course_misc(course, sink);
    check_srs(course, sink);
    exam::check_exams(course, sink);
}
