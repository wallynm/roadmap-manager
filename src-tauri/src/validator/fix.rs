use std::path::Path;

use crate::parser;
use crate::scanner::{walk_template_files, RepoConfig};
use crate::writer;

use super::ValidationIssue;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FixReport {
    pub fixed: u32,
    pub skipped: u32,
    pub files: Vec<String>,
}

pub fn fix_issues(
    repo_path: &Path,
    config: &RepoConfig,
    issues: &[ValidationIssue],
) -> FixReport {
    let mut report = FixReport {
        fixed: 0,
        skipped: 0,
        files: Vec::new(),
    };

    let template_files = walk_template_files(repo_path, config);

    for issue in issues {
        let template = match config.templates.get(&issue.template) {
            Some(t) => t,
            None => {
                report.skipped += 1;
                continue;
            }
        };

        let tf = match template_files.iter().find(|f| f.rel_path == issue.file) {
            Some(f) => f,
            None => {
                report.skipped += 1;
                continue;
            }
        };

        let content = match std::fs::read_to_string(&tf.abs_path) {
            Ok(c) => c,
            Err(_) => {
                report.skipped += 1;
                continue;
            }
        };

        let parsed = match parser::parse(&content) {
            Ok(p) => p,
            Err(_) => {
                report.skipped += 1;
                continue;
            }
        };

        let mut yaml = parsed.yaml.clone();
        let mut changed = false;

        for field in &issue.missing {
            if let Some(mapping) = yaml.as_mapping_mut() {
                let key = serde_yaml::Value::String(field.clone());
                if mapping.contains_key(&key) {
                    continue;
                }

                let default_val = derive_default(field, &template.defaults, repo_path, &tf.abs_path);
                if let Some(val) = default_val {
                    mapping.insert(key, val);
                    changed = true;
                }
            }
        }

        if !changed {
            report.skipped += 1;
            continue;
        }

        let new_fm = render_yaml_frontmatter(&yaml, &template.frontmatter_fields);
        let new_content = format!("---\n{}\n---\n\n{}\n", new_fm, parsed.body.trim_end());

        if let Err(_) = std::fs::write(&tf.abs_path, &new_content) {
            report.skipped += 1;
            continue;
        }

        report.fixed += 1;
        report.files.push(issue.file.clone());
    }

    report
}

fn derive_default(
    field: &str,
    defaults: &serde_json::Value,
    repo_path: &Path,
    file_path: &Path,
) -> Option<serde_yaml::Value> {
    if let Some(val) = defaults.get(field) {
        return json_to_yaml(val);
    }

    match field {
        "created-date" => {
            let date = git_first_commit_date(repo_path, file_path)
                .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());
            Some(serde_yaml::Value::String(date))
        }
        "completed-date" => None,
        "started-date" => None,
        "depends-on" => Some(serde_yaml::Value::Sequence(vec![])),
        "labels" => Some(serde_yaml::Value::Sequence(vec![])),
        "duplicate-of" => None,
        _ => None,
    }
}

fn git_first_commit_date(repo_path: &Path, file_path: &Path) -> Option<String> {
    let git_repo = git2::Repository::open(repo_path).ok()?;
    let rel = file_path.strip_prefix(repo_path).ok()?;
    let rel_str = rel.to_string_lossy();

    let mut revwalk = git_repo.revwalk().ok()?;
    revwalk.push_head().ok()?;
    revwalk.set_sorting(git2::Sort::TIME | git2::Sort::REVERSE).ok()?;

    for oid in revwalk.flatten() {
        let commit = git_repo.find_commit(oid).ok()?;
        let tree = commit.tree().ok()?;
        if tree.get_path(Path::new(&*rel_str)).is_ok() {
            let time = commit.time();
            let secs = time.seconds();
            let dt = chrono::DateTime::from_timestamp(secs, 0)?;
            return Some(dt.format("%Y-%m-%d").to_string());
        }
    }
    None
}

fn json_to_yaml(val: &serde_json::Value) -> Option<serde_yaml::Value> {
    match val {
        serde_json::Value::String(s) => Some(serde_yaml::Value::String(s.clone())),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Some(serde_yaml::Value::Number(serde_yaml::Number::from(i)))
            } else if let Some(f) = n.as_f64() {
                Some(serde_yaml::Value::Number(serde_yaml::Number::from(f)))
            } else {
                None
            }
        }
        serde_json::Value::Bool(b) => Some(serde_yaml::Value::Bool(*b)),
        serde_json::Value::Array(arr) => {
            let seq: Vec<serde_yaml::Value> = arr.iter().filter_map(json_to_yaml).collect();
            Some(serde_yaml::Value::Sequence(seq))
        }
        _ => None,
    }
}

fn render_yaml_frontmatter(yaml: &serde_yaml::Value, field_order: &[String]) -> String {
    let mapping = match yaml.as_mapping() {
        Some(m) => m,
        None => return String::new(),
    };

    let mut lines = Vec::new();

    for field in field_order {
        let key = serde_yaml::Value::String(field.clone());
        if let Some(val) = mapping.get(&key) {
            lines.push(format!("{}: {}", field, format_yaml_value(val, field)));
        }
    }

    for (key, val) in mapping.iter() {
        if let Some(k) = key.as_str() {
            if !field_order.iter().any(|f| f == k) {
                lines.push(format!("{}: {}", k, format_yaml_value(val, k)));
            }
        }
    }

    lines.join("\n")
}

fn format_yaml_value(val: &serde_yaml::Value, field: &str) -> String {
    match val {
        serde_yaml::Value::String(s) => {
            let is_array_field = matches!(field, "labels" | "depends-on");
            if is_array_field {
                return s.clone();
            }
            writer::yaml_value_pub(s)
        }
        serde_yaml::Value::Number(n) => n.to_string(),
        serde_yaml::Value::Bool(b) => b.to_string(),
        serde_yaml::Value::Sequence(seq) => {
            if seq.is_empty() {
                "[]".to_string()
            } else {
                let items: Vec<String> = seq
                    .iter()
                    .map(|v| match v {
                        serde_yaml::Value::String(s) => s.clone(),
                        other => format!("{:?}", other),
                    })
                    .collect();
                format!("[{}]", items.join(", "))
            }
        }
        serde_yaml::Value::Null => String::new(),
        _ => format!("{:?}", val),
    }
}
