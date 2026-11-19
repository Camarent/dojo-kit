//! Every function name the web layer calls through `dojo.call('<name>', ...)` must be dispatched by the wasm API.
//! The names are read from the JS sources with a plain string scan (no regex), and each one is probed
//! through `call`: an `unknown_function` error means the name is missing from the dispatch table.
use dojo_core::api::call;
use serde_json::Value;
use std::path::{Path, PathBuf};

type TestResult = Result<(), Box<dyn std::error::Error>>;

/// Names passed as the first string argument of a `.call(` member call, for either quote style.
fn call_names(src: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut rest = src;
    while let Some(at) = rest.find(".call(") {
        rest = &rest[at + ".call(".len()..];
        let trimmed = rest.trim_start();
        let Some(quote) = trimmed.chars().next().filter(|c| *c == '\'' || *c == '"') else {
            continue;
        };
        let body = &trimmed[quote.len_utf8()..];
        let Some(end) = body.find(quote) else { continue };
        let name = &body[..end];
        if !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            names.push(name.to_string());
        }
    }
    names
}

/// Names the wasm API does not dispatch (its error envelope carries `unknown_function`).
fn unknown_names(names: &[String]) -> Result<Vec<&str>, serde_json::Error> {
    let mut missing = Vec::new();
    for name in names {
        let envelope: Value = serde_json::from_str(&call(name, "{}"))?;
        if envelope.pointer("/error/code").and_then(Value::as_str) == Some("unknown_function") {
            missing.push(name.as_str());
        }
    }
    Ok(missing)
}

/// All `.js` files under `dir`, skipping vendored code, tests and node_modules.
fn js_files(dir: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if path.is_dir() {
            if !matches!(name, "vendor" | "tests" | "node_modules") {
                js_files(&path, out)?;
            }
        } else if name.ends_with(".js") && !name.contains(".min.") {
            out.push(path);
        }
    }
    Ok(())
}

fn web_call_names() -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let web = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../web");
    let mut files = Vec::new();
    js_files(&web, &mut files)?;
    let mut names = Vec::new();
    for file in files {
        names.extend(call_names(&std::fs::read_to_string(file)?));
    }
    names.sort();
    names.dedup();
    Ok(names)
}

#[test]
fn scanner_reads_both_quote_styles_and_skips_non_name_calls() {
    let src = "a.call('decoyOne', {}); b.call(\"decoyTwo\", x); c.call(null, y); d.call(name, z);";
    assert_eq!(call_names(src), vec!["decoyOne".to_string(), "decoyTwo".to_string()]);
}

#[test]
fn decoy_name_is_reported_missing() -> TestResult {
    let decoy = vec!["noSuchWasmFunctionDecoy".to_string(), "dayKey".to_string()];
    assert_eq!(unknown_names(&decoy)?, vec!["noSuchWasmFunctionDecoy"]);
    Ok(())
}

#[test]
fn every_web_call_name_is_dispatched() -> TestResult {
    let names = web_call_names()?;
    assert!(!names.is_empty(), "scan found no `.call('<name>'` sites under web/");
    let missing = unknown_names(&names)?;
    assert!(missing.is_empty(), "web calls names the wasm API does not dispatch: {missing:?}");
    Ok(())
}
