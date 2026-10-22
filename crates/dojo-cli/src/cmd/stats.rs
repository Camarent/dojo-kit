use dojo_core::content::{Course, Item, ItemType, parse_course, parse_items};
use dojo_core::stats::{compute, Stats};
use serde_json::json;
use std::path::Path;
use crate::course_files::*;
use crate::USAGE;

fn print_stats_text(stats: &Stats) {
    for unit in &stats.units {
        let mut active_counts: Vec<(&str, usize)> = Vec::new();
        for t in &ItemType::ALL {
            if let Some(&count) = unit.active.get(t.as_str()) {
                if count > 0 {
                    active_counts.push((t.as_str(), count));
                }
            }
        }
        active_counts.sort_by(|a, b| a.0.cmp(b.0));
        let active_str: String = active_counts.iter().map(|(t, c)| format!("{t}:{c}")).collect::<Vec<_>>().join(", ");
        if active_str.is_empty() {
            println!("{} ({}): 0 active, {} retired", unit.id, unit.title, unit.retired);
        } else {
            println!("{} ({}): {} active, {} retired", unit.id, unit.title, active_str, unit.retired);
        }
    }

    let mut total_active_counts: Vec<(&str, usize)> = Vec::new();
    for t in &ItemType::ALL {
        if let Some(&count) = stats.totals.active.get(t.as_str()) {
            if count > 0 {
                total_active_counts.push((t.as_str(), count));
            }
        }
    }
    total_active_counts.sort_by(|a, b| a.0.cmp(b.0));
    let total_active_str: String = total_active_counts.iter().map(|(t, c)| format!("{t}:{c}")).collect::<Vec<_>>().join(", ");
    if total_active_str.is_empty() {
        println!("Total: 0 active, {} retired", stats.totals.retired);
    } else {
        println!("Total: {} active, {} retired", total_active_str, stats.totals.retired);
    }

    if !stats.tags.is_empty() {
        println!("\nTop tags:");
        for tag in &stats.tags {
            println!("  {}: {}", tag.tag, tag.count);
        }
    }

    if !stats.exam.is_empty() {
        println!("\nExam capacity:");
        for section in &stats.exam {
            println!("  {}: {} available, {} requested", section.title, section.available, section.requested);
        }
    }
}

pub(crate) fn run_stats(args: &[String]) -> Result<u8, String> {
    let mut dir = None;
    let mut as_json = false;
    for a in args {
        match a.as_str() {
            "--json" => as_json = true,
            f if f.starts_with("--") => return Err(USAGE.to_string()),
            _ if dir.is_none() => dir = Some(a),
            _ => return Err(USAGE.to_string()),
        }
    }
    let dir = dir.ok_or_else(|| USAGE.to_string())?;
    let course = load(Path::new(dir))?;
    let course_data: Course = parse_course(&course.course_text).map_err(|errs| {
        let msgs: Vec<String> = errs.into_iter().map(|e| e.message).collect();
        format!("course.json parse error: {}", msgs.join("; "))
    })?;
    let items: Vec<Item> = course.files.iter().flat_map(|f| parse_items(&f.text).items).map(|(_, i)| i).collect();
    let stats = compute(&course_data, &items);

    if as_json {
        let json_stats = json!({
            "course": stats.course,
            "units": stats.units.iter().map(|u| json!({
                "id": u.id,
                "title": u.title,
                "active": u.active,
                "retired": u.retired
            })).collect::<Vec<_>>(),
            "totals": json!({
                "active": stats.totals.active,
                "retired": stats.totals.retired,
                "total_active": stats.totals.total_active
            }),
            "tags": stats.tags.iter().map(|t| json!({"tag": t.tag, "count": t.count})).collect::<Vec<_>>(),
            "exam": stats.exam.iter().map(|e| json!({"title": e.title, "requested": e.requested, "available": e.available})).collect::<Vec<_>>()
        });
        println!("{}", serde_json::to_string_pretty(&json_stats).map_err(|e| e.to_string())?);
    } else {
        print_stats_text(&stats);
    }
    Ok(0)
}
