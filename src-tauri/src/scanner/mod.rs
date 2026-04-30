use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::path::Path;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::db::{items, repos};
use crate::error::{AppError, AppResult};
use crate::parser::{self, status::normalize_status};

// ── folder discovery ────────────────────────────────────────────────────────

static SKIP_DIRS: &[&str] = &[
    "node_modules",
    "target",
    ".git",
    "dist",
    "build",
    ".next",
    "coverage",
    "backups",
    "__pycache__",
    ".cache",
    "vendor",
    "out",
    ".turbo",
    ".cargo",
    "tmp",
    ".venv",
];

static SKIP_MD_NAMES: &[&str] = &[
    "README.md",
    "INDEX.md",
    "ROADMAP.md",
    "CHANGELOG.md",
    "CLAUDE.md",
    "CONTRIBUTING.md",
    "LICENSE.md",
    "TEMPLATE.md",
    "PROCESS.md",
    "MIGRATION.md",
    "MEMORY.md",
];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscoveredFolder {
    pub path: String,
    pub md_count: u32,
    pub sample_files: Vec<String>,
}

pub fn discover_md_folders_in(repo_path: &Path) -> Vec<DiscoveredFolder> {
    let mut folder_map: HashMap<String, DiscoveredFolder> = HashMap::new();

    for entry in WalkDir::new(repo_path).max_depth(5).into_iter().flatten() {
        let p = entry.path();
        if !p.is_file() {
            continue;
        }

        let file_name = p.file_name().unwrap_or_default().to_string_lossy();
        if !file_name.ends_with(".md") {
            continue;
        }
        if SKIP_MD_NAMES.iter().any(|s| file_name.as_ref() == *s) {
            continue;
        }

        let rel = match p.strip_prefix(repo_path) {
            Ok(r) => r,
            Err(_) => continue,
        };

        let should_skip = rel.components().any(|c| {
            let s = c.as_os_str().to_string_lossy();
            SKIP_DIRS.iter().any(|d| s.as_ref() == *d) || s.starts_with('.')
        });
        if should_skip {
            continue;
        }

        let parent = rel.parent().unwrap_or(Path::new(""));
        let parent_str = parent.to_string_lossy().to_string();
        if parent_str.is_empty() {
            continue; // root-level files ignored
        }

        let folder = folder_map.entry(parent_str.clone()).or_insert(DiscoveredFolder {
            path: parent_str,
            md_count: 0,
            sample_files: Vec::new(),
        });
        folder.md_count += 1;
        if folder.sample_files.len() < 3 {
            folder.sample_files.push(file_name.to_string());
        }
    }

    let mut result: Vec<DiscoveredFolder> = folder_map.into_values().collect();
    result.sort_by(|a, b| b.md_count.cmp(&a.md_count).then(a.path.cmp(&b.path)));
    result
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ScanReport {
    pub added: u32,
    pub updated: u32,
    pub removed: u32,
    pub errors: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TemplateConfig {
    pub dir: String,
    #[serde(rename = "filePrefix")]
    pub file_prefix: String,
    #[serde(rename = "idPrefix")]
    pub id_prefix: String,
    #[serde(rename = "idPadding", default = "default_padding")]
    pub id_padding: u32,
    #[serde(rename = "frontmatterFields", default)]
    pub frontmatter_fields: Vec<String>,
    #[serde(rename = "requiredFields", default)]
    pub required_fields: Vec<String>,
    #[serde(default)]
    pub defaults: serde_json::Value,
    #[serde(rename = "bodyTemplate", default)]
    pub body_template: String,
}

fn default_padding() -> u32 {
    2
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct RepoConfig {
    pub templates: std::collections::HashMap<String, TemplateConfig>,
    #[serde(default)]
    pub labels: LabelsConfig,
    #[serde(rename = "autoCommit", default)]
    pub auto_commit: AutoCommitConfig,
    #[serde(rename = "branchPolicy", default)]
    pub branch_policy: BranchPolicyConfig,
    #[serde(default)]
    pub roadmap: RoadmapConfig,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
pub struct RoadmapConfig {
    /// Headings (e.g. "## Description") whose content is preserved across regenerations.
    #[serde(rename = "preservedSections", default)]
    pub preserved_sections: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
pub struct LabelsConfig {
    #[serde(default)]
    pub whitelist: Vec<String>,
    #[serde(rename = "allowFreeForm", default = "default_true")]
    pub allow_free_form: bool,
    #[serde(default)]
    pub colors: std::collections::HashMap<String, String>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AutoCommitConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub branch: Option<String>,
    #[serde(rename = "messageFormat", default = "default_message_format")]
    pub message_format: String,
    #[serde(rename = "includeNoteInBody", default = "default_true")]
    pub include_note_in_body: bool,
    #[serde(rename = "addReferenceLine", default = "default_true")]
    pub add_reference_line: bool,
    #[serde(rename = "skipIfDirty", default)]
    pub skip_if_dirty: bool,
}

impl Default for AutoCommitConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            branch: None,
            message_format: default_message_format(),
            include_note_in_body: true,
            add_reference_line: true,
            skip_if_dirty: false,
        }
    }
}

fn default_message_format() -> String {
    "chore(roadmap): {ID} → {STATUS_VERB}".into()
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
pub struct BranchPolicyConfig {
    #[serde(rename = "allowedBranches")]
    pub allowed_branches: Option<Vec<String>>,
    #[serde(rename = "warnIfDetached", default = "default_true")]
    pub warn_if_detached: bool,
}

pub fn default_config() -> RepoConfig {
    let mut templates = std::collections::HashMap::new();

    templates.insert(
        "improvement".to_string(),
        TemplateConfig {
            dir: "docs/improvements".to_string(),
            file_prefix: "imp".to_string(),
            id_prefix: "IMP".to_string(),
            id_padding: 2,
            frontmatter_fields: vec![
                "id", "title", "type", "priority", "status", "labels", "created-date",
                "started-date", "completed-date", "depends-on",
            ]
            .into_iter()
            .map(String::from)
            .collect(),
            required_fields: vec!["id", "title", "type", "status"]
                .into_iter()
                .map(String::from)
                .collect(),
            defaults: serde_json::json!({
                "priority": "Média",
                "status": "⬜ pendente",
                "labels": ["architecture"]
            }),
            body_template: "# {ID} — {TITLE}\n\n**Contexto:** TODO\n\n**Ação:** TODO\n"
                .to_string(),
        },
    );

    templates.insert(
        "bug".to_string(),
        TemplateConfig {
            dir: "docs/bugs".to_string(),
            file_prefix: "bug".to_string(),
            id_prefix: "BUG".to_string(),
            id_padding: 2,
            frontmatter_fields: vec![
                "id", "title", "type", "priority", "status", "labels", "created-date",
                "started-date", "completed-date", "depends-on",
            ]
            .into_iter()
            .map(String::from)
            .collect(),
            required_fields: vec!["id", "title", "type", "status"]
                .into_iter()
                .map(String::from)
                .collect(),
            defaults: serde_json::json!({
                "priority": "Alta",
                "status": "⬜ pendente",
                "labels": ["bug", "correctness"]
            }),
            body_template:
                "# {ID} — {TITLE}\n\n## Sintoma\n\nTODO\n\n## Reprodução\n\n1. TODO\n\n## Causa raiz\n\nTODO\n"
                    .to_string(),
        },
    );

    templates.insert(
        "refactoring".to_string(),
        TemplateConfig {
            dir: "docs/refactoring".to_string(),
            file_prefix: "ref".to_string(),
            id_prefix: "REF".to_string(),
            id_padding: 2,
            frontmatter_fields: vec![
                "id", "title", "type", "priority", "status", "labels", "created-date",
                "completed-date", "depends-on",
            ]
            .into_iter()
            .map(String::from)
            .collect(),
            required_fields: vec!["id", "title", "type", "status"]
                .into_iter()
                .map(String::from)
                .collect(),
            defaults: serde_json::json!({
                "priority": "Média",
                "status": "⬜ pendente",
                "labels": ["refactoring"]
            }),
            body_template: "# {ID} — {TITLE}\n\n**Contexto:** TODO\n\n**Plano:** TODO\n"
                .to_string(),
        },
    );

    templates.insert(
        "feature".to_string(),
        TemplateConfig {
            dir: "docs/features".to_string(),
            file_prefix: "feat".to_string(),
            id_prefix: "FEAT".to_string(),
            id_padding: 2,
            frontmatter_fields: vec![
                "id", "title", "type", "status", "labels", "created-date", "completed-date",
                "depends-on",
            ]
            .into_iter()
            .map(String::from)
            .collect(),
            required_fields: vec!["id", "title", "type", "status"]
                .into_iter()
                .map(String::from)
                .collect(),
            defaults: serde_json::json!({
                "status": "⬜ pendente",
                "labels": []
            }),
            body_template: "# {ID} — {TITLE}\n\n## Objetivo\n\nTODO\n\n## API\n\nTODO\n"
                .to_string(),
        },
    );

    let mut colors = std::collections::HashMap::new();
    colors.insert("architecture".into(), "#8B5CF6".into());
    colors.insert("performance".into(), "#F59E0B".into());
    colors.insert("correctness".into(), "#EF4444".into());
    colors.insert("feature".into(), "#3B82F6".into());
    colors.insert("ui".into(), "#EC4899".into());
    colors.insert("testing".into(), "#10B981".into());
    colors.insert("refactoring".into(), "#6B7280".into());
    colors.insert("design".into(), "#06B6D4".into());
    colors.insert("documentation".into(), "#A78BFA".into());
    colors.insert("bug".into(), "#DC2626".into());
    colors.insert("tech-debt".into(), "#9CA3AF".into());

    RepoConfig {
        templates,
        labels: LabelsConfig {
            whitelist: vec![
                "architecture",
                "performance",
                "correctness",
                "feature",
                "ui",
                "testing",
                "refactoring",
                "design",
                "documentation",
                "bug",
                "tech-debt",
            ]
            .into_iter()
            .map(String::from)
            .collect(),
            allow_free_form: true,
            colors,
        },
        auto_commit: AutoCommitConfig::default(),
        branch_policy: BranchPolicyConfig::default(),
        roadmap: RoadmapConfig::default(),
    }
}

pub fn derive_scope(file_path: &str, template_dir: &str) -> String {
    if let Some(idx) = file_path.find(&format!("/{}", template_dir)) {
        let scope = &file_path[..idx];
        if scope.is_empty() {
            return String::new();
        }
        return scope.to_string();
    }
    if file_path.starts_with(template_dir) {
        return String::new();
    }
    String::new()
}

pub fn discover_template_dirs(repo_path: &Path, template_dir: &str) -> Vec<std::path::PathBuf> {
    let mut dirs = Vec::new();

    let direct = repo_path.join(template_dir);
    if direct.exists() {
        dirs.push(direct);
    }

    for entry in WalkDir::new(repo_path)
        .max_depth(5)
        .into_iter()
        .flatten()
    {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if path == repo_path.join(template_dir) {
            continue;
        }
        if path.ends_with(template_dir) {
            let rel = path.strip_prefix(repo_path).unwrap_or(path);
            let rel_str = rel.to_string_lossy();
            if rel_str.contains("node_modules") || rel_str.contains("target") || rel_str.starts_with('.') {
                continue;
            }
            dirs.push(path.to_path_buf());
        }
    }

    dirs
}

pub struct TemplateFile {
    pub rel_path: String,
    pub abs_path: std::path::PathBuf,
    pub template_name: String,
}

static SKIP_FILES: &[&str] = &["INDEX.md", "README.md", "ROADMAP.md"];

pub fn walk_template_files(
    repo_path: &Path,
    config: &RepoConfig,
) -> Vec<TemplateFile> {
    let mut files = Vec::new();
    for (type_name, template) in &config.templates {
        let scan_dirs = discover_template_dirs(repo_path, &template.dir);
        for dir in &scan_dirs {
            for entry in WalkDir::new(dir).max_depth(1).into_iter().flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                let file_name = path.file_name().unwrap_or_default().to_string_lossy();
                if !file_name.ends_with(".md") {
                    continue;
                }
                if SKIP_FILES.iter().any(|s| file_name.as_ref() == *s) {
                    continue;
                }
                let rel_path = path
                    .strip_prefix(repo_path)
                    .unwrap_or(path)
                    .to_string_lossy()
                    .to_string();
                files.push(TemplateFile {
                    rel_path,
                    abs_path: path.to_path_buf(),
                    template_name: type_name.clone(),
                });
            }
        }
    }
    files
}

pub async fn scan_repo(pool: &SqlitePool, repo_id: &str) -> AppResult<ScanReport> {
    let repo = repos::get(pool, repo_id).await?;
    let config: RepoConfig = serde_json::from_str(&repo.config)
        .map_err(|e| AppError::Validation(format!("Invalid repo config: {}", e)))?;

    let repo_path = Path::new(&repo.path);
    let mut report = ScanReport::default();
    let mut found_paths: Vec<String> = Vec::new();

    let template_files = walk_template_files(repo_path, &config);

    for tf in &template_files {
        let template = match config.templates.get(&tf.template_name) {
            Some(t) => t,
            None => continue,
        };

        found_paths.push(tf.rel_path.clone());

        let content = match std::fs::read_to_string(&tf.abs_path) {
            Ok(c) => c,
            Err(e) => {
                report.errors.push(format!("{}: {}", tf.rel_path, e));
                continue;
            }
        };

        let file_hash = parser::hash(&content);
        let parsed = match parser::parse(&content) {
            Ok(p) => p,
            Err(e) => {
                report.errors.push(format!("{}: {}", tf.rel_path, e));
                continue;
            }
        };

        let external_id = parser::extract_string(&parsed.yaml, "id").unwrap_or_default();
        let title = parser::extract_string(&parsed.yaml, "title").unwrap_or_default();
        let status_raw =
            parser::extract_string(&parsed.yaml, "status").unwrap_or_else(|| "backlog".into());
        let status = normalize_status(&status_raw);
        let priority = parser::extract_string(&parsed.yaml, "priority")
            .and_then(|p| parser::normalize_priority(&p));
        let labels = parser::extract_string_array(&parsed.yaml, "labels");
        let depends_on = {
            let from_fm = parser::extract_string_array(&parsed.yaml, "depends-on");
            if from_fm.is_empty() {
                parser::extract_deps_from_body(&parsed.body)
            } else {
                from_fm
            }
        };
        let relates_to = parser::extract_string_array(&parsed.yaml, "relates-to");
        let created_date = parser::extract_string(&parsed.yaml, "created-date");
        let started_date = parser::extract_string(&parsed.yaml, "started-date");
        let completed_date = parser::extract_string(&parsed.yaml, "completed-date");
        let duplicate_of = parser::extract_string(&parsed.yaml, "duplicate-of");

        if external_id.is_empty() || title.is_empty() {
            report
                .errors
                .push(format!("{}: missing id or title in frontmatter", tf.rel_path));
            continue;
        }

        let existing = items::get_by_path(pool, repo_id, &tf.rel_path).await?;

        let depends_on_json = serde_json::to_string(&depends_on).unwrap_or_default();

        match existing {
            Some(existing_item) => {
                let hash_changed = existing_item.file_hash != file_hash;
                // Also update when depends_on was empty in DB but body extraction now yields IDs.
                let deps_enriched = existing_item.depends_on == "[]" && depends_on_json != "[]";
                if hash_changed || deps_enriched {
                    let mut updated = existing_item.clone();
                    updated.title = title;
                    updated.body = parsed.body;
                    updated.frontmatter = parsed.raw_frontmatter;
                    updated.file_hash = file_hash;
                    updated.status = status.as_str().to_string();
                    updated.priority = priority;
                    updated.labels = serde_json::to_string(&labels).unwrap_or_default();
                    updated.depends_on = depends_on_json;
                    updated.relates_to =
                        serde_json::to_string(&relates_to).unwrap_or_default();
                    updated.duplicate_of = duplicate_of;
                    updated.created_date = created_date;
                    updated.started_date = started_date;
                    updated.completed_date = completed_date;
                    items::update(pool, &updated).await?;
                    report.updated += 1;
                }
            }
            None => {
                let type_name = &tf.template_name;
                let scope = derive_scope(&tf.rel_path, &template.dir);
                let item = items::Item {
                    id: Uuid::new_v4().to_string(),
                    repo_id: repo_id.to_string(),
                    external_id,
                    scope,
                    item_type: type_name.clone(),
                    title,
                    file_path: tf.rel_path.clone(),
                    file_hash,
                    body: parsed.body,
                    frontmatter: parsed.raw_frontmatter,
                    status: status.as_str().to_string(),
                    priority,
                    labels: serde_json::to_string(&labels).unwrap_or_default(),
                    depends_on: depends_on_json,
                    relates_to: serde_json::to_string(&relates_to).unwrap_or_default(),
                    duplicate_of,
                    created_date,
                    started_date,
                    completed_date,
                    updated_at: chrono::Utc::now()
                        .format("%Y-%m-%dT%H:%M:%S")
                        .to_string(),
                };
                match items::insert(pool, &item).await {
                    Ok(_) => { report.added += 1; }
                    Err(AppError::Database(ref e)) if e.to_string().contains("UNIQUE constraint") => {
                        report.errors.push(format!(
                            "{}: duplicate external_id '{}' — assign a unique id in the file",
                            tf.rel_path, &item.external_id
                        ));
                    }
                    Err(e) => { return Err(e); }
                }
            }
        }
    }

    let all_items = items::list_by_repo(pool, repo_id, None).await?;
    for item in all_items {
        if !found_paths.contains(&item.file_path) {
            items::delete(pool, &item.id).await?;
            report.removed += 1;
        }
    }

    repos::set_last_scan(pool, repo_id).await?;

    Ok(report)
}
