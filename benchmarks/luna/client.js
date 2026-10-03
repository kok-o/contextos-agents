'use strict';
const { runTool } = require('./fixture');
const { PRICING } = require('./spending');
const { normalizeOpenAIUsage, normalizeUsage, sumUsage } = require('../lib/usage');

const TOOLS = [
  { type: 'function', name: 'read_file', description: 'Read an allowlisted repository source file.', strict: true,
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } },
  { type: 'function', name: 'edit_file', description: 'Replace exactly one occurrence of old_text in the editable file. Use precise excerpts; preserve unrelated code.', strict: true,
    parameters: { type: 'object', properties: { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['path', 'old_text', 'new_text'], additionalProperties: false } },
  { type: 'function', name: 'check_syntax', description: 'Compile the JavaScript source without executing it. Private behavioral tests are run after your attempt.', strict: true,
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } },
];

function bodyFor(instructions, input, { model = PRICING.model, reasoningEffort = 'medium' } = {}) {
  return { model, instructions, input, tools: TOOLS, parallel_tool_calls: false,
    reasoning: { effort: reasoningEffort }, max_output_tokens: 4096, service_tier: 'default', store: false };
}

function initialInput(fixture, task) {
  return [{ role: 'user', content: [
    task.title, task.description, `Acceptance contract: ${task.contract}`,
    `Readable files: ${fixture.files.join(', ')}. Editable file: ${fixture.editable}.`,
    'Use read_file before editing. Repair the source through edit_file, check JavaScript syntax, and finish with a brief explanation.',
    'No shell, network, additional files, external skills, or private tests are available. Do not call tools to delegate work.',
  ].join('\n') }];
}

function redact(value) { return String(value).replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[REDACTED]'); }

async function request(body, key, { fetchImpl = fetch, timeoutMs = 120000 } = {}) {
  // No provider override, redirects, retry loop, SDK telemetry, or inherited URL.
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`OpenAI HTTP ${response.status}: ${redact(text).slice(0, 2000)}`);
    error.httpStatus = response.status; throw error;
  }
  const result = JSON.parse(text);
  if (result.model && result.model !== body.model) throw new Error('Provider returned an unexpected model');
  return result;
}

async function runAttempt({ fixture, task, instructions, budget, key, save, maxSteps = 6, continuationInput, requestImpl = request, onStep = () => {}, pacer, profile }) {
  const input = continuationInput ? structuredClone(continuationInput) : initialInput(fixture, task);
  const usage = [], trace = [], charges = [];
  let finished = false, apiError = null, requestCount = 0, stoppedAtOutputLimit = false;
  const started = Date.now();
  for (let step = 1; maxSteps === null || step <= maxSteps; step++) {
    const body = bodyFor(instructions, input, profile);
    let ticket;
    let usageRecorded = false;
    try {
      if (pacer) await pacer.wait(body);
      ticket = budget.reserve(body);
      requestCount++;
      onStep(step);
      const response = await requestImpl(body, key);
      const charge = budget.settle(ticket, response);
      charges.push(charge);
      usage.push(normalizeOpenAIUsage(response.usage));
      usageRecorded = true;
      // Preserve full reasoning items and function calls for Responses continuity.
      save(step, { body, response, reservationMicroUsd: ticket.amount, charge });
      if (response.status !== 'completed') {
        if (response.status === 'incomplete' && response.incomplete_details?.reason === 'max_output_tokens') stoppedAtOutputLimit = true;
        else apiError = `Response status: ${response.status}`;
        break;
      }
      if (!Array.isArray(response.output)) throw new Error('Missing Responses output array');
      input.push(...response.output);
      const calls = response.output.filter(item => item.type === 'function_call');
      if (!calls.length) { finished = true; break; }
      for (const call of calls) {
        let output;
        try { output = runTool(fixture, call.name, JSON.parse(call.arguments)); }
        catch (error) { output = `Tool error: ${redact(error.message)}`; }
        trace.push({ step, name: call.name, arguments: call.arguments, output });
        input.push({ type: 'function_call_output', call_id: call.call_id, output });
      }
    } catch (error) {
      apiError = redact(error.message);
      if (ticket && !usageRecorded) usage.push(normalizeUsage({}, 'unavailable'));
      save(step, { body, error: apiError, httpStatus: error.httpStatus ?? null, reservationMicroUsd: ticket?.amount ?? 0 });
      break;
    }
  }
  return { finished, apiError, requestCount, toolCalls: trace.length, trace, usage: sumUsage(usage), charges,
    standardRateEstimateUsd: charges.length === requestCount && charges.every(Boolean) ? charges.reduce((sum, item) => sum + item.standardRateEstimateUsd, 0) : null,
    elapsedMs: Date.now() - started, stoppedAtOutputLimit, stoppedAtStepLimit: !finished && !apiError && !stoppedAtOutputLimit };
}

module.exports = { TOOLS, bodyFor, initialInput, request, runAttempt, redact };
