use serde::{Deserialize, Serialize};
use std::path::Path;

use regex::Regex;
use std::sync::LazyLock;

static UNCHECKED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"- \[ \]").unwrap());
static CHECKED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"- \[x\]").unwrap());
static HEADING: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^#{1,6}\s+(.+)").unwrap());

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CheckboxCount {
    pub pending: u32,
    pub completed: u32,
    pub unchecked_items: Vec<CheckboxItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CheckboxItem {
    pub heading: String,
    pub text: String,
}

pub fn count_checkboxes(content: &str) -> CheckboxCount {
    let pending = UNCHECKED.find_iter(content).count() as u32;
    let completed = CHECKED.find_iter(content).count() as u32;

    let mut unchecked_items = Vec::new();
    let mut current_heading = String::new();

    for line in content.lines() {
        if let Some(caps) = HEADING.captures(line) {
            current_heading = caps[1].trim().to_string();
        }
        if line.trim_start().starts_with("- [ ] ") {
            let text = line.trim_start().strip_prefix("- [ ] ").unwrap_or("").to_string();
            unchecked_items.push(CheckboxItem {
                heading: current_heading.clone(),
                text,
            });
        }
    }

    CheckboxCount {
        pending,
        completed,
        unchecked_items,
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubRoadmapStatus {
    pub path: String,
    pub name: String,
    pub planned: u32,
    pub in_progress: u32,
    pub done: u32,
}

pub fn classify_sub_roadmaps(repo_path: &Path, globs: &[String]) -> Vec<SubRoadmapStatus> {
    let mut results = Vec::new();

    for pattern in globs {
        let full_pattern = repo_path.join(pattern).to_string_lossy().to_string();
        let matches = glob::glob(&full_pattern).into_iter().flatten().flatten();

        for entry in matches {
            let content = match std::fs::read_to_string(&entry) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let rel_path = entry
                .strip_prefix(repo_path)
                .unwrap_or(&entry)
                .to_string_lossy()
                .to_string();

            let name = entry
                .parent()
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| rel_path.clone());

            let planned = content.matches('\u{1F4CB}').count() as u32;
            let in_progress = content.matches('\u{1F504}').count() as u32;
            let done_count = content.matches('\u{2705}').count() as u32;

            results.push(SubRoadmapStatus {
                path: rel_path,
                name,
                planned,
                in_progress,
                done: done_count,
            });
        }
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn count_basic_checkboxes() {
        let content = "# Tasks\n\n- [x] Done task\n- [ ] Pending one\n- [ ] Pending two\n";
        let result = count_checkboxes(content);
        assert_eq!(result.pending, 2);
        assert_eq!(result.completed, 1);
        assert_eq!(result.unchecked_items.len(), 2);
        assert_eq!(result.unchecked_items[0].heading, "Tasks");
    }

    #[test]
    fn no_checkboxes() {
        let content = "# Nothing\n\nJust text.\n";
        let result = count_checkboxes(content);
        assert_eq!(result.pending, 0);
        assert_eq!(result.completed, 0);
    }

    #[test]
    fn sub_roadmap_emoji_classification() {
        let tmp = TempDir::new().unwrap();
        let repo = tmp.path();
        let app_dir = repo.join("apps/web/docs");
        std::fs::create_dir_all(&app_dir).unwrap();
        std::fs::write(
            app_dir.join("ROADMAP.md"),
            "# Web\n\n📋 planned\n📋 planned\n🔄 in progress\n✅ done\n✅ done\n✅ done\n",
        )
        .unwrap();

        let results = classify_sub_roadmaps(repo, &["apps/*/docs/ROADMAP.md".to_string()]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].planned, 2);
        assert_eq!(results[0].in_progress, 1);
        assert_eq!(results[0].done, 3);
    }
}
