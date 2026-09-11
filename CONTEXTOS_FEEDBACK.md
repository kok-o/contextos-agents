# Технический аудит и инженерный роадмап ContextOS (`kok-o/contextos-agents`)

> **Для кого:** Автор проекта (`kok-o` / Есенбек)  
> **Контекст:** Архитектурный, security и DX-аудит кодовой базы ContextOS (релиз `2.0.0-beta.1` / коммит `e716f6f`). Подготовлен в формате Staff Principal Engineer & Security Architecture Review с учётом валидации автором.  
> **Цель документа:** Зафиксировать подтверждённые release-blocking дефекты, устранить неточности первичного анализа и предоставить строгий пошаговый инженерный план устранения проблем.

---

## 1. Executive Summary: Архитектурный диссонанс ContextOS

Идея проекта **ContextOS** — точное попадание в фундаментальную проблему современной AI-разработки: token bloat монолитных системных инструкций, деградация внимания LLM (Lost in the Middle), дрейф правил между Cursor, Claude Code, Copilot и Gemini, а также отсутствие детерминированного контроля политик (Policy-as-Code).

Архитектурный фундамент v2 (CAS-хэширование в [`lockfile.v2.json`](file:///c:/Users/esenb/Desktop/my_geni/.agents/lockfile.v2.json), транзакционный журнал [`JournaledTransaction`](file:///c:/Users/esenb/Desktop/my_geni/.agents/filesystem/journaled-transaction.js), абстракция чистых адаптеров [`pure-compiler.js`](file:///c:/Users/esenb/Desktop/my_geni/.agents/adapters/pure-compiler.js), построение графа рабочего пространства [`WorkspaceGraphBuilder`](file:///c:/Users/esenb/Desktop/my_geni/.agents/workspace/workspace-graph.js)) демонстрирует зрелое инженерное видение.

Однако при детальном анализе подтвердился ключевой диагноз: **спецификации и локальный checkout обогнали реальную поставку**:

1. **Фатальный упаковочный блокер (Release Blocker / P0):** В опубликованном npm-пакете `contextos-agents` отсутствуют директории [`.agents/resolver`](file:///c:/Users/esenb/Desktop/my_geni/.agents/resolver) и [`.agents/rules`](file:///c:/Users/esenb/Desktop/my_geni/.agents/rules). После установки из tarball команды `resolve`, `compile`, `validate` и `explain` падают с `MODULE_NOT_FOUND`.
2. **Слепое пятно в CI (P1):** В GitHub Actions ([`.github/workflows/validate-skills.yml`](file:///c:/Users/esenb/Desktop/my_geni/.github/workflows/validate-skills.yml)) отсутствует consumer-smoke тест на `npm pack` и чистую установку корневого пакета. Тесты проходили только потому, что запускались поверх полного git-чекаута.
3. **Зависший контракт рантайма (P1):** Команда `thread` в [`.agents/ctx.js:802`](file:///c:/Users/esenb/Desktop/my_geni/.agents/ctx.js#L802) вызывает удалённый `./runtime/thread-store.js`, приводя к необработанному крашу. При этом рантайм официально вынесен в `@contextos/mcp`, а команда не зачищена.
4. **Слепота Doctor v2 (P1):** Команда `doctor` возвращает `PASS` на сломанной системе, поскольку проверяет только наличие файлов через `existsSync`, но не тестирует исполнимость модулей. Кроме того, определение версии сбито, а CLI рекомендует задепрекейченную команду `setup-mcp`.
5. **Claims Governance & Рассинхрон бенчмарков (P2):** В [`benchmarks/claims.json`](file:///c:/Users/esenb/Desktop/my_geni/benchmarks/claims.json) публичный клейм числится как `"deterministic"`, тогда как связанный отчёт [`benchmarks/evidence/v1/context-reduction-report.json`](file:///c:/Users/esenb/Desktop/my_geni/benchmarks/evidence/v1/context-reduction-report.json) прямо помечен статусом `"invalidated"`. Линтер клеймов пропускает это несоответствие.
6. **Галлюцинации агентов из-за `AGENTS.md` (P1):** Статический манифест маршрутизирует задачи на 30+ скиллов, тогда как в дистрибутиве ядра (`core/skills`) их всего 7. Агенты пытаются подгружать несуществующие правила.
7. **Эвристический слой безопасности и транспорт плагинов (P2):** Регулярные выражения в [`.agents/plugins.js`](file:///c:/Users/esenb/Desktop/my_geni/.agents/plugins.js) блокируют безопасную документацию и SVG-ассеты, а скачивание с GitHub забирает только плоский `SKILL.md` без директорий `references/` и `scripts/`.

---

## 2. Разбор дефектов и калибровка выводов

### 2.1. Упаковка `package.json`: Исключение резолвера из npm-пакета (P0)

В корневом [`package.json:10-38`](file:///c:/Users/esenb/Desktop/my_geni/package.json#L10-L38) в массиве `"files"` указан файл `".agents/resolver.js"`, но **не включены директории**:
- `".agents/resolver"` (где лежит `canonical-resolver.js` — ядро резолюции);
- `".agents/rules"` (где лежит `rule-catalog.js` — каталог системных правил).

При установке из чистого npm tarball:
```powershell
PS> node .agents/ctx.js resolve "test"
Error: Cannot find module './resolver/canonical-resolver.js'

PS> node .agents/ctx.js compile
✗ Manifest compilation failed: Cannot find module '../rules/rule-catalog.js'

PS> node .agents/ctx.js validate
✗ [registry-v2] Failed to parse manifest: Cannot find module '../rules/rule-catalog.js'

PS> node .agents/ctx.js explain
Error: Cannot find module './rules/rule-catalog.js'
```

> **Калибровка:** Пакет не является «абсолютно мёртвым» (команды `init`, часть служебных экспортов и генераторов работают), однако его главная заявленная функциональность как компилятора и резолвера контекста сломана из коробки. Статус **P0 (Release-Blocking)** подтверждён.  
> **Каталог скиллов (`catalog/`):** Включение всей папки `catalog/` в Core-пакет не требуется. Согласно архитектуре ContextOS, ядро должно оставаться компактным, а каталог расширяется плагинами и профилями. В `package.json` безусловно необходимы только `.agents/resolver` и `.agents/rules`.

---

### 2.2. Зависший интерфейс рантайма `thread` (P1)

При выносе рантайма исполнения в `@contextos/mcp` (коммит `c3b8ca9`) директория `.agents/runtime/` была удалена. Однако в [`.agents/ctx.js:802-805`](file:///c:/Users/esenb/Desktop/my_geni/.agents/ctx.js#L802-L805) остался обработчик:

```javascript
} else if (command === 'thread') {
  const { ThreadStore } = require('./runtime/thread-store.js');
  const { evaluateMergeReadiness } = require('./runtime/state-machine.js');
  const store = new ThreadStore({ baseDir: process.cwd() });
```

Запуск `contextos thread` гарантированно приводит к фатальному `MODULE_NOT_FOUND`.

> **Калибровка:** Это дефект уровня **P1**, а не P0. Рантайм тредов официально вынесен в MCP, команда отсутствует в основном help. Требуется либо чистка команды из Core CLI, либо корректный проксирующий stub с ясным указанием на `@contextos/mcp`.

---

### 2.3. Отсутствие Consumer Smoke Test в CI (P1)

В [`.github/workflows/validate-skills.yml`](file:///c:/Users/esenb/Desktop/my_geni/.github/workflows/validate-skills.yml) гоняются матрицы Node.js и операционных систем, но все тесты выполняются внутри исходного git-репозитория. Шаг `npm pack --dry-run` запускается только в подпапке `contextos-mcp`.

Отсутствие проверки реального tarball корневого пакета привело к тому, что упаковочный блокер прошёл незамеченным.

> **Решение:** Внедрить обязательный шаг CI: `npm pack` → распаковка в чистую изолированную временную папку → `init` → `validate` → `resolve`.

---

### 2.4. Поведение Doctor v2: Логика версии и исполнимость (P1)

В [`.agents/doctor.js`](file:///c:/Users/esenb/Desktop/my_geni/.agents/doctor.js) выявлены следующие проблемы:

1. **Механика определения версии:**  
   Строки 783–789:
   ```javascript
   const version = (() => {
     try {
       return require('../package.json').version;
     } catch {
       return '1.7.1';
     }
   })();
   ```
   В установленном клиентском проекте `require('../package.json')` читает манифест целевого пользовательского репозитория, а не ContextOS. При отсутствии файла в корне проекта возвращается устаревший фоллбэк `1.7.1`.
2. **Проверка существования вместо проверки работоспособности:**  
   Doctor использует `fs.existsSync` для базовых путей, но не производит контрольных вызовов ключевых модулей. В итоге `doctor` рапортует об абсолютном здоровье системы (`PASS`), в то время как `resolve` и `compile` падают на отсутствующих файлах.
3. **Устаревшая рекомендация MCP:**  
   В строке 993 Doctor советует:
   ```
   • MCP server: not installed (run: contextos setup-mcp)
   ```
   Команда `contextos setup-mcp` в [`bin/index.js:434`](file:///c:/Users/esenb/Desktop/my_geni/bin/index.js#L434) задепрекейчена и завершается с кодом 1. Пользователь получает неработоспособную инструкцию.
4. **Требование отсутствующих скриптов:**  
   Doctor выдаёт предупреждения о нехватке `scripts/check-secrets.js` и `scripts/install-hooks.js`. Эти скрипты не входят в npm-пакет и не должны требоваться в клиентском проекте.

---

### 2.5. Claims Governance & Бенчмарки (P2)

1. **Рассинхронизация реестра и доказательств:**  
   В [`benchmarks/claims.json:6`](file:///c:/Users/esenb/Desktop/my_geni/benchmarks/claims.json#L6) клейм `claim-context-reduction-v1` заявлен как `"deterministic"`. В то же время в [`benchmarks/evidence/v1/context-reduction-report.json:4`](file:///c:/Users/esenb/Desktop/my_geni/benchmarks/evidence/v1/context-reduction-report.json#L4) стоит статус `"invalidated"` с прямым указанием, что числовое утверждение не должно представляться как валидное до завершения Benchmark v2.
2. **Пропуск в CI:**  
   Тест [`tests/claims-governance.test.js:33-37`](file:///c:/Users/esenb/Desktop/my_geni/tests/claims-governance.test.js#L33-L37) проверяет лишь то, что файл артефакта физически существует на диске, не сопоставляя согласованность статусов клейма и evidence.
3. **Методология и баг в `stats.js`:**  
   В [`.agents/stats.js:68-76`](file:///c:/Users/esenb/Desktop/my_geni/.agents/stats.js#L68-L76) падение ненайденного резолвера глушится в `catch (_)`, после чего подставляются скиллы `react` и `ui-ux-pro`, отсутствующие на диске. Утилита рапортует о 2 посчитанных скиллах, перечисляя при этом 4. Сравнение ведётся со «strawman» (конкатенацией всей папки скиллов в один промпт).
4. **Статус Benchmark v2:**  
   В [`benchmarks/v2/harness/runner.js:10`](file:///c:/Users/esenb/Desktop/my_geni/benchmarks/v2/harness/runner.js#L10) используется `MockLLMProvider` с предопределёнными вероятностями успеха, поэтому синтетический бенчмарк пока не служит эмпирическим доказательством эффективности на реальных LLM.

---

### 2.6. Каталог скиллов и синхронизация `AGENTS.md` (P1)

В поставке ядра [`.agents/core/skills`](file:///c:/Users/esenb/Desktop/my_geni/.agents/core/skills) физически присутствуют **7 скиллов**:
`context-manager`, `context-os`, `engineering-workflow`, `gemini-precision`, `gstack-roles`, `ponytail-mindset`, `security`.

При этом статический [`.agents/AGENTS.md`](file:///c:/Users/esenb/Desktop/my_geni/.agents/AGENTS.md) содержит жесткие правила автоматической активации более 30 скиллов (`react`, `typescript`, `nextjs`, `ui-ux-pro`, `state-management`, `system-design`, `ddd`, `database`, `docker`).

Попадая в клиентский проект, агент получает инструкцию загружать отсутствующие файлы, что ведёт к холостым вызовам инструментов поиска и галлюцинациям.

> **Решение:** Маршрутизация в `AGENTS.md` и `skills-index.json` должна быть согласована с фактически установленным набором скиллов.

---

### 2.7. Безопасность плагинов и адаптеры (P2)

1. **Эвристический Regex-сканер:**  
   Паттерны в [`.agents/plugins.js:62-83`](file:///c:/Users/esenb/Desktop/my_geni/.agents/plugins.js#L62-L83) (`/\b(?:eval|exec|Function)\s*\(/i`, `/base64\s*,\s*[A-Za-z0-9+/=]{40,}/i`, `/you\s+are\s+now/i`) дают ложные срабатывания на легитимном коде, документации скиллов и SVG data-URI, при этом пропуская мультиязычные и обфусцированные инъекции.  
   *При этом фундаментальные механизмы защиты ContextOS (CAS-хэширование, path traversal containment, запрет lifecycle-скриптов и транзакционный откат) спроектированы корректно.*
2. **Неполная загрузка скиллов из GitHub:**  
   Функция `installFromGitHub` в [`.agents/plugins.js:337`](file:///c:/Users/esenb/Desktop/my_geni/.agents/plugins.js#L337) скачивает только плоский `SKILL.md`, не выкачивая поддиректории `references/` и `scripts/`. Ссылки внутри скилла ломаются.
3. **Хардкод в Cursor Adapter:**  
   В [`.agents/adapters/cursor/export.js:28`](file:///c:/Users/esenb/Desktop/my_geni/.agents/adapters/cursor/export.js#L28) маппинг glob-паттернов захардкожен в константу `GLOB_MAP` вместо динамического извлечения из метаданных скиллов (`triggers.files`).
4. **Неподключённый модуль `customization-dx.js`:**  
   Файл [`.agents/customization-dx.js`](file:///c:/Users/esenb/Desktop/my_geni/.agents/customization-dx.js) не подключён к CLI (`ctx.js` / `bin/index.js`), являясь пока мёртвым кодом в поставке.

---

## 3. Матрица проблем ContextOS

| Компонент | Приоритет | Проблема | Практическое последствие |
| :--- | :---: | :--- | :--- |
| [`package.json`](file:///c:/Users/esenb/Desktop/my_geni/package.json) | **P0** | В `files` не включены `.agents/resolver` и `.agents/rules` | `MODULE_NOT_FOUND` на `resolve`, `compile`, `validate`, `explain` из tarball |
| [`.github/workflows/validate-skills.yml`](file:///c:/Users/esenb/Desktop/my_geni/.github/workflows/validate-skills.yml) | **P1** | Нет smoke-теста сборки и распаковки tarball для корневого пакета | Упаковочные дефекты не отлавливаются на CI |
| [`.agents/ctx.js`](file:///c:/Users/esenb/Desktop/my_geni/.agents/ctx.js) | **P1** | Команда `thread` ссылается на удалённый `./runtime/thread-store.js` | Краш при вызове `contextos thread` |
| [`.agents/doctor.js`](file:///c:/Users/esenb/Desktop/my_geni/.agents/doctor.js) | **P1** | Ложный PASS; чтение чужого `package.json`; рекомендация `setup-mcp` | Дезориентация пользователя, нерабочие инструкции |
| [`.agents/AGENTS.md`](file:///c:/Users/esenb/Desktop/my_geni/.agents/AGENTS.md) | **P1** | Маршрутизация на 30+ скиллов при наличии только 7 в Core | Галлюцинации и лишние поисковые шаги агентов |
| [`benchmarks/claims.json`](file:///c:/Users/esenb/Desktop/my_geni/benchmarks/claims.json) | **P2** | Статус `"deterministic"` при инвалидированном evidence; слабый тест | Рассинхронизация заявлений и доказательной базы |
| [`.agents/stats.js`](file:///c:/Users/esenb/Desktop/my_geni/.agents/stats.js) | **P2** | Баг с `react`/`ui-ux-pro` в выводе; тихое гашение ошибок; strawman | Искажение метрик экономии токенов |
| [`.agents/plugins.js`](file:///c:/Users/esenb/Desktop/my_geni/.agents/plugins.js) | **P2** | Ложные срабатывания regex; GitHub install качает только `SKILL.md` | Невозможность установки скиллов с документацией и подпапками |
| [`.agents/adapters/cursor/export.js`](file:///c:/Users/esenb/Desktop/my_geni/.agents/adapters/cursor/export.js) | **P2** | Хардкод `GLOB_MAP` вместо чтения метаданных скиллов | Новые/сторонние скиллы не получают таргетированных glob в Cursor |
| [`.agents/customization-dx.js`](file:///c:/Users/esenb/Desktop/my_geni/.agents/customization-dx.js) | **P3** | Модуль не подключен к точкам входа CLI | Мертвый код в дистрибутиве |

---

## 4. Согласованный Actionable Roadmap

```
1. [P0] Упаковка npm и Consumer Smoke Test
   ├── Включить .agents/resolver и .agents/rules в package.json:files
   └── Создать тест tests/tarball-smoke.test.js (pack -> unpack -> init -> validate -> resolve)

2. [P1] Санация команды thread в ctx.js
   └── Заменить прямой require удалённого runtime на корректную информативную заглушку

3. [P1] Доктор: проверка исполнимости и корректная версия
   ├── Изолировать чтение версии ContextOS от пользовательского package.json
   ├── Добавить в runDoctor проверку загрузки resolver и compiler (FAIL при сбое импорта)
   └── Заменить вызов setup-mcp на рекомендацию установки @contextos/mcp

4. [P1] Динамическая синхронизация AGENTS.md и skills-index
   └── Ограничить системный роутинг только фактически установленными скиллами

5. [P2] Согласованность Claims Registry & Линтера
   ├── Синхронизировать статус claim-context-reduction-v1 с evidence (invalidated / pending)
   └── Расширить tests/claims-governance.test.js на валидацию непротиворечивости статусов

6. [P2] Безопасность плагинов, Cursor globs и очистка мертвого кода
   ├── Смягчить или заменить regex-сканер в plugins.js (убрать блокировку eval/base64 в docs)
   ├── Перевести installFromGitHub на скачивание полного tarball со всеми вложенными папками
   ├── Перевести Cursor export на чтение glob triggers из манифестов скиллов
   └── Зачистить или интегрировать неиспользуемые модули
```

---

## Резюме

Принятый план устраняет технический долг без слома заложенных модульных принципов. ContextOS Core сохраняет компактность, получает реальную проверку работоспособности артефактов поставки в CI и избавляется от рассинхронизации между манифестами и файловой системой.
