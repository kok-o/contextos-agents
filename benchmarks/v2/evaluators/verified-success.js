/**
 * benchmarks/v2/evaluators/verified-success.js
 * ContextOS Benchmark v2 — Primary Outcome Evaluator
 *
 * The primary outcome is harness_verified_success: code extraction, compilation,
 * every registered runtime-oracle assertion, placeholder checks, and configured
 * budget checks must pass.
 */

'use strict';

const PLACEHOLDER_PATTERNS = [
  /\/\/\s*TODO:\s*implement\b/i,
  /\/\/\s*\.\.\.\s*rest of code\b/i,
  /\bthrow new Error\(["']Not implemented["']\)/i,
  /\bpass\s*#\s*TODO\b/i,
];

class BenchmarkEvaluator {
  /**
   * Evaluates task run evidence against rigorous quality gates.
   *
   * @param {Object} runEvidence
   * @param {boolean} runEvidence.patchApplied
   * @param {boolean} runEvidence.compilationPassed
   * @param {number} runEvidence.oracleTestsTotal
   * @param {number} runEvidence.oracleTestsPassed
   * @param {boolean} [runEvidence.regressions=false]
   * @param {Array<string>} [runEvidence.securityFindings=[]]
   * @param {string} [runEvidence.generatedCode='']
   * @param {Object} [runEvidence.budget]
   * @param {number} [runEvidence.budget.tokensUsed=0]
   * @param {number} [runEvidence.budget.tokenLimit=50000]
   * @param {number} [runEvidence.budget.durationMs=0]
   * @param {number} [runEvidence.budget.timeoutMs=60000]
   * @returns {Object} Evaluation report
   */
  static evaluate(runEvidence) {
    const {
      patchApplied = false,
      compilationPassed = false,
      oracleTestsTotal = 0,
      oracleTestsPassed = 0,
      regressions = false,
      securityFindings = [],
      generatedCode = '',
      budget = {},
    } = runEvidence;

    const failures = [];

    // 1. Patch & build
    if (!patchApplied) failures.push('Patch was not successfully applied');
    if (!compilationPassed) failures.push('Compilation failed');

    // 2. Registered runtime oracle
    if (!Number.isInteger(oracleTestsTotal) || oracleTestsTotal < 1) {
      failures.push('Runtime oracle results are missing');
    } else if (!Number.isInteger(oracleTestsPassed) || oracleTestsPassed < 0 || oracleTestsPassed > oracleTestsTotal) {
      failures.push('Runtime oracle result counts are invalid');
    } else if (oracleTestsPassed < oracleTestsTotal) {
      failures.push(`Runtime oracle failed: ${oracleTestsPassed}/${oracleTestsTotal}`);
    }
    if (regressions) {
      failures.push('Regression detected in existing test baseline');
    }

    // 3. Security
    if (Array.isArray(securityFindings) && securityFindings.length > 0) {
      failures.push(`Security vulnerabilities detected: ${securityFindings.join(', ')}`);
    }

    // 4. Zero placeholders
    if (generatedCode) {
      for (const pat of PLACEHOLDER_PATTERNS) {
        if (pat.test(generatedCode)) {
          failures.push(`Lazy placeholder detected matching pattern: ${pat.source}`);
          break;
        }
      }
    }

    // 5. Budget constraints
    if (Number.isFinite(budget.tokensUsed) && Number.isFinite(budget.tokenLimit) && budget.tokensUsed > budget.tokenLimit) {
      failures.push(`Token budget exceeded: ${budget.tokensUsed} > ${budget.tokenLimit}`);
    }
    if (budget.requireTokenUsage === true && !Number.isFinite(budget.tokensUsed)) {
      failures.push('Token usage unavailable; token budget could not be verified');
    }
    if (budget.requireTimeUsage === true && !Number.isFinite(budget.durationMs)) {
      failures.push('Generation time unavailable; time budget could not be verified');
    }
    if (Number.isFinite(budget.durationMs) && Number.isFinite(budget.timeoutMs) && budget.durationMs > budget.timeoutMs) {
      failures.push(`Time budget exceeded: ${budget.durationMs}ms > ${budget.timeoutMs}ms`);
    }

    const isSuccess = failures.length === 0;

    return {
      harness_verified_success: isSuccess,
      compilationPassed: Boolean(compilationPassed),
      oracleTestsTotal: Number.isInteger(oracleTestsTotal) && oracleTestsTotal > 0 ? oracleTestsTotal : null,
      oracleTestsPassed: Number.isInteger(oracleTestsPassed) && oracleTestsTotal > 0 ? oracleTestsPassed : null,
      failureCount: failures.length,
      failures,
    };
  }
}

module.exports = {
  BenchmarkEvaluator,
};
