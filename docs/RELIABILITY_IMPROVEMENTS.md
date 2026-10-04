# Проверка и улучшения ContextOS

Дата: 4 октября 2026. Эта запись сохраняет результаты локальной проверки на
Windows / Node 22.14.0. Исправления выпущены в core 2.3.2 / MCP 0.4.2; отдельная
CI-проверка архивов на трёх ОС описана в [релизной записи](PATCH_RELEASE_2.3.2.md).
Записи и хеши предыдущих архивов 2.3.1 / 0.4.1 сохранены.

## Исправления

1. Resolver распознаёт разрушительные запросы с промежуточными словами, например
   «Удалить все файлы проекта» и «Remove all files». Обязательный security
   сохраняется при малом бюджете и исключении профилем. Удаление неиспользуемых
   импортов остаётся обычной задачей. Это эвристическая классификация запроса,
   а не разрешение на выполнение операции.
2. Описание из frontmatter одного SKILL.md без manifest сохраняется в registry,
   native-проекции, Cursor и Zed. Учитываются кавычки, двоеточия, inline `---`,
   folded YAML, изменение только описания и приоритет v2/custom entrypoint.
3. Семь пропущенных MCP-тестов адаптированы к текущему контракту. Добавлены
   отрицательные проверки write scope и устаревшего подтверждения слияния.
   Отдельный процесс сохраняет running-state, принудительно завершается, после
   чего reconciliation сохраняет стоимость и отмечает работу как прерванную.
4. Полный локальный цикл в настоящем Git-проекте отвергает ложное «готово»,
   принимает проверенное исправление, блокирует изменённый после проверки
   кандидат и сливает заново проверенную версию. Исполнитель детерминированный;
   внешняя модель не вызывается.
5. TypeScript-пример проверяет все обязательные поля пользователя вместо одного
   наличия `id`. Десять проверок выполняют исходный Markdown-блок. Возврат прежней
   реализации проваливает пять отрицательных случаев. Проверка формы данных
   не подтверждает полномочия переданной роли.
6. Отчёт примеров отдельно считает синтаксис, поведение, структуру и имитации.
   Копии FastAPI-кода, проверенные только AST-парсером, больше не увеличивают
   число поведенческих проверок. Roadmap и документы отражают текущие границы.

## Результаты

| Проверка | Результат |
| --- | --- |
| Основной набор | 542 passed, 0 failed, 0 skipped |
| MCP, полный набор с двумя workers | 635 passed, 0 failed, 0 skipped; 50 файлов |
| Примеры семи core и четырёх catalog skills | 68/68: 13 syntax, 40 behavioral, 12 structural, 3 simulated |
| Core/catalog validation | PASS; каталог содержит 36 skills |
| Build, Markdown, drift, secret scan, release surface | PASS |
| MCP lint | PASS; пять прежних warnings и два infos |
| Publication recovery tests | 10/10 PASS |
| Установка свежих архивов вне checkout | PASS: production-only, TypeScript недоступен, правила сохранены, MCP read-only handshake |

Полные локальные логи и JSON находятся в игнорируемой папке `scratch/`.
Установка использовала заново упакованные архивы из `scratch/improvements-archives/`.
Отчёт `scratch/improvements-consumer-result.json` сохраняет их SHA-256 и помечает
локальные изменения сверх базового Git revision. Проверены routing metadata,
destructive selection, lifecycle и отсутствие ambient TypeScript. npm вывел
предупреждения об устаревших `node-domexception` и `@mariozechner/pi-ai`; это
не было ошибкой установки, но зависимость runtime требует отдельного внимания.

## Воспроизведение

```sh
npm run build
npm test
node --test tests/release-publish.test.js
node scripts/verify-skill-examples.js --json
node .agents/ctx.js validate --catalog
node .agents/ctx.js export all --check --json
node scripts/check-release-surface.cjs
```

Из `contextos-mcp`:

```sh
npm run build
node node_modules/vitest/vitest.mjs run --reporter=default --reporter=json --outputFile=../scratch/mcp-tests.json
npm run lint
```

После сборки обоих пакетов упакуйте их в отдельную локальную папку с помощью
`npm pack --ignore-scripts --pack-destination <folder>`, затем из корня выполните
`node scripts/check-release-install.cjs <folder>`. Это установка и проверка,
не публикация.

## Что остаётся непроверенным

- Live-routing исправленного manifestless-скила, ненужная активация и обновление
  скила в живых клиентах. Предыдущий Codex CLI-прогон содержит по одной попытке
  negative/explicit/automatic с manifest.
- Реальные Astra/Gemini-выполнения нового цикла, платные benchmarks и внешние
  пользовательские кейсы. Новая проверка не устанавливает экономию или качество
  модели; benchmarks остаются приостановлены.
- Произвольный сбой во время записи, отключение питания, многопроцессная
  долговечность и OS-изоляция выполнения. Runtime остаётся experimental.
- Полноценное выполнение FastAPI, браузерная доступность и TypeScript typecheck
  примеров. У остальных 32 catalog skills нет такого же покрытия примеров.

Локальный зелёный набор позволяет принять эти исправления. Для расширения
поддерживаемого продукта нужны отдельные клиентские и эксплуатационные проверки.
