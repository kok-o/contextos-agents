#!/usr/bin/env node
'use strict';
// Re-evaluate saved answers after evaluator fixes; never contacts a provider.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { API_BENCHMARK_TASKS } = require('./v2/tasks');
const { buildReport, evaluateResponse } = require('./v2/harness/api-runner');
const { extractCodeBlocks } = require('./lib/evaluator');
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'scratch/live-benchmark');
async function main() {
  const name = process.argv[2];
  if (!name || !/^\d{4}-\d{2}-\d{2}T[\dTZ-]+$/.test(name)) throw new Error('Pass an existing benchmark run directory name, without a path.');
  const directory = path.join(OUTPUT, name);
  const rawReport = fs.readFileSync(path.join(directory, 'report.json'));
  const original = JSON.parse(rawReport);
  const responses = fs.readdirSync(directory).filter(file => /^response-\d+\.json$/.test(file)).sort().map(file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')));
  let answerIndex = 0;
  const runs = [];
  for (const run of original.runs) {
    if (run.status !== 'completed') { runs.push(run); continue; }
    const answer = responses[answerIndex++];
    if (!answer || answer.request.prompt !== run.prompts.userTask || answer.request.systemInstruction !== run.prompts.systemInstruction || extractCodeBlocks(answer.generated.text) !== run.code) throw new Error('Saved answer provenance does not match the original report.');
    const task = API_BENCHMARK_TASKS.find(candidate => candidate.id === run.taskId);
    if (!task) throw new Error(`Unknown recorded task: ${run.taskId}`);
    const result = await evaluateResponse(task, answer.generated.text, run.usage, run.generationSettings.maxOutputTokens, run.latencyMs, {}, true);
    runs.push({ ...run, code: result.code, oracle: result.oracle, evaluation: result.evaluation, success: result.evaluation.harness_verified_success });
    console.log(`${run.taskId} / ${run.armId} / ${run.repetition}: ${result.evaluation.harness_verified_success ? 'PASS' : 'FAIL'}`);
  }
  if (answerIndex !== responses.length) throw new Error('Unmatched saved API answers.');
  const arms = original.methodology.arms.map(id => ({ id, name: original.runs.find(run => run.armId === id).armName }));
  const report = buildReport({ mode: 'api-offline-reevaluation', provider: original.provider, model: original.model, tasks: API_BENCHMARK_TASKS, arms, repeats: original.methodology.repetitionsPerTask, generationSettings: original.methodology.generationSettings, runs });
  report.methodology.contextTreatment = 'Vanilla, all 11 installed skill entrypoints, or canonical focused selection against the same installed consumer. Saved answers are reevaluated without new generation.';
  report.methodology.syntaxGate = 'Native Node stripTypeScriptTypes in transform mode; no source repair; followed by CommonJS execution and registered assertions. Full TypeScript type checking is not included.';
  report.spending = original.spending;
  report.provenance = { ...original.provenance, reevaluation: { originalReportSha256: crypto.createHash('sha256').update(rawReport).digest('hex'), apiRequests: 0, evaluatorSources: ['benchmarks/lib/runtime-runner.js', 'benchmarks/lib/runtime-worker.js', 'benchmarks/lib/runtime-suites.js', 'benchmarks/lib/maintenance-suites.js'].map(file => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex') })) } };
  fs.writeFileSync(path.join(directory, 'report-reevaluated.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
