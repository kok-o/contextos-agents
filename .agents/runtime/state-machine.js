/**
 * .agents/runtime/state-machine.js
 * ContextOS — Independent Runtime State Machine & Transition Engine
 *
 * Implements Section 15 of CONTEXTOS_IMPLEMENTATION_PLAN.md:
 *   - 4 independent orthogonal lifecycle statuses (Execution, Verification, Review, Merge)
 *   - Immutable state transitions with optimistic concurrency control (expectedRevision)
 *   - Formal transition matrices prohibiting illegal skips (e.g. FAILED -> READY is impossible)
 *   - Automatic candidate commit drift invalidation (transitions active attestations to STALE)
 *   - Fail-closed Merge Readiness evaluation (requires evidence-bearing verification & review)
 *   - Structured append-only audit trail logging
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  sha256,
  computeScopeSha256,
  computeDiffSha256,
  verifyAttestationSubject,
} = require('./attestations.js');

// ── Status Enums (Section 15.1) ──────────────────────────────────────────────

const EXECUTION_STATUS = Object.freeze({
  QUEUED: 'QUEUED',
  PREPARING: 'PREPARING',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  TIMED_OUT: 'TIMED_OUT',
  CANCELLED: 'CANCELLED',
  INTERRUPTED: 'INTERRUPTED',
});

const VERIFICATION_STATUS = Object.freeze({
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  PASS: 'PASS',
  FAIL: 'FAIL',
  ERROR: 'ERROR',
  TIMEOUT: 'TIMEOUT',
  STALE: 'STALE',
});

const REVIEW_STATUS = Object.freeze({
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  PASS: 'PASS',
  FAIL: 'FAIL',
  ERROR: 'ERROR',
  TIMEOUT: 'TIMEOUT',
  UNAVAILABLE: 'UNAVAILABLE',
  MALFORMED: 'MALFORMED',
  STALE: 'STALE',
});

const MERGE_STATUS = Object.freeze({
  NOT_READY: 'NOT_READY',
  READY: 'READY',
  MERGING: 'MERGING',
  MERGED: 'MERGED',
  BLOCKED: 'BLOCKED',
  CONFLICT: 'CONFLICT',
  STALE_BASE: 'STALE_BASE',
  ERROR: 'ERROR',
});

// ── Legal Transition Matrices ───────────────────────────────────────────────

const LEGAL_EXECUTION_TRANSITIONS = {
  [EXECUTION_STATUS.QUEUED]: [
    EXECUTION_STATUS.PREPARING,
    EXECUTION_STATUS.CANCELLED,
    EXECUTION_STATUS.INTERRUPTED,
  ],
  [EXECUTION_STATUS.PREPARING]: [
    EXECUTION_STATUS.RUNNING,
    EXECUTION_STATUS.FAILED,
    EXECUTION_STATUS.CANCELLED,
    EXECUTION_STATUS.INTERRUPTED,
  ],
  [EXECUTION_STATUS.RUNNING]: [
    EXECUTION_STATUS.SUCCEEDED,
    EXECUTION_STATUS.FAILED,
    EXECUTION_STATUS.TIMED_OUT,
    EXECUTION_STATUS.CANCELLED,
    EXECUTION_STATUS.INTERRUPTED,
  ],
  // Terminal states (unless explicit retry re-queues)
  [EXECUTION_STATUS.SUCCEEDED]: [],
  [EXECUTION_STATUS.FAILED]: [EXECUTION_STATUS.QUEUED], // explicit retry
  [EXECUTION_STATUS.TIMED_OUT]: [EXECUTION_STATUS.QUEUED],
  [EXECUTION_STATUS.CANCELLED]: [],
  [EXECUTION_STATUS.INTERRUPTED]: [EXECUTION_STATUS.QUEUED],
};

const LEGAL_VERIFICATION_TRANSITIONS = {
  [VERIFICATION_STATUS.NOT_CONFIGURED]: [
    VERIFICATION_STATUS.PENDING,
    VERIFICATION_STATUS.NOT_APPLICABLE,
  ],
  [VERIFICATION_STATUS.NOT_APPLICABLE]: [
    VERIFICATION_STATUS.PENDING,
  ],
  [VERIFICATION_STATUS.PENDING]: [
    VERIFICATION_STATUS.RUNNING,
    VERIFICATION_STATUS.NOT_APPLICABLE,
    VERIFICATION_STATUS.STALE,
  ],
  [VERIFICATION_STATUS.RUNNING]: [
    VERIFICATION_STATUS.PASS,
    VERIFICATION_STATUS.FAIL,
    VERIFICATION_STATUS.ERROR,
    VERIFICATION_STATUS.TIMEOUT,
    VERIFICATION_STATUS.STALE,
  ],
  [VERIFICATION_STATUS.PASS]: [
    VERIFICATION_STATUS.STALE,
    VERIFICATION_STATUS.PENDING, // re-verification
  ],
  [VERIFICATION_STATUS.FAIL]: [
    VERIFICATION_STATUS.PENDING,
    VERIFICATION_STATUS.STALE,
  ],
  [VERIFICATION_STATUS.ERROR]: [
    VERIFICATION_STATUS.PENDING,
    VERIFICATION_STATUS.STALE,
  ],
  [VERIFICATION_STATUS.TIMEOUT]: [
    VERIFICATION_STATUS.PENDING,
    VERIFICATION_STATUS.STALE,
  ],
  [VERIFICATION_STATUS.STALE]: [
    VERIFICATION_STATUS.PENDING,
    VERIFICATION_STATUS.RUNNING,
  ],
};

const LEGAL_REVIEW_TRANSITIONS = {
  [REVIEW_STATUS.NOT_CONFIGURED]: [
    REVIEW_STATUS.PENDING,
  ],
  [REVIEW_STATUS.PENDING]: [
    REVIEW_STATUS.RUNNING,
    REVIEW_STATUS.STALE,
  ],
  [REVIEW_STATUS.RUNNING]: [
    REVIEW_STATUS.PASS,
    REVIEW_STATUS.FAIL,
    REVIEW_STATUS.ERROR,
    REVIEW_STATUS.TIMEOUT,
    REVIEW_STATUS.UNAVAILABLE,
    REVIEW_STATUS.MALFORMED,
    REVIEW_STATUS.STALE,
  ],
  [REVIEW_STATUS.PASS]: [
    REVIEW_STATUS.STALE,
    REVIEW_STATUS.PENDING,
  ],
  [REVIEW_STATUS.FAIL]: [
    REVIEW_STATUS.PENDING,
    REVIEW_STATUS.STALE,
  ],
  [REVIEW_STATUS.ERROR]: [
    REVIEW_STATUS.PENDING,
    REVIEW_STATUS.STALE,
  ],
  [REVIEW_STATUS.TIMEOUT]: [
    REVIEW_STATUS.PENDING,
    REVIEW_STATUS.STALE,
  ],
  [REVIEW_STATUS.UNAVAILABLE]: [
    REVIEW_STATUS.PENDING,
    REVIEW_STATUS.STALE,
  ],
  [REVIEW_STATUS.MALFORMED]: [
    REVIEW_STATUS.PENDING,
    REVIEW_STATUS.STALE,
  ],
  [REVIEW_STATUS.STALE]: [
    REVIEW_STATUS.PENDING,
    REVIEW_STATUS.RUNNING,
  ],
};

const LEGAL_MERGE_TRANSITIONS = {
  [MERGE_STATUS.NOT_READY]: [
    MERGE_STATUS.READY,
    MERGE_STATUS.BLOCKED,
    MERGE_STATUS.CONFLICT,
    MERGE_STATUS.STALE_BASE,
  ],
  [MERGE_STATUS.READY]: [
    MERGE_STATUS.MERGING,
    MERGE_STATUS.NOT_READY,
    MERGE_STATUS.BLOCKED,
    MERGE_STATUS.STALE_BASE,
  ],
  [MERGE_STATUS.MERGING]: [
    MERGE_STATUS.MERGED,
    MERGE_STATUS.CONFLICT,
    MERGE_STATUS.ERROR,
    MERGE_STATUS.BLOCKED,
  ],
  [MERGE_STATUS.MERGED]: [],
  [MERGE_STATUS.BLOCKED]: [
    MERGE_STATUS.NOT_READY,
    MERGE_STATUS.READY,
  ],
  [MERGE_STATUS.CONFLICT]: [
    MERGE_STATUS.NOT_READY,
  ],
  [MERGE_STATUS.STALE_BASE]: [
    MERGE_STATUS.NOT_READY,
  ],
  [MERGE_STATUS.ERROR]: [
    MERGE_STATUS.NOT_READY,
  ],
};

// ── Thread Initializer ───────────────────────────────────────────────────────

/**
 * Creates a brand new immutable ThreadState object.
 */
function createThreadState(options = {}) {
  const now = Date.now();
  const id = options.id || `th-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const config = options.config || { task: options.task || 'Autonomous coding task' };
  const baseSha = options.baseSha || '0000000000000000000000000000000000000000';
  const repoFingerprint = options.repositoryFingerprint || sha256(process.cwd());

  const thread = {
    schemaVersion: 1,
    id,
    revision: 0,
    config: {
      task: config.task,
      objective: config.objective || config.task,
      writeScope: config.writeScope || [],
      testCommand: config.testCommand || '',
      agent: config.agent || 'gemini',
      model: config.model || 'gemini-2.5-pro',
      targetBase: config.targetBase || 'main',
      requiredSandbox: config.requiredSandbox || 'none',
    },
    execution: {
      status: EXECUTION_STATUS.QUEUED,
      startedAt: null,
      completedAt: null,
      attempt: 1,
      maxAttempts: config.maxAttempts || 3,
      error: null,
      executionId: null,
      worktreePath: null,
      branchName: null,
    },
    verification: {
      status: config.testCommand ? VERIFICATION_STATUS.PENDING : VERIFICATION_STATUS.NOT_CONFIGURED,
      attestation: null,
      reason: null,
      updatedAt: now,
    },
    review: {
      status: REVIEW_STATUS.NOT_CONFIGURED,
      attestation: null,
      reason: null,
      updatedAt: now,
    },
    merge: {
      status: MERGE_STATUS.NOT_READY,
      readiness: {
        isReady: false,
        checks: [],
        evaluatedAt: now,
      },
      mergedAt: null,
      targetBranch: config.targetBase || 'main',
      mergeCommitSha: null,
      error: null,
    },
    subject: {
      repositoryFingerprint: repoFingerprint,
      baseSha,
      headSha: baseSha,
      diffSha256: sha256(''),
      scopeSha256: computeScopeSha256(config.writeScope || []),
      filesChanged: [],
    },
    createdAt: now,
    updatedAt: now,
  };

  return Object.freeze(thread);
}

// ── Merge Readiness Evaluator (Section 15.5) ────────────────────────────────

/**
 * Strictly evaluates whether a thread is eligible for automated merge into target base.
 * Fail-closed: requires affirmative, evidence-bearing proof across all gates.
 *
 * @param {Object} thread - Current ThreadState
 * @param {Object} [options] - Evaluation options (current repo state)
 * @returns {{ isReady: boolean, checks: Array<{ name: string, passed: boolean, message: string, code?: string }> }}
 */
function evaluateMergeReadiness(thread, options = {}) {
  const checks = [];
  const evaluatedAt = Date.now();

  if (!thread) {
    return {
      isReady: false,
      checks: [{ name: 'thread_exists', passed: false, message: 'Thread does not exist', code: 'CTX_MERGE_NO_THREAD' }],
      evaluatedAt,
    };
  }

  // Gate 1: Execution must be SUCCEEDED
  const execPassed = thread.execution?.status === EXECUTION_STATUS.SUCCEEDED;
  checks.push({
    name: 'execution_status',
    passed: execPassed,
    message: execPassed
      ? `Execution SUCCEEDED (id: ${thread.execution.executionId || 'unknown'})`
      : `Execution is ${thread.execution?.status || 'UNKNOWN'}, must be SUCCEEDED`,
    code: execPassed ? 'OK' : 'CTX_MERGE_EXECUTION_NOT_SUCCEEDED',
  });

  // Gate 2: Scope check (no out-of-scope files modified)
  const allowedScope = thread.config?.writeScope || [];
  const filesChanged = thread.subject?.filesChanged || [];
  let scopePassed = true;
  let scopeViolationFile = null;

  if (allowedScope.length > 0 && filesChanged.length > 0) {
    for (const f of filesChanged) {
      const normalized = f.replace(/\\/g, '/');
      const inScope = allowedScope.some(scopePath => {
        const normScope = scopePath.replace(/\\/g, '/');
        return normalized === normScope || normalized.startsWith(normScope.endsWith('/') ? normScope : normScope + '/');
      });
      if (!inScope) {
        scopePassed = false;
        scopeViolationFile = f;
        break;
      }
    }
  }

  checks.push({
    name: 'scope_boundaries',
    passed: scopePassed,
    message: scopePassed
      ? 'All modified files strictly within planned write scope'
      : `Blast radius violation: modified file "${scopeViolationFile}" is outside writeScope`,
    code: scopePassed ? 'OK' : 'CTX_MERGE_SCOPE_VIOLATION',
  });

  // Gate 3: Evidence-bearing Verification Attestation
  const verAtt = thread.verification?.attestation;
  const verStatus = thread.verification?.status;
  let verPassed = false;
  let verReason = '';

  if (verStatus !== VERIFICATION_STATUS.PASS) {
    verReason = `Verification status is ${verStatus}, expected PASS`;
  } else if (!verAtt || !verAtt.evidence) {
    verReason = 'FAIL_CLOSED: Verification marked PASS but lacks verifiable evidence (LEGACY_UNVERIFIED)';
  } else if (verAtt.status === VERIFICATION_STATUS.STALE) {
    verReason = 'Verification attestation is STALE (candidate commit changed)';
  } else if (verAtt.evidence.exitCode !== 0) {
    verReason = `Verification evidence recorded non-zero exit code: ${verAtt.evidence.exitCode}`;
  } else {
    // Subject integrity check
    const subjCheck = verifyAttestationSubject(verAtt, thread.subject);
    if (!subjCheck.valid) {
      verReason = `Verification attestation subject mismatch: ${subjCheck.reason}`;
    } else {
      verPassed = true;
      verReason = `Verification PASS verified with exitCode: 0, outputSha: ${verAtt.evidence.outputSha256.slice(0, 10)}`;
    }
  }

  checks.push({
    name: 'verification_attestation',
    passed: verPassed,
    message: verReason,
    code: verPassed ? 'OK' : 'CTX_MERGE_VERIFICATION_FAILED',
  });

  // Gate 4: Review Attestation
  const revAtt = thread.review?.attestation;
  const revStatus = thread.review?.status;
  let revPassed = false;
  let revReason = '';

  // If review is configured, it must PASS with an attestation
  if (revStatus === REVIEW_STATUS.NOT_CONFIGURED) {
    // If not configured, check whether high-risk requires review
    const requiresReview = thread.config?.requiresReview === true || (thread.config?.riskLevel === 'high');
    if (requiresReview) {
      revReason = 'Review is NOT_CONFIGURED but required by task risk level';
      revPassed = false;
    } else {
      revPassed = true;
      revReason = 'Review is NOT_CONFIGURED (task risk allows single-agent verify)';
    }
  } else if (revStatus !== REVIEW_STATUS.PASS) {
    revReason = `Review status is ${revStatus}, expected PASS`;
  } else if (!revAtt) {
    revReason = 'Review marked PASS but lacks ReviewAttestation';
  } else if (revAtt.status === REVIEW_STATUS.STALE) {
    revReason = 'Review attestation is STALE (candidate commit changed)';
  } else {
    const subjCheck = verifyAttestationSubject(revAtt, thread.subject);
    if (!subjCheck.valid) {
      revReason = `Review attestation subject mismatch: ${subjCheck.reason}`;
    } else if (!revAtt.llmVerdict || revAtt.llmVerdict.specCompliance !== 'PASS' || revAtt.llmVerdict.codeQuality !== 'PASS') {
      revReason = 'Review verdict does not confirm PASS for spec compliance and code quality';
    } else {
      revPassed = true;
      revReason = `Review PASS confirmed by reviewer ${revAtt.reviewerExecutionId} (${revAtt.model})`;
    }
  }

  checks.push({
    name: 'review_attestation',
    passed: revPassed,
    message: revReason,
    code: revPassed ? 'OK' : 'CTX_MERGE_REVIEW_FAILED',
  });

  // Gate 5: Sandbox level validation
  const requiredSandbox = thread.config?.requiredSandbox || 'none';
  let sandboxPassed = true;
  let sandboxReason = 'Sandbox level satisfies execution requirement';

  if (requiredSandbox === 'oci' || requiredSandbox === 'strict-sandbox') {
    if (verAtt && verAtt.runnerMode !== 'oci') {
      sandboxPassed = false;
      sandboxReason = `Required sandbox is ${requiredSandbox}, but verification ran in ${verAtt.runnerMode}`;
    }
  }

  checks.push({
    name: 'sandbox_conformance',
    passed: sandboxPassed,
    message: sandboxReason,
    code: sandboxPassed ? 'OK' : 'CTX_MERGE_SANDBOX_VIOLATION',
  });

  // Gate 6: Candidate Commit & Target Base Consistency
  const currentBaseSha = options.currentBaseSha || thread.subject.baseSha;
  let basePassed = true;
  let baseReason = 'Target base SHA matches thread base SHA';

  if (currentBaseSha && currentBaseSha !== thread.subject.baseSha) {
    basePassed = false;
    baseReason = `Stale base detected: target base advanced to ${currentBaseSha.slice(0, 8)}, thread based on ${thread.subject.baseSha.slice(0, 8)}`;
  }

  checks.push({
    name: 'base_commitment',
    passed: basePassed,
    message: baseReason,
    code: basePassed ? 'OK' : 'CTX_MERGE_STALE_BASE',
  });

  // Gate 7: Unresolved Error Boundary
  const noErrors = !thread.execution.error && !thread.merge.error;
  checks.push({
    name: 'clean_error_boundary',
    passed: noErrors,
    message: noErrors
      ? 'Zero unresolved exceptions or fatal error markers'
      : `Unresolved error: ${thread.execution.error || thread.merge.error}`,
    code: noErrors ? 'OK' : 'CTX_MERGE_UNRESOLVED_ERROR',
  });

  const isReady = checks.every(c => c.passed);
  return {
    isReady,
    checks,
    evaluatedAt,
  };
}

// ── Stale Invalidation Helper ───────────────────────────────────────────────

/**
 * Detects whether new candidate commits or diff modifications invalidate
 * active verification and review attestations, marking them STALE.
 *
 * @param {Object} thread
 * @param {Object} newSubject - { headSha, diffSha256, filesChanged }
 * @returns {Object} Updated ThreadState if modified, or original
 */
function invalidateOnCandidateChange(thread, newSubject = {}) {
  const newHead = newSubject.headSha || thread.subject.headSha;
  const newDiff = newSubject.diffSha256 || thread.subject.diffSha256;

  const isHeadChanged = newHead !== thread.subject.headSha;
  const isDiffChanged = newDiff !== thread.subject.diffSha256;

  if (!isHeadChanged && !isDiffChanged) {
    return thread;
  }

  const now = Date.now();
  const nextVerification = { ...thread.verification };
  if (nextVerification.status === VERIFICATION_STATUS.PASS || nextVerification.status === VERIFICATION_STATUS.RUNNING) {
    nextVerification.status = VERIFICATION_STATUS.STALE;
    nextVerification.reason = 'Candidate commit or diff changed; previous verification attestation invalidated';
    nextVerification.updatedAt = now;
    if (nextVerification.attestation) {
      nextVerification.attestation = { ...nextVerification.attestation, status: VERIFICATION_STATUS.STALE };
    }
  }

  const nextReview = { ...thread.review };
  if (nextReview.status === REVIEW_STATUS.PASS || nextReview.status === REVIEW_STATUS.RUNNING) {
    nextReview.status = REVIEW_STATUS.STALE;
    nextReview.reason = 'Candidate commit or diff changed; previous review attestation invalidated';
    nextReview.updatedAt = now;
    if (nextReview.attestation) {
      nextReview.attestation = { ...nextReview.attestation, status: REVIEW_STATUS.STALE };
    }
  }

  const nextSubject = {
    ...thread.subject,
    headSha: newHead,
    diffSha256: newDiff,
    filesChanged: newSubject.filesChanged || thread.subject.filesChanged,
  };

  const nextMerge = { ...thread.merge, status: MERGE_STATUS.NOT_READY };

  const updatedThread = {
    ...thread,
    revision: thread.revision + 1,
    verification: nextVerification,
    review: nextReview,
    merge: nextMerge,
    subject: nextSubject,
    updatedAt: now,
  };

  return Object.freeze(updatedThread);
}

// ── State Transition Engine (Section 15.4) ──────────────────────────────────

/**
 * Transitions a thread state strictly according to the legal transition matrices.
 * Direct mutation (thread.status = ...) is forbidden.
 *
 * @param {Object} thread - Current immutable ThreadState
 * @param {Object} event - Event object: { type, payload, expectedRevision }
 * @param {Object} [options] - Options like auditFilePath
 * @returns {Object} Immutable next ThreadState
 */
function transitionThread(thread, event = {}, options = {}) {
  if (!thread) {
    throw new Error('transitionThread requires a current thread state');
  }
  if (!event.type) {
    throw new Error('transitionThread requires an event with a type');
  }

  // 1. Optimistic Concurrency Check
  if (typeof event.expectedRevision === 'number' && event.expectedRevision !== thread.revision) {
    const err = new Error(
      `Optimistic concurrency conflict for thread ${thread.id}: expected revision ${event.expectedRevision}, but current revision is ${thread.revision}`
    );
    err.code = 'CTX_THREAD_CONCURRENCY_CONFLICT';
    err.threadId = thread.id;
    err.expectedRevision = event.expectedRevision;
    err.currentRevision = thread.revision;
    throw err;
  }

  const now = Date.now();
  const nextThread = {
    ...thread,
    config: { ...thread.config },
    execution: { ...thread.execution },
    verification: { ...thread.verification },
    review: { ...thread.review },
    merge: { ...thread.merge },
    subject: { ...thread.subject },
    revision: thread.revision + 1,
    updatedAt: now,
  };

  const payload = event.payload || {};

  // 2. Dispatch Event Type
  switch (event.type) {
    // ── Execution Events ──
    case 'EXECUTION_PREPARE': {
      _assertLegalTransition('execution', thread.execution.status, EXECUTION_STATUS.PREPARING, LEGAL_EXECUTION_TRANSITIONS);
      nextThread.execution.status = EXECUTION_STATUS.PREPARING;
      nextThread.execution.startedAt = now;
      if (payload.worktreePath) nextThread.execution.worktreePath = payload.worktreePath;
      if (payload.branchName) nextThread.execution.branchName = payload.branchName;
      break;
    }

    case 'EXECUTION_START': {
      _assertLegalTransition('execution', thread.execution.status, EXECUTION_STATUS.RUNNING, LEGAL_EXECUTION_TRANSITIONS);
      nextThread.execution.status = EXECUTION_STATUS.RUNNING;
      if (payload.executionId) nextThread.execution.executionId = payload.executionId;
      break;
    }

    case 'EXECUTION_SUCCEED': {
      _assertLegalTransition('execution', thread.execution.status, EXECUTION_STATUS.SUCCEEDED, LEGAL_EXECUTION_TRANSITIONS);
      nextThread.execution.status = EXECUTION_STATUS.SUCCEEDED;
      nextThread.execution.completedAt = now;
      if (payload.headSha) nextThread.subject.headSha = payload.headSha;
      if (payload.diffSha256) nextThread.subject.diffSha256 = payload.diffSha256;
      if (payload.filesChanged) nextThread.subject.filesChanged = payload.filesChanged;
      break;
    }

    case 'EXECUTION_FAIL': {
      _assertLegalTransition('execution', thread.execution.status, EXECUTION_STATUS.FAILED, LEGAL_EXECUTION_TRANSITIONS);
      nextThread.execution.status = EXECUTION_STATUS.FAILED;
      nextThread.execution.completedAt = now;
      nextThread.execution.error = payload.error || 'Execution failed';
      // Failed execution can never remain in READY merge status
      nextThread.merge.status = MERGE_STATUS.NOT_READY;
      break;
    }

    case 'EXECUTION_TIMEOUT': {
      _assertLegalTransition('execution', thread.execution.status, EXECUTION_STATUS.TIMED_OUT, LEGAL_EXECUTION_TRANSITIONS);
      nextThread.execution.status = EXECUTION_STATUS.TIMED_OUT;
      nextThread.execution.completedAt = now;
      nextThread.execution.error = payload.error || 'Execution timed out';
      nextThread.merge.status = MERGE_STATUS.NOT_READY;
      break;
    }

    case 'EXECUTION_CANCEL': {
      _assertLegalTransition('execution', thread.execution.status, EXECUTION_STATUS.CANCELLED, LEGAL_EXECUTION_TRANSITIONS);
      nextThread.execution.status = EXECUTION_STATUS.CANCELLED;
      nextThread.execution.completedAt = now;
      nextThread.merge.status = MERGE_STATUS.NOT_READY;
      break;
    }

    case 'EXECUTION_INTERRUPT': {
      _assertLegalTransition('execution', thread.execution.status, EXECUTION_STATUS.INTERRUPTED, LEGAL_EXECUTION_TRANSITIONS);
      nextThread.execution.status = EXECUTION_STATUS.INTERRUPTED;
      nextThread.execution.completedAt = now;
      nextThread.merge.status = MERGE_STATUS.NOT_READY;
      break;
    }

    case 'EXECUTION_RETRY': {
      _assertLegalTransition('execution', thread.execution.status, EXECUTION_STATUS.QUEUED, LEGAL_EXECUTION_TRANSITIONS);
      nextThread.execution.status = EXECUTION_STATUS.QUEUED;
      nextThread.execution.attempt += 1;
      nextThread.execution.error = null;
      nextThread.execution.startedAt = null;
      nextThread.execution.completedAt = null;
      break;
    }

    // ── Verification Events ──
    case 'VERIFICATION_CONFIGURED': {
      _assertLegalTransition('verification', thread.verification.status, VERIFICATION_STATUS.PENDING, LEGAL_VERIFICATION_TRANSITIONS);
      nextThread.verification.status = VERIFICATION_STATUS.PENDING;
      nextThread.verification.updatedAt = now;
      break;
    }

    case 'VERIFICATION_START': {
      _assertLegalTransition('verification', thread.verification.status, VERIFICATION_STATUS.RUNNING, LEGAL_VERIFICATION_TRANSITIONS);
      nextThread.verification.status = VERIFICATION_STATUS.RUNNING;
      nextThread.verification.updatedAt = now;
      break;
    }

    case 'VERIFICATION_PASS': {
      _assertLegalTransition('verification', thread.verification.status, VERIFICATION_STATUS.PASS, LEGAL_VERIFICATION_TRANSITIONS);
      if (!payload.attestation) {
        throw new Error('FAIL_CLOSED: VERIFICATION_PASS event requires an evidence-bearing attestation');
      }
      nextThread.verification.status = VERIFICATION_STATUS.PASS;
      nextThread.verification.attestation = payload.attestation;
      nextThread.verification.updatedAt = now;
      break;
    }

    case 'VERIFICATION_FAIL': {
      _assertLegalTransition('verification', thread.verification.status, VERIFICATION_STATUS.FAIL, LEGAL_VERIFICATION_TRANSITIONS);
      nextThread.verification.status = VERIFICATION_STATUS.FAIL;
      nextThread.verification.attestation = payload.attestation || null;
      nextThread.verification.reason = payload.reason || 'Tests failed';
      nextThread.verification.updatedAt = now;
      nextThread.merge.status = MERGE_STATUS.NOT_READY;
      break;
    }

    case 'VERIFICATION_ERROR': {
      _assertLegalTransition('verification', thread.verification.status, VERIFICATION_STATUS.ERROR, LEGAL_VERIFICATION_TRANSITIONS);
      nextThread.verification.status = VERIFICATION_STATUS.ERROR;
      nextThread.verification.reason = payload.reason || 'Verification process error';
      nextThread.verification.updatedAt = now;
      nextThread.merge.status = MERGE_STATUS.NOT_READY;
      break;
    }

    case 'VERIFICATION_TIMEOUT': {
      _assertLegalTransition('verification', thread.verification.status, VERIFICATION_STATUS.TIMEOUT, LEGAL_VERIFICATION_TRANSITIONS);
      nextThread.verification.status = VERIFICATION_STATUS.TIMEOUT;
      nextThread.verification.reason = 'Verification runner timed out';
      nextThread.verification.updatedAt = now;
      nextThread.merge.status = MERGE_STATUS.NOT_READY;
      break;
    }

    // ── Review Events ──
    case 'REVIEW_CONFIGURED': {
      _assertLegalTransition('review', thread.review.status, REVIEW_STATUS.PENDING, LEGAL_REVIEW_TRANSITIONS);
      nextThread.review.status = REVIEW_STATUS.PENDING;
      nextThread.review.updatedAt = now;
      break;
    }

    case 'REVIEW_START': {
      _assertLegalTransition('review', thread.review.status, REVIEW_STATUS.RUNNING, LEGAL_REVIEW_TRANSITIONS);
      nextThread.review.status = REVIEW_STATUS.RUNNING;
      nextThread.review.updatedAt = now;
      break;
    }

    case 'REVIEW_PASS': {
      _assertLegalTransition('review', thread.review.status, REVIEW_STATUS.PASS, LEGAL_REVIEW_TRANSITIONS);
      if (!payload.attestation) {
        throw new Error('FAIL_CLOSED: REVIEW_PASS event requires ReviewAttestation');
      }
      nextThread.review.status = REVIEW_STATUS.PASS;
      nextThread.review.attestation = payload.attestation;
      nextThread.review.updatedAt = now;
      break;
    }

    case 'REVIEW_FAIL': {
      _assertLegalTransition('review', thread.review.status, REVIEW_STATUS.FAIL, LEGAL_REVIEW_TRANSITIONS);
      nextThread.review.status = REVIEW_STATUS.FAIL;
      nextThread.review.attestation = payload.attestation || null;
      nextThread.review.reason = payload.reason || 'Review rejected changes';
      nextThread.review.updatedAt = now;
      nextThread.merge.status = MERGE_STATUS.NOT_READY;
      break;
    }

    case 'REVIEW_UNAVAILABLE': {
      _assertLegalTransition('review', thread.review.status, REVIEW_STATUS.UNAVAILABLE, LEGAL_REVIEW_TRANSITIONS);
      nextThread.review.status = REVIEW_STATUS.UNAVAILABLE;
      nextThread.review.reason = payload.reason || 'Reviewer model/provider unavailable';
      nextThread.review.updatedAt = now;
      nextThread.merge.status = MERGE_STATUS.NOT_READY;
      break;
    }

    case 'REVIEW_MALFORMED': {
      _assertLegalTransition('review', thread.review.status, REVIEW_STATUS.MALFORMED, LEGAL_REVIEW_TRANSITIONS);
      nextThread.review.status = REVIEW_STATUS.MALFORMED;
      nextThread.review.reason = payload.reason || 'Reviewer output was malformed';
      nextThread.review.updatedAt = now;
      nextThread.merge.status = MERGE_STATUS.NOT_READY;
      break;
    }

    // ── Merge Events ──
    case 'EVALUATE_MERGE_READINESS': {
      const readiness = evaluateMergeReadiness(nextThread, payload.options);
      nextThread.merge.readiness = readiness;
      if (readiness.isReady) {
        _assertLegalTransition('merge', thread.merge.status, MERGE_STATUS.READY, LEGAL_MERGE_TRANSITIONS);
        nextThread.merge.status = MERGE_STATUS.READY;
      } else {
        nextThread.merge.status = MERGE_STATUS.NOT_READY;
      }
      break;
    }

    case 'MERGE_START': {
      _assertLegalTransition('merge', thread.merge.status, MERGE_STATUS.MERGING, LEGAL_MERGE_TRANSITIONS);
      nextThread.merge.status = MERGE_STATUS.MERGING;
      break;
    }

    case 'MERGE_COMPLETE': {
      _assertLegalTransition('merge', thread.merge.status, MERGE_STATUS.MERGED, LEGAL_MERGE_TRANSITIONS);
      nextThread.merge.status = MERGE_STATUS.MERGED;
      nextThread.merge.mergedAt = now;
      if (payload.mergeCommitSha) nextThread.merge.mergeCommitSha = payload.mergeCommitSha;
      break;
    }

    case 'MERGE_CONFLICT': {
      _assertLegalTransition('merge', thread.merge.status, MERGE_STATUS.CONFLICT, LEGAL_MERGE_TRANSITIONS);
      nextThread.merge.status = MERGE_STATUS.CONFLICT;
      nextThread.merge.error = payload.error || 'Git merge conflict encountered';
      break;
    }

    case 'MERGE_BLOCK': {
      _assertLegalTransition('merge', thread.merge.status, MERGE_STATUS.BLOCKED, LEGAL_MERGE_TRANSITIONS);
      nextThread.merge.status = MERGE_STATUS.BLOCKED;
      nextThread.merge.error = payload.reason || 'Merge blocked by policy';
      break;
    }

    // ── Candidate Commit Drift Event ──
    case 'CANDIDATE_COMMIT_UPDATE': {
      return invalidateOnCandidateChange(thread, payload);
    }

    default:
      throw new Error(`Unknown state transition event type: "${event.type}"`);
  }

  // 3. Write Immutable Audit Trail Event
  const auditEvent = {
    timestamp: now,
    threadId: thread.id,
    fromRevision: thread.revision,
    toRevision: nextThread.revision,
    eventType: event.type,
    fromStates: {
      execution: thread.execution.status,
      verification: thread.verification.status,
      review: thread.review.status,
      merge: thread.merge.status,
    },
    toStates: {
      execution: nextThread.execution.status,
      verification: nextThread.verification.status,
      review: nextThread.review.status,
      merge: nextThread.merge.status,
    },
    payload,
  };

  if (options.auditFilePath) {
    try {
      fs.mkdirSync(path.dirname(options.auditFilePath), { recursive: true });
      fs.appendFileSync(options.auditFilePath, JSON.stringify(auditEvent) + '\n');
    } catch {
      // ignore
    }
  }

  return Object.freeze(nextThread);
}

/**
 * Validates that fromStatus -> toStatus is legal in transition table.
 */
function _assertLegalTransition(facet, fromStatus, toStatus, legalTable) {
  if (fromStatus === toStatus) return; // idempotent

  const allowed = legalTable[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    const err = new Error(
      `Illegal ${facet} state transition: cannot transition from ${fromStatus} to ${toStatus}`
    );
    err.code = 'CTX_ILLEGAL_STATE_TRANSITION';
    err.facet = facet;
    err.fromStatus = fromStatus;
    err.toStatus = toStatus;
    throw err;
  }
}

module.exports = {
  EXECUTION_STATUS,
  VERIFICATION_STATUS,
  REVIEW_STATUS,
  MERGE_STATUS,
  createThreadState,
  transitionThread,
  evaluateMergeReadiness,
  invalidateOnCandidateChange,
};
