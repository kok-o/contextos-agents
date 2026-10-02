# Подробный план развития ContextOS

Дата плана: 30 сентября 2026 года. Текущий статус обновлён 2 октября 2026 года.

## Актуальная очередь R2

Основные изменения core/MCP и локальная установка выполнены. Подготовка R2
ещё не завершена. Текущий источник статусов:
[подготовка релиза](docs/R2_RELEASE_PREPARATION.md),
[разбор MCP skips](docs/MCP_SKIPPED_TESTS.md),
[migration/rollback](docs/COMPACT_CONTEXT_MIGRATION.md).

1. Согласовать планы, roadmap и границы поддержки с фактическим поведением.
2. Разобрать 25 исходных MCP skips и проверить stable read-only сценарии.
3. Проверить переход core 2.2.0 / MCP 0.3.1 → кандидаты и checkpoint rollback.
4. Выполнить удалённый CI Windows/Linux/macOS с логами и archive artifacts.
5. После клиентского пилота и CI собрать кандидат одной проверенной ревизии;
   решение о публикации принять отдельно.

Измерения качества, стоимости и длинных сессий на паузе до явного запроса.
AST-графы, swarm и расширение каталога вне текущего фронта.

Основание: [независимая проверка текущего рабочего дерева](docs/INDEPENDENT_REVIEW_2026-09-30.md). Предыдущий [план стабилизации](IMPROVEMENT_PLAN.md) сохраняется как история уже проведённых исправлений. План ниже сохраняет исходные критерии; выполненные работы и ограничения описаны в [отчёте реализации](docs/IMPLEMENTATION_STATUS_2026-09-30.md).

## 1. Цель и ожидаемый результат

Сделать ContextOS надёжным способом хранить общие инженерные инструкции, доставлять их в разные ИИ-клиенты и проверять синхронизацию в CI. Уменьшить объём постоянно загружаемых инструкций, сохранив важные правила и проверку опасных изменений.

Результат должен проявляться в пользовательском проекте:

1. Установка и обновление сохраняют пользовательские файлы и инструкции.
2. Сторонние clones и runtime worktrees не меняют сведения о целевом workspace.
3. Простая задача не требует загрузки длинных руководств по фазам, ролям и архитектуре.
4. Для security, migration и destructive задач сохраняются необходимые ограничения независимо от желаемого бюджета.
5. Resolver явно объясняет выбор, исключения, зависимости и превышение бюджета.
6. Конечный export и runtime prompt соответствуют заявленному контракту.
7. Поддержка клиента подтверждается проверкой загрузки; генерация файла учитывается отдельно.
8. Заявления о снижении затрат или росте качества опираются на сохранённые результаты сравнения.

### Два технических результата

- **R1 — стабилизация:** исправленные discovery/ENOBUFS и MCP lint, воспроизводимые обязательные проверки. Форматы контекста существенно не меняются.
- **R2 — компактный контекст:** короткий bootstrap, согласованные selection/export/runtime, проверенные клиентские сценарии и безопасная миграция.

R1 можно готовить независимо от платных LLM-бенчмарков и поиска пользователей. R2 можно оценивать по контрактам и поведению загрузчиков; обещание экономии требует отдельного этапа измерений.

### Вне текущей реализации

Tree-sitter knowledge graph, автоматический Reflect/learn, массовый перенос сторонних навыков, новая swarm-архитектура, облачный сервис, биллинг и расширение каталога не входят в R1/R2. Исследования этих направлений описаны в конце плана.

После подготовки плана пользователь разрешил реализацию и OpenAI API-прогоны в пределах $10. Публичная публикация и сообщения внешним пользователям не запрошены. Текущий ход реализации фиксируется в `docs/IMPLEMENTATION_STATUS_2026-09-30.md`.

## 2. Отправная точка

Проверено рабочее дерево `contextos-agents` 2.2.0 / `@contextos/mcp` 0.3.1 на Windows, Node 22.14.0. HEAD `75608ffb6c5b6ae1b37029bdd015eae3e39c9705` дополняют существующие незакоммиченные изменения.

| Показатель | Проверенный результат | Значение для плана |
| --- | --- | --- |
| Root tests | 488 passed в полном прогоне; оставшиеся 2 passed в перепроверке после устранения Git ownership ограничения | Не обещать единый green run до новой полной проверки |
| MCP после build | 589 passed, 34 skipped | Составить список skipped и объяснить область покрытия |
| MCP lint | exit 1, 9 errors | Блокер R1 для MCP |
| Catalog validate | 7 core + 36 catalog, 0 errors/warnings | Сохранять общий discovery и валидацию |
| Export drift | 123 artifacts, 0 findings | Сохранить воспроизводимость и идемпотентность |
| Contaminated graph | 502 packages, 500 из `.external-skills` | Исправить область discovery |
| Resolver JSON | ENOBUFS при стандартном execFileSync | Проверить обычный consumer без увеличения maxBuffer |
| Cursor alwaysApply | 51 939 символов в пяти файлах | Baseline для сокращения постоянного контекста |
| Routine foundations | 4 895 estimated tokens даже при budget 1000 | Пересмотреть обязательную загрузку полных foundations |
| MCP prompt | 16 038 символов, присутствует обрезка правил | Согласовать бюджет и сохранность обязательных правил |

Символы, estimated tokens и фактический API usage — разные метрики. Их нельзя подменять друг другом. Тестовый baseline подтверждает проверенные случаи, а не универсальную безошибочность.

## 3. Последовательность, зависимости и оценка

Оценки даны для одного инженера, знакомого с проектом. Это часы сосредоточенной работы; ожидание CI, клиентских установок, внешних пользователей и provider limits считается отдельно. Каждую задачу выполнять отдельным проверяемым шагом, ориентировочно 0,5–2 часа; крупную задачу дробить до начала изменения.

| Этап | Результат | Зависит от | Оценка |
| --- | --- | --- | ---: |
| 0 | Воспроизводимая исходная точка и пакет доказательств | Нет | 2–3 ч |
| 1 | Discovery и MCP CI исправлены; R1 подготовлен | 0 | 6–10 ч |
| 2 | Короткий bootstrap и согласованные workflows | 1 | 10–16 ч |
| 3 | Общий контракт selection и runtime prompt | 2 | 8–12 ч |
| 4 | Реальная загрузка двух клиентов и consumer lifecycle | 2; финальная проверка после 3 | 8–14 ч |
| 5 | Пакетирование, документация и кандидат R2 | 3, 4 | 5–8 ч |
| 6 | Измерение качества и стоимости | 5; для API нужен согласованный бюджет | 10–16 ч |
| 7 | Пользовательский пилот и решение о следующем направлении | R1 либо R2; финальная оценка после 6 | 6–10 ч + 2 недели наблюдения |

Подготовка R2: **39–63 часа**, ориентировочно 8–13 рабочих дней при пяти часах сосредоточенной работы в день. Измерения и подготовка/анализ пилота добавят **16–26 часов**. Общий объём: **55–89 часов**, без обещания фиксированного календарного срока.

R1 — первый самостоятельный рубеж после этапов 0–1: **8–13 часов**. Если доступно мало времени, сначала завершить именно его.

## 4. Этап 0 — зафиксировать исходное состояние

### Работы

| ID | Действие | Файлы/артефакты | Оценка |
| --- | --- | --- | ---: |
| 0.1 | Зафиксировать HEAD, Node/npm/Git versions, изменённые и неотслеживаемые файлы; отделить текущую работу от будущих изменений | Пакет evidence вне production source | 0,5 ч |
| 0.2 | Повторить обязательные проверки в копии, учитывающей текущие изменения, с рабочим локальным npm cache | Root/MCP logs, exit codes, manifests | 1–1,5 ч |
| 0.3 | Перенести существенные независимые probes из scratch в сопровождаемые regression fixtures; сохранить компактный baseline | `tests/`, `benchmarks/evidence/`, тестовые fixtures | 0,5–1 ч |

### Правила выполнения

- Не выполнять reset/stash/checkout поверх существующих изменений и не объединять их с новым diff без проверки.
- В случае отдельного checkout явно указать, какие незакоммиченные файлы в него перенесены. Чистая копия HEAD не представляет текущее рабочее дерево.
- Не переносить `.external-skills`, cache, secrets и generated MCP dist в clean-source snapshot. Загрязнённый discovery проверять отдельно в controlled fixture и исходном checkout.
- Проверки root parity выполнить сначала без предварительно созданного MCP dist; MCP build/test — затем. Не запускать их одновременно в одной копии, если один процесс меняет dist, который читает другой.
- Git safe.directory при необходимости ограничивать конкретной копией и окружением процесса. Не добавлять глобальное `*`.
- Отчёт должен включать exit code, command, version, дату, область проверки и объяснение skipped.

### Приёмка

- [ ] Другой инженер может повторить исходные проверки по сохранённым командам.
- [ ] Исходные незакоммиченные изменения сохранены.
- [ ] ENOBUFS, alwaysApply размер и runtime truncation представлены отдельными воспроизводимыми probes.
- [ ] Доказательства, необходимые для ревью, доступны вне только игнорируемой scratch-папки; секреты в них отсутствуют.

## 5. Этап 1 — исправить подтверждённые ошибки и подготовить R1

### 1A. Workspace discovery

Основные файлы: `.agents/workspace/workspace-graph.js`, `.agents/schemas/workspace.graph.schema.json` при изменении формата, `.agents/resolver/canonical-resolver.js`, `.agents/ctx.js`, `tests/workspace-graph.test.js`, `tests/canonical-resolver.test.js`, `tests/cli-registry.test.js`, `tests/resolver-parity.test.js`.

| ID | Действие | Проверка | Оценка |
| --- | --- | --- | ---: |
| 1.1 | Исключить `.external-skills`, `.swarm-worktrees` и другие уже зарезервированные runtime directories | Один fixture до/после добавления чужого clone даёт одинаковые selection/evidence/fingerprint | 1 ч |
| 1.2 | Определить и реализовать правило для nested repositories и declared workspaces; применить сейчас неиспользуемый `isDeclared`, если это следует из контракта | Сохраняются легитимные packages; nested clone исключён; явно объявленный package не теряется | 1–2 ч |
| 1.3 | Сделать обход действительно ограниченным по packages/depth; partial и diagnostics должны показывать срабатывание лимита | Пакетов не больше заданного maxPackages; повторные builds детерминированы | 1 ч |
| 1.4 | Отделить компактный resolve-result от полной graph diagnostics, сохранив совместимость JSON | Default execFileSync не переполняется; полный graph доступен явно; схема/миграция документированы | 1–2 ч |

Предпочтительное правило: зарезервированные каталоги исключены всегда; declared workspaces имеют приоритет; nested Git repositories не включаются без явного включения. Как обрабатывать остальные Git-ignored каталоги, решить после проверки текущих consumer сценариев. Не вводить полный собственный gitignore parser без доказанной необходимости; игнорируемые manifests могут быть нужны пользователю.

Удаление `workspaceGraph` из существующего JSON — потенциальное изменение публичного контракта. Для R1 достаточно устранить загрязнение; более широкий переход к summary/detail можно перенести в R2 с документированным режимом совместимости. Увеличение maxBuffer не заменяет исправление discovery.

### 1B. MCP lint и обработка ошибок

Основные файлы: `contextos-mcp/src/mcp/session.ts`, `src/mcp/state.ts`, `src/mcp/tools/contextos.ts`, `src/worktree/manager.ts`, `tests/read-only-inspection.test.ts`, `tests/unit/contextos-tools.test.ts` внутри MCP.

| ID | Действие | Проверка | Оценка |
| --- | --- | --- | ---: |
| 1.5 | Применить formatter только к затронутым файлам; исправить обязательные lint errors | MCP lint exit 0; diff не содержит массового несвязанного форматирования | 0,5–1 ч |
| 1.6 | Устранить throw внутри finally в readWorktreeDiff с сохранением cleanup и исходной ошибки | Успех, ошибка Git и ошибка cleanup; index/object store не изменяются | 1 ч |
| 1.7 | Выполнить связанные tests, затем обязательные build/typecheck/test/lint | Green commands с сохранёнными logs; skipped объяснены | 0,5–1 ч |

### Приёмка R1

- [ ] Чужой clone не становится evidence целевого проекта.
- [ ] Легитимные monorepo packages и polyglot fixtures обнаруживаются.
- [ ] JSON resolve текущего проекта читается consumer со стандартным буфером.
- [ ] Scanner не выходит из repository через symlink; existing containment tests проходят.
- [ ] MCP lint/build/tests проходят; исходная ошибка readWorktreeDiff не маскируется cleanup.
- [ ] Core tests, catalog validation и tarball consumer checks проходят после изменений.
- [ ] Сохранение пользовательских инструкций, read-only inspection и ownership safeguards не ухудшились.

## 6. Этап 2 — короткий bootstrap и согласованные workflows

### Целевой контракт

Постоянно доступный bootstrap объясняет только: где искать проектные правила, как ограничить область изменения, когда необходима дополнительная проверка и как сообщать результат. Подробные руководства по фазам/ролям/доменам загружаются по соответствующей задаче.

**Предлагаемые критерии размера для R2**, которые являются целями реализации, а не существующими гарантиями:

- ContextOS-generated always-on Cursor instructions: не более **6 000 символов** суммарно в стандартном новом consumer.
- Общий bootstrap: не более **4 800 символов**; приблизительная token оценка показывается отдельно.
- Routine typo selection не включает полные `gstack-roles`, `gemini-precision`, `ponytail-mindset` или полный шестистадийный workflow без конкретной причины.
- Пользовательские always-on instructions не входят в эти ограничения и не сокращаются ContextOS.
- Размеры link indexes и skill metadata измеряются отдельно от bodies.

Если обязательные инварианты не удаётся сохранить в лимите, сначала переработать структуру/router. Изменять лимит можно только с объяснением в отчёте, а не путём удаления необходимых правил.

### Работы

Основные файлы: `.agents/AGENTS.md`, `.agents/core/skills/engineering-workflow/`, `gstack-roles/`, `ponytail-mindset/`, `gemini-precision/`, `context-os/`, `context-manager/`, `.agents/resolver/canonical-resolver.js`, `.agents/adapters/cursor/export.js`, остальные затронутые adapters, manifests/resources и tests.

| ID | Действие | Проверка | Оценка |
| --- | --- | --- | ---: |
| 2.1 | Составить карту повторяющихся правил и конфликтов; выделить bootstrap/domain/workflow/reference | Для каждого обязательного правила записано, где оно остаётся и когда загружается | 1–2 ч |
| 2.2 | Создать короткий bootstrap и вынести подробные этапы в declared references | Все ссылки существуют; нет дублированных полных workflows | 1–2 ч |
| 2.3 | Сделать entrypoint engineering-workflow маршрутизатором routine/standard/high/destructive | Typo, feature, auth/migration и destructive cases выбирают корректный путь | 1–2 ч |
| 2.4 | Убрать обязательную загрузку полного role catalog; сохранить targeted role guidance | Простая задача не требует role ceremony; review получает релевантные критерии | 1 ч |
| 2.5 | Подключать ponytail только к реализации, Gemini-specific guidance — по целевому клиенту | Review/doc-only случаи не получают неуместную guidance; required deps сохранены | 1–2 ч |
| 2.6 | Обновить Cursor alwaysApply и другие affected exports | Финальные artifacts укладываются в лимиты; globs/metadata корректны | 1–2 ч |
| 2.7 | Обновить manifests/resources; регенерировать outputs штатным compiler | Первый и повторный export/check проходят; refs копируются во все нужные targets | 1–2 ч |
| 2.8 | Проверить legacy consumers, overrides и profile exclusions после изменения структуры | Уникальное пользовательское правило сохраняется после update/export; orphan resources защищены | 1–2 ч |

### Важные решения

- Не удалять существующие skill IDs в R2 только ради устранения повторений. При необходимости оставить compatibility entrypoints и aliases; удаление требует отдельной миграции.
- Canonical source редактировать в core/project override. Generated files изменять только compiler/export.
- Routine diagnostics и прямые вопросы не должны запускать spec/plan approval ceremony. Для рискованных изменений сохранять требование понятных границ и нужного разрешения.
- Не обещать одинаковое поведение разных моделей от одной длины Markdown. Проверять router activation и конечный результат.

### Приёмка

- [ ] Выполнены лимиты размера без потери обязательных инвариантов.
- [ ] В bootstrap и skills нет взаимоисключающих инструкций про fast-track/все фазы.
- [ ] Security guidance сохраняется для auth/security задач.
- [ ] У каждого reference/resource есть доступный конечный путь после npm install/export.
- [ ] Пользовательские overrides работают и не теряются при миграции.
- [ ] Сравнение до/после включает конечные exports, выбранные навыки и конкретные обязательные правила.

## 7. Этап 3 — единый контракт selection, budgets и runtime prompt

### Сначала определить поведение

Stable export создаёт совместимые skills/indexes/rules. Он не должен обещать контроль истории внешнего клиента или обязательное применение resolver к каждому запросу. Task resolution — отдельный явный контракт, который runtime действительно использует.

Resolver result должен сохранять selection, причины, dependencies, risk/workflow, estimated size, превышение бюджета и исключённые элементы. Runtime assembler получает этот результат и сообщает фактически загруженные файлы, размеры и diagnostics.

### Работы

Основные файлы: `.agents/resolver/canonical-resolver.js`, `.agents/ctx.js`, `contextos-mcp/src/contextos/selector.ts`, `src/contextos/loader.ts`, `src/mcp/tools/contextos.ts`, `tests/canonical-resolver.test.js`, `tests/resolver-parity.test.js`, MCP `tests/unit/selector.test.ts`, `tests/unit/prompt.test.ts`.

| ID | Действие | Проверка | Оценка |
| --- | --- | --- | ---: |
| 3.1 | Описать JSON contract и required/optional policy; определить classifier errors | Одинаковые requests через CLI и runtime дают одинаковые IDs/diagnostics | 1–2 ч |
| 3.2 | Проверить CLI argument parsing: значения --files/--phase/--budget не должны попадать в task text | Task сохраняется дословно, flags валидируются, invalid budget даёт понятную ошибку | 0,5–1 ч |
| 3.3 | Отделить компактные обязательные инварианты от optional skill bodies; определить safety priority | При budget 1000 auth case сохраняет required guidance или явно сообщает невозможность сборки | 1–2 ч |
| 3.4 | Передавать budget/exclusion/warning diagnostics через selector и runtime caller | Ни один warning не исчезает при преобразовании результата | 1 ч |
| 3.5 | Убрать произвольное slice обязательных rules; сохранять целые sections/resources | Обязательный marker в конце rules section присутствует в конечном prompt; dependencies не исчезают | 1–2 ч |
| 3.6 | Добавить structured assembly report: source paths/hashes, chars, loaded/omitted, overflow | Размер report соответствует фактическому prompt; budget включает bootstrap и wrappers | 1–2 ч |
| 3.7 | Проверить meaningful small-budget, missing-resource и unsafe-path cases | Без silent omissions; безопасная ошибка/diagnostic определены контрактом | 1 ч |

CLI parsing в 3.2 — дополнительная проверка замеченного участка кода, а не уже воспроизведённый новый release blocker.

### Политика превышения бюджета

- Estimated tokens — эвристика. Не называть их точным расходом модели.
- Soft budget может быть превышен обязательными инвариантами/dependencies; caller получает явный overflow и полную причину.
- Если caller задаёт hard limit и mandatory context не помещается, сборка возвращает структурированный отказ до запуска агента.
- Optional context можно исключить целиком с recorded reason. Нельзя отрезать половину обязательного правила.
- Chat history, tool output, client/system instructions и provider usage находятся вне resolver budget; это явно отражается в интерфейсе.
- Не добавлять универсальный tokenizer dependency только ради красивой цифры. Для фактического usage применять provider telemetry на этапе 6.

### Приёмка

- [ ] CLI/runtime parity покрывает routine, standard, auth, migration, destructive, conflicts, profile exclusions и overflow.
- [ ] Dependency closure сохраняется после budgeting.
- [ ] Missing required resource вызывает понятный fail/diagnostic, а не тихое продолжение.
- [ ] No truncation marker означает реальное сохранение обязательного содержимого, что подтверждает behavioral probe.
- [ ] Assembly report проверяется на фактическом prompt и допускает повторное воспроизведение.

## 8. Этап 4 — реальные клиенты и lifecycle пользовательского проекта

Первые два клиента для проверки: **Codex и Cursor**. Они соответствуют существующему skills path и воспроизведённой проблеме alwaysApply. Проверку остальных клиентов проводить отдельными шагами после этого; шесть live integrations не являются обязательным условием первой ограниченной R2 поставки.

### Работы

Основные файлы: `.agents/adapters/shared.js`, `cursor/export.js`, `gemini/export.js` как существующий производитель `.agents/skills`, `claude/export.js` при найденной проблеме, `bin/index.js`, `.agents/init/init-engine.js` при необходимых installation changes, `docs/ADAPTER_COMPATIBILITY.md`, `tests/adapter-compatibility.test.js`, `tests/consumer-init.test.js`, `tests/consumer-stabilization.test.js`, `tests/tarball-smoke.test.js`.

| ID | Действие | Проверка | Оценка |
| --- | --- | --- | ---: |
| 4.1 | Зафиксировать версии клиентов и сценарий acceptance с уникальной consumer-only инструкцией | Есть повторяемый protocol и expected result, без использования package-only текста как доказательства | 1 ч |
| 4.2 | Проверить Codex discovery уже существующих `.agents/skills` и загрузку supporting reference | Навык обнаружен, выбран для нужной задачи, marker instruction выполнена; нерелевантный skill не нужен | 1–2 ч |
| 4.3 | Определить явный install/export target Codex, если он нужен для UX; сохранить root AGENTS.md | Init/update/export не портят пользовательский root file; managed-block/idempotence fixtures проходят | 1–2 ч |
| 4.4 | Проверить Cursor native loading, alwaysApply и scoped globs | Bootstrap действует; targeted rule активируется по нужному файлу; unrelated domain не подмешивается | 1–2 ч |
| 4.5 | Проверить init → add skill → override → export → check → update → uninstall | Пользовательское правило и несвязанные files сохраняются; modified generated output защищён | 1–2 ч |
| 4.6 | Проверить mono/polyglot consumer и вложенный запуск клиента | Ближайший пакет и общий root определяются корректно; чужой clone не влияет | 1–2 ч |
| 4.7 | Обновить compatibility matrix с evidence и ограничениями | Для каждого клиента указаны native/index/manual, version, date, source/export/loading status | 1 ч |

Codex уже поддерживает repository `.agents/skills`. Новый target, если создаётся, оформляет этот контракт и user instruction preservation. Он не должен дублировать те же skill IDs в нескольких одновременно обнаруживаемых директориях.

Не использовать правило «в generated file есть строка» как доказательство работы клиента. Добавить отрицательный контроль: удалить/изменить consumer-only правило и проверить, что ожидаемый сигнал действительно изменился. Для живой модели один положительный ответ не доказывает надёжную активацию во всех задачах; запись loader discovery и несколько разных сценариев дают более содержательное подтверждение.

### Приёмка

- [ ] Codex и Cursor проверены на зафиксированных версиях; evidence доступно reviewer.
- [ ] Пользовательский root AGENTS.md, CLAUDE.md/Copilot instructions и custom rules сохраняются в применимых сценариях.
- [ ] Existing generated artifacts, references и lockfile корректно мигрируют.
- [ ] Контракт не заявляет live verification клиентов, которые не запускались.
- [ ] Если клиент недоступен, соответствующая интеграция остаётся unverified, а release scope явно сокращён.

## 9. Этап 5 — пакетирование, документация и кандидат R2

### Работы

| ID | Действие | Файлы/проверка | Оценка |
| --- | --- | --- | ---: |
| 5.1 | Привести README/GUIDE/product boundaries к конечному поведению | `README.md`, `GUIDE.md`, `docs/PRODUCT_BOUNDARIES.md`, `docs/ADAPTER_COMPATIBILITY.md` | 1–2 ч |
| 5.2 | Уточнить claims и stats: observed fixtures отдельно от универсальных процентов | `benchmarks/claims.json`, `.agents/stats.js`, `tests/claims-governance.test.js` | 1–2 ч |
| 5.3 | Собрать свежий root/MCP package; установить в пустые consumers | `.bin`, init, resolve, overrides, gate, hooks, resources, MCP handshake | 1–2 ч |
| 5.4 | Выполнить весь release gate и составить release notes/rollback | CI matrix, test logs, миграция, package content diff | 1 ч |
| 5.5 | Выбрать version bump по фактической совместимости и подготовить reviewable release | SemVer, список breaking/default changes, evidence manifest | 0,5–1 ч |

`npm pack --dry-run` проверяет состав архива. Он не заменяет настоящую npm install и запуск installed CLI. Для проверки consumer команды должны выполняться из установленного пакета, а не случайно из корня исходного репозитория.

### Release gate

- [ ] Root tests, catalog validate, examples, Markdown lint и secrets scan проходят.
- [ ] MCP lint → build → tests проходят в штатном порядке.
- [ ] Все skipped перечислены с причиной и исключённым контрактом; важный release scenario нельзя закрыть skipped test.
- [ ] Fresh root install работает без MCP dist и случайных repository-local dependencies.
- [ ] Fresh MCP install проходит protocol handshake после build/pack; runtime opt-in сохранён.
- [ ] Export → check и повторный export воспроизводимы на свежем consumer.
- [ ] Пользовательские файлы сохраняются при installation/update/uninstall.
- [ ] Linux/macOS/Windows checks подтверждены CI либо соответствующая область ограничена в release notes.
- [ ] Подготовлены changelog, migration notes и план возврата предыдущей версии.
- [ ] До публичной публикации сформирован конкретный candidate artifact и результаты для ревью.

R2 готовность по конфигурационным контрактам не означает доказанную экономию денег. Это отдельный gate этапа 6.

## 10. Этап 6 — измерить качество, токены и стоимость

### Дизайн сравнения

Использовать существующий `benchmarks/v2` после проверки его контрактов. Текущие arms a/b/c/d имеют собственные значения; не переименовывать их задним числом и не выдавать существующий core arm за новый task-focused pipeline.

Для нового исследования определить три явно версионированных условия:

1. **Практический baseline:** обычные краткие инструкции проекта и штатный клиент.
2. **Full context:** весь установленный набор skills, с той же задачей и fixture.
3. **R2 focused context:** новый bootstrap и соответствующая задаче загрузка.

Full context — диагностический comparator, а не единственный baseline. Победа над заведомо тяжёлым вариантом не доказывает пользу относительно обычной работы пользователя.

### Работы

Основные файлы: `benchmarks/v2/tasks.js`, `arms/arm-definitions.js`, `harness/prompts.js`, `harness/api-runner.js`, `analysis/statistics.js`, `benchmarks/lib/usage.js`, evaluator/tests, evidence manifests и claims.

| ID | Действие | Проверка | Оценка |
| --- | --- | --- | ---: |
| 6.1 | Зафиксировать arms, model/provider settings и правила сравнения до запуска | Неизменяемый manifest и reproducible prompt hashes | 1–2 ч |
| 6.2 | Подготовить первые 6 задач с behavioral evaluation | Typo, routine bug, feature, auth, migration, monorepo change; есть отрицательные контроли | 1–2 ч |
| 6.3 | Дополнить telemetry input/output/cached/reasoning usage и контекстными diagnostics | Provider usage сохраняется без двойного учёта; unsupported metric помечена unknown | 1–2 ч |
| 6.4 | Сделать dry run и 3 repetitions на задачу/arm на одной фиксированной модели | 6 × 3 × 3 = 54 runs; ошибки/failures не исключены из отчёта | 1–2 ч + ожидание API |
| 6.5 | Анализировать task success, repairs, время и затраты | Raw records, агрегаты, failures, limitations, сравнение с practical baseline | 1–2 ч |
| 6.6 | Расширить до 12 задач при содержательном результате первого раунда | 12 × 3 × 3 = 108 runs; тяжёлые/security cases представлены | 1–2 ч + ожидание API |
| 6.7 | Проверить несколько длинных сессий с одним и тем же клиентом/settings | По каждому turn: loaded instructions, history/tool output, usage; внешняя история не приписывается core | 1–2 ч |
| 6.8 | Опубликовать ограниченный вывод в evidence/claims | Только измеренные populations/models/scenarios; отсутствие результата допустимо | 1–2 ч |

### Ограничение затрат

До платного запуска оценить размер prompts и ожидаемый max output, получить актуальные provider rates, определить максимальную сумму и остановку по spend/errors. Конкретный денежный лимит задаёт пользователь. API keys использовать через окружение/секретное хранилище; не сохранять в CLI arguments, fixtures или logs.

### Приёмка и правила вывода

- [ ] Для каждого run сохранены task, arm, model, settings, source revision, hashes, evaluator result и usage.
- [ ] Поведение оценено executable checks и/или независимой оценкой результата, а не только self-report модели.
- [ ] Простые задачи не ухудшаются, обязательные auth/migration checks не пропущены.
- [ ] Экономия input не компенсируется ростом repair attempts, failure rate или общей стоимости.
- [ ] Выводы по 54/108 runs обозначены как пилотные. Если результат неустойчив, увеличить repetitions до сильных статистических заявлений.
- [ ] Cached tokens, total input и сумма затрат представлены отдельно; найденные differences не объявлены причиной без проверки request assembly.
- [ ] Если R2 не даёт выигрыша против practical baseline, исправить routing/UX и не расширять каталог ради видимого прогресса.

## 11. Этап 7 — пользовательский пилот

### Кого искать и что проверять

3–5 разработчиков или небольших команд, использующих два и более ИИ-клиента в реальной работе. Проверяемая проблема: общие инструкции расходятся, настройки трудно обновлять, непонятно, какой набор правил действительно применён.

Один разработчик с одним клиентом полезен как контроль простоты: инструмент не должен создавать больше настройки, чем экономит.

### Работы

| ID | Действие | Результат | Оценка |
| --- | --- | --- | ---: |
| 7.1 | Подготовить короткий onboarding и ручной сценарий rollback | Установка, одна команда export/check, понятные ограничения | 1–2 ч |
| 7.2 | Подготовить вопросы и invite текст; контакты отправлять только по поручению пользователя | Pain frequency, current workaround, desired outcome | 1 ч |
| 7.3 | Провести первый onboarding и уточнить friction | Время до working export, failed steps, support effort | 1–2 ч |
| 7.4 | Наблюдать 2 недели без скрытого сбора prompts/code | Добровольно предоставленные usage/problems, повторное использование | 1–2 ч активной работы |
| 7.5 | Разобрать результаты и выбрать следующую итерацию | Продолжать narrow product, упростить либо закрыть неподтверждённое направление | 1–2 ч |

Не внедрять product telemetry/server/auth ради первого пилота. Достаточно явного feedback и локальных добровольных evidence exports.

### Признаки полезности

- Пользователи самостоятельно повторяют export/check после первого onboarding.
- Инструмент обнаружил конкретное расхождение инструкций или уменьшил ручную синхронизацию.
- Пользователи могут объяснить пользу на своём примере, а не только назвать проект интересным.
- Дальнейшее использование не зависит от постоянной помощи автора.
- Есть содержательное обсуждение поддержки/внедрения или оплаты. 3–5 участников не доказывают размер рынка.

## 12. Команды проверки

Команды ниже относятся к существующим entrypoints на момент составления плана. Если новый публичный флаг/режим добавляется, сначала реализовать и документировать его; не использовать несуществующую команду как acceptance evidence.

Выполнять мутирующие build/export/tests в выделенной копии либо в checkout, где текущие изменения уже сохранены и понятны. Для PowerShell при необходимости использовать `npm.cmd`.

### Обязательные root проверки

```powershell
npm.cmd ci --ignore-scripts
node .agents/ctx.js validate --catalog
npm.cmd run lint:md
npm.cmd run check:secrets
npm.cmd run test:skills
npm.cmd test
```

`npm ci` использовать только при необходимости подготовить зависимости в выделенном checkout, а не переустанавливать их при каждом targeted check.

### После изменения canonical skills/adapters

```powershell
node .agents/ctx.js compile
node .agents/ctx.js export all
node .agents/ctx.js export all --check --json
node bin/index.js gate --json
```

Эти команды не заменяют проверку installed consumer. Они подтверждают работу исходного checkout.

### Discovery/resolver и сохранение файлов

```powershell
node --test --test-concurrency=1 tests/workspace-graph.test.js tests/canonical-resolver.test.js tests/cli-registry.test.js tests/resolver-parity.test.js
node --test --test-concurrency=1 tests/pure-adapters.test.js tests/consumer-stabilization.test.js tests/consumer-gate.test.js tests/adapter-compatibility.test.js
node --test --test-concurrency=1 tests/consumer-init.test.js tests/tarball-smoke.test.js
```

После создания нового test file добавить его в root script `test`: сейчас список файлов перечислен явно. Иначе локальная targeted проверка не означает участие в CI suite.

### Прямая проверка ENOBUFS без увеличенного maxBuffer

Запускать на fixture с большим чужим clone tree или в checkout с `.external-skills`:

```powershell
node -e "const {execFileSync}=require('node:child_process'); const s=execFileSync(process.execPath,['.agents/ctx.js','resolve','Fix typo in README','--json'],{encoding:'utf8'}); JSON.parse(s); console.log(Buffer.byteLength(s));"
```

Приёмка дополнительно проверяет состав graph/evidence. Успешный JSON parse сам по себе не исключает contamination.

### MCP

```powershell
Push-Location contextos-mcp
try {
  npm.cmd run lint
  if ($LASTEXITCODE -ne 0) { throw 'MCP lint failed' }
  .\node_modules\.bin\tsc.cmd --noEmit
  if ($LASTEXITCODE -ne 0) { throw 'MCP typecheck failed' }
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'MCP build failed' }
  npm.cmd test
  if ($LASTEXITCODE -ne 0) { throw 'MCP tests failed' }
} finally {
  Pop-Location
}
```

### Пакетирование и доступные benchmark modes

```powershell
npm.cmd pack --dry-run
node benchmarks/v2/run.js --help
node benchmarks/v2/run.js --mode chat-pack --arms a,b,c,d --task all
git diff --check
git status --short
```

`chat-pack` создаёт prompts текущего benchmark без платных API calls. Это не тест качества модели и не готовая реализация новых arms этапа 6. Для release после dry-run нужен fresh tarball, настоящая npm install и запуск `.bin` установленного пакета.

Логи сохранять с exit code. Не превращать access/cache/Python ограничения среды в продуктовые failures; их обход и область повторной проверки отражать в evidence.

## 13. Риски, миграция и rollback

| Риск | Как обнаружить | Мера и возврат |
| --- | --- | --- |
| Удаление важного правила при сокращении context | Behavioral required-rule probes, coverage map, auth/migration checks | Вернуть previous router/export; обязательные source rules не удалять |
| Потеря пользовательских instructions | Consumer-only marker до/после update/export/uninstall | Managed blocks, hash preconditions, отказ при конфликте; previous package |
| Изменение JSON/public IDs ломает consumers | Schema/compatibility fixtures и installed consumer CLI | Additive поля/режим legacy; breaking change только с migration notes |
| Discovery исключает настоящий workspace | npm/pnpm + Python/Rust/Go + nested explicit package fixtures | Explicit include policy, понятные diagnostics; revert discovery slice |
| Source registry и runtime prompt расходятся | Source/assembly hashes и parity corpus | Общий result contract, fail на required missing resource |
| Клиент загружает больше инструкций, чем предполагается | Live loader acceptance и file activation evidence | Ограничить compatibility promise; не компенсировать догадкой о cost |
| Сквозной budget скрывает safety guidance | Малый бюджет на auth/destructive fixtures | Required guidance сохранена или hard-limit refusal |
| Package тест случайно использует repo-local files | Fresh installed consumer вне source paths | Заново pack/install; исправить package files/imports |
| Пилотная экономия вызвана задачами/кэшом | Fixed fixtures, paired arms, full raw telemetry | Сузить claim, повторить эксперимент; не обещать универсальный процент |
| Незавершённая миграция оставляет файлы частично изменёнными | Transaction/recovery fixtures | Existing journaled writer, ownership и recovery; без ручного удаления user files |

Rollback для каждого кода изменения: небольшой отдельный diff, сохранённая предыдущая package версия и воспроизводимый consumer fixture. При конфликте пользовательского файла не удалять его автоматически; предложить корректировку override/managed block в пределах согласованной задачи.

## 14. Что делать после R2 и пилота

| Направление | Когда начинать | Первая ограниченная проверка | Когда остановить |
| --- | --- | --- | --- |
| Optional AST graph | Пилоты показывают ошибки подбора файлов, которые не решает package graph/rg | Одно ecosystem, 10 задач; compare file relevance, build time, stale invalidation | Нет улучшения final task success либо поддержка дороже выигрыша |
| Внешний skill import | Пользователи регулярно импортируют навыки вручную | Local folder/pinned revision, provenance/license, safe resources, no script execution | Существующий installer полностью покрывает потребность |
| Deterministic policy checks | Есть повторяемый объективный дефект команды | Одна opt-in policy, false-positive fixtures, использование существующего linter | Политика выражает только вкус или даёт много ложных блокировок |
| Reviewed project memory | ADR/overrides недостаточны и повторяются одни ошибки | Manual propose/review rule с source/scope/expiry/delete | Правила конфликтуют/устаревают быстрее, чем помогают |
| Density profiles | Пользователи жалуются именно на объём ответов | Concise опция на одинаковых tasks; quality и total cost измерены | Меньше output, но больше failures/уточнений |
| Runtime delegation policies | Experimental runtime получил реальных пользователей | Один backend, context/write scope, real provider settings | Markdown policy не обеспечивается кодом или сложность не оправдана |

Не строить все направления одновременно. Следующая итерация должна отвечать на один подтверждённый пользовательский запрос.

## 15. Правило завершения и ближайший шаг

Каждая задача заканчивается небольшим проверяемым результатом: что изменено, какой пользовательский сценарий теперь работает, какая проверка прошла, где evidence и что осталось unverified. Статус DONE ставится после acceptance checks, а не после генерации файлов или запуска процесса.

Исходная последовательность этапов 0–3 выполнена. Ближайшая работа — очередь
подготовки R2 в начале этого документа. Исторические acceptance checklists выше
сохраняют критерии плана; актуальное выполнение фиксируется в отчётах evidence.

Статус документа: **R1 реализован; изменения R2 проверены как локальные release candidates. GPT-4.1-mini сравнение получило 50/54 ответов. Агентный runner для Luna реализован: 20 контролируемых регрессий, три режима, 180 запланированных попыток. Частичный Luna-пилот завершил две задачи во всех ветках; дальнейшие запросы ограничены 50 RPD. Явная загрузка тел в реальный Codex CLI payload подтверждена без inference; ответы модели, Cursor и двухнедельный пользовательский пилот остаются незавершёнными.**

Актуальные команды, бюджет и статус продолжения:
[Luna benchmark protocol](docs/LUNA_BENCHMARK_PROTOCOL.md),
[результаты](docs/LUNA_BENCHMARK_RESULTS_2026-10-01.md).

**Решение пользователя от 1 октября 2026 года:** бенчмарки отложены из-за
проблем с API. Продолжать подготовку продукта и обычную проверку установки;
к benchmark-прогонам возвращаться только по явному запросу пользователя.

**Продуктовый этап 1 октября:** чистый root gate 519/519; MCP 599 passed,
25 skipped; установка свежих обоих npm tarball, project-rule, update/uninstall
и read-only MCP call проверены. Добавлены installed-consumer CI gate, очистка
MCP dist и небольшой onboarding demo. Удалённая CI matrix и реальная работа
правила в клиенте остаются следующим шагом. Evidence:
[release acceptance](docs/RELEASE_ACCEPTANCE_2026-10-01.md).
