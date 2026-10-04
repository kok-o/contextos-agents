'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadNamedExample } = require('./skill-example-loader.cjs');
const { ManifestCompiler } = require('../.agents/compiler/manifest-compiler');
const { CanonicalResolver } = require('../.agents/resolver/canonical-resolver');
const { validateEvidenceSchema } = require('../.agents/validation-evidence');

const CORE_SKILLS = ['engineering-workflow', 'ponytail-mindset', 'security',
  'gemini-precision', 'context-os', 'context-manager', 'gstack-roles'];
const EXECUTABLE_EXAMPLES = {
  'security-hmac': ['security', 'SKILL.md'],
  'security-ssrf': ['security', 'SKILL.md'],
  'ponytail-update': ['ponytail-mindset', 'references/minimalism.md'],
  'gemini-transfer': ['gemini-precision', 'EXAMPLES.md'],
};

function coreSkillFiles(root) {
  const result = [];
  for (const id of CORE_SKILLS) {
    const dir = path.join(root, '.agents/core/skills', id);
    function visit(current) {
      for (const name of fs.readdirSync(current)) {
        const file = path.join(current, name);
        if (fs.statSync(file).isDirectory()) visit(file);
        else if (name.endsWith('.md')) result.push({ id, file, isCore: true });
      }
    }
    visit(dir);
  }
  return result;
}

async function verifyCoreSkills({ root = path.resolve(__dirname, '..'), sourceOverrides = {} } = {}) {
  const results = [];
  async function check(skillId, name, fn, kind = 'behavioral-test') {
    try {
      await fn();
      results.push({ id: `core:${skillId}:${name}`, skillId, kind, passed: true });
    } catch (err) {
      results.push({ id: `core:${skillId}:${name}`, skillId, kind, passed: false, error: err.message });
    }
  }
  const compiled = new ManifestCompiler({ rootDir: root }).compile();
  assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
  const resolver = new CanonicalResolver({ rootDir: root, registry: compiled.registry });
  for (const id of CORE_SKILLS) {
    await check(id, 'evidence-metadata', () => {
      const schema = JSON.parse(fs.readFileSync(path.join(root, '.agents/core/skills', id, 'VALIDATION.json'), 'utf8'));
      assert.deepEqual(validateEvidenceSchema(schema), []);
    }, 'structural-contract');
  }
  await check('engineering-workflow', 'routine-fast-track', () => {
    const r = resolver.resolve({ task: 'Исправь опечатку в README', contextBudgetTokens: 1000 });
    assert.equal(r.risk.value, 'routine');
    assert.deepEqual(r.skills, ['engineering-workflow']);
    assert.ok(r.totalEstimatedTokens <= 1000);
  });
  await check('context-os', 'safety-soft-budget', () => {
    const r = resolver.resolve({ task: 'Fix IDOR in document deletion', contextBudgetTokens: 100 });
    assert.equal(r.risk.value, 'high');
    assert.ok(r.skills.includes('security'));
    assert.ok(r.warnings.some(w => w.code === 'CTX_RESOLVER_BUDGET_EXCEEDED'));
  });
  for (const [id, canonical] of [['context-manager', 'context-os'], ['gstack-roles', 'engineering-workflow']]) {
    await check(id, 'canonical-alias', () => {
      const r = resolver.resolve({ task: 'Review code', explicitSkills: [id] });
      assert.ok(r.skills.includes(canonical));
      assert.equal(r.skills.includes(id), false);
      assert.equal(new Set(r.skills).size, r.skills.length);
      assert.ok(r.warnings.some(w => w.deprecatedSkill === id && w.canonicalSkill === canonical));
    });
  }
  function example(id) {
    const [skill, relative] = EXECUTABLE_EXAMPLES[id];
    const file = path.join(root, '.agents/core/skills', skill, relative);
    return loadNamedExample(file, id, sourceOverrides[id] ?? fs.readFileSync(file, 'utf8'));
  }
  const hmac = example('security-hmac').verifyWebhookSignature;
  const signature = crypto.createHmac('sha256', 'test-key').update('payload').digest('hex');
  await check('security', 'hmac-valid-and-tampered', () => {
    assert.equal(hmac('payload', signature, 'test-key'), true);
    assert.equal(hmac('changed', signature, 'test-key'), false);
    assert.equal(hmac('payload', 'invalid', 'test-key'), false);
  });
  const fetchPartner = example('security-ssrf').fetchFromAllowlist;
  const allowlist = new Set(['api.partner.com']);
  let requests = 0;
  const transport = async (url, options) => {
    requests++;
    assert.equal(options.redirect, 'error');
    return { ok: true, status: 200 };
  };
  await check('security', 'partner-fetch-contract', async () => {
    await fetchPartner('https://API.partner.com:443/data', allowlist, { redirect: 'follow' }, transport);
    assert.equal(requests, 1);
  });
  for (const [name, url, pattern] of [
    ['port', 'https://api.partner.com:8443/admin', /port/],
    ['scheme', 'http://api.partner.com', /protocol/],
    ['credentials', 'https://user:pass@api.partner.com', /credentials/],
    ['host', 'https://169.254.169.254', /allowlist/],
    ['ipv6', 'https://[::1]', /allowlist/],
  ]) {
    await check('security', `blocked-${name}`, async () => {
      const before = requests;
      await assert.rejects(fetchPartner(url, allowlist, {}, transport), pattern);
      assert.equal(requests, before, 'Rejected URL must not reach transport');
    });
  }
  await check('security', 'required-transport', async () => {
    await assert.rejects(fetchPartner('https://api.partner.com', allowlist, {}), /transport required/);
  });
  const updaterFactory = example('ponytail-update').createUserUpdater;
  let mutations = 0;
  const update = updaterFactory(async request => {
    mutations++;
    assert.equal(request.where.id, 'u1');
    assert.equal(request.data.email, 'user@example.com');
    assert.deepEqual(Object.keys(request.data), ['email']);
    return { id: 'u1' };
  });
  await check('ponytail-mindset', 'allowed-update', async () => {
    await update('u1', { email: 'user@example.com' }, { userId: 'u1' });
    assert.equal(mutations, 1);
  });
  for (const [name, payload, session] of [
    ['unknown-privilege', { email: 'user@example.com', isAdmin: true }, { userId: 'u1' }],
    ['invalid-email', { email: 'not-an-email' }, { userId: 'u1' }],
    ['empty-payload', {}, { userId: 'u1' }],
    ['invalid-name', { name: '' }, { userId: 'u1' }],
    ['other-user', { email: 'user@example.com' }, { userId: 'u2' }],
    ['missing-session', { email: 'user@example.com' }, null],
  ]) {
    await check('ponytail-mindset', `rejected-${name}`, async () => {
      const before = mutations;
      await assert.rejects(update('u1', payload, session));
      assert.equal(mutations, before, 'Rejected write must not reach persistence');
    });
  }
  const calculate = example('gemini-transfer').processTransaction;
  const tx = { id: 't1', senderId: 'u1', amount: 20, senderBalance: 100 };
  await check('gemini-precision', 'validated-calculation', () => {
    const r = calculate(tx);
    assert.equal(r.status, 'validated');
    assert.equal(r.newBalance, 80);
  });
  for (const [field, values] of [
    ['amount', [NaN, Infinity, 0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]],
    ['senderBalance', [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]],
  ]) {
    await check('gemini-precision', `invalid-${field}`, () => {
      for (const value of values) assert.throws(() => calculate({ ...tx, [field]: value }));
    });
  }
  await check('gemini-precision', 'insufficient-balance-and-identity', () => {
    assert.throws(() => calculate({ ...tx, senderBalance: 10 }), /Insufficient funds/);
    assert.throws(() => calculate({ ...tx, id: '' }));
  });
  return results;
}

module.exports = { CORE_SKILLS, EXECUTABLE_EXAMPLES, coreSkillFiles, verifyCoreSkills };
