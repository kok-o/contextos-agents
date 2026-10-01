'use strict';
const assert = require('node:assert/strict');
function sameJson(actual, expected) {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
}
const MAINTENANCE_SUITES = {
  'safe-pagination': {
    id: 'safe-pagination', title: 'Validate pagination input', category: 'Backend', skills: ['security'],
    contract: 'Export parsePagination(query: Record<string, unknown>): {limit: number, offset: number}. Defaults: 20, 0. Accept numbers or decimal digit strings. Limit: 1..100; offset: nonnegative safe integer. Reject arrays, fractions, signed strings, empty strings, and invalid types. Do not mutate query.',
    tests: [
      { id: 'pagination-defaults', name: 'Defaults and supplied values', run: e => { sameJson(e.parsePagination({}), { limit: 20, offset: 0 }); sameJson(e.parsePagination({ limit: '12', offset: 3 }), { limit: 12, offset: 3 }); } },
      { id: 'pagination-input-security', name: 'Malformed input', run: e => { for (const value of [0, -1, 101, 1.5, Infinity, '1.5', '-1', ' ', [], null, true]) assert.throws(() => e.parsePagination({ limit: value })); for (const value of [-1, Number.MAX_SAFE_INTEGER + 1, '1e3', {}, []]) assert.throws(() => e.parsePagination({ offset: value })); } },
      { id: 'pagination-boundaries', name: 'Boundaries without mutation', run: e => { sameJson(e.parsePagination(Object.freeze({ limit: 100, offset: '0' })), { limit: 100, offset: 0 }); } },
    ],
  },
  'stable-dependency-sort': {
    id: 'stable-dependency-sort', title: 'Deterministic dependency ordering', category: 'Architecture', skills: ['context-os'],
    contract: 'Export sortPackages(nodes: Array<{id: string, deps: string[]}>): string[]. Dependencies precede dependents. At each step choose the lexically smallest ready ID using ordinary JS string comparison. Reject duplicate IDs, missing dependencies, and cycles. Keep input immutable; support empty input.',
    tests: [
      { id: 'sort-determinism', name: 'Dependency order and lexical ties', run: e => { const nodes = [{ id: 'z', deps: ['a'] }, { id: 'b', deps: [] }, { id: 'a', deps: [] }]; assert.equal(JSON.stringify(e.sortPackages(nodes)), '["a","b","z"]'); assert.equal(JSON.stringify(e.sortPackages([...nodes].reverse())), '["a","b","z"]'); } },
      { id: 'sort-invalid-graph', name: 'Reject invalid graphs', run: e => { for (const nodes of [[{ id: 'a', deps: ['x'] }], [{ id: 'a', deps: [] }, { id: 'a', deps: [] }], [{ id: 'a', deps: ['b'] }, { id: 'b', deps: ['a'] }]]) assert.throws(() => e.sortPackages(nodes)); } },
      { id: 'sort-immutability', name: 'Preserve input and empty graph', run: e => { const nodes = [{ id: 'b', deps: ['a'] }, { id: 'a', deps: [] }]; const before = JSON.stringify(nodes); e.sortPackages(nodes); assert.equal(JSON.stringify(nodes), before); assert.equal(JSON.stringify(e.sortPackages([])), '[]'); } },
    ],
  },
  'nested-secret-redaction': {
    id: 'nested-secret-redaction', title: 'Redact nested config secrets', category: 'Security', skills: ['security'],
    contract: 'Export redactConfig(input: unknown): unknown. Recursively clone JSON objects and arrays. Replace values of keys containing password, secret, token, apiKey, api_key, or authorization (case-insensitive) with "[REDACTED]". Preserve other data, including own __proto__ keys, without prototype pollution or input mutation. Reject cycles.',
    tests: [
      { id: 'redaction-secret-security', name: 'Nested secret keys', run: e => { const actual = e.redactConfig({ port: 3000, nested: [{ apiKey: 'fixture', count: 3 }, { PASSWORD: 42 }], authorization: null }); sameJson(actual, { port: 3000, nested: [{ apiKey: '[REDACTED]', count: 3 }, { PASSWORD: '[REDACTED]' }], authorization: '[REDACTED]' }); } },
      { id: 'redaction-immutability', name: 'Deep clone without mutation', run: e => { const input = { items: [{ name: 'user', token: 'fixture' }] }; const before = JSON.stringify(input); const actual = e.redactConfig(input); assert.equal(JSON.stringify(input), before); assert.notEqual(actual.items, input.items); assert.equal(e.redactConfig('hello'), 'hello'); } },
      { id: 'redaction-prototype-security', name: 'Prototype keys and cycles', run: e => { const input = JSON.parse('{"__proto__":{"marker":"safe"},"name":"user"}'); const result = e.redactConfig(input); assert.equal(Object.prototype.hasOwnProperty.call(result, '__proto__'), true); sameJson(result, input); assert.equal({}.marker, undefined); const cycle = {}; cycle.self = cycle; assert.throws(() => e.redactConfig(cycle)); } },
    ],
  },
};
module.exports = { MAINTENANCE_SUITES };
