'use strict';

const crypto = require('crypto');
const { extractCodeBlocks } = require('../../lib/evaluator');
const { normalizeUsage, sumUsage } = require('../../lib/usage');
const { BenchmarkEvaluator } = require('../evaluators/verified-success');
const { BenchmarkStatistics } = require('../analysis/statistics');
const { buildPromptContext, buildTaskPrompt } = require('./prompts');
const { runRuntimeSuite, assertRuntimeIsolationAvailable } = require('../../lib/runtime-runner');

const DEFAULT_TEMPERATURE = 0.1;

function apiGenerationSettings(client, maxTokens) {
  return {
    temperature: DEFAULT_TEMPERATURE,
    temperatureApplied: !((client.provider === 'openai' || client.provider === 'custom') && /^o[1-3]/i.test(client.model || '')),
    maxOutputTokens: maxTokens,
    maxAttempts: Number.isSafeInteger(client.maxRetries) ? client.maxRetries : null,
    requestTimeoutMs: Number.isSafeInteger(client.timeoutMs) ? client.timeoutMs : null,
  };
}

function redactedError(error) {
  return String(error?.message || error || 'Unknown error')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b/g, '[REDACTED]');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function securityFailures(oracle) {
  return (oracle.tests || [])
    .filter(test => !test.passed && /(timing|rate|stack|sanit|secret|credential|security)/i.test(test.id || ''))
    .map(test => test.id);
}

async function evaluateResponse(task, responseText, usage, maxTokens, durationMs = 0, runtimeOptions = {}, requireTokenUsage = false) {
  const code = extractCodeBlocks(responseText);
  const oracle = await runRuntimeSuite(task.runtimeSuite, code, runtimeOptions);
  const evaluation = BenchmarkEvaluator.evaluate({
    patchApplied: Boolean(code),
    compilationPassed: oracle.compiled,
    oracleTestsTotal: oracle.totalTests,
    oracleTestsPassed: oracle.totalPassed,
    securityFindings: securityFailures(oracle),
    generatedCode: code,
    budget: {
      tokensUsed: usage.completionTokens,
      tokenLimit: maxTokens,
      requireTokenUsage,
      requireTimeUsage: requireTokenUsage,
      durationMs,
      timeoutMs: task.timeoutMs || 300_000,
    },
  });
  return { code, oracle, evaluation };
}

function requestedArmOrder(taskId, arms) {
  if (arms.length < 2) return arms;
  let hash = 0;
  for (const char of taskId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const shift = hash % arms.length;
  return arms.slice(shift).concat(arms.slice(0, shift));
}

async function runApiBenchmark({ client, tasks, arms, maxTokens = 4096, repeats = 1, onProgress = () => {}, runtimeOptions = {} }) {
  if (!client || typeof client.generate !== 'function') throw new Error('An LLM client is required for API benchmark mode.');
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('At least one benchmark task is required.');
  if (!Array.isArray(arms) || arms.length === 0) throw new Error('At least one benchmark arm is required.');
  if (!Number.isSafeInteger(repeats) || repeats < 1 || repeats > 100) throw new Error('API benchmark repeats must be an integer from 1 to 100.');
  if (runtimeOptions.inProcess !== true) assertRuntimeIsolationAvailable();

  const runs = [];
  const generationSettings = apiGenerationSettings(client, maxTokens);
  for (const task of tasks) {
    if (!task.runtimeSuite || !Array.isArray(task.runtimeSuite.tests) || task.runtimeSuite.tests.length === 0) {
      throw new Error(`Task ${task.id} must define a non-empty runtime oracle.`);
    }
    for (let repetition = 1; repetition <= repeats; repetition++) {
      for (const arm of requestedArmOrder(`${task.id}#${repetition}`, arms)) {
        const taskPrompt = buildTaskPrompt(task);
        const promptContext = buildPromptContext(arm, task);
        const promptHashes = {
          system: sha256(promptContext.systemInstruction),
          user: sha256(taskPrompt),
        };
        const started = Date.now();
        onProgress({ task, arm, repetition, phase: 'generate' });
        let generatedUsage = normalizeUsage({}, 'unavailable');
        let generationTimeMs = null;
        let generationReceived = false;
        try {
          const generated = await client.generate({
            prompt: taskPrompt,
            systemInstruction: promptContext.systemInstruction,
            temperature: DEFAULT_TEMPERATURE,
            maxTokens,
          });
          generationReceived = true;
          const usage = generated.usage || normalizeUsage({}, 'unavailable');
          generatedUsage = usage;
          onProgress({ task, arm, repetition, phase: 'evaluate' });
          generationTimeMs = Number.isFinite(generated.latencyMs) ? generated.latencyMs : null;
          const evaluated = await evaluateResponse(task, generated.text, usage, maxTokens, generationTimeMs, runtimeOptions, true);
          runs.push({
            taskId: task.id,
            repetition,
            title: task.title,
            armId: arm.id,
            armName: arm.name,
            generationSettings,
            provider: generated.provider || client.provider,
            model: generated.model || client.model,
            prompts: {
              systemInstruction: promptContext.systemInstruction,
              userTask: taskPrompt,
            },
            promptHashes,
            context: promptContext.contextMetadata,
            status: 'completed',
            durationMs: Date.now() - started,
            latencyMs: generated.latencyMs ?? null,
            usage,
            budgetVerification: {
              tokenUsage: Number.isFinite(usage.completionTokens) ? 'reported' : 'unavailable',
              generationTime: Number.isFinite(generationTimeMs) ? 'reported' : 'unavailable',
            },
            code: evaluated.code,
            oracle: evaluated.oracle,
            evaluation: evaluated.evaluation,
            success: evaluated.evaluation.harness_verified_success,
          });
        } catch (error) {
          runs.push({
            taskId: task.id,
            repetition,
            title: task.title,
            armId: arm.id,
            armName: arm.name,
            generationSettings,
            provider: client.provider || 'unknown',
            model: client.model || 'unknown',
            prompts: {
              systemInstruction: promptContext.systemInstruction,
              userTask: taskPrompt,
            },
            promptHashes,
            context: promptContext.contextMetadata,
            status: generationReceived ? 'evaluator_error' : 'api_error',
            durationMs: Date.now() - started,
            usage: generationReceived
              ? generatedUsage
              : normalizeUsage({ attemptCount: error.attemptCount, unreportedAttempts: error.unreportedAttempts }, 'unavailable'),
            budgetVerification: {
              tokenUsage: Number.isFinite(generatedUsage.completionTokens) ? 'reported' : 'unavailable',
              generationTime: Number.isFinite(generationTimeMs) ? 'reported' : 'unavailable',
            },
            success: false,
            error: redactedError(error),
          });
        }
      }
    }
  }

  return buildReport({
    mode: 'api',
    provider: client.provider || 'unknown',
    model: client.model || 'unknown',
    tasks,
    arms,
    repeats,
    generationSettings,
    runs,
  });
}

async function evaluateChatResponses({ tasks, arms, responses, promptPack = null, model = 'unknown', runtimeOptions = {} }) {
  if (runtimeOptions.inProcess !== true) assertRuntimeIsolationAvailable();
  const runs = [];
  for (const task of tasks) {
    for (const arm of arms) {
      const response = responses?.[task.id]?.[arm.id];
      if (!response || typeof response.responseText !== 'string' || !response.responseText.trim()) {
        throw new Error(`Missing chat response for ${task.id}/${arm.id}.`);
      }
      if (!response.promptProvenance || !/^[a-f0-9]{64}$/i.test(response.promptProvenance.promptSha256 || '') || typeof response.promptProvenance.promptText !== 'string') {
        throw new Error(`Missing exact prompt-pack provenance for ${task.id}/${arm.id}.`);
      }
      const usage = response.usage
        ? normalizeUsage(response.usage, response.usage.source || 'user_reported')
        : normalizeUsage({}, 'unavailable');
      const evaluated = await evaluateResponse(task, response.responseText, usage, Number.MAX_SAFE_INTEGER, Number.isFinite(response.durationMs) ? response.durationMs : null, runtimeOptions);
      runs.push({
        taskId: task.id,
        title: task.title,
        armId: arm.id,
        armName: arm.name,
        provider: 'chat-ui',
        model: response.model || model,
        prompts: { fullPrompt: response.promptProvenance.promptText },
        promptHashes: { fullPrompt: response.promptProvenance.promptSha256 },
        context: response.promptProvenance.context,
        promptPackRunId: response.promptProvenance.runId,
        generationSettings: null,
        status: 'completed',
        durationMs: response.durationMs ?? null,
        budgetVerification: {
          tokenUsage: usage.completionTokens === null ? 'unavailable' : 'reported',
          generationTime: Number.isFinite(response.durationMs) ? 'reported' : 'unavailable',
        },
        usage,
        code: evaluated.code,
        oracle: evaluated.oracle,
        evaluation: evaluated.evaluation,
        success: evaluated.evaluation.harness_verified_success,
      });
    }
  }
  return buildReport({ mode: 'chat-import', provider: 'chat-ui', model, tasks, arms, runs, promptPack });
}

function buildReport({ mode, provider, model, tasks, arms, repeats = 1, generationSettings = null, promptPack = null, runs }) {
  const completed = runs.filter(run => run.status === 'completed');
  const rawStats = BenchmarkStatistics.analyze(completed.map(run => ({
    armId: run.armId,
    success: run.success,
    durationMs: run.durationMs || 0,
  })));
  const armStats = {};
  for (const arm of arms) {
    const armRuns = runs.filter(run => run.armId === arm.id);
    const stats = rawStats.arms[arm.id] || {
      armId: arm.id,
      totalRuns: 0,
      successfulRuns: 0,
      successRate: 0,
      ci95: [0, 0],
      totalCost: null,
      costKnown: false,
      costPerVerifiedSuccess: null,
      avgDurationMs: 0,
    };
    armStats[arm.id] = {
      ...stats,
      requestedRuns: armRuns.length,
      failedRuns: armRuns.filter(run => run.status !== 'completed').length,
      apiErrors: armRuns.filter(run => run.status === 'api_error').length,
      evaluatorErrors: armRuns.filter(run => run.status === 'evaluator_error').length,
      usage: sumUsage(armRuns.map(run => run.usage)),
    };
  }

  const byTask = new Map();
  for (const run of completed) {
    const pairKey = `${run.taskId}#${run.repetition || 1}`;
    if (!byTask.has(pairKey)) byTask.set(pairKey, new Map());
    byTask.get(pairKey).set(run.armId, run);
  }
  const completePairs = [...byTask.values()].filter(pair => arms.every(arm => pair.has(arm.id))).length;
  const controlId = arms.some(arm => arm.id === 'arm-a-vanilla') ? 'arm-a-vanilla' : arms[0].id;
  const pairedDeltas = {};
  for (const arm of arms) {
    if (arm.id === controlId) continue;
    const deltas = [...byTask.values()]
      .filter(pair => pair.has(controlId) && pair.has(arm.id))
      .map(pair => Number(pair.get(arm.id).success) - Number(pair.get(controlId).success));
    pairedDeltas[arm.id] = {
      against: controlId,
      pairedTasks: deltas.length,
      successDeltaPercentagePoints: deltas.length
        ? Number(((deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length) * 100).toFixed(1))
        : null,
    };
  }

  return {
    schemaVersion: '2.3.0',
    protocol: 'contextos-v2-runtime-oracle',
    mode,
    timestamp: new Date().toISOString(),
    provider,
    model,
    methodology: {
      taskCount: tasks.length,
      repetitionsPerTask: repeats,
      arms: arms.map(arm => arm.id),
      primaryOutcome: 'harness_verified_success; generated code passes the local compile gate and registered behavioral/security checks.',
      oracle: 'Generated code is compiled and checked by the repository runtime suites after generation; this is harness verification, not independent human review.',
      contextTreatment: 'Arm C uses the canonical ContextOS resolver and exact installed skill documents against a fixed empty-workspace fixture. Arm D adds prompt-only workflow/risk guidance; neither arm runs a separate coding agent or reviewer.',
      hiddenOracleTests: 'Runtime assertions are not included in the model prompt.',
      runtimeIsolation: 'Generated code runs in a permission-limited Node child process with a minimal environment; this is defense in depth, not a hardened OS sandbox.',
      chatTokenUsage: 'Chat UI token usage is unavailable unless manually supplied with the imported response.',
      successRateDenominator: 'Quality success rates use completed evaluator runs; API and evaluator failures are reported separately and excluded from that denominator.',
      generationSettings,
    },
    summary: {
      requestedRuns: runs.length,
      completedRuns: completed.length,
      failedRuns: runs.length - completed.length,
      apiErrors: runs.filter(run => run.status === 'api_error').length,
      evaluatorErrors: runs.filter(run => run.status === 'evaluator_error').length,
      completePairs,
      controlArm: controlId,
      pairedDeltas,
      arms: armStats,
    },
    promptPack: promptPack ? {
      schemaVersion: promptPack.schemaVersion,
      runId: promptPack.runId,
      generatedAt: promptPack.generatedAt,
      provenance: promptPack.provenance,
    } : null,
    runs,
  };
}

module.exports = {
  runApiBenchmark,
  evaluateChatResponses,
  evaluateResponse,
  buildReport,
  requestedArmOrder,
};
