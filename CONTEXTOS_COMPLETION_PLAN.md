# ContextOS — план закрытия оставшихся работ

Статус: IMPLEMENTATION  
Дата baseline: 2026-09-10  
Источник требований: `CONTEXTOS_IMPLEMENTATION_PLAN.md`

## 1. Цель и границы

Цель — довести ContextOS до Global Definition of Done из основного плана без ложных гарантий и без потери пользовательских файлов.

В scope входят:

- robust manifest compiler и единый resolver;
- crash-safe lifecycle всех файловых мутаций;
- интеграция runtime state machine, attestations и durable state в MCP;
- реальное OCI-выполнение verification;
- plugin supply-chain enforcement;
- cross-platform CI;
- dogfooding, документация и воспроизводимый Benchmark v2.

Вне scope до завершения этого плана:

- новые skills, roles, profiles и adapters;
- новые marketing claims;
- автоматический merge из `host-unsafe`;
- поддержка network/UNC workspaces для мутаций.

## 2. Зафиксированный baseline

На старте следующих работ уже выполнено:

- MCP verification/review работает fail-closed;
- `write_scope` обязателен, поддерживает allow/deny и повторно проверяется перед commit;
- verification различает `PASS`, `FAIL`, `ERROR`, `TIMEOUT`;
- MCP использует canonical resolver без hard cap в четыре skill;
- bundled MCP синхронизирован с TypeScript source;
- lockfile v1 больше не делает direct-write fallback;
- macOS добавлен в CI matrix;
- неподтверждённый claim 65–80% отозван;
- Core: 355 тестов; MCP: 513 passed, 13 skipped;
- `validate`, secret scan, claims lint, MCP lint и typecheck проходят.

Baseline нельзя считать доказательством полной production-ready готовности Runtime.

## 3. Правила выполнения

Каждая задача выполняется отдельным атомарным изменением:

1. Сначала добавить или уточнить тест, который падает.
2. Реализовать минимальное решение.
3. Прогнать локальные тесты задачи.
4. Прогнать gate волны.
5. Просмотреть diff на потерю пользовательских данных, fail-open и platform-specific поведение.
6. Делать commit только после зелёного gate и только если рабочее дерево не содержит чужих незавершённых изменений.

Запрещено отмечать задачу выполненной только по наличию файла или unit-теста. Нужна интеграция в реальный CLI/MCP path.

Обозначения:

- `[ ]` — не начато;
- `[~]` — выполняется;
- `[x]` — выполнено и подтверждено gate;
- `[!]` — заблокировано, причина записана рядом.

## 4. Wave 1 — Manifest compiler без fragile YAML parser

Цель: `skill.yaml` становится надёжным исполняемым источником истины.

### W1.1 — Parser conformance tests (45–60 мин)

- [x] Добавить fixtures: quoted `#`, `:` внутри строки, multiline `>`/`|`, empty list/map, escaped quotes, anchors/aliases, malformed indentation, duplicate keys.
- Файлы: `tests/manifest-compiler.test.js`, `tests/fixtures/manifests/**`.
- Test: текущий parser должен упасть минимум на multiline/anchors/malformed nesting.
- Blocked by: nothing.

### W1.2 — Bundled standards-compliant YAML parser (60–120 мин)

- [x] Вынести compiler source и собрать parser dependency в публикуемый bundle.
- [x] Сохранить zero install-time dependencies для конечного CLI.
- [x] Добавить license/SBOM запись bundled dependency.
- Файлы: `.agents/compiler/**`, `scripts/**`, `package.json`, lockfile, SBOM/license files.
- Test: W1.1 + установка tarball в пустой каталог без `node_modules`.
- Blocked by: W1.1.

### W1.3 — Strict schema and diagnostics (60–90 мин)

- [x] Запретить duplicate keys и silent parse recovery.
- [x] Валидировать semver, enums, `additionalProperties: false`, paths и resource modes.
- [x] Сохранять стабильные diagnostic codes и SARIF locations.
- Файлы: `.agents/compiler/**`, `.agents/schemas/skill.manifest.v2.json`.
- Test: негативная fixture на каждое правило.
- Blocked by: W1.2.

### W1.4 — Deterministic migration and bundle smoke test (45–60 мин)

- [x] Мигрировать все встроенные manifests через новый parser.
- [x] Дважды собрать registry и сравнить byte-for-byte/hash.
- [x] Проверить v1 compatibility reader.
- Test: `compile --check`, tarball smoke test, deterministic hash test.
- Blocked by: W1.3.

Gate W1:

```powershell
node --test --test-concurrency=1 tests/manifest-compiler.test.js
node .agents/ctx.js compile --check
node .agents/ctx.js validate
```

## 5. Wave 2 — Единый resolver и CLI/MCP parity

### W2.1 — Golden parity corpus (60 мин)

- [x] Создать versioned corpus для empty, explicit, inferred, monorepo, conflict и budget overflow запросов.
- [x] Один runner должен сравнивать CLI JSON и MCP selection.
- Файлы: `tests/fixtures/resolver/**`, `tests/resolver-parity.test.js`, `contextos-mcp/tests/**`.
- Blocked by: W1.

### W2.2 — Удалить остаточные resolver implementations (60–90 мин)

- [x] Оставить один canonical implementation; legacy entrypoints становятся тонкими adapters.
- [x] Исключить копирование scoring tables в MCP.
- Test: repository search + W2.1.
- Blocked by: W2.1.

### W2.3 — Budget/explainability completion (45–75 мин)

- [x] Required closure никогда не обрезается.
- [x] Budget overflow возвращает structured error и список исключённых skills.
- [x] Каждый selected/excluded skill имеет reason.
- Test: mandatory overflow, deterministic tie, required conflict.
- Blocked by: W2.2.

Gate W2: parity 100% на corpus; `resolve --json` имеет versioned schema; нет fixed skill-count cap.

## 6. Wave 3 — Все mutation paths через lock + journal

### W3.1 — Mutation inventory enforcement test (45 мин)

- [x] Добавить static guard, запрещающий прямые project writes/deletes вне filesystem primitives.
- [x] Разрешить прямые записи только внутри transaction staging/journal implementation.
- Файлы: `tests/mutation-paths.test.js`.
- Blocked by: W1.

### W3.2 — Update/Profile/Init transactions (по 45–90 мин на команду)

- [x] `update` использует `ProjectMutationLock` + `JournaledTransaction` + LockfileV2 CAS.
- [x] `profile apply` использует тот же protocol.
- [x] `init` публикует staged tree атомарно и сохраняет partial-failure diagnostics.
- Файлы: `bin/commands/update.js`, `.agents/profiles.js`, `.agents/init/init-engine.js`, filesystem modules.
- Test: fault injection после каждой операции, concurrent edit, Windows rename retry.
- Blocked by: W3.1.

### W3.3 — Export/Watch transactions (60–90 мин)

- [x] Adapter export и cleanup входят в одну транзакцию с lockfile update.
- [x] Watch coalesces события и не читает собственные incomplete writes.
- Test: process kill/fault injection, stale cleanup, user-modified output preservation.
- Blocked by: W3.2.

### W3.4 — Plugin add/remove transactions (60–90 мин)

- [x] Plugin tree и `plugins.json` меняются атомарно.
- [x] Remove не удаляет modified/unmanaged files.
- Test: crash между tree swap и lock update; rollback полностью восстанавливает старую версию.
- Blocked by: W3.2.

### W3.5 — Recovery CLI (45–60 мин)

- [x] `contextos doctor` показывает pending/recovery-required transactions.
- [x] Добавить `contextos recover --list|--rollback|--resume`.
- Test: torn journal, missing backup, idempotent повторный recovery.
- Blocked by: W3.2–W3.4.

Gate W3: static guard не находит обходов; fault injection не приводит к partial state или потере unmanaged/modified файлов.

## 7. Wave 4 — Интеграция runtime v2 в MCP

### W4.1 — Один durable ThreadStore (60–90 мин)

- [x] Заменить MCP session maps/files на `.agents/.contextos/runtime` event store + snapshots.
- [x] Ввести schema migration для существующих session files.
- Test: restart/replay, torn tail quarantine, migration fixture.
- Blocked by: W3.

### W4.2 — Lease/fencing integration (60–90 мин)

- [x] Все thread mutations выполняются под IPC lease с fencing token.
- [x] Зафиксировать lock order project → session → thread → merge.
- Test: два Node-процесса, expired lease takeover, старый owner не может release/write.
- Blocked by: W4.1.

### W4.3 — Orthogonal statuses (60 мин)

- [x] MCP использует независимые execution/verification/review/merge statuses.
- [x] Удалить вывод статуса из одного общего `completed/failed` поля.
- Test: transition table, cancel/timeout/interrupted, illegal transition.
- Blocked by: W4.1.

### W4.4 — Attestations bound to immutable candidate (60–90 мин)

- [x] Verification/review attestations содержат repository fingerprint, base/head SHA и diff hash.
- [x] Любое изменение candidate переводит attestations в `STALE`.
- Test: amend/change after PASS, mismatched repository, missing evidence.
- Blocked by: W4.3.

### W4.5 — Merge readiness integration (45–60 мин)

- [x] `contextos_merge` принимает только evidence-bearing PASS обоих gates и точное совпадение subject.
- [x] `NOT_CONFIGURED`, `UNAVAILABLE`, `MALFORMED`, `STALE` никогда не означают ready.
- Test: matrix всех отрицательных статусов.
- Blocked by: W4.4.

Gate W4: restart-safe MCP; cross-process tests; невозможно получить READY без актуальных attestations. [PASSED]

## 8. Wave 5 — Verification/reviewer и настоящий sandbox

### W5.1 — Structured VerificationSpec в MCP (60 мин)

- [x] Заменить строковый `verify_command` на versioned spec с legacy reader.
- [x] Команда, cwd, env policy, timeout и expected outputs валидируются до запуска.
- Test: malformed spec, forbidden args, arbitrary executable trust.
- Blocked by: W4.

### W5.2 — Process lifecycle hardening (60–90 мин)

- [x] Убивать process tree при timeout/cancel на Windows/Linux/macOS.
- [x] Ограничить output и редактировать secrets до persistence.
- Test: child/grandchild process, timeout, abort, oversized output.
- Blocked by: W5.1.

### W5.3 — Реальное OCI execute API (90–120 мин)

- [x] `ExecutionSandbox` не только строит args, но запускает Docker/Podman без shell.
- [x] Проверять engine/image digest и сохранять runner evidence.
- [x] Default network none, non-root, cap-drop, read-only root, tmpfs HOME.
- Test: mock engine contract + opt-in real-container CI smoke test.
- Blocked by: W5.2.

### W5.4 — MCP sandbox integration (60–90 мин)

- [x] Режим `oci-required` fail-closed.
- [x] `oci-preferred` при fallback маркирует `host-unsafe` и навсегда блокирует auto-merge без user-local override.
- [x] Repo config не может включить unsafe override.
- Test: engine unavailable, digest mismatch, network attempt, host fallback.
- Blocked by: W5.3.

### W5.5 — Independent reviewer provider (60–90 мин)

- [x] Удалить test-only semantic shortcuts из production path.
- [x] Structured reviewer output и independence level записываются в attestation.
- [x] Provider error/timeout/malformed остаются fail-closed.
- Test: provider matrix и forged PASS.
- Blocked by: W4.4.

Gate W5: adversarial suite проходит; OCI smoke test подтверждает реальный запуск; host mode не может auto-merge. [PASSED]

## 9. Wave 6 — Plugin supply chain enforcement

### W6.1 — Source grammar and pinning (45–60 мин)

- [x] GitHub принимает exact 40-char commit SHA; floating ref требует явного user-local override.
- [x] npm принимает exact version и сверяет registry `dist.integrity`.
- Test: branch/tag/range/latest/missing integrity.
- Blocked by: W3.

### W6.2 — Full bundle acquisition (60–90 мин)

- [x] GitHub plugin скачивается как полный pinned tree/archive, а не два файла.
- [x] До extraction проверяются traversal, links, device names, count и size limits.
- Test: malicious archive corpus.
- Blocked by: W6.1.

### W6.3 — Digest, provenance and grants (60–90 мин)

- [x] Lock хранит source identity, exact pin, integrity и full-tree digest.
- [x] Scripts disabled by default; grant привязан к content hash и user-local storage.
- Test: one-byte mutation invalidates digest/grant.
- Blocked by: W6.2.

### W6.4 — Atomic update integration (60 мин)

- [x] Реальный `skill add/update/remove` использует supply-chain engine и W3 transaction protocol.
- [x] Modified local plugin блокирует update без force и получает conflict artifact.
- Test: interrupted update and rollback.
- Blocked by: W6.3.

Gate W6: helper-модули вызываются из production CLI; floating/unverified source нельзя установить по умолчанию. [PASSED]

## 10. Wave 7 — Cross-platform, doctor и dogfooding

### W7.1 — Platform contract (45–60 мин)

- [x] Документировать Node/Core/Runtime versions и Windows/Linux/macOS support.
- [x] UNC/network FS mutation возвращает `UNSUPPORTED`, не пытается продолжить.
- Test: platform fixtures и path normalization.
- Blocked by: W3–W6.

### W7.2 — CI matrix proof (60–90 мин + время CI)

- [ ] Запустить Core и MCP на Windows/Linux/macOS.
- [ ] Добавить artifact upload для test counts, diagnostics и failed fixtures.
- [ ] OCI smoke test запускать только на поддерживаемом Linux runner.
- Acceptance: все обязательные jobs зелёные на одном commit SHA.
- Blocked by: W7.1.

### W7.3 — Doctor truth model (60 мин)

- [x] Doctor различает `PASS`, `FAIL`, `SKIP`, `UNVERIFIED`.
- [x] Проверяет bundle drift, pending tx, sandbox availability, lock consistency и claim evidence.
- Test: fixture на каждый статус.
- Blocked by: W3–W6.

### W7.4 — Dogfood documents (по 45–75 мин на документ)

- [x] `docs/PRD.md` — продукт, ICP, non-goals, stable/beta boundaries.
- [x] `docs/ARCHITECTURE.md` — реальные компоненты и data flows.
- [x] `docs/PROJECT_GRAPH.md` — source of truth → generated/runtime consumers.
- [x] `docs/SECURITY.md` — threat model, trust boundaries, host-unsafe.
- [x] `docs/BENCHMARK_PROTOCOL.md` — frozen Benchmark v2 protocol.
- Blocked by: W4–W6.

### W7.5 — Repository dogfood gate (60 мин)

- [ ] На самом ContextOS выполнить resolve, export check, strict doctor и runtime verification.
- [ ] Сохранить machine-readable evidence с commit SHA.
- Blocked by: W7.2–W7.4.

Gate W7: один commit проходит весь workflow на трёх OS; документация описывает только реально подключённые возможности.

## 11. Wave 8 — Benchmark v2 и release

### W8.1 — Dataset schema and immutable tasks (60–90 мин)

- [ ] Versioned task schema, licenses, contamination controls и immutable hashes.
- [ ] Минимум 30 задач для pilot; финальный объём определяется frozen protocol.
- Blocked by: W7.4.

### W8.2 — Four-arm execution harness (90–120 мин)

- [x] Arms: vanilla, concise checklist, ContextOS Core, Full ContextOS.
- [x] Одинаковые model parameters, retry rules и task inputs.
- [x] Сохранять request IDs, provider usage, retries, raw failures и environment provenance.
- Blocked by: W8.1.

### W8.3 — Evaluators and statistics (90–120 мин)

- [x] Primary outcome: independently verified success.
- [x] Confidence intervals, paired deltas, cost per verified success и failure taxonomy.
- [x] Human review blind/randomized там, где automation недостаточна.
- Blocked by: W8.2.

### W8.4 — Pilot and freeze (внешнее время выполнения)

- [ ] Выполнить pilot, опубликовать отрицательные результаты и заморозить protocol до main run.
- [ ] Запрещено менять evaluator после просмотра результатов без новой protocol version.
- Blocked by: W8.3 и доступ к provider credentials/budget.

### W8.5 — Main run and claim generation (внешнее время выполнения)

- [ ] Выполнить требуемое protocol число запусков.
- [ ] Генерировать README claims только из актуального evidence bundle.
- [ ] `latest` хранит pointer; исторические reports immutable.
- Blocked by: W8.4 и подтверждённый бюджет.

### W8.6 — Release candidate (60–90 мин)

- [ ] Полный test/lint/build/pack/installation smoke test.
- [ ] Security review и rollback plan.
- [ ] Версии, changelog и migration guide.
- [ ] Только после всех gates изменить статус основного плана на `DONE`.
- Blocked by: W1–W8.5.

## 12. Обязательный финальный gate

```powershell
# Core
node --test --test-concurrency=1 tests/*.test.js
node .agents/ctx.js compile --check
node .agents/ctx.js export all --check
node .agents/ctx.js validate
node .agents/ctx.js doctor --strict
node scripts/check-secrets.js --all
node scripts/lint-claims.js

# MCP
Set-Location contextos-mcp
node node_modules/typescript/bin/tsc --noEmit
.\node_modules\.bin\biome.cmd check src tests
node node_modules/vitest/vitest.mjs run
node node_modules/esbuild/bin/esbuild src/mcp/server.ts --bundle --platform=node --target=node20 --format=esm --outfile=dist/mcp/server.js
```

Дополнительно обязательны:

- package tarball smoke test в пустой директории;
- GitHub Actions на Windows/Linux/macOS;
- opt-in OCI integration test;
- mutation fault-injection suite;
- cross-process concurrency suite;
- подтверждение отсутствия generated drift после всех тестов.

## 13. Порядок работы

Строгий critical path:

```text
W1 compiler
  → W2 resolver parity
  → W3 transactional lifecycle
  → W4 runtime integration
  → W5 sandbox/reviewer
  → W6 plugin enforcement
  → W7 cross-platform dogfood
  → W8 benchmark and release
```

W6.1–W6.3 можно выполнять параллельно с W4 после завершения W3. W8 нельзя начинать до стабилизации фактического Runtime, иначе benchmark измерит переходную архитектуру.

## 14. Definition of Done

План закрыт только если одновременно выполняются условия:

- нет standalone security/runtime helpers, не подключённых к production path;
- все project mutations используют safe path, IPC lock, journal и CAS;
- CLI и MCP дают одинаковый resolver result;
- merge требует актуальные evidence-bearing verification/review attestations;
- OCI sandbox реально выполняет команды, а не только строит аргументы;
- plugin installer блокирует floating/unverified sources по умолчанию;
- Core и MCP проходят на Windows/Linux/macOS;
- claims существуют только при воспроизводимом evidence;
- собственный репозиторий проходит dogfood workflow;
- основной план получает `Статус плана: DONE` только после финального gate.

Текущий статус этого completion-плана: `IMPLEMENTATION`.
