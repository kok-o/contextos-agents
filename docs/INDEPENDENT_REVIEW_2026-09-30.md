# Независимая проверка ContextOS — 30 сентября 2026

## Вывод

ContextOS стоит развивать. У проекта есть работающий технический фундамент: манифесты, общий discovery, resolver, экспорт конфигураций, защита пользовательских файлов, транзакции и проверка рассинхронизации. Самое убедительное применение — общие инженерные инструкции для команды с несколькими клиентами ИИ и воспроизводимая проверка этих инструкций в CI.

Ближайшая работа должна укреплять это применение. AST-граф, автоматическая память и оркестрация пока не являются первыми приоритетами. Воспроизведены ошибка discovery/ENOBUFS, неуспешный MCP lint и большой постоянный Cursor-контекст. Runtime дополнительно обрезает выбранные инструкции, хотя stable export сохраняет их целиком. Экономия стоимости или улучшение качества кода относительно обычных инструкций пока не доказаны.

## Что проверено

- Текущие файлы `contextos-agents` 2.2.0 и `@contextos/mcp` 0.3.1 на Windows, Node v22.14.0.
- HEAD: `75608ffb6c5b6ae1b37029bdd015eae3e39c9705`, плюс существовавшие незакоммиченные изменения. Это проверка рабочего дерева, а не только указанного commit и не опубликованного npm-пакета.
- Создан отдельный snapshot 734 файлов из Git tracked/untracked, без игнорируемых сторонних репозиториев и первоначально без MCP dist. Production-код исходного checkout не редактировался.
- Изучены CLI, compiler/discovery, resolver, workspace graph, адаптеры, gate/scanner, MCP selection/loader/inspection, CI, claims и существовавший план стабилизации.
- Проверены полный root suite, MCP suite после сборки, MCP lint/typecheck, catalog validation, текущий drift и независимый consumer export. Root tarball suite включает настоящую локальную npm-установку и проверку CLI/hook.
- Из 31 клонированного стороннего репозитория точечно сверены материалы Graphify, Impeccable и Caveman. Полный аудит всех 31 проектов и семантики всех 36 каталожных навыков не проводился.

Предыдущие аудиты использованы как список гипотез. Перечисленные ниже результаты получены заново. Результаты реального загрузчика IDE, платные LLM-бенчмарки, Linux/macOS execution и коммерческий спрос этой проверкой не установлены.

## Результаты исполнения

| Проверка | Результат и границы |
| --- | --- |
| Catalog validation | 7 core + 36 catalog; 0 errors, 0 warnings |
| Полный root suite | 488 passed, 2 failed; оба падения вызваны Git dubious ownership временного snapshot |
| Перепроверка installer suite | 16/16 passed с process-local safe.directory; включая оба оставшихся случая. Все 490 root cases получили успешный результат, но единого прогона 490/490 в этом аудите нет |
| Tarball/init/parity focused recheck | 17/17 passed после устранения sandbox-ограничений npm/esbuild |
| MCP typecheck | `tsc --noEmit`, exit 0 |
| MCP build | Штатная сборка, exit 0 |
| MCP suite после сборки | 589 passed, 34 skipped; 46 файлов passed, 3 skipped |
| MCP lint | exit 1; 9 errors, 5 warnings, 2 infos |
| Текущий root export check | 123 artifacts, 0 findings, exit 0 |
| Независимый consumer | 123 artifacts; первый и второй export дают 0 drift; пользовательский Copilot-текст до и после managed block сохраняется |
| Live resolve в исходном checkout | `resolve "Fix typo in README" --json` под обычным execFileSync воспроизводит ENOBUFS |
| MCP runtime prompt | Для `security review authentication` собран prompt 16 038 символов с тремя навыками; присутствует маркер обрезки инструкций |

Первый ограниченный root-прогон дал 471 passed, 3 failed, 16 cancelled: npm не мог записать общий cache, esbuild — читать необходимые родительские пути, Python — запуститься. Эти результаты не засчитаны как баги продукта. Перепроверки используют разрешённое выполнение, локальный npm cache и Git safe.directory только в окружении процесса; пользовательская глобальная Git-конфигурация не менялась.

Первый MCP-прогон без полной сборки встретил частичный dist и отсутствие `dist/runtime/thread-store.cjs`. После штатной сборки suite проходит. Это ограничение порядка проверки, а не подтверждённый дефект собранного пакета.

## Подтверждённые проблемы и приоритеты

### 1. P1: Workspace discovery захватывает сторонние репозитории

Источник: `.agents/workspace/workspace-graph.js`, список `DEFAULT_IGNORED_DIRS` и обход в `build()`.

`.external-skills` игнорируется Git, но не workspace scanner. Текущий граф включает 502 пакета, из них 500 — из `.external-skills`. Сериализованный граф занимает 1 347 929 байт. С исключением этой директории: 3 пакета и 2 692 байта. CLI возвращает граф внутри JSON; стандартный буфер `execFileSync` переполняется.

Это влияет не только на размер вывода: чужие зависимости становятся evidence о вашем проекте. Простое увеличение maxBuffer исправляет отдельный consumer, но оставляет неправильную область discovery.

Исправление: явное исключение `.external-skills` и runtime worktrees, настраиваемая политика discovery для вложенных репозиториев, понятное ограничение размера диагностического JSON. Проверить, что вложенный clone не меняет контекст проекта, при этом легитимные workspace packages сохраняются. В коде вычисляется `isDeclared`, но не применяется перед включением пакета — контракт declared workspaces тоже требует проверки.

### 2. P1 для выпуска MCP: Команда lint, обязательная в CI, не проходит

Источник: `.github/workflows/validate-skills.yml` запускает `npm run lint` перед build/test MCP.

Biome сообщает 9 errors. Среди них formatting новых изменений и `lint/correctness/noUnsafeFinally` в `contextos-mcp/src/worktree/manager.ts:59`. Замечание связано с throw внутри finally: он может скрыть первоначальную ошибку. Зелёные build/test не заменяют обязательный lint.

Исправление: привести изменённые файлы к принятому формату и отдельно устранить unsafe finally, затем повторить затронутые проверки. Новые core regression tests уже покрывают полезные пользовательские контракты; их следует сохранить.

### 3. P2: Постоянный контекст слишком тяжёлый для рутинных задач

Источник: `.agents/adapters/cursor/export.js:23` и `:161`; `.agents/AGENTS.md`; foundation selection в canonical resolver.

На свежем consumer Cursor помечает пять файлов `alwaysApply: true`:

| Файл | Символы |
| --- | ---: |
| `00-project-rules.mdc` | 18 626 |
| `engineering-workflow.mdc` | 11 848 |
| `gemini-precision.mdc` | 7 339 |
| `gstack-roles.mdc` | 7 009 |
| `ponytail-mindset.mdc` | 7 117 |
| Всего | 51 939 |

Это размер экспорта, объявленного постоянным, а не измеренный input конкретного запроса Cursor. Live client loading в этом аудите не выполнялся. Здесь повторяются общие workflow/роль/проверки; Gemini-specific precision guidance тоже всегда включается Cursor-адаптером.

Resolver для `Fix typo in README`, даже при бюджете 1000, оставляет `engineering-workflow` и `ponytail-mindset`: 4 895 estimated tokens и честный warning об превышении. Это показывает стоимость foundation, а не реальный токенизатор модели. При столь малом бюджете inferred security skill в проверенной security-задаче исключается, хотя foundations остаются; политику приоритета обязательных safety-инструкций нужно определить отдельно.

Исправление: короткий bootstrap с необходимыми инвариантами и маршрутами к документам; подробные фазы, роли и примеры загружать по задаче. Согласовать routine fast-track: resolver разрешает короткий workflow, а общий AGENTS/gstack содержит категоричные требования пройти все фазы. Размеры foundation и постоянно применяемых файлов должны проверяться как продуктовый контракт. Не вводить механическое усечение обязательных правил.

### 4. P2: Resolver не управляет обычным export, а runtime дополнительно обрезает выбранные skills

Stable export использует `collectSkillDirectories()` с profile filtering. Он не вызывает task-specific `CanonicalResolver.resolve()`. Внешний клиент получает файлы и свою схему активации; выполнение команды resolve отдельно не подключает автоматическую маршрутизацию.

В experimental MCP runtime `contextos-mcp/src/contextos/loader.ts` действует отдельный character budget: 14 000 для skill bodies, fair share между skills и `slice(0, maxLen)`. В проверенном prompt присутствует `remaining rules omitted for context budget`. Есть дополнительные core rules, поэтому общий prompt также не равен этому лимиту. Selector теряет diagnostics бюджета при преобразовании resolver result в список skills.

Исправление: единый контракт selection → доступные bodies/resources → диагностика → фактически собранный prompt. Обязательные зависимости и правила должны сохраняться; невозможность уложиться в бюджет должна быть видимой вызывающему коду. Для stable клиента разумнее использовать native progressive disclosure, чем пытаться навязать всем одинаковую схему загрузки.

### 5. P2: Границы совместимости и доказательств ещё требуют точности

Правильно, что текущая документация различает stable/beta/experimental и признаёт отсутствие live loader acceptance. Но «нет Codex adapter» не равно «нет Codex integration»: уже экспортируемая `.agents/skills` является нативным путём discovery Codex, и семь ContextOS skills присутствуют в каталоге доступных навыков этой сессии.

Официальная документация: [Build skills](https://learn.chatgpt.com/docs/build-skills) описывает repository `.agents/skills`, начальный список metadata и чтение полного SKILL.md при выборе. Развитие отдельного Codex target имеет смысл ради явного install/export контракта, root AGENTS.md preservation и metadata, а не как необходимое условие обнаружения навыков.

`benchmarks/claims.json` правильно помечает старую token-reduction claim как invalidated. Однако оставшиеся формулировки «100%» drift/conflicts шире доказательства конкретными fixtures. Особенно measured claim о merge с confidence interval `[100,100]` нельзя считать статистическим доказательством универсального результата.

`contextos stats` даёт эвристическую оценку текста, считает только core skills и сравнивает с условным full dump. Это полезная оценка конфигурации, но не данные о счёте пользователя, качестве решения или истории клиента. В конце вывода уже есть оговорка; сравнения потребителей и installed plugins всё равно стоит согласовать с общим discovery.

## Что в проекте действительно хорошо

- Pure rendering отдельно от application layer; запись через lock, journaled transaction и hash preconditions. Это конкретная инженерная ценность, подтверждённая тестами и consumer checks.
- Пользовательский Copilot-текст сохраняется, malformed managed block безопасно отклоняется, изменённые generated файлы защищены. Старые ошибки из существовавшего отчёта не следует выдавать за текущее состояние.
- Discovery overrides/plugins и ресурсы skills объединены; новые consumer regression tests проверяют конечные exports, а не только наличие строк в коде.
- Lockfile/provenance/drift дают воспроизводимую проверку конфигурации. Это сильнее обещания «модель обязательно выполнит Markdown».
- Правила различают prompt guidance и автоматическую проверку. Само наличие registered checker всё же не означает, что он исполняется при любом действии модели: `gate` проверяет drift, `scan` проверяет Git index.
- Core не требует npm production dependencies; YAML parser при этом поставляется как vendored внешняя библиотека с metadata/license. Это отсутствие install-time dependencies, а не отсутствие стороннего кода вообще.
- MCP inspection имеет отдельные tests на отсутствие filesystem/index/object-store изменений, а mutating runtime включается явно.

## Оценка предложений из переписки

| Идея | Решение сейчас | Условия полезности |
| --- | --- | --- |
| Детерминированные проверки | Развивать выборочно | Проверять объективный командный контракт; использовать существующие линтеры там, где они решают задачу. Запреты цветов/z-index/TODO не становятся универсальным качеством кода |
| Tree-sitter graph | Позже, optional модуль | Сравнить качество подбора файлов с rg + текущим package graph на реальных задачах; измерить стоимость построения и устаревание графа |
| Skill import | После стабилизации discovery | Existing `skill add` уже обслуживает свой каталог. Внешнему import нужны pinned revision, provenance/license, containment и отсутствие автоматического запуска scripts |
| Concise/balanced/detailed | Небольшая опция при спросе | Не переносить коэффициенты Caveman в обещание ContextOS. Стиль ответа, длина tool output и накопление input — разные составляющие |
| Автоматическая память/Reflect | Отложить | Сначала ручные reviewed project overrides/ADRs. Для автоматического слоя нужны источник, scope, review, срок актуальности и удаление ошибочных правил |
| Subagent matrix | Только experimental runtime | Проверять реальные provider settings, передачу контекста и права. Markdown о моделях/fork_turns сам по себе ничего не enforce |

README Graphify подтверждает локальный Tree-sitter для кода, но semantic pass документов/PDF/media может использовать модель. Поэтому описание всего проекта как полностью детерминированного без LLM слишком широкое. Impeccable действительно заявляет 61 deterministic detector rules плюс отдельные LLM-only checks. Числа Caveman относятся к его исследуемым сценариям и не являются результатами ContextOS.

## Рекомендуемая следующая итерация

1. Исправить discovery чужих clones/worktrees и MCP lint. Приёмка: текущий resolve JSON не переполняется; чужие dependency manifests не меняют evidence; обязательные CI commands проходят.
2. Уменьшить постоянные инструкции и согласовать fast-track. Приёмка: typo-задача не загружает многотысячный workflow/роли без необходимости; security/migration сохраняют обязательные проверки. Сравнить конечные artifacts до/после, не только строковые counts.
3. Согласовать selection/export/runtime contracts. Явно показывать selected, excluded, required dependencies, бюджет и diagnostic overflow. Проверить обязательные правила в конечном prompt.
4. Проверить реальные загрузчики хотя бы двух целевых клиентов, которыми пользуются первые пользователи. Для Codex отдельно проверить уже существующий skills discovery и root instruction preservation; для Claude — различать индекс ссылок и native skills.
5. Провести небольшой benchmark и пользовательский пилот. На одинаковых задачах сравнить обычные инструкции, весь каталог и task-focused контекст; фиксировать качество, input/output/cached tokens, исправления и время. Уменьшение текста без сохранения качества не считать успехом.

Оценка порядка: первые два исправления — небольшая стабилизация; переработка bootstrap и consumer pipeline — отдельная итерация на несколько дней с проверкой поведения; настоящий pilot требует пользователей и недель наблюдения. Это план направления, не обещание конкретного срока реализации.

Для одиночного разработчика с одним агентом обычные инструкции и несколько точечных skills могут дать достаточно пользы при меньшей настройке. Для команды с несколькими клиентами ContextOS имеет более явное преимущество: единая политика, сохранение пользовательских правил и CI drift. Коммерческий спрос ещё нужно подтвердить.

## Локальные доказательства

Артефакты находятся в `scratch/independent-review-20260930/`, игнорируются Git и не попадут в коммит отчёта автоматически:

- `snapshot.json`, `prepare.cjs`: версия, основание snapshot, способ копирования.
- `core-tests.log`, `core-tests-unrestricted.log`, `core-recheck.log`, `install-recheck.log`: исходные результаты и устранение ограничений среды.
- `validation.log`, `mcp-lint.log`, `typecheck.log`, `mcp-build.log`, `mcp-tests-built.log`: validation/lint/typecheck/build/test.
- `probes.cjs`, `probes.json`: consumer preservation/idempotence, бюджеты, объёмы Cursor, contaminated workspace и ENOBUFS.
- `runtime-prompt.json`: assembled runtime prompt и наличие обрезки.
- `live-drift.json`: текущий root export check.

Статус проверки: DONE_WITH_CONCERNS. Изменения продуктового кода, коммиты и публикация в эту задачу не входили.
