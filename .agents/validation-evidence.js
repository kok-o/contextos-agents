'use strict';

const fs = require('node:fs');
const { isDeepStrictEqual } = require('node:util');

// A report contract, not an attestation that a command was actually executed.
const EVIDENCE_REPORT_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  'x-contextos-evidence-contract': 1,
  title: 'Scoped verification evidence',
  description: 'Report shape and outcome consistency only; command execution and agent behavior require separate evidence.',
  type: 'object',
  additionalProperties: false,
  required: ['status', 'checks', 'limitations'],
  properties: {
    status: { enum: ['verified', 'partial', 'not_run'] },
    checks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['command', 'exitCode', 'scope'],
        properties: {
          command: { type: 'string', minLength: 1 },
          exitCode: { type: ['integer', 'null'] },
          scope: { type: 'string', minLength: 1 },
        },
      },
    },
    limitations: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
  allOf: [
    {
      if: { properties: { status: { const: 'verified' } } },
      then: { properties: { checks: { minItems: 1, items: { properties: { exitCode: { const: 0 } } } } } },
    },
    {
      if: { properties: { status: { enum: ['partial', 'not_run'] } } },
      then: { properties: { limitations: { minItems: 1 } } },
    },
    {
      if: { properties: { status: { const: 'not_run' } } },
      then: { properties: { checks: { items: { properties: { exitCode: { type: 'null' } } } } } },
    },
  ],
};

function validateEvidenceSchema(schema) {
  return isDeepStrictEqual(schema, EVIDENCE_REPORT_SCHEMA) ? [] : ['Evidence schema must match the version 1 report contract'];
}

function validateEvidenceReport(report) {
  const errors = [];
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  const nonempty = v => typeof v === 'string' && v.trim().length > 0;
  if (!object(report)) return ['Report must be an object'];
  if (Object.keys(report).some(k => !['status', 'checks', 'limitations'].includes(k))) errors.push('Unknown report property');
  if (!['verified', 'partial', 'not_run'].includes(report.status)) errors.push('Invalid status');
  if (!Array.isArray(report.checks)) errors.push('checks must be an array');
  else {
    for (const [i, check] of report.checks.entries()) {
      if (!object(check) || Object.keys(check).some(k => !['command', 'exitCode', 'scope'].includes(k)) ||
          !nonempty(check.command) || !nonempty(check.scope) ||
          !(check.exitCode === null || Number.isInteger(check.exitCode))) {
        errors.push(`Invalid check at index ${i}`);
      }
    }
    if (report.status === 'verified' && (!report.checks.length || report.checks.some(c => c?.exitCode !== 0))) {
      errors.push('verified requires at least one successful check and no failed or unrun checks');
    }
    if (report.status === 'not_run' && report.checks.some(c => c?.exitCode !== null)) errors.push('not_run cannot contain executed checks');
  }
  if (!Array.isArray(report.limitations) || report.limitations.some(v => !nonempty(v))) errors.push('limitations must contain nonempty strings');
  else if (report.status !== 'verified' && !report.limitations.length) errors.push('Partial or unrun work needs limitations');
  return errors;
}

module.exports = { EVIDENCE_REPORT_SCHEMA, validateEvidenceSchema, validateEvidenceReport };

if (require.main === module) {
  try {
    const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const errors = validateEvidenceReport(report);
    process.stdout.write(JSON.stringify({ ok: errors.length === 0, scope: 'report contract only', errors }) + '\n');
    process.exitCode = errors.length ? 1 : 0;
  } catch (err) {
    process.stderr.write(err.message + '\n');
    process.exitCode = 1;
  }
}
