#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { CASES } = require('./luna/cases');
const { ORACLES } = require('./luna/oracles');
const { ROOT, hash, createFixture, runTool, evaluate, validateControls } = require('./luna/fixture');
const { PRICING, pricingFor, Budget, reservation, atomicJson } = require('./luna/spending');
const { bodyFor, initialInput, runAttempt, redact } = require('./luna/client');
const { ARMS } = require('./v2/arms/arm-definitions');
const { buildPromptContext } = require('./v2/harness/prompts');
const { sumUsage } = require('./lib/usage');
const { Pacer } = require('./luna/pacing');

const OUTPUT = path.join(ROOT, 'scratch/luna-benchmark');
const SHARED = path.join(ROOT, 'scratch/live-benchmark');
const PILOT_IDS = ['resolve-budget', 'paths-traversal', 'workspace-limit'];
const CONTROLLER_FILES = ['benchmarks/run-luna-agent.js', ...['cases.js', 'oracles.js', 'fixture.js', 'worker.cjs', 'spending.js', 'client.js', 'pacing.js'].map(name => `benchmarks/luna/${name}`), 'benchmarks/v2/harness/prompts.js', '.agents/resolver/canonical-resolver.js', '.agents/compiler/manifest-compiler.js'];

function parseOptions(args) {
  const options = { mode: 'pilot', run: false, resume: null, controlsOnly: false, tpm: 60000, rpm: 500, limitUsd: 10, maxSteps: 6, model: PRICING.model, reasoningEffort: 'medium' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run') options.run = true;
    else if (args[i] === '--controls-only') options.controlsOnly = true;
    else if (args[i] === '--mode') options.mode = args[++i];
    else if (args[i] === '--resume') options.resume = args[++i];
    else if (args[i] === '--tpm') options.tpm = Number(args[++i]);
    else if (args[i] === '--rpm') options.rpm = Number(args[++i]);
    else if (args[i] === '--budget-usd') options.limitUsd = Number(args[++i]);
    else if (args[i] === '--max-steps') { const value = Number(args[++i]); options.maxSteps = value === 0 ? null : value; }
    else if (args[i] === '--model') options.model = args[++i];
    else if (args[i] === '--reasoning') options.reasoningEffort = args[++i];
    else throw new Error('Usage: node benchmarks/run-luna-agent.js [--mode pilot|full] [--run] [--resume RUN_ID] [--controls-only] [--tpm N]');
  }
  if (!['pilot', 'full'].includes(options.mode) || (options.resume !== null && (typeof options.resume !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(options.resume) || options.resume.startsWith('.')))) throw new Error('Invalid mode or resume identifier');
  if (options.controlsOnly && (options.run || options.resume)) throw new Error('Controls-only cannot make or resume paid requests');
  if (!Number.isSafeInteger(options.tpm) || options.tpm < 1000 || options.tpm > 10000000) throw new Error('Invalid TPM pacing limit');
  if (!Number.isSafeInteger(options.rpm) || options.rpm < 1 || options.rpm > 500) throw new Error('Invalid RPM pacing limit');
  if (!(options.limitUsd > 0 && options.limitUsd <= 50)) throw new Error('Invalid authorized budget');
  if (options.maxSteps !== null && (!Number.isSafeInteger(options.maxSteps) || options.maxSteps < 1)) throw new Error('Invalid step limit');
  pricingFor(options.model);
  if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(options.reasoningEffort)) throw new Error('Invalid reasoning effort');
  return options;
}

function prepareConsumer(parent) {
  const consumer = fs.mkdtempSync(path.join(parent, 'consumer-'));
  fs.mkdirSync(path.join(consumer, '.agents'), { recursive: true });
  fs.cpSync(path.join(ROOT, '.agents/core'), path.join(consumer, '.agents/core'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, '.agents/AGENTS.md'), path.join(consumer, '.agents/AGENTS.md'));
  for (const id of ['typescript', 'database', 'ddd', 'system-design']) fs.cpSync(path.join(ROOT, 'catalog/skills', id), path.join(consumer, '.agents/plugins', id), { recursive: true });
  return consumer;
}

function buildPlan(options, consumer, sources) {
  const tasks = options.mode === 'full' ? CASES : CASES.filter(task => PILOT_IDS.includes(task.id));
  const arms = [ARMS.ARM_A_VANILLA,
    { ...ARMS.ARM_C_CONTEXTOS_CORE, id: 'full-installed', contextMode: 'full-installed', contextRoot: consumer },
    { ...ARMS.ARM_C_CONTEXTOS_CORE, contextRoot: consumer }];
  const entries = [];
  const repeats = options.mode === 'full' ? 3 : 1;
  for (const [index, task] of tasks.entries()) {
    for (let repetition = 1; repetition <= repeats; repetition++) {
      // Deterministically rotate arm order to distribute temporal cache/rate effects.
      const rotation = (index + repetition - 1) % arms.length;
      const ordered = [...arms.slice(rotation), ...arms.slice(0, rotation)];
      for (const arm of ordered) {
        const context = buildPromptContext(arm, task);
        if (context.contextMetadata.missingSkillIds.length) throw new Error('Selected context documents are missing');
        entries.push({ id: `${task.id}__${arm.id}__${repetition}`, taskId: task.id, armId: arm.id, repetition,
          instructions: context.systemInstruction, contextMetadata: context.contextMetadata,
          instructionsSha256: hash(context.systemInstruction) });
      }
    }
  }
  const controller = CONTROLLER_FILES.map(file => ({ file, sha256: hash(fs.readFileSync(path.join(ROOT, file))) }));
  const sourceHashes = Object.entries(sources).map(([file, content]) => ({ file, sha256: hash(content) }));
  const model = options.model || PRICING.model, reasoningEffort = options.reasoningEffort || 'medium';
  return { schemaVersion: 1, datasetKind: 'seeded-repository-regression', mode: options.mode, model,
    reasoningEffort, maxSteps: options.maxSteps === undefined ? 6 : options.maxSteps, maxOutputTokens: 4096, tpmPacing: options.tpm, rpmPacing: options.rpm ?? 500, authorizedBudgetUsd: options.limitUsd ?? 10, repeats, attempts: entries.length,
    tasks: tasks.map(({ id, file, title, contract, group }) => ({ id, file, title, contract, group })),
    arms: arms.map(arm => arm.id), entries, controller, sourceHashes, oracleSha256: hash(JSON.stringify(ORACLES)),
    fingerprint: hash(JSON.stringify({ controller, sourceHashes, tasks, mode: options.mode, model, reasoningEffort, tpm: options.tpm, rpm: options.rpm, maxSteps: options.maxSteps, entries: entries.map(({ id, instructionsSha256 }) => ({ id, instructionsSha256 })) })) };
}

function summarize(results, plan) {
  const groups = new Map();
  for (const result of results) {
    const key = `${result.taskId}/${result.repetition}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }
  // Infrastructure failures are never silently counted as model failures.
  const balanced = [...groups.values()].filter(group => group.length === plan.arms.length && group.every(result => !result.apiError && !result.acceptance.infrastructureError));
  return { attemptsRecorded: results.length, attemptsPlanned: plan.attempts, balancedTriples: balanced.length,
    arms: plan.arms.map(armId => {
      const all = results.filter(result => result.armId === armId);
      const matched = balanced.map(group => group.find(result => result.armId === armId));
      const knownCosts = all.filter(result => result.standardRateEstimateUsd !== null);
      return { armId, attempts: all.length, apiErrors: all.filter(result => result.apiError).length,
        stepLimitFailures: all.filter(result => result.stoppedAtStepLimit).length,
        outputLimitFailures: all.filter(result => result.stoppedAtOutputLimit).length,
        infrastructureFailures: all.filter(result => result.acceptance.infrastructureError).length,
        solved: all.filter(result => !result.apiError && result.finished && result.acceptance.passed).length,
        balancedSolved: matched.filter(result => result.finished && result.acceptance.passed).length, balancedAttempts: matched.length,
        standardRateEstimateUsd: knownCosts.length === all.length ? all.reduce((sum, result) => sum + result.standardRateEstimateUsd, 0) : null,
        knownStandardRateEstimateUsd: knownCosts.reduce((sum, result) => sum + result.standardRateEstimateUsd, 0),
        requests: all.reduce((sum, result) => sum + (result.requestCount ?? 0), 0),
        usage: sumUsage(all.map(result => result.usage)), balancedUsage: sumUsage(matched.map(result => result.usage)),
        elapsedMs: all.reduce((sum, result) => sum + result.elapsedMs, 0),
        toolCalls: all.reduce((sum, result) => sum + result.toolCalls, 0) };
    }), limitation: 'Repeated seeded tasks in four modules are correlated. This corpus is calibration evidence, not proof of general coding quality or native client activation.' };
}

function findPassingPilot(output = OUTPUT, profile = { model: PRICING.model, reasoningEffort: 'medium' }) {
  if (!fs.existsSync(output)) return null;
  for (const name of fs.readdirSync(output).sort().reverse()) {
    const reportPath = path.join(output, name, 'report.json');
    if (!fs.existsSync(reportPath)) continue;
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (report.plan?.model === profile.model && report.plan?.reasoningEffort === profile.reasoningEffort && report.plan?.mode === 'pilot' && report.results?.length === 9 && report.results.every(result => result.finished && !result.apiError && !result.acceptance.infrastructureError) && report.results.some(result => result.acceptance.passed && result.toolCalls > 0)) return { path: reportPath, sha256: hash(fs.readFileSync(reportPath)), controller: report.plan.controller, sourceHashes: report.plan.sourceHashes };
  }
  return null;
}

async function main(options = parseOptions(process.argv.slice(2))) {
  const pricing = pricingFor(options.model || PRICING.model);
  const profile = { model: pricing.model, reasoningEffort: options.reasoningEffort || 'medium' };
  const OUTPUT = path.join(ROOT, pricing.model === PRICING.model ? 'scratch/luna-benchmark' : 'scratch/sol-benchmark');
  fs.mkdirSync(OUTPUT, { recursive: true }); fs.mkdirSync(SHARED, { recursive: true });
  const lockPath = path.join(SHARED, 'run.lock');
  const lock = fs.openSync(lockPath, 'wx');
  try {
    const sources = {};
    for (const file of new Set(CASES.flatMap(task => [task.file, ...task.dependencies]))) sources[file] = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const controls = await validateControls(path.join(OUTPUT, 'controls'), CASES, sources);
    atomicJson(path.join(OUTPUT, 'controls.json'), { timestamp: new Date().toISOString(), node: process.version, oracleSha256: hash(JSON.stringify(ORACLES)), controls });
    if (!controls.every(result => result.valid)) throw new Error('Positive/negative dataset controls failed; no API requests permitted');
    console.log(`Controls: ${controls.length}/${CASES.length} positive and negative pairs passed.`);
    if (options.controlsOnly) return;
    const consumer = prepareConsumer(OUTPUT);
    const plan = buildPlan(options, consumer, sources);
    const budget = new Budget(path.join(SHARED, 'spend-ledger.json'), { limitUsd: options.limitUsd ?? 10 });
    const pacer = new Pacer({ tokensPerMinute: options.tpm, requestsPerMinute: options.rpm ?? 500, onWait: delay => console.log(`Rate pacing: waiting ${(delay / 1000).toFixed(1)}s before the next request.`) });
    const firstRequestUpper = plan.entries.reduce((max, entry) => {
      const task = CASES.find(item => item.id === entry.taskId);
      const input = initialInput({ files: [task.file, ...task.dependencies], editable: task.file }, task);
      return Math.max(max, reservation(bodyFor(entry.instructions, input, profile)));
    }, 0);
    // Also validate the expected first file-read response before any paid call;
    // later transcript growth still passes through both pacing and spend guards.
    for (const entry of plan.entries) {
      const task = CASES.find(item => item.id === entry.taskId);
      const input = initialInput({ files: [task.file, ...task.dependencies], editable: task.file }, task);
      input.push({ type: 'function_call_output', call_id: 'preflight', output: sources[task.file] });
      const expected = bodyFor(entry.instructions, input, profile);
      reservation(expected);
      if (Math.ceil(Buffer.byteLength(JSON.stringify(expected)) / 3) + expected.max_output_tokens > options.tpm) throw new Error('TPM pacing limit is too small for the source-read preflight');
    }
    atomicJson(path.join(OUTPUT, 'preflight.json'), { ...plan, pricing, remainingSharedBudgetUsd: budget.remainingUsd,
      firstRequestReservationUpperUsd: firstRequestUpper / 1e6, note: 'Each request is checked against the authorized cumulative budget; maxSteps null means no per-attempt request count cap.' });
    console.log(`${plan.mode}: ${plan.attempts} attempts, ${plan.maxSteps === null ? 'no request count cap' : `up to ${plan.attempts * plan.maxSteps} HTTP requests`}; shared remaining budget $${budget.remainingUsd.toFixed(4)}.`);
    if (!options.run) return;
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is unavailable. Use the masked run-luna-agent.ps1 launcher.');
    const pilot = plan.mode === 'full' ? findPassingPilot(OUTPUT, profile) : null;
    if (plan.mode === 'full' && (!pilot || JSON.stringify(pilot.controller) !== JSON.stringify(plan.controller) || JSON.stringify(pilot.sourceHashes) !== JSON.stringify(plan.sourceHashes))) throw new Error('A completed tool-capable pilot with the same controller and sources is required before the full run');
    const runId = options.resume || `${new Date().toISOString().replace(/[:.]/g, '-')}-${plan.mode}`;
    const runDir = path.join(OUTPUT, runId);
    let results = [];
    if (options.resume) {
      const saved = JSON.parse(fs.readFileSync(path.join(runDir, 'report.json'), 'utf8'));
      if (saved.plan.fingerprint !== plan.fingerprint) throw new Error('Resume refused: dataset, source, context, or controller drift');
      results = saved.results.filter(result => !result.apiError);
      // Failed HTTP attempts stay in audit history and keep budget reservations.
      atomicJson(path.join(runDir, `resume-history-${Date.now()}.json`), saved);
    } else fs.mkdirSync(runDir);
    const writeReport = () => atomicJson(path.join(runDir, 'report.json'), { timestamp: new Date().toISOString(), plan, controls, pilot,
      results, summary: summarize(results, plan), spending: { remainingSharedBudgetUsd: budget.remainingUsd, retainedSharedUsd: budget.ledger.reservedMicroUsd / 1e6, pricing } });
    writeReport();
    for (const entry of plan.entries) {
      if (results.some(result => result.id === entry.id)) continue;
      const task = CASES.find(item => item.id === entry.taskId);
      const artifactDir = fs.mkdtempSync(path.join(runDir, `${entry.id}-`));
      const fixture = createFixture(artifactDir, task, { sources });
      const before = runTool(fixture, 'read_file', { path: task.file });
      fs.writeFileSync(path.join(artifactDir, 'before.js'), before);
      const attempt = await runAttempt({ fixture, task, instructions: entry.instructions, budget, key: process.env.OPENAI_API_KEY, pacer, profile, maxSteps: plan.maxSteps,
        save: (step, value) => atomicJson(path.join(artifactDir, `response-${step}.json`), value),
        onStep: step => console.log(`${entry.id}: request ${step}${plan.maxSteps === null ? '' : `/${plan.maxSteps}`}`) });
      const acceptance = await evaluate(fixture, task);
      const after = runTool(fixture, 'read_file', { path: task.file });
      fs.writeFileSync(path.join(artifactDir, 'after.js'), after);
      const result = { id: entry.id, taskId: task.id, armId: entry.armId, repetition: entry.repetition, ...attempt, acceptance,
        artifactDirectory: path.relative(ROOT, artifactDir).replace(/\\/g, '/'), sourceChanged: before !== after,
        beforeSha256: hash(before), afterSha256: hash(after), sourceProvenance: fixture.provenance };
      results.push(result); writeReport();
      console.log(`${entry.id}: ${attempt.apiError ? 'API ERROR' : acceptance.passed && attempt.finished ? 'PASS' : 'FAIL'}`);
      if (attempt.apiError || acceptance.infrastructureError) { process.exitCode = 1; break; } // Fail fast; resume explicitly after fixing access/rate limits.
    }
    console.log(`Report: ${path.join(runDir, 'report.json')}`);
  } finally { fs.closeSync(lock); fs.unlinkSync(lockPath); }
}

if (require.main === module) main().catch(error => { console.error(redact(error.message)); process.exitCode = 1; });
module.exports = { parseOptions, buildPlan, prepareConsumer, summarize, findPassingPilot, main };
