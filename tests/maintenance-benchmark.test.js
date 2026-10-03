'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MAINTENANCE_SUITES } = require('../benchmarks/lib/maintenance-suites');
const { runRuntimeSuite } = require('../benchmarks/lib/runtime-runner');
const REFERENCES = {
  'safe-pagination': `export function parsePagination(q) {
    function parse(value, fallback, min, max) {
      if (value === undefined) return fallback;
      if (typeof value !== 'number' && (typeof value !== 'string' || !/^\\d+$/.test(value))) throw new Error('Invalid input');
      const n = Number(value); if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error('Invalid input'); return n;
    }
    return {limit: parse(q.limit, 20, 1, 100), offset: parse(q.offset, 0, 0, Number.MAX_SAFE_INTEGER)};
  }`,
  'stable-dependency-sort': `export function sortPackages(nodes) {
    const map = new Map(); for (const n of nodes) { if(map.has(n.id)) throw new Error('Duplicate'); map.set(n.id, n); }
    for (const n of nodes) for (const dep of n.deps) if (!map.has(dep)) throw new Error('Missing');
    const result = []; const done = new Set();
    while (result.length < nodes.length) { const ready = nodes.filter(n => !done.has(n.id) && n.deps.every(d => done.has(d))).map(n => n.id).sort(); if (!ready.length) throw new Error('Cycle'); done.add(ready[0]); result.push(ready[0]); }
    return result;
  }`,
  'nested-secret-redaction': `export function redactConfig(input) {
    const active = new Set();
    function clone(value) {
      if (value === null || typeof value !== 'object') return value;
      if (active.has(value)) throw new Error('Cycle'); active.add(value);
      const result = Array.isArray(value) ? [] : {};
      for (const key of Object.keys(value)) Object.defineProperty(result, key, {value: /password|secret|token|apikey|api_key|authorization/i.test(key) ? '[REDACTED]' : clone(value[key]), enumerable: true, writable: true, configurable: true});
      active.delete(value); return result;
    }
    return clone(input);
  }`,
};
for (const [id, suite] of Object.entries(MAINTENANCE_SUITES)) {
  test(`behavioral oracle ${id} accepts the reference and rejects a wrong implementation`, async () => {
    const good = await runRuntimeSuite(suite, REFERENCES[id]);
    assert.equal(good.compiled, true, JSON.stringify(good));
    assert.equal(good.totalPassed, good.totalTests, JSON.stringify(good));
    const bad = await runRuntimeSuite(suite, 'export function parsePagination(q) { return q; } export function sortPackages(n) { return n.map(x => x.id); } export function redactConfig(x) { return x; }');
    assert.equal(bad.compiled, true);
    assert.ok(bad.totalPassed < bad.totalTests, JSON.stringify(bad));
  });
}
