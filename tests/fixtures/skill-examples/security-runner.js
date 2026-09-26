/**
 * tests/fixtures/skill-examples/security-runner.js
 * Executable verification for security skill code examples.
 */

'use strict';

const assert = require('node:assert');
const crypto = require('node:crypto');

// 1. Implementation extracted from .agents/core/skills/security/SKILL.md
function verifyWebhookSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = Buffer.from(hmac.update(payload).digest('hex'), 'utf8');
  const sigBuffer = Buffer.from(signature, 'utf8');

  if (digest.length !== sigBuffer.length) return false;
  return crypto.timingSafeEqual(digest, sigBuffer);
}

// 2. Implementation extracted from .agents/core/skills/security/SKILL.md (TS types stripped)
async function fetchFromAllowlist(urlString, allowedHostnames, options = {}, customFetch = fetch) {
  const parsed = new URL(urlString);

  // 1. Enforce HTTPS only
  if (parsed.protocol !== 'https:') {
    throw new Error(`SSRF blocked: protocol "${parsed.protocol}" is not permitted; HTTPS required`);
  }

  // 2. Reject credentials in URL
  if (parsed.username || parsed.password) {
    throw new Error('SSRF blocked: URL credentials (user:password@host) are prohibited');
  }

  // 3. Strict positive destination allowlist (prevents internal network probing)
  const normalizedHost = parsed.hostname.toLowerCase();
  if (!allowedHostnames.has(normalizedHost)) {
    throw new Error(`SSRF blocked: destination host "${normalizedHost}" is not in the approved allowlist`);
  }

  // 4. Disable automatic redirects to prevent redirection to private IPs or metadata endpoints
  return customFetch(urlString, {
    ...options,
    redirect: 'error',
  });
}

function runSecurityExamples() {
  const results = [];

  // Test 1: Timing-safe secret verification - positive match
  const secret = 'super-secret-key-123';
  const payload = '{"event":"user.created","id":42}';
  const validHmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const validMatch = verifyWebhookSignature(payload, validHmac, secret);
  assert.strictEqual(validMatch, true, 'Valid HMAC signature must verify successfully');
  results.push({ id: 'security:timing-safe:positive', passed: true });

  // Test 2: Timing-safe secret verification - tampered payload
  const tamperedMatch = verifyWebhookSignature(payload + 'tampered', validHmac, secret);
  assert.strictEqual(tamperedMatch, false, 'Tampered payload must fail verification');
  results.push({ id: 'security:timing-safe:tampered-payload', passed: true });

  // Test 3: Timing-safe secret verification - incorrect signature length
  const lengthMismatch = verifyWebhookSignature(payload, 'short-sig', secret);
  assert.strictEqual(lengthMismatch, false, 'Mismatched signature length must return false cleanly');
  results.push({ id: 'security:timing-safe:length-mismatch', passed: true });

  return results;
}

async function runSsrfExamples() {
  const results = [];
  const allowedHosts = new Set(['api.partner.com', 'webhooks.stripe.com']);

  // Test 4: SSRF protection - Positive allowlist fetch with controlled transport
  let fetchOptionsUsed = null;
  const mockFetch = async (url, opts) => {
    fetchOptionsUsed = opts;
    return { ok: true, status: 200 };
  };

  const res = await fetchFromAllowlist('https://api.partner.com/v1/data', allowedHosts, {}, mockFetch);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(fetchOptionsUsed.redirect, 'error', 'Must enforce redirect: error');
  results.push({ id: 'security:ssrf:allowed-host', passed: true });

  // Test 5: SSRF protection - Reject non-HTTPS protocol
  let protocolBlocked = false;
  try {
    await fetchFromAllowlist('http://api.partner.com/v1/data', allowedHosts, {}, mockFetch);
  } catch (err) {
    protocolBlocked = true;
    assert.match(err.message, /protocol "http:" is not permitted/);
  }
  assert.ok(protocolBlocked, 'HTTP protocol must be rejected');
  results.push({ id: 'security:ssrf:reject-http', passed: true });

  // Test 6: SSRF protection - Reject embedded credentials
  let credsBlocked = false;
  try {
    await fetchFromAllowlist('https://admin:pass@api.partner.com/v1/data', allowedHosts, {}, mockFetch);
  } catch (err) {
    credsBlocked = true;
    assert.match(err.message, /URL credentials .* are prohibited/);
  }
  assert.ok(credsBlocked, 'Embedded URL credentials must be rejected');
  results.push({ id: 'security:ssrf:reject-credentials', passed: true });

  // Test 7: SSRF protection - Reject unauthorized destination (cloud metadata probe)
  let metadataBlocked = false;
  try {
    await fetchFromAllowlist('https://169.254.169.254/computeMetadata/v1/', allowedHosts, {}, mockFetch);
  } catch (err) {
    metadataBlocked = true;
    assert.match(err.message, /destination host "169.254.169.254" is not in the approved allowlist/);
  }
  assert.ok(metadataBlocked, 'Metadata IP probe must be blocked by destination allowlist');
  results.push({ id: 'security:ssrf:reject-unauthorized-host', passed: true });

  return results;
}

module.exports = {
  verifyWebhookSignature,
  fetchFromAllowlist,
  runSecurityExamples,
  runSsrfExamples,
};
