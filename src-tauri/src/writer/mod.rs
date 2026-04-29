pub mod ids;
pub mod slug;

use std::path::Path;

use crate::db::items::Item;
use crate::error::AppResult;
use crate::parser;
use crate::scanner::TemplateConfig;

pub fn yaml_value_pub(v: &str) -> String {
    yaml_value(v)
}

fn yaml_value(v: &str) -> String {
    if v.is_empty() {
        return v.to_string();
    }
    let needs_quote = v.contains(": ")
        || v.contains('#')
        || v.starts_with(|c: char| matches!(c, '[' | '{' | '>' | '|' | '!' | '&' | '*' | '\''))
        || v.contains('"')
        || v.contains('\\');
    if needs_quote {
        let escaped = v.replace('\\', "\\\\").replace('"', "\\\"");
        format!("\"{}\"", escaped)
    } else {
        v.to_string()
    }
}

pub fn render(item: &Item, template: &TemplateConfig) -> String {
    let mut fm_lines: Vec<String> = Vec::new();

    for field in &template.frontmatter_fields {
        let value = match field.as_str() {
            "id" => Some(item.external_id.clone()),
            "title" => Some(item.title.clone()),
            "type" => Some(item.item_type.clone()),
            "priority" => item.priority.clone(),
            "status" => {
                let status = parser::status::normalize_status(&item.status);
                Some(status.frontmatter_string().to_string())
            }
            "labels" => {
                let labels: Vec<String> =
                    serde_json::from_str(&item.labels).unwrap_or_default();
                if labels.is_empty() {
                    Some("[]".to_string())
                } else {
                    Some(format!("[{}]", labels.join(", ")))
                }
            }
            "created-date" => item.created_date.clone(),
            "started-date" => item.started_date.clone(),
            "completed-date" => item.completed_date.clone(),
            "depends-on" => {
                let deps: Vec<String> =
                    serde_json::from_str(&item.depends_on).unwrap_or_default();
                if deps.is_empty() {
                    Some("[]".to_string())
                } else {
                    Some(format!("[{}]", deps.join(", ")))
                }
            }
            "duplicate-of" => item.duplicate_of.clone(),
            _ => None,
        };

        let is_literal_array = matches!(field.as_str(), "labels" | "depends-on");
        if let Some(v) = value {
            if is_literal_array {
                fm_lines.push(format!("{}: {}", field, v));
            } else {
                fm_lines.push(format!("{}: {}", field, yaml_value(&v)));
            }
        }
    }

    let frontmatter = fm_lines.join("\n");
    let body = item.body.trim_end();

    format!("---\n{}\n---\n\n{}\n", frontmatter, body)
}

pub fn compute_hash(content: &str) -> String {
    parser::hash(content)
}

pub async fn write_atomic(path: &Path, content: &str) -> AppResult<()> {
    let tmp_path = path.with_extension("md.tmp");
    tokio::fs::write(&tmp_path, content).await?;
    tokio::fs::rename(&tmp_path, path).await?;
    Ok(())
}

pub fn format_commit_message(
    format: &str,
    item: &Item,
    action: &str,
) -> String {
    let status = parser::status::normalize_status(&item.status);
    format
        .replace("{ID}", &item.external_id)
        .replace("{TITLE}", &item.title)
        .replace("{TYPE}", &item.item_type)
        .replace("{STATUS}", status.frontmatter_string())
        .replace("{STATUS_VERB}", action)
        .replace(
            "{DATE}",
            &chrono::Utc::now().format("%Y-%m-%d").to_string(),
        )
}
