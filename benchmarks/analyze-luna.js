#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, hash } = require('./luna/fixture');
const { atomicJson } = require('./luna/spending');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function fileEvidence(file) { return { path: path.relative(ROOT, file).replace(/\\/g, '/'), sha256: hash(fs.readFileSync(file)) }; }
function responseFiles(root) {
  const found = [];
  if (!fs.existsSync(root)) return found;
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, item.name);
    if (item.isDirectory()) found.push(...responseFiles(file));
    else if (item.isFile() && /^response-\d+\.json$/.test(item.name)) found.push(file);
  }
  return found;
}

function analyze() {
  const root = path.join(ROOT, 'scratch/luna-benchmark');
  const runNames = fs.readdirSync(root).filter(name => /-(pilot|full)$/.test(name)).sort();
  const reports = runNames.map(name => path.join(root, name, 'report.json')).filter(file => fs.existsSync(file)).map(file => ({ file, report: readJson(file) }));
  const latest = reports.at(-1);
  if (!latest) throw new Error('No Luna agent report');
  const nativeRoot = path.join(ROOT, 'scratch/luna-native');
  const nativeReports = fs.existsSync(nativeRoot) ? fs.readdirSync(nativeRoot).map(name => path.join(nativeRoot, name, 'report.json')).filter(file => fs.existsSync(file)).map(file => ({ file, report: readJson(file) })).sort((a, b) => a.report.timestamp.localeCompare(b.report.timestamp)) : [];
  const native = nativeReports.at(-1);
  const responses = responseFiles(root).map(file => ({ file, value: readJson(file) }));
  const knownCost = responses.reduce((sum, { value }) => sum + (value.charge?.standardRateEstimateUsd ?? 0), 0);
  const ledger = readJson(path.join(ROOT, 'scratch/live-benchmark/spend-ledger.json'));
  const evidence = {
    timestamp: new Date().toISOString(), resultScope: 'seeded-repository-regression; four modules; no general quality claim',
    reports: reports.map(({ file, report }) => ({ ...fileEvidence(file), mode: report.plan.mode, attemptsRecorded: report.results.length, summary: report.summary })),
    latest: { ...fileEvidence(latest.file), summary: latest.report.summary },
    allAgentRequests: { savedResponses: responses.length, completed: responses.filter(({ value }) => value.response?.status === 'completed').length,
      savedErrors: responses.filter(({ value }) => value.error).length, knownStandardRateEstimateUsd: knownCost,
      note: 'Includes interrupted and superseded pilot attempts. Unknown request costs are retained in the shared ledger. Estimate is not the invoice when cache writes are unknown.' },
    native: native ? { ...fileEvidence(native.file), report: native.report } : { result: 'NOT RUN' },
    sharedLedger: { ...fileEvidence(path.join(ROOT, 'scratch/live-benchmark/spend-ledger.json')), retainedUsd: ledger.reservedMicroUsd / 1e6, remainingUsd: (ledger.limitMicroUsd - ledger.reservedMicroUsd) / 1e6 },
    controls: fileEvidence(path.join(root, 'controls.json')),
    rawResponses: responses.map(({ file }) => fileEvidence(file)),
  };
  const arms = latest.report.summary.arms;
  const triples = new Map();
  for (const result of latest.report.results) {
    const key = `${result.taskId}/${result.repetition}`;
    if (!triples.has(key)) triples.set(key, []);
    triples.get(key).push(result);
  }
  const balancedResults = [...triples.values()].filter(group => group.length === latest.report.plan.arms.length && group.every(result => !result.apiError && !result.acceptance.infrastructureError)).flat();
  const label = id => ({ 'arm-a-vanilla': 'Vanilla', 'full-installed': 'Все установленные', 'arm-c-contextos-core': 'Focused ContextOS' })[id] || id;
  const money = value => value === null ? 'неизвестно' : `$${value.toFixed(6)}`;
  const tokens = value => value == null ? 'неизвестно' : String(value);
  const complete = latest.report.results.length === latest.report.plan.attempts && latest.report.results.every(result => !result.apiError && !result.acceptance.infrastructureError);
  const markdown = [
    '# GPT-6 Luna: текущие результаты', '',
    `Сформировано: ${evidence.timestamp}. Последний запуск: ${latest.report.plan.mode}.`, '',
    `Записано ${latest.report.results.length}/${latest.report.plan.attempts} попыток; полных сравнимых троек: ${latest.report.summary.balancedTriples}. Статус: ${complete ? 'запуск завершён' : 'частичный запуск'}.`, '',
    '## Качество на одинаковых task/repetition', '',
    '| Ветка | Тесты пройдены / сравнимых | Попытки завершены успешно | Входные токены | Из них кеш | Выходные токены | Оценка стоимости сравнимых попыток |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...arms.map(arm => {
      const matched = balancedResults.filter(result => result.armId === arm.armId);
      const cost = matched.every(result => result.standardRateEstimateUsd !== null) ? matched.reduce((sum, result) => sum + result.standardRateEstimateUsd, 0) : null;
      return `| ${label(arm.armId)} | ${matched.filter(result => result.acceptance.passed).length}/${arm.balancedAttempts} | ${arm.balancedSolved}/${arm.balancedAttempts} | ${tokens(arm.balancedUsage.promptTokens)} | ${tokens(arm.balancedUsage.cachedPromptTokens)} | ${tokens(arm.balancedUsage.completionTokens)} | ${money(cost)} |`;
    }), '',
    'Качество, токены и стоимость в таблице относятся только к полным тройкам. Provider errors не считаются ошибками модели; лимит шагов/выхода считается неудачной попыткой. Отдельные ошибки API и частичные правки сохранены в raw report.', '',
    '## Ограничения вывода', '',
    'Это внесённые регрессии в четырёх реальных модулях, а не корпус исторических задач. Повторения коррелированы. Успех на этом наборе не доказывает пользу на произвольных задачах, production security или активацию навыков Cursor.', '',
    'Если все ветки исправили одинаковое число задач, преимущество по качеству не установлено. Экономия focused относительно all-installed сама по себе не доказывает преимущество относительно vanilla. Время попытки включает ожидания TPM; это не чистая скорость генерации модели.', '',
    '## Запуски и расходы', '',
    `Сохранено агентных HTTP-ответов/ошибок: ${responses.length}, завершённых ответов: ${evidence.allAgentRequests.completed}. Известная оценка по стандартным ставкам: ${money(knownCost)}. Сюда входят предыдущие частичные и остановленные пилоты.`, '',
    `Общий консервативный резерв вместе с прежними GPT-4.1-mini запусками: ${money(evidence.sharedLedger.retainedUsd)}. Осталось в согласованных $10: ${money(evidence.sharedLedger.remainingUsd)}. Неизвестные расходы сохраняют резерв; оценка не равна счёту при неизвестных cache writes.`, '',
    'Первый пилот остановился из-за API 429: наблюдавшийся лимит проекта — 60 000 TPM. Следующий был остановлен оператором для исправления ёмкости ограничителя. Повторные пилоты сохраняются отдельно; их ответы не смешиваются с качеством последнего запуска.', '',
    ...latest.report.results.filter(result => result.apiError).map(result => `Последняя ошибка ${result.id}: ${result.apiError.includes('requests per day') ? '**RPD 50: дневной лимит исчерпан**' : result.apiError.includes('tokens per min') ? '**TPM: минутный лимит**' : 'см. raw report'}. Скрытые тесты после частичных правок: ${result.acceptance.passed ? 'PASS' : 'FAIL'}.`), '',
    `Нативная явная активация Codex CLI: **${native?.report.result ?? 'NOT RUN'}**.${native ? ` Workflow body loaded: ${native.report.workflowBodyLoaded}; probe loaded: ${native.report.probeBodyLoaded}; marker returned: ${native.report.markerReturned}.` : ''}`, '',
    '## Воспроизведение', '',
    '[Протокол и команды](LUNA_BENCHMARK_PROTOCOL.md). Machine-readable evidence: [luna-2026-10-01.json](evidence/luna-2026-10-01.json).', '',
    `Последний raw report: \`${path.relative(ROOT, latest.file).replace(/\\/g, '/')}\`. Анализ выполняется без API: \`node benchmarks/analyze-luna.js\`.`, '',
  ].join('\n');
  fs.mkdirSync(path.join(ROOT, 'docs/evidence'), { recursive: true });
  atomicJson(path.join(ROOT, 'docs/evidence/luna-2026-10-01.json'), evidence);
  fs.writeFileSync(path.join(ROOT, 'docs/LUNA_BENCHMARK_RESULTS_2026-10-01.md'), markdown);
  console.log(`Luna evidence: ${responses.length} saved HTTP responses/errors; latest ${latest.report.results.length}/${latest.report.plan.attempts} attempts.`);
  return evidence;
}

if (require.main === module) analyze();
module.exports = { analyze };
