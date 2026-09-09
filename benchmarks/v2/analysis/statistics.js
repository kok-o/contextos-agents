/**
 * benchmarks/v2/analysis/statistics.js
 * ContextOS Benchmark v2 — Statistical Analysis Engine
 *
 * Implements Section 24 of CONTEXTOS_IMPLEMENTATION_PLAN.md:
 *   - Primary metric: cost per independently verified successful task
 *   - Wilson score 95% confidence intervals for binomial success proportions
 *   - Pairwise delta comparison between Arm C/D and Arm B (Concise Checklist comparator)
 *   - Structured tabular summary generation
 */

'use strict';

/**
 * Calculates Wilson score 95% confidence interval for a proportion.
 *
 * @param {number} successes
 * @param {number} total
 * @param {number} [z=1.96] - 95% confidence z-score
 * @returns {[number, number]} [lower, upper] as percentages [0, 100]
 */
function calculateWilsonInterval(successes, total, z = 1.96) {
  if (total === 0) return [0, 0];
  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denominator;

  return [
    Math.max(0, parseFloat(((center - margin) * 100).toFixed(1))),
    Math.min(100, parseFloat(((center + margin) * 100).toFixed(1))),
  ];
}

class BenchmarkStatistics {
  /**
   * Analyzes an array of run outcomes across experimental arms.
   *
   * @param {Array<Object>} runs - List of run records: { armId, success, totalCost, durationMs }
   * @returns {Object} Comprehensive statistical summary
   */
  static analyze(runs) {
    const armsMap = {};

    for (const run of runs) {
      const { armId, success, totalCost = 0, durationMs = 0 } = run;
      if (!armsMap[armId]) {
        armsMap[armId] = {
          armId,
          totalRuns: 0,
          successfulRuns: 0,
          totalCost: 0,
          totalDurationMs: 0,
        };
      }

      const item = armsMap[armId];
      item.totalRuns++;
      if (success) item.successfulRuns++;
      item.totalCost += totalCost;
      item.totalDurationMs += durationMs;
    }

    const armStats = {};
    for (const [armId, d] of Object.entries(armsMap)) {
      const successRate = d.totalRuns > 0 ? (d.successfulRuns / d.totalRuns) * 100 : 0;
      const ci95 = calculateWilsonInterval(d.successfulRuns, d.totalRuns);
      const costPerSuccess = d.successfulRuns > 0 ? d.totalCost / d.successfulRuns : null;
      const avgDurationMs = d.totalRuns > 0 ? d.totalDurationMs / d.totalRuns : 0;

      armStats[armId] = {
        armId,
        totalRuns: d.totalRuns,
        successfulRuns: d.successfulRuns,
        successRate: parseFloat(successRate.toFixed(1)),
        ci95,
        totalCost: parseFloat(d.totalCost.toFixed(4)),
        costPerVerifiedSuccess: costPerSuccess !== null ? parseFloat(costPerSuccess.toFixed(4)) : null,
        avgDurationMs: Math.round(avgDurationMs),
      };
    }

    // Pairwise comparisons against Arm B (Concise Checklist)
    const comparator = armStats['arm-b-concise-checklist'];
    const comparisons = {};

    if (comparator) {
      for (const [armId, stat] of Object.entries(armStats)) {
        if (armId === 'arm-b-concise-checklist') continue;

        const rateDelta = parseFloat((stat.successRate - comparator.successRate).toFixed(1));
        let costRatio = null;
        if (comparator.costPerVerifiedSuccess && stat.costPerVerifiedSuccess) {
          costRatio = parseFloat((stat.costPerVerifiedSuccess / comparator.costPerVerifiedSuccess).toFixed(2));
        }

        comparisons[armId] = {
          vsComparator: 'arm-b-concise-checklist',
          successRateDelta: rateDelta,
          costRatio,
        };
      }
    }

    return {
      timestamp: Date.now(),
      totalRunsAnalyzed: runs.length,
      arms: armStats,
      comparisons,
    };
  }

  /**
   * Formats statistical analysis into an aligned markdown summary table.
   *
   * @param {Object} analysis
   * @returns {string}
   */
  static formatTable(analysis) {
    const lines = [];
    lines.push('| Arm ID | Runs | Successes | Success Rate (95% CI) | Cost / Verified Success | Avg Latency |');
    lines.push('|---|---:|---:|---:|---:|---:|');

    for (const arm of Object.values(analysis.arms)) {
      const ciStr = `[${arm.ci95[0]}%, ${arm.ci95[1]}%]`;
      const costStr = arm.costPerVerifiedSuccess !== null ? `$${arm.costPerVerifiedSuccess}` : 'N/A';
      lines.push(
        `| **${arm.armId}** | ${arm.totalRuns} | ${arm.successfulRuns} | ${arm.successRate}% ${ciStr} | ${costStr} | ${arm.avgDurationMs}ms |`
      );
    }

    return lines.join('\n');
  }
}

module.exports = {
  calculateWilsonInterval,
  BenchmarkStatistics,
};
