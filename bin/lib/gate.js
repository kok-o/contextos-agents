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

module.exports = {
  runGate,
};
