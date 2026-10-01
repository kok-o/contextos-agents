# Проверка установки и подготовка продукта — 1 октября 2026

Локальная проверка текущих кандидатов `contextos-agents@2.3.0` и
`@contextos/mcp@0.4.0` прошла в Windows, Node 22.14.0. Пакеты не опубликованы.
Бенчмарки отложены пользователем; новых платных API-запусков в этом этапе нет.

## Что изменилось

- Тест parity CLI/MCP всегда компилирует текущий TypeScript selector в памяти.
  Старый игнорируемый `dist` больше не может скрыть расхождение исходников.
- Offline unit-test fixtures создаются в системной временной папке: свежему
  checkout не нужна заранее существующая `scratch`.
- MCP build очищает только свой `dist`, отказываясь удалять symlink output.
  Специально добавленный устаревший файл исчез при следующей сборке.
  В свежем tarball отсутствуют 19 старых outputs предыдущего кандидата:
  например `dist/cli.js`, `dist/interactive.js`, `dist/mcp/bundle.mjs`.
- Добавлен переносимый `npm run check:consumer`. Он устанавливает оба tarball
  в новый Git-проект с пробелом в пути и использует реальные npm `.bin` wrappers.
- Reusable CI workflow проверяет этот сценарий на Windows, Linux и macOS;
  stable publish теперь зависит и от установленного consumer gate.
- Обновлён [quickstart](product/onboarding.md), добавлен
  [небольшой пример с собственным правилом](../examples/quickstart/README.md).
  Этот же fixture проверяется установленным consumer gate.

## Полученные результаты

| Проверка | Результат |
| --- | --- |
| Root suite в копии без MCP dist | 519 passed, 0 failed, 0 skipped |
| MCP suite со свежими зависимостями | 599 passed, 0 failed, 25 skipped |
| Core build и MCP build | PASS |
| MCP lint | 0 errors, 5 warnings, 2 infos |
| Markdown новых guide/demo и README | PASS |
| Secret scan чистой копии | 787 файлов, 0 findings |
| Реальная npm-установка обоих архивов | PASS |
| Init → add skill → override → compile/export → drift → update/resolve → uninstall | PASS |
| Выбор `typescript` и `team-order`, целое тело project-rule в native projection | PASS |
| User AGENTS/CLAUDE/Cursor rules, override и собственное правило после update/uninstall | PASS |
| MCP initialize → tools/list → tools/call contextos_status | PASS; 3 read-only tools, 0 session threads |
| Нулевой exit MCP до initialize reply | Корректно отклонён проверкой с exit 1 |

Первый чистый root-прогон имел 11 ошибок: девять из-за отсутствующей `scratch`
и две из-за Git ownership границы между sandbox-пользователем и пользователем
повторного запуска. Fixtures исправлены; `safe.directory` для временного
checkout задан только в окружении проверки, без изменения глобального Git.
Повторный полный прогон — 519/519.

Скачивание npm-зависимостей и esbuild требовали разрешения sandbox на сеть и
чтение родительских каталогов. Эти первоначальные ошибки сохранены в логах;
они не выданы за дефекты продукта. Финальные проверки выполнены успешно.

Логи находятся в `scratch/clean-*.log`. Machine evidence с hash архивов и логов:
[release-acceptance-2026-10-01.json](evidence/release-acceptance-2026-10-01.json).
Текущие архивы — `scratch/release-candidate`; предыдущие сохранены в каталоге,
указанном полем `previousCandidateArchive` evidence.

## Повторить установленную проверку

Из корня доверенного checkout, с Node 22 и установленными зависимостями обоих
пакетов:

```sh
npm ci --ignore-scripts
npm --prefix contextos-mcp ci --ignore-scripts
npm run build
npm --prefix contextos-mcp run build
node -e "require('fs').mkdirSync('scratch/release-candidate', { recursive: true })"
npm pack --ignore-scripts --pack-destination scratch/release-candidate
npm pack ./contextos-mcp --ignore-scripts --pack-destination scratch/release-candidate
npm run check:consumer
```

В PowerShell можно использовать `npm.cmd`. Скрипт сохраняет consumer-проект и
`scratch/release-install-result.json` для проверки; для альтернативного каталога
архивов: `npm run check:consumer -- <directory>`.

## Следующий шаг

Удалённые CI jobs ещё не запускались: Linux/macOS и Node 24 не подтверждены
этим локальным этапом. 25 MCP skips остаются skips, а не успешными тестами.

Дальше нужен небольшой пользовательский проход в реальном Codex/Cursor:
открыть demo, явно выбрать team-rule, проверить загрузку и полученный patch.
Затем — pilot на одном рабочем проекте с фиксацией сложностей onboarding,
конфликтов при обновлении и удобства правок. Проверка установки не устанавливает
улучшение ответов модели; API-бенчмарки остаются на паузе до запроса пользователя.
