mod add;
mod build;
mod cmd;
mod course_files;
mod import_progress;

use cmd::{add::run_add, build::run_build, import_progress::run_import_progress, init::run_init, lock::run_lock, next_id::run_next_id, stats::run_stats, validate::run_validate};
use course_files::{load, read, CourseFiles};
use dojo_core::schema;
use dojo_core::validate::{Diagnostic, Severity};
use std::fs;
use std::path::Path;
use std::process::ExitCode;


pub(crate) const USAGE: &str = "usage: dojo schema (--out <dir> | --brief)\n       dojo validate <course-dir> [--json] [--strict] [--web <dir>]\n\
       dojo lock <course-dir>\n\
       dojo build <course-dir> [--out <dir>] [--wasm <file>] [--web <dir>] [--strict]\n\
       dojo init <course-id> [--title T] [--ui LANG] [--content-lang LANG] [--workspace DIR]\n\
       dojo stats <course-dir> [--json]\n\
       dojo next-id <course-dir> <prefix> [--count N]\n\
       dojo add <course-dir> <unit-id> [--file F] [--dry-run]\n\
       dojo import-progress <old.json> --map <id-map.json> --course <dir> [--out <file>] [--write] [--now <ISO>";

fn write_schemas(dir: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    fs::write(dir.join("course.schema.json"), schema::pretty(&schema::course_schema()))?;
    fs::write(dir.join("item.schema.json"), schema::pretty(&schema::item_schema()))
}

fn run(args: &[String]) -> Result<u8, String> {
    match args {
        [cmd, flag] if cmd == "schema" && flag == "--brief" => {
            print!("{}", schema::brief());
            Ok(0)
        }
        [cmd, flag, dir] if cmd == "schema" && flag == "--out" => {
            write_schemas(Path::new(dir)).map_err(|e| format!("cannot write schema to {dir}: {e}"))?;
            Ok(0)
        }
        [cmd, rest @ ..] if cmd == "validate" => run_validate(rest),
        [cmd, rest @ ..] if cmd == "lock" => run_lock(rest),
        [cmd, rest @ ..] if cmd == "build" => run_build(rest),
        [cmd, rest @ ..] if cmd == "init" => run_init(rest),
        [cmd, rest @ ..] if cmd == "stats" => run_stats(rest),
        [cmd, rest @ ..] if cmd == "next-id" => run_next_id(rest),
        [cmd, rest @ ..] if cmd == "add" => run_add(rest),
        [cmd, rest @ ..] if cmd == "import-progress" => run_import_progress(rest),
        _ => Err(USAGE.to_string()),
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(&args) {
        Ok(code) => ExitCode::from(code),
        Err(msg) => {
            eprintln!("{msg}");
            ExitCode::from(2)
        }
    }
}
