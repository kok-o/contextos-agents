#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { LLMClient } = require('./lib/llm-client');
const { PRICING, SpendGuard } = require('./lib/spend-guard');
const { API_BENCHMARK_TASKS } = require('./v2/tasks');
const { ARMS } = require('./v2/arms/arm-definitions');
const { buildPromptContext, buildTaskPrompt } = require('./v2/harness/prompts');
const { runApiBenchmark } = require('./v2/harness/api-runner');
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'scratch', 'live-benchmark');
const FULL = { ...ARMS.ARM_C_CONTEXTOS_CORE, id: 'full-installed', name: 'All installed entrypoints', contextMode: 'full-installed' };
const CONTEXT_ROOT = path.join(OUTPUT, 'consumer');
const COMPARATORS = [ARMS.ARM_A_VANILLA, { ...FULL, contextRoot: CONTEXT_ROOT }, { ...ARMS.ARM_C_CONTEXTOS_CORE, contextRoot: CONTEXT_ROOT }];
const MAX_TOKENS = 4096;
const REPEATS = 3;

function buildPlan() {
  // Installed consumer context for the task corpus; catalog presence in the
  // development checkout is not treated as installation.
  fs.mkdirSync(path.join(CONTEXT_ROOT, '.agents'), { recursive: true });
  fs.cpSync(path.join(ROOT, '.agents/core'), path.join(CONTEXT_ROOT, '.agents/core'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, '.agents/AGENTS.md'), path.join(CONTEXT_ROOT, '.agents/AGENTS.md'));
  for (const id of ['typescript', 'database', 'ddd', 'system-design']) {
    fs.cpSync(path.join(ROOT, 'catalog/skills', id), path.join(CONTEXT_ROOT, '.agents/plugins', id), { recursive: true });
  }
  const requests = [];
  for (const task of API_BENCHMARK_TASKS) {
    for (const arm of COMPARATORS) {
      for (let repetition = 1; repetition <= REPEATS; repetition++) {
        const context = buildPromptContext(arm, task);
        if (context.contextMetadata.missingSkillIds.length) throw new Error('Benchmark context has missing selected sources');
        requests.push({ taskId: task.id, armId: arm.id, repetition, prompt: buildTaskPrompt(task), systemInstruction: context.systemInstruction, maxTokens: MAX_TOKENS });
      }
    }
  }
  return requests;
}

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--run')) throw new Error('Usage: node benchmarks/run-budgeted-openai.js [--run]');
  fs.mkdirSync(OUTPUT, { recursive: true });
  const ledgerPath = path.join(OUTPUT, 'spend-ledger.json');
  const lockPath = path.join(OUTPUT, 'run.lock');
  const lock = fs.openSync(lockPath, 'wx');
  try {
    const prior = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : { reservedMicroUsd: 0 };
    const guard = new SpendGuard({ maxUsd: 10, reservedMicroUsd: prior.reservedMicroUsd, persist: ledger => {
      const temporary = `${ledgerPath}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(ledger, null, 2));
      fs.renameSync(temporary, ledgerPath);
    } });
    const requests = buildPlan();
    const reserve = guard.preflight(requests);
    const plan = { model: PRICING.model, pricing: PRICING, tasks: API_BENCHMARK_TASKS.map(task => task.id), arms: COMPARATORS.map(arm => arm.id), repeats: REPEATS, runs: requests.length, maxOutputTokens: MAX_TOKENS, remainingLimitUsd: (guard.limitMicroUsd - guard.reservedMicroUsd) / 1e6, conservativeReserveUsd: reserve / 1e6, contextHashes: requests.map(request => ({ taskId: request.taskId, armId: request.armId, repetition: request.repetition, sha256: crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex') })) };
    fs.writeFileSync(path.join(OUTPUT, 'preflight.json'), JSON.stringify(plan, null, 2));
    console.log(`Preflight: ${requests.length} runs; conservative reservation $${plan.conservativeReserveUsd.toFixed(4)}; remaining limit $${plan.remainingLimitUsd.toFixed(2)}.`);
    if (!process.argv.includes('--run')) return;
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is unavailable. Use benchmarks/run-budgeted-openai.ps1 for masked input.');
    // Fixed official endpoint; credentials cannot be redirected by inherited URL settings.
    const base = new LLMClient({ provider: 'openai', model: PRICING.model, baseUrl: 'https://api.openai.com', maxRetries: 1, timeoutMs: 120000 });
    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    const runDir = path.join(OUTPUT, runId);
    fs.mkdirSync(runDir);
    const costs = [];
    const client = { provider: base.provider, model: base.model, maxRetries: 1, timeoutMs: base.timeoutMs, generate: async request => {
      const generated = await guard.generate(base, request);
      costs.push({ usage: generated.usage, estimatedCostUsd: generated.estimatedCostUsd });
      fs.writeFileSync(path.join(runDir, `response-${String(costs.length).padStart(3, '0')}.json`), JSON.stringify({ request, generated }, null, 2));
      return generated;
    } };
    const report = await runApiBenchmark({ client, tasks: API_BENCHMARK_TASKS, arms: COMPARATORS, maxTokens: MAX_TOKENS, repeats: REPEATS, onProgress: ({ task, arm, repetition, phase }) => console.log(`${task.id} / ${arm.id} / ${repetition}: ${phase}`) });
    report.spending = { pricing: PRICING, conservativeReservedUsd: guard.reservedMicroUsd / 1e6, knownReportedCostUsd: costs.reduce((sum, item) => sum + item.estimatedCostUsd, 0), limits: 'Reservations persist across launches. Unknown or timed-out requests remain reserved. Other project usage is outside this runner.' };
    report.provenance = { node: process.version, platform: process.platform, preflight: plan, sources: ['.agents/AGENTS.md', '.agents/resolver/canonical-resolver.js', 'benchmarks/lib/maintenance-suites.js', 'benchmarks/lib/spend-guard.js'].map(file => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex') })) };
    fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`Report: ${runDir}. Known provider cost: $${report.spending.knownReportedCostUsd.toFixed(4)}.`);
    if (report.summary.failedRuns) process.exitCode = 1;
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}
if (require.main === module) main().catch(error => {
  console.error(String(error.message).replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[REDACTED]'));
  process.exitCode = 1;
});
module.exports = { buildPlan };
