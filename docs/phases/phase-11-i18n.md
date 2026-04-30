---
id: PHASE-11
title: Internacionalização (i18n) — pt-BR, en, seleção via Settings
type: spec
description: Adicionar suporte completo a múltiplos idiomas (en padrão, pt-BR) em toda a UI do app, com seletor nos Settings globais, preservando o formato on-disk dos arquivos do usuário.
status: 📋 todo
created-date: 2026-04-29
depends-on: []
---

# Phase 11 — Internacionalização (i18n)

## Objetivo

Traduzir toda a interface do app para inglês (padrão) e português brasileiro, com
troca de idioma configurável nos Settings globais. O usuário deve conseguir usar o
app completamente em inglês ou pt-BR sem reiniciar.

**Invariantes obrigatórios:**
- O formato dos arquivos `.md` no disco (frontmatter, status strings, priority
  strings) **não muda** — a tradução é puramente display.
- Valores de prioridade no DB ("Urgente/Alta/Média/Baixa/Nenhuma") permanecem
  como chave interna; a UI os exibe no idioma selecionado.
- Status no DB ("todo/backlog/in_progress/done/canceled/duplicate") são chaves
  neutras; permanecem inalterados.
- Erros vindos do Rust ficam em inglês nesta fase — tratamento avançado de erros
  localizados é escopo de uma phase futura.

---

## Inventário de strings por componente

### Prioridades (mapeamento de chave → display)

| Chave (DB/file) | EN         | PT-BR    |
|-----------------|------------|----------|
| `Urgente`       | Urgent     | Urgente  |
| `Alta`          | High       | Alta     |
| `Média`         | Medium     | Média    |
| `Baixa`         | Low        | Baixa    |
| `Nenhuma`       | None       | Nenhuma  |

### Status (mapeamento de chave → display)

| Chave (DB)     | EN          | PT-BR       |
|----------------|-------------|-------------|
| `in_progress`  | In Progress | Em andamento|
| `todo`         | Todo        | A fazer     |
| `backlog`      | Backlog     | Backlog     |
| `done`         | Done        | Concluído   |
| `canceled`     | Canceled    | Cancelado   |
| `duplicate`    | Duplicate   | Duplicado   |

### Componentes com strings hardcoded a migrar

| Componente                              | Strings principais                                                             |
|-----------------------------------------|--------------------------------------------------------------------------------|
| `Sidebar.tsx`                           | Next Up, Roadmap, All items, Sub-roadmaps, New item, Search..., ⌘N, ⌘K       |
| `NextView.tsx`                          | Next Up, Ready to start, Blocked, Scope, Type, Impact first, Clear filters, No items match... |
| `SettingsModal.tsx`                     | Settings, General, Next Up, Danger zone, Name, Color, Path, Last scan, Rescan now, Save changes, Scope weights, Label weights, Remove project, No project selected, Default ×1, Add, Pick a scope/label |
| `AppShell.tsx`                          | (toolbar labels — depende de outros componentes)                               |
| `KanbanBoard.tsx`                       | Column headers (status display), drag hints                                    |
| `ItemView.tsx`                          | Field labels (Priority, Status, Type, Labels, Scope, Created, Depends on, etc.) |
| `NewItemView.tsx` / `NewItemModal.tsx`  | New item, Title, Type, Priority, Save, Cancel                                  |
| `ItemList.tsx`                          | Column headers, empty state                                                    |
| `FilterBar.tsx` / `FilterPanel.tsx`     | Filter labels, All, Clear                                                      |
| `AddRepoDialog.tsx`                     | Add Repository, Path, Name, Add & Scan, Not a git repository                   |
| `ValidationPanel.tsx`                   | Validate, Fix, results labels                                                  |
| `CommandPalette.tsx`                    | Search placeholder, section headers                                            |
| `InboxModal.tsx`                        | Inbox, Mark as read, etc.                                                      |
| `WelcomeWizard.tsx`                     | Onboarding texts                                                               |
| `ProjectRail.tsx`                       | Tooltips (Settings ⌘,, etc.)                                                  |
| `RoadmapView.tsx`                       | Roadmap, Regenerate, etc.                                                      |
| `ImpactView.tsx`                        | Impact Ranking headers                                                         |
| Toasts (`sonner`)                       | Saved, Rescanned, Project removed, Failed, etc.                                |

---

## Decisões técnicas

### Biblioteca: `i18next` + `react-i18next`

**Por quê:** Padrão de mercado, tree-shakeable, suporte a pluralização, interpolação,
namespace splitting, detecção de idioma, e integração direta com React via hook
`useTranslation()`. Alternativas (`lingui`, `formatjs`) são mais pesadas ou
requerem toolchain de build.

```
pnpm add i18next react-i18next
```

Não usar `i18next-browser-languagedetector` — o idioma vem dos prefs do usuário,
não do navegador.

### Estrutura de arquivos

```
src/
  locales/
    en/
      common.json        ← labels gerais, botões, status, priority
      settings.json      ← Settings modal
      items.json         ← item fields, kanban, list
      validation.json    ← mensagens de validação
      next.json          ← Next Up view
      roadmap.json       ← Roadmap view
    pt-BR/
      common.json
      settings.json
      items.json
      validation.json
      next.json
      roadmap.json
  i18n.ts               ← init do i18next
```

Usar namespaces em vez de um arquivo único para evitar bundle único enorme e
facilitar lazy loading futuro.

### Inicialização (`src/i18n.ts`)

```typescript
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
// imports estáticos dos JSONs — bundle único, sem fetch em runtime
import enCommon from "./locales/en/common.json";
// ...

i18n.use(initReactI18next).init({
  lng: "en",          // default; sobrescrito por useGlobalPrefs() no App.tsx
  fallbackLng: "en",
  ns: ["common", "settings", "items", "validation", "next", "roadmap"],
  defaultNS: "common",
  resources: { en: { common: enCommon, ... }, "pt-BR": { ... } },
  interpolation: { escapeValue: false },
});

export default i18n;
```

### Preferência global de idioma

A preferência de idioma **não é por repo** — é global do app. Adicionar a
`usePrefs.ts`:

```typescript
interface GlobalPrefs {
  language: "en" | "pt-BR";
}

export function useLanguage() {
  // Lê/escreve em STORAGE_KEY (global, não por repo)
  // Chama i18n.changeLanguage(lang) ao salvar
}
```

### Troca em runtime

`i18n.changeLanguage("pt-BR")` é síncrono para recursos já carregados
(bundle estático). Toda a UI react re-renderiza automaticamente via
react-i18next context. Sem necessidade de restart.

---

## Fases de implementação

### Fase A — Scaffold (sem UI de idioma ainda)

1. Instalar `i18next react-i18next`
2. Criar `src/i18n.ts` com init em `"en"`
3. Importar `src/i18n.ts` em `src/main.tsx` (antes do `<App />`)
4. Criar `src/locales/en/common.json` com **todas** as chaves EN
5. Criar `src/locales/pt-BR/common.json` com tradução PT-BR
6. Criar namespaces restantes (`settings`, `items`, `validation`, `next`, `roadmap`)
7. Smoke test: `i18n.t("common:save")` retorna `"Save"` em EN, `"Salvar"` em PT-BR

### Fase B — Migração de componentes

Para cada componente na lista de inventário acima:

1. Adicionar `const { t } = useTranslation("namespace")` ou usar namespace
   `common` com prefixo
2. Substituir cada string literal pelo `t("chave")`
3. Strings com interpolação: `t("items:unblocks", { count: s.unblocks })` →
   `"Unblocks {{count}} item"` / `"Unblocks {{count}} items"` (pluralização)
4. Toasts: `toast.success(t("common:saved"))` etc.
5. Commits em batches por componente para revisão fácil

**Ordem recomendada** (do mais visível ao menos):
1. `common.json` — status, priority, botões universais (Save, Cancel, Add, Remove)
2. `Sidebar.tsx` + `AppShell.tsx`
3. `NextView.tsx`
4. `SettingsModal.tsx`
5. `ItemView.tsx` + `ItemList.tsx` + `KanbanBoard.tsx`
6. Modals (`AddRepoDialog`, `NewItemModal`, etc.)
7. `ValidationPanel.tsx`, `RoadmapView.tsx`, `ImpactView.tsx`
8. `WelcomeWizard.tsx`, `CommandPalette.tsx`, `InboxModal.tsx`

### Fase C — Seletor de idioma no Settings

**Localização:** nova seção "App" no `SettingsModal` (antes de "General"), ou
adicionar pill de idioma ao header do modal.

Design: dois botões tipo radio pill — `EN` e `PT-BR`.

```tsx
// Settings modal — nova seção global (não por repo)
function AppSection() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">{t("settings:app")}</h2>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("settings:language")}</p>
        <div className="flex gap-2">
          {(["en", "pt-BR"] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setLanguage(lang)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs border transition-colors",
                language === lang
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              {lang === "en" ? "English" : "Português (BR)"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**SECTIONS** no modal passa de `["general", "next-up", "danger"]` para
`["app", "general", "next-up", "danger"]`.

### Fase D — Sincronização com i18n

Em `App.tsx` (ou no hook `useLanguage`), ao inicializar:

```typescript
useEffect(() => {
  i18n.changeLanguage(language);
}, [language]);
```

E ao salvar preferência:
```typescript
const setLanguage = (lang: "en" | "pt-BR") => {
  i18n.changeLanguage(lang);
  // persist no localStorage
};
```

### Fase E — Priority display helper

Criar `src/lib/i18n-helpers.ts`:

```typescript
export function displayPriority(raw: string | null, t: TFunction): string {
  // Mapeia "Urgente"→t("items:priority.urgent"), etc.
  const map: Record<string, string> = {
    Urgente: t("items:priority.urgent"),
    Alta: t("items:priority.high"),
    Média: t("items:priority.medium"),
    Baixa: t("items:priority.low"),
    Nenhuma: t("items:priority.none"),
  };
  return map[raw ?? "Nenhuma"] ?? raw ?? t("items:priority.none");
}

export function displayStatus(raw: string, t: TFunction): string {
  const map: Record<string, string> = {
    in_progress: t("items:status.in_progress"),
    todo: t("items:status.todo"),
    backlog: t("items:status.backlog"),
    done: t("items:status.done"),
    canceled: t("items:status.canceled"),
    duplicate: t("items:status.duplicate"),
  };
  return map[raw] ?? raw;
}
```

Todos os lugares que hoje fazem display de priority/status chamam esses helpers.

---

## Estrutura das chaves de tradução

### `common.json` (EN)

```json
{
  "save": "Save",
  "cancel": "Cancel",
  "add": "Add",
  "remove": "Remove",
  "edit": "Edit",
  "delete": "Delete",
  "close": "Close",
  "search": "Search...",
  "loading": "Loading...",
  "noResults": "No results",
  "clearFilters": "Clear filters",
  "newItem": "New item",
  "all": "All",
  "saved": "Saved",
  "failed": "Failed: {{message}}",
  "confirm": "Confirm"
}
```

### `items.json` (EN)

```json
{
  "priority": {
    "urgent": "Urgent",
    "high": "High",
    "medium": "Medium",
    "low": "Low",
    "none": "None"
  },
  "status": {
    "in_progress": "In Progress",
    "todo": "Todo",
    "backlog": "Backlog",
    "done": "Done",
    "canceled": "Canceled",
    "duplicate": "Duplicate"
  },
  "fields": {
    "title": "Title",
    "type": "Type",
    "priority": "Priority",
    "status": "Status",
    "labels": "Labels",
    "scope": "Scope",
    "created": "Created",
    "started": "Started",
    "completed": "Completed",
    "dependsOn": "Depends on",
    "relatesTo": "Relates to",
    "duplicateOf": "Duplicate of"
  },
  "unblocks_one": "Unblocks {{count}} item",
  "unblocks_other": "Unblocks {{count}} items"
}
```

### `next.json` (EN)

```json
{
  "title": "Next Up",
  "readyCount": "{{count}} ready · {{blocked}} blocked",
  "readySection": "Ready to start",
  "blockedSection": "Blocked",
  "impactFirst": "Impact first",
  "clearFilters": "Clear filters",
  "noItemsMatch": "No items match the current filters.",
  "noItems": "No todo or backlog items found.",
  "blockedBy": "blocked by {{ids}}",
  "noDepsHint": "No item has dependents — add <code>depends-on:</code> to frontmatter to see impact ranking.",
  "scopeFilter": "Scope",
  "typeFilter": "Type"
}
```

### `settings.json` (EN)

```json
{
  "title": "Settings",
  "sections": {
    "app": "App",
    "general": "General",
    "nextUp": "Next Up",
    "danger": "Danger zone"
  },
  "language": "Language",
  "name": "Name",
  "color": "Color",
  "repository": "Repository",
  "path": "Path",
  "lastScan": "Last scan",
  "never": "Never",
  "rescanNow": "Rescan now",
  "rescanned": "Rescanned: +{{added}} ~{{updated}} -{{removed}}",
  "saveChanges": "Save changes",
  "noProject": "No project selected.",
  "scopeWeights": {
    "title": "Scope weights",
    "description": "Multiplies all items in a scope. Default ×1.",
    "none": "No scope weights configured.",
    "pickScope": "Pick a scope…",
    "typeScope": "Type a scope path…"
  },
  "labelWeights": {
    "title": "Label weights",
    "description": "Product of matched label multipliers. Default ×1.",
    "none": "No label weights configured.",
    "pickLabel": "Pick a label…",
    "typeLabel": "Type a label name…"
  },
  "danger": {
    "removeTitle": "Remove project",
    "removeDescription": "Removes the project from Roadmap Manager. Files are not deleted.",
    "removeButton": "Remove",
    "removed": "Project removed"
  }
}
```

---

## Rust backend

O backend **não precisa de alterações** nesta phase:

- `normalize_priority` já aceita variantes pt e en (e.g. "media"/"medium")
- Status strings no DB são chaves neutras em inglês
- `extract_deps_from_body` já aceita "depende de" e "depends on"
- Mensagens de erro do Rust ficam em inglês — aceitável

Futuro (fora de escopo desta phase): sistema de localização de erros Rust com
`thiserror` + enum de códigos de erro que o frontend mapeia para strings i18n.

---

## Testes e critérios de aceitação

- [ ] Todas as strings visíveis na UI aparecem em inglês com `language = "en"`
- [ ] Todas as strings visíveis na UI aparecem em pt-BR com `language = "pt-BR"`
- [ ] Trocar idioma nos Settings aplica instantaneamente, sem reload
- [ ] Preferência de idioma persiste entre sessões (localStorage)
- [ ] Prioridades mostram "Urgent/High/Medium/Low/None" em EN e "Urgente/Alta/Média/Baixa/Nenhuma" em PT-BR
- [ ] Status mostra "In Progress/Todo/Backlog/Done/Canceled/Duplicate" em EN
- [ ] Toasts de sucesso/erro mostram no idioma selecionado
- [ ] Nenhum texto hardcoded em inglês visível quando PT-BR selecionado
- [ ] Nenhuma chave de tradução faltando (sem `[common:missing_key]` na UI)
- [ ] `tsc --noEmit` sem erros após migração completa
- [ ] `i18n.changeLanguage()` não causa unmount/remount desnecessário de componentes

---

## Estimativa de esforço

| Fase                          | Esforço estimado |
|-------------------------------|------------------|
| A — Scaffold + arquivos JSON  | ~3h              |
| B — Migração de componentes   | ~6h              |
| C — Seletor no Settings       | ~1h              |
| D — Sync runtime              | ~30min           |
| E — Priority/Status helpers   | ~1h              |
| **Total**                     | **~11–12h**      |
