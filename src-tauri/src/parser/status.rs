use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemStatus {
    Backlog,
    Todo,
    InProgress,
    Done,
    Canceled,
    Duplicate,
}

impl ItemStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Backlog => "backlog",
            Self::Todo => "todo",
            Self::InProgress => "in_progress",
            Self::Done => "done",
            Self::Canceled => "canceled",
            Self::Duplicate => "duplicate",
        }
    }

    pub fn frontmatter_string(&self) -> &'static str {
        match self {
            Self::Backlog => "📋 backlog",
            Self::Todo => "⬜ pendente",
            Self::InProgress => "🔄 em andamento",
            Self::Done => "✅ resolvido",
            Self::Canceled => "❌ cancelado",
            Self::Duplicate => "🔗 duplicado",
        }
    }

    pub fn allowed_transitions(&self) -> Vec<ItemStatus> {
        match self {
            Self::Backlog => vec![Self::Todo, Self::InProgress, Self::Canceled, Self::Duplicate],
            Self::Todo => vec![Self::Backlog, Self::InProgress, Self::Canceled, Self::Duplicate],
            Self::InProgress => vec![
                Self::Backlog,
                Self::Todo,
                Self::Done,
                Self::Canceled,
                Self::Duplicate,
            ],
            Self::Done => vec![Self::Todo],
            Self::Canceled => vec![Self::Todo],
            Self::Duplicate => vec![],
        }
    }

    pub fn can_transition_to(&self, to: &ItemStatus) -> bool {
        if self == to {
            return true;
        }
        self.allowed_transitions().contains(to)
    }

    pub fn status_verb(&self) -> &'static str {
        match self {
            Self::Backlog => "replanned",
            Self::Todo => "pendente",
            Self::InProgress => "started",
            Self::Done => "resolvido",
            Self::Canceled => "cancelado",
            Self::Duplicate => "marcado como duplicado",
        }
    }
}

pub fn normalize_status(s: &str) -> ItemStatus {
    let lower = s.to_lowercase();
    let trimmed = lower.trim();

    if trimmed.contains("backlog") || trimmed.contains("planned") || trimmed.starts_with("📋") {
        return ItemStatus::Backlog;
    }
    if trimmed.contains("pendente") || trimmed.contains("todo") || trimmed.starts_with("⬜") {
        return ItemStatus::Todo;
    }
    if trimmed.contains("em andamento")
        || trimmed.contains("em progresso")
        || trimmed.contains("in progress")
        || trimmed.starts_with("🔄")
    {
        return ItemStatus::InProgress;
    }
    if trimmed.contains("resolvido")
        || trimmed.contains("shipped")
        || trimmed.contains("done")
        || trimmed.starts_with("✅")
    {
        return ItemStatus::Done;
    }
    if trimmed.contains("cancelado")
        || trimmed.contains("cancelled")
        || trimmed.contains("canceled")
        || trimmed.starts_with("❌")
    {
        return ItemStatus::Canceled;
    }
    if trimmed.contains("duplicado")
        || trimmed.contains("duplicate")
        || trimmed.starts_with("🔗")
    {
        return ItemStatus::Duplicate;
    }

    ItemStatus::Backlog
}
