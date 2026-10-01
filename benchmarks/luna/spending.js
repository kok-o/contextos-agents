'use strict';
const fs = require('node:fs');
const path = require('node:path');

const PRICING = Object.freeze({ model: 'gpt-6-luna', input: 0.10, cachedInput: 0.01, cacheWriteInput: 0.125, output: 0.50,
  verified: '2026-09-30', source: 'https://developers.openai.com/api/docs/models/gpt-6-luna' });
const MAX_BODY_BYTES = 190000;

function reservation(body) {
  if (body.model !== PRICING.model || body.service_tier !== 'default' || body.store !== false || !Number.isSafeInteger(body.max_output_tokens) || body.max_output_tokens < 1 || body.max_output_tokens > 8192) throw new Error('Unsupported request pricing or output limit');
  const bytes = Buffer.byteLength(JSON.stringify(body));
  if (bytes > MAX_BODY_BYTES) throw new Error('Request context exceeds the short-context byte bound');
  // Byte upper bound, protocol headroom, worst short-context cache-write rate,
  // and 25% pricing headroom. No cache discount is assumed before sending.
  return Math.ceil(((bytes + 8192) * PRICING.cacheWriteInput + body.max_output_tokens * PRICING.output) * 1.25);
}

function atomicJson(file, value) {
  const temporary = `${file}.tmp`; fs.writeFileSync(temporary, JSON.stringify(value, null, 2)); fs.renameSync(temporary, file);
}

// Call only while holding the same run.lock used by the legacy runner. Both
// runners preserve reservedMicroUsd, so their cumulative cap stays shared.
class Budget {
  constructor(ledgerPath, { limitUsd = 10 } = {}) {
    if (!(limitUsd > 0 && limitUsd <= 10)) throw new Error('Budget must be at most the authorized $10');
    this.file = ledgerPath;
    this.ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : { reservedMicroUsd: 0 };
    if (!Number.isSafeInteger(this.ledger.reservedMicroUsd) || this.ledger.reservedMicroUsd < 0) throw new Error('Invalid shared spending ledger');
    this.limit = Math.min(Math.floor(limitUsd * 1e6), this.ledger.limitMicroUsd ?? 10000000);
  }
  get remainingUsd() { return (this.limit - this.ledger.reservedMicroUsd) / 1e6; }
  reserve(body) {
    const amount = reservation(body);
    if (this.ledger.reservedMicroUsd + amount > this.limit) throw new Error('SPEND_LIMIT: remaining shared budget is insufficient');
    this.ledger.reservedMicroUsd += amount;
    this.ledger.limitMicroUsd = this.limit;
    this.ledger.lastLunaPricing = PRICING;
    atomicJson(this.file, this.ledger); // Before HTTP, including uncertain failures.
    return { amount, outputLimit: body.max_output_tokens, inputLimit: Buffer.byteLength(JSON.stringify(body)) + 8192, settled: false };
  }
  settle(ticket, response) {
    if (ticket.settled) throw new Error('Reservation was already settled');
    const usage = response.usage;
    const input = usage?.input_tokens, output = usage?.output_tokens;
    const cached = usage?.input_tokens_details?.cached_tokens ?? 0;
    if (response.status !== 'completed' || ![input, output, cached].every(value => Number.isSafeInteger(value) && value >= 0) || input > ticket.inputLimit || output > ticket.outputLimit || cached > input) return null;
    const knownWrite = usage.input_tokens_details?.cache_creation_tokens;
    if (knownWrite !== undefined && (!Number.isSafeInteger(knownWrite) || knownWrite < 0 || knownWrite > input - cached)) return null;
    // Keep the upper cache-write rate on all uncached input when the provider
    // does not identify cache writes. This is a bound, not the invoice cost.
    const conservative = Math.ceil(((input - cached) * PRICING.cacheWriteInput + cached * PRICING.cachedInput + output * PRICING.output) * 1.25);
    if (conservative > ticket.amount) return null;
    ticket.settled = true;
    this.ledger.reservedMicroUsd -= ticket.amount - conservative;
    atomicJson(this.file, this.ledger);
    return { retainedMicroUsd: conservative,
      standardRateEstimateUsd: ((input - cached) * PRICING.input + cached * PRICING.cachedInput + output * PRICING.output + (knownWrite ?? 0) * (PRICING.cacheWriteInput - PRICING.input)) / 1e6,
      invoiceCostKnown: knownWrite !== undefined, cacheWriteAssumption: knownWrite === undefined ? 'unknown; upper rate retained' : 'provider-reported' };
  }
}

module.exports = { PRICING, MAX_BODY_BYTES, reservation, atomicJson, Budget };
