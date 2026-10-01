'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { CASES } = require('../benchmarks/luna/cases');
const { createFixture, runTool, evaluate, validateControls } = require('../benchmarks/luna/fixture');
const { Budget, reservation } = require('../benchmarks/luna/spending');
const { bodyFor, runAttempt, request } = require('../benchmarks/luna/client');
const { parseOptions, summarize } = require('../benchmarks/run-luna-agent');
const { prepare, completedResponse } = require('../benchmarks/run-luna-native');
const { Pacer } = require('../benchmarks/luna/pacing');

function temp(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-luna-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root;
}
function completed(output, usage = { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 10 } }) {
  return { status: 'completed', model: 'gpt-6-luna', output, usage };
}

test('all twenty seeded repository faults fail while their original versions pass', async t => {
  const controls = await validateControls(temp(t), CASES);
  assert.equal(controls.length, 20);
  for (const result of controls) assert.equal(result.valid, true, JSON.stringify(result));
});

test('model tools cannot access hidden oracles, other files, dependencies for writes, or ambiguous edits', t => {
  const task = CASES.find(item => item.group === 'paths');
  const fixture = createFixture(temp(t), task);
  for (const target of ['../oracles.js', '../../.codex/config.toml', 'benchmarks/luna/oracles.js', fixture.root]) assert.throws(() => runTool(fixture, 'read_file', { path: target }), /allowlist/);
  assert.throws(() => runTool(fixture, 'edit_file', { path: task.dependencies[0], old_text: 'fs', new_text: 'bad' }), /allowlist/);
  assert.throws(() => runTool(fixture, 'edit_file', { path: task.file, old_text: 'const', new_text: 'let' }), /exactly once/);
  assert.throws(() => runTool(fixture, 'edit_file', { path: task.file, old_text: '', new_text: 'bad' }), /nonempty/);
});

test('permission-limited worker rejects network modules, host filesystem reads and constructor escape', async t => {
  const task = CASES[0]; const parent = temp(t);
  for (const source of ["require('https');", "require('fs').readFileSync('C:/Users/esenb/.codex/config.toml');", "require.constructor('return process')();"]) {
    const fixture = createFixture(parent, task);
    fs.writeFileSync(path.join(fixture.root, task.file), source);
    const result = await evaluate(fixture, task);
    assert.equal(result.passed, false);
    assert.match(result.error, /not allowed|restricted|Code generation/);
  }
});

test('Luna reservations share the legacy cap, persist before HTTP, and retain uncertain requests', t => {
  const root = temp(t), ledger = path.join(root, 'ledger.json');
  fs.writeFileSync(ledger, JSON.stringify({ limitMicroUsd: 10000000, reservedMicroUsd: 2836962 }));
  const budget = new Budget(ledger);
  const body = bodyFor('instructions', [{ role: 'user', content: 'task' }]);
  const ticket = budget.reserve(body);
  assert.equal(JSON.parse(fs.readFileSync(ledger)).reservedMicroUsd, 2836962 + reservation(body));
  assert.equal(budget.settle(ticket, { status: 'incomplete', usage: { input_tokens: 10, output_tokens: 10 } }), null);
  assert.equal(new Budget(ledger).ledger.reservedMicroUsd, budget.ledger.reservedMicroUsd);
  const tight = new Budget(path.join(root, 'tight.json'), { limitUsd: 0.000001 });
  assert.throws(() => tight.reserve(body), /SPEND_LIMIT/);
  assert.equal(fs.existsSync(tight.file), false);
});

test('settlement uses verified completed usage, discounts cache, avoids double billing reasoning and rejects replay', t => {
  const budget = new Budget(path.join(temp(t), 'ledger.json'));
  const ticket = budget.reserve(bodyFor('instructions', []));
  const response = completed([], { input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 500 }, output_tokens_details: { reasoning_tokens: 100 } });
  const result = budget.settle(ticket, response);
  assert.equal(result.standardRateEstimateUsd, 0.000155);
  assert.equal(result.retainedMicroUsd, 210);
  assert.equal(result.invoiceCostKnown, false);
  assert.throws(() => budget.settle(ticket, response), /already settled/);
  const invalidTicket = budget.reserve(bodyFor('instructions', []));
  assert.equal(budget.settle(invalidTicket, completed([], { input_tokens: 9999999, output_tokens: 1 })), null);
});

test('real tool loop repairs a fixture, preserves reasoning items, and passes the hidden consumer contracts', async t => {
  const root = temp(t), task = CASES[0], fixture = createFixture(root, task);
  const budget = new Budget(path.join(root, 'ledger.json'));
  const saves = [], bodies = []; let step = 0;
  const fake = async body => {
    bodies.push(JSON.parse(JSON.stringify(body)));
    step++;
    const call = (name, args) => completed([{ type: 'reasoning', id: `reason-${step}`, encrypted_content: 'test-encrypted-state', summary: [] },
      { type: 'function_call', call_id: `call-${step}`, name, arguments: JSON.stringify(args) }]);
    if (step === 1) return call('read_file', { path: task.file });
    if (step === 2) return call('edit_file', { path: task.file, old_text: task.mutation.to, new_text: task.mutation.from });
    if (step === 3) return call('check_syntax', { path: task.file });
    return completed([{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Repaired.' }] }]);
  };
  const result = await runAttempt({ fixture, task, instructions: 'neutral', budget, key: 'not-a-secret', requestImpl: fake,
    save: (stepNumber, value) => saves.push(JSON.parse(JSON.stringify({ stepNumber, ...value }))) });
  assert.equal(result.finished, true); assert.equal(result.requestCount, 4); assert.equal(result.toolCalls, 3);
  assert.equal((await evaluate(fixture, task)).passed, true);
  assert.ok(bodies[1].input.some(item => item.type === 'reasoning' && item.encrypted_content));
  assert.ok(bodies[1].input.some(item => item.type === 'function_call_output'));
  assert.equal(saves.length, 4);
});

test('API failures stop after one request, persist the reservation, and redact credentials', async t => {
  const root = temp(t), task = CASES[0], budget = new Budget(path.join(root, 'ledger.json')); let calls = 0;
  const result = await runAttempt({ fixture: createFixture(root, task), task, instructions: 'neutral', budget, key: 'unused', save() {},
    requestImpl: async () => { calls++; throw new Error('HTTP 429 sk-example_credential'); } });
  assert.equal(calls, 1); assert.equal(result.finished, false); assert.match(result.apiError, /REDACTED/);
  assert.ok(budget.ledger.reservedMicroUsd > 0);
  assert.equal(result.standardRateEstimateUsd, null); assert.equal(result.usage.unavailableRequests, 1);
});

test('output limit is a model failure and keeps unknown cost rather than becoming an API error', async t => {
  const root = temp(t), task = CASES[0], budget = new Budget(path.join(root, 'ledger.json'));
  const result = await runAttempt({ fixture: createFixture(root, task), task, instructions: 'neutral', budget, key: 'unused', save() {},
    requestImpl: async () => ({ ...completed([]), status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }) });
  assert.equal(result.apiError, null); assert.equal(result.stoppedAtOutputLimit, true);
  assert.equal(result.finished, false); assert.equal(result.standardRateEstimateUsd, null);
  assert.ok(budget.ledger.reservedMicroUsd > 0);
});

test('HTTP transport pins the official endpoint and disallows redirects', async () => {
  let captured;
  await request(bodyFor('neutral', []), 'unused', { fetchImpl: async (url, options) => {
    captured = { url, options }; return { ok: true, text: async () => JSON.stringify(completed([])) };
  } });
  assert.equal(captured.url, 'https://api.openai.com/v1/responses'); assert.equal(captured.options.redirect, 'error');
});

test('summary compares only complete balanced triples and records infrastructure failures separately', () => {
  const arms = ['a', 'b', 'c'];
  const base = { repetition: 1, apiError: null, acceptance: { passed: true }, finished: true, elapsedMs: 1, toolCalls: 3, standardRateEstimateUsd: 0.01 };
  const results = arms.map(armId => ({ ...base, taskId: 'complete', armId }));
  results.push({ ...base, taskId: 'incomplete', armId: 'a', apiError: '429' });
  const summary = summarize(results, { arms, attempts: 6 });
  assert.equal(summary.balancedTriples, 1); assert.equal(summary.arms[0].balancedAttempts, 1); assert.equal(summary.arms[0].apiErrors, 1);
  const withLimit = [...results.slice(0, 3)];
  withLimit[0] = { ...withLimit[0], finished: false, stoppedAtStepLimit: true };
  const capped = summarize(withLimit, { arms, attempts: 3 });
  assert.equal(capped.balancedTriples, 1); assert.equal(capped.arms[0].balancedSolved, 0);
  assert.throws(() => parseOptions(['--resume', '../elsewhere']), /Invalid/);
  assert.throws(() => parseOptions(['--controls-only', '--run']), /cannot/);
});

test('native fixture keeps a random marker only in the skill body and SSE billing requires completion', t => {
  const fixture = prepare(temp(t));
  const probe = fs.readFileSync(path.join(fixture.project, '.agents/skills/contextos-native-probe/SKILL.md'), 'utf8');
  assert.ok(probe.includes(fixture.marker));
  assert.equal(fs.readFileSync(path.join(fixture.project, 'AGENTS.md'), 'utf8').includes(fixture.marker), false);
  assert.ok(fs.existsSync(path.join(fixture.project, '.agents/skills/engineering-workflow/SKILL.md')));
  assert.equal(completedResponse('event: response.incomplete\ndata: {"type":"response.incomplete"}\n', true), null);
  const response = completed([]);
  assert.deepEqual(completedResponse(`data: ${JSON.stringify({ type: 'response.completed', response })}\n`, true), response);
});

test('TPM pacing waits without network calls or reservations and uses bounded sleep intervals', async () => {
  let now = 0; const delays = [];
  const pacer = new Pacer({ now: () => now, sleep: async delay => { delays.push(delay); now += delay; } });
  const body = bodyFor('neutral', []);
  await pacer.wait(body); const first = now; await pacer.wait(body);
  assert.ok(first > 0); assert.ok(now > first); assert.ok(delays.every(delay => delay <= 30000));
  await pacer.wait(bodyFor('x'.repeat(100000), []));
  await assert.rejects(new Pacer({ tokensPerMinute: 1000 }).wait(body), /too large/);
});
