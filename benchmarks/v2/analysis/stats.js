'use strict';

/**
 * Calculates 95% Confidence Interval for a proportion using the Wald method.
 * @param {number} p - sample proportion (success rate)
 * @param {number} n - sample size
 * @returns {number} Margin of Error
 */
function calculate95CI(p, n) {
  if (n === 0) return 0;
  // Z-value for 95% confidence is 1.96
  const z = 1.96;
  const standardError = Math.sqrt((p * (1 - p)) / n);
  return z * standardError;
}

/**
 * Analyzes the results of a benchmark run.
 * @param {Array} results Array of execution result objects from the runner
 * @returns {Object} Statistical summary
 */
function analyzeResults(results) {
  const statsByArm = {};

  // Group by arm
  for (const res of results) {
    if (!statsByArm[res.armId]) {
      statsByArm[res.armId] = {
        total: 0,
        successes: 0,
        failures: 0,
        totalTokens: 0,
        totalDurationMs: 0
      };
    }
    
    const stats = statsByArm[res.armId];
    stats.total++;
    if (res.success) {
      stats.successes++;
    } else {
      stats.failures++;
    }
    stats.totalTokens += res.usage.totalTokens;
    stats.totalDurationMs += res.durationMs;
  }

  // Calculate rates and CI
  const finalStats = {};
  for (const [armId, stats] of Object.entries(statsByArm)) {
    const successRate = stats.total > 0 ? stats.successes / stats.total : 0;
    const marginOfError = calculate95CI(successRate, stats.total);
    
    finalStats[armId] = {
      ...stats,
      successRate: parseFloat((successRate * 100).toFixed(2)),
      confidenceInterval95: `±${(marginOfError * 100).toFixed(2)}%`,
      avgTokensPerTask: stats.total > 0 ? Math.round(stats.totalTokens / stats.total) : 0,
      avgDurationMs: stats.total > 0 ? Math.round(stats.totalDurationMs / stats.total) : 0
    };
  }

  return finalStats;
}

module.exports = {
  analyzeResults,
  calculate95CI
};
