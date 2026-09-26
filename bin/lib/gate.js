/**
 * bin/lib/gate.js
 * ContextOS - Quality Gate Verification Engine
 *
 * Implements deterministic verification paths without executing untrusted
 * user project scripts. Operates in-process using trusted package modules.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { detectDrift } = require('../../.agents/adapters/drift-detector.js');
const pureCompiler = require('../../.agents/adapters/pure-compiler.js');

/**
 * Runs the quality gate against a target project root.
 *
 * @param {string} [projectRoot=process.cwd()] - Target project directory
 * @param {object} [options]
 * @param {string|string[]} [options.target='all'] - Adapters to verify
 * @param {string} [options.profile=null] - Profile name or override
 * @param {boolean} [options.json=false] - Format as machine-readable JSON
 * @returns {{ ok: boolean, code: number, status: string, drift: object, message: string }}
 */
function runGate(projectRoot = process.cwd(), options = {}) {
  const absRoot = path.resolve(projectRoot);
  const target = options.target || 'all';
  const profile = options.profile || null;

  // 1. Run Drift Detection via trusted in-package drift-detector
  const drift = detectDrift(absRoot, target, { profile });

  let status = 'pass';
  let code = 0;
  let message = 'All adapter outputs are synchronized with source skills.';

  if (drift.hasError) {
    status = 'error';
    code = drift.code || 2;
    message = drift.error || 'Configuration or execution error occurred during verification.';
  } else if (drift.hasDrift) {
    status = 'drift';
    code = drift.code || 1;
    message = `Adapter drift detected across ${drift.totalFindings} finding(s).`;
  }

  const result = {
    schemaVersion: '2.0.0',
    status,
    code,
    ok: code === 0,
    projectRoot: absRoot,
    target,
    profile,
    message,
    drift,
  };

  return result;
}

/**
 * Emits GitHub Actions workflow annotations for drift or errors.
 *
 * @param {object} result - Gate result
 */
function emitGitHubAnnotations(result) {
  if (!result || !result.drift) return;

  const escapeActionData = (str) =>
    String(str)
      .replace(/%/g, '%25')
      .replace(/\r/g, '%0D')
      .replace(/\n/g, '%0A');

  const normalizePath = (p) => (p ? String(p).replace(/\\/g, '/') : '');

  const { findings, collisions } = result.drift;

  if (findings) {
    for (const item of findings.MISSING_OUTPUT || []) {
      console.error(`::error file=${normalizePath(item.path)}::[MISSING_OUTPUT] ${escapeActionData(item.reason || 'Missing projected output file')}`);
    }
    for (const item of findings.MODIFIED_MANAGED_OUTPUT || []) {
      console.error(`::error file=${normalizePath(item.path)}::[MODIFIED_OUTPUT] ${escapeActionData(item.reason || 'Managed output modified on disk')}`);
    }
    for (const item of findings.ORPHAN_MANAGED_OUTPUT || []) {
      console.error(`::warning file=${normalizePath(item.path)}::[ORPHAN_OUTPUT] ${escapeActionData(item.reason || 'Orphan file recorded in lockfile')}`);
    }
    for (const item of findings.CORRUPT_LOCKFILE || []) {
      console.error(`::error::[CORRUPT_LOCKFILE] ${escapeActionData(item.reason || 'Lockfile is corrupt')}`);
    }
    for (const item of findings.CONFIG_ERROR || []) {
      console.error(`::error::[CONFIG_ERROR] ${escapeActionData(item.reason || 'Configuration error')}`);
    }
    for (const item of findings.EMPTY_PROJECTION || []) {
      console.error(`::error::[EMPTY_PROJECTION] ${escapeActionData(item.reason || 'Projected artifact set is empty')}`);
    }
  }

  for (const c of collisions || []) {
    console.error(`::error file=${normalizePath(c.path)}::[PATH_COLLISION] Collision between adapter ${c.firstAdapter} and ${c.secondAdapter}`);
  }
}

/**
 * Formats a markdown summary for GitHub Step Summary.
 *
 * @param {object} result - Gate result
 * @returns {string} Markdown summary
 */
function formatGitHubSummary(result) {
  const icon = result.ok ? '✅' : (result.status === 'drift' ? '⚠️' : '❌');
  const lines = [
    `# ${icon} ContextOS Quality Gate Report`,
    '',
    `**Status**: \`${result.status.toUpperCase()}\` (exit code: \`${result.code}\`)  `,
    `**Project Root**: \`${result.projectRoot}\`  `,
    `**Target Adapters**: \`${Array.isArray(result.target) ? result.target.join(', ') : result.target}\`  `,
    `**Active Profile**: \`${result.profile || 'default'}\`  `,
    `**Projected Artifacts**: \`${result.drift?.projectedCount || 0}\`  `,
    '',
    `### Overview`,
    result.message,
    '',
  ];

  if (result.drift && result.drift.totalFindings > 0) {
    lines.push(`### Findings (${result.drift.totalFindings})`);
    lines.push('| State | Path | Detail |');
    lines.push('| --- | --- | --- |');

    for (const [state, items] of Object.entries(result.drift.findings)) {
      for (const item of items) {
        const itemPath = item.path ? `\`${item.path}\`` : '*(project)*';
        const detail = (item.reason || item.diff || '').replace(/\|/g, '\\|');
        lines.push(`| **${state}** | ${itemPath} | ${detail} |`);
      }
    }
    lines.push('');
    lines.push('> **Remediation**: Run `npx contextos-agents export all` and commit synchronized adapter artifacts.');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Writes the markdown summary to GITHUB_STEP_SUMMARY if available.
 *
 * @param {object} result - Gate result
 */
function writeGitHubSummary(result) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) return;

  try {
    const summaryMd = formatGitHubSummary(result);
    fs.appendFileSync(summaryFile, summaryMd + '\n', 'utf8');
  } catch {
    // Best-effort write to step summary
  }
}

module.exports = {
  runGate,
  emitGitHubAnnotations,
  formatGitHubSummary,
  writeGitHubSummary,
};
