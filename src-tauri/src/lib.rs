pub mod agent;
pub mod archive;
pub mod db;
pub mod error;
pub mod ipc;
pub mod parser;
pub mod roadmap;
pub mod scanner;
pub mod sounds;
pub mod sync;
pub mod validator;
pub mod vcs;
pub mod watcher;
pub mod writer;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter("roadmap_manager=debug,sqlx=warn")
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async {
                let pool = db::open_pool().await.expect("Failed to open database");
                let watcher_pool = watcher::WatcherPool::new();

                if let Ok(repos) = db::repos::list(&pool).await {
                    for repo in &repos {
                        let _ = watcher_pool
                            .add_repo(repo, pool.clone(), handle.clone())
                            .await;
                    }
                }

                let sidecar_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("..")
                    .join("sidecar")
                    .join("agent.mjs");
                handle.manage(pool.clone());
                handle.manage(watcher_pool);
                handle.manage(agent::pool::AgentPool::new(sidecar_path, 1));
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::repos::list_repos,
            ipc::repos::add_repo,
            ipc::repos::remove_repo,
            ipc::repos::rescan_repo,
            ipc::repos::get_repo,
            ipc::repos::update_repo,
            ipc::repos::get_roadmap,
            ipc::repos::regenerate_roadmap,
            ipc::items::list_items,
            ipc::items::get_item,
            ipc::items::create_item,
            ipc::items::start_item,
            ipc::items::complete_item,
            ipc::items::cancel_item,
            ipc::items::mark_duplicate,
            ipc::items::plan_item,
            ipc::items::update_item,
            ipc::items::add_dependency,
            ipc::items::remove_dependency,
            ipc::items::add_comment,
            ipc::items::get_item_comments,
            ipc::items::get_notifications,
            ipc::items::mark_notification_read,
            ipc::items::mark_all_notifications_read,
            ipc::items::get_unread_count,
            ipc::agent::agent_invoke,
            ipc::agent::agent_respond,
            ipc::agent::agent_get_run,
            ipc::agent::agent_cancel,
            ipc::agent::agent_list_runs,
            ipc::validate::validate_repo,
            ipc::validate::fix_repo,
            ipc::validate::deps_check,
            ipc::validate::impact_ranking,
            ipc::validate::stale_items,
            ipc::archive::archive_dry_run,
            ipc::archive::archive_execute,
            ipc::repos::regenerate_indexes,
            ipc::repos::get_checkbox_count,
            ipc::repos::get_sub_roadmaps,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
