use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ToSidecar {
    #[serde(rename = "init")]
    Init {
        trigger: String,
        repo_id: String,
        model: String,
        context: serde_json::Value,
    },
    #[serde(rename = "user_response")]
    UserResponse { text: String },
    #[serde(rename = "tool_result")]
    ToolResult { id: String, result: serde_json::Value },
    #[serde(rename = "abort")]
    Abort,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum FromSidecar {
    #[serde(rename = "delta")]
    Delta { text: String },
    #[serde(rename = "tool_call")]
    ToolCall {
        id: String,
        name: String,
        args: serde_json::Value,
    },
    #[serde(rename = "question")]
    Question { text: String },
    #[serde(rename = "finished")]
    Finished {
        result: serde_json::Value,
        model: String,
        #[serde(rename = "tokensIn")]
        tokens_in: Option<u64>,
        #[serde(rename = "tokensOut")]
        tokens_out: Option<u64>,
        #[serde(rename = "costUsd")]
        cost_usd: Option<f64>,
    },
    #[serde(rename = "error")]
    Error { message: String },
}
