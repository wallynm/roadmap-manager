---
title: File Sync — watcher, hash guard, auto-commit
type: doc
status: planning
---

# File Sync

## Goal

Manter SQLite e .md em sincronia bidirecional sem loops infinitos:

- **Manager → .md**: toda mutação UI escreve frontmatter + faz commit. SQLite reflete a mudança.
- **.md → manager**: edições externas (IDE, git pull, manual) detectadas via watcher e refletidas no SQLite.

Loop guard: o **hash do arquivo** após a write pelo manager é armazenado em `items.file_hash`.
Quando o watcher dispara, comparamos o novo hash com o último escrito. Match = no-op. Mismatch = external edit, reconciliar.

## Crate / library choice

- **`notify`** (Rust): cross-platform fs events. macOS usa FSEvents.
- Modo: `RecommendedWatcher` com debouncer (`notify-debouncer-full`).
- Debounce window: **500ms** — agrupa bursts (saves frequentes do editor) sem perder eventos.

## Watch scope

Para cada repo cadastrado, watch:

```
<repo.path>/<template.dir>/  (recursive)
```

Exemplos:
- `~/repos/civ-web/docs/improvements/`
- `~/repos/civ-web/docs/bugs/`
- `~/repos/civ-web/docs/refactoring/`

**Não** watch o repo inteiro — só os dirs declarados nos templates. Reduz noise (commits em código fora desses dirs não geram eventos).

Quando user adiciona/remove repos ou edita templates, watcher reconfigura dinamicamente.

## Event types

`notify` emite:
- `Create` → novo arquivo (importar como item)
- `Modify` → arquivo alterado (re-parse + update DB)
- `Remove` → arquivo deletado (delete from DB)
- `Rename` → tratado como remove + create

Filtros aplicados antes de processar:
- Skip files com extensão diferente de `.md`
- Skip files com nome em `SKIP_FILES` (INDEX.md, README.md, etc)
- Skip eventos em paths fora dos templates configurados

## Hash-based loop guard

### Algoritmo

```
On manager write to item I:
  1. Render new file content (frontmatter + body)
  2. Compute hash = sha256(content)
  3. Set items.file_hash = hash in DB (BEFORE writing file)
  4. Write file atomically (write to .tmp, rename)

On watcher event for path P:
  1. Read file content
  2. Compute hash = sha256(content)
  3. Lookup item I where file_path = P (within repo)
  4. If I.file_hash == hash: external edit was actually our own write — IGNORE
  5. Else: external edit detected — reconcile
```

### Atomic writes

```rust
async fn write_md_atomic(path: &Path, content: &str) -> Result<()> {
    let tmp = path.with_extension("md.tmp");
    fs::write(&tmp, content).await?;
    fs::rename(&tmp, path).await?;  // atomic on POSIX
    Ok(())
}
```

`rename` é atômico no POSIX (mesmo filesystem) — readers nunca veem partial writes.

### Why not "pause watcher during write"

Considerado mas rejeitado: race conditions entre o pause + write + unpause + flush event,
especialmente com debouncer. Hash compare é robusto: se duas writes acontecerem em
rápida sucessão, os hashes diferem em pelo menos uma e a reconciliação roda corretamente.

### Edge case: external write produces same content

Cenário improvável: user edita .md manualmente, mas o resultado bate-bit-com-bit ao
último que o manager escreveu. Hash match → ignore. Não há divergência real
(content é idêntico), then nada de errado.

## Reconciliation (external edit)

```
external_edit_detected(path P, new_content C):
  1. Parse new content → ParsedItem (frontmatter + body)
  2. If parse fails → mark item with `parse_error` flag, alert UI, don't update
  3. Compare with current DB row:
     - If frontmatter fields differ → update DB row (status, priority, labels, etc.)
     - If body differs → update DB.body
     - In all cases: update DB.file_hash to new hash
  4. Emit Tauri event `item:external_edit { item }` → UI refreshes card
  5. Add notification (visual badge): "IMP-16 edited externally"
  6. NO sound (silent re-read per user spec)
```

UI handles `item:external_edit`:
- If kanban/list view: refresh card silently
- If item modal is open: show "Reload" badge with stale indicator

## File deletion

Watcher event `Remove`:

```
on_remove(path P):
  1. Find item I where file_path = P
  2. If exists:
     - DELETE FROM items WHERE id = I.id
     - DELETE FROM comments WHERE item_id = I.id (cascade)
     - Emit `item:deleted { id }` → UI removes card
     - Add notification: "IMP-16 deleted from disk"
```

User pode ter deletado intencionalmente via `git rm`. Manager não tenta restaurar.

## File creation

Watcher event `Create`:

```
on_create(path P):
  1. Parse content
  2. If frontmatter has valid `id` AND that ID doesn't conflict with existing in this repo:
     - INSERT new item row
     - Emit `item:created { item }` → UI adds card
  3. If parse fails or ID conflict: alert UI, don't import
     - User can manually trigger "Rescan" to retry
```

Conflito de ID: dois arquivos diferentes com mesmo `id: IMP-16`. Manager mantém o mais antigo
(by file mtime), marca o novo como `parse_error: duplicate id`. UI mostra na sidebar
"Errors (1)" com link pro arquivo problemático.

## Auto-commit

### When

Toda mutação que escreve um .md também commita. Mutations que disparam commit:
- `create_item`, `update_item`, `complete_item`, `start_item`, `cancel_item`,
  `mark_duplicate`, `plan_item`, `add_dependency`, `remove_dependency`, `add_comment`

External edits **não** disparam commit (já são commits do user, ou mudanças não-versionadas que ele commitará separadamente).

### Algorithm

```rust
async fn auto_commit(repo: &Repo, file_path: &Path, item: &Item, action: &str, note: Option<&str>) -> Result<()> {
    let cfg = repo.config.auto_commit;
    if !cfg.enabled { return Ok(()) }

    let git_repo = git2::Repository::open(&repo.path)?;

    // 1. Branch policy check
    let head = git_repo.head()?;
    let current_branch = head.shorthand().unwrap_or("detached").to_string();
    if let Some(branch) = &cfg.branch {
        if &current_branch != branch {
            return Err(Error::WrongBranch { expected: branch.clone(), actual: current_branch });
        }
    }
    if let Some(allowed) = &repo.config.branch_policy.allowed_branches {
        if !allowed.contains(&current_branch) {
            return Err(Error::BranchNotAllowed { branch: current_branch });
        }
    }

    // 2. Dirty check (optional)
    if cfg.skip_if_dirty {
        let statuses = git_repo.statuses(None)?;
        let other_dirty = statuses.iter().any(|s| {
            let path = s.path().unwrap_or("");
            path != file_path.to_str().unwrap()
        });
        if other_dirty { return Err(Error::RepoDirty) }
    }

    // 3. Stage just the .md file (NEVER `git add -A`)
    let rel_path = file_path.strip_prefix(&repo.path)?;
    let mut index = git_repo.index()?;
    index.add_path(rel_path)?;
    index.write()?;

    // 4. Build commit message
    let subject = format_message(&cfg.message_format, item, action);
    let body = build_commit_body(&cfg, item, action, note);
    let message = format!("{}\n\n{}", subject, body);

    // 5. Commit
    let tree = git_repo.find_tree(index.write_tree()?)?;
    let sig = git_repo.signature()?;  // uses git config user.name + user.email
    let parent = git_repo.head()?.peel_to_commit()?;
    git_repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &[&parent])?;

    Ok(())
}
```

### Message format

Subject (single line, ≤ 70 chars):
```
chore(roadmap): {ID} → {STATUS_VERB}
```

Examples:
- `chore(roadmap): IMP-16 created via agent`
- `chore(roadmap): IMP-16 → started`
- `chore(roadmap): BUG-08 → resolvido`
- `chore(roadmap): REF-22 → cancelled`

Body (multi-line, optional but added when `addReferenceLine` is true):
```
Closed via roadmap-manager on 2026-04-29.

Note: fixed by adding aiFogs serialization in save/load handlers.
```

Body sections:
1. **Reference line**: `Closed via roadmap-manager on {DATE}.` (or `Created`, `Started`, `Cancelled`, etc.)
2. **Note** (only when relevant): the `--note` user provided OR agent-generated.
3. **No** Co-Authored-By trailer (per global memory).

### `STATUS_VERB` mapping

| Action / status | Verb |
|---|---|
| Created (any status) | `created` |
| → InProgress | `started` |
| → Done | `resolvido` |
| → Cancelled | `cancelado` |
| → Duplicate | `marcado como duplicado` |
| → Backlog (re-plan) | `replanned` |
| Comment added | `commented` |
| Dependency added | `dependency added` |

### Detached HEAD / no remote

Se `branchPolicy.warnIfDetached` e HEAD detached, commit prossegue mas alerta no UI:
"Committed on detached HEAD — switch to a branch to push later."

### Commit signature (gpg)

Reusar config global do user. **Não** desabilitar GPG signing — manager respeita o que
o user já configurou em `git config commit.gpgsign`.

## Dirty repo handling

Default: `skip_if_dirty = false` (commit prossegue, staging só do .md alvo).
Modo strict: `skip_if_dirty = true` → manager se recusa a commitar e mostra alert
"O repo tem mudanças não-commitadas. Commit ou stash antes de continuar."

Recomendado deixar default (`false`) — manager commita só seu próprio .md, deixa o
resto do dirty intacto. User decide quando commitar o resto.

## Conflict scenarios

### User editou .md manualmente E tinha algo pra fazer no manager

1. User edita `imp-16.md` no Cursor (mudou body, salvou)
2. Watcher detecta → DB atualizado silenciosamente, card refresca
3. Antes do refresh, user clicou "Complete" no card antigo na UI
4. Manager vai escrever .md → conflito potencial?

Resposta: a write do manager re-lê o item ANTES de escrever (sempre), aplica o patch
em cima da versão mais recente do DB. Se o watcher já atualizou o DB, o patch parte da
versão correta. Se não, há uma race window pequena (~ms).

Mitigação: antes de escrever, manager faz mais uma leitura do file (`fs::read`),
compara com `items.file_hash` que tem em DB. Se hash não bate, force-rescan o item
antes de aplicar o patch. Caso o user tenha mudado um campo que conflita (ex: status),
manager mostra dialog "External edit detected — use external version OR retry?".

### Git pull que reescreve um .md gerenciado

User faz `git pull` na CLI, traz mudanças que reescrevem `imp-16.md`:

1. Watcher detecta mudança
2. Mesma reconciliação: re-parse + update DB + emit event
3. UI atualiza silenciosamente

Manager **não** tenta diferenciar "git pull" de "manual edit" — ambos são "external edit".

### Branch switch

User faz `git checkout other-branch`. .md files mudam (alguns deletados, criados, modificados):

1. Watcher dispara N eventos
2. Cada um processado individualmente
3. DB converge pra estado da branch atual

UI pode mostrar toast "Switched to branch X — items updated."

## Bootstrap (first scan)

Quando repo é adicionado:

1. Walk `<repo.path>/<template.dir>/` recursivamente
2. Para cada `.md` matchando `<filePrefix>-*.md`:
   - Parse frontmatter + body
   - Compute hash
   - INSERT into `items`
3. Emit `repo:scanning` events com progresso (UI mostra progress bar)
4. Após terminar, set `repos.last_scan = now()`
5. Start watcher pra esse repo

Erro em parsing de um .md específico não bloqueia o scan — registra na lista de
import errors visível no UI.

## Manual rescan

Settings → Repos → [repo] → "Rescan" button.

Roda o algoritmo `rescan_repo` descrito em [DATA_MODEL.md](DATA_MODEL.md).
Reportta added/updated/removed em modal.

Útil quando:
- DB foi corrompido
- User suspeita que watcher perdeu eventos (ex: app estava fechado durante git pull)
- Mudou config do template e quer re-aplicar

## Logging

Watcher events logados em `~/Library/Logs/com.journeystudios.roadmap-manager/watcher.log` com:
```
2026-04-29T14:32:11Z [INFO] watcher.civ-web: modify imp-16-aifogs-save-load.md (hash match → ignore)
2026-04-29T14:33:02Z [WARN] watcher.civ-web: modify imp-22-tile-sprite-fog.md (external edit, reconciled)
2026-04-29T14:33:45Z [ERROR] watcher.civ-web: parse failed bug-09.md (invalid YAML at line 4)
```
