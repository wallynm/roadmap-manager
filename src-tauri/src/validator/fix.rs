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
    on_progress: impl Fn(u32, u32, &str, bool),
) -> FixReport {
    let mut report = FixReport {
        fixed: 0,
        skipped: 0,
        files: Vec::new(),
    };

    let template_files = walk_template_files(repo_path, config);
    fix_duplicate_ids(repo_path, config, &template_files, &mut report);
    migrate_area_to_labels(config, &template_files, &mut report);

    let total = issues.len() as u32;
    let mut done: u32 = 0;

    for issue in issues {
        macro_rules! skip {
            () => {{
                report.skipped += 1;
                done += 1;
                on_progress(done, total, &issue.file, false);
                continue;
            }};
        }
        macro_rules! fixed {
            () => {{
                report.fixed += 1;
                report.files.push(issue.file.clone());
                done += 1;
                on_progress(done, total, &issue.file, true);
                continue;
            }};
        }

        let template = match config.templates.get(&issue.template) {
            Some(t) => t,
            None => skip!(),
        };

        let tf = match template_files.iter().find(|f| f.rel_path == issue.file) {
            Some(f) => f,
            None => skip!(),
        };

        let raw = match std::fs::read_to_string(&tf.abs_path) {
            Ok(c) => c,
            Err(_) => skip!(),
        };

        // If the YAML is broken (e.g. unquoted colon or backtick in value), repair
        // it at the text level before attempting a structured parse.
        let content = if parser::parse(&raw).is_err() {
            match repair_yaml(&raw) {
                Some(repaired) => {
                    if std::fs::write(&tf.abs_path, &repaired).is_ok() {
                        fixed!();
                    } else {
                        skip!();
                    }
                }
                None => {
                    // No frontmatter at all — synthesize minimal one from file content.
                    match synthesize_frontmatter(&raw, &issue.file, &issue.template, template) {
                        Some(new_content) => {
                            if std::fs::write(&tf.abs_path, &new_content).is_ok() {
                                fixed!();
                            } else {
                                skip!();
                            }
                        }
                        None => skip!(),
                    }
                }
            }
        } else {
            raw
        };

        let parsed = match parser::parse(&content) {
            Ok(p) => p,
            Err(_) => skip!(),
        };

        let mut yaml = parsed.yaml.clone();
        let mut changed = false;

        for field in &issue.missing {
            if let Some(mapping) = yaml.as_mapping_mut() {
                let key = serde_yaml::Value::String(field.clone());
                if mapping.contains_key(&key) {
                    // For sequence fields: allow overwriting an existing empty sequence
                    // so body-extracted values (e.g. depends-on) can be backfilled.
                    let is_empty_seq = mapping
                        .get(&key)
                        .and_then(|v| v.as_sequence())
                        .map(|s| s.is_empty())
                        .unwrap_or(false);
                    if !is_empty_seq {
                        continue;
                    }
                }

                // derive_default handles dates, labels, depends-on.
                // Required scalar fields that it can't fill are handled here.
                let default_val = match field.as_str() {
                    "type" => Some(serde_yaml::Value::String(issue.template.clone())),
                    "id" => Some(serde_yaml::Value::String(
                        derive_id_from_filename(&tf.rel_path, &template.id_prefix),
                    )),
                    "title" => {
                        let title = parsed
                            .body
                            .lines()
                            .find(|l| l.starts_with("# "))
                            .map(|l| l.trim_start_matches('#').trim().to_string())
                            .filter(|s| !s.is_empty())
                            .unwrap_or_else(|| {
                                std::path::Path::new(&tf.rel_path)
                                    .file_stem()
                                    .and_then(|s| s.to_str())
                                    .unwrap_or("Untitled")
                                    .replace('-', " ")
                                    .replace('_', " ")
                            });
                        Some(serde_yaml::Value::String(title))
                    }
                    _ => derive_default(field, &template.defaults, repo_path, &tf.abs_path, &parsed.body),
                };
                if let Some(val) = default_val {
                    mapping.insert(key, val);
                    changed = true;
                }
            }
        }

        if !changed {
            skip!();
        }

        let new_fm = render_yaml_frontmatter(&yaml, &template.frontmatter_fields);
        let new_content = format!("---\n{}\n---\n\n{}\n", new_fm, parsed.body.trim_end());

        if std::fs::write(&tf.abs_path, &new_content).is_err() {
            skip!();
        }

        fixed!();
    }

    report
}

/// Scans ALL template files and fixes any that share the same (scope, external_id).
/// Keeps the first file as-is; for each subsequent duplicate, generates a new
/// unique ID via djb2 hash and rewrites the file's frontmatter.
fn fix_duplicate_ids(
    _repo_path: &Path,
    config: &RepoConfig,
    template_files: &[crate::scanner::TemplateFile],
    report: &mut FixReport,
) {
    use std::collections::HashMap;

    // Map (template, scope, external_id) → first file that claimed it
    let mut seen: HashMap<(String, String, String), String> = HashMap::new();

    for tf in template_files {
        let template = match config.templates.get(&tf.template_name) {
            Some(t) => t,
            None => continue,
        };

        let raw = match std::fs::read_to_string(&tf.abs_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let parsed = match parser::parse(&raw) {
            Ok(p) => p,
            Err(_) => continue,
        };

        let external_id = parser::extract_string(&parsed.yaml, "id").unwrap_or_default();
        if external_id.is_empty() {
            continue;
        }

        let scope = crate::scanner::derive_scope(&tf.rel_path, &template.dir);
        let key = (tf.template_name.clone(), scope, external_id.clone());

        if let Some(first) = seen.get(&key) {
            if first == &tf.rel_path {
                continue;
            }
            // Duplicate: regenerate ID for this file.
            let new_id = derive_id_from_filename(&tf.rel_path, &template.id_prefix);
            let mut yaml = parsed.yaml.clone();
            if let Some(mapping) = yaml.as_mapping_mut() {
                mapping.insert(
                    serde_yaml::Value::String("id".into()),
                    serde_yaml::Value::String(new_id.clone()),
                );
            }
            let new_fm = render_yaml_frontmatter(&yaml, &template.frontmatter_fields);
            let new_content = format!("---\n{}\n---\n\n{}\n", new_fm, parsed.body.trim_end());
            if std::fs::write(&tf.abs_path, &new_content).is_ok() {
                report.fixed += 1;
                report.files.push(tf.rel_path.clone());
                // Register the new ID so subsequent duplicates of THIS file also get fixed.
                seen.insert(
                    (tf.template_name.clone(), crate::scanner::derive_scope(&tf.rel_path, &template.dir), new_id),
                    tf.rel_path.clone(),
                );
            } else {
                report.skipped += 1;
            }
        } else {
            seen.insert(key, tf.rel_path.clone());
        }
    }
}

/// Finds any file that has an `area:` frontmatter field and migrates it to `labels:`,
/// merging with existing labels and removing the `area:` key.
fn migrate_area_to_labels(
    config: &RepoConfig,
    template_files: &[crate::scanner::TemplateFile],
    report: &mut FixReport,
) {
    for tf in template_files {
        let template = match config.templates.get(&tf.template_name) {
            Some(t) => t,
            None => continue,
        };

        let raw = match std::fs::read_to_string(&tf.abs_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let parsed = match parser::parse(&raw) {
            Ok(p) => p,
            Err(_) => continue,
        };

        let mapping = match parsed.yaml.as_mapping() {
            Some(m) => m,
            None => continue,
        };

        let area_key = serde_yaml::Value::String("area".to_string());
        let area_str = match mapping.get(&area_key).and_then(|v| v.as_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => continue,
        };

        let labels_key = serde_yaml::Value::String("labels".to_string());
        let mut labels: Vec<String> = match mapping.get(&labels_key) {
            Some(serde_yaml::Value::Sequence(seq)) => seq
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect(),
            Some(serde_yaml::Value::String(s)) => {
                let trimmed = s.trim_matches(|c| c == '[' || c == ']');
                if trimmed.is_empty() {
                    vec![]
                } else {
                    trimmed.split(',').map(|p| p.trim().to_string()).collect()
                }
            }
            _ => vec![],
        };

        if !labels.contains(&area_str) {
            labels.push(area_str);
        }

        let mut new_yaml = parsed.yaml.clone();
        if let Some(m) = new_yaml.as_mapping_mut() {
            m.remove(&area_key);
            m.insert(
                labels_key,
                serde_yaml::Value::Sequence(
                    labels.iter().map(|l| serde_yaml::Value::String(l.clone())).collect(),
                ),
            );
        }

        let new_fm = render_yaml_frontmatter(&new_yaml, &template.frontmatter_fields);
        let new_content = format!("---\n{}\n---\n\n{}\n", new_fm, parsed.body.trim_end());

        if std::fs::write(&tf.abs_path, &new_content).is_ok() {
            report.fixed += 1;
            report.files.push(tf.rel_path.clone());
        } else {
            report.skipped += 1;
        }
    }
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
            let ids = crate::parser::extract_deps_from_body(body);
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
    let h1_line = content.lines().find(|l| l.starts_with("# "));

    // Title: strip the "# " prefix and any ID prefix (e.g. "RW-01 — ").
    let title_raw = h1_line
        .map(|l| {
            let heading = l.trim_start_matches('#').trim();
            // If the heading starts with an ID like "RW-01 — ...", strip it for the title.
            if let Some(id) = extract_id_from_heading(heading) {
                heading
                    .trim_start_matches(id.as_str())
                    .trim_start_matches(|c: char| c == ' ' || c == '—' || c == '–' || c == '-')
                    .trim()
                    .to_string()
            } else {
                heading.to_string()
            }
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            std::path::Path::new(file_path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled")
                .replace('-', " ")
        });

    // ID: prefer one found in the H1 heading, fall back to filename derivation.
    let id = h1_line
        .and_then(|l| extract_id_from_heading(l.trim_start_matches('#').trim()))
        .unwrap_or_else(|| derive_id_from_filename(file_path, &template.id_prefix));

    // Status: prefer one found in the body, fall back to the template default.
    let status = extract_status_from_body(content).unwrap_or_else(|| {
        template
            .defaults
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("todo")
            .to_string()
    });

    // Depends-on: extract from body using the existing parser helper.
    let depends_on = parser::extract_deps_from_body(content);

    let title_yaml = writer::yaml_value_pub(&title_raw);

    let mut lines = vec![
        format!("id: {}", id),
        format!("title: {}", title_yaml),
        format!("type: {}", item_type),
        format!("status: {}", status),
    ];

    if !depends_on.is_empty() {
        lines.push("depends-on:".to_string());
        for dep in &depends_on {
            lines.push(format!("  - {}", dep));
        }
    }

    let fm = format!("---\n{}\n---\n\n{}", lines.join("\n"), content.trim_start());
    Some(fm)
}

/// Extract an ID token from the start of a heading string.
/// Handles `RW-01 — ...` → `RW-01` and `L01 — ...` → `L01`.
fn extract_id_from_heading(heading: &str) -> Option<String> {
    use std::sync::LazyLock;
    use regex::Regex;

    // Matches IDs at the start of the heading followed by a separator (—, –, -, space).
    // Covers: "RW-01", "L01", "FW-FEAT-05", but not plain words like "ROADMAP".
    static RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+|[A-Z]+\d+)\s*(?:[—–]|(?:-\s))").unwrap()
    });

    RE.captures(heading)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}

/// Extract a status value from body text that uses the informal bold/blockquote format.
/// Handles: `> **Status:** ✅ Complete` and `**Status:** \`✅ shipped\` (commits...)`.
fn extract_status_from_body(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim().trim_start_matches('>').trim();
        if !trimmed.starts_with("**Status:**") {
            continue;
        }
        let raw = trimmed.trim_start_matches("**Status:**").trim();
        // Cut off parenthetical suffixes first, then strip surrounding backticks.
        let cleaned = raw
            .splitn(2, '(')
            .next()
            .unwrap_or(raw)
            .trim()
            .trim_matches('`')
            .trim()
            .to_string();
        if !cleaned.is_empty() {
            return Some(cleaned);
        }
    }
    None
}

/// Derive a roadmap ID from a filename.
/// `rw-01-foundation`              → `RW-01`
/// `etm-01-collective-task-system` → `ETM-01`
/// `fw-feat-05-asset-pack`         → `FW-FEAT-05`
/// `l01-complete-episode`          → `L01`  (letter prefix fused with leading number)
/// `01-traits-core`                → `{idPrefix}-01` (leading bare number, use template prefix)
/// `cancel-upload-processing`      → `{idPrefix}-A3F1` (stable hash, unique per file)
fn derive_id_from_filename(file_path: &str, id_prefix: &str) -> String {
    let stem = std::path::Path::new(file_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let parts: Vec<&str> = stem.split('-').collect();

    // Find the first segment that is all ASCII digits.
    if let Some(num_idx) = parts.iter().position(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit())) {
        if num_idx > 0 {
            let prefix = parts[..num_idx].join("-").to_uppercase();
            let num = parts[num_idx];
            return format!("{}-{}", prefix, num);
        }
        // Leading bare number (e.g. "01-traits-core"): prepend the template id prefix.
        return format!("{}-{}", id_prefix, parts[0]);
    }

    // Check for a fused letter+digit token like "l01" or "rw02" at the start.
    if let Some(first) = parts.first() {
        use std::sync::LazyLock;
        use regex::Regex;
        static FUSED: LazyLock<Regex> =
            LazyLock::new(|| Regex::new(r"^([a-z]+)(\d+)$").unwrap());
        if let Some(caps) = FUSED.captures(first) {
            let letters = caps.get(1).unwrap().as_str().to_uppercase();
            let digits = caps.get(2).unwrap().as_str();
            return format!("{}{}", letters, digits);
        }
    }

    // No numeric part — stable 4-char hex hash of the stem so each file gets a unique ID.
    let mut hash: u32 = 5381;
    for b in stem.bytes() {
        hash = hash.wrapping_mul(33).wrapping_add(b as u32);
    }
    format!("{}-{:04X}", id_prefix, hash & 0xFFFF)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::extract_deps_from_body;

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

    #[test]
    fn overwrite_empty_sequence() {
        // When depends-on is already [] but body has IDs, derive_default should return them.
        let body = "**Depende de:** ETM-01";
        let result = derive_default(
            "depends-on",
            &serde_json::json!({}),
            std::path::Path::new("."),
            std::path::Path::new("./file.md"),
            body,
        );
        match result {
            Some(serde_yaml::Value::Sequence(seq)) => {
                assert_eq!(seq.len(), 1);
                assert_eq!(seq[0].as_str(), Some("ETM-01"));
            }
            other => panic!("expected Sequence, got {:?}", other),
        }
    }

    // ── extract_id_from_heading ────────────────────────────────────────────────

    #[test]
    fn heading_id_hyphen_format() {
        assert_eq!(
            extract_id_from_heading("RW-01 — engine-world: Foundation"),
            Some("RW-01".to_string())
        );
    }

    #[test]
    fn heading_id_fused_format() {
        assert_eq!(
            extract_id_from_heading("L01 — Completar Episode Struct"),
            Some("L01".to_string())
        );
    }

    #[test]
    fn heading_id_plain_words_no_match() {
        // "ROADMAP ITEM 01" has no ID at the start — should return None.
        assert_eq!(
            extract_id_from_heading("ROADMAP ITEM 01 — Traits as core scoring factor"),
            None
        );
    }

    #[test]
    fn heading_id_multi_part() {
        assert_eq!(
            extract_id_from_heading("FW-FEAT-05 — Asset pack system"),
            Some("FW-FEAT-05".to_string())
        );
    }

    // ── extract_status_from_body ───────────────────────────────────────────────

    #[test]
    fn status_blockquote_complete() {
        let body = "> **Status:** ✅ Complete\n> **Depends on:** —";
        assert_eq!(
            extract_status_from_body(body),
            Some("✅ Complete".to_string())
        );
    }

    #[test]
    fn status_backtick_shipped_with_annotation() {
        let body = "**Status:** `✅ shipped` (commits `a087694`..`aee1fb2`, 2026-04-24)";
        assert_eq!(
            extract_status_from_body(body),
            Some("✅ shipped".to_string())
        );
    }

    #[test]
    fn status_blockquote_planned() {
        let body = "> **Status:** 📋 Planned";
        assert_eq!(
            extract_status_from_body(body),
            Some("📋 Planned".to_string())
        );
    }

    #[test]
    fn status_none_when_absent() {
        let body = "Some body text with no status field.";
        assert_eq!(extract_status_from_body(body), None);
    }

    // ── derive_id_from_filename ────────────────────────────────────────────────

    #[test]
    fn filename_id_leading_number() {
        // "01-traits-core.md" with prefix "ENG" → "ENG-01"
        assert_eq!(derive_id_from_filename("roadmap/engine/01-traits-core.md", "ENG"), "ENG-01");
    }

    #[test]
    fn filename_id_fused_letter_digits() {
        // "L01-complete-episode-struct.md" → "L01"
        assert_eq!(derive_id_from_filename("roadmap/lore/L01-complete-episode-struct.md", "LOR"), "L01");
    }

    #[test]
    fn filename_id_standard_prefix_number() {
        // "RW-01-foundation.md" → "RW-01"
        assert_eq!(derive_id_from_filename("roadmap/engine-world/RW-01-foundation.md", "ENG"), "RW-01");
    }

    #[test]
    fn filename_id_no_number_uses_hash() {
        // "cancel-upload-processing.md" → "ENG-XXXX" (hash, just check prefix)
        let id = derive_id_from_filename("docs/cancel-upload-processing.md", "ENG");
        assert!(id.starts_with("ENG-"), "expected ENG- prefix, got {id}");
        assert_eq!(id.len(), 8, "expected 8-char hash ID, got {id}");
    }
}
