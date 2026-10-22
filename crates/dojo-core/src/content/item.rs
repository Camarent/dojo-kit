use crate::check::Normalize;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Question types available in v1.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ItemType {
    Choice,
    Gap,
    Card,
    Multi,
    Match,
    Order,
    Cloze,
    Numeric,
}

impl ItemType {
    /// All item types in canonical stats order.
    pub const ALL: [ItemType; 8] = [
        ItemType::Choice,
        ItemType::Gap,
        ItemType::Card,
        ItemType::Multi,
        ItemType::Match,
        ItemType::Order,
        ItemType::Cloze,
        ItemType::Numeric,
    ];

    /// True for types the learner rates themselves (only `card`); all others grade to a boolean.
    pub fn is_self_rated(self) -> bool {
        self == ItemType::Card
    }

    /// The lowercase wire name of the type.
    pub fn as_str(self) -> &'static str {
        match self {
            ItemType::Choice => "choice",
            ItemType::Gap => "gap",
            ItemType::Card => "card",
            ItemType::Multi => "multi",
            ItemType::Match => "match",
            ItemType::Order => "order",
            ItemType::Cloze => "cloze",
            ItemType::Numeric => "numeric",
        }
    }
}

impl std::hash::Hash for ItemType {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        std::mem::discriminant(self).hash(state);
    }
}

/// Lifecycle state of an item; retired items stay in shipped data and are skipped by queues.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Active,
    Retired,
}

/// Order for new items: file order or random.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum NewOrder {
    File,
    Random,
}

/// Multiple-choice item; `answer` is the index into `options`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ChoiceItem {
    pub id: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<Vec<String>>,
    pub options: Vec<String>,
    pub answer: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stimulus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}

/// Typed-answer item; any entry of `answers` is accepted after normalization.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct GapItem {
    pub id: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<Vec<String>>,
    pub answers: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub retry: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub normalize: Option<Normalize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stimulus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}

/// Self-rated flash card; the front is `prompt`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CardItem {
    pub id: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<Vec<String>>,
    pub back: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stimulus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}

/// Multiple-answer item; `correct` lists the indices into `options` that must all be selected.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct MultiItem {
    pub id: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<Vec<String>>,
    pub options: Vec<String>,
    pub correct: Vec<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stimulus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}

/// One left/right pair of a `match` item.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Pair {
    pub left: String,
    pub right: String,
}

/// Matching item; `distractors` are extra wrong right-hand choices.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct MatchItem {
    pub id: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<Vec<String>>,
    pub pairs: Vec<Pair>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub distractors: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stimulus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}

/// Ordering item; `steps` are listed in the correct order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct OrderItem {
    pub id: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<Vec<String>>,
    pub steps: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stimulus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}

/// A cloze part: literal text, or a blank listing its accepted alternatives.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(untagged)]
pub enum ClozePart {
    Text(String),
    Blank(Vec<String>),
}

/// Fill-in-the-blanks item built from `parts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ClozeItem {
    pub id: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<Vec<String>>,
    pub parts: Vec<ClozePart>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub normalize: Option<Normalize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stimulus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}

/// Numeric-answer item; `tolerance` is absolute, `unit_label` (wire `unitLabel`) is display only.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NumericItem {
    pub id: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supersedes: Option<Vec<String>>,
    pub answer: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tolerance: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit_label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stimulus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speak: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}

/// One line of a content JSONL file, tagged by `"type"`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Item {
    Choice(ChoiceItem),
    Gap(GapItem),
    Card(CardItem),
    Multi(MultiItem),
    Match(MatchItem),
    Order(OrderItem),
    Cloze(ClozeItem),
    Numeric(NumericItem),
}

impl Item {
    pub fn id(&self) -> &str {
        match self {
            Item::Choice(i) => &i.id,
            Item::Gap(i) => &i.id,
            Item::Card(i) => &i.id,
            Item::Multi(i) => &i.id,
            Item::Match(i) => &i.id,
            Item::Order(i) => &i.id,
            Item::Cloze(i) => &i.id,
            Item::Numeric(i) => &i.id,
        }
    }

    pub fn unit(&self) -> &str {
        match self {
            Item::Choice(i) => &i.unit,
            Item::Gap(i) => &i.unit,
            Item::Card(i) => &i.unit,
            Item::Multi(i) => &i.unit,
            Item::Match(i) => &i.unit,
            Item::Order(i) => &i.unit,
            Item::Cloze(i) => &i.unit,
            Item::Numeric(i) => &i.unit,
        }
    }

    pub fn item_type(&self) -> ItemType {
        match self {
            Item::Choice(_) => ItemType::Choice,
            Item::Gap(_) => ItemType::Gap,
            Item::Card(_) => ItemType::Card,
            Item::Multi(_) => ItemType::Multi,
            Item::Match(_) => ItemType::Match,
            Item::Order(_) => ItemType::Order,
            Item::Cloze(_) => ItemType::Cloze,
            Item::Numeric(_) => ItemType::Numeric,
        }
    }

    /// Ids of retired items this item replaces; empty when the field is absent.
    pub fn supersedes(&self) -> &[String] {
        self.supersedes_field().unwrap_or(&[])
    }

    /// The `supersedes` field as written; `None` when absent.
    pub fn supersedes_field(&self) -> Option<&[String]> {
        match self {
            Item::Choice(i) => i.supersedes.as_deref(),
            Item::Gap(i) => i.supersedes.as_deref(),
            Item::Card(i) => i.supersedes.as_deref(),
            Item::Multi(i) => i.supersedes.as_deref(),
            Item::Match(i) => i.supersedes.as_deref(),
            Item::Order(i) => i.supersedes.as_deref(),
            Item::Cloze(i) => i.supersedes.as_deref(),
            Item::Numeric(i) => i.supersedes.as_deref(),
        }
    }

    pub fn is_retired(&self) -> bool {
        let status = match self {
            Item::Choice(i) => i.status,
            Item::Gap(i) => i.status,
            Item::Card(i) => i.status,
            Item::Multi(i) => i.status,
            Item::Match(i) => i.status,
            Item::Order(i) => i.status,
            Item::Cloze(i) => i.status,
            Item::Numeric(i) => i.status,
        };
        status == Some(Status::Retired)
    }

    pub fn stimulus(&self) -> Option<&str> {
        match self {
            Item::Choice(i) => i.stimulus.as_deref(),
            Item::Gap(i) => i.stimulus.as_deref(),
            Item::Card(i) => i.stimulus.as_deref(),
            Item::Multi(i) => i.stimulus.as_deref(),
            Item::Match(i) => i.stimulus.as_deref(),
            Item::Order(i) => i.stimulus.as_deref(),
            Item::Cloze(i) => i.stimulus.as_deref(),
            Item::Numeric(i) => i.stimulus.as_deref(),
        }
    }

    pub fn speak(&self) -> Option<&str> {
        match self {
            Item::Choice(i) => i.speak.as_deref(),
            Item::Gap(i) => i.speak.as_deref(),
            Item::Card(i) => i.speak.as_deref(),
            Item::Multi(i) => i.speak.as_deref(),
            Item::Match(i) => i.speak.as_deref(),
            Item::Order(i) => i.speak.as_deref(),
            Item::Cloze(i) => i.speak.as_deref(),
            Item::Numeric(i) => i.speak.as_deref(),
        }
    }

    pub fn tags(&self) -> Option<&Vec<String>> {
        match self {
            Item::Choice(i) => Some(&i.tags),
            Item::Gap(i) => Some(&i.tags),
            Item::Card(i) => Some(&i.tags),
            Item::Multi(i) => Some(&i.tags),
            Item::Match(i) => Some(&i.tags),
            Item::Order(i) => Some(&i.tags),
            Item::Cloze(i) => Some(&i.tags),
            Item::Numeric(i) => Some(&i.tags),
        }
    }

    pub fn entity(&self) -> Option<&str> {
        match self {
            Item::Choice(i) => i.entity.as_deref(),
            Item::Gap(i) => i.entity.as_deref(),
            Item::Card(i) => i.entity.as_deref(),
            Item::Multi(i) => i.entity.as_deref(),
            Item::Match(i) => i.entity.as_deref(),
            Item::Order(i) => i.entity.as_deref(),
            Item::Cloze(i) => i.entity.as_deref(),
            Item::Numeric(i) => i.entity.as_deref(),
        }
    }
}
