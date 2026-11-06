//! Parity between `module.json` manifests under `modules/*` and the registry.

use std::fs;
use std::path::Path;

use dojo_core::validate::ValidatorModule;
use dojo_modules::{ids, validator};

const VALIDATOR_HOOK: &str = "validator";

/// `(id, hooks)` of every `modules/*/module.json`.
fn manifests() -> Vec<(String, Vec<String>)> {
    let modules = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let mut out = Vec::new();
    for entry in fs::read_dir(&modules).expect("read modules dir") {
        let path = entry.expect("dir entry").path().join("module.json");
        if !path.is_file() {
            continue;
        }
        let text = fs::read_to_string(&path).expect("read module.json");
        let json: serde_json::Value = serde_json::from_str(&text).expect("parse module.json");
        let id = json["id"].as_str().expect("module.json id").to_string();
        let hooks = json["hooks"]
            .as_array()
            .map(|hooks| hooks.iter().filter_map(|h| h.as_str().map(String::from)).collect())
            .unwrap_or_default();
        out.push((id, hooks));
    }
    out.sort();
    out
}

fn has_validator_hook(hooks: &[String]) -> bool {
    hooks.iter().any(|h| h == VALIDATOR_HOOK)
}

#[test]
fn every_validator_manifest_has_a_registered_module() {
    let with_hook: Vec<String> = manifests()
        .into_iter()
        .filter(|(_, hooks)| has_validator_hook(hooks))
        .map(|(id, _)| id)
        .collect();
    assert!(!with_hook.is_empty(), "no module.json declares the validator hook");
    for id in with_hook {
        let module = validator(&id)
            .unwrap_or_else(|| panic!("manifest {id} declares validator but validator({id}) is None"));
        assert_eq!(module.id(), id);
    }
}

#[test]
fn every_registered_id_has_a_validator_manifest() {
    let manifests = manifests();
    for id in ids() {
        let declared = manifests
            .iter()
            .any(|(mid, hooks)| mid == id && has_validator_hook(hooks));
        assert!(declared, "ids() lists {id} but no module.json with hook validator");
        let module = validator(id).unwrap_or_else(|| panic!("ids() lists {id} but validator({id}) is None"));
        assert_eq!(module.id(), *id);
    }
}
