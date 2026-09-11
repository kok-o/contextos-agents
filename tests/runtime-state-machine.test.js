'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  EXECUTION_STATUS,
  VERIFICATION_STATUS,
  REVIEW_STATUS,
  MERGE_STATUS,
  createThreadState,
  transitionThread,
  evaluateMergeReadiness,
  invalidateOnCandidateChange,
} = require('../contextos-mcp/src/runtime/state-machine.cjs');

const {
  sha256,
  computeScopeSha256,
  computeDiffSha256,
  createVerificationAttestation,
  createReviewAttestation,
  verifyAttestationSubject,
} = require('../contextos-mcp/src/runtime/attestations.cjs');

const { ThreadStore } = require('../contextos-mcp/src/runtime/thread-store.cjs');

describe('Milestone 10: Runtime State Machine & Attestations', () => {
  const sampleFingerprint = 'sha256:repo-fingerprint-test';
  const baseSha = 'a1b2c3d4e5f60000000000000000000000000000';
  const headSha = 'f6e5d4c3b2a10000000000000000000000000000';
  const sampleDiff = 'diff --git a/src/index.ts b/src/index.ts\n+console.log("hello");\n';
  const diffSha256 = computeDiffSha256(sampleDiff);
  const writeScope = ['src/index.ts'];
  const scopeSha256 = computeScopeSha256(writeScope);

  describe('1. Independent Lifecycle States (Section 15.1)', () => {
    test('all 4 independent status sets are exported and frozen', () => {
      assert.equal(EXECUTION_STATUS.QUEUED, 'QUEUED');
      assert.equal(EXECUTION_STATUS.SUCCEEDED, 'SUCCEEDED');
      assert.equal(EXECUTION_STATUS.FAILED, 'FAILED');

      assert.equal(VERIFICATION_STATUS.NOT_CONFIGURED, 'NOT_CONFIGURED');
      assert.equal(VERIFICATION_STATUS.PASS, 'PASS');
      assert.equal(VERIFICATION_STATUS.STALE, 'STALE');

      assert.equal(REVIEW_STATUS.NOT_CONFIGURED, 'NOT_CONFIGURED');
      assert.equal(REVIEW_STATUS.PASS, 'PASS');
      assert.equal(REVIEW_STATUS.UNAVAILABLE, 'UNAVAILABLE');

      assert.equal(MERGE_STATUS.NOT_READY, 'NOT_READY');
      assert.equal(MERGE_STATUS.READY, 'READY');
      assert.equal(MERGE_STATUS.MERGED, 'MERGED');
    });

    test('new thread initializes with orthogonal independent states', () => {
      const thread = createThreadState({
        id: 'th-100',
        baseSha,
        repositoryFingerprint: sampleFingerprint,
        config: {
          task: 'Implement authentication',
          testCommand: 'npm test',
          writeScope: ['src/auth.ts'],
        },
      });

      assert.equal(thread.revision, 0);
      assert.equal(thread.execution.status, EXECUTION_STATUS.QUEUED);
      assert.equal(thread.verification.status, VERIFICATION_STATUS.PENDING);
      assert.equal(thread.review.status, REVIEW_STATUS.NOT_CONFIGURED);
      assert.equal(thread.merge.status, MERGE_STATUS.NOT_READY);
      assert.equal(thread.subject.headSha, baseSha);
      assert.ok(Object.isFrozen(thread), 'ThreadState must be immutable');
    });
  });

  describe('2. State Transitions & Concurrency (Section 15.4)', () => {
    test('legal transitions advance revision and update statuses', () => {
      let thread = createThreadState({ id: 'th-legal', baseSha, repositoryFingerprint: sampleFingerprint });

      thread = transitionThread(thread, {
        type: 'EXECUTION_PREPARE',
        payload: { worktreePath: '/tmp/wt-1', branchName: 'agent/task-1' },
      });
      assert.equal(thread.execution.status, EXECUTION_STATUS.PREPARING);
      assert.equal(thread.revision, 1);

      thread = transitionThread(thread, {
        type: 'EXECUTION_START',
        payload: { executionId: 'exec-001' },
      });
      assert.equal(thread.execution.status, EXECUTION_STATUS.RUNNING);
      assert.equal(thread.revision, 2);

      thread = transitionThread(thread, {
        type: 'EXECUTION_SUCCEED',
        payload: { headSha, diffSha256, filesChanged: ['src/index.ts'] },
      });
      assert.equal(thread.execution.status, EXECUTION_STATUS.SUCCEEDED);
      assert.equal(thread.revision, 3);
      assert.equal(thread.subject.headSha, headSha);
    });

    test('illegal transitions throw CTX_ILLEGAL_STATE_TRANSITION', () => {
      const thread = createThreadState({ id: 'th-illegal' });

      // Cannot jump from QUEUED directly to SUCCEEDED
      assert.throws(
        () => transitionThread(thread, { type: 'EXECUTION_SUCCEED' }),
        (err) => err.code === 'CTX_ILLEGAL_STATE_TRANSITION'
      );

      // Cannot jump from QUEUED directly to MERGED
      assert.throws(
        () => transitionThread(thread, { type: 'MERGE_COMPLETE' }),
        (err) => err.code === 'CTX_ILLEGAL_STATE_TRANSITION'
      );
    });

    test('optimistic concurrency rejects mismatched expectedRevision', () => {
      const thread = createThreadState({ id: 'th-concurrency' });

      // Expected revision 0 matches current revision 0 -> succeeds
      const next = transitionThread(thread, {
        type: 'EXECUTION_PREPARE',
        expectedRevision: 0,
      });
      assert.equal(next.revision, 1);

      // Subsequent event passing stale expectedRevision 0 -> rejected
      assert.throws(
        () => transitionThread(next, { type: 'EXECUTION_START', expectedRevision: 0 }),
        (err) => err.code === 'CTX_THREAD_CONCURRENCY_CONFLICT'
      );
    });
  });

  describe('3. Machine-Verifiable Attestations (Section 15.2 & 15.3)', () => {
    test('creates evidence-bearing VerificationAttestation', () => {
      const att = createVerificationAttestation({
        status: VERIFICATION_STATUS.PASS,
        subject: {
          repositoryFingerprint: sampleFingerprint,
          baseSha,
          headSha,
          diffSha256,
          scopeSha256,
        },
        command: { executable: 'npm', args: ['test'], cwd: '.', timeoutMs: 30000 },
        evidence: {
          exitCode: 0,
          signal: null,
          outputSha256: sha256('All 15 tests passed cleanly'),
          redactedPreview: 'PASS: 15/15',
          totalTests: 15,
          passedTests: 15,
          failedTests: 0,
        },
        runnerMode: 'host-unsafe',
      });

      assert.equal(att.schemaVersion, 1);
      assert.equal(att.status, VERIFICATION_STATUS.PASS);
      assert.equal(att.evidence.exitCode, 0);
      assert.ok(att.evidence.outputSha256);
    });

    test('fail-closed: throws if Verification PASS lacks exitCode 0 or outputSha256', () => {
      assert.throws(() => {
        createVerificationAttestation({
          status: VERIFICATION_STATUS.PASS,
          subject: { repositoryFingerprint: sampleFingerprint, baseSha, headSha, diffSha256, scopeSha256 },
          evidence: { exitCode: 1, outputSha256: sha256('err') },
        });
      }, /FAIL_CLOSED/);

      assert.throws(() => {
        createVerificationAttestation({
          status: VERIFICATION_STATUS.PASS,
          subject: { repositoryFingerprint: sampleFingerprint, baseSha, headSha, diffSha256, scopeSha256 },
          evidence: null,
        });
      }, /FAIL_CLOSED/);
    });

    test('creates ReviewAttestation with independence level and verdict', () => {
      const att = createReviewAttestation({
        status: REVIEW_STATUS.PASS,
        subject: {
          repositoryFingerprint: sampleFingerprint,
          baseSha,
          headSha,
          diffSha256,
          scopeSha256,
        },
        implementerExecutionId: 'exec-impl-1',
        reviewerExecutionId: 'exec-rev-2',
        provider: 'google',
        model: 'gemini-2.5-pro',
        independenceLevel: 'separate_process',
        llmVerdict: {
          specCompliance: 'PASS',
          codeQuality: 'PASS',
          summary: 'Verified code meets all criteria with no defects',
        },
      });

      assert.equal(att.status, REVIEW_STATUS.PASS);
      assert.equal(att.independenceLevel, 'separate_process');
      assert.equal(att.llmVerdict.specCompliance, 'PASS');
    });

    test('fail-closed: throws if Review PASS lacks passing llmVerdict', () => {
      assert.throws(() => {
        createReviewAttestation({
          status: REVIEW_STATUS.PASS,
          subject: { repositoryFingerprint: sampleFingerprint, baseSha, headSha, diffSha256, scopeSha256 },
          llmVerdict: { specCompliance: 'FAIL', codeQuality: 'PASS', summary: 'Rejected' },
        });
      }, /FAIL_CLOSED/);
    });
  });

  describe('4. Merge Readiness & Acceptance Criteria (Section 15.5)', () => {
    test('thread with valid execution, scope, verification, and review achieves READY', () => {
      let thread = createThreadState({
        id: 'th-ready',
        baseSha,
        repositoryFingerprint: sampleFingerprint,
        config: {
          task: 'Add utility helper',
          writeScope: ['src/index.ts'],
        },
      });

      // 1. Succeed execution
      thread = transitionThread(thread, {
        type: 'EXECUTION_PREPARE',
      });
      thread = transitionThread(thread, {
        type: 'EXECUTION_START',
        payload: { executionId: 'exec-123' },
      });
      thread = transitionThread(thread, {
        type: 'EXECUTION_SUCCEED',
        payload: { headSha, diffSha256, filesChanged: ['src/index.ts'] },
      });

      // 2. Attach evidence-bearing verification attestation
      const verAtt = createVerificationAttestation({
        status: VERIFICATION_STATUS.PASS,
        subject: {
          repositoryFingerprint: sampleFingerprint,
          baseSha,
          headSha,
          diffSha256,
          scopeSha256,
        },
        evidence: { exitCode: 0, outputSha256: sha256('ok'), redactedPreview: '1 test ok' },
      });
      thread = transitionThread(thread, { type: 'VERIFICATION_CONFIGURED' });
      thread = transitionThread(thread, { type: 'VERIFICATION_START' });
      thread = transitionThread(thread, {
        type: 'VERIFICATION_PASS',
        payload: { attestation: verAtt },
      });

      // 3. Attach review attestation
      const revAtt = createReviewAttestation({
        status: REVIEW_STATUS.PASS,
        subject: {
          repositoryFingerprint: sampleFingerprint,
          baseSha,
          headSha,
          diffSha256,
          scopeSha256,
        },
        llmVerdict: { specCompliance: 'PASS', codeQuality: 'PASS', summary: 'Looks great' },
      });
      thread = transitionThread(thread, { type: 'REVIEW_CONFIGURED' });
      thread = transitionThread(thread, { type: 'REVIEW_START' });
      thread = transitionThread(thread, {
        type: 'REVIEW_PASS',
        payload: { attestation: revAtt },
      });

      // 4. Evaluate merge readiness
      thread = transitionThread(thread, {
        type: 'EVALUATE_MERGE_READINESS',
      });

      assert.equal(thread.merge.status, MERGE_STATUS.READY);
      assert.equal(thread.merge.readiness.isReady, true);
    });

    test('impossible to achieve READY without evidence-bearing PASS (Acceptance)', () => {
      let thread = createThreadState({ id: 'th-unverified', baseSha });
      thread = transitionThread(thread, { type: 'EXECUTION_PREPARE' });
      thread = transitionThread(thread, { type: 'EXECUTION_START' });
      thread = transitionThread(thread, { type: 'EXECUTION_SUCCEED' });

      // Verification remains PENDING
      thread = transitionThread(thread, { type: 'EVALUATE_MERGE_READINESS' });
      assert.equal(thread.merge.status, MERGE_STATUS.NOT_READY);
      assert.equal(thread.merge.readiness.isReady, false);
      assert.ok(thread.merge.readiness.checks.some(c => c.name === 'verification_attestation' && !c.passed));
    });

    test('FAILED execution cannot achieve READY (Acceptance)', () => {
      let thread = createThreadState({ id: 'th-failed', baseSha });
      thread = transitionThread(thread, { type: 'EXECUTION_PREPARE' });
      thread = transitionThread(thread, { type: 'EXECUTION_START' });
      thread = transitionThread(thread, { type: 'EXECUTION_FAIL', payload: { error: 'Syntax error' } });

      thread = transitionThread(thread, { type: 'EVALUATE_MERGE_READINESS' });
      assert.equal(thread.merge.status, MERGE_STATUS.NOT_READY);
      assert.equal(thread.merge.readiness.isReady, false);
    });

    test('blast radius violation blocks merge readiness', () => {
      let thread = createThreadState({
        id: 'th-scope-violation',
        baseSha,
        config: { writeScope: ['src/allowed.ts'] },
      });
      thread = transitionThread(thread, { type: 'EXECUTION_PREPARE' });
      thread = transitionThread(thread, { type: 'EXECUTION_START' });
      // Modified file outside writeScope
      thread = transitionThread(thread, {
        type: 'EXECUTION_SUCCEED',
        payload: { headSha, diffSha256, filesChanged: ['package.json'] },
      });

      const readiness = evaluateMergeReadiness(thread);
      assert.equal(readiness.isReady, false);
      assert.ok(readiness.checks.some(c => c.name === 'scope_boundaries' && !c.passed));
    });

    test('candidate commit change transitions active attestations to STALE', () => {
      const verAtt = createVerificationAttestation({
        status: VERIFICATION_STATUS.PASS,
        subject: { repositoryFingerprint: sampleFingerprint, baseSha, headSha, diffSha256, scopeSha256 },
        evidence: { exitCode: 0, outputSha256: sha256('ok') },
      });

      let thread = createThreadState({ id: 'th-stale', baseSha, repositoryFingerprint: sampleFingerprint });
      thread = transitionThread(thread, { type: 'EXECUTION_PREPARE' });
      thread = transitionThread(thread, { type: 'EXECUTION_START' });
      thread = transitionThread(thread, { type: 'EXECUTION_SUCCEED', payload: { headSha, diffSha256 } });
      thread = transitionThread(thread, { type: 'VERIFICATION_CONFIGURED' });
      thread = transitionThread(thread, { type: 'VERIFICATION_START' });
      thread = transitionThread(thread, { type: 'VERIFICATION_PASS', payload: { attestation: verAtt } });

      assert.equal(thread.verification.status, VERIFICATION_STATUS.PASS);

      // New commit pushed to candidate branch
      const newHeadSha = '0011223344556677889900112233445566778899';
      thread = transitionThread(thread, {
        type: 'CANDIDATE_COMMIT_UPDATE',
        payload: { headSha: newHeadSha },
      });

      assert.equal(thread.verification.status, VERIFICATION_STATUS.STALE);
      assert.equal(thread.verification.attestation.status, VERIFICATION_STATUS.STALE);
      assert.equal(thread.merge.status, MERGE_STATUS.NOT_READY);
    });
  });

  describe('5. Persistent ThreadStore & Audit Logging', () => {
    test('stores threads atomically and logs state transition audit trail', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-thread-test-'));
      try {
        const store = new ThreadStore({ baseDir: tmpDir });

        const created = store.create({
          id: 'th-audit-test',
          task: 'Refactor database migration',
        });
        assert.equal(created.id, 'th-audit-test');

        const step1 = store.transition('th-audit-test', {
          type: 'EXECUTION_PREPARE',
          payload: { worktreePath: '/tmp/wt-audit' },
        });
        assert.equal(step1.execution.status, EXECUTION_STATUS.PREPARING);

        const step2 = store.transition('th-audit-test', {
          type: 'EXECUTION_START',
          payload: { executionId: 'exec-audit' },
        });
        assert.equal(step2.execution.status, EXECUTION_STATUS.RUNNING);

        // Verify retrieval from disk
        const loaded = store.get('th-audit-test');
        assert.equal(loaded.execution.status, EXECUTION_STATUS.RUNNING);
        assert.equal(loaded.revision, 2);

        // Verify audit trail
        const trail = store.getAuditTrail('th-audit-test');
        assert.equal(trail.length, 2);
        assert.equal(trail[0].eventType, 'EXECUTION_PREPARE');
        assert.equal(trail[0].fromStates.execution, EXECUTION_STATUS.QUEUED);
        assert.equal(trail[0].toStates.execution, EXECUTION_STATUS.PREPARING);
        assert.equal(trail[1].eventType, 'EXECUTION_START');

        // Verify listing
        const list = store.list();
        assert.equal(list.length, 1);
        assert.equal(list[0].id, 'th-audit-test');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
