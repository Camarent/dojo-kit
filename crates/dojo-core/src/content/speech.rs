use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// A line of speech to be synthesized.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpeakLine {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voice: Option<String>,
    pub text: String,
}

/// A typed speak stimulus with lines.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Speak {
    pub lines: Vec<SpeakLine>,
}

/// Voice configuration for speech synthesis.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VoiceConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pitch: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rate: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "match")]
    pub match_: Option<String>,
    /// Voice-name preferences (JavaScript regex source, case-insensitive), most preferred first; a matching voice ranks above the rest of the language pool.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prefer: Option<Vec<String>>,
}

/// Speech configuration for the course.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpeechConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lang: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rate: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voices: Option<BTreeMap<String, VoiceConfig>>,
}

/// A shared stimulus (passage, dialogue, etc.) referenced by items.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Stimulus {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hide_text: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<Speak>,
}

/// Intro card shown once per entity before its first question (`intros.jsonl`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Intro {
    /// Entity id (`item.entity`, default item id) the card introduces.
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Card body (course markup).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Free-form data for plugins (`DojoExt.registerIntro`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    /// Text read aloud with the card.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
}
