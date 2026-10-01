# Стабилизация после ревью — 1 октября 2026

Три замечания ревью исправлены и проверены локально на Windows с Node 22.14.0.
Свежие `contextos-agents@2.3.0` и `@contextos/mcp@0.4.0` прошли установленный
consumer-сценарий. Публикация и живой пилот в этот этап не входят: пилот проводит
пользователь. Новых платных API-запусков нет.

## Исправления

1. Для project skill без YAML compiler записывал каталог в `source`, хотя
   потребители ожидали путь к файлу. Теперь registry содержит реальный
   `SKILL.md`: его тело участвует в hash, оценке tokens и MCP prompt assembly.
2. Все шесть adapters используют объявленный `entrypoint` с приоритетом
   `skill.v2.yaml` перед `skill.yaml`. При `entrypoint: RULES.md` устаревший
   `SKILL.md` больше не подменяет инструкции. Discovery находит v2-only skills;
   пути проверяются относительно каталога skill. Aider/Copilot ссылаются
   непосредственно на canonical entrypoint.
3. MCP tarball smoke-test раньше пересобирал общий `dist`, который одновременно
   использовал handshake-test. Теперь сборка выполняется в отдельной временной
   копии, а shared runtime проверяется на неизменность. Перед проверкой tarball
   удаляется вспомогательный compiler-каталог этой копии.

## Проверки и границы доказательств

| Проверка | Результат |
| --- | --- |
| Новые core regressions до исправления | 3 failed, 8 passed |
| Core regressions после исправления, включая path traversal | 12 passed |
| Полная root suite | 523 passed, 0 failed, 0 skipped |
| Полная MCP suite с обычной параллельностью | 601 passed, 0 failed, 25 skipped |
| MCP selector/assembly/tarball/handshake вместе | 15 passed |
| Compile и MCP build | PASS |
| Core/catalog validation | 7 core, 36 catalog; 0 errors, 0 warnings |
| Export drift | 132 artifacts, 0 findings |
| MCP lint | 0 errors, 5 warnings, 2 infos |
| Markdown нового отчёта и Git whitespace check | PASS |
| Финальный secret scan | 797 files, 0 findings |
| Установка свежих архивов и реальные npm wrappers | PASS |
| Manifestless/custom entrypoint в native exports и installed MCP | PASS |
| Init/add/override/compile/export/update/resolve/uninstall | PASS |
| User AGENTS/CLAUDE/Cursor и project rules сохранены | PASS |
| Installed MCP initialize/list/status | PASS |

Первый запуск изолированной MCP-сборки не включал соседний `transaction-core`
и завершился ошибкой импорта. Зависимость добавлена только в build-копию;
повторный целевой и полный параллельный прогоны прошли. Первоначальная ошибка
сохранена в `mcp-targeted.log`.

Проверка staged diff дополнительно нашла хвостовые пробелы в новых supporting
references. Форматирование исправлено в canonical sources, Markdown hard breaks
сохранены явным backslash, exports и архивы обновлены. После этой правки повторены
core regressions и установленный consumer-сценарий; предыдущие архивы и результаты
сохранены в `pre-whitespace/`.

25 skips не считаются успешными тестами. Linux/macOS, удалённый CI и загрузка
инструкций живым клиентом в этом этапе не проверялись. Установка не доказывает
рост качества ответов модели. При update сохранение намеренного пользовательского
override вызвало предупреждение о четырёх customized files; проверка подтвердила,
что пользовательские тела остались целыми.

Machine evidence с hash архивов и логов:
[stabilization-2026-10-01.json](evidence/stabilization-2026-10-01.json).
Архивы и сырые логи сохранены в `scratch/stabilize-20261001/`.
Исходный reviewed working tree сохранён в `before/` вместе с `baseline.json`;
исторические release evidence не заменены.

## Повторить

В доверенном checkout с установленными зависимостями:

```sh
npm test
npm --prefix contextos-mcp test
npm run build
npm --prefix contextos-mcp run build
node -e "require('fs').mkdirSync('scratch/release-candidate', { recursive: true })"
npm pack --ignore-scripts --pack-destination scratch/release-candidate
npm pack ./contextos-mcp --ignore-scripts --pack-destination scratch/release-candidate
npm run check:consumer
```

В этой Windows-сессии npm запускался через `npm-cli.js`, потому что глобальный
wrapper в sandbox перенаправлял запуск неверно. Сборка и полные проверки
выполнялись вне ограничений sandbox. Consumer-проект сохранён отдельно в
`scratch/stabilize-20261001/verifier/scratch/`.

## После пилота

Фиксировать конкретную задачу, выбранные skills, реально загруженные инструкции,
полученный patch и проблемы onboarding/update. Исправлять воспроизводимые
дефекты по этим результатам. Затем прогнать CI matrix и принимать отдельное
решение о публикации.
