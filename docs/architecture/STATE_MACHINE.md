---
title: State Machine — item lifecycle
type: doc
status: planning
---

# State Machine

## States

Seis estados canônicos:

| Code | Display | Emoji | Frontmatter (write) | Frontmatter (read aliases) |
|---|---|---|---|---|
| `backlog` | Backlog | 📋 | `📋 backlog` | `📋 planned`, `📋 backlog`, `planned`, `backlog` |
| `todo` | Todo | ⬜ | `⬜ pendente` | `⬜ pendente`, `⬜ todo`, `pendente`, `todo` |
| `in_progress` | In Progress | 🔄 | `🔄 em andamento` | `🔄 em andamento`, `🔄 em progresso`, `em andamento`, `em progresso`, `in progress` |
| `done` | Done | ✅ | `✅ resolvido` | `✅ resolvido`, `✅ shipped`, `✅ done`, `resolvido`, `shipped`, `done` |
| `canceled` | Canceled | ❌ | `❌ cancelado` | `❌ cancelado`, `cancelled`, `canceled`, `cancelado` |
| `duplicate` | Duplicate | 🔗 | `🔗 duplicado` | `🔗 duplicado`, `duplicate`, `duplicado` |

Manager **escreve** a forma canônica em pt-br. **Lê** quaisquer das aliases (back-compat com data legacy).

## Transitions

```
                                 ┌─→ canceled (terminal*)
                                 │
backlog ─→ todo ─→ in_progress ──┤─→ done (terminal*)
   ↑         ↑         ↑         │
   └─────────┴─────────┘         └─→ duplicate (terminal*, requires duplicate-of)
   (re-prioritization, any direction)
```

`*` Terminais com exceção do "plan" command que move `done → todo` (re-abre).

### Allowed transitions

```rust
fn allowed_transitions(from: ItemStatus) -> Vec<ItemStatus> {
    match from {
        Backlog =>     vec![Todo, InProgress, Canceled, Duplicate],
        Todo =>        vec![Backlog, InProgress, Canceled, Duplicate],
        InProgress =>  vec![Backlog, Todo, Done, Canceled, Duplicate],
        Done =>        vec![Todo],   // only via "plan" command (re-open)
        Canceled =>    vec![Todo],   // only via "plan" command (re-open)
        Duplicate =>   vec![],       // terminal — manager won't transition out
    }
}
```

UI desabilita opções inválidas. Backend valida e rejeita com `Error::InvalidTransition`.

## Side effects per transition

| From → To | Side effects |
|---|---|
| `* → todo` (from backlog) | none extra |
| `* → in_progress` | set `started_date = today` |
| `* → done` | set `completed_date = today`, append `## Resolução (DATE)\n\n{note}` to body if note provided |
| `* → canceled` | set `completed_date = today` (yes, `completed_date` covers any terminal), append `## Cancelamento (DATE)\n\n{reason}` if reason provided |
| `* → duplicate` | requires `duplicate_of: <external_id>` to be set; append `## Duplicate of\n\n[ID](file)` to body |
| `done → todo` (plan) | clear `completed_date`, prepend `## Re-aberto (DATE)` section |
| `canceled → todo` (plan) | clear `completed_date`, append `## Re-ativado (DATE)` |

`started_date` é preservado quando passa por `done → todo → in_progress` again — não reseta.

## Type-state restrictions

Alguns types têm restrições adicionais:

- **`spec`** items (etapas, design specs): `status` aceita as mesmas 6 transitions, mas
  raramente vão pra `canceled` — UI mostra warning ("specs raramente são canceladas; tem certeza?").
- **`decision`** items (ADRs): `done` é o estado normal (decision = recorded). Transitions
  são raras e exigem confirm dialog adicional.

Isso é UX, não enforcement. State machine raw aceita todas as transitions listadas.

## Write rules — por field

Quando uma transition acontece, manager atualiza:

```
status                 → new canonical string
started_date           → set on first → in_progress; preserved otherwise
completed_date         → set on → done/canceled; cleared on → todo (plan)
duplicate_of           → set on → duplicate; cleared otherwise
```

Outros fields são preserved untouched a menos que o user explicit edite.

## Idempotency

Re-applying the same status (no-op) é seguro:
- Transition validator: `from == to` returns Ok(()), nada muda.
- Write: detect que content é byte-equal → skip file write, skip git commit.
- DB: `UPDATE items SET status='todo' WHERE id=X AND status<>'todo'` (no row updated → no event).

## Auto-archive (engine items only)

Para itens em paths como `roadmap/<domain>/`, transitioning para `done` move o arquivo para
`roadmap/_archive/<domain>/`. Esta lógica é **opt-in via per-template config**:

```jsonc
{
  "templates": {
    "engine-item": {
      "dir": "roadmap/engine",
      "archiveDirOnDone": "roadmap/_archive/engine"
    }
  }
}
```

Quando `archiveDirOnDone` é definido:
1. Após write status=done, manager faz `git mv` para o archive dir
2. Atualiza `items.file_path` no DB
3. Atualiza cross-references em outros .md (mesma lógica do `update_refs` no roadmap-archive.sh)
4. Auto-commit inclui o `git mv` no mesmo commit

Para os 4 types padrão (improvement/bug/refactoring/feature), `archiveDirOnDone` é null → arquivos
ficam onde estão, só status muda.

## Status priority on display

UI ordena dentro de uma view filtered:
1. Status (`backlog → todo → in_progress → done → canceled → duplicate`)
2. Priority (`Urgente → Alta → Média → Baixa → Nenhuma`)
3. Started date desc (mais recentes primeiro)
4. Created date asc (mais antigos primeiro — "been waiting longer")
5. external_id asc (tiebreaker estável)

Kanban: status determina coluna; ordenação dentro da coluna usa 2-5.
List: ordenação configurável, default igual ao kanban.

## Migration from 4-state legacy

Items legacy só têm 4 estados mapeados:
- `📋 planned` / `planned` → `backlog`
- `⬜ pendente` / `pendente` → `todo`
- `🔄 em andamento` / `em andamento` → `in_progress`
- `✅ resolvido` / `shipped` → `done`

Migration na primeira leitura:
- Read alias → map to canonical
- Rewrite frontmatter on next mutation (lazy migration; no big-bang rewrite)

Items que **só** estão em modo read (nunca mutated) mantêm a string original. Validação aceita ambas.
