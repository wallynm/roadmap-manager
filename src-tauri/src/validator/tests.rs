use std::collections::HashMap;
use std::fs;
use tempfile::TempDir;

use crate::scanner::{RepoConfig, TemplateConfig};
use crate::validator::validate;

fn default_labels() -> crate::scanner::LabelsConfig {
    crate::scanner::LabelsConfig::default()
}

fn make_config(templates: HashMap<String, TemplateConfig>) -> RepoConfig {
    RepoConfig {
        templates,
        labels: default_labels(),
        auto_commit: Default::default(),
        branch_policy: Default::default(),
        roadmap: Default::default(),
    }
}

fn make_template(dir: &str, required: Vec<&str>, fm_fields: Vec<&str>) -> TemplateConfig {
    TemplateConfig {
        dir: dir.to_string(),
        file_prefix: "item".to_string(),
        id_prefix: "ITEM".to_string(),
        id_padding: 2,
        frontmatter_fields: fm_fields.into_iter().map(String::from).collect(),
        required_fields: required.into_iter().map(String::from).collect(),
        defaults: serde_json::json!({}),
        body_template: String::new(),
    }
}

fn write_md(dir: &std::path::Path, name: &str, frontmatter: &str, body: &str) {
    let path = dir.join(name);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, format!("---\n{}\n---\n\n{}\n", frontmatter, body)).unwrap();
}

#[test]
fn all_valid_files_report_zero_issues() {
    let tmp = TempDir::new().unwrap();
    let repo = tmp.path();
    let docs = repo.join("docs/items");
    fs::create_dir_all(&docs).unwrap();

    write_md(
        repo,
        "docs/items/item-01-foo.md",
        "id: ITEM-01\ntitle: Foo\ntype: task\nstatus: todo",
        "Body here",
    );
    write_md(
        repo,
        "docs/items/item-02-bar.md",
        "id: ITEM-02\ntitle: Bar\ntype: task\nstatus: done",
        "Body here",
    );

    let mut templates = HashMap::new();
    templates.insert(
        "task".to_string(),
        make_template(
            "docs/items",
            vec!["id", "title", "type", "status"],
            vec!["id", "title", "type", "status"],
        ),
    );
    let config = make_config(templates);

    let report = validate(repo, &config);
    assert_eq!(report.checked, 2);
    assert_eq!(report.passing, 2);
    assert_eq!(report.failing, 0);
    assert!(report.issues.is_empty());
}

#[test]
fn missing_required_field_detected() {
    let tmp = TempDir::new().unwrap();
    let repo = tmp.path();
    fs::create_dir_all(repo.join("docs/bugs")).unwrap();

    write_md(
        repo,
        "docs/bugs/bug-01-crash.md",
        "id: BUG-01\ntitle: Crash",
        "Body",
    );

    let mut templates = HashMap::new();
    templates.insert(
        "bug".to_string(),
        make_template(
            "docs/bugs",
            vec!["id", "title", "type", "status"],
            vec!["id", "title", "type", "status", "priority"],
        ),
    );
    let config = make_config(templates);

    let report = validate(repo, &config);
    assert_eq!(report.checked, 1);
    assert_eq!(report.failing, 1);
    assert_eq!(report.issues.len(), 1);
    assert_eq!(report.issues[0].file, "docs/bugs/bug-01-crash.md");
    assert!(report.issues[0].missing.contains(&"type".to_string()));
    assert!(report.issues[0].missing.contains(&"status".to_string()));
    assert!(!report.issues[0].missing.contains(&"id".to_string()));
    assert!(!report.issues[0].missing.contains(&"title".to_string()));
}

#[test]
fn empty_required_field_counts_as_missing() {
    let tmp = TempDir::new().unwrap();
    let repo = tmp.path();
    fs::create_dir_all(repo.join("docs/items")).unwrap();

    write_md(
        repo,
        "docs/items/item-01-empty.md",
        "id: ITEM-01\ntitle: \"\"\ntype: task\nstatus: todo",
        "Body",
    );

    let mut templates = HashMap::new();
    templates.insert(
        "task".to_string(),
        make_template(
            "docs/items",
            vec!["id", "title", "type", "status"],
            vec!["id", "title", "type", "status"],
        ),
    );
    let config = make_config(templates);

    let report = validate(repo, &config);
    assert_eq!(report.failing, 1);
    assert!(report.issues[0].missing.contains(&"title".to_string()));
}

#[test]
fn extra_fields_detected() {
    let tmp = TempDir::new().unwrap();
    let repo = tmp.path();
    fs::create_dir_all(repo.join("docs/items")).unwrap();

    write_md(
        repo,
        "docs/items/item-01-extra.md",
        "id: ITEM-01\ntitle: Foo\ntype: task\nstatus: todo\ncustom-field: hello",
        "Body",
    );

    let mut templates = HashMap::new();
    templates.insert(
        "task".to_string(),
        make_template(
            "docs/items",
            vec!["id", "title", "type", "status"],
            vec!["id", "title", "type", "status"],
        ),
    );
    let config = make_config(templates);

    let report = validate(repo, &config);
    assert_eq!(report.passing, 1);
    assert_eq!(report.failing, 0);
}

#[test]
fn skip_non_template_dir_files() {
    let tmp = TempDir::new().unwrap();
    let repo = tmp.path();
    fs::create_dir_all(repo.join("docs/items")).unwrap();
    fs::create_dir_all(repo.join("docs/random")).unwrap();

    write_md(
        repo,
        "docs/items/item-01-foo.md",
        "id: ITEM-01\ntitle: Foo\ntype: task\nstatus: todo",
        "Body",
    );

    write_md(
        repo,
        "docs/random/something.md",
        "title: Not validated",
        "Body",
    );

    let mut templates = HashMap::new();
    templates.insert(
        "task".to_string(),
        make_template(
            "docs/items",
            vec!["id", "title", "type", "status"],
            vec!["id", "title", "type", "status"],
        ),
    );
    let config = make_config(templates);

    let report = validate(repo, &config);
    assert_eq!(report.checked, 1);
    assert_eq!(report.passing, 1);
}

#[test]
fn unparseable_frontmatter_is_failing() {
    let tmp = TempDir::new().unwrap();
    let repo = tmp.path();
    fs::create_dir_all(repo.join("docs/items")).unwrap();

    let bad_content = "No frontmatter here, just plain text.";
    fs::write(repo.join("docs/items/item-01-bad.md"), bad_content).unwrap();

    let mut templates = HashMap::new();
    templates.insert(
        "task".to_string(),
        make_template(
            "docs/items",
            vec!["id", "title"],
            vec!["id", "title"],
        ),
    );
    let config = make_config(templates);

    let report = validate(repo, &config);
    assert_eq!(report.checked, 1);
    assert_eq!(report.failing, 1);
    assert_eq!(report.issues[0].missing, vec!["id", "title"]);
}

#[test]
fn empty_repo_reports_zero() {
    let tmp = TempDir::new().unwrap();
    let repo = tmp.path();

    let mut templates = HashMap::new();
    templates.insert(
        "task".to_string(),
        make_template(
            "docs/items",
            vec!["id", "title"],
            vec!["id", "title"],
        ),
    );
    let config = make_config(templates);

    let report = validate(repo, &config);
    assert_eq!(report.checked, 0);
    assert_eq!(report.passing, 0);
    assert_eq!(report.failing, 0);
    assert!(report.issues.is_empty());
}

#[test]
fn multiple_templates_validated_independently() {
    let tmp = TempDir::new().unwrap();
    let repo = tmp.path();
    fs::create_dir_all(repo.join("docs/bugs")).unwrap();
    fs::create_dir_all(repo.join("docs/features")).unwrap();

    write_md(
        repo,
        "docs/bugs/bug-01-crash.md",
        "id: BUG-01\ntitle: Crash\ntype: bug\nstatus: todo\nseverity: high",
        "Body",
    );

    write_md(
        repo,
        "docs/features/feat-01-login.md",
        "id: FEAT-01\ntitle: Login\ntype: feature",
        "Body",
    );

    let mut templates = HashMap::new();
    templates.insert(
        "bug".to_string(),
        make_template(
            "docs/bugs",
            vec!["id", "title", "type", "status", "severity"],
            vec!["id", "title", "type", "status", "severity"],
        ),
    );
    templates.insert(
        "feature".to_string(),
        make_template(
            "docs/features",
            vec!["id", "title", "type", "status"],
            vec!["id", "title", "type", "status"],
        ),
    );
    let config = make_config(templates);

    let report = validate(repo, &config);
    assert_eq!(report.checked, 2);
    assert_eq!(report.passing, 1);
    assert_eq!(report.failing, 1);

    let feature_issue = report
        .issues
        .iter()
        .find(|i| i.template == "feature")
        .unwrap();
    assert!(feature_issue.missing.contains(&"status".to_string()));
}

#[test]
fn idempotent_validation_same_result_twice() {
    let tmp = TempDir::new().unwrap();
    let repo = tmp.path();
    fs::create_dir_all(repo.join("docs/items")).unwrap();

    write_md(
        repo,
        "docs/items/item-01-foo.md",
        "id: ITEM-01\ntitle: Foo\ntype: task",
        "Body",
    );

    let mut templates = HashMap::new();
    templates.insert(
        "task".to_string(),
        make_template(
            "docs/items",
            vec!["id", "title", "type", "status"],
            vec!["id", "title", "type", "status"],
        ),
    );
    let config = make_config(templates);

    let r1 = validate(repo, &config);
    let r2 = validate(repo, &config);

    assert_eq!(r1.checked, r2.checked);
    assert_eq!(r1.passing, r2.passing);
    assert_eq!(r1.failing, r2.failing);
    assert_eq!(r1.issues.len(), r2.issues.len());
}
