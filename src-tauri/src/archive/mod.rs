#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::db::items::Item;
use crate::scanner::RepoConfig;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ArchiveCandidate {
    pub file_path: String,
    pub target_path: String,
    pub external_id: String,
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ArchiveDryRun {
    pub candidates: Vec<ArchiveCandidate>,
    pub ref_updates: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ArchiveReport {
    pub moved: u32,
    pub refs_updated: u32,
    pub files: Vec<String>,
}

static SKIP_DIRS: &[&str] = &["_legacy", "_archive", "node_modules", "target", "pkg", ".git"];

fn terminal_states(config: &RepoConfig, template_name: &str) -> Vec<String> {
    if let Some(template) = config.templates.get(template_name) {
        if let Some(defaults) = template.defaults.get("terminalStates") {
            if let Some(arr) = defaults.as_array() {
                let states: Vec<String> = arr
                    .iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();
                if !states.is_empty() {
                    return states;
                }
            }
        }
    }
    vec!["done".to_string(), "canceled".to_string(), "duplicate".to_string()]
}

pub fn find_candidates(
    repo_path: &Path,
    config: &RepoConfig,
    items: &[Item],
) -> ArchiveDryRun {
    let mut candidates = Vec::new();
    let mut total_refs = 0u32;

    for item in items {
        let states = terminal_states(config, &item.item_type);
        if !states.contains(&item.status) {
            continue;
        }

        if item.file_path.contains("_archive/") {
            continue;
        }

        let template = match config.templates.get(&item.item_type) {
            Some(t) => t,
            None => continue,
        };

        let file_name = Path::new(&item.file_path)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_default();

        let parent = Path::new(&item.file_path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| template.dir.clone());

        let target_path = format!("{}/_archive/{}", parent, file_name);

        let refs = count_references(repo_path, &item.file_path);
        total_refs += refs;

        candidates.push(ArchiveCandidate {
            file_path: item.file_path.clone(),
            target_path,
            external_id: item.external_id.clone(),
            title: item.title.clone(),
        });
    }

    ArchiveDryRun {
        candidates,
        ref_updates: total_refs,
    }
}

pub fn execute_archive(
    repo_path: &Path,
    candidates: &[ArchiveCandidate],
) -> ArchiveReport {
    let mut report = ArchiveReport {
        moved: 0,
        refs_updated: 0,
        files: Vec::new(),
    };

    let mut path_rewrites: Vec<(String, String)> = Vec::new();

    for c in candidates {
        let src = repo_path.join(&c.file_path);
        let dst = repo_path.join(&c.target_path);

        if let Some(parent) = dst.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        if std::fs::rename(&src, &dst).is_ok() {
            report.moved += 1;
            report.files.push(c.file_path.clone());
            report.files.push(c.target_path.clone());
            path_rewrites.push((c.file_path.clone(), c.target_path.clone()));
        }
    }

    for (old_path, new_path) in &path_rewrites {
        let updated = rewrite_references(repo_path, old_path, new_path);
        report.refs_updated += updated;
    }

    report
}

fn count_references(repo_path: &Path, file_path: &str) -> u32 {
    let mut count = 0;
    for entry in walk_md_files(repo_path) {
        let content = match std::fs::read_to_string(&entry) {
            Ok(c) => c,
            Err(_) => continue,
        };
        count += content.matches(file_path).count() as u32;
    }
    count
}

fn rewrite_references(repo_path: &Path, old_path: &str, new_path: &str) -> u32 {
    let mut updated = 0;
    for entry in walk_md_files(repo_path) {
        let content = match std::fs::read_to_string(&entry) {
            Ok(c) => c,
            Err(_) => continue,
        };

        if !content.contains(old_path) {
            continue;
        }

        let new_content = content.replace(old_path, new_path);
        if new_content != content {
            let _ = std::fs::write(&entry, &new_content);
            updated += 1;
        }
    }
    updated
}

fn walk_md_files(repo_path: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for entry in WalkDir::new(repo_path)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !SKIP_DIRS.iter().any(|d| name == *d)
        })
        .flatten()
    {
        let path = entry.path();
        if path.is_file() && path.extension().map(|e| e == "md").unwrap_or(false) {
            files.push(path.to_path_buf());
        }
    }
    files
}
