'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SpendGuard, PRICING, reserveMicroUsd } = require('../benchmarks/lib/spend-guard');

test('spending guard rejects an oversized plan before any network call', async () => {
  let calls = 0;
  const client = { model: PRICING.model, provider: 'openai', maxRetries: 1, generate: async () => { calls++; } };
  await assert.rejects(new SpendGuard({ maxUsd: 0.001 }).generate(client, { prompt: 'task', maxTokens: 4000 }), /SPEND_LIMIT/);
  assert.equal(calls, 0);
});
test('spending guard persists reservations before requests and retains uncertain costs', async () => {
  let ledger;
  const guard = new SpendGuard({ persist: value => { ledger = value; } });
  const client = { model: PRICING.model, provider: 'openai', maxRetries: 1, generate: async () => { assert.ok(ledger.reservedMicroUsd > 0); throw new Error('timeout'); } };
  const request = { prompt: 'task', maxTokens: 2000 };
  await assert.rejects(guard.generate(client, request), /timeout/);
  assert.equal(guard.reservedMicroUsd, reserveMicroUsd(request));
});
test('spending guard accounts for cached input without double billing reasoning tokens', async () => {
  const client = { model: PRICING.model, provider: 'openai', maxRetries: 1, generate: async () => ({ usage: { promptTokens: 1000, cachedPromptTokens: 500, completionTokens: 200, reasoningTokens: 100 } }) };
  const result = await new SpendGuard().generate(client, { prompt: 'task', maxTokens: 2000 });
  assert.equal(result.estimatedCostUsd, 0.00057);
  await assert.rejects(new SpendGuard().generate({ ...client, maxRetries: 3 }, { prompt: 'task', maxTokens: 2000 }), /exactly one HTTP attempt/);
});
