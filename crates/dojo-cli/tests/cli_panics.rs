use std::process::Command;

fn next_id(prefix: &str) -> std::process::Output {
    let dir = demo_dir();
    Command::new(env!("CARGO_BIN_EXE_dojo"))
        .args(["next-id", &dir, prefix])
        .output()
        .unwrap()
}

fn demo_dir() -> String {
    format!("{}/../../examples/demo", env!("CARGO_MANIFEST_DIR"))
}

fn assert_clean_failure(prefix: &str, msg: &str) {
    let out = next_id(prefix);
    let err = String::from_utf8_lossy(&out.stderr);
    assert!(!out.status.success());
    assert!(!err.contains("panicked"), "{err}");
    assert!(err.contains(msg), "{err}");
}

#[test]
fn next_id_empty_prefix_fails_without_panic() {
    assert_clean_failure("", "must not be empty");
}

#[test]
fn next_id_uppercase_prefix_fails_without_panic() {
    assert_clean_failure("Ab", "lowercase letter");
}

#[test]
fn next_id_symbol_prefix_fails_without_panic() {
    assert_clean_failure("a_b", "only lowercase");
}
