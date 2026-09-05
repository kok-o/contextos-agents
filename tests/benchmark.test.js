'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { buildAgentPrompt, parseAgentReply, parseArgs, scoreRun, summarize, safeRelativePath } = require('../benchmarks/gemini-issues.js');

describe('Gemini issue benchmark', () => {
  test('parses a controller-compatible agent reply', () => {
    const reply = parseAgentReply('{"read":["src/app.js"],"patch":"","ready":false,"summary":"Need context"}');
    assert.deepEqual(reply.read, ['src/app.js']);
    assert.equal(reply.ready, false);
  });

  test('rejects a patch that is not a git diff', () => {
    assert.throws(() => parseAgentReply('{"read":[],"patch":"console.log(1)","ready":false}'));
  });

  test('keeps requested files inside the repository', () => {
    const repository = path.resolve('fixtures/repository');
    assert.equal(safeRelativePath(repository, '../secret.txt'), null);
    assert.equal(safeRelativePath(repository, 'src/index.js'), path.join(repository, 'src', 'index.js'));
  });

  test('requires an explicit command-execution flag', () => {
    const options = parseArgs([]);
    assert.equal(options.allowCommands, false);
    assert.equal(options.count, 20);
  });

  test('scores a narrowly scoped, tested fix', () => {
    const score = scoreRun({
      ready: true,
      test: { passed: true },
      filesChanged: ['src/fix.js'],
      judge: { score: 25 },
      iterations: 2,
    });
    assert.equal(score.total, 103);
  });

  test('creates paired aggregate statistics', () => {
    const task = { id: 'owner/repo#1' };
    const summary = summarize([
      { task, mode: 'without_skills', status: 'ready', test: { passed: true }, iterations: 3, score: { total: 70 } },
      { task, mode: 'with_skills', status: 'ready', test: { passed: true }, iterations: 2, score: { total: 90 } },
    ]);
    assert.equal(summary.pairedTasks, 1);
    assert.equal(summary.meanSkillScoreDelta, 20);
  });

  test('with-skills prompt includes skill guidance while baseline does not', () => {
    const task = { title: 'Fix bug', body: 'Details', issueUrl: 'https://example.test/issues/1' };
    const withSkills = buildAgentPrompt(task, 'with_skills', {});
    const baseline = buildAgentPrompt(task, 'without_skills', {});
    assert.ok(withSkills.includes('ContextOS skills are authoritative guidance'));
    assert.ok(!baseline.includes('ContextOS skills are authoritative guidance'));
  });
});

describe('Live Multi-Model Benchmark Suite', () => {
  const { resolveProviderConfig } = require('../benchmarks/lib/llm-client');
  const { BENCHMARK_TASKS, loadSkillContext } = require('../benchmarks/lib/tasks');
  const { extractCodeBlocks, runStaticChecks, evaluateSubmission } = require('../benchmarks/lib/evaluator');
  const { generateMarkdownReport, generateHtmlReport } = require('../benchmarks/lib/reporter');

  test('resolves provider configuration accurately from flags and models', () => {
    const openai = resolveProviderConfig({ model: 'gpt-4o' });
    assert.equal(openai.provider, 'openai');
    assert.equal(openai.model, 'gpt-4o');

    const gemini = resolveProviderConfig({ model: 'gemini-2.5-flash' });
    assert.equal(gemini.provider, 'gemini');

    const anthropic = resolveProviderConfig({ model: 'claude-3-7-sonnet-20250219' });
    assert.equal(anthropic.provider, 'anthropic');
  });

  test('extracts code blocks from markdown fences', () => {
    const md = 'Here is the solution:\n```typescript\nconst a: number = 1;\n```\nDone!';
    const code = extractCodeBlocks(md);
    assert.equal(code, 'const a: number = 1;');
  });

  test('runs deterministic static checks for security task', () => {
    const authTask = BENCHMARK_TASKS.find(t => t.id === 'auth-security-hardened');
    assert.ok(authTask);

    const goodCode = `
      import crypto from 'node:crypto';
      function verify(a, b) {
        return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
      }
      const limiter = new RateLimiter();
      jwt.sign(payload, secret, { expiresIn: '15m' });
    `;
    const badCode = `
      function verify(a, b) {
        if (a === b) return true;
        res.status(500).json({ error: err.stack });
      }
    `;

    const goodResult = runStaticChecks(authTask, goodCode);
    const badResult = runStaticChecks(authTask, badCode);

    assert.ok(goodResult.score > badResult.score);
    assert.ok(goodResult.checks.find(c => c.id === 'timing-safe-equal').passed);
    assert.equal(badResult.checks.find(c => c.id === 'timing-safe-equal').passed, false);
  });

  test('loads skill context correctly from filesystem', () => {
    const context = loadSkillContext('security');
    assert.ok(context.includes('Skill Rules: security'));
  });

  test('generates HTML and Markdown reports without errors', () => {
    const mockReport = {
      timestamp: new Date().toISOString(),
      provider: 'openai',
      model: 'gpt-4o',
      summary: {
        tasksCount: 1,
        baselineAvgScore: 60,
        skillAvgScore: 92,
        scoreDelta: 32,
        baselinePassRate: 0,
        skillPassRate: 100,
        passRateDelta: 100,
        baselineStaticAvg: 50,
        skillStaticAvg: 100,
      },
      results: [
        {
          taskId: 'auth-security-hardened',
          title: 'Secure Auth',
          category: 'Security',
          skills: ['security'],
          delta: 32,
          baseline: {
            compositeScore: 60,
            staticScore: 50,
            judgeScore: 70,
            isPassing: false,
            code: 'function login() {}',
            staticChecks: [{ id: 'timing-safe-equal', name: 'Timing safe', passed: false }],
            strengths: [],
            weaknesses: ['Missing timing safe'],
          },
          withSkills: {
            compositeScore: 92,
            staticScore: 100,
            judgeScore: 84,
            isPassing: true,
            code: 'crypto.timingSafeEqual()',
            staticChecks: [{ id: 'timing-safe-equal', name: 'Timing safe', passed: true }],
            strengths: ['Timing safe implemented'],
            weaknesses: [],
          },
        },
      ],
    };

    const md = generateMarkdownReport(mockReport);
    assert.ok(md.includes('ContextOS Skills Benchmark Report'));
    assert.ok(md.includes('+32'));

    const html = generateHtmlReport(mockReport);
    assert.ok(html.includes('ContextOS Benchmark Dashboard'));
    assert.ok(html.includes('gpt-4o'));
  });
});

describe('Execution-Backed Runtime Benchmark Suite', () => {
  const { stripTypeScript, createJwtMock, executeInSandbox, runRuntimeSuite } = require('../benchmarks/lib/runtime-runner');
  const { RUNTIME_SUITES } = require('../benchmarks/lib/runtime-suites');

  test('stripTypeScript transforms TypeScript interfaces, types, annotations, and ESM exports', () => {
    const tsCode = `
      import { timingSafeEqual } from 'node:crypto';
      export interface User {
        id: string;
        email: string;
      }
      export type Role = 'admin' | 'user';
      export class AuthService {
        private secret: string = 'key';
        public async verifyPassword(pwd: string, hash: string): Promise<boolean> {
          return true;
        }
      }
    `;
    const js = stripTypeScript(tsCode);
    assert.ok(!js.includes('interface User'));
    assert.ok(!js.includes('type Role'));
    assert.ok(!js.includes(': Promise<boolean>'));
    assert.ok(!js.includes(': string'));
    assert.ok(!js.includes('private secret'));
    assert.ok(js.includes('module.exports.AuthService = AuthService'));
  });

  test('createJwtMock issues, verifies, and decodes valid HMAC tokens', () => {
    const jwt = createJwtMock();
    const token = jwt.sign({ sub: '123' }, 'secret', { expiresIn: '15m', issuer: 'auth-svc' });
    assert.ok(typeof token === 'string' && token.includes('.'));

    const payload = jwt.verify(token, 'secret');
    assert.equal(payload.sub, '123');
    assert.equal(payload.iss, 'auth-svc');
    assert.ok(payload.exp > payload.iat);

    assert.throws(() => jwt.verify(token, 'wrong-secret'));
  });

  test('executeInSandbox runs code safely and captures compilation errors', () => {
    const good = executeInSandbox('module.exports.add = (a, b) => a + b;');
    assert.equal(good.compiled, true);
    assert.equal(good.exports.add(2, 3), 5);

    const bad = executeInSandbox('this is illegal syntax !!!');
    assert.equal(bad.compiled, false);
    assert.ok(bad.error);
  });

  test('runRuntimeSuite verifies compliant security code and catches insecure code', async () => {
    const authSuite = RUNTIME_SUITES['auth-security'];
    assert.ok(authSuite);

    // Insecure baseline code: no timingSafeEqual, leaks stack in 500
    const insecureCode = `
      export function verifyPassword(pwd, hash) {
        return pwd === hash;
      }
      export function errorHandler(err, req, res) {
        res.status(500).json({ error: err.message, stack: err.stack });
      }
    `;
    const baselineRun = await runRuntimeSuite(authSuite, insecureCode);
    assert.ok(baselineRun.passRate < 50, 'Insecure baseline code must fail security assertions');

    // Hardened code: timing-safe, no stack leak, rate limit threshold configured
    const secureCode = `
      import crypto from 'node:crypto';
      export function verifyPassword(pwd, hash, salt) {
        const h1 = crypto.createHash('sha256').update(pwd + salt).digest();
        const h2 = Buffer.from(hash, 'hex');
        if (h1.length !== h2.length) return false;
        return crypto.timingSafeEqual(h1, h2);
      }
      export class RateLimiter {
        private maxAttempts: number = 5;
        public isBlocked(key: string): boolean { return false; }
      }
      export function errorHandler(err, req, res) {
        res.status(500).json({ error: 'Internal Server Error' });
      }
      export function validateInput(data: { email: string }) {
        if (!data.email.includes('@')) return { ok: false, error: 'Invalid email' };
        return { ok: true };
      }
      export function generateToken(user: any, secret: string) {
        const jwt = require('jsonwebtoken');
        return jwt.sign({ sub: user.id }, secret, { expiresIn: '15m', issuer: 'app' });
      }
    `;
    const secureRun = await runRuntimeSuite(authSuite, secureCode);
    assert.ok(secureRun.passRate >= 80, 'Secure code must achieve high pass rate on runtime assertions');
    assert.equal(secureRun.compiled, true);
  });

  test('runRuntimeSuite executes DDD order invariants and catches invariant violations', async () => {
    const dddSuite = RUNTIME_SUITES['ddd-order-invariants'];
    assert.ok(dddSuite);

    const dddCode = `
      export class Money {
        constructor(public amount: number, public currency: string = 'USD') {
          if (amount < 0) throw new Error('Amount cannot be negative');
        }
        static of(amount: number, currency: string = 'USD') {
          return new Money(amount, currency);
        }
        add(other: Money): Money {
          return new Money(this.amount + other.amount, this.currency);
        }
      }

      export class Order {
        private items: any[] = [];
        private status: string = 'CREATED';
        private events: any[] = [];

        constructor(public id: string, public customerId: string) {
          this.events.push({ type: 'OrderCreatedEvent', orderId: id });
        }

        addItem(id: string, qty: number, price: any) {
          if (qty <= 0) throw new Error('Quantity must be positive');
          if (this.status === 'PAID') throw new Error('Cannot add to paid order');
          this.items.push({ id, qty, price });
        }

        pay() {
          this.status = 'PAID';
          this.events.push({ type: 'OrderPaidEvent' });
        }

        ship() {
          this.status = 'SHIPPED';
        }

        cancel() {
          if (this.status === 'SHIPPED') throw new Error('Cannot cancel shipped order');
          this.status = 'CANCELLED';
        }

        getDomainEvents() {
          return [...this.events];
        }
      }

      export interface OrderRepository {
        save(order: Order): Promise<void>;
      }
    `;

    const dddRun = await runRuntimeSuite(dddSuite, dddCode);
    assert.equal(dddRun.compiled, true);
    assert.equal(dddRun.passRate, 100);
    assert.equal(dddRun.totalPassed, 4);
  });
});

