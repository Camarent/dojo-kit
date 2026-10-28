use super::*;
use crate::exam::resolve_mode;
use crate::content::{PassMode, PassBasis};

pub(super) fn check_exams(course: &Course, sink: &mut Sink) {
    check_exam_ids(course, sink);
    let all_exams: Vec<(&str, &ExamConfig)> = course
        .exam
        .iter()
        .map(|e| ("default", e))
        .chain(course.exams.iter().map(|e| (e.id.as_str(), e)))
        .collect();

    for (id, exam) in all_exams {
        check_exam_pass(id, exam, sink);
        let mut title_counts: HashMap<&str, usize> = HashMap::new();
        for s in &exam.sections {
            *title_counts.entry(s.title.as_str()).or_default() += 1;
        }
        let mut dup_reported: HashSet<String> = HashSet::new();
        let mut check_known = |sink: &mut Sink, what: String, title: &str| {
            match title_counts.get(title) {
                None => sink.error("unknown_section", COURSE_FILE, 0, format!("exam '{id}': {what} references unknown section '{title}'")),
                Some(&n) if n > 1 && dup_reported.insert(title.to_string()) => {
                    sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': section title '{title}' appears {n} times but is referenced by timing/scoring"))
                }
                Some(_) => {}
            }
        };
        check_exam_timing(id, exam, &mut check_known, sink);
        check_exam_scoring(id, exam, &mut check_known, sink);
        check_exam_sections(course, exam, sink);
    }
    check_breakdown(course, sink);
}

fn check_exam_ids(course: &Course, sink: &mut Sink) {
    let mut seen_exam_ids: HashSet<String> = HashSet::new();
    for exam in &course.exams {
        if exam.id.is_empty() {
            sink.error("bad_id", COURSE_FILE, 0, "exams[] entry has no id".to_string());
        } else if !is_valid_course_id(&exam.id) {
            sink.error("bad_id", COURSE_FILE, 0, format!("exam id '{}' must match exam id rules", exam.id));
        }
        if !seen_exam_ids.insert(exam.id.clone()) {
            sink.error("bad_exam", COURSE_FILE, 0, format!("duplicate exam id '{}'", exam.id));
        }
    }
    if let Some(legacy) = &course.exam {
        if !legacy.id.is_empty() && legacy.id != "default" {
            sink.error("bad_exam", COURSE_FILE, 0, format!("legacy exam id must be 'default' (or omitted), got '{}'", legacy.id));
        }
        if !seen_exam_ids.insert("default".to_string()) {
            sink.error("bad_exam", COURSE_FILE, 0, "duplicate exam id 'default' (legacy exam conflicts with exams[])".to_string());
        }
    }
}

fn check_exam_pass(id: &str, exam: &ExamConfig, sink: &mut Sink) {
    if let Some(pm) = exam.pass_mark
        && !(0.0..=1.0).contains(&pm) {
            sink.error("bad_pass_mark", COURSE_FILE, 0, format!("exam '{id}': passMark {} is not within 0..=1", pm));
        }
    
    // Validate pass rule
    let has_scoring = !exam.scoring.is_empty();
    let resolved_mode = resolve_mode(exam.pass.as_ref(), has_scoring);
    
    // bad_pass_rule: pass.mode == points and scoring is empty
    // pass_mark_ignored: resolve_mode(..) == points and pass_mark is Some
    // Check these together since they both use the mode
    if let Some(pass) = &exam.pass {
        if let Some(mode) = pass.mode
            && mode == PassMode::Points && exam.scoring.is_empty() {
                sink.error("bad_pass_rule", COURSE_FILE, 0, format!("exam '{id}': pass.mode is points but scoring is empty"));
            }
        
        // pass_mark_ignored: check when pass is present
        if resolved_mode == PassMode::Points && exam.pass_mark.is_some() {
            sink.warning("pass_mark_ignored", COURSE_FILE, 0, format!("exam '{id}': pass.mode resolves to points but passMark is set"));
        }
        
        // pass_rule_no_source: basis == official and source is None or trim() is empty
        if let Some(basis) = pass.basis
            && basis == PassBasis::Official
                && pass.source.as_ref().is_none_or(|s| s.trim().is_empty()) {
                    sink.warning("pass_rule_no_source", COURSE_FILE, 0, format!("exam '{id}': pass.basis is official but source is missing"));
                }
    } else {
        // pass_mark_ignored: also check when pass is not present but mode defaults to points
        if resolved_mode == PassMode::Points && exam.pass_mark.is_some() {
            sink.warning("pass_mark_ignored", COURSE_FILE, 0, format!("exam '{id}': pass.mode resolves to points but passMark is set"));
        }
    }
    
    // pass_rule_default: pass_mark is None, pass is None, and scoring is empty
    if exam.pass_mark.is_none() && exam.pass.is_none() && exam.scoring.is_empty() {
        sink.warning("pass_rule_default", COURSE_FILE, 0, format!("exam '{id}': no pass rule, passMark, or scoring is present"));
    }
}

type KnownCheck<'a> = dyn FnMut(&mut Sink, String, &str) + 'a;

// Contract: `indices[i]` is read for `i` in `1..indices.len()` after the length check; `tg.sections` is guarded by `indices.len() >= 2`.
#[allow(clippy::indexing_slicing)]
fn check_exam_timing(id: &str, exam: &ExamConfig, check_known: &mut KnownCheck, sink: &mut Sink) {
    if let Some(timing) = &exam.timing {
        if timing.is_empty() {
            sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': timing has empty groups list"));
        }
        let mut section_to_group: HashMap<&str, usize> = HashMap::new();
        for (tg_idx, tg) in timing.iter().enumerate() {
            if tg.minutes == 0 {
                sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': timing[{tg_idx}].minutes is 0"));
            }
            if tg.sections.is_empty() {
                sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': timing[{tg_idx}].sections is empty"));
            }
            for section_title in &tg.sections {
                check_known(sink, format!("timing[{tg_idx}].sections"), section_title);
                if let Some(prev_idx) = section_to_group.insert(section_title.as_str(), tg_idx) {
                    sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': section '{section_title}' appears in both timing[{prev_idx}] and timing[{tg_idx}]"));
                }
            }
        }
        // Validate timing group section contiguity and non-overlapping
        if let Some(timing) = &exam.timing {
            // Build a map from section title to its index in exam.sections
            let section_to_idx: HashMap<&str, usize> = exam.sections.iter().enumerate().map(|(idx, s)| (s.title.as_str(), idx)).collect();
            
            // First, build the ranges for each timing group
            let mut group_ranges: Vec<(usize, usize)> = Vec::new();
            for (tg_idx, tg) in timing.iter().enumerate() {
                // Get indices for all sections in this group (only those that exist)
                let mut indices: Vec<usize> = tg.sections.iter().filter_map(|st| section_to_idx.get(st.as_str())).copied().collect();
                indices.sort();
                let (Some(&lo), Some(&hi)) = (indices.first(), indices.last()) else {
                    continue; // all sections are unknown, already reported
                };
                let range = (lo, hi);
                group_ranges.push(range);
                
                // Check contiguity: each index should be exactly one more than the previous
                if indices.len() == tg.sections.len() && tg.sections.len() >= 2 {
                    for i in 1..indices.len() {
                        if indices[i] != indices[i-1] + 1 {
                            sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': timing[{tg_idx}] sections are not consecutive in exam section order"));
                            break;
                        }
                    }
                }
            }
            
            // Check for overlapping ranges
            for (i, &(min1, max1)) in group_ranges.iter().enumerate() {
                for (j, &(min2, max2)) in group_ranges.iter().enumerate() {
                    if j <= i {
                        continue;
                    }
                    // Ranges overlap if: min1 <= max2 && min2 <= max1
                    if min1 <= max2 && min2 <= max1 {
                        sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': timing[{i}] and timing[{j}] have overlapping section ranges"));
                    }
                }
            }
        }
    }
}

fn check_exam_scoring(id: &str, exam: &ExamConfig, check_known: &mut KnownCheck, sink: &mut Sink) {
    let mut section_to_part: HashMap<&str, usize> = HashMap::new();
    for (part_idx, part) in exam.scoring.iter().enumerate() {
        if part.points == 0 {
            sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': scoring[{part_idx}].points is 0"));
        }
        if let Some(min_p) = part.min_points
            && min_p > part.points {
                sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': scoring[{part_idx}].minPoints {min_p} > points {}", part.points));
            }
        if part.sections.is_empty() {
            sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': scoring[{part_idx}].sections is empty"));
        }
        for section_title in &part.sections {
            check_known(sink, format!("scoring[{part_idx}].sections"), section_title);
            if let Some(prev_idx) = section_to_part.insert(section_title.as_str(), part_idx) {
                sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': section '{section_title}' is covered by scoring[{prev_idx}] and scoring[{part_idx}]"));
            }
        }
    }

    if let Some(pp) = exam.pass_points
        && pp < 0 {
            sink.error("bad_exam", COURSE_FILE, 0, format!("exam '{id}': passPoints {pp} is negative"));
        }
}

fn check_exam_sections(course: &Course, exam: &ExamConfig, sink: &mut Sink) {
    for section in &exam.sections {
        let title = &section.title;
        if section.count == 0 {
            sink.error("bad_exam_section", COURSE_FILE, 0, format!("exam section '{title}' has count 0"));
        }
        for unit in section.units.iter().flatten() {
            if !course.units.iter().any(|u| &u.id == unit) {
                sink.error("bad_exam_section", COURSE_FILE, 0, format!("exam section '{title}' uses unknown unit '{unit}'"));
            }
        }
        for t in section.types.iter().flatten() {
            match parse_type(t) {
                None => sink.error("bad_exam_section", COURSE_FILE, 0, format!("exam section '{title}' uses unknown type '{t}'")),
                Some(ty) if ty.is_self_rated() => {
                    sink.error("bad_exam_section", COURSE_FILE, 0, format!("exam section '{title}' type '{t}' is self-rated and cannot be auto-scored"))
                }
                Some(ty) if course.types.as_ref().is_some_and(|ts| !ts.contains(&ty)) => {
                    sink.error("bad_exam_section", COURSE_FILE, 0, format!("exam section '{title}' type '{t}' is not enabled in course.types"))
                }
                Some(_) => {}
            }
        }
    }
}

fn check_breakdown(course: &Course, sink: &mut Sink) {
    if let Some(breakdown) = &course.breakdown {
        if breakdown.key.as_ref().is_none_or(|k| k.trim().is_empty()) ||
           breakdown.meaning.as_ref().is_none_or(|m| m.trim().is_empty()) {
            sink.error("bad_breakdown", COURSE_FILE, 0, "breakdown key and meaning must be non-empty strings".to_string());
        }
        for (i, reading) in breakdown.readings.iter().enumerate() {
            if reading.trim().is_empty() {
                sink.error("bad_breakdown", COURSE_FILE, 0, format!("breakdown readings[{}] must be a non-empty string", i));
            }
        }
    }
}

pub(super) fn check_exam_sizes(course: &Course, items: &[(&str, usize, &Item)], sink: &mut Sink) {
    let all_exams: Vec<&ExamConfig> = course.exam.iter().chain(course.exams.iter()).collect();

    for exam in all_exams {
        for section in &exam.sections {
            let matching = items
                .iter()
                .filter(|(_, _, item)| !item.is_retired())
                .filter(|(_, _, item)| section.units.as_ref().is_none_or(|u| u.iter().any(|x| x == item.unit())))
                .filter(|(_, _, item)| section.tags.as_ref().is_none_or(|t| item.tags().iter().any(|x| t.contains(x))))
                .filter(|(_, _, item)| section.types.as_ref().is_none_or(|t| t.iter().any(|x| x == item.item_type().as_str())))
                .count();
            if section.count > matching {
                sink.warning(
                    "exam_too_big",
                    COURSE_FILE,
                    0,
                    format!("exam section '{}' wants {} items but only {} active items match", section.title, section.count, matching),
                );
            }
            
            // Count examOnly items
            let exam_only_count = items
                .iter()
                .filter(|(_, _, item)| !item.is_retired())
                .filter(|(_, _, item)| section.units.as_ref().is_none_or(|u| u.iter().any(|x| x == item.unit())))
                .filter(|(_, _, item)| section.tags.as_ref().is_none_or(|t| item.tags().iter().any(|x| t.contains(x))))
                .filter(|(_, _, item)| section.types.as_ref().is_none_or(|t| t.iter().any(|x| x == item.item_type().as_str())))
                .filter(|(_, _, item)| {
                    course.units.iter().any(|u| u.id == item.unit() && u.exam_only == Some(true))
                })
                .count();
            
            // Check if we have enough examOnly items (at least 20% of section.count)
            if section.count > 0 {
                let target = (section.count * 20).div_ceil(100);
                if exam_only_count < target {
                    sink.warning(
                        "exam_few_unique",
                        COURSE_FILE,
                        0,
                        format!("exam section '{}' has only {} examOnly items out of {} required", section.title, exam_only_count, target),
                    );
                }
            }
        }
    }
}
