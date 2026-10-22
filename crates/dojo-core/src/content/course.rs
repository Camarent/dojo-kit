use crate::check::Normalize;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use super::{ItemType, NewOrder, SpeechConfig};

/// One exam section: how many items to draw and from where. `None` filters match everything.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Section {
    pub title: String,
    pub count: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub units: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub types: Option<Vec<String>>,
}

/// A unit of a course.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Unit {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_per_day: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub srs: Option<SrsConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placement: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_order: Option<NewOrder>,
    /// Exam-only items. Exams take these first and fill up from shared units; training, daily, practice and placement prefer shared items and use these only when the queue would otherwise be empty.
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "examOnly")]
    pub exam_only: Option<bool>,
    /// Declarative detail rendering config from item.meta for this unit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<DetailConfig>,
}

/// Spaced-repetition settings; `ladder` holds intervals in milliseconds, indexed by stage.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SrsConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ladder: Option<Vec<i64>>,
    /// Stages lost on a wrong answer (default 1; 0 keeps the stage).
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "dropOnWrong")]
    pub drop_on_wrong: Option<i64>,
    /// `"item"` (default) schedules every item alone; `"entity"` schedules all active items of an entity as one topic.
    /// Not allowed in `srsByType`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<SrsScope>,
    /// Items asked per entity slot when `scope` is `"entity"` (1..=5, default 1).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub drill: Option<u32>,
}

/// Scheduling scope of a unit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum SrsScope {
    Item,
    Entity,
}

/// Course plugin configuration: build-time JS/CSS to be inlined into the output.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Plugins {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub scripts: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub styles: Vec<String>,
}

/// Placement test configuration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlacementConfig {
    #[serde(default = "default_per_unit", skip_serializing_if = "is_default")]
    pub per_unit: u32,
    #[serde(default = "default_mode")]
    pub mode: String,
}

impl Default for PlacementConfig {
    fn default() -> Self {
        Self {
            per_unit: 5,
            mode: String::from("check"),
        }
    }
}

fn default_per_unit() -> u32 {
    5
}

fn is_default(v: &u32) -> bool {
    *v == 5
}

fn default_mode() -> String {
    String::from("check")
}

/// New order for groups: file order or random.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum GroupNewOrder {
    File,
    Random,
}

/// A group of units for daily new item caps.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Group {
    pub id: String,
    pub title: String,
    pub units: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_per_day: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_order: Option<GroupNewOrder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra_new: Option<bool>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub extra_tags: Vec<String>,
}

/// A progress bar configuration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bar {
    pub title: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub units: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub learned_stage: Option<i64>,
}

/// One timing group that may span several sections.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimingGroup {
    pub sections: Vec<String>,
    pub minutes: u32,
}

/// One scoring part: a set of sections contributing to a score bucket.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoringPart {
    pub title: String,
    pub sections: Vec<String>,
    pub points: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_points: Option<u32>,
}

/// Pass mode: percent or points.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum PassMode {
    Percent,
    Points,
}

/// Pass basis: official or author.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum PassBasis {
    Official,
    Author,
}

/// Pass rule for exam scoring.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PassRule {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<PassMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub basis: Option<PassBasis>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scaled: Option<bool>,
}

/// Mock exam settings; `pass_mark` is the passing fraction of correct answers in 0..=1.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExamConfig {
    /// Exam id. Required in exams[] (validator `bad_id` when missing); the legacy single exam (course.exam) is always id "default".
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub minutes: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pass_mark: Option<f64>,
    pub sections: Vec<Section>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timing: Option<Vec<TimingGroup>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub scoring: Vec<ScoringPart>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pass_points: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pass: Option<PassRule>,
}

/// `course.ruby`: which kanji need no reading. The skip set = Han characters of `skip` plus the Han characters of the string at item path `skipKey` (default `meta.kanji`) of every item tagged `skipTag`. A `{base|reading}` whose Han characters are all in the set renders as bare `base`; other ruby keeps its reading.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RubyConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skip: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skip_tag: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skip_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dict_keys: Option<Vec<String>>,
}

/// Contents of `course.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Course {
    pub id: String,
    pub title: String,
    pub ui_language: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_language: Option<String>,
    #[schemars(length(min = 1))]
    pub units: Vec<Unit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub types: Option<Vec<ItemType>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub srs: Option<SrsConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub srs_by_type: Option<BTreeMap<String, SrsConfig>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exam: Option<ExamConfig>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub exams: Vec<ExamConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub storage: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plugins: Option<Plugins>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub markup: Option<String>,
    /// Script names (`non-latin`, `han`, `hiragana`, `katakana`, `cyrillic`, `greek`, `arabic`, `hebrew`, `hangul`, `devanagari`, `thai`): typed answers in these scripts are blocked while the input holds Latin letters.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_script: Option<Vec<String>>,
    /// Small caption above the question: key = item tag or item type (first matching tag, then type), value = caption text. Absent = the built-in caption for the type.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub captions: Option<BTreeMap<String, String>>,
    /// Ruby (`{base|reading}`) display options: readings over kanji in the skip set are not shown.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ruby: Option<RubyConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub normalize: Option<Normalize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speech: Option<SpeechConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placement: Option<PlacementConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_order: Option<NewOrder>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub scripts: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_override: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intro_new: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "dontKnow")]
    pub dont_know: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub learned_stage: Option<i64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub groups: Vec<Group>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub bars: Vec<Bar>,
    /// Display labels for tags (e.g. `{"n5": "N5"}`); a tag without a label is shown uppercased.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tag_labels: Option<BTreeMap<String, TagLabel>>,
    /// Declarative detail rendering config from item.meta (per-course default).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<DetailConfig>,
    /// Kanji/Han breakdown config: dotted paths into item for key, meaning, and readings.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub breakdown: Option<BreakdownConfig>,
}

/// Kanji/Han breakdown configuration for kanjiIndex/kanjiBreakdown.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BreakdownConfig {
    /// Dot-separated path into item.meta for the kanji character (e.g., "meta.kanji").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    /// Dot-separated path into item.meta for the meaning (e.g., "meta.ru").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meaning: Option<String>,
    /// Array of dot-separated paths into item.meta for readings (e.g., ["meta.on", "meta.kun"]).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub readings: Vec<String>,
}

/// A tag's display metadata: a plain label string, or an object with an optional label and `kind` (`public` or `internal`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(untagged)]
pub enum TagLabel {
    Text(String),
    Detail(TagLabelDetail),
}

/// Object form of a tag label.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TagLabelDetail {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// `public` (default) or `internal` (hidden from the catalog tag chips).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
}

/// A single detail field configuration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DetailField {
    /// Dot-separated path into item.meta (e.g., "meta.meaning" or "meta.readings.kanji").
    pub key: String,
    /// Display label for the field.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// i18n key for the label (used when `label` is absent).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_key: Option<String>,
    /// Field type: "text" (default), "list", "objects", "table", or "pairs".
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "type")]
    pub r#type: Option<String>,
    /// Nested fields for objects type.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fields: Option<Vec<DetailField>>,
    /// Two entry keys (left, right) for the "pairs" type; defaults to `a` and `b`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keys: Option<Vec<String>>,
}

/// Detail configuration for declarative rendering from item.meta.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DetailConfig {
    /// List of detail fields to render.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fields: Vec<DetailField>,
    /// Dotted path into item for the header glyph.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub glyph: Option<String>,
}
