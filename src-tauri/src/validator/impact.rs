use std::collections::{HashMap, HashSet, VecDeque};

use serde::{Deserialize, Serialize};

use crate::db::items::Item;


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RankedItem {
    pub id: String,
    pub external_id: String,
    pub unblocks: u32,
}

pub fn rank_by_impact(items: &[Item]) -> Vec<RankedItem> {
    let mut reverse_adj: HashMap<String, Vec<String>> = HashMap::new();
    for item in items {
        let deps: Vec<String> = serde_json::from_str(&item.depends_on).unwrap_or_default();
        for dep in deps {
            reverse_adj
                .entry(dep)
                .or_default()
                .push(item.external_id.clone());
        }
    }

    let mut results: Vec<RankedItem> = Vec::new();

    for item in items {
        if matches!(item.status.as_str(), "done" | "canceled" | "duplicate") {
            continue;
        }

        let count = bfs_unblock_count(&item.external_id, &reverse_adj);
        results.push(RankedItem {
            id: item.id.clone(),
            external_id: item.external_id.clone(),
            unblocks: count,
        });
    }

    results.sort_by(|a, b| {
        b.unblocks.cmp(&a.unblocks).then_with(|| a.external_id.cmp(&b.external_id))
    });

    results
}

fn bfs_unblock_count(start: &str, reverse_adj: &HashMap<String, Vec<String>>) -> u32 {
    let mut visited: HashSet<String> = HashSet::new();
    let mut queue: VecDeque<String> = VecDeque::new();

    if let Some(neighbors) = reverse_adj.get(start) {
        for n in neighbors {
            if visited.insert(n.clone()) {
                queue.push_back(n.clone());
            }
        }
    }

    while let Some(node) = queue.pop_front() {
        if let Some(neighbors) = reverse_adj.get(&node) {
            for n in neighbors {
                if visited.insert(n.clone()) {
                    queue.push_back(n.clone());
                }
            }
        }
    }

    visited.len() as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_item(ext_id: &str, deps: Vec<&str>, status: &str) -> Item {
        Item {
            id: uuid::Uuid::new_v4().to_string(),
            repo_id: "r".to_string(),
            external_id: ext_id.to_string(),
            scope: String::new(),
            item_type: "bug".to_string(),
            title: ext_id.to_string(),
            file_path: format!("{}.md", ext_id),
            file_hash: String::new(),
            body: String::new(),
            frontmatter: String::new(),
            status: status.to_string(),
            priority: None,
            labels: "[]".to_string(),
            depends_on: serde_json::to_string(&deps).unwrap(),
            relates_to: "[]".to_string(),
            duplicate_of: None,
            created_date: Some("2026-01-01".to_string()),
            started_date: None,
            completed_date: None,
            updated_at: String::new(),
        }
    }

    #[test]
    fn top_blocker_ranks_first() {
        let items = vec![
            make_item("A", vec![], "todo"),
            make_item("B", vec!["A"], "todo"),
            make_item("C", vec!["A"], "todo"),
            make_item("D", vec!["B"], "todo"),
        ];
        let ranked = rank_by_impact(&items);
        assert_eq!(ranked[0].external_id, "A");
        assert_eq!(ranked[0].unblocks, 3);
    }

    #[test]
    fn done_items_excluded() {
        let items = vec![
            make_item("A", vec![], "done"),
            make_item("B", vec!["A"], "todo"),
        ];
        let ranked = rank_by_impact(&items);
        assert_eq!(ranked.len(), 1);
        assert_eq!(ranked[0].external_id, "B");
    }

    #[test]
    fn leaf_node_unblocks_zero() {
        let items = vec![
            make_item("A", vec![], "todo"),
            make_item("B", vec!["A"], "todo"),
        ];
        let ranked = rank_by_impact(&items);
        let b = ranked.iter().find(|r| r.external_id == "B").unwrap();
        assert_eq!(b.unblocks, 0);
    }
}
