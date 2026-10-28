#!/usr/bin/env node
/**
 * collect-signals.mjs
 * Imports supplied observations or generates explicitly labeled demonstration data.
 * Live telemetry collection is not implemented.
 *
 * Usage:
 *   node scripts/collect-signals.mjs [projectId] [--window <days>] [--out <file>] [--help]
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeSignals, readJson } from './signals-format.mjs';

function printHelp() {
  console.log(`
collect-signals.mjs — Vercel Telemetry Signal Collector

Usage:
  node scripts/collect-signals.mjs [projectId] [options]

Arguments:
  projectId              Optional expected project ID; imported observations must match it

Options:
  --input <file>         Import supplied observations; does not fetch live telemetry
  --demo                 Explicitly generate synthetic demonstration data
  --window <days>        Positive integer window for demo data only (default: 14)
  --out <file>           Output file path (default: stdout)
  --help, -h             Show this help message
`);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

let projectId = null;
let windowDays = 14;
let outFile = null;
let inputFile = null;
let demo = false;
try {
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      if (seen.has(arg)) throw new Error('Duplicate option: ' + arg);
      seen.add(arg);
      if (arg === '--demo') { demo = true; continue; }
      if (!['--window', '--out', '--input'].includes(arg)) throw new Error('Unknown option: ' + arg);
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('Missing value for ' + arg);
      if (arg === '--window') {
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
          throw new Error('--window must be a positive integer');
        }
        windowDays = Number(value);
      } else if (arg === '--input') inputFile = value;
      else outFile = value;
    } else {
      if (projectId) throw new Error('Only one project ID is supported');
      projectId = arg;
    }
  }
  if (inputFile) {
    if (demo || seen.has('--window')) throw new Error('Do not combine imported observations with demo/window relabeling');
    const supplied = normalizeSignals(readJson(inputFile));
    if (projectId && projectId !== supplied.projectId) throw new Error('Supplied projectId does not match the requested project');
    const output = JSON.stringify({ timestamp: new Date().toISOString(), ...supplied }, null, 2);
    if (outFile) writeFileSync(outFile, output, 'utf8');
    else console.log(output);
    process.exit(0);
  }
  if (!demo) throw new Error('Provide --input FILE or explicit --demo; live telemetry collection is not implemented.');
} catch (error) { console.error(error.message); process.exit(1); }
projectId ||= 'demo-project';

const signals = {
  timestamp: new Date().toISOString(),
  projectId,
  windowDays,
  telemetrySource: 'synthetic-demo',
  synthetic: true,
  provenanceVerified: false,
  metrics: {
    totalInvocations: 1250400,
    averageDurationMs: 245,
    p95DurationMs: 820,
    fastDataTransferBytes: 15420000000, // 15.4 GB
    buildMinutes: 142,
    coldStartRate: 0.084,
  },
  routes: [
    {
      route: '/api/items',
      method: 'GET',
      invocations: 420000,
      p95DurationMs: 1250,
      avgDurationMs: 340,
      coldStartRate: 0.12,
      errorRate: 0.002,
      cacheable: true,
      currentCacheControl: 'no-store'
    },
    {
      route: '/api/auth/session',
      method: 'GET',
      invocations: 310000,
      p95DurationMs: 140,
      avgDurationMs: 65,
      coldStartRate: 0.02,
      errorRate: 0.0001,
      cacheable: false,
      currentCacheControl: 'private, no-cache'
    },
    {
      route: '/api/catalog/search',
      method: 'GET',
      invocations: 280000,
      p95DurationMs: 980,
      avgDurationMs: 290,
      coldStartRate: 0.09,
      errorRate: 0.001,
      cacheable: true,
      currentCacheControl: 'public, max-age=0'
    },
    {
      route: '/api/checkout',
      method: 'POST',
      invocations: 45000,
      p95DurationMs: 1650,
      avgDurationMs: 520,
      coldStartRate: 0.15,
      errorRate: 0.005,
      cacheable: false,
      currentCacheControl: 'no-store'
    }
  ]
};

const outputJson = JSON.stringify(signals, null, 2);
if (outFile) {
  writeFileSync(resolve(process.cwd(), outFile), outputJson, 'utf8');
} else {
  console.log(outputJson);
}
