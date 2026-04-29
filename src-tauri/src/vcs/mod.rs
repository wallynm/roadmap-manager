use std::path::Path;

use crate::db::items::Item;
use crate::db::repos::Repo;
use crate::error::{AppError, AppResult};
use crate::scanner::RepoConfig;
use crate::writer;

pub fn auto_commit(
    repo: &Repo,
    file_path: &Path,
    item: &Item,
    action: &str,
    note: Option<&str>,
) -> AppResult<()> {
    let config: RepoConfig = serde_json::from_str(&repo.config)
        .map_err(|e| AppError::Validation(format!("Invalid repo config: {}", e)))?;

    let ac = &config.auto_commit;
    if !ac.enabled {
        return Ok(());
    }

    let git_repo = git2::Repository::open(&repo.path)?;

    let head = git_repo.head()?;
    let current_branch = head.shorthand().unwrap_or("detached").to_string();

    if let Some(branch) = &ac.branch {
        if &current_branch != branch {
            return Err(AppError::WrongBranch {
                expected: branch.clone(),
                actual: current_branch,
            });
        }
    }

    if let Some(allowed) = &config.branch_policy.allowed_branches {
        if !allowed.contains(&current_branch) {
            return Err(AppError::BranchNotAllowed {
                branch: current_branch,
            });
        }
    }

    if ac.skip_if_dirty {
        let statuses = git_repo.statuses(None)?;
        let rel_path_str = file_path
            .strip_prefix(&repo.path)
            .unwrap_or(file_path)
            .to_string_lossy();
        let other_dirty = statuses.iter().any(|s| {
            let p = s.path().unwrap_or("");
            p != rel_path_str.as_ref()
        });
        if other_dirty {
            return Err(AppError::RepoDirty);
        }
    }

    let rel_path = file_path
        .strip_prefix(&repo.path)
        .map_err(|_| AppError::Generic("File not under repo path".into()))?;

    let mut index = git_repo.index()?;
    index.add_path(rel_path)?;
    index.write()?;

    let subject = writer::format_commit_message(&ac.message_format, item, action);
    let mut message = subject.clone();

    if ac.add_reference_line || note.is_some() {
        message.push_str("\n\n");
        if ac.add_reference_line {
            let verb = match action {
                "created" => "Created",
                "started" => "Started",
                "resolvido" => "Closed",
                "cancelado" => "Cancelled",
                _ => "Updated",
            };
            message.push_str(&format!(
                "{} via roadmap-manager on {}.\n",
                verb,
                chrono::Utc::now().format("%Y-%m-%d")
            ));
        }
        if let Some(n) = note {
            if ac.include_note_in_body {
                message.push_str(&format!("\nNote: {}\n", n));
            }
        }
    }

    let tree_oid = index.write_tree()?;
    let tree = git_repo.find_tree(tree_oid)?;
    let sig = git_repo.signature()?;
    let parent = git_repo.head()?.peel_to_commit()?;

    git_repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &[&parent])?;

    Ok(())
}

pub fn current_branch(repo_path: &str) -> AppResult<String> {
    let git_repo = git2::Repository::open(repo_path)?;
    let head = git_repo.head()?;
    Ok(head.shorthand().unwrap_or("detached").to_string())
}
