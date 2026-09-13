'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { normalizeOpenAIUsage } = require('../benchmarks/lib/usage');
const { normalizeGeminiUsage, normalizeAnthropicUsage, sumUsage } = require('../benchmarks/lib/usage');
const { LLMClient } = require('../benchmarks/lib/llm-client');
const { BenchmarkEvaluator } = require('../benchmarks/v2/evaluators/verified-success');
const { ARMS } = require('../benchmarks/v2/arms/arm-definitions');
const { buildSystemInstruction, buildTaskPrompt, buildPromptContext, resolveSkills } = require('../benchmarks/v2/harness/prompts');
const { runApiBenchmark, evaluateChatResponses } = require('../benchmarks/v2/harness/api-runner');
const { writeChatPack, loadChatResponses } = require('../benchmarks/v2/run');

test('provider usage is normalized without inventing missing token counts', () => {
  assert.deepEqual(normalizeOpenAIUsage({
    prompt_tokens: 120,
    completion_tokens: 45,
    total_tokens: 165,
    completion_tokens_details: { reasoning_tokens: 12 },
    prompt_tokens_details: { cached_tokens: 20 },
  }), {
    promptTokens: 120,
    completionTokens: 45,
    totalTokens: 165,
    reasoningTokens: 12,
    cachedPromptTokens: 20,
    source: 'provider',
  });

  assert.deepEqual(normalizeOpenAIUsage(null), {
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    reasoningTokens: null,
    cachedPromptTokens: null,
    source: 'unavailable',
  });
  const detailedSummary = sumUsage([normalizeOpenAIUsage({
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
    completion_tokens_details: { reasoning_tokens: 2 },
    prompt_tokens_details: { cached_tokens: 4 },
  })]);
  assert.equal(detailedSummary.reasoningTokens, 2);
  assert.equal(detailedSummary.cachedPromptTokens, 4);
  assert.deepEqual(normalizeOpenAIUsage({ prompt_tokens: null, completion_tokens: null, total_tokens: null }), {
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    reasoningTokens: null,
    cachedPromptTokens: null,
    source: 'unavailable',
  });
});

test('usage aggregation marks incomplete totals instead of treating missing reports as zero', () => {
  const one = normalizeOpenAIUsage({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
  const missing = normalizeOpenAIUsage(null);
  const summary = sumUsage([one, missing]);
  assert.equal(summary.requestCount, 2);
  assert.equal(summary.unavailableRequests, 1);
  assert.equal(summary.totalTokens, null);
  assert.equal(summary.knownTotalTokens, 15);
  assert.equal(summary.complete, false);

  const retried = sumUsage([{
    ...one,
    attemptCount: 3,
    unreportedAttempts: 2,
  }]);
  assert.equal(retried.requestCount, 3);
  assert.equal(retried.providerRequests, 1);
  assert.equal(retried.unavailableRequests, 2);
  assert.equal(retried.unreportedRetryRequests, 2);
  assert.equal(retried.totalTokens, null);
  assert.equal(retried.knownTotalTokens, 15);
  const chatUnavailable = require('../benchmarks/lib/usage').normalizeUsage({
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
  }, 'unavailable');
  assert.equal(chatUnavailable.totalTokens, null);
  assert.equal(chatUnavailable.source, 'unavailable');

  const firstBatch = sumUsage([one]);
  const secondBatch = sumUsage([normalizeOpenAIUsage({ prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 })]);
  const combined = sumUsage([firstBatch, secondBatch]);
  assert.equal(combined.requestCount, 2);
  assert.equal(combined.totalTokens, 20);
  assert.equal(combined.providerRequests, 2);
  const combinedWithUnavailable = sumUsage([firstBatch, sumUsage([missing])]);
  assert.equal(combinedWithUnavailable.requestCount, 2);
  assert.equal(combinedWithUnavailable.unavailableRequests, 1);
  assert.equal(combinedWithUnavailable.knownTotalTokens, 15);
  assert.equal(combinedWithUnavailable.totalTokens, null);
});

test('Gemini and Anthropic provider usage fields retain input, output, cache, and reasoning counts', () => {
  assert.deepEqual(normalizeGeminiUsage({
    promptTokenCount: 20,
    candidatesTokenCount: 8,
    totalTokenCount: 31,
    thoughtsTokenCount: 3,
    cachedContentTokenCount: 5,
  }), {
    promptTokens: 20,
    completionTokens: 8,
    totalTokens: 31,
    reasoningTokens: 3,
    cachedPromptTokens: 5,
    source: 'provider',
  });
  assert.deepEqual(normalizeAnthropicUsage({
    input_tokens: 20,
    cache_creation_input_tokens: 4,
    cache_read_input_tokens: 3,
    output_tokens: 8,
  }), {
    promptTokens: 27,
    completionTokens: 8,
    totalTokens: 35,
    reasoningTokens: null,
    cachedPromptTokens: 7,
    source: 'provider',
  });
});

test('OpenAI-compatible streaming requests and captures provider token usage', async () => {
  let receivedPayload;
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      receivedPayload = JSON.parse(body);
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end([
        'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":3,"total_tokens":10}}\n\n',
        'data: [DONE]\n\n',
      ].join(''));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const client = new LLMClient({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'unit-test-key',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      maxRetries: 1,
    });
    const result = await client.generate({ prompt: 'task', systemInstruction: 'system' });
    assert.equal(receivedPayload.stream, true);
    assert.equal(receivedPayload.stream_options.include_usage, true);
    assert.equal(result.text, 'answer');
    assert.equal(result.usage.promptTokens, 7);
    assert.equal(result.usage.completionTokens, 3);
    assert.equal(result.usage.totalTokens, 10);
    assert.equal(result.usage.attemptCount, 1);
    assert.equal(result.usage.unreportedAttempts, 0);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('verified success fails closed when compilation or runtime oracle results are missing', () => {
  const noOracle = BenchmarkEvaluator.evaluate({
    patchApplied: true,
    compilationPassed: true,
    generatedCode: 'module.exports.ok = true;',
  });
  assert.equal(noOracle.harness_verified_success, false);
  assert.ok(noOracle.failures.some(message => /runtime oracle results are missing/i.test(message)));

  const noUsage = BenchmarkEvaluator.evaluate({
    patchApplied: true,
    compilationPassed: true,
    oracleTestsTotal: 1,
    oracleTestsPassed: 1,
    generatedCode: 'module.exports.ok = true;',
    budget: { requireTokenUsage: true, requireTimeUsage: true, tokenLimit: 100, timeoutMs: 10_000 },
  });
  assert.equal(noUsage.harness_verified_success, false);
  assert.ok(noUsage.failures.some(message => /token usage unavailable/i.test(message)));
  assert.ok(noUsage.failures.some(message => /generation time unavailable/i.test(message)));
});

test('ContextOS prompts use canonical resolution and exact compiled installed skill documents', () => {
  const task = {
    id: 'sample',
    title: 'Implement secure authentication and login',
    category: 'Security & Backend',
    description: 'Hash passwords, issue JWTs, validate input, and rate-limit repeated login failures.',
    skills: ['security', 'skill-not-installed'],
    contract: 'export class AuthService { generateToken(): Promise<string>; }',
  };
  const vanilla = buildSystemInstruction(ARMS.ARM_A_VANILLA, task);
  const coreContext = buildPromptContext(ARMS.ARM_C_CONTEXTOS_CORE, task);
  const core = coreContext.systemInstruction;
  const expandedContext = buildPromptContext(ARMS.ARM_D_EXPANDED_GUIDANCE, task);
  const coreInstructions = fs.readFileSync(path.join(__dirname, '../.agents/AGENTS.md'), 'utf8');
  const securityDocument = fs.readFileSync(path.join(__dirname, '../.agents/core/skills/security/SKILL.md'), 'utf8');

  assert.ok(!vanilla.includes(securityDocument));
  assert.ok(core.includes(`[Installed ContextOS Skill: security | sha256:${coreContext.contextMetadata.skillDocuments.find(doc => doc.id === 'security').sha256}]`));
  assert.ok(core.includes(securityDocument), 'the prompt must contain the exact installed SKILL.md bytes');
  assert.ok(core.includes(coreInstructions), 'the prompt must include the exact core AGENTS.md instructions');
  assert.equal(coreContext.contextMetadata.coreInstruction.path, '.agents/AGENTS.md');
  assert.equal(coreContext.contextMetadata.coreInstruction.sha256, require('crypto').createHash('sha256').update(coreInstructions).digest('hex'));
  assert.ok(coreContext.contextMetadata.source === 'contextos-canonical-resolver');
  assert.ok(coreContext.contextMetadata.manifestFingerprint.startsWith('sha256:'));
  assert.ok(coreContext.contextMetadata.resolverFingerprint.startsWith('sha256:'));
  assert.ok(coreContext.contextMetadata.includedSkillIds.includes('security'));
  assert.ok(!coreContext.contextMetadata.includedSkillIds.includes('skill-not-installed'));
  assert.ok(coreContext.contextMetadata.unresolvedTaskSkillAnnotations.includes('skill-not-installed'));
  assert.ok(!core.includes('skill-not-installed'), 'task skill annotations must not leak into or force prompt selection');
  assert.ok(coreContext.contextMetadata.resolverDeclaration.includes('Skills loaded:'));
  assert.ok(coreContext.contextMetadata.missingSkillIds.every(id => !coreContext.contextMetadata.includedSkillIds.includes(id)));
  assert.ok(!vanilla.includes('ContextOS'));
  assert.ok(expandedContext.systemInstruction.includes(securityDocument));
  assert.ok(expandedContext.contextMetadata.manifestFingerprint === coreContext.contextMetadata.manifestFingerprint);
  assert.ok(expandedContext.systemInstruction.includes('prompt-only'));
  assert.ok(expandedContext.systemInstruction.includes('does not run a worktree or independent reviewer'));
  assert.ok(!expandedContext.systemInstruction.includes('isolated worktree and mandatory verification attestations'));

  const resolved = resolveSkills(task, ARMS.ARM_C_CONTEXTOS_CORE);
  assert.deepEqual(resolved.selected, coreContext.contextMetadata.includedSkillIds);
  assert.deepEqual(resolved.missing, coreContext.contextMetadata.missingSkillIds);
  assert.equal(buildTaskPrompt(task), buildTaskPrompt({ ...task, skills: ['different'] }));
});

test('API and chat evaluators use the same deterministic runtime oracle and report usage provenance', async () => {
  const task = {
    id: 'smoke',
    title: 'Arithmetic export',
    category: 'Test',
    skills: [],
    prompt: 'Export an add(a, b) function.',
    contract: 'module.exports.add = (a, b) => a + b;',
    runtimeSuite: {
      id: 'smoke',
      tests: [{
        id: 'add-works',
        name: 'addition works',
        run: async exports => assert.equal(exports.add(2, 3), 5),
      }],
    },
  };
  const client = {
    provider: 'test-provider',
    model: 'test-model',
    generate: async () => ({
      text: '```javascript\nmodule.exports.add = (a, b) => a + b;\n```',
      latencyMs: 4,
      usage: normalizeOpenAIUsage({ prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 }),
    }),
  };
  const api = await runApiBenchmark({
    client,
    tasks: [task],
    arms: [ARMS.ARM_A_VANILLA, ARMS.ARM_B_CONCISE_CHECKLIST],
    repeats: 2,
    maxTokens: 128,
    runtimeOptions: { inProcess: true },
  });
  assert.equal(api.runs.length, 4);
  assert.ok(api.runs.every(run => run.evaluation.harness_verified_success));
  assert.equal(api.summary.completePairs, 2);
  assert.equal(api.methodology.repetitionsPerTask, 2);
  assert.equal(api.methodology.generationSettings.maxOutputTokens, 128);
  assert.equal(api.methodology.generationSettings.temperature, 0.1);
  assert.equal(api.runs[0].generationSettings.maxOutputTokens, 128);
  const vanillaRun = api.runs.find(run => run.armId === ARMS.ARM_A_VANILLA.id);
  assert.equal(vanillaRun.prompts.userTask, buildTaskPrompt(task));
  assert.equal(vanillaRun.prompts.systemInstruction, buildSystemInstruction(ARMS.ARM_A_VANILLA, task));
  assert.ok(Object.values(api.summary.arms).every(arm => arm.usage.totalTokens === 70));

  const promptProvenance = { runId: 'smoke-chat-pack', promptSha256: 'a'.repeat(64), promptText: 'chat benchmark test prompt', context: { source: 'none' } };
  const chat = await evaluateChatResponses({
    tasks: [task],
    arms: [ARMS.ARM_A_VANILLA],
    responses: { smoke: { [ARMS.ARM_A_VANILLA.id]: { responseText: '```javascript\nmodule.exports.add = (a, b) => a + b;\n```', promptProvenance } } },
    runtimeOptions: { inProcess: true },
  });
  assert.equal(chat.runs[0].evaluation.harness_verified_success, true);
  assert.equal(chat.runs[0].usage.totalTokens, null);
  assert.equal(chat.runs[0].usage.source, 'unavailable');

  const chatWithReportedUsage = await evaluateChatResponses({
    tasks: [task],
    arms: [ARMS.ARM_A_VANILLA],
    responses: { smoke: { [ARMS.ARM_A_VANILLA.id]: {
      responseText: '```javascript\nmodule.exports.add = (a, b) => a + b;\n```',
      promptProvenance,
      usage: { promptTokens: 18, completionTokens: 9, totalTokens: 27, source: 'user_reported' },
    } } },
    runtimeOptions: { inProcess: true },
  });
  assert.equal(chatWithReportedUsage.summary.arms[ARMS.ARM_A_VANILLA.id].usage.userReportedRequests, 1);
  assert.equal(chatWithReportedUsage.summary.arms[ARMS.ARM_A_VANILLA.id].usage.totalTokens, 27);
});

test('chat answer imports verify the exact prompt-pack manifest and answer binding', async () => {
  const task = {
    id: 'chat-provenance',
    title: 'Chat provenance check',
    description: 'Return one module export.',
    contract: 'module.exports.ok = true;',
    runtimeSuite: { id: 'chat-provenance', tests: [{ id: 'ok', run: exports => assert.ok(exports.ok) }] },
  };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contextos-chat-pack-'));
  try {
    const packDirectory = path.join(root, 'pack');
    const responsesDirectory = path.join(root, 'responses');
    writeChatPack({ output: packDirectory, arms: [ARMS.ARM_A_VANILLA], model: 'unit-model', task: task.id }, [task]);
    const manifestPath = path.join(packDirectory, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const promptEntry = manifest.prompts[0];
    const instructions = fs.readFileSync(path.join(packDirectory, 'README.md'), 'utf8');
    assert.ok(instructions.includes(`--manifest "${manifestPath}"`));
    assert.ok(instructions.includes(promptEntry.sha256));
    const responseFile = path.join(responsesDirectory, task.id, `${ARMS.ARM_A_VANILLA.id}.json`);
    fs.mkdirSync(path.dirname(responseFile), { recursive: true });
    const answer = {
      promptPackRunId: manifest.runId,
      promptSha256: promptEntry.sha256,
      model: 'unit-model',
      responseText: ['```javascript', 'module.exports.ok = true;', '```'].join('\n'),
    };
    fs.writeFileSync(responseFile, JSON.stringify(answer));

    const loaded = loadChatResponses({ responses: responsesDirectory, manifest: manifestPath, arms: [ARMS.ARM_A_VANILLA] }, [task]);
    assert.equal(loaded.promptPack.runId, manifest.runId);
    assert.equal(loaded.responses[task.id][ARMS.ARM_A_VANILLA.id].promptProvenance.promptSha256, promptEntry.sha256);
    const report = await evaluateChatResponses({
      tasks: [task],
      arms: [ARMS.ARM_A_VANILLA],
      responses: loaded.responses,
      promptPack: loaded.promptPack,
      runtimeOptions: { inProcess: true },
    });
    assert.equal(report.runs[0].promptPackRunId, manifest.runId);
    assert.equal(report.runs[0].promptHashes.fullPrompt, promptEntry.sha256);
    assert.equal(report.runs[0].prompts.fullPrompt, fs.readFileSync(path.join(packDirectory, promptEntry.file), 'utf8'));
    assert.equal(report.promptPack.runId, manifest.runId);
    assert.equal(report.runs[0].evaluation.harness_verified_success, true);

    fs.writeFileSync(responseFile, JSON.stringify({ ...answer, promptSha256: 'f'.repeat(64) }));
    assert.throws(() => loadChatResponses({ responses: responsesDirectory, manifest: manifestPath, arms: [ARMS.ARM_A_VANILLA] }, [task]), /provenance mismatch/i);

    fs.writeFileSync(responseFile, JSON.stringify(answer));
    fs.appendFileSync(path.join(packDirectory, promptEntry.file), '\nchanged');
    assert.throws(() => loadChatResponses({ responses: responsesDirectory, manifest: manifestPath, arms: [ARMS.ARM_A_VANILLA] }, [task]), /prompt hash mismatch/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('API failures preserve unknown retry attempts instead of reporting zero usage', async () => {
  const task = {
    id: 'smoke-failure',
    title: 'Failure accounting',
    prompt: 'Implement it.',
    contract: 'module.exports.ok = true;',
    runtimeSuite: { id: 'smoke-failure', tests: [{ id: 'ok', run: exports => assert.ok(exports) }] },
  };
  const client = {
    provider: 'test-provider',
    model: 'test-model',
    generate: async () => {
      const error = new Error('temporary provider failure');
      error.attemptCount = 3;
      error.unreportedAttempts = 2;
      throw error;
    },
  };
  const report = await runApiBenchmark({
    client,
    tasks: [task],
    arms: [ARMS.ARM_A_VANILLA],
    runtimeOptions: { inProcess: true },
  });
  const run = report.runs[0];
  assert.equal(run.status, 'api_error');
  assert.equal(report.summary.apiErrors, 1);
  assert.equal(report.summary.evaluatorErrors, 0);
  assert.equal(report.summary.arms[ARMS.ARM_A_VANILLA.id].usage.requestCount, 3);
  assert.equal(report.summary.arms[ARMS.ARM_A_VANILLA.id].usage.unreportedRetryRequests, 2);
  assert.equal(report.summary.arms[ARMS.ARM_A_VANILLA.id].usage.unavailableRequests, 3);
  assert.equal(report.summary.arms[ARMS.ARM_A_VANILLA.id].usage.totalTokens, null);
});
