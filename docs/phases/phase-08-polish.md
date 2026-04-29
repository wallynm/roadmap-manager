---
id: PHASE-08
title: Polish — notifications, settings panel, distribution
type: spec
description: Final polish — visual notifications, app settings panel, sound config, build distribution (.dmg), keyboard shortcuts panel, error reporting.
status: 📋 planned
created-date: 2026-04-29
depends-on: [PHASE-07]
---

# Phase 08 — Polish

## Goal

Tirar o app do "funciona pra mim" e deixar shippable: settings completo, notificações
robustas, distribuição (.dmg), error reporting, error boundaries, performance audit.

## Tasks

### 1. Settings panel — full

- [ ] Tabs:
  1. **General**: theme (dark only, but UI ready for future), language (pt-br), default model dropdown, agent concurrency limit, "Play sounds" toggle
  2. **Repos**: full table with edit/disconnect, "Rescan all" button
  3. **API key**: source detection, test button, override field, encrypted storage
  4. **Cost**: monthly graph + breakdown by trigger, cumulative since first install
  5. **Migrations**: list of available migrations (priority, area→labels, future ones), per-repo run buttons
  6. **Keyboard shortcuts**: full list (display-only, no rebind in v1)
  7. **About**: version, log location, "Open log dir" button, "Reset DB" (danger zone), credits

### 2. Notifications system polish

- [ ] Inbox panel:
  - Group by category (agent, edits, stale, system)
  - "Mark all read" persists
  - Click notification → action (open item, run triage, etc.)
  - Auto-dismiss after 30 days
- [ ] Toast notifications (sonner) for transient feedback
- [ ] Native macOS notifications (Tauri notification plugin) for:
  - Agent finished while app was in background
  - External edit detected
- [ ] Settings → Notifications: per-category toggle (sounds, native, inbox)

### 3. Sounds finalization

- [ ] All triggers wired correctly per [UI_DESIGN.md § Sounds](../architecture/UI_DESIGN.md#sounds)
- [ ] "Play sounds" master toggle
- [ ] Volume slider (subtle UX: 0% = mute, 100% = system volume)
- [ ] Test button per sound in settings

### 4. Error handling polish

- [ ] React error boundary at App level → "Something went wrong" with stack + "Reload" + "Report bug" (opens log dir)
- [ ] Rust panics → caught in Tauri, logged, app stays alive
- [ ] All Tauri commands return `Result` with serializable error variants
- [ ] User-facing errors classified:
  - **Recoverable**: toast with retry button (network, rate limit)
  - **User error**: dialog with actionable hint (branch policy, permission)
  - **Bug**: full error with "Copy details" button + log location
- [ ] Telemetry: opt-in, anonymized error counts (default off)

### 5. Performance audit

- [ ] App startup ≤ 1s on M1 Mac
- [ ] Repo with 500 items: kanban renders ≤ 200ms
- [ ] Search: response ≤ 50ms for 5000-item dataset
- [ ] File watcher latency: ≤ 1s from save to UI update
- [ ] Memory baseline: ≤ 200MB with 5 repos × 1k items each
- [ ] Profile React rerenders with React Profiler — kill unnecessary updates
- [ ] DB indexes verified for all common queries

### 6. Window state persistence

- [ ] Save to `app_state` table (debounced 500ms):
  - Window size + position
  - Sidebar collapsed
  - Last selected repo + view tab + filters
  - Saved view URLs visited
- [ ] Restore on next launch

### 7. Distribution build

- [ ] Configure `tauri.conf.json`:
  - Identifier: `com.journeystudios.roadmap-manager`
  - Bundle name, version, icon (512x512 + 16x16 + 32x32 + 128x128 ICNS)
  - macOS targets: x86_64 + aarch64 (universal binary)
  - Code signing: optional in v1 (warns user about Gatekeeper if not signed)
- [ ] `pnpm tauri build` produces:
  - `src-tauri/target/release/bundle/dmg/roadmap-manager_X.X.X_universal.dmg`
- [ ] First-run setup wizard:
  - Welcome screen
  - "Where are your repos?" (default `~/www/journeystudios/`)
  - Optional API key entry
  - "Add your first repo" CTA
- [ ] Update mechanism: skip in v1 (manual replace .app); plan for `tauri-updater` later

### 8. Logging

- [ ] All logs to `~/Library/Logs/com.journeystudios.roadmap-manager/`:
  - `app.log` — main app events, mutations, errors
  - `agent-{runId}.log` — per-agent-run sidecar logs
  - `watcher.log` — fs events, hash mismatches
- [ ] Log rotation: max 50 files / 10MB each (use `tracing-appender`)
- [ ] Log level configurable via env var `RUST_LOG=roadmap_manager=debug` for dev
- [ ] "Open log dir" button in settings

### 9. First-run experience

- [ ] First launch detects empty DB → wizard
- [ ] Default repo path suggestion: scan `~/www/journeystudios/` for git repos with `docs/improvements/` → propose import
- [ ] Help overlay: keyboard shortcuts cheatsheet on first kanban view (dismissable)

### 10. Documentation in-app

- [ ] Help menu (⌘?):
  - Keyboard shortcuts
  - Linked to docs/ (open in browser via Tauri shell::open)
  - Version + check for updates (placeholder)

### 11. Telemetry & privacy

- [ ] Privacy panel in Settings → About:
  - "What gets sent to Anthropic": list of trigger types and what they include
  - "Local-only": confirm DB never leaves your machine
  - Opt-in error telemetry (off by default)

### 12. Release checklist

- [ ] Run `pnpm tauri build` clean
- [ ] Test .dmg install + first launch on a clean macOS user
- [ ] Run validation cruzada use case end-to-end
- [ ] Verify all sounds play
- [ ] Verify all keyboard shortcuts
- [ ] Test all agent triggers with real API key
- [ ] Stress test: 5 repos × 500 items each
- [ ] Memory leak check: 30min of intensive use
- [ ] Bundle size check: <30MB

## Files to create / modify

### New

```
src/components/
├── settings/
│   ├── GeneralPanel.tsx
│   ├── CostPanel.tsx
│   ├── MigrationPanel.tsx
│   ├── KeyboardShortcutsPanel.tsx
│   └── AboutPanel.tsx
├── onboarding/
│   ├── WelcomeWizard.tsx
│   └── HelpOverlay.tsx
└── ErrorBoundary.tsx

src-tauri/src/
├── telemetry/
│   └── mod.rs
└── notifications/
    └── native.rs    # macOS native notifications
```

### Modified

```
tauri.conf.json                     # bundle config, icons, signing
src-tauri/src/main.rs               # error handler, logger init
src/App.tsx                         # error boundary wrap
src/components/settings/SettingsView.tsx  # tabs assembled
```

## Acceptance criteria

- [ ] App opens, runs validation use case end-to-end without errors
- [ ] All settings tabs functional
- [ ] `pnpm tauri build` produces working .dmg
- [ ] First-run wizard works on fresh machine
- [ ] Help menu accessible via ⌘?
- [ ] Logs accessible via "Open log dir"
- [ ] Memory stays under 200MB during normal use
- [ ] No console errors during 30min stress test

## Out of scope (defer to v2)

- Auto-update via tauri-updater
- Code signing + Apple notarization (need developer cert)
- Multi-user support
- Cloud sync of DB
- Mobile companion
- Slack/Discord integrations
- Custom agent prompts (UI for editing system prompts)
- Plugin system

## Notes

- This phase concludes v1. After this, you have a shippable .dmg that can manage 3-5 repos
  with the full Linear-style experience.
- Next iterations should focus on dogfooding: use it daily for 2 weeks, log pain points,
  fix top 5 in v1.1.
