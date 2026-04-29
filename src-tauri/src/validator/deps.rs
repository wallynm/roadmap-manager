use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use crate::db::items::Item;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DepIssue {
    pub kind: DepIssueKind,
    pub item_id: String,
    pub external_id: String,
    pub detail: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DepIssueKind {
    Orphan,
    SelfRef,
    Cycle,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DepAnalysis {
    pub orphans: Vec<DepIssue>,
    pub self_refs: Vec<DepIssue>,
    pub cycles: Vec<DepIssue>,
}

pub fn analyze(items: &[Item]) -> DepAnalysis {
    let ext_ids: HashSet<String> = items.iter().map(|i| i.external_id.clone()).collect();
    let mut adjacency: HashMap<String, Vec<String>> = HashMap::new();
    let mut orphans = Vec::new();
    let mut self_refs = Vec::new();

    for item in items {
        let deps: Vec<String> = serde_json::from_str(&item.depends_on).unwrap_or_default();
        let mut edges = Vec::new();

        for dep in &deps {
            if dep == &item.external_id {
                self_refs.push(DepIssue {
                    kind: DepIssueKind::SelfRef,
                    item_id: item.id.clone(),
                    external_id: item.external_id.clone(),
                    detail: format!("{} depends on itself", item.external_id),
                });
                continue;
            }

            if !ext_ids.contains(dep) {
                orphans.push(DepIssue {
                    kind: DepIssueKind::Orphan,
                    item_id: item.id.clone(),
                    external_id: item.external_id.clone(),
                    detail: format!(
                        "{} depends on {} which does not exist",
                        item.external_id, dep
                    ),
                });
                continue;
            }

            edges.push(dep.clone());
        }

        adjacency.insert(item.external_id.clone(), edges);
    }

    let cycles = find_cycles(&adjacency);

    DepAnalysis {
        orphans,
        self_refs,
        cycles,
    }
}

fn find_cycles(adj: &HashMap<String, Vec<String>>) -> Vec<DepIssue> {
    let mut visited: HashSet<String> = HashSet::new();
    let mut on_stack: HashSet<String> = HashSet::new();
    let mut path: Vec<String> = Vec::new();
    let mut cycles: Vec<Vec<String>> = Vec::new();

    for node in adj.keys() {
        if !visited.contains(node) {
            dfs(node, adj, &mut visited, &mut on_stack, &mut path, &mut cycles);
        }
    }

    let mut seen_cycles: HashSet<String> = HashSet::new();
    let mut issues = Vec::new();

    for cycle in &cycles {
        let mut sorted = cycle.clone();
        sorted.sort();
        let key = sorted.join(",");
        if seen_cycles.contains(&key) {
            continue;
        }
        seen_cycles.insert(key);

        let cycle_str = format!("{} \u{2192} {}", cycle.join(" \u{2192} "), cycle[0]);
        issues.push(DepIssue {
            kind: DepIssueKind::Cycle,
            item_id: String::new(),
            external_id: cycle[0].clone(),
            detail: cycle_str,
        });
    }

    issues
}

fn dfs(
    node: &str,
    adj: &HashMap<String, Vec<String>>,
    visited: &mut HashSet<String>,
    on_stack: &mut HashSet<String>,
    path: &mut Vec<String>,
    cycles: &mut Vec<Vec<String>>,
) {
    visited.insert(node.to_string());
    on_stack.insert(node.to_string());
    path.push(node.to_string());

    if let Some(neighbors) = adj.get(node) {
        for next in neighbors {
            if !visited.contains(next.as_str()) {
                dfs(next, adj, visited, on_stack, path, cycles);
            } else if on_stack.contains(next.as_str()) {
                if let Some(pos) = path.iter().position(|n| n == next) {
                    let cycle: Vec<String> = path[pos..].to_vec();
                    cycles.push(cycle);
                }
            }
        }
    }

    on_stack.remove(node);
    path.pop();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_item(ext_id: &str, deps: Vec<&str>) -> Item {
        Item {
            id: uuid::Uuid::new_v4().to_string(),
            repo_id: "r".to_string(),
            external_id: ext_id.to_string(),
            scope: String::new(),
            item_type: "bug".to_string(),
            title: ext_id.to_string(),
            file_path: format!("docs/bugs/{}.md", ext_id.to_lowercase()),
            file_hash: String::new(),
            body: String::new(),
            frontmatter: String::new(),
            status: "todo".to_string(),
            priority: None,
            labels: "[]".to_string(),
            depends_on: serde_json::to_string(&deps).unwrap(),
            duplicate_of: None,
            created_date: None,
            started_date: None,
            completed_date: None,
            updated_at: String::new(),
        }
    }

    #[test]
    fn detect_orphan_dep() {
        let items = vec![make_item("A", vec!["NONEXISTENT"])];
        let result = analyze(&items);
        assert_eq!(result.orphans.len(), 1);
        assert!(result.orphans[0].detail.contains("NONEXISTENT"));
    }

    #[test]
    fn detect_self_ref() {
        let items = vec![make_item("A", vec!["A"])];
        let result = analyze(&items);
        assert_eq!(result.self_refs.len(), 1);
    }

    #[test]
    fn detect_cycle() {
        let items = vec![
            make_item("A", vec!["B"]),
            make_item("B", vec!["C"]),
            make_item("C", vec!["A"]),
        ];
        let result = analyze(&items);
        assert!(!result.cycles.is_empty());
        assert!(result.cycles[0].detail.contains("\u{2192}"));
    }

    #[test]
    fn no_issues_clean_graph() {
        let items = vec![
            make_item("A", vec!["B"]),
            make_item("B", vec![]),
            make_item("C", vec!["A"]),
        ];
        let result = analyze(&items);
        assert!(result.orphans.is_empty());
        assert!(result.self_refs.is_empty());
        assert!(result.cycles.is_empty());
    }
}
