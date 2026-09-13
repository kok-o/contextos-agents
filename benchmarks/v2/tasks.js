'use strict';

const { RUNTIME_SUITES } = require('../lib/runtime-suites');

const TASK_DETAILS = {
  'auth-security': {
    description: 'Implement a self-contained authentication service. It must hash and verify passwords, use constant-time comparison, issue HMAC-signed JWTs with issuer, audience, and an expiry no longer than 15 minutes, validate login input, rate-limit failures by account and IP, and return generic errors without leaking secrets or stack traces.',
  },
  'ddd-order-invariants': {
    description: 'Implement an Order aggregate and immutable Money value object. Reject negative money and currency mismatches, enforce positive item quantities, allow only valid order state transitions, prevent edits after payment and cancellation after shipping, record domain events, and keep persistence interfaces free of ORM and HTTP dependencies.',
  },
  'resilient-api-client': {
    description: 'Implement a resilient HTTP client with request timeouts and AbortController cancellation, a CLOSED/OPEN/HALF_OPEN circuit breaker with configurable failure threshold and reset delay, and structured errors that do not expose credentials.',
  },
};

const API_BENCHMARK_TASKS = Object.values(RUNTIME_SUITES).map(runtimeSuite => {
  const details = TASK_DETAILS[runtimeSuite.id];
  if (!details) throw new Error(`No API benchmark task description exists for ${runtimeSuite.id}`);
  return {
    id: runtimeSuite.id,
    title: runtimeSuite.title,
    category: runtimeSuite.category,
    skills: runtimeSuite.skills,
    description: details.description,
    contract: runtimeSuite.contract,
    runtimeSuite,
  };
});

module.exports = { API_BENCHMARK_TASKS };
