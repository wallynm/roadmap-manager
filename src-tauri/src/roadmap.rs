use std::collections::BTreeMap;

use sqlx::SqlitePool;

use crate::db::{items, repos};
use crate::scanner::RepoConfig;

const GENERATED_MARKER: &str = "<!-- roadmap-manager:generated -->";

pub async fn regenerate(pool: &SqlitePool, repo_id: &str) -> Result<(), anyhow::Error> {
    let repo = repos::get(pool, repo_id).await?;
    let config: RepoConfig = serde_json::from_str(&repo.config)?;
    let all_items = items::list_by_repo(pool, repo_id, None).await?;
    let repo_path = std::path::Path::new(&repo.path);
    let roadmap_path = repo_path.join("ROADMAP.md");

    let now = chrono::Local::now().format("%Y-%m-%d").to_string();

    // --- Preserve narrative preamble (everything above the marker) ---
    let existing = if roadmap_path.exists() {
        std::fs::read_to_string(&roadmap_path).unwrap_or_default()
    } else {
        String::new()
    };

    let preamble = if let Some(idx) = existing.find(GENERATED_MARKER) {
        existing[..idx].trim_end().to_string()
    } else if !existing.is_empty() {
        existing.trim_end().to_string()
    } else {
        format!(
            "---\ntitle: Roadmap — {name}\ntype: roadmap\n---\n\n\
# Roadmap — {name}\n\n\
> Edite esta seção livremente — o conteúdo abaixo do marcador é auto-gerado e será sobrescrito.",
            name = repo.name
        )
    };

    // --- Extract preserved sections from the existing generated zone ---
    let generated_zone = if let Some(idx) = existing.find(GENERATED_MARKER) {
        &existing[idx + GENERATED_MARKER.len()..]
    } else {
        ""
    };

    let preserved: Vec<(String, String)> = config
        .roadmap
        .preserved_sections
        .iter()
        .map(|heading| {
            let content = extract_section(generated_zone, heading);
            (heading.clone(), content)
        })
        .collect();

    // --- Count summary ---
    let count = |s: &str| all_items.iter().filter(|i| i.status == s).count();
    let in_progress = count("in_progress");
    let todo        = count("todo");
    let backlog     = count("backlog");
    let done        = count("done");
    let canceled    = count("canceled");
    let duplicate   = count("duplicate");
    let total       = all_items.len();

    // --- Build generated block ---
    let mut generated = String::new();

    // Preserved sections first
    for (_heading, content) in &preserved {
        generated.push_str(content);
        generated.push_str("\n\n");
    }

    // Summary line
    generated.push_str(&format!(
        "---\n\n\
## Item Index\n\n\
| In Progress | Todo | Backlog | Done | Canceled | Total |\n\
|---|---|---|---|---|---|\n\
| {in_progress} | {todo} | {backlog} | {done} | {canceled} | {total} |\n\n\
_Gerado em {now} · {duplicate} duplicados omitidos · caminhos relativos à raiz_\n\n"
    ));

    // Per-status sections
    let status_groups = [
        ("in_progress", "In Progress", false),
        ("todo",        "Todo",        false),
        ("backlog",     "Backlog",     false),
        ("done",        "Done",        true),
        ("canceled",    "Canceled",    true),
        ("duplicate",   "Duplicate",   true),
    ];

    for (status_key, label, show_date) in &status_groups {
        let group: Vec<_> = all_items.iter().filter(|i| i.status == *status_key).collect();
        if group.is_empty() {
            continue;
        }

        generated.push_str(&format!("## {} ({})\n\n", label, group.len()));

        let mut by_scope: BTreeMap<String, Vec<_>> = BTreeMap::new();
        for item in &group {
            let key = if item.scope.is_empty() {
                "outros".to_string()
            } else {
                item.scope.clone()
            };
            by_scope.entry(key).or_default().push(item);
        }

        let multi_scope = by_scope.len() > 1;

        for (scope, scope_items) in &by_scope {
            if multi_scope {
                generated.push_str(&format!("### {} ({})\n\n", scope, scope_items.len()));
            }

            if *show_date {
                generated.push_str("| Tipo | ID | Título | Arquivo | Prioridade | Concluído |\n");
                generated.push_str("|---|---|---|---|---|---|\n");
            } else {
                generated.push_str("| Tipo | ID | Título | Arquivo | Prioridade | Labels | Depende de |\n");
                generated.push_str("|---|---|---|---|---|---|---|\n");
            }

            for item in scope_items {
                let rel_path = std::path::Path::new(&item.file_path)
                    .strip_prefix(repo_path)
                    .unwrap_or(std::path::Path::new(&item.file_path))
                    .to_string_lossy()
                    .to_string();

                let type_label = type_label(&item.item_type);
                let priority = item.priority.as_deref().unwrap_or("—");
                let safe_title = clean_title(&item.title, &item.external_id).replace('|', "\\|");

                if *show_date {
                    let date = item.completed_date.as_deref().unwrap_or("—");
                    generated.push_str(&format!(
                        "| {} | {} | {} | `{}` | {} | {} |\n",
                        type_label, item.external_id, safe_title, rel_path, priority, date
                    ));
                } else {
                    let labels: Vec<String> =
                        serde_json::from_str(&item.labels).unwrap_or_default();
                    let labels_str = if labels.is_empty() { "—".to_string() } else { labels.join(", ") };
                    let deps: Vec<String> =
                        serde_json::from_str(&item.depends_on).unwrap_or_default();
                    let deps_str = if deps.is_empty() { "—".to_string() } else { deps.join(", ") };

                    generated.push_str(&format!(
                        "| {} | {} | {} | `{}` | {} | {} | {} |\n",
                        type_label, item.external_id, safe_title, rel_path, priority, labels_str, deps_str
                    ));
                }
            }
            generated.push('\n');
        }
    }

    let md = format!("{}\n\n{}\n\n{}", preamble, GENERATED_MARKER, generated);
    std::fs::write(&roadmap_path, &md)?;

    let _ = regenerate_indexes(pool, repo_id).await;

    Ok(())
}

/// Extracts a section from the generated zone content, including its heading.
/// If the section doesn't exist, returns a placeholder.
fn extract_section(content: &str, heading: &str) -> String {
    let heading_level = heading.chars().take_while(|c| *c == '#').count();
    let mut in_section = false;
    let mut lines: Vec<&str> = Vec::new();

    for line in content.lines() {
        if line.trim_end() == heading {
            in_section = true;
            lines.push(line);
            continue;
        }
        if in_section {
            let line_level = line.chars().take_while(|c| *c == '#').count();
            if line.starts_with('#') && line_level <= heading_level {
                break;
            }
            lines.push(line);
        }
    }

    if lines.is_empty() {
        format!("{}\n\n> _Adicione conteúdo aqui._", heading)
    } else {
        lines.join("\n").trim_end().to_string()
    }
}

fn type_label(item_type: &str) -> &str {
    item_type
}

fn clean_title<'a>(title: &'a str, external_id: &str) -> &'a str {
    for sep in &[" — ", ": ", " - "] {
        let prefix = format!("{}{}", external_id, sep);
        if let Some(rest) = title.strip_prefix(prefix.as_str()) {
            return rest;
        }
    }
    title
}

pub async fn regenerate_indexes(pool: &SqlitePool, repo_id: &str) -> Result<u32, anyhow::Error> {
    let repo = repos::get(pool, repo_id).await?;
    let config: RepoConfig = serde_json::from_str(&repo.config)?;
    let all_items = items::list_by_repo(pool, repo_id, None).await?;
    let repo_path = std::path::Path::new(&repo.path);

    let mut updated = 0u32;

    for (type_name, template) in &config.templates {
        let generate = template
            .defaults
            .get("generateIndex")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        if !generate {
            continue;
        }

        let dirs = crate::scanner::discover_template_dirs(repo_path, &template.dir);
        for dir in &dirs {
            let rel_dir = dir
                .strip_prefix(repo_path)
                .unwrap_or(dir)
                .to_string_lossy()
                .to_string();

            let dir_items: Vec<_> = all_items
                .iter()
                .filter(|i| i.item_type == *type_name && i.file_path.starts_with(&rel_dir))
                .collect();

            if dir_items.is_empty() {
                continue;
            }

            let index_path = dir.join("INDEX.md");
            let now = chrono::Local::now().format("%Y-%m-%d").to_string();

            let mut md = format!(
                "# {} — Index\n\n> Auto-generated by roadmap-manager on {}.\n\n",
                type_name, now
            );

            let status_groups = [
                ("in_progress", "In Progress"),
                ("todo", "Todo"),
                ("backlog", "Backlog"),
            ];

            for (status_key, label) in &status_groups {
                let group: Vec<_> = dir_items
                    .iter()
                    .filter(|i| i.status == *status_key && !i.file_path.contains("_archive/"))
                    .collect();
                if group.is_empty() {
                    continue;
                }
                md.push_str(&format!("## {}\n\n", label));
                for item in &group {
                    let priority = item.priority.as_deref().unwrap_or("—");
                    md.push_str(&format!(
                        "- [{}] {} — {} — {}\n",
                        item.external_id, item.title, item.status, priority
                    ));
                }
                md.push('\n');
            }

            let shipped: Vec<_> = dir_items
                .iter()
                .filter(|i| {
                    matches!(i.status.as_str(), "done" | "canceled" | "duplicate")
                        || i.file_path.contains("_archive/")
                })
                .collect();
            if !shipped.is_empty() {
                md.push_str("## Shipped\n\n");
                for item in &shipped {
                    let priority = item.priority.as_deref().unwrap_or("—");
                    md.push_str(&format!(
                        "- [{}] {} — {} — {}\n",
                        item.external_id, item.title, item.status, priority
                    ));
                }
                md.push('\n');
            }

            let existing = std::fs::read_to_string(&index_path).unwrap_or_default();
            let new_hash = crate::parser::hash(&md);
            let old_hash = crate::parser::hash(&existing);

            if new_hash != old_hash {
                std::fs::write(&index_path, &md)?;
                updated += 1;
            }
        }
    }

    Ok(updated)
}
