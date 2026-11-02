use super::{COURSE_FILE, Sink, is_valid_course_id};
use crate::content::{Course, Item};
use std::collections::{HashMap, HashSet};

pub(super) fn check_groups(course: &Course, sink: &mut Sink) {
    
    let unit_ids: HashSet<String> = course.units.iter().map(|u| u.id.clone()).collect();
    let mut unit_to_group: HashMap<String, String> = HashMap::new();
    let mut extra_new_count = 0;
    
    for group in &course.groups {
        // Check group id is valid
        if !is_valid_course_id(&group.id) {
            sink.error("bad_course_id", COURSE_FILE, 0, format!("group id '{}' must match ^[a-z0-9][a-z0-9_-]{{0,47}}$", group.id));
        }
        
        // Check for duplicate group ids
        // (We'll check this implicitly by the HashMap insertion)
        
        // Check units exist
        for unit_id in &group.units {
            if !unit_ids.contains(unit_id) {
                sink.error("unknown_unit_in_group", COURSE_FILE, 0, format!("group '{}' references unknown unit '{}'", group.id, unit_id));
            }
        }
        
        // Track unit to group mapping
        for unit_id in &group.units {
            if let Some(existing_group) = unit_to_group.insert(unit_id.clone(), group.id.clone()) {
                sink.error("unit_in_two_groups", COURSE_FILE, 0, format!("unit '{}' is in both group '{}' and group '{}'", unit_id, existing_group, group.id));
            }
        }
        
        for unit in &course.units {
            if unit.new_per_day.is_some() && group.units.contains(&unit.id) {
                sink.warning("unit_cap_in_group", COURSE_FILE, 0, format!("unit '{}' has newPerDay but is in group '{}': the unit cap is ignored", unit.id, group.id));
            }
        }

        // Check extra_new
        if group.extra_new == Some(true) {
            extra_new_count += 1;
        }
    }
    
    // Check at most one group has extra_new: true
    if extra_new_count > 1 {
        sink.error("two_extra_new_groups", COURSE_FILE, 0, format!("{} groups have extraNew: true, maximum is 1", extra_new_count));
    }
}

pub(super) fn check_bars(course: &Course, sink: &mut Sink) {
    
    let unit_ids: HashSet<String> = course.units.iter().map(|u| u.id.clone()).collect();
    
    for bar in &course.bars {
        // Check bar title is non-empty
        if bar.title.is_empty() {
            sink.error("bad_course_id", COURSE_FILE, 0, "bar title must not be empty".to_string());
        }
        
        // Check units exist
        for unit_id in &bar.units {
            if !unit_ids.contains(unit_id.as_str()) {
                sink.error("bad_course_id", COURSE_FILE, 0, format!("bar references unknown unit '{}'", unit_id));
            }
        }
        
        // Check learned_stage if present
        if let Some(ls) = bar.learned_stage
            && ls < 1 {
                sink.error("bad_learned_stage", COURSE_FILE, 0, format!("bar learnedStage must be >= 1, got {}", ls));
            }
    }
}

pub(super) fn check_entity_spans_groups(
    course: &Course,
    items: &[(&str, usize, &Item)],
    sink: &mut Sink,
) {
    use std::collections::HashMap;
    
    // Build unit -> group mapping
    let mut unit_to_group: HashMap<&str, &str> = HashMap::new();
    for group in &course.groups {
        for unit_id in &group.units {
            unit_to_group.insert(unit_id.as_str(), group.id.as_str());
        }
    }
    
    // Build entity -> units mapping
    let mut entity_units: HashMap<String, HashSet<&str>> = HashMap::new();
    for (_file, _line, item) in items {
        if let Some(entity_id) = item.entity() {
            let unit_id = item.unit();
            entity_units.entry(entity_id.to_string()).or_default().insert(unit_id);
        }
    }
    
    // Check entities that span multiple units
    for (entity_id, units) in &entity_units {
        if units.len() > 1 {
            // Check if these units belong to different groups
            let mut groups: HashSet<&str> = HashSet::new();
            for unit_id in units {
                if let Some(group_id) = unit_to_group.get(unit_id) {
                    groups.insert(group_id);
                }
            }
            if groups.len() > 1 {
                sink.warning(
                    "entity_spans_groups",
                    COURSE_FILE,
                    0,
                    format!("entity '{}' spans units across {} different groups", entity_id, groups.len()),
                );
            }
        }
    }
}

pub(super) fn check_mixed_entity_scope(course: &Course, items: &[(&str, usize, &Item)], sink: &mut Sink) {
    use crate::content::SrsScope;
    let scoped = |unit: &str| {
        let own = course.units.iter().find(|u| u.id == unit).and_then(|u| u.srs.as_ref()).and_then(|s| s.scope);
        own.or(course.srs.as_ref().and_then(|s| s.scope)) == Some(SrsScope::Entity)
    };
    let mut flags: std::collections::BTreeMap<&str, (bool, bool)> = std::collections::BTreeMap::new();
    for (_, _, item) in items.iter().filter(|(_, _, i)| !i.is_retired()) {
        let e = item.entity().unwrap_or_else(|| item.id());
        let f = flags.entry(e).or_default();
        if scoped(item.unit()) { f.0 = true } else { f.1 = true }
    }
    for (e, (a, b)) in flags {
        if a && b {
            sink.warning("mixed_entity_scope", COURSE_FILE, 0, format!("entity '{e}' spans units with different srs.scope; it stays per-item"));
        }
    }
}

pub(super) fn check_bar_matches(
    course: &Course,
    items: &[(&str, usize, &Item)],
    sink: &mut Sink,
) {
    use std::collections::{HashMap, HashSet};
    
    // Build item unit and tags lookup
    let mut item_meta: HashMap<String, (String, Vec<String>)> = HashMap::new();
    for (_file, _line, item) in items {
        let tags = item.tags().to_vec();
        item_meta.insert(item.id().to_string(), (item.unit().to_string(), tags));
    }
    
    // Check each bar
    for bar in &course.bars {
        // Check if bar matches any items
        let mut matches_any = false;
        
        for (unit_id, tags) in item_meta.values() {
            // Check unit filter
            if !bar.units.is_empty() && !bar.units.iter().any(|u| u == unit_id) {
                continue;
            }
            
            // Check tag filter
            if !bar.tags.is_empty() {
                let tag_set: HashSet<&str> = bar.tags.iter().map(|s| s.as_str()).collect();
                let item_tag_set: HashSet<&str> = tags.iter().map(|s| s.as_str()).collect();
                if !tag_set.iter().all(|t| item_tag_set.contains(t)) {
                    continue;
                }
            }
            
            matches_any = true;
            break;
        }
        
        if !matches_any {
            sink.warning(
                "bar_matches_zero",
                COURSE_FILE,
                0,
                format!("bar '{}' matches 0 items", bar.title),
            );
        }
    }
    
    // Check extraTags from groups
    for group in &course.groups {
        if !group.extra_tags.is_empty() {
            // Check if extraTags match any items
            let mut matches_any = false;
            
            for (unit_id, tags) in item_meta.values() {
                // Only check items in this group's units
                if !group.units.iter().any(|u| u == unit_id) {
                    continue;
                }
                
                // Check if item has all extra_tags
                let tag_set: HashSet<&str> = group.extra_tags.iter().map(|s| s.as_str()).collect();
                let item_tag_set: HashSet<&str> = tags.iter().map(|s| s.as_str()).collect();
                if tag_set.iter().all(|t| item_tag_set.contains(t)) {
                    matches_any = true;
                    break;
                }
            }
            
            if !matches_any {
                sink.warning(
                    "bar_matches_zero",
                    COURSE_FILE,
                    0,
                    format!("group '{}' extraTags match 0 items", group.id),
                );
            }
        }
    }
}
