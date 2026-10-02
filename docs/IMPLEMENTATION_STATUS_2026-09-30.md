# ContextOS: результаты реализации

Дата: 30 сентября 2026 года. Рабочее дерево Windows / Node 22.14.0.

R1 реализован. Изменения R2 подготовлены как локальные кандидаты
`contextos-agents` 2.3.0 и `@contextos/mcp` 0.4.0. Публикации, тега и коммита
на дату исходного отчёта не было. Изменения затем закоммичены до `4bed8dd`;
исходные пользовательские изменения сохранены. Актуальная подготовка от
2 октября: [R2 release preparation](R2_RELEASE_PREPARATION.md).

Основание: [независимый аудит](INDEPENDENT_REVIEW_2026-09-30.md) и
[план работ](../CONTEXTOS_WORK_PLAN.md). Исходные числа в аудите относятся к
baseline; текущие результаты приведены ниже.

| Этап плана | Статус |
| --- | --- |
| 0. Baseline и regression fixtures | Выполнен |
| 1. Discovery и MCP CI, R1 | Выполнен |
| 2. Bootstrap и workflows | Выполнен |
| 3. Selection и runtime prompt | Выполнен |
| 4. Consumer lifecycle и клиентская загрузка | Lifecycle, Codex metadata и явная загрузка тел в CLI payload PASS; поведение модели и Cursor не проверены |
| 5. Пакетирование и документация | CI на `4d633da`: 19/19 jobs PASS, 12 artifacts; проверенная пара зафиксирована, итоговый кандидат ожидает клиентского пилота |
| 6. Качество и стоимость | Частичные GPT-4.1-mini/Luna результаты; с 1 октября на паузе до явного запроса |
| 7. Пользовательский пилот | Протокол подготовлен; пилот не начат |

## Изменения и проверенное поведение

### Workspace discovery

Сканер исключает `.external-skills` и `.swarm-worktrees`, учитывает объявленные
workspaces и исключает посторонние вложенные Git-репозитории по умолчанию.
Добавлен явный opt-in для вложенных репозиториев. Лимит пакетов применяется
глобально; обход стабилен; проверяется выход symlink за границы проекта.

На текущем checkout graph содержит 3 пакета вместо 502, из которых 500 ранее
попадали из сторонних clones. Resolver JSON возвращается через обычный consumer
без увеличения `maxBuffer`. Это исправляет воспроизведённый ENOBUFS.

### Постоянный контекст и выбор навыков

Bootstrap сокращён до 3 356 символов. Полные руководства workflow, ролей и
minimal implementation вынесены в объявленные supporting resources.
В Cursor только bootstrap имеет `alwaysApply: true`.

| Измерение | Baseline | После изменений |
| --- | ---: | ---: |
| Cursor alwaysApply, символы | 51 939, пять файлов | 3 777, один файл |
| Routine foundations, estimated tokens | 4 895 при budget 1000 | 418 при budget 1000 |
| Пакеты workspace | 502 | 3 |

Это размеры файлов и оценка символов, а не измеренная стоимость клиентских
сессий. Выбор зависит от задачи: короткое обслуживание использует workflow;
существенный Build может добавлять ponytail-mindset. Security сохраняется для
auth, migration и destructive risk даже при малом бюджете или исключении в
профиле. Resolver объясняет такие конфликты и недоступные installed skills.
Парсер CLI не принимает значения флагов за текст задачи и отклоняет неверные
бюджеты. Selection declaration явно отделена от загрузки тела навыка.

### MCP assembly и read-only inspection

Загрузчик сохраняет полные выбранные тела, bootstrap и project overrides.
Использует canonical source и `entrypoint` манифеста. Soft limit вызывает
предупреждение; hard limit отклоняет полный prompt с диагностикой.
Отсутствующий выбранный файл и выход за границы repository вызывают ошибку.
Вместо незаметной обрезки доступны пути, SHA-256, размеры, предупреждения и
причины исключений через `assembleContextPrompt` и `context_report`.

Read-only inspection не создаёт runtime directories и не меняет Git index или
object store. Ошибка очистки временного файла сохраняет исходную ошибку.
Исправлены lint errors; остаются пять warnings и две informational diagnostics.

### Установка и клиентский discovery

Оба npm-архива установлены через реальные `npm install` и `.bin` в новый
consumer project. Проверены init, установка TypeScript skill, project override,
compile, export всех адаптеров, drift, update и uninstall. Пользовательские
AGENTS.md, инструкции Claude и override сохранились. Установленный MCP прошёл
stdio initialize и tools/list с тремя read-only tools.

Реальный Codex app-server `skills/list` обнаружил 7 из 7 локальных core skills;
все enabled. Этот запрос не запускал inference. Подтверждён discovery metadata.
В дополнении от 1 октября ниже подтверждена явная загрузка тел в CLI payload.
Выполнение правил в ответе модели ещё не проверено.
У Cursor и остальных клиентов проверены export/consumer contracts; живое
поведение загрузки остаётся unverified. См.
[матрицу совместимости](ADAPTER_COMPATIBILITY.md).

## Проверки и evidence

| Проверка | Результат | Локальный evidence |
| --- | --- | --- |
| Полный root test suite | 507 passed, 0 failed, 0 skipped | `scratch/r2-runtime-final-core-tests.log` |
| Полный MCP test suite после entrypoint fix | 599 passed, 25 skipped, 0 failed | `scratch/r2-entrypoint-mcp-tests.log` |
| MCP build | PASS после entrypoint fix | `scratch/r2-entrypoint-build.log` |
| MCP lint | PASS; 5 warnings, 2 infos | `scratch/r2-entrypoint-mcp-lint.log` |
| Catalog validate | 7 core + 36 catalog, 0 errors/warnings | `scratch/r2-validate.log` |
| Export drift | 132 artifacts, 0 findings | `scratch/r2-final-drift.json` |
| Проверка секретов | 771 файлов, совпадений нет | `scratch/r2-final-secret-check.log` |
| Benchmark harness и oracle controls | Targeted 32 passed; две новые regressions включены в полный root gate | `scratch/r2-native-transform-tests.log`, `scratch/r2-runtime-final-core-tests.log` |
| Fresh tarball consumer | PASS | `scratch/release-install-result.json` |
| Codex native discovery | 7/7 | `scratch/codex-discovery.json` |

25 skipped MCP tests не учитываются как passed. Это 13 Python REPL tests без
доступного `python3`, 10 старых enterprise tool tests и два session persistence
tests. Полный experimental runtime этими результатами не сертифицирован.
В процессе были отдельные неуспешные прогоны из-за ограничений среды и
исправленных regression fixtures; итоговые gates указаны отдельно.

`scratch/` игнорируется Git. Итоговый переносимый [snapshot evidence](evidence/implementation-2026-09-30.json)
сохранён с измерениями, исходами, командами и SHA-256; raw логи и ответы остаются
локальными. SHA-256 обоих npm-архивов также включены в snapshot.

## Сравнение с реальной моделью

Выполнены попытки всех 54 сравнений: шесть задач, три режима контекста, три повторения.
Режимы: vanilla, все 11 установленных entrypoints, canonical focused selection.
Снимок модели: `gpt-4.1-mini-2025-04-14`; один API attempt, до 4096 output tokens.
У сгенерированного TypeScript проверяются синтаксический gate и скрытые runtime assertions
в permission-limited child process с минимальным окружением.

Первый запуск получил сетевой `EACCES`: 54 API errors, ответов нет.
Его консервативный резерв $1.418481 сохранён. Повторный запуск с сетевым
разрешением получил 50 ответов. Четыре последних запроса получили 429:
provider сообщил requests-per-day limit 50. Это ограничение аккаунта,
а не исчерпание согласованных $10. Измеренная стоимость 50 ответов — $0.155640;
общий ledger reservation двух запусков — $2.836962. Прогон остаётся неполным.

Выявлен дополнительный дефект evaluator: regex-преобразование повреждало
корректные object literals и сравнения в TypeScript. Оно заменено на native
Node transform без автоматического исправления исходника. Все 50 ответов
повторно проверены offline, новых API-запросов не было. Первоначальный отчёт
сохранён, его оценки заменены `report-reevaluated.json`. Исходные 50 ответов
также прошли отдельный TypeScript syntax audit без source repair.

Для сравнения используются 16 полных task/repetition pairs: каждый режим
получил одну и ту же задачу в одном и том же повторении.

| Контекст | Прошли все проверки | Измеренная token cost в этих парах |
| --- | ---: | ---: |
| Vanilla | 8/16 | $0.032868 |
| Все 11 установленных entrypoints | 6/16 | $0.073507 |
| Focused ContextOS | 6/16 | $0.045753 |

Focused оказался примерно на 37,8% дешевле полной загрузки при одинаковом
числе успешных ответов в этой выборке. Улучшение относительно vanilla
не подтверждено: plain baseline дешевле и прошёл больше проверок. Это малое
сравнение одного model snapshot, поэтому общий вывод о моделях и проектах
из него делать нельзя. Практический вывод: сохранить компактную доставку
нужных правил и развивать воспроизводимость, не обещая общего прироста
качества или экономии относительно отсутствия ContextOS.

Подробные token counts, результаты по задачам и неудачные assertions:
[API benchmark](API_BENCHMARK_2026-09-30.md).

Ограничения evaluator: TypeScript преобразуется для исполнения, полноценный
`tsc` type checking не входит в primary outcome. Для bcrypt/JWT используются
локальные mocks; сетевое поведение проверяется локальными assertions. Поэтому
прохождение harness не сертифицирует production security. Исходные ответы
дополнительно проходят TypeScript syntax audit без автоматического исправления.

Ключ передан через маскированный ввод и хранится только в процессе запуска;
в source, request artifacts и diagnostic output ключ не добавлен.
Расход вычисляется по provider usage и опубликованным ставкам снимка модели:
[OpenAI GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
Сумма ledger reservation и измеренная стоимость — разные величины.

## Что ещё не завершено

1. API-измерения не завершены и на паузе до явного запроса пользователя;
   снятие provider RPD limit само по себе не разрешает новые прогоны.
2. Поведение модели после загрузки инструкций и живая активация Cursor.
3. Двухнедельный пилот с 3–5 командами. Контакты не отправлены, участников нет;
   подготовлен [протокол пилота](PILOT_PROTOCOL.md).
4. Решение о публичной публикации после рассмотрения результатов.

Новые knowledge graph, swarm architecture и автоматическое обучение навыков
не добавлены: для них пока нет подтверждённого пользовательского запроса.
Текущая практическая ценность — compiler, сохранность пользовательских файлов,
объяснимый выбор инструкций и проверяемый export. Обещание роста качества и
экономии для любых моделей и длинных сессий остаётся неподтверждённым.

Инструкции перехода: [compact context migration](COMPACT_CONTEXT_MIGRATION.md).

## Дополнение от 1 октября: GPT-6 Luna

Подготовлены 20 внесённых регрессий в четырёх настоящих модулях, три режима
контекста, цикл Responses tools, скрытые проверки соседних контрактов,
положительные и отрицательные контроли, resume и общий денежный ограничитель.
Это калибровочный корпус, а не двадцать исторических задач.

Полный root suite с новыми проверками: **519 passed, 0 failed, 0 skipped**
(`scratch/luna-final-core-tests-escalated.log`). После последних правок
native runner отдельно повторены 12 тестов
(`scratch/luna-runner-tests-final.log`). Sandbox-запуск root suite имел
ошибки доступа к npm-cache и служебным probe; указанный полный gate выполнен
с доступом к этим локальным путям. Новой публикации пакетов не было.

Последний платный пилот содержит шесть полностью завершённых попыток,
по две задачи во всех трёх ветках. Все шесть прошли скрытые контракты.
Ещё одна попытка focused исправила workspace limit и прошла проверки, но
заключительный запрос заблокирован RPD. Две оставшиеся попытки не начаты.
Сохранено 49 завершённых Responses и две ошибки API по всем пилотам;
их число нельзя выдавать за число решённых задач.

У прежнего API-проекта наблюдаются 60 000 TPM и 50 RPD. Известная оценка
всех сохранённых Luna-ответов — $0.012460, а общий консервативный резерв
с прежними GPT-4.1-mini запусками — $2.880746. Остаток согласованных $10
составляет $7.119254. Неизвестные расходы не освобождаются из резерва.

На двух полных задачах качество одинаковое. Focused дешевле all-installed,
но vanilla дешевле focused. Улучшение качества не установлено; полный
прогон 180 попыток пока не запускался.

Реальный `codex exec` без внешнего API включил полное тело
`engineering-workflow` и тело уникального probe в payload. Итог
**BODY_INJECTION_PASS**, paid requests **0**. Для изоляции создан отдельный
Git repository boundary: без него CLI видел одноимённые навыки родительского
checkout. Это проверка native assembly, а не ответов модели или Cursor.

Подробности: [протокол Luna](LUNA_BENCHMARK_PROTOCOL.md),
[результаты](LUNA_BENCHMARK_RESULTS_2026-10-01.md) и
[machine evidence](evidence/luna-2026-10-01.json).
