/**
 * .agents/runtime/attestations.js
 * ContextOS — Machine-Verifiable Runtime Attestations Engine
 *
 * Implements cryptographic proof-of-work attestations for verification and review:
 *   - VerificationAttestation (command, exitCode, output digest, runner mode)
 *   - ReviewAttestation (implementer/reviewer IDs, model, independence, verdict)
 *   - Fail-closed validation (no PASS without verifiable evidence)
 *   - Candidate drift detection (SHA-256 diff & head commitment checks)
 *   - Zero install-time dependencies (pure Node.js crypto)
 */

'use strict';

const crypto = require('crypto');

/**
 * Computes deterministic SHA-256 of string or Buffer.
 */
function sha256(data) {
  return crypto.createHash('sha256').update(data || '').digest('hex');
}

/**
 * Computes deterministic hash for a sorted list of write-scope paths.
 */
function computeScopeSha256(scopeArray = []) {
  const sorted = Array.from(new Set(scopeArray.map(p => p.replace(/\\/g, '/')))).sort();
  return sha256(sorted.join('\n'));
}

/**
 * Computes deterministic hash for a git diff.
 */
function computeDiffSha256(diffText = '') {
  // Normalize CRLF to LF for deterministic hashes across platforms
  const normalized = (diffText || '').replace(/\r\n/g, '\n');
  return sha256(normalized);
}

/**
 * Validates and constructs a machine-verifiable VerificationAttestation.
 * Strict fail-closed semantics: PASS is forbidden without exitCode === 0 and outputSha256.
 *
 * @param {Object} params
 * @returns {Object} VerificationAttestation
 */
function createVerificationAttestation(params = {}) {
  const {
    status,
    subject = {},
    command,
    evidence,
    runnerMode = 'host-unsafe',
    startedAt = Date.now(),
    completedAt = Date.now(),
    reasonCode,
  } = params;

  if (!status) {
    throw new Error('VerificationAttestation requires a status');
  }

  if (!subject.repositoryFingerprint || !subject.baseSha || !subject.headSha) {
    throw new Error('VerificationAttestation requires subject repositoryFingerprint, baseSha, and headSha');
  }

  const diffSha256 = subject.diffSha256 || sha256('');
  const scopeSha256 = subject.scopeSha256 || computeScopeSha256([]);

  // Fail-closed gate: PASS must bear evidence with exitCode === 0 and outputSha256
  if (status === 'PASS') {
    if (!evidence || typeof evidence.exitCode !== 'number' || evidence.exitCode !== 0) {
      throw new Error('FAIL_CLOSED: Verification PASS requires verifiable evidence with exitCode === 0');
    }
    if (!evidence.outputSha256) {
      throw new Error('FAIL_CLOSED: Verification PASS requires evidence.outputSha256');
    }
  }

  // Reject legacy unverified pass without evidence
  if (params.isLegacy && (!evidence || evidence.exitCode !== 0)) {
    return {
      schemaVersion: 1,
      status: 'NOT_APPLICABLE',
      reasonCode: 'LEGACY_UNVERIFIED',
      subject: {
        repositoryFingerprint: subject.repositoryFingerprint,
        baseSha: subject.baseSha,
        headSha: subject.headSha,
        diffSha256,
        scopeSha256,
      },
      runnerMode,
      startedAt,
      completedAt,
    };
  }

  return {
    schemaVersion: 1,
    status,
    subject: {
      repositoryFingerprint: subject.repositoryFingerprint,
      baseSha: subject.baseSha,
      headSha: subject.headSha,
      diffSha256,
      scopeSha256,
    },
    command: command ? {
      executable: command.executable || 'npm',
      args: command.args || ['test'],
      cwd: command.cwd || '.',
      timeoutMs: command.timeoutMs || 60000,
    } : undefined,
    evidence: evidence ? {
      exitCode: evidence.exitCode,
      signal: evidence.signal || null,
      outputSha256: evidence.outputSha256,
      redactedPreview: (evidence.redactedPreview || '').slice(0, 1000),
      totalTests: evidence.totalTests,
      passedTests: evidence.passedTests,
      failedTests: evidence.failedTests,
    } : undefined,
    runnerMode: runnerMode === 'oci' ? 'oci' : 'host-unsafe',
    startedAt,
    completedAt,
    reasonCode,
  };
}

/**
 * Validates and constructs a machine-verifiable ReviewAttestation.
 *
 * @param {Object} params
 * @returns {Object} ReviewAttestation
 */
function createReviewAttestation(params = {}) {
  const {
    status,
    subject = {},
    implementerExecutionId = 'agent-impl',
    reviewerExecutionId = 'agent-rev',
    provider = 'google',
    model = 'gemini-2.5-pro',
    independenceLevel = 'separate_process',
    rawOutputDigest,
    staticFindings = [],
    llmVerdict,
    retries = 0,
    startedAt = Date.now(),
    completedAt = Date.now(),
  } = params;

  if (!status) {
    throw new Error('ReviewAttestation requires a status');
  }

  if (!subject.repositoryFingerprint || !subject.baseSha || !subject.headSha) {
    throw new Error('ReviewAttestation requires subject repositoryFingerprint, baseSha, and headSha');
  }

  const diffSha256 = subject.diffSha256 || sha256('');
  const scopeSha256 = subject.scopeSha256 || computeScopeSha256([]);
  const outputDigest = rawOutputDigest || sha256(JSON.stringify(llmVerdict || {}));

  // Fail-closed gate: PASS must have llmVerdict with specCompliance === 'PASS' and codeQuality === 'PASS'
  if (status === 'PASS') {
    if (!llmVerdict || llmVerdict.specCompliance !== 'PASS' || llmVerdict.codeQuality !== 'PASS') {
      throw new Error('FAIL_CLOSED: Review PASS requires llmVerdict with specCompliance: PASS and codeQuality: PASS');
    }
  }

  const validIndependence = ['same_process', 'separate_process', 'isolated_container', 'external_evaluator'];
  const indep = validIndependence.includes(independenceLevel) ? independenceLevel : 'separate_process';

  return {
    schemaVersion: 1,
    status,
    subject: {
      repositoryFingerprint: subject.repositoryFingerprint,
      baseSha: subject.baseSha,
      headSha: subject.headSha,
      diffSha256,
      scopeSha256,
    },
    implementerExecutionId,
    reviewerExecutionId,
    provider,
    model,
    independenceLevel: indep,
    rawOutputDigest: outputDigest,
    staticFindings: Array.isArray(staticFindings) ? staticFindings : [],
    llmVerdict: llmVerdict ? {
      specCompliance: llmVerdict.specCompliance,
      codeQuality: llmVerdict.codeQuality,
      summary: llmVerdict.summary || '',
    } : undefined,
    retries: Math.max(0, retries),
    startedAt,
    completedAt,
  };
}

/**
 * Validates that an attestation matches the current subject (head SHA, diff SHA).
 * If either differs, the attestation has suffered candidate commit drift.
 *
 * @param {Object} attestation
 * @param {Object} currentSubject
 * @returns {{ valid: boolean, reason?: string }}
 */
function verifyAttestationSubject(attestation, currentSubject) {
  if (!attestation || !attestation.subject) {
    return { valid: false, reason: 'Missing attestation subject' };
  }
  if (attestation.status === 'STALE') {
    return { valid: false, reason: 'Attestation is marked STALE' };
  }

  const subj = attestation.subject;
  if (subj.headSha !== currentSubject.headSha) {
    return {
      valid: false,
      reason: `Subject head SHA mismatch: attestation has ${subj.headSha.slice(0, 8)}, current commit is ${currentSubject.headSha.slice(0, 8)}`,
    };
  }
  if (subj.diffSha256 !== currentSubject.diffSha256) {
    return {
      valid: false,
      reason: 'Subject diff SHA-256 mismatch (candidate diff changed since attestation was created)',
    };
  }
  if (subj.repositoryFingerprint !== currentSubject.repositoryFingerprint) {
    return {
      valid: false,
      reason: 'Repository fingerprint mismatch',
    };
  }

  return { valid: true };
}

module.exports = {
  sha256,
  computeScopeSha256,
  computeDiffSha256,
  createVerificationAttestation,
  createReviewAttestation,
  verifyAttestationSubject,
};
