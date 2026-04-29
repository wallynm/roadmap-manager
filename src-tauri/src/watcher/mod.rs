use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use notify::RecursiveMode;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use tokio::sync::Mutex;

use crate::db::repos::Repo;
use crate::scanner::RepoConfig;
use crate::sync::ReconcileOutcome;

pub struct WatcherPool {
    watchers: Arc<Mutex<HashMap<String, Debouncer<notify::RecommendedWatcher, RecommendedCache>>>>,
}

impl WatcherPool {
    pub fn new() -> Self {
        Self {
            watchers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn add_repo(
        &self,
        repo: &Repo,
        pool: sqlx::SqlitePool,
        app_handle: tauri::AppHandle,
    ) -> Result<(), String> {
        let config: RepoConfig =
            serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;
        let repo_path = PathBuf::from(&repo.path);
        let repo_id = repo.id.clone();

        let pool_clone = pool.clone();
        let app_clone = app_handle.clone();
        let repo_id_clone = repo_id.clone();
        let repo_path_clone = repo_path.clone();

        let mut debouncer = new_debouncer(
            Duration::from_millis(500),
            None,
            move |result: DebounceEventResult| {
                let pool = pool_clone.clone();
                let app = app_clone.clone();
                let rid = repo_id_clone.clone();
                let rpath = repo_path_clone.clone();

                if let Ok(events) = result {
                    tokio::spawn(async move {
                        for event in events {
                            for path in &event.paths {
                                if let Some(ext) = path.extension() {
                                    if ext == "md" {
                                        match crate::sync::handle_fs_event(
                                            &pool, &rid, &rpath, path, &event.kind,
                                        )
                                        .await
                                        {
                                            Ok(ReconcileOutcome::Created(id)) => {
                                                if let Ok(item) = crate::db::items::get(&pool, &id).await {
                                                    let _ = app.emit("item:created", &item);
                                                }
                                            }
                                            Ok(ReconcileOutcome::Updated(id)) => {
                                                if let Ok(item) = crate::db::items::get(&pool, &id).await {
                                                    let _ = app.emit("item:external_edit", &item);
                                                }
                                            }
                                            Ok(ReconcileOutcome::Deleted(id)) => {
                                                let _ = app.emit(
                                                    "item:deleted",
                                                    serde_json::json!({ "id": id }),
                                                );
                                            }
                                            Ok(ReconcileOutcome::NoOp) => {}
                                            Err(e) => {
                                                tracing::warn!("reconcile error: {}", e);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
            },
        )
        .map_err(|e| e.to_string())?;

        let mut watchers = self.watchers.lock().await;

        for (_type_name, template) in &config.templates {
            let dirs = crate::scanner::discover_template_dirs(&repo_path, &template.dir);
            for dir in dirs {
                debouncer
                    .watch(&dir, RecursiveMode::Recursive)
                    .map_err(|e| e.to_string())?;
            }
        }

        watchers.insert(repo_id.clone(), debouncer);
        Ok(())
    }

    pub async fn remove_repo(&self, repo_id: &str) {
        let mut watchers = self.watchers.lock().await;
        watchers.remove(repo_id);
    }
}
