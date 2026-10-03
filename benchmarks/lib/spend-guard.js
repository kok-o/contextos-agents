'use strict';

// Standard text rates verified 2026-09-30. No paid tools or regional endpoints.
const PRICING = Object.freeze({
  model: 'gpt-4.1-mini-2025-04-14', input: 0.40, cachedInput: 0.10, output: 1.60,
  source: 'https://developers.openai.com/api/docs/models/gpt-4.1-mini',
});

function reserveMicroUsd({ prompt, systemInstruction, maxTokens }) {
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1) throw new Error('Output limit must be a positive integer');
  // Text-only byte-level tokenizer: bytes upper-bound text tokens. Reserve ample
  // protocol overhead and 25% price headroom. Cache discounts are not assumed.
  const inputUpperBound = Buffer.byteLength(prompt || '', 'utf8') + Buffer.byteLength(systemInstruction || '', 'utf8') + 8192;
  return Math.ceil((inputUpperBound * PRICING.input + maxTokens * PRICING.output) * 1.25);
}

class SpendGuard {
  constructor({ maxUsd = 10, reservedMicroUsd = 0, persist = () => {} } = {}) {
    if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > 10) throw new Error('Benchmark budget must be greater than zero and at most $10');
    if (!Number.isSafeInteger(reservedMicroUsd) || reservedMicroUsd < 0) throw new Error('Invalid spending ledger');
    this.limitMicroUsd = Math.floor(maxUsd * 1e6);
    this.reservedMicroUsd = reservedMicroUsd;
    this.persist = persist;
  }
  preflight(requests) {
    const reserve = requests.reduce((sum, request) => sum + reserveMicroUsd(request), 0);
    if (this.reservedMicroUsd + reserve > this.limitMicroUsd) throw new Error('SPEND_LIMIT: plan exceeds remaining benchmark budget');
    return reserve;
  }
  reserve(request) {
    const amount = this.preflight([request]);
    this.reservedMicroUsd += amount;
    // Persist before the HTTP request; failures/timeouts retain their reservation.
    this.persist({ limitMicroUsd: this.limitMicroUsd, reservedMicroUsd: this.reservedMicroUsd, pricing: PRICING });
    return amount;
  }
  async generate(client, request) {
    if (client.model !== PRICING.model || client.provider !== 'openai' || client.maxRetries !== 1) throw new Error('Guard requires the pinned OpenAI model and exactly one HTTP attempt');
    this.reserve(request);
    const result = await client.generate(request);
    const usage = result.usage;
    if (!Number.isSafeInteger(usage?.promptTokens) || !Number.isSafeInteger(usage?.completionTokens)) throw new Error('Missing provider usage; reservation retained');
    const cached = Math.min(usage.promptTokens, usage.cachedPromptTokens || 0);
    result.estimatedCostUsd = ((usage.promptTokens - cached) * PRICING.input + cached * PRICING.cachedInput + usage.completionTokens * PRICING.output) / 1e6;
    return result;
  }
}

module.exports = { PRICING, SpendGuard, reserveMicroUsd };
