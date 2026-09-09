'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  parseVerificationSpec,
  validateCommandTrust,
  getSanitizedEnvironment,
  redactSensitiveOutput,
  executeVerification,
} = require('../.agents/runtime/verification-pipeline.js');

const {
  runStaticReviewChecks,
  parseReviewVerdict,
  evaluateReview,
} = require('../.agents/runtime/reviewer-pipeline.js');

const {
  sha256,
  computeScopeSha256,
  computeDiffSha256,
} = require('../.agents/runtime/attestations.js');

describe('Milestone 11: Verification & Reviewer Pipeline', () => {
  const sampleFingerprint = 'sha256:pipeline-fingerprint-test';
  const baseSha = '1111111111111111111111111111111111111111';
  const headSha = '2222222222222222222222222222222222222222';
  const diffSha256 = sha256('diff');
  const scopeSha256 = computeScopeSha256(['src/index.ts']);

  const subjectInfo = {
    repositoryFingerprint: sampleFingerprint,
    baseSha,
    headSha,
    diffSha256,
    scopeSha256,
  };

  describe('1. Structured Verification & Command Trust (Section 16.1 & 16.2)', () => {
    test('parses canonical VerificationSpec object and legacy string command', () => {
      const objSpec = parseVerificationSpec({
        executable: 'npm',
        args: ['test', '--', 'tests/unit.test.js'],
        timeoutMs: 45000,
        required: true,
        network: 'deny',
      });
      assert.equal(objSpec.executable, 'npm');
      assert.deepEqual(objSpec.args, ['test', '--', 'tests/unit.test.js']);
      assert.equal(objSpec.timeoutMs, 45000);

      const strSpec = parseVerificationSpec('npm run test:unit');
      assert.equal(strSpec.executable, 'npm');
      assert.deepEqual(strSpec.args, ['run', 'test:unit']);
      assert.equal(strSpec.isLegacyString, true);
    });

    test('prohibits shell metacharacters and command chaining', () => {
      assert.throws(
        () => parseVerificationSpec('npm test && rm -rf /'),
        (err) => err.code === 'CTX_COMMAND_CHAINING_PROHIBITED'
      );
      assert.throws(
        () => parseVerificationSpec('pytest; cat /etc/passwd'),
        (err) => err.code === 'CTX_COMMAND_CHAINING_PROHIBITED'
      );
    });

    test('bans npx in host mode (Section 16.2)', () => {
      const npxSpec = { executable: 'npx', args: ['vitest'], timeoutMs: 30000 };
      assert.throws(
        () => validateCommandTrust(npxSpec, { runnerMode: 'host-unsafe' }),
        (err) => err.code === 'CTX_COMMAND_UNTRUSTED'
      );

      // Permitted in OCI runner mode
      assert.doesNotThrow(() => {
        validateCommandTrust(npxSpec, { runnerMode: 'oci' });
      });
    });

    test('prohibits inline code evaluation arguments', () => {
      const evalSpec = { executable: 'npm', args: ['--eval', 'console.log(process.env)'], timeoutMs: 30000 };
      assert.throws(
        () => validateCommandTrust(evalSpec),
        (err) => err.code === 'CTX_FORBIDDEN_ARGUMENT'
      );
    });

    test('requires explicit trust for arbitrary executables outside whitelist', () => {
      const customSpec = { executable: 'custom-tool', args: ['--run'], timeoutMs: 30000 };
      assert.throws(
        () => validateCommandTrust(customSpec, { runnerMode: 'host-unsafe', trusted: false }),
        (err) => err.code === 'CTX_COMMAND_UNTRUSTED'
      );

      // Allowed when explicitly trusted
      assert.doesNotThrow(() => {
        validateCommandTrust(customSpec, { runnerMode: 'host-unsafe', trusted: true });
      });
    });
  });

  describe('2. Sanitized Environment & Output Redaction (Section 16.5)', () => {
    test('sanitized environment clears high-privilege credentials and tokens', () => {
      const env = getSanitizedEnvironment({
        SAFE_SETTING: 'active',
        AWS_SECRET_ACCESS_KEY: 'secret-leaked-key',
        GITHUB_TOKEN: 'ghp_secrettoken',
      });

      assert.equal(env.CI, 'true');
      assert.equal(env.SAFE_SETTING, 'active');
      assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
      assert.equal(env.GITHUB_TOKEN, undefined);
    });

    test('redactSensitiveOutput masks API keys, passwords, and authorization tokens', () => {
      const raw = 'Error authenticating with sk-abcdefghijklmnopqrstuvwxyz123456 and Bearer eyJhbGciOiJIUzI1NiJ9.test and password: supersecretpassword!';
      const redacted = redactSensitiveOutput(raw);

      assert.ok(!redacted.includes('sk-abcdefghijklmnopqrstuvwxyz123456'));
      assert.ok(!redacted.includes('supersecretpassword!'));
      assert.ok(redacted.includes('[REDACTED_API_KEY]'));
      assert.ok(redacted.includes('[REDACTED_TOKEN]'));
    });
  });

  describe('3. Execution & Process Lifecycle (Section 16.3 & 16.4)', () => {
    test('executes verification and generates evidence-bearing attestation', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-verify-test-'));
      try {
        // Run standard node command as a verified test
        const att = await executeVerification(
          tmpDir,
          { executable: process.execPath, args: ['-v'], timeoutMs: 10000 },
          subjectInfo,
          { trusted: true }
        );

        assert.equal(att.status, 'PASS');
        assert.equal(att.evidence.exitCode, 0);
        assert.ok(att.evidence.outputSha256);
        assert.ok(att.evidence.redactedPreview.startsWith('v'));
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('missing executable does NOT turn into PASS or standard FAIL (Section 16 Acceptance)', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-verify-missing-'));
      try {
        const att = await executeVerification(
          tmpDir,
          { executable: 'non-existent-binary-xyz-1234', args: [], timeoutMs: 5000 },
          subjectInfo,
          { trusted: true }
        );

        assert.equal(att.status, 'ERROR');
        assert.equal(att.reasonCode, 'SPAWN_FAILED');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('4. Independent Reviewer Pipeline (Section 16.6)', () => {
    test('static checks reject zero-placeholder lazy stubs (CODE-001)', () => {
      const stubDiff = `
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,3 +10,5 @@
+// TODO: implement later
+// ... rest of code stays here ...
`;
      const findings = runStaticReviewChecks(stubDiff);
      assert.ok(findings.some(f => f.ruleId === 'CODE-001'));
    });

    test('static checks detect secret leaks in diff (SEC-002)', () => {
      const secretDiff = `
--- a/src/config.ts
+++ b/src/config.ts
@@ -1,2 +1,3 @@
+const API_KEY = "sk-1234567890123456789012345678";
`;
      const findings = runStaticReviewChecks(secretDiff);
      assert.ok(findings.some(f => f.ruleId === 'SEC-002' && f.severity === 'critical'));
    });

    test('static checks detect blast radius write-scope violations (SCOPE-001)', () => {
      const findings = runStaticReviewChecks(
        'some diff',
        ['src/auth.ts'],
        ['src/auth.ts', 'package.json']
      );
      assert.ok(findings.some(f => f.ruleId === 'SCOPE-001'));
    });

    test('parses structured review verdict correctly', () => {
      const valid = '```json\n{"specCompliance": "PASS", "codeQuality": "PASS", "summary": "Approved"}\n```';
      const verdict = parseReviewVerdict(valid);
      assert.equal(verdict.specCompliance, 'PASS');
      assert.equal(verdict.codeQuality, 'PASS');

      const invalid = 'Some non-json response text';
      assert.equal(parseReviewVerdict(invalid), null);
    });

    test('fail-closed: reviewer provider error maps to ERROR/UNAVAILABLE/MALFORMED, never PASS', async () => {
      // 1. Exception thrown
      const errAtt = await evaluateReview({
        diff: '+console.log(1);',
        subject: subjectInfo,
        reviewerFn: async () => { throw new Error('Connection refused by provider API'); },
      });
      assert.equal(errAtt.status, 'UNAVAILABLE');

      // 2. Malformed non-JSON output
      const malformedAtt = await evaluateReview({
        diff: '+console.log(1);',
        subject: subjectInfo,
        reviewerFn: async () => ({ text: 'LGTM! Looks good to me.' }),
      });
      assert.equal(malformedAtt.status, 'MALFORMED');

      // 3. Proper structured PASS
      const passAtt = await evaluateReview({
        diff: '+console.log(1);',
        subject: subjectInfo,
        reviewerFn: async () => ({
          text: JSON.stringify({ specCompliance: 'PASS', codeQuality: 'PASS', summary: 'Clean code' }),
        }),
      });
      assert.equal(passAtt.status, 'PASS');
      assert.equal(passAtt.llmVerdict.specCompliance, 'PASS');
    });
  });
});
