// Snapshot test for build output determinism.
// Computes sha256 over build artefacts and compares against stored snapshots.

mod common;

use common::TempDir;
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

// Pure Rust SHA-256 implementation (no external crates).
const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const H0: [u32; 8] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

/// SHA-256 hash function - returns hex string
fn sha256(bytes: &[u8]) -> String {
    let mut h = H0;
    let mut message = Vec::from(bytes);

    message.push(0x80);
    while (message.len() % 64) != 56 {
        message.push(0x00);
    }

    let bit_len = (bytes.len() as u64) * 8;
    message.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in message.chunks(64) {
        let mut w: Vec<u32> = chunk.as_chunks::<4>().0.iter().map(|b| u32::from_be_bytes(*b)).collect();

        for i in 16..64 {
            let at = |k: usize| w.get(i - k).copied().unwrap_or(0);
            let s0 = at(15).rotate_right(7) ^ at(15).rotate_right(18) ^ (at(15) >> 3);
            let s1 = at(2).rotate_right(17) ^ at(2).rotate_right(19) ^ (at(2) >> 10);
            let next = at(16).wrapping_add(s0).wrapping_add(at(7)).wrapping_add(s1);
            w.push(next);
        }

        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh] = h;

        for (k, wi) in K.iter().zip(&w) {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh.wrapping_add(s1).wrapping_add(ch).wrapping_add(*k).wrapping_add(*wi);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        for (slot, v) in h.iter_mut().zip([a, b, c, d, e, f, g, hh]) {
            *slot = slot.wrapping_add(v);
        }
    }

    h.iter().map(|v| format!("{v:08x}")).collect()
}

/// Mask script and style element contents in HTML
/// Replaces the contents between <script> and </script> (and <style> and </style>) with "MASKED"
fn mask_html(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let bytes = html.as_bytes();
    let tail = |from: usize| String::from_utf8_lossy(bytes.get(from..).unwrap_or_default()).into_owned();
    let starts_with_ci = |at: usize, word: &[u8]| bytes.get(at..at + word.len()).is_some_and(|s| s.eq_ignore_ascii_case(word));
    let mut i = 0;

    while i < bytes.len() {
        // Check for <script or <style (case-insensitive opening tag)
        let mut j = i + 1;
        if bytes.get(i) == Some(&b'<') {
            // Skip whitespace
            while bytes.get(j).is_some_and(u8::is_ascii_whitespace) {
                j += 1;
            }
        }
        let is_script = bytes.get(i) == Some(&b'<') && starts_with_ci(j, b"script");
        let is_style = bytes.get(i) == Some(&b'<') && starts_with_ci(j, b"style");

        if is_script || is_style {
            // Find the '>'
            let name_end = if is_script { j + 6 } else { j + 5 };
            let Some(gt) = bytes.get(name_end..).and_then(|r| r.iter().position(|&b| b == b'>')) else {
                // No closing '>', just copy and stop
                result.push_str(&tail(i));
                return result;
            };
            let tag_end = name_end + gt + 1; // include the '>'

            // Copy the opening tag
            result.push_str(html.get(i..tag_end).unwrap_or_default());
            i = tag_end;

            // Find the matching closing tag and skip all content in between
            let closing_tag = if is_script { "</script>" } else { "</style>" };
            let closing_len = closing_tag.len();

            while i + closing_len <= bytes.len() {
                if starts_with_ci(i, closing_tag.as_bytes()) {
                    // Found the closing tag, add MASKED and the closing tag
                    result.push_str("MASKED");
                    result.push_str(closing_tag);
                    i += closing_len;
                    break;
                }
                // Skip this character (don't copy it to result)
                i += 1;
            }

            if i + closing_len > bytes.len() {
                // Didn't find closing tag, copy the rest
                result.push_str(&tail(i));
                return result;
            }
        } else {
            let Some(c) = html.get(i..).and_then(|s| s.chars().next()) else {
                break;
            };
            result.push(c);
            i += c.len_utf8();
        }
    }

    result
}

/// Put a file
fn put(path: &Path, text: &str) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, text)
}

/// Fixture web directory with minimal content
fn fixture_web(root: &Path) -> io::Result<PathBuf> {
    let web = root.join("web");
    put(
        &web.join("bundle.json"),
        r#"{"scripts":["a.js","b.js"],"styles":["s.css"],"i18n":["en","ru"],"licenses":["L.txt"]}"#,
    )?;
    put(&web.join("a.js"), "var a=1;")?;
    put(&web.join("b.js"), "var s='</script>';")?;
    put(&web.join("s.css"), "body{margin:0}")?;
    put(&web.join("L.txt"), "MIT -- license")?;
    put(&web.join("i18n/en.json"), r#"{"hi":"Hello </b>"}"#)?;
    put(&web.join("i18n/ru.json"), r#"{"hi":"Privet","bye":"Poka","thanks":"Spasibo"}"#)?;
    put(
        &web.join("index.template.html"),
        "<title><!--DOJO:TITLE--></title>\n<style><!--DOJO:CSS--></style>\n<div id=\"dojo-root\"></div>\n<script><!--DOJO:WASM--><!--DOJO:I18N--></script>\n<!--DOJO:SCRIPTS-->\n<!--DOJO:LICENSES-->\n",
    )?;
    Ok(web)
}

/// Create a unique temp directory, removed when dropped
fn unique_dir(tag: &str) -> io::Result<TempDir> {
    TempDir::new(&format!("dojo-snapshot-{tag}"))
}

/// Get the path to the dojo CLI binary
fn dojo_bin() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_dojo"))
}

/// Recursively collect file paths relative to base
fn collect_files(dir: &Path, base: &Path) -> io::Result<BTreeSet<String>> {
    let mut files = BTreeSet::new();
    if !dir.exists() {
        return Ok(files);
    }
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            files.extend(collect_files(&path, base)?);
        } else {
            let relative = path.strip_prefix(base).map_err(io::Error::other)?.to_string_lossy().to_string();
            files.insert(relative);
        }
    }
    Ok(files)
}

fn snapshots_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/snapshots/build.json")
}

/// Load snapshot file
fn load_snapshots() -> io::Result<Value> {
    let path = snapshots_path();
    if path.exists() {
        let content = fs::read_to_string(&path)?;
        Ok(serde_json::from_str(&content).unwrap_or(json!({})))
    } else {
        Ok(json!({}))
    }
}

/// Save snapshot file
fn save_snapshots(snapshots: &Value) -> io::Result<()> {
    let path = snapshots_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, serde_json::to_string_pretty(snapshots)?.as_bytes())
}

/// Compute the digest for a built example
fn compute_digest(course_dir: &Path) -> io::Result<String> {
    let mut concatenated = Vec::new();

    // Add data/content.json, manifest.json, ids.lock (if produced)
    for name in ["data/content.json", "manifest.json", "ids.lock"] {
        let path = course_dir.join(name);
        if path.exists() {
            concatenated.extend_from_slice(&fs::read(&path)?);
        }
    }

    // Add sorted list of output file names (relative paths)
    let files = collect_files(course_dir, course_dir)?;
    for name in &files {
        concatenated.extend_from_slice(name.as_bytes());
        concatenated.push(b'\n');
    }

    // Add index.html length after masking
    let index_path = course_dir.join("index.html");
    if index_path.exists() {
        let html = fs::read_to_string(&index_path)?;
        let masked = mask_html(&html);
        let length_bytes = masked.len().to_string();
        concatenated.extend_from_slice(length_bytes.as_bytes());
    }

    Ok(sha256(&concatenated))
}

/// Build an example into a temp directory with fixture web and wasm
fn build_with_fixtures(example_path: &Path, out_dir: &Path) -> Result<(), String> {
    let bin = dojo_bin();
    let root = unique_dir("web").map_err(|e| e.to_string())?;
    let web = fixture_web(&root).map_err(|e| e.to_string())?;
    let wasm = root.join("tiny.wasm");
    std::fs::write(&wasm, [0u8, 0x61, 0x73, 0x6d, 1, 0, 0, 0]).map_err(|e| e.to_string())?;

    let output = std::process::Command::new(&bin)
        .arg("build")
        .arg(example_path)
        .arg("--out")
        .arg(out_dir)
        .arg("--wasm")
        .arg(&wasm)
        .arg("--web")
        .arg(&web)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(format!("Build failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    Ok(())
}

/// Get example directories
fn get_examples() -> io::Result<Vec<(String, PathBuf)>> {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples");
    let mut examples = Vec::new();

    for entry in std::fs::read_dir(&base)? {
        let path = entry?.path();
        if let (true, Some(name)) = (path.join("course.json").is_file(), path.file_name()) {
            examples.push((name.to_string_lossy().to_string(), path));
        }
    }
    examples.sort();
    Ok(examples)
}

#[test]
fn build_snapshots_are_stable() {
    let bin = dojo_bin();
    assert!(bin.exists(), "dojo binary missing");

    let examples = get_examples().unwrap();
    assert!(!examples.is_empty(), "no examples found");

    let update = env::var("UPDATE_SNAPSHOT").is_ok();
    let mut snapshots = load_snapshots().unwrap();
    let snapshots_obj = snapshots.as_object_mut().unwrap();

    for (example_name, example_path) in &examples {
        let out_dir = unique_dir("snapshot").unwrap();

        // Build the example with fixture web and wasm
        build_with_fixtures(example_path, &out_dir).unwrap();

        // The build command creates output in <out_dir>/<example_name>
        let course_output = out_dir.join(example_name);

        // Compute digest
        let digest = compute_digest(&course_output).unwrap();

        // Check or update snapshot
        if update {
            snapshots_obj.insert(example_name.clone(), json!(digest));
        } else {
            match snapshots_obj.get(example_name) {
                Some(expected) => {
                    let expected_str = expected.as_str().unwrap();
                    assert_eq!(
                        &digest,
                        expected_str,
                        "Digest mismatch for {}. Run UPDATE_SNAPSHOT=1 to update.",
                        example_name
                    );
                }
                None => {
                    panic!(
                        "No snapshot for {}. Run with UPDATE_SNAPSHOT=1 to create.",
                        example_name
                    );
                }
            }
        }
    }

    if update {
        save_snapshots(&snapshots).unwrap();
    }
}
