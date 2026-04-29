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

        let raw = match std::fs::read_to_string(&tf.abs_path) {
            Ok(c) => c,
            Err(_) => {
                report.skipped += 1;
                continue;
            }
        };

        // If the YAML is broken (e.g. unquoted colon or backtick in value), repair
        // it at the text level before attempting a structured parse.
        let content = if parser::parse(&raw).is_err() {
            match repair_yaml(&raw) {
                Some(repaired) => {
                    if std::fs::write(&tf.abs_path, &repaired).is_ok() {
                        report.fixed += 1;
                        report.files.push(issue.file.clone());
                    } else {
                        report.skipped += 1;
                    }
                    continue;
                }
                None => {
                    // No frontmatter at all — synthesize minimal one from file content.
                    match synthesize_frontmatter(&raw, &issue.file, &issue.template, template) {
                        Some(new_content) => {
                            if std::fs::write(&tf.abs_path, &new_content).is_ok() {
                                report.fixed += 1;
                                report.files.push(issue.file.clone());
                            } else {
                                report.skipped += 1;
                            }
                        }
                        None => {
                            report.skipped += 1;
                        }
                    }
                    continue;
                }
            }
        } else {
            raw
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

                let default_val = derive_default(field, &template.defaults, repo_path, &tf.abs_path, &parsed.body);
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
    body: &str,
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
        "depends-on" => {
            let ids = extract_deps_from_body(body);
            let seq = ids
                .into_iter()
                .map(serde_yaml::Value::String)
                .collect();
            Some(serde_yaml::Value::Sequence(seq))
        }
        "labels" => Some(serde_yaml::Value::Sequence(vec![])),
        "duplicate-of" => None,
        _ => None,
    }
}

/// Scans markdown body for dependency references in patterns like:
///   **Depende de:** RW-05 (description)
///   **Depends on:** ETM-01, FW-FEAT-02
///   Depende de: VS-IMP-10
/// Returns deduplicated list of IDs in order of appearance.
fn extract_deps_from_body(body: &str) -> Vec<String> {
    use std::sync::LazyLock;
    use regex::Regex;

    // Matches a line that starts a "depends on" declaration (PT or EN, bold or plain)
    static HEADER_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i)\*{0,2}(?:depende\s+de|depends[\s-]on)\*{0,2}\s*:(.*)").unwrap()
    });
    // Matches individual roadmap IDs like RW-05, ETM-01, VS-IMP-10, FW-FEAT-01
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

/// Try to repair a file whose YAML frontmatter contains values that break
/// standard YAML parsing (e.g. unquoted backtick at start, or `: ` inside a
/// plain scalar).  Returns the repaired file content if anything changed.
fn repair_yaml(content: &str) -> Option<String> {
    use std::sync::LazyLock;
    use regex::Regex;

    static FM_RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(?s)^---[ \t]*\n(.*?)\n---[ \t]*\n(.*)$").unwrap());
    // Matches `key: value` where value looks problematic
    static LINE_RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"^([\w][\w-]*):\s+(.+)$").unwrap());

    let caps = FM_RE.captures(content)?;
    let fm_raw = caps.get(1)?.as_str();
    let body   = caps.get(2)?.as_str();

    let mut changed = false;
    let fixed_lines: Vec<String> = fm_raw
        .lines()
        .map(|line| {
            if let Some(lc) = LINE_RE.captures(line) {
                let key = lc.get(1).unwrap().as_str();
                let val = lc.get(2).unwrap().as_str().trim_end();
                // Skip already-quoted values
                if val.starts_with('"') || val.starts_with('\'') {
                    return line.to_string();
                }
                let needs_quoting = val.starts_with('`')
                    || val.starts_with('@')
                    || val.contains(": ");
                if needs_quoting {
                    changed = true;
                    let escaped = val.replace('\\', "\\\\").replace('"', "\\\"");
                    return format!("{}: \"{}\"", key, escaped);
                }
            }
            line.to_string()
        })
        .collect();

    if !changed {
        return None;
    }

    Some(format!("---\n{}\n---\n\n{}", fixed_lines.join("\n"), body.trim_start()))
}

/// Generate a minimal YAML frontmatter block for a file that has none,
/// using the template type/defaults and information extracted from the file.
fn synthesize_frontmatter(
    content: &str,
    file_path: &str,
    item_type: &str,
    template: &crate::scanner::TemplateConfig,
) -> Option<String> {
    // Title: first H1 heading, falling back to the filename slug.
    let title_raw = content
        .lines()
        .find(|l| l.starts_with("# "))
        .map(|l| l.trim_start_matches('#').trim().to_string())
        .unwrap_or_else(|| {
            std::path::Path::new(file_path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled")
                .replace('-', " ")
        });

    let id = derive_id_from_filename(file_path, &template.id_prefix);

    let status = template
        .defaults
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("todo")
        .to_string();

    let title_yaml = writer::yaml_value_pub(&title_raw);

    let fm = format!(
        "---\nid: {id}\ntitle: {title_yaml}\ntype: {tp}\nstatus: {status}\n---\n\n{body}",
        id = id,
        title_yaml = title_yaml,
        tp = item_type,
        status = status,
        body = content.trim_start(),
    );

    Some(fm)
}

/// Derive a roadmap ID from a filename.
/// `etm-01-collective-task-system` → `ETM-01`
/// `fw-feat-05-asset-pack`         → `FW-FEAT-05`
/// `fw-godot-parity-audit`         → `FEAT-00`  (falls back to template prefix)
fn derive_id_from_filename(file_path: &str, id_prefix: &str) -> String {
    let stem = std::path::Path::new(file_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    let parts: Vec<&str> = stem.split('-').collect();

    // Find the first segment that is all ASCII digits.
    if let Some(num_idx) = parts.iter().position(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit())) {
        if num_idx > 0 {
            let prefix = parts[..num_idx].join("-").to_uppercase();
            let num = parts[num_idx];
            return format!("{}-{}", prefix, num);
        }
    }

    // Fallback: template id_prefix + "00".
    format!("{}-00", id_prefix)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_pt_bold() {
        let body = "**Depende de:** RW-05 (foundation, shipped ✅)";
        assert_eq!(extract_deps_from_body(body), vec!["RW-05"]);
    }

    #[test]
    fn extract_en_multiple() {
        let body = "**Depends on:** ETM-01, FW-FEAT-02 (description)";
        assert_eq!(extract_deps_from_body(body), vec!["ETM-01", "FW-FEAT-02"]);
    }

    #[test]
    fn extract_plain_text() {
        let body = "Depende de: VS-IMP-10";
        assert_eq!(extract_deps_from_body(body), vec!["VS-IMP-10"]);
    }

    #[test]
    fn no_deps_returns_empty() {
        let body = "Nenhuma dependência mencionada aqui.";
        assert!(extract_deps_from_body(body).is_empty());
    }
}
