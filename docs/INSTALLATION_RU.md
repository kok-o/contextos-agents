# Установка ContextOS 3.0.0

Один набор навыков для **Antigravity, Codex и Claude Code** в вашем проекте.
ContextOS устанавливает инструкции и создаёт файлы, которые читает выбранный
клиент. Сам редактор или CLI нужно установить и авторизовать отдельно.

## 1. Что нужно

- **Node.js 22 или новее** вместе с npm: [nodejs.org](https://nodejs.org/).
- **Git**: [git-scm.com](https://git-scm.com/downloads).
- Папка проекта, над которым вы работаете: сайт, Python-проект, приложение и т. д.

Проверьте в терминале:

```sh
node --version
npm --version
git --version
```

Откройте терминал **в корне своего проекта**, а не внутри скачанного ContextOS.
Наличие `package.json` заранее не требуется: npm создаст файл при установке.
На Windows команды можно выполнять в PowerShell. Если он блокирует запуск
`npm.ps1` или `npx.ps1`, используйте `npm.cmd` и `npx.cmd` соответственно.

## 2. Установить со всеми навыками

**3.0.0 пока не опубликован в npm.** Установка ниже берёт исходники из Git-тега
`v3.0.0`; создавать GitHub Release или публиковать npm-пакет для неё не нужно.

В новом проекте без папки `.agents` выполните:

```sh
npm install --save-dev --save-exact --ignore-scripts "git+https://github.com/kok-o/contextos-agents.git#v3.0.0"
npx --no-install contextos init --all
npx --no-install contextos compile
npx --no-install contextos export gemini,claude
npx --no-install contextos export gemini,claude --check --json
```

Что произойдёт:

1. npm добавит ContextOS в зависимости разработки и запишет выбранный Git-коммит
   в `package-lock.json`.
2. `init --all` установит **7 базовых навыков и весь каталог этой версии**.
3. `compile` соберёт индекс правил.
4. `export gemini,claude` подготовит файлы сразу для всех трёх клиентов.
5. Последняя команда проверит, что файлы соответствуют исходным правилам.

Успешный результат проверки: `"status": "pass"`, `"hasDrift": false`, код выхода
`0`. Список установленных навыков:

```sh
npx --no-install contextos --version
npx --no-install contextos skill list --available
```

Для этой версии ожидаются `3.0.0`, **7 core skills**, **46 установленных навыков
каталога** и отсутствие оставшихся неустановленных навыков каталога. Навыки
включают инструкции по разработке, безопасности, frontend, backend, DevOps,
дизайну и работе с текстом. Весь каталог доступен локально; клиент выбирает
подходящие инструкции по задаче, а не загружает все тела навыков в каждый запрос.

MCP-сервер для этого не нужен. ContextOS не требует API-ключа модели; учётная
запись и доступ к модели настраиваются в самом Antigravity, Codex или Claude Code.

## 3. Открыть проект в своём клиенте

Откройте **ту же папку проекта**, в которой выполняли команды, и начните новый
чат после экспорта. Если навыки не появились, перезапустите клиент и проверьте,
что открыт корень нужного проекта.

| Клиент | Если нужен только он | Какие файлы создаются |
| --- | --- | --- |
| Antigravity | `npx --no-install contextos export gemini` | `.agents/skills/*/SKILL.md`; правила активации в `.agents/rules/` |
| Codex CLI / Desktop | `npx --no-install contextos export gemini` | `.agents/skills/*/SKILL.md` |
| Claude Code | `npx --no-install contextos export claude` | `.claude/skills/*/SKILL.md` и `.claude/rules/*.md` |

Это альтернативы общему `export gemini,claude`; заново запускать `init` для
каждого клиента не нужно. Название адаптера **`gemini` используется и для
Antigravity, и для Codex**. Команд `export codex` и `export antigravity` нет.

В Antigravity проверьте навыки проекта в меню **Customizations → Skills**.
В Codex выберите нужный навык в селекторе навыков или назовите его в запросе.
В Claude Code откройте меню `/` и выберите навык, например `/security`.
Для первой проверки попросите провести ревью кода с навыком `security` и
посмотрите, из какого файла проекта клиент прочитал инструкции.

Нативные каталоги описаны в официальных руководствах
[Antigravity](https://antigravity.google/docs/skills?app=antigravity-ide),
[Codex](https://learn.chatgpt.com/docs/build-skills) и
[Claude Code](https://code.claude.com/docs/en/skills).
Установка и проверка файлов подтверждают экспорт; обнаружение навыков и
следование инструкциям зависят от конкретного клиента. Записи проверок находятся
в [матрице совместимости](ADAPTER_COMPATIBILITY.md).

### Нужны ещё Cursor, Copilot, Aider или Zed

Вместо выбора двух адаптеров экспортируйте все поддерживаемые форматы:

```sh
npx --no-install contextos export all
npx --no-install contextos export all --check --json
```

**`init --all` — установить все навыки. `export all` — создать файлы для всех
клиентов.** Это разные действия. Для Zed создаются шаблоны для ручного импорта.

## 4. Если ContextOS уже установлен

Не повторяйте обычный `init`: он остановится, если `.agents` уже существует.
После установки версии 3.0.0 в проект добавьте оставшиеся навыки каталога:

```sh
npx --no-install contextos skill add --all
npx --no-install contextos compile
npx --no-install contextos export gemini,claude
npx --no-install contextos export gemini,claude --check --json
```

`skill add --all` пропускает уже установленные навыки и добавляет каталог. Семь
базовых навыков эта команда не устанавливает. Они уже есть, если проект был
создан с `init --with-core`, `init --minimal` или `init --all`.
Для добавления или обновления базового набора в существующем проекте сначала
прочитайте [параметры инициализации](../GUIDE.md#initialization-options):
`init --with-core --force` обновляет копии базовых файлов, поэтому его не стоит применять
вслепую поверх собственных правок.

Активный профиль может исключать некоторые установленные навыки из экспорта.
Проверьте `npx --no-install contextos status`, если навык установлен,
но отсутствует в файлах клиента. Профили описаны в
[руководстве](../GUIDE.md#profile-management-v2-profile).

При переходе с 2.x используйте
[инструкцию миграции](MIGRATION.md#upgrading-from-2x-projects).

## 5. Свои правила и дальнейшая работа

Свои инструкции храните в `.agents/project/skills/<имя>/SKILL.md`.
Сгенерированные `.agents/skills/` и `.claude/skills/` обновляются экспортом.
После изменения исходных правил:

```sh
npx --no-install contextos compile
npx --no-install contextos export gemini,claude
npx --no-install contextos export gemini,claude --check --json
```

Проверяйте тот же набор адаптеров, который экспортировали. Результат `drift`
означает, что файлы отстали от правил; результат `error` требует исправить
указанную ошибку. ContextOS сохраняет пользовательский текст и откажется молча
заменять изменённые или чужие файлы.

Сохраните в Git `package.json`, `package-lock.json`, исходные правила,
сгенерированные файлы и lockfile ContextOS. На другой машине выполните
`npm ci --ignore-scripts`; Git понадобится и для установки зависимости из тега.

### Установка после будущей публикации npm

Когда `contextos-agents@3.0.0` будет отдельно опубликован, вместо Git-зависимости
можно будет выполнить:

```sh
npm install --save-dev --save-exact contextos-agents@3.0.0
```

Команды `init`, `compile` и `export` останутся теми же. До публикации npm
используйте Git-тег выше или [проверенный локальный архив](RELEASE_3.0.0.md#try-the-prepared-archive).
