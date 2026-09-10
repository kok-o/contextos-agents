#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const { ARMS } = require('../benchmarks/v2/arms/arm-definitions');
const { runTask } = require('../benchmarks/v2/harness/runner');
const { analyzeResults } = require('../benchmarks/v2/analysis/stats');

const EVIDENCE_DIR = path.join(__dirname, '../benchmarks/evidence/v2');
const PILOT_TASKS_PATH = path.join(__dirname, '../benchmarks/v2/pilot-tasks.json');

async function main() {
  console.log('ContextOS Benchmark v2 — Mock Execution Harness');
  
  // Load tasks
  const tasks = JSON.parse(fs.readFileSync(PILOT_TASKS_PATH, 'utf-8'));
  console.log(`Loaded ${tasks.length} benchmark tasks.`);

  // Execute tasks natively (no looping, 1-to-1 mapping)
  const volumeTasks = tasks;

  const results = [];
  
  // Execute tasks across all arms
  for (const arm of Object.values(ARMS)) {
    console.log(`\nEvaluating Arm: ${arm.name} (${arm.id})`);
    
    let completed = 0;
    for (const task of volumeTasks) {
      process.stdout.write(`  Running ${task.id}... `);
      const result = await runTask(task, arm.id);
      results.push(result);
      completed++;
      process.stdout.write(result.success ? 'PASS\n' : 'FAIL\n');
    }
  }

  // Analyze Results
  console.log('\nAnalyzing Results...');
  const stats = analyzeResults(results);

  let commitSha = 'unknown';
  try {
    commitSha = require('child_process').execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch (err) {
    // ignore
  }

  const report = {
    gate: 'W8 Benchmark Execution',
    timestamp: new Date().toISOString(),
    commit: commitSha,
    engine: 'mock-provider-v1',
    datasetSize: volumeTasks.length,
    results: stats
  };

  // Ensure directory exists
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }

  const reportPath = path.join(EVIDENCE_DIR, `benchmark-run-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  // Create pointer to latest
  const latestPath = path.join(EVIDENCE_DIR, 'latest-run.json');
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));

  console.log(`\nBenchmark Complete. Immutable evidence saved to: ${reportPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
