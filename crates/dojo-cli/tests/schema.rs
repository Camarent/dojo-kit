use dojo_core::content::parse_items;
use std::path::PathBuf;
use std::process::Command;

fn dojo() -> Command {
    Command::new(env!("CARGO_BIN_EXE_dojo"))
}

#[test]
fn brief_lists_types_and_parseable_examples() {
    let out = dojo().args(["schema", "--brief"]).output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    let text = String::from_utf8(out.stdout).unwrap();
    let mut examples = 0;
    for t in ["choice", "gap", "card", "multi", "match", "order", "cloze", "numeric"] {
        assert!(text.contains(&format!("TYPE {t}")));
    }
    for line in text.lines().filter_map(|l| l.trim().strip_prefix("example: ")) {
        let p = parse_items(line);
        assert!(p.errors.is_empty(), "{:?}", p.errors);
        examples += 1;
    }
    assert_eq!(examples, 8);
}

#[test]
fn out_writes_files_equal_to_committed() {
    let dir = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("schema-out");
    let out = dojo().args(["schema", "--out"]).arg(&dir).output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    let committed = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../schema");
    for f in ["course.schema.json", "item.schema.json"] {
        assert_eq!(std::fs::read(dir.join(f)).unwrap(), std::fs::read(committed.join(f)).unwrap());
    }
}

#[test]
fn usage_error_exits_2() {
    assert_eq!(dojo().arg("schema").output().unwrap().status.code(), Some(2));
    assert_eq!(dojo().output().unwrap().status.code(), Some(2));
}
