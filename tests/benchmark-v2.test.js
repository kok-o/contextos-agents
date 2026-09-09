/**
 * tests/benchmark-v2.test.js
 * ContextOS — Benchmark v2 Architecture & Evaluator Test Suite
 *
 * Verifies Milestone 19 (Issue #23):
 *   - 4-arm specification (Vanilla, Concise Checklist comparator, Core, Full Runtime) (Section 24.2)
 *   - Primary evaluator: independently_verified_success with hidden test oracle (Section 24.8)
 *   - Lazy placeholder and security finding rejection
 *   - Statistical engine: cost per verified success, Wilson score 95% CIs, and comparator delta (Section 24)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ARMS } = require('../benchmarks/v2/arms/arm-definitions');
const { BenchmarkEvaluator } = require('../benchmarks/v2/evaluators/verified-success');
const { BenchmarkStatistics, calculateWilsonInterval } = require('../benchmarks/v2/analysis/statistics');

test('Benchmark v2 Arms — definitions and token budget limits', () => {
  assert.ok(ARMS.ARM_A_VANILLA);
  assert.ok(ARMS.ARM_B_CONCISE_CHECKLIST);
  assert.ok(ARMS.ARM_C_CONTEXTOS_CORE);
  assert.ok(ARMS.ARM_D_FULL_CONTEXTOS);

  // Arm B: Concise Checklist is primary comparator (~600 tokens)
  const promptB = ARMS.ARM_B_CONCISE_CHECKLIST.buildSystemPrompt();
  assert.ok(promptB.includes('1. Inspect existing files'));
  assert.ok(promptB.includes('12. Ensure code compiles'));

  // Arm C: Dynamic context selection
  const promptC = ARMS.ARM_C_CONTEXTOS_CORE.buildSystemPrompt(['react', 'typescript']);
  assert.ok(promptC.includes('react, typescript'));

  // Arm D: Full Runtime
  const promptD = ARMS.ARM_D_FULL_CONTEXTOS.buildSystemPrompt(['security'], 'HIGH');
  assert.ok(promptD.includes('RISK: HIGH'));
});

test('BenchmarkEvaluator — primary outcome independently_verified_success', () => {
  // Successful run
  const successfulRun = {
    patchApplied: true,
    buildPass: true,
    publicTestsTotal: 10,
    publicTestsPassed: 10,
    hiddenTestsTotal: 5,
    hiddenTestsPassed: 5,
    regressions: false,
    securityFindings: [],
    generatedCode: 'export function add(a: number, b: number): number { return a + b; }',
    budget: { tokensUsed: 1200, tokenLimit: 5000, durationMs: 2500, timeoutMs: 10000 },
  };

  const evalSuccess = BenchmarkEvaluator.evaluate(successfulRun);
  assert.equal(evalSuccess.independently_verified_success, true);
  assert.equal(evalSuccess.failureCount, 0);

  // Hidden test failure
  const hiddenTestFailure = {
    ...successfulRun,
    hiddenTestsPassed: 4, // 4 out of 5
  };
  const evalHiddenFail = BenchmarkEvaluator.evaluate(hiddenTestFailure);
  assert.equal(evalHiddenFail.independently_verified_success, false);
  assert.ok(evalHiddenFail.failures[0].includes('Hidden test oracle failed'));

  // Placeholder failure
  const placeholderRun = {
    ...successfulRun,
    generatedCode: 'export function add(a: number, b: number): number {\n  // TODO: implement later\n  return 0;\n}',
  };
  const evalPlaceholder = BenchmarkEvaluator.evaluate(placeholderRun);
  assert.equal(evalPlaceholder.independently_verified_success, false);
  assert.ok(evalPlaceholder.failures.some((f) => f.includes('placeholder detected')));

  // Security finding failure
  const securityRun = {
    ...successfulRun,
    securityFindings: ['SEC-INJECTION-01'],
  };
  const evalSecurity = BenchmarkEvaluator.evaluate(securityRun);
  assert.equal(evalSecurity.independently_verified_success, false);
});

test('BenchmarkStatistics — cost per verified success and Wilson confidence intervals', () => {
  // Wilson interval check
  const ci = calculateWilsonInterval(80, 100);
  assert.ok(ci[0] >= 70 && ci[0] <= 75, `Expected lower CI around 71-73%, got ${ci[0]}%`);
  assert.ok(ci[1] >= 85 && ci[1] <= 90, `Expected upper CI around 86-88%, got ${ci[1]}%`);

  // Multi-arm run sample
  const sampleRuns = [
    // Arm B (Comparator): 10 runs, 6 successes, $0.10 each ($1.00 total)
    ...Array(6).fill({ armId: 'arm-b-concise-checklist', success: true, totalCost: 0.10, durationMs: 3000 }),
    ...Array(4).fill({ armId: 'arm-b-concise-checklist', success: false, totalCost: 0.10, durationMs: 3000 }),

    // Arm C (ContextOS Core): 10 runs, 8 successes, $0.08 each ($0.80 total)
    ...Array(8).fill({ armId: 'arm-c-contextos-core', success: true, totalCost: 0.08, durationMs: 2500 }),
    ...Array(2).fill({ armId: 'arm-c-contextos-core', success: false, totalCost: 0.08, durationMs: 2500 }),
  ];

  const analysis = BenchmarkStatistics.analyze(sampleRuns);

  // Arm B stats
  const armB = analysis.arms['arm-b-concise-checklist'];
  assert.equal(armB.totalRuns, 10);
  assert.equal(armB.successfulRuns, 6);
  assert.equal(armB.successRate, 60.0);
  // Cost per verified success = $1.00 / 6 = $0.1667
  assert.ok(Math.abs(armB.costPerVerifiedSuccess - 0.1667) < 0.001);

  // Arm C stats
  const armC = analysis.arms['arm-c-contextos-core'];
  assert.equal(armC.totalRuns, 10);
  assert.equal(armC.successfulRuns, 8);
  assert.equal(armC.successRate, 80.0);
  // Cost per verified success = $0.80 / 8 = $0.1000
  assert.equal(armC.costPerVerifiedSuccess, 0.1);

  // Comparison vs Arm B
  const comparison = analysis.comparisons['arm-c-contextos-core'];
  assert.equal(comparison.successRateDelta, 20.0, 'Arm C should be +20% higher than Arm B');
  assert.ok(comparison.costRatio < 1.0, 'Arm C cost per verified success should be lower than Arm B');

  // Formatted table check
  const table = BenchmarkStatistics.formatTable(analysis);
  assert.ok(table.includes('arm-b-concise-checklist'));
  assert.ok(table.includes('arm-c-contextos-core'));
  assert.ok(table.includes('Success Rate (95% CI)'));
});
