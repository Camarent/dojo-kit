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

/// Lifecycle state of an item; a retired id may leave the content if listed in ids.lock `retired` (see CONTRACT.md:64) and is skipped by queues.
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
