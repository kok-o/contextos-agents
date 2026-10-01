# План стабилизации ContextOS

Основание: `docs/AUDIT_2026-09-30.md`. Пользователь разрешил составить план и выполнять его. Цель этой итерации — исправить воспроизведённые ошибки сохранения правил, discovery, read-only MCP и оценки контекста; проверить поведение через конечные consumer artifacts.

## Требования

- Существующие пользовательские инструкции сохраняются при экспорте. Изменённые generated-only файлы нельзя молча перезаписывать.
- Project overrides и standalone/bundle plugins используют общий discovery для compiler, resolver и adapters.
- Default MCP inspection не создаёт session/worktree files; runtime по-прежнему включается явно.
- Один export на новом проекте сразу проходит drift check.
- Экспортированные skills сохраняют references/scripts и не включают examples/troubleshooting автоматически в entrypoint.
- Resolver учитывает foundation skills при планировании бюджета и явно сообщает soft-budget превышение.
- Документация различает config drift gate, native integration, manual index и экспериментальный runtime.

## Порядок выполнения

| Этап | Изменения | Проверка и критерий приёмки | Статус |
| --- | --- | --- | --- |
| 1 | Managed block Copilot, ownership safeguards application layer | Пользовательский текст сохраняется после двух экспортов; конфликт generated file безопасно отклоняется | Выполнен |
| 2 | Общий discovery, overrides/resources, standalone plugin registry | Изменение override меняет hash и конечные exports; FastAPI виден в compiled registry | Выполнен |
| 3 | Read-only MCP inspection и Windows dev launcher | status/compare/diff не меняют filesystem; dev handshake на Windows | Выполнен |
| 4 | Aider idempotence, skill resources и progressive disclosure | export → check сразу успешен; relative references доступны; примеры не добавлены в SKILL.md | Выполнен |
| 5 | Полный учёт выбранных skill bodies в soft budget | foundation учитывается; превышение 1000 tokens даёт warning; dependencies сохраняются | Выполнен |
| 6 | Init/banner и честные integration/product contracts | Документация соответствует реальным tools и supported paths | Выполнен |
| 7 | Consumer regression tests, core suite, MCP focused tests/typecheck, fresh tarball probes | Прежние дефекты не воспроизводятся; результаты и ограничения записаны ниже | Выполнен |

Этапы выполняются последовательно; новые обязательные проверки добавляются для пользовательских контрактов, а не для повторения реализации. Изменения experimental orchestration, добавление новых IDE adapters и независимый benchmark экономии требуют отдельной итерации после стабилизации. Эта итерация не обещает фиксированную экономию денег.

## Риски и правила реализации

- Legacy generated files нужно отличать от пользовательских файлов; миграция должна сохранять пользовательские участки.
- Общий discovery обязан сохранить диагностику дубликатов upstream skills и не принимать symlink escapes.
- Resource copying не должно распространять undeclared secrets или обходить filesystem containment.
- Read-only inspection не должно выдавать пустое состояние при наличии сохранённых threads.
- Soft budget сохраняет обязательные правила, но честно сообщает невозможность уложиться в лимит.
- Аудиторские документы и исходные пользовательские изменения сохраняются. Коммиты, публикация npm и deployment в эту итерацию не входят.

## Итог выполнения

Исправления выполнены. Защита записи учитывает V1/V2 ownership, хеши исходного файла и CRLF-эквивалентность текстовых файлов. Header с названием ContextOS сам по себе не даёт права удалить или перезаписать файл. Scoped export не удаляет resources другого адаптера; изменённые orphan resources защищены.

MCP inspection читает существующие threads и расходы без runtime init. Diff использует временные Git index и object directory: защищается не только индекс, но и Git object store. Чтение сохранённого состояния проверяет repository containment.

Дополнительно doctor отличает ошибку выполнения scanner от найденного секрета.

| Проверка | Результат |
| --- | --- |
| Полный core suite в изолированной Git-копии | 490/490 passed, 0 failed, 0 skipped |
| Полная MCP сборка и suite | Build прошёл; 589 passed, 0 failed, 34 skipped; 46 файлов passed и 3 skipped |
| Windows dev MCP без dist | Protocol handshake passed |
| Read-only filesystem/index/object-store probes | 3/3 passed, включая persisted state и untracked diff |
| Catalog validation | 7 core + 36 catalog, 0 errors/warnings |
| Root adapter drift check | 123 projected artifacts; 0 findings |
| Secret scan и Markdown lint | Прошли |
| Свежий root npm tarball, consumer probes | Copilot preserved; override hash изменился и маркер виден в Gemini/Claude/Cursor; первый check/gate = 0; FastAPI в registry |

Суммарный размер семи Gemini SKILL entrypoints уменьшился с 65 508 до 49 430 символов (24,5%). Supporting resources остаются доступны отдельными файлами. Это измерение текста entrypoints, а не стоимости внешней AI-сессии.

Новые regression tests: `tests/consumer-stabilization.test.js` и `contextos-mcp/tests/read-only-inspection.test.ts`. Локальные логи, tarball, consumer probes и сравнение размеров находятся в игнорируемой Git директории `scratch/improvement*`; они не включены в коммит. Изменения не опубликованы, версия пакета пока не повышалась.

## Следующая итерация

- Короткий bootstrap и task-based загрузка в реальный consumer pipeline, затем benchmark качества и стоимости на одинаковых задачах.
- Native Codex adapter с сохранением пользовательского root AGENTS.md; реальные client loader acceptance tests для остальных интеграций.
- Объединение параллельных init implementations и уборка устаревших benchmark commands в оставшейся документации.
- Отдельное укрепление experimental orchestration; пользовательские пилоты и оценка спроса.

Эти задачи не считаются выполненными текущей стабилизацией. Default resolver budget остаётся soft; инструкции клиента, история и tool output находятся за его пределами.
