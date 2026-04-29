use std::collections::HashMap;
use std::fs;
use tempfile::TempDir;

use crate::archive::{execute_archive, find_candidates, ArchiveCandidate};
use crate::db::items::Item;
use crate::scanner::{RepoConfig, TemplateConfig};

fn make_item(file_path: &str, status: &str, ext_id: &str, item_type: &str) -> Item {
    Item {
        id: uuid::Uuid::new_v4().to_string(),
        repo_id: "repo-1".to_string(),
        external_id: ext_id.to_string(),
        scope: String::new(),
        item_type: item_type.to_string(),
        title: format!("Title for {}", ext_id),
        file_path: file_path.to_string(),
        file_hash: String::new(),
        body: String::new(),
        frontmatter: String::new(),
        status: status.to_string(),
        priority: None,
        labels: "[]".to_string(),
        depends_on: "[]".to_string(),
        duplicate_of: None,
        created_date: None,
        started_date: None,
        completed_date: None,
        updated_at: String::new(),
    }
}

fn make_config() -> RepoConfig {
    let mut templates = HashMap::new();
    templates.insert(
        "bug".to_string(),
        TemplateConfig {
            dir: "docs/bugs".to_string(),
            file_prefix: "bug".to_string(),
            id_prefix: "BUG".to_string(),
            id_padding: 2,
            frontmatter_fields: vec!["id", "title", "type", "status"]
                .into_iter()
                .map(String::from)
                .collect(),
            required_fields: vec!["id", "title", "type", "status"]
                .into_iter()
                .map(String::from)
                .collect(),
            defaults: serde_json::json!({}),
            body_template: String::new(),
        },
    );
    RepoConfig {
        templates,
        labels: Default::default(),
        auto_commit: Default::default(),
        branch_policy: Default::default(),
    }
}

#[test]
fn find_candidates_only_terminal_status() {
    let tmp = TempDir::new().unwrap();
    let repo = tmp.path();
    fs::create_dir_all(repo.join("docs/bugs")).unwrap();
    fs::write(repo.join("docs/bugs/bug-01.md"), "---\nid: BUG-01\ntitle: A\ntype: bug\nstatus: done\n---\n\nbody\n").unwrap();
    fs::write(repo.join("docs/bugs/bug-02.md"), "---\nid: BUG-02\ntitle: B\ntype: bug\nstatus: todo\n---\n\nbody\n").unwrap();

    let config = make_config();
    let items = vec![
        make_item("docs/bugs/bug-01.md", "done", "BUG-01", "bug"),
        make_item("docs/bugs/bug-02.md", "todo", "BUG-02", "bug"),
    ];

    let dry_run = find_candidates(repo, &config, &items);
    assert_eq!(dry_run.candidates.len(), 1);
    assert_eq!(dry_run.candidates[0].external_id, "BUG-01");
}

#[test]
fn already_archived_items_skipped() {
    let tmp = TempDir::new().unwrap();
    let config = make_config();
    let items = vec![make_item(
        "docs/bugs/_archive/bug-01.md",
        "done",
        "BUG-01",
        "bug",
    )];

    let dry_run = find_candidates(tmp.path(), &config, &items);
    assert!(dry_run.candidates.is_empty());
}

#[test]
fn execute_moves_file_and_rewrites_refs() {
    let tmp = TempDir::new().unwrap();
    let repo = tmp.path();
    fs::create_dir_all(repo.join("docs/bugs")).unwrap();
    fs::write(
        repo.join("docs/bugs/bug-01.md"),
        "---\nid: BUG-01\n---\n\nbody\n",
    )
    .unwrap();
    fs::write(
        repo.join("ROADMAP.md"),
        "See docs/bugs/bug-01.md for details.",
    )
    .unwrap();

    let candidates = vec![ArchiveCandidate {
        file_path: "docs/bugs/bug-01.md".to_string(),
        target_path: "docs/bugs/_archive/bug-01.md".to_string(),
        external_id: "BUG-01".to_string(),
        title: "Bug 01".to_string(),
    }];

    let report = execute_archive(repo, &candidates);
    assert_eq!(report.moved, 1);
    assert!(repo.join("docs/bugs/_archive/bug-01.md").exists());
    assert!(!repo.join("docs/bugs/bug-01.md").exists());

    let roadmap = fs::read_to_string(repo.join("ROADMAP.md")).unwrap();
    assert!(roadmap.contains("docs/bugs/_archive/bug-01.md"));
}
