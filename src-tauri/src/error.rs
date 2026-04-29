use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("YAML parse error: {0}")]
    Yaml(#[from] serde_yaml::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Git error: {0}")]
    Git(#[from] git2::Error),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Invalid transition from {from} to {to}")]
    InvalidTransition { from: String, to: String },

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Parse error at {path}: {message}")]
    Parse { path: String, message: String },

    #[error("Wrong branch: expected {expected}, actual {actual}")]
    WrongBranch { expected: String, actual: String },

    #[error("Branch not allowed: {branch}")]
    BranchNotAllowed { branch: String },

    #[error("Repo is dirty with uncommitted changes")]
    RepoDirty,

    #[error("Conflict detected: {0}")]
    Conflict(String),

    #[error("Agent error: {0}")]
    Agent(String),

    #[error("{0}")]
    Generic(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
