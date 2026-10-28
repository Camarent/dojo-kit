use super::audio::{ManifestState, check_manifest, check_mode_by_type, check_pack_files, check_stimuli_audio, check_timer_config, load_manifest};
use super::items::{check_item_body, check_leak, check_stimulus_groups, fold_norm, item_body};
use super::quality::{check_ambiguous_answer, check_order_blanks_mismatch, check_prompt_type_mismatch, has_foreign_script};
use super::dupes::check_same_prompt_diff_answers;
use super::speech::validate_speak;
use super::{COURSE_FILE, Diagnostic, LOCK_FILE, Severity, Sink, SourceFile, exam, is_valid_id};
use super::groups::{check_bar_matches, check_entity_spans_groups, check_mixed_entity_scope};
use crate::check::{Normalize, normalize};
use crate::content::{Course, Item, ParsedItems, parse_intros, parse_stimuli};
use crate::lock::IdLock;
use std::collections::{HashMap, HashSet};
use std::path::Path;

pub(super) type AllItems<'a> = [(&'a str, usize, &'a Item)];

pub(super) struct StimulusInfo {
    pub(super) hide_text: HashSet<String>,
    pub(super) map: HashMap<String, (String, usize)>,
}

pub(super) fn check_stimuli_file(stimuli: Option<&SourceFile>, course: Option<&Course>, course_sink: &mut Sink) -> StimulusInfo {
    let mut stimulus_hide_text: HashSet<String> = HashSet::new();
    let mut stimulus_map: HashMap<String, (String, usize)> = HashMap::new();

    if let Some(stim_file) = stimuli {
        let stim_parsed = parse_stimuli(&stim_file.text);
        for e in &stim_parsed.errors {
            course_sink.error("parse_error", &stim_file.name, e.line, e.message.clone());
        }
        let mut seen_stim_ids: HashSet<String> = HashSet::new();
        for (line, stim) in &stim_parsed.stimuli {
            let stim_id = stim.id.clone();
            if !seen_stim_ids.insert(stim_id.clone()) {
                course_sink.error("duplicate_stimulus", &stim_file.name, *line, format!("stimulus id '{stim_id}' is used more than once"));
            }
            if stim.hide_text == Some(true) {
                stimulus_hide_text.insert(stim_id.clone());
            }
            if let Some(ref speak) = stim.speak && let Some(course) = course {
                validate_speak(speak, course.speech.as_ref().and_then(|s| s.voices.as_ref()), &stim_file.name, *line, course_sink);
            }
            stimulus_map.insert(stim_id, (stim_file.name.clone(), *line));
        }
    }
    StimulusInfo { hide_text: stimulus_hide_text, map: stimulus_map }
}

pub(super) fn check_intros_file(intros: Option<&SourceFile>, all: &AllItems, course_sink: &mut Sink) {
    if let Some(intro_file) = intros {
        let ip = parse_intros(&intro_file.text);
        for e in &ip.errors {
            course_sink.error("parse_error", &intro_file.name, e.line, e.message.clone());
        }
        let entities: HashSet<&str> = all.iter().map(|(_, _, it)| it.entity().unwrap_or_else(|| it.id())).collect();
        let mut seen_intro: HashSet<&str> = HashSet::new();
        for (line, intro) in &ip.stimuli {
            if intro.id.trim().is_empty() || (intro.title.is_none() && intro.text.is_none() && intro.meta.is_none()) {
                course_sink.error("bad_intro", &intro_file.name, *line, "intro needs a non-empty id and a title, text or meta".to_string());
            }
            if !seen_intro.insert(intro.id.as_str()) {
                course_sink.error("duplicate_intro", &intro_file.name, *line, format!("intro id '{}' is used more than once", intro.id));
            }
            if !intro.id.trim().is_empty() && !entities.contains(intro.id.as_str()) {
                course_sink.warning("intro_unknown_entity", &intro_file.name, *line, format!("intro '{}' matches no item entity", intro.id));
            }
        }
    }
}

pub(super) struct ItemCtx<'a> {
    pub(super) course: Option<&'a Course>,
    pub(super) stimuli: &'a StimulusInfo,
}

#[derive(Default)]
pub(super) struct Seen<'a> {
    first_id: HashMap<&'a str, (&'a str, usize)>,
    first_prompt: HashMap<(&'a str, &'a str, Option<&'a str>, String, String), (&'a str, usize)>,
}

pub(super) fn check_item_files<'a>(files: &'a [SourceFile], parsed: &'a [ParsedItems], ctx: &ItemCtx) -> Vec<Vec<Diagnostic>> {
    let mut file_diags: Vec<Vec<Diagnostic>> = Vec::new();
    let mut seen = Seen::default();
    for (file, p) in files.iter().zip(parsed) {
        let name = file.name.as_str();
        let mut sink = Sink { out: Vec::new() };
        for e in &p.errors {
            sink.error("parse_error", name, e.line, e.message.clone());
        }
        for (line, item) in &p.items {
            check_one_item(item, name, *line, ctx, &mut seen, &mut sink);
        }
        sink.out.sort_by_key(|d| d.line);
        file_diags.push(sink.out);
    }
    file_diags
}

fn check_one_item<'a>(item: &'a Item, name: &'a str, line: usize, ctx: &ItemCtx, seen: &mut Seen<'a>, sink: &mut Sink) {
    let id = item.id();
    match seen.first_id.get(id) {
        Some((f, l)) => sink.error("duplicate_id", name, line, format!("id '{id}' already used at {f}:{l}")),
        None => {
            seen.first_id.insert(id, (name, line));
        }
    }
    if !is_valid_id(id) {
        sink.error("bad_id", name, line, format!("id '{id}' must match ^[a-z][a-z0-9]*-[0-9]+$"));
    }
    if let Some(c) = ctx.course {
        if !c.units.iter().any(|u| u.id == item.unit()) {
            sink.error("unknown_unit", name, line, format!("item '{id}' uses unknown unit '{}'", item.unit()));
        }
        if c.types.as_ref().is_some_and(|ts| !ts.contains(&item.item_type())) {
            sink.error(
                "type_not_enabled",
                name,
                line,
                format!("item '{id}' has type '{}' which is not in course.types", item.item_type().as_str()),
            );
        }
    }
    check_item_body(item, name, line, sink);

    if let Some(speak_text) = item.speak() && speak_text.is_empty() {
        sink.error("bad_speech", name, line, "item speak field is empty".to_string());
    }

    if let Some(stim_id) = item.stimulus() && !ctx.stimuli.map.contains_key(stim_id) {
        sink.error("unknown_stimulus", name, line, format!("item '{id}' references unknown stimulus '{}'", stim_id));
    }

    if !item.is_retired() {
        check_active_item(item, name, line, ctx, seen, sink);
    }
}

fn check_active_item<'a>(item: &'a Item, name: &'a str, line: usize, ctx: &ItemCtx, seen: &mut Seen<'a>, sink: &mut Sink) {
    let id = item.id();
    check_prompt_type_mismatch(item.prompt(), item.item_type(), sink, name, line, id);
    check_ambiguous_answer(item, sink, name, line);
    check_order_blanks_mismatch(item, sink, name, line);

    if let Some(c) = ctx.course {
        let whitelisted_scripts: HashSet<String> = c.scripts.iter().cloned().collect();
        if item_has_foreign_script(item, &whitelisted_scripts) {
            sink.warning("foreign_script", name, line, format!("item '{id}' contains characters from a non-whitelisted script"));
        }
    }

    let item_norm = match item {
        Item::Gap(g) => g.normalize.as_ref(),
        Item::Cloze(c) => c.normalize.as_ref(),
        _ => None,
    };
    let course_norm = ctx.course.and_then(|c| c.normalize.as_ref());
    let default_norm = Normalize::default();
    let norm_opts = fold_norm(item_norm, course_norm).unwrap_or(&default_norm);
    let key = (item.unit(), item.item_type().as_str(), item.stimulus(), normalize(item.prompt(), norm_opts), item_body(item));
    match seen.first_prompt.get(&key) {
        Some((f, l)) => sink.warning("duplicate_prompt", name, line, format!("item '{id}' repeats the prompt at {f}:{l}")),
        None => {
            seen.first_prompt.insert(key, (name, line));
        }
    }
    check_leak(item, name, line, sink, course_norm, &ctx.stimuli.hide_text);
}

fn item_has_foreign_script(item: &Item, scripts: &HashSet<String>) -> bool {
    let foreign = |t: &str| has_foreign_script(t, scripts);
    let explained = |e: &Option<String>| e.as_ref().is_some_and(|exp| foreign(exp));
    if foreign(item.prompt()) {
        return true;
    }
    match item {
        Item::Choice(c) => c.options.iter().any(|o| foreign(o)) || explained(&c.explanation),
        Item::Gap(g) => g.answers.iter().any(|a| foreign(a)) || explained(&g.explanation),
        Item::Multi(m) => m.options.iter().any(|o| foreign(o)) || explained(&m.explanation),
        Item::Card(c) => foreign(&c.back) || explained(&c.explanation),
        Item::Match(m) => {
            m.pairs.iter().any(|p| foreign(&p.left) || foreign(&p.right))
                || m.distractors.iter().any(|d| foreign(d))
                || explained(&m.explanation)
        }
        Item::Order(o) => o.steps.iter().any(|s| foreign(s)) || explained(&o.explanation),
        Item::Cloze(c) => {
            c.parts.iter().any(|part| match part {
                crate::content::ClozePart::Text(t) => foreign(t),
                crate::content::ClozePart::Blank(alts) => alts.iter().any(|a| foreign(a)),
            }) || explained(&c.explanation)
        }
        Item::Numeric(n) => explained(&n.explanation),
    }
}

pub(super) fn check_course_totals(c: &Course, all: &AllItems, course_sink: &mut Sink) {
    exam::check_exam_sizes(c, all, course_sink);
    let used: HashSet<&str> = all.iter().filter(|(_, _, i)| !i.is_retired()).map(|(_, _, i)| i.unit()).collect();
    let mut reported = HashSet::new();
    for unit in &c.units {
        if !used.contains(unit.id.as_str()) && reported.insert(unit.id.as_str()) {
            course_sink.warning("unit_empty", COURSE_FILE, 0, format!("unit '{}' has no active items", unit.id));
        }
    }
    // Check placement: if course.placement is set, at least one included unit must have active items
    if c.placement.is_some() {
        let has_placement_unit_with_items = c.units.iter().any(|u| {
            u.placement != Some(false) && used.contains(u.id.as_str())
        });
        if !has_placement_unit_with_items {
            course_sink.error("bad_placement", COURSE_FILE, 0, "course.placement is set but no unit with placement != false has active items".to_string());
        }
    }
    // Check stimulus groups for consistency
    check_stimulus_groups(all, course_sink);
    
    // Check for same prompt with different answers
    let course_norm = c.normalize.as_ref();
    check_same_prompt_diff_answers(all, course_sink, course_norm);
    
    // Check entity spans groups
    check_entity_spans_groups(c, all, course_sink);
    
    check_mixed_entity_scope(c, all, course_sink);

    // Check bar/extraTags matches
    check_bar_matches(c, all, course_sink);
    
    // Check mode_by_type
    check_mode_by_type(&c.srs_by_type, course_sink);
    
    // Check timer configs
    check_timer_config(&c.timer, COURSE_FILE, course_sink);
    for unit in &c.units {
        check_timer_config(&unit.timer, COURSE_FILE, course_sink);
    }
}

pub(super) fn check_ids_and_lock(all: &AllItems, lock: Option<&IdLock>, out: &mut Vec<Diagnostic>) {
    out.extend(crate::supersedes::check_supersedes(all, lock));

    if let Some(lock) = lock {
            let present: HashSet<&str> = all.iter().map(|(_, _, i)| i.id()).collect();
        let retired: HashSet<&str> = lock.retired.iter().map(String::as_str).collect();
        let mut found: Vec<(&str, Diagnostic)> = Vec::new();
        for id in lock.ids.iter().filter(|id| !present.contains(id.as_str())) {
            let message = format!("id '{id}' is in ids.lock but missing from the content");
            found.push((id, Diagnostic { severity: Severity::Error, code: "id_removed", file: LOCK_FILE.to_string(), line: 0, message }));
        }
        for (file, line, item) in all {
            if !item.is_retired() && retired.contains(item.id()) {
                let message = format!("id '{}' was retired in ids.lock and cannot be reused", item.id());
                found.push((item.id(), Diagnostic { severity: Severity::Error, code: "retired_id_reused", file: file.to_string(), line: *line, message }));
            }
            if !item.is_retired() && let Some(locked_type) = lock.types.get(item.id()) {
                let current_type = item.item_type().as_str();
                if locked_type.as_str() != current_type {
                    let message = format!(
                        "id '{}' type changed from '{}' to '{}'",
                        item.id(), locked_type, current_type
                    );
                    found.push((item.id(), Diagnostic { severity: Severity::Warning, code: "item_type_changed", file: file.to_string(), line: *line, message }));
                }
            }
        }
        found.sort_by(|a, b| (a.0, a.1.code, &a.1.file, a.1.line).cmp(&(b.0, b.1.code, &b.1.file, b.1.line)));
        out.extend(found.into_iter().map(|(_, d)| d));
    }
}

/// Validates audio configuration and files.
/// This requires file I/O, so it's called from the CLI layer with the course directory.
pub fn check_audio_files(
    course: &Course,
    course_dir: &Path,
    stimuli: &Option<SourceFile>,
) -> Vec<Diagnostic> {
    let mut sink = Sink { out: Vec::new() };
    let parsed = stimuli.as_ref().map(|s| parse_stimuli(&s.text).stimuli).unwrap_or_default();
    let name = stimuli.as_ref().map_or("stimuli.jsonl", |s| s.name.as_str());
    let Some(audio) = &course.audio else {
        check_stimuli_audio(&parsed, name, &ManifestState::NoConfig, &mut sink);
        return sink.out;
    };
    if audio.manifest.is_empty() {
        sink.error("audio_without_manifest", COURSE_FILE, 0, "audio config has empty manifest path".to_string());
        check_stimuli_audio(&parsed, name, &ManifestState::Unloaded, &mut sink);
        return sink.out;
    }
    let loaded = load_manifest(audio, course_dir, &mut sink);
    let Some((manifest, dir)) = loaded else {
        check_stimuli_audio(&parsed, name, &ManifestState::Unloaded, &mut sink);
        return sink.out;
    };
    check_manifest(&manifest, &audio.manifest, &mut sink);
    check_pack_files(&manifest, &dir, &audio.manifest, &mut sink);
    check_stimuli_audio(&parsed, name, &ManifestState::Loaded(&manifest), &mut sink);
    sink.out
}
