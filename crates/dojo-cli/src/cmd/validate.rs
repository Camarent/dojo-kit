use dojo_core::validate::{Diagnostic, Severity};
use serde_json::json;
use std::path::{Path, PathBuf};
use crate::course_files::*;
use crate::cmd::build::find_web_dir;
use crate::USAGE;

pub(crate) fn count(diags: &[Diagnostic], severity: Severity) -> usize {
    diags.iter().filter(|d| d.severity == severity).count()
}

pub(crate) fn print_text(diags: &[Diagnostic]) {
    for d in diags {
        let place = if d.line == 0 { d.file.clone() } else { format!("{}:{}", d.file, d.line) };
        println!("{}[{}] {place}: {}", d.severity.as_str(), d.code, d.message);
    }
    println!("{} errors, {} warnings", count(diags, Severity::Error), count(diags, Severity::Warning));
}

pub(crate) fn print_json(diags: &[Diagnostic]) {
    let errors = count(diags, Severity::Error);
    let list: Vec<_> = diags
        .iter()
        .map(|d| json!({"severity": d.severity.as_str(), "code": d.code, "file": d.file, "line": d.line, "message": d.message}))
        .collect();
    let out = json!({"ok": errors == 0, "errors": errors, "warnings": count(diags, Severity::Warning), "diagnostics": list});
    println!("{out}");
}


pub(crate) fn run_validate(args: &[String]) -> Result<u8, String> {
    let mut dir = None;
    let (mut as_json, mut strict, mut web) = (false, false, None);
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--json" => as_json = true,
            "--strict" => strict = true,
            "--web" => web = Some(PathBuf::from(it.next().ok_or_else(|| USAGE.to_string())?)),
            f if f.starts_with("--") => return Err(USAGE.to_string()),
            _ if dir.is_none() => dir = Some(a),
            _ => return Err(USAGE.to_string()),
        }
    }
    let dir = dir.ok_or_else(|| USAGE.to_string())?;
    let course = load(Path::new(dir))?;
    let web = web.or_else(|| find_web_dir().ok());
    let diags = validate_course(Path::new(dir), &course, web.as_deref());
    if as_json {
        print_json(&diags);
    } else {
        print_text(&diags);
    }
    let failed = count(&diags, Severity::Error) > 0 || (strict && count(&diags, Severity::Warning) > 0);
    Ok(u8::from(failed))
}
