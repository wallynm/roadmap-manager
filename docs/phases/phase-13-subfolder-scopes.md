---
id: PHASE-13
title: Subfolder-as-Scope — subpastas dentro do template dir viram scopes naturais
type: phase
status: ✅ resolvido
labels: []
created-date: 2026-04-30
depends-on: []
---

# Phase 13 — Subfolder-as-Scope

## Objetivo

Permitir que subpastas naturais dentro de um template dir sejam reconhecidas
como **scopes isolados**, sem nenhuma configuração extra.

Hoje, numa estrutura como:

```
roadmaps/
  frontend/
    feat-login.md
    feat-dashboard.md
  backend/
    feat-auth-api.md
  mobile/
    feat-push.md
```

Todos os arquivos são **invisíveis** para o scanner (max_depth = 1, só lê o
root do dir). Com esta phase, cada subpasta imediata vira um scope:

| Arquivo                            | Scope atual | Scope após phase |
|------------------------------------|-------------|-----------------|
| `roadmaps/feat-legacy.md`          | `""`        | `""`            |
| `roadmaps/frontend/feat-login.md`  | invisível   | `"frontend"`    |
| `roadmaps/backend/feat-auth.md`    | invisível   | `"backend"`     |

Em monorepos onde o mesmo template dir aparece em múltiplos pacotes, os dois
níveis se combinam:

| Arquivo                                        | Scope            |
|------------------------------------------------|-----------------|
| `packages/web/roadmaps/feat.md`                | `"packages/web"` |
| `packages/web/roadmaps/frontend/feat.md`       | `"packages/web/frontend"` |
| `packages/mobile/roadmaps/feat.md`             | `"packages/mobile"` |

---

## Comportamento atual (para referência)

### `derive_scope` — `src-tauri/src/scanner/mod.rs`

```rust
pub fn derive_scope(file_path: &str, template_dir: &str) -> String {
    if let Some(idx) = file_path.find(&format!("/{}", template_dir)) {
        let scope = &file_path[..idx];       // tudo ANTES do template dir
        if scope.is_empty() { return String::new(); }
        return scope.to_string();
    }
    if file_path.starts_with(template_dir) { return String::new(); }
    String::new()
}
```

Captura apenas o **prefixo monorepo** (o que vem antes do nome do dir de
template). Subpastas internas ao template dir são ignoradas.

### `walk_template_files` — `max_depth(1)`

```rust
for entry in WalkDir::new(dir).max_depth(1).into_iter().flatten() {
```

Só escaneia arquivos diretamente no root do template dir. Qualquer `.md` em
subpasta é silenciosamente ignorado.

---

## Mudanças necessárias

### 1. `src-tauri/src/scanner/mod.rs` — `derive_scope`

Reescrever para capturar **prefixo monorepo** + **subpasta imediata**:

```rust
pub fn derive_scope(file_path: &str, template_dir: &str) -> String {
    let components: Vec<&str> = file_path.split('/').collect();

    // Acha o componente que corresponde ao template dir
    let Some(td_idx) = components.iter().position(|c| *c == template_dir) else {
        return String::new();
    };

    // Prefixo monorepo: tudo antes do template dir
    let prefix_parts = &components[..td_idx];

    // Subpasta imediata: o componente logo após o template dir,
    // mas só se ainda houver mais 1 componente depois dele (o filename).
    // components.len() > td_idx + 2 significa: template_dir / subdir / file.md
    let subdir = if components.len() > td_idx + 2 {
        components[td_idx + 1]
    } else {
        ""
    };

    match (prefix_parts.is_empty(), subdir.is_empty()) {
        (true, true)   => String::new(),
        (true, false)  => subdir.to_string(),
        (false, true)  => prefix_parts.join("/"),
        (false, false) => format!("{}/{}", prefix_parts.join("/"), subdir),
    }
}
```

### 2. `src-tauri/src/scanner/mod.rs` — `walk_template_files`

Aumentar `max_depth(1)` para `max_depth(2)` para incluir um nível de subpastas.
**Não aumentar além de 2** — evita varrer árvores profundas inadvertidamente.

```rust
// antes:
for entry in WalkDir::new(dir).max_depth(1).into_iter().flatten() {

// depois:
for entry in WalkDir::new(dir).max_depth(2).into_iter().flatten() {
```

### 3. `src-tauri/src/db/items.rs` — `update`

Adicionar `scope` ao UPDATE SQL para que rescans sincronizem o scope quando
ele muda (ex.: item migrado de subpasta para outra).

```sql
-- antes:
UPDATE items SET external_id=?, title=?, body=?, frontmatter=?, file_hash=?,
  status=?, priority=?, labels=?, depends_on=?, relates_to=?, duplicate_of=?,
  started_date=?, completed_date=?, updated_at=? WHERE id=?

-- depois:
UPDATE items SET scope=?, external_id=?, title=?, body=?, frontmatter=?,
  file_hash=?, status=?, priority=?, labels=?, depends_on=?, relates_to=?,
  duplicate_of=?, started_date=?, completed_date=?, updated_at=? WHERE id=?
```

`.bind(&item.scope)` deve ser adicionado como primeiro bind (antes de
`external_id`).

### 4. `src-tauri/src/scanner/mod.rs` — `scan_repo`, branch `Some(existing_item)`

Adicionar `scope_changed` à condição de update e propagar o novo scope no
objeto `updated`:

```rust
let scope = derive_scope(&tf.rel_path, &template.dir);
// ... (já calculado antes do match)

let scope_changed = existing_item.scope != scope;

if hash_changed || id_changed || scope_changed || deps_enriched {
    let mut updated = existing_item.clone();
    updated.scope = scope;           // ← novo campo
    updated.external_id = external_id;
    // ... demais campos já existentes permanecem iguais
```

O `match` que trata UNIQUE constraint no update já existe — não alterar.

---

## O que NÃO muda

- **Frontend**: a sidebar já constrói scopes dinamicamente a partir dos itens
  (`items.map(i => i.scope)`). Nenhuma alteração necessária.
- **Filtro por scope na URL** (`?scope=xxx`): já funciona, não alterar.
- **`scopeLabel()`** no frontend: já lida com paths com `/` (pega o último
  segmento via `split("/").pop()`). Funciona corretamente para `"packages/web"`,
  `"frontend"`, `"packages/web/frontend"`.
- **`ItemFilters.scope`** no backend: já existe. Não alterar.
- **`UNIQUE(repo_id, scope, external_id)`**: a constraint continua válida. Cada
  arquivo dentro de uma subpasta terá um scope distinto, reduzindo colisões de
  ID ainda mais.

---

## Testes a adicionar

Em `src-tauri/src/scanner/mod.rs`, dentro de `#[cfg(test)]`:

```rust
#[test]
fn scope_root_file() {
    assert_eq!(derive_scope("roadmaps/feat-a.md", "roadmaps"), "");
}

#[test]
fn scope_subfolder() {
    assert_eq!(derive_scope("roadmaps/frontend/feat-a.md", "roadmaps"), "frontend");
}

#[test]
fn scope_monorepo_root() {
    assert_eq!(derive_scope("packages/web/roadmaps/feat.md", "roadmaps"), "packages/web");
}

#[test]
fn scope_monorepo_subfolder() {
    assert_eq!(
        derive_scope("packages/web/roadmaps/frontend/feat.md", "roadmaps"),
        "packages/web/frontend"
    );
}

#[test]
fn scope_no_match() {
    assert_eq!(derive_scope("docs/readme.md", "roadmaps"), "");
}

#[test]
fn scope_template_dir_at_root() {
    // template dir é o primeiro componente do path
    assert_eq!(derive_scope("features/feat-a.md", "features"), "");
}

#[test]
fn scope_template_dir_at_root_with_subdir() {
    assert_eq!(derive_scope("features/auth/feat-a.md", "features"), "auth");
}
```

---

## Notas de migração

Itens já no banco com scope derivado pela lógica antiga serão atualizados
automaticamente no próximo rescan (o `UPDATE` agora inclui `scope`). O usuário
não precisa fazer nada além de clicar em "Rescan" após o deploy.

Pesos de scope configurados nos Settings (`scopeWeights`) usam o valor do
scope como chave. Se um scope existente mudar de nome (ex.: `""` → `"frontend"`
para arquivos que foram movidos para subpasta), o peso precisará ser
reconfigurado manualmente. Isso é aceitável — o move de arquivo é uma ação
intencional do usuário.


## Resolução (2026-04-30)

Já implementado
