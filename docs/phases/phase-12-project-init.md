---
id: PHASE-12
title: Inicialização de projeto — CLAUDE.md, cursor rules, roadmap/template.md
type: spec
description: Comando "Initialize Project" que cria CLAUDE.md, .cursor/rules/roadmap.mdc e roadmap/template.md no repo gerenciado, ensinando IAs e devs a usar o roadmap-manager corretamente. Configurável via Settings e executável no momento de adição do repo.
status: 📋 todo
created-date: 2026-04-29
depends-on: []
---

# Phase 12 — Inicialização de Projeto

## Objetivo

Quando o usuário adiciona um projeto ao roadmap-manager, o app pode (opcionalmente)
criar um conjunto de arquivos de scaffolding que ensinam **Claude Code, Cursor e
outros IAs** a usar o roadmap-manager corretamente dentro daquele projeto:

1. **`CLAUDE.md`** (raiz do repo) — instruções para Claude Code sobre como
   criar, editar e referenciar items do roadmap, com base na configuração real
   do projeto (templates, prefixos, campos obrigatórios).

2. **`.cursor/rules/roadmap.mdc`** — mesmo conteúdo adaptado ao formato MDC do
   Cursor, como rule ativa para todos os arquivos.

3. **`roadmap/template.md`** (ou `docs/template.md`, dependendo do dir base dos
   templates) — documento de referência que serve como modelo para roadmap items
   criados manualmente. Usado pelo scanner como fallback visual; IAs usam como
   referência de formato.

**Invariante:** nenhum arquivo existente é sobrescrito sem confirmação explícita.
O comando é idempotente — re-executar mostra o diff mas não apaga conteúdo.

---

## Por que isso importa

Hoje, um desenvolvedor que adiciona `simulation-engine` ao roadmap-manager e
depois pede ao Claude Code para "criar um item de roadmap para esse bug" recebe
um arquivo com formato arbitrário que o scanner não consegue parsear.

Com a inicialização, o Claude Code vê no `CLAUDE.md` do projeto:

- Os tipos de items existentes (`improvement`, `bug`, `feature`)
- Os prefixos corretos (`IMP-01`, `BUG-23`)
- Os campos obrigatórios e opcionais do frontmatter
- Os valores válidos de status e prioridade
- O diretório correto para cada tipo
- Como referenciar deps (`depends-on: [IMP-01]`)
- Que o roadmap-manager gerencia os IDs (não criar manualmente)

Isso transforma o workflow em: **usuário descreve o problema → Claude cria o
arquivo correto → roadmap-manager scanneia e importa automaticamente**.

---

## Arquivos gerados

### 1. `CLAUDE.md`

Gerado a partir da `RepoConfig` do projeto (lida do DB). Conteúdo dinâmico:

```markdown
# Roadmap Manager — Instruções para Claude Code

Este projeto usa **roadmap-manager** para rastrear items de trabalho como arquivos
Markdown com frontmatter estruturado.

## Como criar um item de roadmap

Nunca crie IDs manualmente. Use o roadmap-manager para criar items via UI ou
peça ao usuário para criar via app. Se precisar criar um arquivo manualmente
como rascunho, use `id: DRAFT` no frontmatter — o app atribuirá o ID correto.

## Tipos de items e onde ficam

| Tipo          | Diretório             | Prefixo  | Arquivo exemplo          |
|---------------|-----------------------|----------|--------------------------|
| improvement   | docs/improvements/    | IMP      | docs/improvements/imp-01-slug.md |
| bug           | docs/bugs/            | BUG      | docs/bugs/bug-01-slug.md |
| feature       | docs/features/        | FEAT     | docs/features/feat-01-slug.md |

(tabela gerada dinamicamente a partir dos templates configurados)

## Frontmatter obrigatório

Todo item de roadmap deve ter:

```yaml
---
id: IMP-01
title: Título curto descritivo
type: improvement
status: ⬜ pendente
---
```

## Campos opcionais

```yaml
priority: Alta          # Urgente | Alta | Média | Baixa | Nenhuma
labels: [bug, engine]   # qualquer label string
created-date: 2026-04-29
started-date: 2026-04-30
completed-date: 2026-05-01
depends-on: [IMP-05, BUG-02]   # IDs de items que devem ser concluídos antes
relates-to: [FEAT-03]
duplicate-of: IMP-07
```

## Status válidos

| Status         | Frontmatter string   |
|----------------|----------------------|
| Backlog        | `⬜ pendente`         |
| Todo           | `📋 planejado`       |
| In Progress    | `🔄 em andamento`    |
| Done           | `✅ concluído`       |
| Canceled       | `❌ cancelado`       |
| Duplicate      | `🔁 duplicado`       |

## Corpo do item

Use o template abaixo como ponto de partida (veja `roadmap/template.md`).
Cada tipo tem seu corpo padrão — consulte os arquivos existentes como referência.

## Dependências entre items

Use `depends-on:` com IDs externos (e.g. `IMP-01`), não UUIDs. O campo indica
pré-requisitos — items que devem estar `done` para este poder começar.

## Não fazer

- Não edite o `ROADMAP.md` na raiz — ele é auto-gerado pelo roadmap-manager
- Não renomeie arquivos de items — o scanner usa o caminho para identidade
- Não altere o campo `id:` no frontmatter — o app controla isso
- Não crie arquivos fora dos diretórios configurados esperando que sejam scanned
```

### 2. `.cursor/rules/roadmap.mdc`

Formato MDC (Cursor rules):

```markdown
---
description: Instruções para criar e editar items do roadmap usando roadmap-manager
globs: ["docs/**/*.md", "roadmap/**/*.md"]
alwaysApply: false
---

# Roadmap Manager — Cursor Rules

(mesmo conteúdo do CLAUDE.md, adaptado ao tom do Cursor)

Ao criar ou editar items de roadmap neste projeto:
1. Siga o frontmatter exato descrito abaixo
2. Use os diretórios corretos para cada tipo
3. Nunca crie IDs manualmente

(conteúdo gerado dinamicamente igual ao CLAUDE.md)
```

### 3. `roadmap/template.md`

Template de referência para items criados manualmente (não pelo sistema):

```markdown
---
id: TEMPLATE
title: Template de referência — não scanneado
type: improvement
priority: Média
status: ⬜ pendente
labels: []
created-date: YYYY-MM-DD
depends-on: []
---

# {ID} — {TITLE}

## Contexto

Descreva aqui **por que** este item existe. Qual problema resolve? Qual oportunidade
captura? Uma ou duas frases que um novo colaborador entende sem contexto adicional.

## Descrição

Detalhe técnico do que será feito. Pode incluir:
- Arquivos/módulos afetados
- API pública que muda
- Abordagem de implementação preferida

## Critérios de aceitação

- [ ] Critério mensurável 1
- [ ] Critério mensurável 2
- [ ] Testes cobrem os casos principais

## Notas técnicas (opcional)

Constraints, decisões de design, alternativas descartadas.

## Resolução (preencher ao concluir)

Descreva o que foi implementado e links para PRs/commits relevantes.
```

---

## Arquitetura de implementação

### Rust: novo módulo `src-tauri/src/init/mod.rs`

```rust
pub struct InitOptions {
    pub create_claude_md: bool,
    pub create_cursor_rules: bool,
    pub create_template_md: bool,
    pub overwrite_existing: bool,
}

pub struct InitResult {
    pub created: Vec<String>,   // caminhos relativos criados
    pub skipped: Vec<String>,   // caminhos que já existiam (overwrite=false)
    pub errors: Vec<String>,
}

pub async fn initialize_project(
    pool: &SqlitePool,
    repo_id: &str,
    options: InitOptions,
) -> AppResult<InitResult>
```

**Lógica de geração do CLAUDE.md:**

```rust
fn generate_claude_md(repo_name: &str, config: &RepoConfig) -> String {
    // 1. Header fixo
    // 2. Tabela de tipos/dirs/prefixos gerada a partir de config.templates
    // 3. Frontmatter obrigatório = union dos required_fields de todos os templates
    // 4. Campos opcionais = todos os frontmatter_fields menos required_fields
    // 5. Tabela de status válidos (hardcoded — mesmos do normalize_status)
    // 6. Body template do tipo mais comum (ou o primeiro template)
    // 7. Seção "Não fazer" hardcoded
}
```

**Lógica de geração do cursor rules:**

```rust
fn generate_cursor_rules(repo_name: &str, config: &RepoConfig) -> String {
    let body = generate_claude_md(repo_name, config);
    // Wrap com frontmatter MDC
    format!(
        "---\ndescription: Roadmap items — {}\nglobs: [{}]\nalwaysApply: false\n---\n\n{}",
        repo_name,
        globs_from_config(config),
        body
    )
}
```

**Lógica do template.md:**

Template é estático (estrutura de exemplo) mas o bloco de frontmatter mostra os
campos reais do projeto extraídos do `RepoConfig`. Seção de corpo usa o
`body_template` do tipo principal do projeto.

### IPC: novo comando

```rust
// src-tauri/src/ipc/repos.rs — adicionar:
#[tauri::command]
pub async fn initialize_project(
    pool: State<'_, SqlitePool>,
    repo_id: String,
    create_claude_md: bool,
    create_cursor_rules: bool,
    create_template_md: bool,
    overwrite_existing: bool,
) -> Result<InitResult, String>
```

### Frontend: hook `useInitProject`

```typescript
// src/hooks/useRepos.ts — adicionar:
export function useInitProject() {
  return useMutation({
    mutationFn: (params: {
      repoId: string;
      createClaudeMd: boolean;
      createCursorRules: boolean;
      createTemplateMd: boolean;
      overwriteExisting: boolean;
    }) => api.initializeProject(params),
  });
}
```

### Settings Modal: nova seção "Project Setup"

Nova entrada em `SECTIONS`:

```typescript
const SECTIONS = [
  { id: "app",       label: "App" },      // (Phase 11, idioma)
  { id: "general",   label: "General" },
  { id: "next-up",   label: "Next Up" },
  { id: "setup",     label: "Project Setup" },
  { id: "danger",    label: "Danger zone" },
] as const;
```

**`ProjectSetupSection`** — UI com:

1. **Status atual** — para cada arquivo, mostra se existe e quando foi modificado:

```
┌─────────────────────────────────────────────────────────┐
│  CLAUDE.md              ✓ exists  (modified 2026-04-29) │
│  .cursor/rules/roadmap  ✗ missing                       │
│  roadmap/template.md    ✓ exists  (modified 2026-04-28) │
└─────────────────────────────────────────────────────────┘
```

2. **Checkboxes** — quais arquivos criar/recriar:
   - `☑ CLAUDE.md`
   - `☑ Cursor rules (.cursor/rules/roadmap.mdc)`
   - `☑ Template (roadmap/template.md)`
   - `☐ Overwrite existing files`

3. **Botão "Initialize"** — chama `useInitProject`, mostra resultado:
   ```
   ✓ Created: CLAUDE.md
   ✓ Created: .cursor/rules/roadmap.mdc
   – Skipped: roadmap/template.md (already exists)
   ```

4. **Preview** — accordion "Preview CLAUDE.md" que mostra o conteúdo que seria
   gerado antes de confirmar. Útil para o usuário verificar se está correto.

### Integração no fluxo de adição de repo

Em `AddRepoDialog.tsx`, após o submit bem-sucedido, mostrar um segundo passo:

```
✓ Added simulation-engine — 254 items imported

Initialize project files?
☑ CLAUDE.md
☑ Cursor rules
☑ roadmap/template.md

[Skip]  [Initialize]
```

Isso torna a feature visível sem ser obrigatória. O usuário pode sempre fazer
depois via Settings → Project Setup.

---

## Casos de borda e invariantes

### Arquivo já existe, overwrite=false

Comportamento: skippar silenciosamente, listar no `InitResult.skipped`.
UI: mostra aviso amarelo com nome do arquivo, sugere "overwrite" checkbox.

### Arquivo já existe, overwrite=true

Comportamento: regenerar conteúdo inteiramente a partir da config atual.
Risco: usuário pode ter editado manualmente. Mostrar warning no UI:
"Overwriting will replace any manual edits."

### Config do repo mudou desde última init

O CLAUDE.md fica desatualizado se o usuário adicionar novos tipos de template.
Solução: botão "Refresh" na seção de setup que mostra diff entre atual e gerado.
(Implementação futura — fora de escopo desta phase, documentar como gap.)

### Repo sem `roadmap/` directory

O `roadmap/template.md` criará o diretório se não existir. O scanner não reclama
de arquivos fora dos dirs de template — `template.md` não tem frontmatter válido
de item, então é ignorado pelo scan.

### Múltiplos tipos de template

O CLAUDE.md mostra todos os tipos configurados em tabela. Cada tipo tem seu
próprio bloco de campos obrigatórios somente se diferirem. Se todos usam os
mesmos campos obrigatórios, uma única seção comum.

### Projeto sem `.git`

O roadmap-manager já exige `.git` no add_repo. Não há caso onde o init roda
sem git presente.

### `.cursor/rules/` directory não existe

Criar recursivamente com `tokio::fs::create_dir_all`.

---

## Template do `roadmap/template.md` — variação por tipo

Se o projeto tem múltiplos tipos, o `template.md` pode ter seções por tipo:

```markdown
# Roadmap Template Reference

> Este arquivo não é scaneado pelo roadmap-manager. É uma referência para
> criar items manualmente ou via IA.

---

## Improvement (IMP-XX)

\`\`\`yaml
---
id: IMP-01
title: ...
type: improvement
...
\`\`\`

**Corpo padrão:** (body_template do tipo improvement)

---

## Bug (BUG-XX)

\`\`\`yaml
---
id: BUG-01
...
\`\`\`

**Corpo padrão:** (body_template do tipo bug)
```

---

## Arquivo `api.initializeProject` em `src/lib/tauri.ts`

```typescript
initializeProject: (params: {
  repoId: string;
  createClaudeMd: boolean;
  createCursorRules: boolean;
  createTemplateMd: boolean;
  overwriteExisting: boolean;
}) => invoke<InitResult>("initialize_project", {
  repoId: params.repoId,
  createClaudeMd: params.createClaudeMd,
  createCursorRules: params.createCursorRules,
  createTemplateMd: params.createTemplateMd,
  overwriteExisting: params.overwriteExisting,
}),
```

E o tipo `InitResult` em `src/types/index.ts`:

```typescript
export interface InitResult {
  created: string[];   // relative paths
  skipped: string[];
  errors: string[];
}
```

---

## Testes e critérios de aceitação

- [ ] `initialize_project` cria `CLAUDE.md` na raiz do repo com a tabela correta
      de tipos/dirs/prefixos baseada na `RepoConfig` real
- [ ] `initialize_project` cria `.cursor/rules/roadmap.mdc` com frontmatter MDC
      válido e o mesmo conteúdo principal do CLAUDE.md
- [ ] `initialize_project` cria `roadmap/template.md` com exemplo de frontmatter
      usando os campos reais do projeto
- [ ] Arquivos existentes **não são sobrescritos** com `overwrite=false`
- [ ] Arquivos existentes **são sobrescritos** com `overwrite=true`
- [ ] Reexecutar com todos os arquivos já presentes e `overwrite=false` retorna
      `created: []`, `skipped: [3 paths]`, `errors: []`
- [ ] Settings → Project Setup mostra status correto (exists/missing) para cada arquivo
- [ ] Preview accordion mostra o conteúdo gerado antes de criar
- [ ] Fluxo de add_repo oferece init step após importação bem-sucedida
- [ ] CLAUDE.md gerado contém todos os tipos de template configurados no projeto
- [ ] Scanner não importa `roadmap/template.md` como item (sem id válido no frontmatter)
- [ ] `tsc --noEmit` sem erros após implementação completa
- [ ] Rust: `cargo test -p roadmap-manager-lib init` passa com testes de geração
      de conteúdo para config padrão e configs customizadas

---

## Estimativa de esforço

| Componente                              | Esforço estimado |
|-----------------------------------------|------------------|
| Rust: módulo `init/mod.rs` + geração    | ~3h              |
| Rust: IPC command + registro em lib.rs  | ~30min           |
| Frontend: `useInitProject` hook + api   | ~30min           |
| Frontend: `ProjectSetupSection`         | ~2h              |
| Frontend: preview accordion             | ~1h              |
| Frontend: add_repo init step            | ~1h              |
| Tipos TS + plumbing                     | ~30min           |
| Testes Rust de geração de conteúdo      | ~1h              |
| **Total**                               | **~9–10h**       |
