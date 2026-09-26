# Базовый отчет верификации ContextOS (Governance Baseline)

Дата составления: 2026-09-26  
Основание: [ADR-011](../decisions/0011-pivot-to-agent-governance-and-ci-gates.md) и задачи Фазы 0 [ROADMAP.md](../ROADMAP.md)  
Статус: **Фаза 0 завершена успешно**

---

## 1. Среда исполнения и базовый коммит (Задача 0.1)

- **Базовый Git Commit (HEAD)**: `a767524` (`test(export): sandbox export unit tests into isolated tmpdir to prevent root lockfile drift`)
- **Предыдущие коммиты фазы**:
  - `50a2d88`: `docs(roadmap): expand governance roadmap with rigorous contracts, pilot protocol and phase plans`
  - `530705f`: `fix(skills): refine SSRF to OWASP allowlist, modal dialog to native dialog, and add catalog export test`
  - `090e96a`: `docs(roadmap): record Phase 0-5 roadmap and pivot to agent governance in ADR-011`
- **Node.js**: `v22.14.0`
- **npm**: `11.2.0`
- **Платформа**: Windows 11 (win32 x64)
- **Статус рабочего дерева**: `clean` (0 измененных файлов, 0 неотслеживаемых файлов).

### Разбор модификации `.agents/lockfile.v2.json`
В процессе ревью было зафиксировано спонтанное изменение `revision` (с 628 до 635) и таймстемпов `lastTransaction` в корневом `.agents/lockfile.v2.json`.

**Коренная причина**:  
Устаревший модульный тест `tests/export.test.js` запускал команды экспорта (`node .agents/ctx.js export gemini`, `claude`, `copilot`, `aider`, `zed`, `all`) непосредственно в рабочей директории проекта (`ROOT`), что приводило к перезаписи файлов на диске и инкременту ревизий в рабочем lockfile при каждом запуске `npm test`.

**Решение**:  
В коммите `a767524` тест `tests/export.test.js` полностью изолирован во временную песочницу (`fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-export-test-'))`) по аналогии с `tests/catalog-export-integration.test.js`. Корневой `lockfile.v2.json` возвращен в чистое состояние. Последующие полные прогоны `npm test` не оставляют никаких следов в рабочем дереве.

---

## 2. Результаты полного контрольного прогона (Задача 0.2)

Все контрольные команды выполнены на чистом дереве коммита `a767524`:

| Команда | Код возврата | Результат | Примечания |
| --- | --- | --- | --- |
| `npm test` | 0 | 384 tests pass, 0 fail (67 suites) | Длительность: 66.5 сек, рабочее дерево чистое |
| `node .agents/ctx.js validate` | 0 | PASSED (0 errors, 0 warnings) | Проверено 7 core skills, 33 ресурса, 1 профиль, registry v2 |
| `node .agents/ctx.js validate --catalog` | 0 | PASSED (0 errors, 0 warnings) | Проверено 32 навыка каталога, frontmatter, skill.yaml, validation json |
| `node .agents/ctx.js export all --check` | 0 | PASSED (0 drift findings) | Синхронизированы все 41 выходной артефакт |
| `npm run lint:md` | 0 | PASSED (0 errors) | README, CONTRIBUTING, GUIDE, core skills соответствуют правилам |
| `npm run check:secrets` | 0 | PASSED (612 files scanned) | Секретов и приватных ключей не обнаружено |

---

## 3. Сверка контрактов CLI, пакета и окружения (Задача 0.3)

| Параметр | Значение в кодовой базе | Статус соответствия | Действие |
| --- | --- | --- | --- |
| Имя npm-пакета | `contextos-agents` ([package.json](../../package.json)) | Соответствует | Официальное имя для установки: `npx contextos-agents init` |
| Исполняемые бинарники | `contextos`, `contextos-agents`, `koko-contextos-agents` | Соответствует | Поддерживаются обе команды после локальной/глобальной установки |
| Node engines | `>=22.0.0` | Соответствует | Поддерживаются Node 22 LTS и Node 24 |
| Путь GitHub Action | `.github/actions/contextos-gate/action.yml` | Требует доработки в Фазе 1 | В Фазе 1 убрать зависимость от `npm ci` и `git diff`, перевести на package CLI |
| Read-only семантика | `export all --check` | Подтверждено тестами | Не изменяет файлы на диске, lockfile и профили при проверке |

---

## 4. Контракт кодов завершения и классификация ошибок (Задача 0.4)

Для встраивания в CI и GitHub Action фиксируются единые коды завершения:

- **Код 0**: проверка завершена успешно, нарушений и дрифта не обнаружено.
- **Код 1**: функциональное несоответствие (обнаружен дрифт сгенерированных конфигураций, несинхронизированные навыки, нарушение negative constraints).
- **Код 2**: фатальная ошибка среды исполнения (поврежденный lockfile, ошибка синтаксиса YAML/JSON, отсутствие прав на чтение, сбой адаптера). Ошибка инструмента никогда не должна трактоваться CI как «0 проблем».

Виды управляемых артефактов (Managed Artifacts):
- **Собственные файлы ContextOS**: `.agents/generated/**`, `.cursor/rules/*.mdc`, `.cursorrules`, `.github/copilot-instructions.md`, `.aider.conf.yml`, `CONVENTIONS.md`, `.zed/rules.md`, `.zed/prompts/*.md`.
- **Пользовательские файлы (Unmanaged)**: не подлежат перезаписи или удалению при обновлении и экспорте.

---

## 5. Выбор пути инициализации проекта (Задача 0.5)

Сравнение двух реализаций `init`:
1. **Публичный CLI (`bin/index.js`)**:
   - Действующая точка входа пакета.
   - Корректно определяет стек (`bin/lib/detector.js`) и устанавливает 7 базовых навыков (`engineering-workflow`, `ponytail-mindset`, `gstack-roles`, `gemini-precision`, `context-os`, `context-manager`, `security`).
   - Поддерживает флаги `--minimal`, `--profile`, `--auto`, `--agent`, `--dry-run`.
2. **Внутренний движок (`.agents/init/init-engine.js`)**:
   - Содержит стейт-машину на транзакционном журнале, но имеет устаревший список навыков (включал `react` в minimal) и не подключен к публичному бинарнику.

**Решение**:
Для первого релиза (2.1.0) сохраняется и стабилизируется публичный путь `bin/index.js`. Все тесты упаковки и consumer-тесты в Фазе 1 строятся вокруг него.

---

## 6. Приоритеты адаптеров и объем первого релиза (Задача 0.6)

Объем первого релиза строго ограничен:
1. **Ядро**: компилятор манифестов, реестр v2, безопасный писатель файлов `safe-writer`, детекция дрифта в памяти.
2. **Адаптеры первого приоритета**:
   - **Cursor** (`.cursor/rules/*.mdc` с поддержкой `alwaysApply` и `globs`).
   - **Claude Code** (`CLAUDE.md` без YAML-мусора, четкие границы инструкций).
   - **Gemini / Antigravity** (`.agents/generated/gemini/skills/` и `GEMINI.md`).
3. **Адаптеры второго приоритета**:
   - **GitHub Copilot** (`.github/copilot-instructions.md`).
   - **Aider** (`.aider.conf.yml` + `CONVENTIONS.md`).
   - **Zed** (`.zed/rules.md` + `.zed/prompts/`).

---

## Итог Фазы 0

Критерии приемки Фазы 0 выполнены полностью.  
Кодовая база находится в детерминированном, верифицированном состоянии на коммите `a767524`.  
Разрешен переход к **Фазе 1 (Пакет и CI в пользовательском проекте)**, начиная с задачи 1.1 (`consumer test fixture`).
