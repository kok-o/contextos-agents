# ContextOS — полный план модернизации

Статус документа: PLAN

Цель: перевести ContextOS из engineering preview в production-grade систему компиляции контекста и опционального безопасного runtime для AI-агентов.

Этот план покрывает все выводы двух архитектурных аудитов:

- продуктовая фокусировка и управление обещаниями;
- prompt/skill system и борьба с ceremony;
- canonical manifest-driven resolver;
- monorepo/workspace discovery;
- profiles;
- safe-writer, lockfile и recoverable file transactions;
- adapter compilation и drift;
- MCP lifecycle;
- verification/review;
- worktree, Git и merge concurrency;
- host execution и настоящий sandbox;
- secrets и plugin supply chain;
- Windows/Linux/macOS;
- onboarding и doctor;
- объективный Benchmark v2.

До завершения P0 и стабилизации kernel новые роли, фазы, profiles, adapters и domain skills следует заморозить.

---

## 1. Целевое состояние

ContextOS должен быть разделён на три логически независимых слоя.

~~~text
ContextOS Core
├── manifest compiler
├── canonical skill registry
├── context resolver
├── workspace detector
├── profiles
├── adapters
├── provenance / lockfile
└── doctor / migration / recovery

ContextOS Runtime
├── MCP interface
├── task orchestration
├── isolated execution
├── verification
├── independent review
├── Git integration
└── auditable merge

ContextOS Catalog
├── built-in skills
├── references
├── scripts
├── project overrides
└── third-party plugins
~~~

Итоговая формулировка продукта:

> ContextOS Core компилирует минимальный, объяснимый и воспроизводимый контекст для разных AI-инструментов. ContextOS Runtime опционально исполняет задачи в изолированном окружении и допускает merge только после проверок, относящихся к точному commit.

Нельзя обещать:

- что Markdown гарантирует качество кода;
- что Git worktree является OS-level security sandbox;
- что regex доказывает семантическую полноту реализации;
- что уменьшение Markdown payload равно уменьшению счёта провайдера;
- что ContextOS улучшает любую модель и любую задачу.

---

## 2. Приоритеты

### P0 — patch до крупного rewrite

1. getDiff() и getChangedFiles() не должны выполнять git add -A.
2. Заблокированный файл не должен попадать в commit через загрязнённый Git index.
3. Отсутствие verification или reviewer не должно превращаться в PASS.
4. Убрать двойной запуск verification.
5. Исправить async aggregation, проверяющий несуществующее поле success.
6. Разделить focus_files и write_scope.
7. Запретить implicit write scope ".".
8. Запретить auto-merge в host-unsafe режиме.
9. Убрать direct-write fallback из safe-writer.
10. Ошибки install/update/compile не должны проглатываться.
11. Исправить resolver-regressions: security, nextjs, react, nestjs, review phase.
12. Не удалять worktree/branch без подтверждённого ownership.

### P1 — архитектурный kernel

1. Versioned manifest schema.
2. Один resolver для CLI и MCP.
3. Транзитивный requires и runtime conflicts.
4. Workspace-aware monorepo detector.
5. Journaled recoverable file transactions.
6. Project-wide inter-process locks.
7. Pure adapter renderers.
8. Hash-based provenance и drift.
9. Runtime state machine и attestations.
10. Transactional integration branch.
11. Plugin pinning и full-tree integrity.
12. OCI execution sandbox.

### P2 — качество продукта и доказательства

1. Упростить роли и фазы.
2. Ввести prompt budgets.
3. Добавить project customization layer.
4. Переписать doctor.
5. Переписать onboarding.
6. Провести Benchmark v2.
7. Ввести claim governance.
8. Добавить privacy-safe telemetry, только opt-in.
9. Полностью dogfood-ить документационный model.

---

## 3. Реалистичная оценка

| Направление | Оценка |
|---|---:|
| Core/compiler/resolver/workspaces | 45–65 инженерных дней |
| Filesystem/transactions/adapters | 45–65 инженерных дней |
| MCP/runtime/Git/concurrency | 70–100 инженерных дней |
| Sandbox/security/plugins | 45–70 инженерных дней |
| Prompt/DX/docs | 35–55 инженерных дней |
| Benchmark harness/dataset/statistics | 55–85 инженерных дней |
| Stabilization/migrations | 25–40 инженерных дней |
| Всего | 320–480 инженерных дней |

Реалистичные сроки:

- P0 trust patch: 1–2 недели;
- стабильная Core beta: 8–12 недель;
- Runtime beta: 14–20 недель;
- полный ContextOS 2.0: 20–30 недель командой из четырёх senior-инженеров;
- solo implementation: примерно 14–22 месяца.

Рекомендуемая команда:

- Engineer A — schemas/compiler/resolver;
- Engineer B — filesystem/adapters/DX;
- Engineer C — MCP/Git/concurrency;
- Engineer D — sandbox/security/plugins;
- part-time QA/research — cross-platform и benchmark;
- независимый reviewer для experimental design.

---

## 4. Целевая архитектура

~~~text
Authoring Sources
SKILL.md + skill.yaml + profiles + project overrides
                         │
                         ▼
             Manifest Compiler
       parse → validate → normalize → hash
                         │
                         ▼
             Compiled Registry v2
       skills + dependencies + signals + resources
                         │
          ┌──────────────┴───────────────┐
          ▼                              ▼
 Workspace Evidence Graph        Resolution Request
 packages/configs/files          task/files/profile/budget
          │                              │
          └──────────────┬───────────────┘
                         ▼
                Canonical Resolver
 candidate scoring → dependency closure
 → conflicts → risk → budget → explanation
                         │
                         ▼
                  Context Plan IR
 selected skills + reasons + hashes + budget
                         │
          ┌──────────────┴───────────────┐
          ▼                              ▼
    Adapter Compiler               Runtime/MCP
 pure rendering                    isolated execution
          │                              │
          ▼                              ▼
 Journaled Artifact Tx       verification/review attestations
          │                              │
          ▼                              ▼
 IDE-native outputs         verified integration branch / merge
~~~

Рекомендуемая структура:

~~~text
packages/
  core/
    src/
      manifests/
      registry/
      resolver/
      workspace/
      profiles/
      policy/
      artifacts/
      filesystem/
      diagnostics/
    schemas/

  runtime/
    src/
      execution/
      verification/
      review/
      state/
      sandbox/
      git/
      security/

  benchmark/
    src/
      runner/
      providers/
      evaluators/
      analysis/

.agents/
  runtime/
    contextos-core.cjs
  compiled/
    registry.v2.json
    registry.v2.sha256
  vendor/
  project/
  generated/
  cache/
  state/
~~~

Canonical core можно писать на TypeScript и собирать в self-contained bundle. Root CLI при этом может сохранить пустой dependencies в package.json.

Корректная формулировка:

> Zero install-time runtime dependencies.

Некорректная формулировка:

> В продукте нет third-party code.

Если YAML parser, schema validator или glob implementation попадают в bundle, они должны быть отражены в SBOM.

---

## 5. Milestone 0 — freeze, ADR и characterization

Срок: 3–5 дней.

### 5.1. Заморозить расширение поверхности

До стабилизации resolver v2 запретить новые:

- roles;
- lifecycle phases;
- profiles;
- adapters;
- domain skills;
- маркетинговые claims.

Разрешить только:

- security fixes;
- correctness fixes;
- migration;
- tests;
- документацию ограничений.

### 5.2. Создать ADR

Нужны решения:

- ADR-001 — разделение Core, Runtime и Catalog;
- ADR-002 — canonical TypeScript core и bundled CLI;
- ADR-003 — zero install-time dependencies;
- ADR-004 — manifest schema v2;
- ADR-005 — resolver precedence и conflict policy;
- ADR-006 — recoverable transactions вместо ложной multi-file atomicity;
- ADR-007 — fail-closed verification/review;
- ADR-008 — Git isolation против OS sandbox;
- ADR-009 — vendor/project/generated ownership;
- ADR-010 — Benchmark v2 protocol.

### 5.3. Зафиксировать текущее поведение

Добавить characterization fixtures для:

- текущих resolver scenarios;
- всех adapter outputs;
- profiles;
- fresh install;
- safe update;
- modified managed file;
- unmanaged file;
- corrupt lockfile;
- Windows path с пробелами;
- mixed monorepo;
- MCP thread lifecycle.

### 5.4. Единый контракт ошибок

~~~json
{
  "code": "CTX_MANIFEST_UNKNOWN_DEPENDENCY",
  "severity": "error",
  "component": "manifest-compiler",
  "file": ".agents/core/skills/example/skill.yaml",
  "path": "/requires/0",
  "message": "Required skill typescript was not found",
  "remediation": "Install the skill or remove it from requires"
}
~~~

Exit codes:

~~~text
0 — success
1 — validation or operation failure
2 — invalid CLI usage
3 — conflict requiring user action
4 — repository/project busy
5 — recovery required
6 — policy denied
~~~

### Gate

- ADR утверждены;
- characterization snapshots сохранены;
- issue-to-epic mapping создан;
- JSON output отделён от human logging;
- новые skills временно не принимаются.

---

## 6. Milestone 1 — Trust Patch

Релизы:

- contextos-agents 1.7.1;
- contextos-mcp 0.3.1.

Срок: 1–2 недели.

### 6.1. Исправить staged-secret bypass

Проблемный путь находится в [manager.ts](/C:/Users/esenb/Desktop/my_geni/contextos-mcp/src/worktree/manager.ts:330) и [manager.ts](/C:/Users/esenb/Desktop/my_geni/contextos-mcp/src/worktree/manager.ts:409).

Сценарий дефекта:

~~~text
getDiff()
→ git add -A
→ .env попадает в index
→ getChangedFiles скрывает .env
→ commit пропускает .env при новом git add
→ git commit включает уже staged .env
~~~

Реализация:

1. Удалить git add -A из getDiff, getDiffStats, getChangedFiles.
2. Использовать только read-only Git commands.
3. Читать staged, unstaged, untracked и committed changes отдельно.
4. Использовать porcelain v2 с NUL separators.
5. При blocked path останавливать thread с SECURITY_POLICY_FAILED.
6. Создавать чистый temporary index через GIT_INDEX_FILE.
7. Добавлять в index только allowlisted paths.
8. Проверять exact staged inventory.
9. Сканировать содержимое перед commit.
10. Удалять temporary index в finally.

Тесты:

- staged .env до запуска commit;
- .env появляется после getDiff;
- rename allowed.ts → .env;
- symlink на внешний secret;
- agent-created commit содержит .env;
- filename с newline/Unicode;
- getDiff() не меняет git status;
- commit не включает paths вне expected set.

Acceptance:

- inspection API побочно не меняет Git index;
- blocked path физически не попадает в candidate commit;
- security violation всегда является terminal non-PASS outcome.

### 6.2. Fail-closed verification/review

Вместо fallback-to-PASS использовать:

~~~text
Verification:
NOT_CONFIGURED | NOT_APPLICABLE | PENDING | RUNNING
| PASS | FAIL | ERROR | TIMEOUT | CANCELLED | STALE

Review:
NOT_CONFIGURED | PENDING | RUNNING | PASS | FAIL
| ERROR | TIMEOUT | UNAVAILABLE | MALFORMED | STALE
~~~

Правила:

- отсутствие команды → NOT_CONFIGURED;
- documentation-only → NOT_APPLICABLE с причиной;
- отсутствующий executable → ERROR;
- timeout → TIMEOUT;
- reviewer unavailable → UNAVAILABLE;
- malformed JSON → MALFORMED;
- exception → ERROR;
- только реально выполненная проверка может дать PASS.

### 6.3. Убрать двойную verification

ThreadManager становится единственным владельцем:

~~~text
agent
→ inspect
→ candidate commit
→ verify
→ review
→ ready
~~~

MCP tool только создаёт task и читает state.

### 6.4. Исправить async aggregation

Родительский job успешен только если все обязательные children имеют terminal ready outcome.

~~~ts
type ThreadOutcome =
  | { kind: "ready"; threadId: string; headSha: string }
  | { kind: "blocked"; threadId: string; reasonCode: string }
  | { kind: "failed"; threadId: string; error: SanitizedError }
  | { kind: "cancelled"; threadId: string };
~~~

### 6.5. Разделить API scope

~~~json
{
  "focus_files": ["src/auth.ts"],
  "write_scope": {
    "allow": ["src/auth.ts", "tests/auth.test.ts"],
    "deny": [".env*", ".git/**"],
    "allow_repository_wide": false
  }
}
~~~

- focus_files используется только для context ranking;
- write_scope используется для enforcement;
- старое поле files временно преобразуется только в focus_files;
- отсутствие write scope для mutating task → execution denied;
- "." разрешён только при явном allow_repository_wide: true.

### 6.6. Host mode

До OCI sandbox:

- переименовать режим в host-unsafe;
- отключить auto-merge;
- не использовать слово sandbox;
- создавать ephemeral HOME;
- не использовать --dangerously-skip-permissions по умолчанию;
- фиксировать pre/post состояние primary checkout и refs;
- любое внешнее изменение блокирует результат;
- не выполнять автоматический rollback пользовательских файлов.

### 6.7. Ownership worktree

- ошибка записи ownership marker делает create неуспешным;
- marker содержит repository fingerprint, session ID, thread ID, branch, token и timestamp;
- corrupt/missing marker → manual recovery;
- нельзя force-delete неизвестный каталог;
- нельзя branch -D без ownership record;
- cleanup должен быть идемпотентным.

### 6.8. Safe-writer patch

В [safe-writer.js](/C:/Users/esenb/Desktop/my_geni/bin/lib/safe-writer.js:26) удалить direct-write fallback.

При rename failure:

- retry только для известных transient errors;
- bounded backoff;
- старый target оставить нетронутым;
- завершиться ошибкой, если replace невозможен;
- cleanup temp best-effort, но ошибка не скрывается.

### 6.9. Минимальный resolver patch

До resolver v2 добавить regression:

~~~text
react             → react + typescript
nextjs            → nextjs + react + typescript
nestjs            → nestjs + node + typescript
security review   → security + phase review
~~~

Не создавать третью копию selector logic. Использовать временный shared compiled JSON graph.

### Gate

- нет fallback-to-PASS;
- getDiff() read-only;
- staged secret не коммитится;
- host mode не auto-merges;
- safe-writer не делает direct write;
- compile/update failures имеют non-zero;
- критические resolver regression tests проходят.

---

## 7. Milestone 2 — Manifest Compiler и Registry v2

Срок: 3–5 недель.

### 7.1. SkillManifestV2

~~~yaml
schemaVersion: 2
id: nextjs
displayName: Next.js
version: 1.0.0
description: Next.js application architecture
type: instruction-only
category: frontend
entrypoint: SKILL.md

signals:
  aliases: [next, next.js, nextjs]
  keywords:
    - value: app router
      locale: en
      weight: 10
  fileGlobs:
    - value: "**/next.config.{js,mjs,ts}"
      weight: 15
  packages:
    - ecosystem: npm
      name: next
      weight: 15

dependencies:
  requires: [react, typescript]
  optional: [web-accessibility]
  conflicts: []

context:
  priority: 50
  estimatedTokens: 1200

resources:
  - path: references/app-router.md
    mode: on-demand
~~~

### 7.2. Schema rules

- additionalProperties: false;
- extensions только через x-*;
- unique IDs и aliases;
- entrypoint обязателен;
- resources перечисляются явно;
- absolute paths, .., NUL запрещены;
- symlink escape запрещён;
- frontmatter и manifest identity должны совпадать;
- unknown dependency — compile error;
- cycle — compile error;
- self-dependency — compile error;
- required conflict — compile error;
- missing resource — compile error;
- unsupported field — error или versioned warning.

### 7.3. CompiledRegistryV2

~~~json
{
  "schemaVersion": 2,
  "compilerVersion": "2.0.0",
  "sourceGraphHash": "sha256:...",
  "skills": {
    "nextjs": {
      "normalizedManifest": {},
      "entrypointHash": "sha256:...",
      "resourceTreeHash": "sha256:...",
      "estimatedTokens": 1134,
      "source": ".agents/vendor/contextos/skills/nextjs"
    }
  }
}
~~~

Runtime resolver читает только compiled registry.

### 7.4. Compiler tasks

1. Создать schemas для skill/profile/lockfile/registry/output.
2. Реализовать parser → normalized object.
3. Реализовать schema validation.
4. Проверить frontmatter parity.
5. Построить dependency graph.
6. Проверить cycles/conflicts.
7. Рассчитать source/resource hashes.
8. Рассчитать resource inventory.
9. Отсортировать registry детерминированно.
10. Сделать structured diagnostics.
11. Добавить SARIF output.
12. Мигрировать 39 встроенных manifests.
13. Добавить v1 compatibility reader.
14. Добавить contextos migrate manifests.
15. Запретить silent parsing failures.

### 7.5. Zero-dependency strategy

Рекомендуемый вариант:

- YAML остаётся authoring format;
- полноценный parser используется build-time;
- validator также входит в bundled runtime;
- опубликованный CLI не требует установки зависимостей;
- bundled dependencies отражаются в SBOM.

Альтернатива — перейти на skill.json. Она проще, но ухудшает authoring DX и создаёт migration cost.

### Тесты

- quoted #;
- multiline;
- empty lists;
- malformed nesting;
- anchors/aliases;
- duplicate IDs;
- invalid semver;
- dependency cycles;
- missing dependencies;
- resource traversal;
- symlink escape;
- frontmatter mismatch;
- deterministic registry;
- randomized DAG property tests.

### Acceptance

- все встроенные skills проходят schema;
- requires/conflicts являются runtime-данными;
- registry hash воспроизводим;
- критический путь не использует regex YAML parser;
- diagnostics содержат code/file/path/remediation.

---

## 8. Milestone 3 — единый manifest-driven resolver

Срок: 3–4 недели.

### 8.1. ResolutionRequest

~~~ts
interface ResolutionRequest {
  task: string;
  files: string[];
  explicitSkills?: string[];
  explicitPhase?: string;
  profile?: string;
  packageScope?: string[];
  contextBudgetTokens?: number;
}
~~~

### 8.2. ResolutionResult

~~~ts
interface ResolutionResult {
  registryFingerprint: string;
  workspaceFingerprint: string;

  phase: {
    value: string;
    source: "explicit" | "prompt" | "default";
  };

  risk: {
    value: "routine" | "standard" | "high" | "destructive";
    reasons: Evidence[];
  };

  selected: Array<{
    id: string;
    score: number;
    reasons: Evidence[];
    requiredBy: string[];
    estimatedTokens: number;
  }>;

  excluded: Array<{
    id: string;
    reasonCode: string;
    details: string;
  }>;

  conflicts: Conflict[];
  warnings: Diagnostic[];
  totalEstimatedTokens: number;
}
~~~

### 8.3. Алгоритм

#### Normalization

~~~text
explicit request
→ package-specific profile
→ active project profile
→ detected recommendation
→ default
~~~

#### Candidate evidence

Источники:

- explicit ID/alias;
- prompt keyword;
- trusted pattern;
- file glob;
- nearest package dependency;
- config file;
- profile required/preferred;
- phase;
- risk classification.

Каждый сигнал создаёт Evidence.

#### Стартовые веса

~~~text
explicit skill           100
exact alias               80
file glob                 70
nearest package           60
task keyword              40
profile required          mandatory
profile preferred         +15
ambient repo dependency   +5
~~~

#### Dependency closure

- добавить все requires транзитивно;
- выполнить topological sort;
- dependency нельзя выкинуть token budget;
- required + excluded → configuration error;
- cycle → compile error.

#### Conflict policy

1. explicit vs explicit → сообщить конфликт;
2. explicit vs inferred → explicit побеждает;
3. required vs excluded → invalid profile;
4. required vs required conflict → invalid registry;
5. inferred vs inferred → score, priority, lexical ID.

Молчаливое разрешение обязательных конфликтов запрещено.

#### Budget planner

Убрать hard cap «четыре domain skills».

Порядок:

1. base policy;
2. explicit skills;
3. dependency closure;
4. profile-required;
5. optional candidates по marginal utility.

Если required closure не помещается в budget:

- вернуть budget_exceeded;
- не обрезать dependency;
- сохранить hard constraints;
- показать исключённые skills и причины.

#### Explainability

~~~text
contextos resolve "security review Next.js auth" \
  --files apps/web/app/login/page.tsx \
  --explain
~~~

Пример объяснения:

~~~text
security    task phrase "security review"              +40
nextjs      nearest workspace package "next"             +60
react       required by nextjs
typescript  required by nextjs
testing     required by enterprise profile
ui-design   excluded: budget
~~~

### 8.4. Migration

1. Shadow mode: legacy и v2 resolver выполняются вместе.
2. Возвращать legacy result, но писать local diff diagnostics.
3. Собрать corpus расхождений.
4. Исправить необоснованные изменения.
5. Сделать v2 default с resolver=legacy.
6. Через один minor release удалить legacy.
7. MCP импортирует тот же core resolver.

### 8.5. Tests

- react → typescript;
- nextjs → react + typescript;
- nestjs → node + typescript;
- literal security;
- русский/английский prompt;
- review phase;
- explicit vs inferred;
- profile contradiction;
- cycle;
- tie determinism;
- unrelated package isolation;
- budget overflow;
- file hints;
- empty request;
- CLI/MCP parity.

### Acceptance

- в репозитории ровно один resolver implementation;
- CLI/MCP parity = 100% на golden corpus;
- каждый selected skill имеет reason;
- hard cap удалён;
- dependency graph runtime-driven;
- resolve --json versioned.

---

## 9. Milestone 4 — Workspace Evidence Graph

Срок: 2–4 недели.

Первую версию следует называть Workspace Evidence Graph, а не AST graph.

### 9.1. Модель

~~~ts
interface WorkspaceGraph {
  schemaVersion: 1;
  repositoryRoot: string;
  packages: Array<{
    id: string;
    root: string;
    ecosystem: "npm" | "python" | "rust" | "go" | "unknown";
    manifests: string[];
    dependencies: string[];
    configs: string[];
    languages: string[];
    internalDependencies: string[];
  }>;
  evidence: Evidence[];
  fingerprint: string;
  partial: boolean;
}
~~~

### 9.2. Поддерживаемые форматы

- npm/yarn workspaces;
- pnpm-workspace.yaml;
- Nx;
- Turborepo;
- Lerna;
- nested package.json;
- pyproject.toml;
- requirements*.txt;
- Pipfile;
- Cargo.toml;
- go.mod;
- mixed-language repository.

### 9.3. Tasks

1. Найти real repository root.
2. Разобрать workspace patterns.
3. Сделать bounded traversal.
4. Игнорировать .git, node_modules, generated, worktrees, build outputs.
5. Не следовать symlinks по умолчанию.
6. Связать файл с nearest package.
7. Построить internal dependency edges.
8. Хранить stack signals на package level.
9. Добавить incremental cache.
10. Инвалидировать cache по manifest hashes.
11. Ввести max depth/package count/timeout.
12. Возвращать partial: true при лимите.
13. Добавить detect --scope.
14. Добавить detect --explain.

Настоящий AST-import graph вынести в optional language indexers.

### 9.4. Cross-platform

- lockfile/output paths — POSIX relative;
- filesystem calls — native paths;
- case folding только для boundary checks;
- оригинальный case сохраняется;
- drive-qualified и UNC paths обрабатываются явно;
- junction считается symlink-like;
- не использовать path.toLowerCase() как canonical identity на Linux.

### 9.5. Tests

- npm workspace с разными стеками;
- pnpm wildcard;
- nested workspace;
- symlink loop;
- package outside root;
- malformed nested package;
- duplicate package names;
- ContextOS dogfooding;
- 500-package fixture;
- package-scoped skill selection;
- mixed JS/Python.

### Acceptance

- ContextOS видит contextos-mcp как вложенный package;
- файл apps/web не получает FastAPI signal из apps/api;
- scan не покидает realpath;
- partial scan имеет warning;
- warm/cold performance budget соблюдён.

---

## 10. Milestone 5 — Profiles v2

Срок: 1–2 недели.

### 10.1. Разделить поля

~~~yaml
skills:
  required: [security, testing]
  preferred: [system-design]
  excluded: []

policy:
  verification: required
  review: required
  security: required

generation:
  documents: [PRD, ARCHITECTURE, API]

technologyDefaults:
  database: postgres
  cache: redis
~~~

postgres, redis, jwt, sqlite не должны быть skill IDs, если соответствующих skills нет.

### 10.2. Tasks

- создать ProfileV2 schema;
- мигрировать существующие profiles;
- реализовать или удалить generate_docs, skip_docs, defaults;
- запретить fields без consumer;
- добавить required/recommended/off;
- валидировать required/excluded contradictions;
- добавить package overrides;
- profile apply обновляет весь profile state;
- после apply экспортирует все enabled adapters одной transaction;
- добавить --no-export;
- export --profile сделать ephemeral;
- сохранять source hash;
- добавить profile explain;
- определить единую auto-profile semantics.

### 10.3. Auto-profile

Рекомендуемая семантика:

- auto-detection default для init;
- confidence ≥0.80 → рекомендованный profile;
- confidence ниже → generic profile + warning;
- --profile имеет высший приоритет;
- --no-auto отключает detection;
- mixed monorepo получает root profile и package overrides.

### Acceptance

- все profile fields реально потребляются;
- нет фиктивных skill IDs;
- apply не оставляет stale outputs;
- profile policy не превращает prompt guidance в runtime enforcement;
- contradictions ловятся до записи файлов.

---

## 11. Milestone 6 — Safe paths, locks и transactions

Срок: 4–6 недель.

### 11.1. Safe path primitive

Создать одну функцию:

~~~ts
resolveManagedPath(projectRoot, relativePath)
~~~

Проверки:

- absolute path;
- drive-qualified path;
- UNC;
- NUL;
- empty path;
- ..;
- containment;
- realpath parent;
- symlink/junction escape;
- Windows device names;
- alternate data streams;
- case collisions.

Все installer, updater, plugin manager и adapters используют только её.

### 11.2. ProjectMutationLock

Путь:

~~~text
.agents/.contextos/locks/mutation.lock
~~~

Формат:

~~~json
{
  "token": "uuid",
  "pid": 1234,
  "processStartedAt": "...",
  "hostname": "...",
  "command": "export all",
  "projectFingerprint": "...",
  "acquiredAt": "..."
}
~~~

Правила:

- создавать через exclusive create;
- release только при совпадении token;
- PID не является достаточным identity;
- старый process не может удалить новый lock;
- busy state возвращает CTX_PROJECT_BUSY;
- --force-unlock — явная диагностическая команда;
- watcher удерживает lock только на одну compilation iteration.

### 11.3. Journaled transaction

Не обещать невозможную multi-file atomicity. Термин:

> journaled recoverable transaction

State machine:

~~~text
PLANNED
→ PREPARED
→ APPLYING
→ COMMITTED

APPLYING
→ ROLLING_BACK
→ ROLLED_BACK

crash
→ RECOVERY_REQUIRED
~~~

Item:

~~~json
{
  "operation": "replace",
  "path": ".cursor/rules/react.mdc",
  "expectedBeforeHash": "sha256:...",
  "afterHash": "sha256:...",
  "stagedPath": "...",
  "backupPath": "...",
  "modeBefore": 420,
  "modeAfter": 420
}
~~~

### 11.4. Commit protocol

1. Получить project lock.
2. Создать immutable plan.
3. Проверить path boundaries.
4. Зафиксировать current hashes.
5. Создать journal до первой записи.
6. Записать staged files на том же volume.
7. Выполнить fsync, где поддерживается.
8. Повторно проверить precondition hashes.
9. Заменять targets по одному.
10. Сохранять backups.
11. При ошибке rollback в обратном порядке.
12. Lockfile писать последним.
13. Пометить journal COMMITTED.
14. Удалить staging после подтверждения.
15. Освободить lock по owner token.

На Windows:

- retry для EPERM, EACCES, EBUSY;
- bounded backoff;
- target → backup;
- staged → target;
- failed second rename → restore backup;
- direct-write fallback запрещён.

### 11.5. LockfileV2

~~~json
{
  "schemaVersion": 2,
  "revision": 18,
  "package": {
    "name": "contextos-agents",
    "version": "2.0.0",
    "compilerVersion": "2.0.0"
  },
  "profile": {
    "id": "startup",
    "hash": "sha256:..."
  },
  "sourceGraphHash": "sha256:...",
  "enabledAdapters": ["cursor", "claude"],
  "managedFiles": {
    ".cursor/rules/react.mdc": {
      "exactSha256": "...",
      "semanticTextSha256": "...",
      "kind": "generated-adapter",
      "generator": "cursor@2",
      "inputsHash": "...",
      "mode": 420,
      "lastTransaction": "..."
    }
  }
}
~~~

Правила:

- missing и corrupt — разные состояния;
- более новая schema запрещает mutation;
- exact byte hash — основной;
- CRLF-normalized hash — вспомогательный;
- binary resources не читать как UTF-8;
- user-modified files не удалять;
- revision проверять compare-and-swap;
- ошибки не проглатывать.

### 11.6. Recovery CLI

~~~text
contextos recover --status
contextos recover --rollback
contextos recover --continue
~~~

doctor при incomplete journal возвращает RECOVERY_REQUIRED.

### 11.7. Fault injection

Точки crash:

- после lock;
- после journal;
- после первого staged file;
- после первого replace;
- после delete;
- после validation;
- перед lockfile;
- после lockfile, до commit marker.

Симулировать:

- ENOSPC;
- EACCES;
- EPERM;
- EBUSY;
- process kill;
- user edit между plan/commit;
- corrupt journal;
- missing backup.

Постусловие:

~~~text
полностью старое состояние
ИЛИ
полностью новое состояние
ИЛИ
RECOVERY_REQUIRED с рабочим rollback
~~~

---

## 12. Milestone 7 — Adapter compiler и drift

Срок: 3–4 недели.

### 12.1. Pure adapter contract

~~~ts
interface Adapter {
  describe(): AdapterCapabilities;

  render(input: {
    registry: CompiledRegistry;
    profile: ResolvedProfile;
    contextPlan?: ContextPlan;
    workspace: WorkspaceGraph;
    config: AdapterConfig;
  }): Artifact[];

  validate(artifacts: Artifact[]): Diagnostic[];
}

interface Artifact {
  path: string;
  content: Buffer;
  mediaType: string;
  kind: string;
  sourceSkillIds: string[];
  inputsHash: string;
  mode?: number;
}
~~~

Renderer ничего не пишет на диск.

### 12.2. Tasks

1. Убрать process.cwd() из adapters.
2. Убрать direct writeFileSync и rmSync.
3. Перевести Gemini renderer.
4. Перевести Claude renderer.
5. Перевести Cursor renderer.
6. Перевести Copilot renderer.
7. Перевести Aider renderer.
8. Перевести Zed renderer.
9. Добавить collision detection.
10. Проверять output syntax/frontmatter.
11. Выполнять export all одной transaction.
12. Обновлять lockfile один раз.
13. Хранить enabled adapters.
14. Добавить export --check.
15. Добавить export --diff.
16. Добавить export --dry-run.
17. Добавить export --json.
18. Удалять stale output только при доказанном ownership.
19. Не присоединять examples/troubleshooting автоматически.
20. Копировать references отдельно.
21. Добавить adapter capability matrix.
22. Добавить per-adapter budget.

### 12.3. Provenance

Generated header:

~~~text
Generated by ContextOS
Adapter: cursor@2
Source graph: sha256:...
Profile: startup sha256:...
Do not edit; use .agents/project overrides.
~~~

Timestamp не включать в generated content.

### 12.4. Drift states

~~~text
STALE_INPUT
MISSING_OUTPUT
MODIFIED_MANAGED_OUTPUT
ORPHAN_MANAGED_OUTPUT
ADAPTER_VERSION_MISMATCH
PROFILE_MISMATCH
~~~

mtime и размер файла не использовать как correctness signal.

### 12.5. Cursor legacy

- v1.8: warning;
- v1.9: .cursorrules только через --legacy-cursorrules;
- v2.0: не генерировать по умолчанию.

### Acceptance

- renderers pure;
- outputs byte-identical на трёх ОС;
- export all recoverable;
- user-created files сохраняются;
- modified generated output не перезаписывается;
- source changes всегда детектируются;
- progressive disclosure не разрушается export.

---

## 13. Milestone 8 — Watch, update, init и doctor

Срок: 3–5 недель.

### 13.1. Watch

Вместо boolean isSyncing использовать coalescing queue:

~~~text
pendingReasons.add(reason)

while pendingReasons not empty:
  snapshot reasons
  clear set
  export
  if events arrived during export:
    next loop
~~~

Tasks:

- project mutation lock;
- ignore generated and transaction directories;
- наблюдать за manifests, profiles, plugins и resources;
- recursive watch как fast path;
- polling/hash fallback;
- не менять profile автоматически;
- сохранять failure diagnostics.

### 13.2. Init

State machine:

~~~text
DISCOVER
→ PLAN
→ STAGE
→ VALIDATE
→ COMMIT
→ REPORT
~~~

До записи показать:

~~~text
Detected profile: startup
Confidence: 0.88
Workspace packages: 4
Adapters: cursor, claude
Create: 17
Update: 0
Conflicts: 1
Estimated footprint: 126 KB
Runtime: disabled
~~~

Rules:

- dry-run и execution используют один plan object;
- validation failure → rollback;
- partial failure → non-zero;
- --allow-partial только explicit;
- повторный init идемпотентен;
- unmanaged files никогда не перезаписываются.

### 13.3. Doctor v2

Statuses:

~~~text
PASS
WARN
FAIL
SKIP
UNVERIFIED
RECOVERY_REQUIRED
~~~

Checks:

- Node 18 для Core;
- Node 20 для Runtime;
- Git version;
- filesystem permissions;
- manifests/schema;
- dependency graph;
- profiles;
- lockfile;
- incomplete transaction;
- source/resource hashes;
- adapter versions;
- MCP handshake;
- provider availability;
- worktree base;
- scanner presence/execution;
- monorepo;
- unsupported filesystem;
- user modifications.

doctor --fix может:

- пересобрать clean generated outputs;
- мигрировать lockfile;
- очистить ContextOS temp;
- rebuild cache;
- добавить ignore entry.

Не может без explicit flag:

- overwrite modified file;
- delete unmanaged file;
- change profile;
- enable Runtime;
- grant capability.

### 13.4. Recovery

Добавить:

~~~text
contextos recover --status
contextos recover --rollback
contextos recover --continue
~~~

### Acceptance

- compile failure не даёт success: true;
- update не оставляет adapters старой версии;
- watcher не теряет event;
- doctor не считает отсутствующий scanner PASS;
- doctor проверяет MCP handshake;
- JSON output versioned;
- ошибки содержат remediation.

---

## 14. Milestone 9 — Prompt и skill system

Срок: 3–5 недель.

### 14.1. Инвентаризация инструкций

Для каждой инструкции создать запись:

~~~text
rule ID
source skill
summary
applicability
priority
token cost
duplicates
conflicts
enforcement level
checker ID
~~~

Уровни:

~~~text
ENFORCED
PARTIALLY_ENFORCED
PROMPT_GUIDANCE
REFERENCE
EXAMPLE
~~~

Правило, существующее только в Markdown, не является ENFORCED.

### 14.2. Убрать role cosplay

Default modes:

~~~text
DISCOVER
CHANGE
VERIFY
REVIEW
~~~

Review lenses:

~~~yaml
reviewLenses:
  - security
  - accessibility
  - database
~~~

Перед удалением ролей сравнить:

- current role declarations;
- prompt без ролей;
- prompt с конкретным checklist.

Сохранять роль только при доказанном выигрыше.

### 14.3. Risk-based workflow

~~~text
ROUTINE
docs, typo, formatting, low-risk config

STANDARD
обычный bugfix, feature, refactor

HIGH
auth, migration, public API, dependencies, CI,
concurrency, multi-package change

DESTRUCTIVE
delete, production action, history rewrite,
irreversible migration
~~~

Workflow:

~~~text
ROUTINE
inspect → change → targeted verify

STANDARD
short plan → change → tests → self-review

HIGH
spec → approved plan → isolated change
→ full verification → independent review

DESTRUCTIVE
HIGH + explicit authority + rollback rehearsal
~~~

Risk повышается после анализа diff.

### 14.4. Prompt budgets

Стартовые engineering limits:

~~~text
always-on bootstrap              ≤1 200 tokens
skill summary                    ≤150 tokens
selected skill body              ≤1 200 tokens
normal compiled context          ≤4 000 tokens
high-risk compiled context       ≤7 500 tokens
default selected skills          2–3 + required dependencies
~~~

### 14.5. Формат SKILL.md

В основном файле оставить:

- purpose;
- when to use;
- 5–12 high-signal правил;
- validation checklist;
- ссылки на references/scripts.

Вынести в resources:

- tutorials;
- длинные examples;
- troubleshooting;
- framework matrices.

### 14.6. Rule IDs

~~~yaml
rules:
  - id: SEC-AGENT-006
    level: must
    enforcement: prompt-guidance
    summary: Do not expose untrusted content to shell execution

  - id: FS-003
    level: must
    enforcement: runtime
    checker: workspace-path-policy-v2
~~~

ctx explain должен показывать, чем реально enforced каждое правило.

### 14.7. Сократить каталог

Группы для объединения:

- context-os + context-manager;
- engineering-workflow + части gstack-roles;
- ui-design + ux-design + ui-ux-pro;
- react + react-best-practices;
- design styles — opt-in.

Deprecated aliases:

- не добавляют prompt;
- перенаправляют на canonical ID;
- показывают migration warning.

### Acceptance

- always-on context помещается в budget;
- нет трёх копий одного normative rule;
- routine task не требует полной церемонии;
- generated skill не раздувается hidden concatenation;
- каждый ENFORCED rule имеет checker;
- default role declarations удалены либо оправданы benchmark.

---

## 15. Milestone 10 — Runtime state machine и attestations

Срок: 3–5 недель.

### 15.1. Независимые состояния

~~~ts
type ExecutionStatus =
  | "QUEUED"
  | "PREPARING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "TIMED_OUT"
  | "CANCELLED"
  | "INTERRUPTED";

type VerificationStatus =
  | "NOT_CONFIGURED"
  | "NOT_APPLICABLE"
  | "PENDING"
  | "RUNNING"
  | "PASS"
  | "FAIL"
  | "ERROR"
  | "TIMEOUT"
  | "STALE";

type ReviewStatus =
  | "NOT_CONFIGURED"
  | "PENDING"
  | "RUNNING"
  | "PASS"
  | "FAIL"
  | "ERROR"
  | "TIMEOUT"
  | "UNAVAILABLE"
  | "MALFORMED"
  | "STALE";

type MergeStatus =
  | "NOT_READY"
  | "READY"
  | "MERGING"
  | "MERGED"
  | "BLOCKED"
  | "CONFLICT"
  | "STALE_BASE"
  | "ERROR";
~~~

### 15.2. VerificationAttestation

~~~ts
interface VerificationAttestation {
  status: VerificationStatus;

  subject: {
    repositoryFingerprint: string;
    baseSha: string;
    headSha: string;
    diffSha256: string;
    scopeSha256: string;
  };

  command?: {
    executable: string;
    args: string[];
    cwd: string;
    timeoutMs: number;
  };

  evidence?: {
    exitCode: number | null;
    signal: string | null;
    outputSha256: string;
    redactedPreview: string;
  };

  runnerMode: "oci" | "host-unsafe";
  startedAt?: number;
  completedAt?: number;
  reasonCode?: string;
}
~~~

### 15.3. ReviewAttestation

Хранить:

- exact subject SHA;
- implementer execution ID;
- reviewer execution ID;
- provider/model;
- independence level;
- schema version;
- raw output digest;
- static findings;
- LLM verdict;
- retries;
- timestamps.

### 15.4. State transitions

Запретить прямое присваивание:

~~~ts
thread.status = ...
~~~

Ввести:

~~~ts
transitionThread(threadId, expectedRevision, event)
~~~

Функция:

- проверяет legal transition;
- применяет optimistic revision;
- пишет audit event;
- возвращает immutable next state.

### 15.5. Merge readiness

Проверять:

- execution SUCCEEDED;
- scope PASS;
- verification PASS;
- review PASS;
- sandbox level;
- head SHA;
- diff digest;
- scope digest;
- target base;
- отсутствие unresolved exception.

Любое изменение candidate commit переводит attestations в STALE.

### Acceptance

- невозможно получить READY без evidence-bearing PASS;
- FAILED → READY невозможен;
- legacy PASS без evidence → LEGACY_UNVERIFIED;
- unknown future enum не трактуется как PASS.

---

## 16. Milestone 11 — Verification и reviewer pipeline

Срок: 2–4 недели.

### 16.1. Structured verification

~~~ts
interface VerificationSpec {
  executable: "npm" | "pnpm" | "yarn" | "pytest" | "cargo" | "go";
  args: string[];
  timeoutMs: number;
  required: boolean;
  network: "deny" | "allow";
  allowedOutputPaths?: string[];
}
~~~

Legacy verify_command: string поддерживать один deprecation cycle.

### 16.2. Command trust

npm test и npx выполняют произвольный код.

Правила:

- npx запрещён в host mode;
- arbitrary commands — только OCI;
- repository scripts требуют user-local trust;
- project config не может выдать себе trust;
- argv-массив вместо shell string, где возможно.

### 16.3. Immutable candidate

1. Agent завершил работу.
2. Проверить scope и secrets.
3. Создать candidate commit.
4. Получить headSha и diffDigest.
5. Запустить verification.
6. Проверить неизменность HEAD.
7. Проверить post-test working tree.
8. Изменение candidate → STALE.

### 16.4. Process tree

- Unix: process group + SIGTERM/SIGKILL;
- Windows: Job Object или bounded taskkill /T /F;
- timeout/cancel убивает grandchildren;
- после kill проверять отсутствие descendants.

### 16.5. Environment

- ephemeral HOME;
- минимальный env;
- exact provider credentials;
- network deny по умолчанию в sandbox;
- redacted output;
- output size limit.

### 16.6. Reviewer

- static checks и LLM review — разные verdicts;
- provider missing → UNAVAILABLE;
- timeout → TIMEOUT;
- exception → ERROR;
- invalid JSON → MALFORMED;
- no fallback PASS;
- structured response schema;
- read-only reviewer workspace;
- ограниченные retries;
- хранить все предыдущие FAIL.

Independence levels:

~~~text
same model, different execution
different model
different provider
human
~~~

### Acceptance

- missing executable не превращается в FAIL/PASS;
- timeout не превращается в PASS;
- test, изменивший candidate, invalidates attestation;
- reviewer не изменяет repository;
- verification запускается один раз на thread/head/spec.

---

## 17. Milestone 12 — durable state, IPC locks и concurrency

Срок: 3–5 недель.

### 17.1. Lease model

~~~text
instance UUID
hostname
PID
process start time
owner token
fencing token
repository fingerprint
~~~

Lock:

~~~json
{
  "ownerToken": "...",
  "fencingToken": 42,
  "instanceId": "...",
  "pid": 123,
  "processStartedAt": "...",
  "heartbeatAt": "...",
  "expiresAt": "..."
}
~~~

Правила:

- acquire атомарный;
- heartbeat продлевает lease;
- release сверяет owner token;
- stale owner не может удалить новый lock;
- destructive operation сверяет fencing token перед действием;
- PID не является identity.

### 17.2. Lock order

~~~text
repository operation
→ thread
→ state
~~~

State lock нельзя держать во время долгого agent execution.

### 17.3. Event store

~~~text
state/
  repository.json
  events/
    000001-<uuid>.json
    000002-<uuid>.json
  snapshots/
    snapshot-000100.json
~~~

Свойства:

- immutable events;
- monotonic revision;
- checksum;
- periodic snapshots;
- replay recovery;
- torn tail quarantine;
- corrupt state не игнорируется.

### 17.4. Async wait

Убрать Atomics.wait.

Использовать:

- Promise;
- bounded backoff;
- jitter;
- AbortSignal.

### 17.5. Idempotency

contextos_delegate принимает idempotency_key.

Повторный запрос:

- возвращает existing job;
- не создаёт второй worktree;
- другой payload под тем же key → conflict.

### 17.6. Cross-process tests

- 2, 4 и 8 MCP processes;
- 10 000 transitions;
- simultaneous create/merge/cleanup;
- paused owner;
- stale takeover;
- PID reuse;
- clock jump;
- crash after event append.

### Acceptance

- zero lost updates;
- старый owner не удаляет новый lock;
- один task не создаёт две branches;
- crash не превращает state в completed;
- event loop остаётся responsive;
- corrupt tail не теряет последний valid snapshot.

---

## 18. Milestone 13 — transactional Git merge

Срок: 2–4 недели.

### 18.1. Новый flow

~~~text
candidate commits
→ integration branch/workspace
→ apply all candidates
→ conflict detection
→ combined verification
→ combined review
→ target-head compare
→ explicit finalization
~~~

### 18.2. Steps

1. Получить repository operation lease.
2. Зафиксировать target SHA.
3. Создать integration workspace от SHA.
4. Применить candidate commits.
5. При конфликте abort всей integration transaction.
6. Запустить combined verification.
7. Запустить combined review.
8. Получить integration head SHA.
9. Проверить target ref.
10. При advance → STALE_BASE.
11. По умолчанию вернуть verified integration branch.
12. Изменять checked-out target только при explicit finalization.
13. Грязный checkout блокирует finalization.
14. Merge operation должен быть идемпотентным.
15. Cleanup только после reachability check.

Partial merge:

- не default;
- только explicit;
- каждый subset повторно проверяется;
- общий status не может быть SUCCEEDED, если часть branches пропущена.

### 18.3. Git hooks

- default disabled;
- включение только user-local trust;
- repo config не может включить hooks;
- изменение hook digest инвалидирует consent;
- trusted hooks запускаются в sandbox.

### Acceptance

- конфликт пятого commit не оставляет первые четыре в target;
- target advance даёт STALE_BASE;
- два MCP не merge одновременно;
- crash до finalization оставляет recoverable integration branch;
- cleanup не удаляет чужую branch;
- primary checkout не меняется до explicit finalization.

---

## 19. Milestone 14 — настоящий execution sandbox

Срок: 5–8 недель.

### 19.1. Режимы

~~~text
oci-required
oci-preferred
host-unsafe
~~~

Auto-merge:

- oci-required — разрешён после всех gates;
- oci-preferred — только если OCI реально использован;
- host-unsafe — заблокирован по умолчанию.

Silent fallback OCI → host запрещён.

### 19.2. Container profile

- non-root UID/GID;
- read-only root filesystem;
- cap-drop=ALL;
- no-new-privileges;
- seccomp;
- CPU/memory/PID limits;
- primary checkout не mounted;
- Git common directory не mounted RW;
- ephemeral HOME/TMP;
- network none;
- writable cache только explicit;
- hard timeout;
- output limits.

### 19.3. Git metadata

Обычный worktree может ссылаться на shared .git. Недоверенному agent нельзя давать его RW.

Варианты:

1. isolated clone с отдельной Git metadata;
2. source snapshot без .git, candidate commit создаёт parent;
3. synthetic read-only metadata.

Предпочтительно:

~~~text
parent creates isolated local clone/bundle
→ sandbox changes files without primary .git
→ parent validates diff
→ parent creates candidate commit
~~~

### 19.4. Credentials

Лучший вариант:

- LLM API вызывается trusted parent;
- sandbox получает tool protocol;
- provider key не монтируется.

Для внешнего CLI:

- ephemeral config;
- scoped short-lived credentials;
- exact provider env;
- настоящий HOME не монтируется;
- secrets не находятся в command line;
- controlled network proxy.

### 19.5. Provider capabilities

~~~ts
interface ProviderCapabilities {
  requiresGitMetadata: boolean;
  requiresNetwork: boolean;
  requiredSecrets: string[];
  supportsReadOnly: boolean;
  supportsStructuredOutput: boolean;
  supportsProcessIsolation: boolean;
}
~~~

### 19.6. Adversarial tests

Agent пытается:

~~~text
write ../../primary-file
read real-home secret
modify .git/refs/heads/main
set core.hooksPath
stage .env
spawn detached child
ignore SIGTERM
open network
print secret
replace allowed file with symlink
~~~

### Acceptance

Sandboxed agent не может:

- читать host secrets;
- менять primary checkout;
- менять main ref;
- читать настоящий HOME;
- открывать сеть при deny;
- оставлять descendants;
- менять reviewer workspace;
- обходить resource limits.

Каждый run сохраняет engine/image/policy attestation.

---

## 20. Milestone 15 — plugin supply chain

Срок: 2–4 недели.

### 20.1. Pinning

GitHub:

- branch/tag разрешается в exact commit;
- commit хранится в lock;
- floating source запрещён в CI без explicit flag.

npm:

- exact version;
- dist.integrity;
- no implicit latest.

### 20.2. Full bundle

Installer должен устанавливать весь declared bundle:

- SKILL.md;
- skill.yaml;
- references;
- scripts;
- assets;
- examples;
- troubleshooting;
- validation resources.

### 20.3. Tree digest

Digest включает:

~~~text
relative path
file type
mode
content hash
~~~

### 20.4. Safe extraction

Проверять:

- absolute paths;
- ../;
- symlink/hardlink escape;
- duplicate normalized paths;
- Unicode/case collisions;
- Windows device names;
- max file count;
- total size;
- compression ratio;
- special files.

### 20.5. Trust levels

~~~text
builtin-signed
user-local
third-party-pinned
third-party-floating
unsafe-overridden
~~~

Trust plugin не расширяет tool capabilities.

### 20.6. Scripts

- npm lifecycle scripts не запускать;
- skill scripts disabled по умолчанию;
- capability grant хранится в user-local config;
- project config не может выдать себе network/hooks/secrets;
- изменение script digest инвалидирует grant.

### 20.7. Atomic update

1. Download во temp.
2. Validate.
3. Scan.
4. Calculate tree digest.
5. Compare local modifications.
6. Stage.
7. Swap/rollback.
8. Update lock transactionally.

Modified plugin не перезаписывать.

### Acceptance

- references устанавливаются полностью;
- floating tag mutation обнаруживается;
- npm lifecycle не выполняется;
- tar traversal/zip bomb блокируется;
- local customization сохраняется;
- scanner называется heuristic и не выдаётся за security boundary.

---

## 21. Milestone 16 — cross-platform hardening

Срок: 2–4 недели.

### Support contract

Документировать:

- Node 18 для Core;
- Node 20 для Runtime;
- Git minimum;
- поддерживаемые filesystems;
- UNC/NFS policy;
- container requirements;
- WSL limitations.

### Windows

Тестировать:

- drive letters;
- case;
- junction/reparse escape;
- CON, NUL, PRN;
- alternate data streams;
- trailing dot/space;
- long paths;
- antivirus lock;
- EPERM, EBUSY;
- .cmd quoting;
- %VAR%, !VAR!, caret и quotes;
- process tree;
- rename contention.

### Linux

Тестировать:

- case-sensitive collisions;
- executable bits;
- symlink swap;
- process groups;
- directory fsync;
- permissions;
- mount boundary;
- seccomp/cgroup.

### macOS

Тестировать:

- case-insensitive APFS;
- Unicode NFC/NFD;
- executable modes;
- Docker/Podman;
- file lock behavior.

### UNC/network FS

На первом этапе оставить unsupported:

- doctor объясняет причину;
- Runtime отказывается стартовать;
- distributed lock не притворяется корректным.

### Fingerprint

Не lower-case весь path. Fingerprint должен учитывать:

- canonical path с platform semantics;
- Git common directory identity;
- persisted repository UUID.

### Acceptance

- CI на Windows, Ubuntu, macOS;
- path fuzz проходит на всех ОС;
- Windows rename contention не вызывает direct overwrite;
- /Repo и /repo различаются на Linux;
- WSL mixed paths дают понятную ошибку;
- unsupported filesystem определяется до запуска agent.

---

## 22. Milestone 17 — DX и customization layer

Срок: 3–5 недель.

### 22.1. CLI vocabulary

Публичная поверхность:

~~~text
contextos init
contextos doctor
contextos resolve
contextos explain
contextos export
contextos update
contextos recover
contextos profile
contextos skill
contextos runtime
~~~

- npx contextos-agents — install transport;
- node .agents/ctx.js — internal/recovery path;
- aliases поддерживаются один-два minor release;
- docs используют contextos.

### 22.2. Ownership layout

~~~text
.agents/vendor/       package-owned, immutable
.agents/project/      user-owned policy
.agents/generated/    compiler-owned
.agents/cache/        disposable
.agents/state/        locks/journal/provenance
~~~

Команды:

~~~text
contextos skill override security
contextos skill eject security
contextos skill diff security
contextos explain --skill security
~~~

### 22.3. Conflict UX

~~~text
contextos conflicts list
contextos conflicts show <id>
contextos conflicts accept-local <id>
contextos conflicts accept-upstream <id>
contextos conflicts resolve <id> --file ...
~~~

### 22.4. Init

State machine:

~~~text
DISCOVER
→ PLAN
→ STAGE
→ VALIDATE
→ COMMIT
→ REPORT
~~~

До записи показать:

~~~text
Detected profile: startup
Confidence: 0.88
Workspace packages: 4
Adapters: cursor, claude
Create: 17
Update: 0
Conflicts: 1
Estimated footprint: 126 KB
Runtime: disabled
~~~

### 22.5. Doctor

Doctor должен проверять:

- runtime versions;
- schema;
- graph;
- lockfile;
- journals;
- adapter provenance;
- MCP handshake;
- scanner;
- monorepo;
- unsupported filesystem.

doctor --fix разрешает только восстановимые операции и не затирает user data.

### 22.6. Diagnostic export

~~~text
contextos diagnostics export
~~~

Bundle не содержит:

- prompts;
- source code;
- repository URL;
- filenames;
- environment variables;
- stable repository identifier.

### Acceptance

- median time-to-first-valid-export ≤3 минуты;
- новый пользователь проходит init+doctor без GUIDE;
- ошибки показывают сохранённое состояние и recovery command;
- modified/unmanaged files сохраняются;
- human/JSON output строятся из одного result model;
- NO_COLOR поддерживается.

---

## 23. Milestone 18 — Product positioning и claim governance

Срок: 1–3 недели.

### 23.1. Product document

Создать docs/product/positioning.md:

- primary ICP — команды 5–100 разработчиков с несколькими AI-инструментами;
- secondary ICP — AI platform/DX teams и solo maintainers;
- anti-ICP — пользователи, которым достаточно одного rules-файла;
- jobs-to-be-done;
- Core/Runtime/Catalog boundaries.

### 23.2. README

Порядок:

1. One-sentence value proposition.
2. Для кого / не для кого.
3. 60-second quick start.
4. Что создаётся в репозитории.
5. Core / adapters / Runtime.
6. Trust model.
7. Evidence.
8. Limitations.
9. Command reference.
10. Benchmark methodology.

### 23.3. Claims registry

Создать benchmarks/claims.json.

~~~json
{
  "schemaVersion": 1,
  "claims": [
    {
      "id": "verified-success-v2",
      "status": "supported",
      "statement": "ContextOS improved verified task success...",
      "population": "TypeScript maintenance tasks",
      "comparator": "concise-checklist-v1",
      "estimate": {
        "delta": 7.4,
        "confidenceInterval95": [2.1, 12.6]
      },
      "models": ["provider/model-version"],
      "taskCount": 60,
      "runCount": 2400,
      "evidenceArtifact": "benchmarks/evidence/v2/...",
      "codeCommit": "...",
      "skillGraphHash": "...",
      "validUntil": "YYYY-MM-DD",
      "limitations": []
    }
  ]
}
~~~

Статусы:

~~~text
deterministic
measured
observed
aspirational
deprecated
stale
invalidated
~~~

Claim становится stale при изменении:

- resolver;
- skill graph;
- evaluator;
- affected paths;
- benchmark protocol;
- model availability.

### 23.4. Claim linter

Запрещать в README и docs quantitative claim без evidence ID.

Проверять слова:

- guarantee;
- sandbox;
- atomic;
- secure;
- real;
- percent savings.

### 23.5. Dogfooding

Добавить:

~~~text
docs/PRD.md
docs/ARCHITECTURE.md
docs/PROJECT_GRAPH.md
docs/SECURITY.md
docs/BENCHMARK_PROTOCOL.md
docs/decisions/
~~~

Сам ContextOS должен проходить:

~~~text
resolve
export --check
doctor --strict
runtime verification
~~~

### Acceptance

- каждый процент имеет evidence;
- Runtime отделён от stable Core;
- test counts генерируются из CI;
- docs не обещают больше, чем проверяется кодом.

---

## 24. Milestone 19 — Benchmark v2

Срок: 6–10 недель.

Главная метрика:

~~~text
cost per independently verified successful task
=
LLM + retries + review + orchestration cost
──────────────────────────────────────────
number of hidden-test-verified successes
~~~

### 24.1. Два протокола

#### Controlled efficacy

Изолирует влияние context selection.

Одинаковы:

- task;
- repository;
- visible requirements;
- tools;
- turn limit;
- time limit;
- output budget;
- model;
- execution environment.

#### End-to-end utility

Сравнивает реальные пользовательские workflows со всеми:

- orchestration;
- retries;
- verification;
- reviewer;
- Runtime;
- human review cost.

### 24.2. Arms

#### Arm A — Vanilla

Нейтральный system prompt без искусственно слабого baseline.

#### Arm B — Concise checklist

10–15 универсальных правил, примерно 500–800 tokens.

Это главный comparator. Вопрос не ContextOS > Vanilla, а ContextOS > Concise Checklist.

#### Arm C — ContextOS Core

- resolver реально выбирает skills;
- нельзя handpick suite skills;
- без MCP и role theatre;
- selected context сохраняется.

#### Arm D — Full ContextOS

- resolver;
- risk workflow;
- Runtime;
- verification;
- review;
- retry;
- integration.

### 24.3. Ablations

~~~text
C-random
C-all
C-no-role
C-no-negative-constraints
C-summary-only
C-no-references
~~~

### 24.4. Fairness rules

- common prompt byte-identical;
- visible requirements одинаковы;
- hidden tests недоступны агенту;
- одинаковый tool budget;
- failures не исключаются;
- плохой arm нельзя selectively rerun;
- random/LATIN-square ordering;
- caching либо отключается, либо учитывается;
- provider outages обрабатываются симметрично.

### 24.5. Dataset

Pilot:

~~~text
12 tasks × 4 arms × 5 repeats × 2 models = 480 runs
~~~

Main:

~~~text
40–60 tasks × 4 arms × 10 repeats × 3 models
= 4 800–7 200 runs
~~~

Категории:

- trivial bugfix;
- standard bugfix;
- feature;
- refactor;
- security;
- concurrency;
- public API;
- database/migration;
- frontend/accessibility;
- CLI/cross-platform;
- monorepo;
- docs/config.

### 24.6. Dataset controls

~~~text
development
validation
frozen test
external holdout
~~~

- test split заморозить после skills bundle;
- authors skills не видят hidden tests;
- evaluator changes создают новую benchmark version;
- exclusion rules фиксируются заранее;
- исторические issues брать до upstream fix;
- добавить закрытую holdout-выборку.

### 24.7. Execution harness

~~~text
benchmarks/v2/
├── schema/
├── datasets/
├── arms/
├── runner/
├── providers/
├── evaluators/
├── analysis/
├── reports/
└── evidence/
~~~

Каждый run получает:

- fresh checkout/container;
- fixed base commit;
- preinstalled dependencies;
- CPU/memory/PID limits;
- network policy;
- no host secrets;
- unique run ID;
- no conversation memory между arms;
- hidden tests только после agent turn.

node:vm не считать security sandbox. Для недоверенного code execution использовать disposable container/VM.

### 24.8. Evaluators

Primary outcome:

~~~text
independently_verified_success
~~~

Успех:

- patch применился;
- build/typecheck;
- public tests;
- hidden tests;
- нет regression;
- нет P0/P1 security finding;
- budget не превышен.

Secondary:

- compilation;
- public/hidden tests;
- security findings;
- hallucinated APIs;
- placeholders;
- scope violations;
- changed files;
- diff size;
- iterations;
- latency;
- human review minutes;
- token usage;
- dollar cost.

Regex — только дополнительный сигнал.

### 24.9. Human review

- reviewer не знает arm/model;
- минимум два reviewer;
- третий разрешает конфликт;
- rubric: correctness, security, maintainability, project fit, scope, unnecessary abstraction;
- публиковать inter-rater reliability.

LLM judge не может быть единственным quality oracle.

### 24.10. Statistics

До main run зафиксировать:

- hypotheses;
- primary outcome;
- sample size;
- exclusions;
- practical effect;
- statistical model;
- multiple-comparison correction.

Основные гипотезы:

~~~text
H1: C превосходит B по verified success.
H2: D снижает cost per verified success относительно B.
H3: selected context превосходит C-all.
H4: removal of roles non-inferior.
~~~

Методы:

- mixed-effects logistic regression;
- task/model random effects;
- paired cluster bootstrap;
- 95% CI;
- median/p90/p95 costs;
- Holm correction.

Intention-to-treat включает:

- syntax failure;
- timeout;
- empty patch;
- malformed output;
- agent-caused tool failure.

Claim «улучшает качество» разрешён только если:

- lower 95% CI для C-B > 0;
- absolute effect ≥5 percentage points;
- эффект повторён на двух моделях;
- нет критической subgroup regression;
- есть реальные multi-file tasks.

### 24.11. Token accounting

Приоритет:

1. provider-reported usage;
2. official tokenizer;
3. explicit estimated fallback.

Считать:

~~~text
system input
task input
tool schemas
repository context
selected skills
cached input
output
reasoning
retries
reviewer calls
orchestration calls
summarization
~~~

Метрики:

~~~text
raw_input_tokens
billed_input_tokens
output_tokens
reasoning_tokens
total_cost_usd
skill_payload_tokens
orchestration_overhead_tokens
tokens_per_verified_success
cost_per_verified_success
~~~

Сравнения показывать отдельно:

- versus full catalog;
- versus concise checklist;
- versus native scoped rules;
- end-to-end including MCP.

### 24.12. stats

Добавить:

~~~text
contextos stats context
contextos stats run <evidence.json>
~~~

Пример:

~~~text
Estimated selected policy payload: 3,420 tokens
Full catalog payload:             59,759 tokens
Reduction vs full catalog:        94.3%

This is a static payload estimate.
It is not billed API usage or end-to-end cost.
~~~

### 24.13. Evidence pipeline

Каждый experiment хранит:

- code commit;
- dirty flag;
- dataset hash;
- prompt hashes;
- skill graph hash;
- resolver version;
- evaluator hash;
- container digest;
- provider/model;
- parameters;
- request IDs;
- retries;
- raw provider usage.

latest является только pointer. Старые reports immutable.

### Acceptance

- pilot 480 runs воспроизводим;
- main run использует concise checklist comparator;
- есть confidence intervals;
- raw failures опубликованы;
- estimates не смешиваются с provider usage;
- negative result не скрывается;
- README claims генерируются из evidence.

---

## 25. Миграция

### 25.1. Lockfile v1 → v2

1. Получить project lock.
2. Strictly validate v1.
3. Corrupt v1 не трактовать как missing.
4. Сохранить immutable backup.
5. Для каждого managed file записать exact и semantic hashes.
6. Generated ownership признать только при совпадении старого hash.
7. Modified files оставить user-owned/conflicted.
8. Записать V2 внутри transaction.
9. Сделать migrator idempotent.
10. Ошибка оставляет v1 нетронутым.

### 25.2. Profile v1 → v2

- prefer_skills → skills.preferred для настоящих skill IDs;
- technologies → technologyDefaults;
- exclude_skills → skills.excluded;
- enforce → typed policy;
- docs fields → generation.documents;
- неизвестные значения → warning/manual choice.

### 25.3. Runtime state v1 → v2

- старый PASS без evidence → LEGACY_UNVERIFIED;
- старый reviewer fallback PASS → LEGACY_UNTRUSTED;
- running/pending → INTERRUPTED;
- старые successful branches требуют reverify/rereview;
- migration idempotent;
- migration report сохраняется.

### 25.4. Plugin migration

- SKILL-only checksum → legacyPartialDigest;
- full tree digest вычисляется локально;
- floating refs по возможности резолвятся в exact commit;
- недоступный source → non-reproducible;
- scripts остаются disabled до grant.

### 25.5. Generated outputs

- hash совпадает lockfile → можно regenerate;
- output modified → conflict artifact;
- unmanaged output не захватывать;
- custom .mdc, prompts и .zed файлы сохранять.

---

## 26. Release train

### Wave 0 — 1.7.1 / 0.3.1

Срок: 1–2 недели.

- staged-secret fix;
- fail-closed verdicts;
- no double verification;
- async outcome fix;
- scope split;
- ownership checks;
- no direct write fallback;
- resolver regression;
- truthful docs.

### Wave 1 — Core v2 preview 1.8

Срок: 4–6 недель.

- schemas;
- compiled registry;
- shadow resolver;
- workspace graph;
- profiles v2;
- lockfile reader;
- export --check;
- doctor statuses.

### Wave 2 — Safe lifecycle 1.9

Срок: 4–6 недель.

- transaction engine;
- recovery;
- project lock;
- pure adapters;
- overrides;
- v2 resolver default;
- legacy compatibility flags.

### Wave 3 — Runtime correctness beta 0.4–0.6

Срок: 8–12 недель параллельно.

- state machine;
- attestations;
- single execution pipeline;
- verification;
- reviewer;
- durable state;
- transactional integration merge.

### Wave 4 — Runtime security beta 0.7

Срок: 5–8 недель.

- OCI sandbox;
- secret boundary;
- provider capabilities;
- plugin supply chain;
- OS hardening;
- red-team suite.

### Wave 5 — Benchmark v2

Срок: 6–10 недель.

- pilot;
- full protocol;
- actual usage;
- randomized repeated runs;
- evidence registry;
- independent review.

### Wave 6 — ContextOS 2.0

Не выпускать по дате. Выпускать только после всех gates.

---

## 27. Тестовая стратегия

### Unit

- schema validation;
- manifest normalization;
- graph cycles;
- conflict policy;
- budget planner;
- safe paths;
- hashes;
- profiles;
- state transitions;
- merge readiness.

### Property/fuzz

- random DAG/cycles;
- conflict graphs;
- path traversal;
- Windows path syntax;
- Git filenames;
- malformed YAML;
- transaction interruption;
- random filesystem order;
- command argument escaping.

### Integration

- real temporary Git repositories;
- concurrent CLI processes;
- concurrent MCP processes;
- watcher during export;
- user edit between plan/commit;
- staged secret;
- candidate head change;
- reviewer failure;
- target branch advance.

### Golden/conformance

Для каждого adapter:

- canonical fixture;
- expected artifact inventory;
- byte snapshot;
- format validation;
- budget;
- provenance;
- no unwanted resource concatenation.

### E2E upgrade

~~~text
fresh install
v1.7 → v1.8
v1.7 → v2
modified core
modified generated
missing lockfile
corrupt lockfile
community plugin
interrupted update
legacy worktrees
~~~

### Performance budgets

- warm resolve p95 ≤100 мс;
- single-package detect p95 ≤250 мс;
- 500-package cold detect ≤3 с;
- warm detect ≤300 мс;
- unchanged export не переписывает files;
- large fixture memory ≤250 MB.

---

## 28. Critical path

~~~text
CORE-0 characterization
    ↓
CORE-1 schema/compiler
    ├── CORE-2 resolver
    ├── CORE-3 workspace graph
    └── CORE-4 profiles

CORE-5 safe paths/locks
    ↓
CORE-6 transactions/lockfile
    ↓
CORE-7 adapters/drift
    ↓
CORE-8 doctor/watch/update

RT-01 state/verdicts
    ├── RT-02 execution pipeline
    │     ├── RT-03 verification
    │     └── RT-04 reviewer
    └── RT-05 scope/staging
          └── RT-06 sandbox

RT-07 durable state/fencing
    ↓
RT-08 transactional merge
    ↓
RT-09 secrets
    ↓
RT-11 cross-platform production gate

Benchmark protocol может проектироваться рано,
но финальный запуск зависит от CORE-2, CORE-7 и RT-04.
~~~

Auto-merge нельзя считать production-ready до завершения:

- state/attestation model;
- verification;
- reviewer;
- scope/staging;
- durable lock;
- transactional merge.

Термин sandbox нельзя использовать без OCI isolation.

---

## 29. Первые 15 PR

1. Убрать/сузить недоказанные claims.
2. Удалить git add -A из diff APIs.
3. Temporary clean index и blocked-path tests.
4. Verification/review non-PASS statuses.
5. Strict merge regression tests.
6. Убрать double verification.
7. Typed async aggregation.
8. focus_files/write_scope.
9. Ownership-required cleanup.
10. Удалить direct-write fallback.
11. Update/install compile failures становятся fatal.
12. Resolver regressions и shared temporary graph.
13. ADRs и diagnostic contract.
14. SkillManifestV2 schema.
15. Compiled registry prototype.

Каждый PR:

- одна проблема;
- тест до изменения;
- migration note;
- ограниченный blast radius;
- actual verification output;
- security review для P0.

---

## 30. Stop/go решения

### Gate A — roles

Если no-role non-inferior, удалить roles из default path.

### Gate B — concise checklist

Если ContextOS не превосходит короткий checklist, прекратить добавлять skills и упростить Core до policy compiler/adapters.

### Gate C — zero dependencies

Если zero-dependency требует fragile parsers, сохранить zero install-time dependencies через bundle.

### Gate D — sandbox

Если OCI нельзя поддерживать качественно, Runtime остаётся experimental, а worktree называется только Git isolation.

### Gate E — adapters

Если editor не поддерживает dynamic loading, не заявлять dynamic token savings для него.

### Gate F — full workflow

Если полный Runtime дороже concise workflow без meaningful success gain, сделать его opt-in для high-risk задач.

---

## 31. Global Definition of Done

Работа завершена только когда:

- manifests являются исполняемым источником истины;
- requires/conflicts применяются runtime;
- CLI и MCP используют один resolver;
- monorepo выбирает package-aware context;
- prompt budget соблюдается;
- roles/phases доказаны или удалены;
- safe update crash-recoverable;
- unmanaged/modified files не теряются;
- adapters детерминированы и имеют provenance;
- update/profile apply не оставляют stale output;
- read-only diff не меняет index;
- blocked path невозможно закоммитить;
- отсутствие verification/reviewer не становится PASS;
- attestations привязаны к exact commit;
- concurrency не даёт lost update или lock theft;
- merge не меняет primary checkout до finalization;
- host mode называется unsafe;
- production Runtime использует настоящий sandbox;
- plugins pin-ятся и имеют full-tree digest;
- doctor различает PASS/SKIP/UNVERIFIED;
- onboarding не скрывает partial failure;
- benchmark сравнивает ContextOS с concise checklist;
- actual tokens/cost/retries учитываются end-to-end;
- claims связаны с актуальными evidence;
- Windows/Linux/macOS CI зелёный;
- собственный репозиторий ContextOS проходит этот же workflow.

---

## 32. Что категорически не делать

- Не добавлять новые regex в reviewer и не называть это enforcement.
- Не добавлять второй in-process mutex вместо IPC lock.
- Не делать silent fallback OCI → host.
- Не считать fulfilled Promise успешной задачей.
- Не использовать branch name как attestation identity.
- Не выполнять git add -A для чтения diff.
- Не снимать lock без owner-token comparison.
- Не считать PID достаточным identity.
- Не удалять каталог только потому, что он под .swarm-worktrees.
- Не разрешать repo config включать hooks/unsafe mode.
- Не передавать настоящий HOME агенту.
- Не считать prompt scanner security boundary.
- Не сохранять старый PASS без доказательства его происхождения.
- Не возвращать marketing percentage без comparator, sample size и confidence interval.
- Не расширять каталог до доказательства эффективности kernel.

---

## 33. Итог

ContextOS нужно развивать как проверяемый policy compiler с optional execution plane, а не как бесконечно растущий каталог промптов.

Правильный порядок:

~~~text
trust patch
→ canonical compiler
→ deterministic resolver
→ recoverable lifecycle
→ adapter provenance
→ runtime attestations
→ real sandbox
→ benchmark evidence
→ public claims
~~~

До прохождения этого порядка любые новые claims о гарантиях, sandbox, AST analysis и 70–80% token savings должны считаться aspirational, а не свойствами продукта.

Статус плана: DONE
