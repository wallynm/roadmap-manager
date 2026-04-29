pub mod checkboxes;
pub mod status;

use regex::Regex;
use sha2::{Digest, Sha256};
use std::sync::LazyLock;

use crate::error::{AppError, AppResult};

static FM_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)^---\s*\n(.*?)\n---\s*\n(.*)$").unwrap());

#[derive(Debug, Clone)]
pub struct Parsed {
    pub yaml: serde_yaml::Value,
    pub body: String,
    pub raw_frontmatter: String,
}

pub fn parse(content: &str) -> AppResult<Parsed> {
    let caps = FM_REGEX.captures(content).ok_or_else(|| AppError::Parse {
        path: String::new(),
        message: "No frontmatter found (missing --- delimiters)".into(),
    })?;

    let raw_fm = caps.get(1).unwrap().as_str().to_string();
    let body = caps.get(2).unwrap().as_str().to_string();

    let yaml: serde_yaml::Value = serde_yaml::from_str(&raw_fm).map_err(|e| AppError::Parse {
        path: String::new(),
        message: format!("Invalid YAML: {}", e),
    })?;

    Ok(Parsed {
        yaml,
        body,
        raw_frontmatter: raw_fm,
    })
}

pub fn hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn extract_string(yaml: &serde_yaml::Value, key: &str) -> Option<String> {
    yaml.get(key).and_then(|v| match v {
        serde_yaml::Value::String(s) => Some(s.clone()),
        serde_yaml::Value::Number(n) => Some(n.to_string()),
        serde_yaml::Value::Bool(b) => Some(b.to_string()),
        _ => None,
    })
}

pub fn extract_string_array(yaml: &serde_yaml::Value, key: &str) -> Vec<String> {
    yaml.get(key)
        .and_then(|v| v.as_sequence())
        .map(|seq| {
            seq.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

/// Scans a markdown body for inline dependency references.
/// Matches lines like `**Depende de:** RW-05` or `**Depends on:** ETM-01, FW-FEAT-02`.
/// Returns deduplicated IDs in order of appearance.
pub fn extract_deps_from_body(body: &str) -> Vec<String> {
    static HEADER_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i)\*{0,2}(?:depende\s+de|depends[\s-]on)\*{0,2}\s*:(.*)").unwrap()
    });
    static ID_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+)\b").unwrap()
    });

    let mut ids: Vec<String> = Vec::new();
    for line in body.lines() {
        if let Some(caps) = HEADER_RE.captures(line) {
            let rest = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            for id_cap in ID_RE.captures_iter(rest) {
                let id = id_cap.get(1).unwrap().as_str().to_string();
                if !ids.contains(&id) {
                    ids.push(id);
                }
            }
        }
    }
    ids
}

pub fn normalize_priority(s: &str) -> Option<String> {
    let lower = s.to_lowercase().trim().to_string();
    match lower.as_str() {
        "urgente" => Some("Urgente".into()),
        "alta" => Some("Alta".into()),
        "média" | "media" => Some("Média".into()),
        "baixa" => Some("Baixa".into()),
        "nenhuma" | "" => Some("Nenhuma".into()),
        _ => {
            if s.starts_with(|c: char| c.is_uppercase()) {
                Some(s.to_string())
            } else {
                Some("Nenhuma".into())
            }
        }
    }
}
