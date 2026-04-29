---
title: Repo Config — registration & templates
type: doc
status: planning
---

# Repo Config

## Onde fica

Config de repos é gerido pelo manager — armazenado em `repos.config` (JSONB) na tabela SQLite,
não como arquivo .json no disco. Isso evita poluir os repos cadastrados com config do manager.

UI tem **Settings → Repos → [repo] → Edit Templates** pra editar o config visualmente.
Para edição manual / debug, expomos `roadmap-manager export-config <repo>` e
`roadmap-manager import-config <repo> < config.json` via CLI sidecar.

## Estrutura completa do config

```jsonc
{
  // Templates por type. Cada repo decide quais types existem.
  "templates": {
    "improvement": {
      "dir": "docs/improvements",            // relativo ao repo root
      "filePrefix": "imp",                   // imp-NN-slug.md
      "idPrefix": "IMP",                     // IMP-NN
      "idPadding": 2,                        // IMP-01 vs IMP-1 (default 2)
      "frontmatterFields": [                 // ordered list — controls write order
        "id",
        "title",
        "type",
        "priority",
        "status",
        "labels",
        "created-date",
        "started-date",
        "completed-date",
        "depends-on"
      ],
      "requiredFields": ["id", "title", "type", "status"],   // validate fails if missing
      "defaults": {
        "priority": "Média",
        "status": "⬜ pendente",
        "labels": ["architecture"]
      },
      "bodyTemplate": "# {ID} — {TITLE}\n\n**Contexto:** TODO\n\n**Ação:** TODO\n",
      "agentSystemPrompt": "..."             // optional override; falls back to global
    },
    "bug": {
      "dir": "docs/bugs",
      "filePrefix": "bug",
      "idPrefix": "BUG",
      "idPadding": 2,
      "frontmatterFields": ["id", "title", "type", "priority", "status", "labels", "created-date", "started-date", "completed-date", "depends-on"],
      "requiredFields": ["id", "title", "type", "status"],
      "defaults": {
        "priority": "Alta",
        "status": "⬜ pendente",
        "labels": ["bug", "correctness"]
      },
      "bodyTemplate": "# {ID} — {TITLE}\n\n## Sintoma\n\nTODO\n\n## Reprodução\n\n1. TODO\n\n## Causa raiz\n\nTODO\n"
    },
    "refactoring": {
      "dir": "docs/refactoring",
      "filePrefix": "ref",                   // OR "fw" for fw-pixijs case
      "idPrefix": "REF",                     // OR "FW"
      "frontmatterFields": ["id", "title", "type", "priority", "status", "labels", "created-date", "completed-date", "depends-on"],
      "requiredFields": ["id", "title", "type", "status"],
      "defaults": {
        "priority": "Média",
        "status": "⬜ pendente",
        "labels": ["refactoring"]
      },
      "bodyTemplate": "# {ID} — {TITLE}\n\n**Contexto:** TODO\n\n**Plano:** TODO\n"
    },
    "feature": {
      "dir": "docs/features",
      "filePrefix": "feat",
      "idPrefix": "FEAT",
      "frontmatterFields": ["id", "title", "type", "status", "labels", "created-date", "completed-date", "depends-on"],
      "requiredFields": ["id", "title", "type", "status"],
      "defaults": {
        "status": "⬜ pendente",
        "labels": []
      },
      "bodyTemplate": "# {ID} — {TITLE}\n\n## Objetivo\n\nTODO\n\n## API\n\nTODO\n"
    }
  },

  // Labels válidas no repo. Tentar usar uma label fora dessa lista bloqueia o write
  // a menos que `labels.allowFreeForm` seja true.
  "labels": {
    "whitelist": [
      "architecture", "performance", "correctness", "feature",
      "ui", "testing", "refactoring", "design", "documentation",
      "bug", "tech-debt"
    ],
    "allowFreeForm": false,
    "colors": {
      "architecture": "#8B5CF6",
      "performance":  "#F59E0B",
      "correctness":  "#EF4444",
      "feature":      "#3B82F6",
      "ui":           "#EC4899",
      "testing":      "#10B981",
      "refactoring":  "#6B7280",
      "design":       "#06B6D4",
      "documentation":"#A78BFA",
      "bug":          "#DC2626",
      "tech-debt":    "#9CA3AF"
    }
  },

  // Auto-commit behavior — pode ser desabilitado por repo.
  "autoCommit": {
    "enabled": true,
    "branch": null,                          // null = always commit on current HEAD; string = require this branch
    "messageFormat": "chore(roadmap): {ID} → {STATUS_VERB}",
    "includeNoteInBody": true,
    "addReferenceLine": true,
    "skipIfDirty": false                     // if true, refuse to commit when repo has other unstaged changes
  },

  // Branch policy — what to do if the user is on a branch where commits aren't safe.
  "branchPolicy": {
    "allowedBranches": null,                 // null = any | ["main", "develop"] = strict
    "warnIfDetached": true
  }
}
```

## Defaults aplicados ao adicionar um repo

Quando você clica "Add repo" e escolhe um path no Finder, o manager:

1. Detecta git (`<path>/.git/`). Se não, mostra erro "not a git repo" — abort.
2. Procura `roadmap-manager.repo.json` no root do repo. Se existir, importa como config base.
   (Esse arquivo é OPCIONAL — projetos podem checkar config no repo se quiserem versionar.)
3. Se não tem `.json`, aplica config default abaixo.
4. Faz primeira scan + import.
5. Mostra UI com config editável.

### Config default (heuristics)

```jsonc
{
  "templates": {
    "improvement": {
      "dir": "docs/improvements",
      "filePrefix": "imp",
      "idPrefix": "IMP",
      // ... (defaults idênticos ao spec acima)
    }
    // bug, refactoring, feature similares
  },
  "labels": {
    "whitelist": ["architecture", "performance", "correctness", "feature", "ui", "testing", "refactoring", "documentation", "bug"],
    "allowFreeForm": true,                   // mais permissivo no default
    "colors": { /* sane defaults */ }
  },
  "autoCommit": {
    "enabled": true,
    "branch": null,
    "messageFormat": "chore(roadmap): {ID} → {STATUS_VERB}",
    "includeNoteInBody": true,
    "addReferenceLine": true,
    "skipIfDirty": false
  },
  "branchPolicy": {
    "allowedBranches": null,
    "warnIfDetached": true
  }
}
```

Se o repo tem dirs convencionais (`docs/improvements/`), mantém os defaults. Se a estrutura
é exótica, usuário edita em Settings.

## Validation — Add repo flow

Quando o usuário cadastra um repo, manager valida:

1. **Path exists & is directory** — sim/não
2. **Is git repo** — `<path>/.git/` existe? Sim/não
3. **Template dirs exist** — para cada template configurado, `<path>/<template.dir>/` existe?
   Se não, mostra warning mas permite (manager cria o dir on-demand quando você criar o primeiro item).
4. **Items parseable** — scaneia todos os arquivos matchando `<dir>/<filePrefix>-*.md`.
   Cada um deve ter frontmatter YAML válido. Se algum falhar, mostra na lista
   "import errors" com o motivo. Manager importa só os válidos.
5. **External_id unique per type** — IMP-01 só pode aparecer uma vez no repo. Se duplicado,
   mostra erro e interrompe import.

## Substituições no `messageFormat`

| Token | Substituição | Exemplo |
|---|---|---|
| `{ID}` | external_id | `IMP-16` |
| `{TITLE}` | item.title | `aiFogs não persiste` |
| `{TYPE}` | item.type | `improvement` |
| `{STATUS}` | full status string | `✅ resolvido` |
| `{STATUS_VERB}` | verb form | `created` / `started` / `resolvido` / `cancelado` |
| `{DATE}` | YYYY-MM-DD | `2026-04-29` |
| `{REPO}` | repo.name | `civ-web` |

Padrões recomendados:

```
chore(roadmap): {ID} → {STATUS_VERB}
chore(roadmap/{REPO}): {ID} created via agent
chore(roadmap): close {ID} (✅ resolvido)
```

## Override per-repo via `roadmap-manager.repo.json`

Repos podem optar por versionar seu config (útil pra projetos colaborativos):

```sh
# In repo root:
echo '{"templates":{"improvement":{...}}, "labels":{...}}' > roadmap-manager.repo.json
```

Manager lê esse arquivo no add-repo e merge com defaults. **Não** é re-lido automaticamente
em runtime — usuário precisa clicar "Reload config" em Settings (evita conflitos com edição UI).

## Editing config via UI

Settings → Repos → [click repo] → 4 tabs:

1. **General** — name, path (read-only)
2. **Templates** — table com adicionar/editar/remover templates. Cada template tem form com todos os fields acima.
3. **Labels** — chips list editável + color picker. Toggle `allowFreeForm`.
4. **Auto-commit** — toggle enabled, message format input com preview, branch policy.

Salvar config gera um diff visual ("isso vai mudar X items" — preview), aplica imediatamente.
Se houver pending agent runs, espera concluírem antes de aplicar.
