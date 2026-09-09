/**
 * benchmarks/v2/evaluators/verified-success.js
 * ContextOS Benchmark v2 — Primary Outcome Evaluator
 *
 * Implements Section 24.8 of CONTEXTOS_IMPLEMENTATION_PLAN.md:
 *   - Primary metric: independently_verified_success
 *   - Evaluates:
 *     1. Patch application / syntax correctness
 *     2. Typecheck / build status
 *     3. Public unit test pass rate
 *     4. Hidden test suite pass rate (isolated oracle)
 *     5. Zero regression on baseline suites
 *     6. Zero P0/P1 security findings or leaked credentials
 *     7. Zero placeholder stubs (TODO, mock placeholders)
 *     8. Budget constraints (tokens, time, turns)
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
   * @param {boolean} runEvidence.buildPass
   * @param {number} runEvidence.publicTestsTotal
   * @param {number} runEvidence.publicTestsPassed
   * @param {number} runEvidence.hiddenTestsTotal
   * @param {number} runEvidence.hiddenTestsPassed
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
      buildPass = false,
      publicTestsTotal = 0,
      publicTestsPassed = 0,
      hiddenTestsTotal = 0,
      hiddenTestsPassed = 0,
      regressions = false,
      securityFindings = [],
      generatedCode = '',
      budget = {},
    } = runEvidence;

    const failures = [];

    // 1. Patch & build
    if (!patchApplied) failures.push('Patch was not successfully applied');
    if (!buildPass) failures.push('Compilation or typecheck failed');

    // 2. Tests
    if (publicTestsTotal > 0 && publicTestsPassed < publicTestsTotal) {
      failures.push(`Public tests failed: ${publicTestsPassed}/${publicTestsTotal}`);
    }
    if (hiddenTestsTotal > 0 && hiddenTestsPassed < hiddenTestsTotal) {
      failures.push(`Hidden test oracle failed: ${hiddenTestsPassed}/${hiddenTestsTotal}`);
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
    if (budget.tokensUsed && budget.tokenLimit && budget.tokensUsed > budget.tokenLimit) {
      failures.push(`Token budget exceeded: ${budget.tokensUsed} > ${budget.tokenLimit}`);
    }
    if (budget.durationMs && budget.timeoutMs && budget.durationMs > budget.timeoutMs) {
      failures.push(`Time budget exceeded: ${budget.durationMs}ms > ${budget.timeoutMs}ms`);
    }

    const isSuccess = failures.length === 0;

    return {
      independently_verified_success: isSuccess,
      publicTestRate: publicTestsTotal > 0 ? publicTestsPassed / publicTestsTotal : 1.0,
      hiddenTestRate: hiddenTestsTotal > 0 ? hiddenTestsPassed / hiddenTestsTotal : 1.0,
      failureCount: failures.length,
      failures,
    };
  }
}

module.exports = {
  BenchmarkEvaluator,
};
