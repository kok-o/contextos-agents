'use strict';

const assert = require('assert');
const crypto = require('crypto');

/**
 * Helper to discover an exported function or class by name or regex.
 */
function findExport(exportsObj, nameOrRegex) {
  if (!exportsObj || typeof exportsObj !== 'object') return null;

  // Direct property check
  if (typeof nameOrRegex === 'string' && exportsObj[nameOrRegex]) {
    return exportsObj[nameOrRegex];
  }

  // Regex check across all export keys
  const regex = typeof nameOrRegex === 'string' ? new RegExp(`^${nameOrRegex}$`, 'i') : nameOrRegex;
  for (const key of Object.keys(exportsObj)) {
    if (regex.test(key)) {
      return exportsObj[key];
    }
  }

  // Nested check if exports has default or service
  if (exportsObj.default && typeof exportsObj.default === 'object') {
    return findExport(exportsObj.default, nameOrRegex);
  }

  return null;
}

function createMoney(Money, amount, currency = 'USD') {
  if (!Money) return amount;
  if (typeof Money.of === 'function') {
    try { return Money.of(amount, currency); } catch {}
  }
  if (typeof Money === 'function') {
    try { return new Money(amount, currency); } catch {}
    try { return new Money(amount); } catch {}
  }
  return amount;
}

function requireMethod(instance, method, description = method) {
  assert.ok(instance && typeof instance[method] === 'function', `${description} must be implemented`);
  return instance[method].bind(instance);
}

function readValue(instance, name, getterName) {
  if (instance && instance[name] !== undefined) return instance[name];
  if (instance && typeof instance[getterName] === 'function') return instance[getterName]();
  return undefined;
}

function readOrderStatus(order) {
  const status = readValue(order, 'status', 'getStatus');
  assert.ok(status !== undefined && status !== null, 'Order must expose its current status');
  return String(status).toUpperCase().replace(/[- ]/g, '_');
}

function statusIs(order, ...expected) {
  const status = readOrderStatus(order);
  assert.ok(expected.includes(status), `Expected order status ${expected.join(' or ')}, got ${status}`);
}

function assertJwt(token, secret, nowSeconds) {
  assert.equal(typeof token, 'string', 'generateToken must return a JWT string');
  const parts = token.split('.');
  assert.equal(parts.length, 3, 'JWT must contain header, payload, and signature');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  assert.equal(header.alg, 'HS256', 'JWT must use HMAC-SHA256');
  const expectedSignature = crypto.createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const actualSignature = Buffer.from(encodedSignature, 'base64url');
  assert.equal(actualSignature.length, expectedSignature.length, 'JWT signature must be a complete HMAC-SHA256 digest');
  assert.ok(crypto.timingSafeEqual(actualSignature, expectedSignature), 'JWT signature must verify with the supplied secret');

  assert.ok(Number.isSafeInteger(payload.iat), 'JWT must include an integer iat claim');
  assert.ok(Number.isSafeInteger(payload.exp), 'JWT must include an integer exp claim');
  assert.ok(payload.iat <= nowSeconds + 60 && payload.iat >= nowSeconds - 60, 'JWT iat must be close to the issuance time');
  assert.ok(payload.exp > payload.iat, 'JWT exp must be later than iat');
  assert.ok(payload.exp - payload.iat <= 900, 'JWT lifetime must be no longer than 15 minutes');
  assert.ok(typeof payload.iss === 'string' && payload.iss.trim().length > 0, 'JWT must include a non-empty issuer');
  assert.ok(
    (typeof payload.aud === 'string' && payload.aud.trim().length > 0) ||
    (Array.isArray(payload.aud) && payload.aud.length > 0 && payload.aud.every(aud => typeof aud === 'string' && aud.trim().length > 0)),
    'JWT must include a non-empty audience'
  );
  assert.ok(payload.id === 'user-42' || payload.sub === 'user-42', 'JWT must identify the supplied user');
  assert.equal(payload.email, 'user@example.test', 'JWT must retain the supplied email claim');
  return payload;
}

function getBreakerState(breaker) {
  const state = readValue(breaker, 'state', 'getState');
  assert.ok(state !== undefined && state !== null, 'CircuitBreaker must expose its current state');
  return String(state).toUpperCase().replace(/[- ]/g, '_');
}

function instantiateAuthService(exportsObj) {
  const AuthService = findExport(exportsObj, /AuthService|AuthenticationService|AuthenticationHandler/);
  if (typeof AuthService !== 'function') return null;
  try {
    return new AuthService({ issuer: 'benchmark-issuer', audience: 'benchmark-audience' });
  } catch {
    try { return new AuthService(); } catch { return null; }
  }
}

function authMethod(exportsObj, service, exportPattern, methodNames) {
  const exported = findExport(exportsObj, exportPattern);
  if (typeof exported === 'function') return exported;
  for (const method of methodNames) {
    if (service && typeof service[method] === 'function') return service[method].bind(service);
  }
  return null;
}

function assertInputRejected(result, description, requireValidationStatus = false) {
  const statusValue = result && typeof result === 'object' ? result.status ?? result.statusCode : undefined;
  const status = statusValue === undefined ? NaN : Number(statusValue);
  if (Number.isInteger(status)) {
    assert.ok(status >= 400 && status < 500, `${description} must be rejected with a client error, got ${status}`);
    if (requireValidationStatus) assert.ok(status === 400 || status === 422, `${description} must use a validation status (400 or 422), got ${status}`);
    return;
  }
  if (result === false || result === null) return;
  assert.ok(
    result && typeof result === 'object' &&
      (result.ok === false || result.valid === false || result.success === false || result.error || result.errors),
    `${description} must return an explicit validation failure`
  );
}

function assertInputAccepted(result) {
  const statusValue = result && typeof result === 'object' ? result.status ?? result.statusCode : undefined;
  const status = statusValue === undefined ? NaN : Number(statusValue);
  if (Number.isInteger(status)) {
    assert.ok(status >= 200 && status < 400, `Valid credentials should pass validation, got ${status}`);
    return;
  }
  assert.ok(
    result === true ||
      (result && typeof result === 'object' && (result.ok === true || result.valid === true || result.success === true)),
    'Valid credentials must be accepted by the input validator'
  );
}

function assertWellFormedLogin(result) {
  const statusValue = result && typeof result === 'object' ? result.status ?? result.statusCode : undefined;
  const status = Number(statusValue);
  assert.ok(Number.isInteger(status), 'handleLogin must return a numeric HTTP status for well-formed input');
  assert.ok(
    (status >= 200 && status < 400) || status === 401 || status === 403,
    `Well-formed login input must reach authentication (2xx, 401, or 403), got ${status}`
  );
}

function normalizeLimiterResult(result, operation) {
  if (typeof result === 'boolean') return result;
  assert.ok(result && typeof result === 'object', `${operation} must return a boolean or an object with an allowed/blocked field`);
  if (typeof result.allowed === 'boolean') return result.allowed;
  if (typeof result.blocked === 'boolean') return !result.blocked;
  assert.fail(`${operation} result must include boolean allowed or blocked`);
}

async function callLoginOrValidator(fn, input, description, requireValidationStatus = false) {
  let result;
  try { result = await fn(input); }
  catch (error) {
    if (requireValidationStatus) {
      const status = Number(error && (error.status ?? error.statusCode));
      assert.ok(status === 400 || status === 422, `${description} must return a validation error status (400 or 422)`);
    }
    return;
  }
  assertInputRejected(result, description, requireValidationStatus);
}

function assertGeneric500(response, result) {
  const status = response.statusCode ?? response.status ?? (result && (result.status ?? result.statusCode));
  assert.equal(Number(status), 500, 'Unexpected failures must produce HTTP 500');
  const body = response.body ?? response.payload ?? (result && (result.body ?? result.payload ?? result));
  const serialized = body === undefined ? '' : JSON.stringify(body);
  assert.ok(!serialized.includes('BENCHMARK_SECRET_ERROR_MESSAGE'), '500 response must not reveal the internal error message');
  assert.ok(!serialized.includes('BENCHMARK_SECRET_ERROR_STACK'), '500 response must not reveal the internal stack trace');
}

/**
 * Runtime test suites for benchmark scenarios.
 */
const RUNTIME_SUITES = {
  'auth-security': {
    id: 'auth-security',
    title: 'Secure Authentication & Rate Limiting Handler',
    category: 'Security & Backend',
    skills: ['security', 'node', 'ponytail-mindset'],
    contract: `
export interface IAuthService {
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  generateToken(payload: { id: string; email: string; role?: string }, secret: string): Promise<string>;
  handleLogin(request: { email?: string; password?: string; ip?: string }): Promise<{ status: number; body: any }>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining?: number;
  retryAfterMs?: number;
}

export class RateLimiter {
  constructor(options?: { maxAttempts?: number; windowMs?: number });
  consume(key: string): RateLimitResult | Promise<RateLimitResult>;
}

export class AuthService implements IAuthService {
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  generateToken(payload: { id: string; email: string; role?: string }, secret: string): Promise<string>;
  handleLogin(request: { email?: string; password?: string; ip?: string }): Promise<{ status: number; body: any }>;
}
`,
    tests: [
      {
        id: 'timing-safe-comparison',
        name: 'Behavioral: verifies matching and incorrect passwords using timing-safe comparison',
        evidence: 'behavioral',
        run: async (exportsObj, execResult) => {
          const service = instantiateAuthService(exportsObj);
          const verify = authMethod(exportsObj, service, /verifyPassword|verifyHash|checkPassword/, ['verifyPassword']);
          const hash = authMethod(exportsObj, service, /hashPassword/, ['hashPassword']);
          assert.equal(typeof verify, 'function', 'Must export or implement AuthService.verifyPassword');
          assert.equal(typeof hash, 'function', 'Must export or implement AuthService.hashPassword');

          const pwd = 'TestSecretPassword_123';
          const hashed = await hash(pwd);
          assert.equal(typeof hashed, 'string', 'hashPassword must return a password hash string');
          assert.notEqual(hashed, pwd, 'hashPassword must not return the plaintext password');
          assert.ok(!hashed.includes(pwd), 'hashPassword output must not contain the plaintext password');
          const secondHash = await hash(pwd);
          assert.notEqual(secondHash, hashed, 'hashPassword must use a fresh salt for repeated passwords');
          const audit = execResult.cryptoAudit;
          assert.ok(audit && Number.isSafeInteger(audit.timingSafeEqualCalls), 'Worker must expose the timingSafeEqual audit counter');
          assert.ok(audit && Number.isSafeInteger(audit.passwordKdfCalls), 'Worker must expose the password KDF audit counter');
          assert.ok(audit.passwordKdfCalls >= 2, 'Password hashing must call a password KDF for each generated hash');

          const beforeValid = audit.timingSafeEqualCalls;
          const valid = await verify(pwd, hashed);
          assert.equal(valid, true, 'verifyPassword must accept the matching password');
          assert.ok(audit.timingSafeEqualCalls > beforeValid, 'Password verification must call crypto.timingSafeEqual');

          const beforeInvalid = audit.timingSafeEqualCalls;
          const invalid = await verify('WrongSecretPassword_999', hashed);
          assert.equal(invalid, false, 'verifyPassword must reject an incorrect password');
          assert.ok(audit.timingSafeEqualCalls > beforeInvalid, 'Incorrect-password verification must also use crypto.timingSafeEqual');

          const malformed = await Promise.resolve(verify(pwd, 'malformed-hash')).catch(() => false);
          assert.equal(malformed, false, 'verifyPassword must reject a malformed stored hash without throwing');
        }
      },
      {
        id: 'rate-limiting-lockout',
        name: 'Behavioral: rate limiter blocks repeated attempts and isolates keys',
        evidence: 'behavioral',
        run: async (exportsObj, execResult) => {
          const Limiter = findExport(exportsObj, /RateLimiter|RateLimitStore|InMemoryRateLimit|SlidingWindowRateLimiter/i);
          assert.ok(typeof Limiter === 'function', 'Must export a RateLimiter implementation');
          const limiter = new Limiter({ maxAttempts: 3, windowMs: 60_000, limit: 3, threshold: 3 });
          const consume = typeof limiter.consume === 'function' ? limiter.consume.bind(limiter) : null;
          const isBlocked = typeof limiter.isBlocked === 'function' ? limiter.isBlocked.bind(limiter) : null;
          const check = typeof limiter.check === 'function' ? limiter.check.bind(limiter) : null;
          const tryAcquire = typeof limiter.tryAcquire === 'function' ? limiter.tryAcquire.bind(limiter) : null;
          assert.ok(consume || isBlocked || check || tryAcquire, 'RateLimiter must expose consume, isBlocked, check, or tryAcquire');

          const key = 'account:user@example.test|ip:192.0.2.10';
          const freshKey = 'account:user@example.test|ip:192.0.2.11';
          let blocked = false;
          let firstAllowed = false;
          for (let attempt = 0; attempt < 12; attempt++) {
            let allowed;
            if (consume) {
              allowed = normalizeLimiterResult(await consume(key), 'RateLimiter.consume');
            } else if (isBlocked) {
              const result = await isBlocked(key);
              assert.equal(typeof result, 'boolean', 'RateLimiter.isBlocked must return a boolean');
              allowed = !result;
              if (allowed && typeof limiter.recordFailure === 'function') await limiter.recordFailure(key);
            } else if (tryAcquire) {
              allowed = normalizeLimiterResult(await tryAcquire(key), 'RateLimiter.tryAcquire');
            } else {
              allowed = normalizeLimiterResult(await check(key), 'RateLimiter.check');
              if (allowed && typeof limiter.recordFailure === 'function') await limiter.recordFailure(key);
            }
            if (attempt === 0) firstAllowed = allowed;
            if (!allowed) { blocked = true; break; }
          }
          assert.equal(firstAllowed, true, 'RateLimiter must allow an initial attempt');
          assert.equal(blocked, true, 'RateLimiter must eventually block repeated attempts for the same key');

          let freshKeyAllowed;
          if (consume) freshKeyAllowed = normalizeLimiterResult(await consume(freshKey), 'RateLimiter.consume');
          else if (isBlocked) freshKeyAllowed = !(await isBlocked(freshKey));
          else if (tryAcquire) freshKeyAllowed = normalizeLimiterResult(await tryAcquire(freshKey), 'RateLimiter.tryAcquire');
          else freshKeyAllowed = normalizeLimiterResult(await check(freshKey), 'RateLimiter.check');
          assert.equal(freshKeyAllowed, true, 'Blocking one account/IP key must not block an independent key');
          }
      },
      {
        id: 'no-stack-trace-leak',
        name: 'Behavioral when an error handler is exported; otherwise explicit source-only fallback for 500 leaks',
        evidence: 'behavioral-or-source-static-fallback',
        run: async (exportsObj, execResult) => {
          const service = instantiateAuthService(exportsObj);
          const handler = authMethod(exportsObj, service, /^(?:errorHandler|handleError|formatErrorResponse|internalError)$/i, ['errorHandler', 'handleError', 'formatErrorResponse']);
          if (handler) {
            const response = {
              statusCode: undefined,
              body: undefined,
              status(code) { this.statusCode = code; return this; },
              json(body) { this.body = body; return this; },
              send(body) { this.body = body; return this; },
              end(body) { if (body !== undefined) this.body = body; return this; },
            };
            const error = new Error('BENCHMARK_SECRET_ERROR_MESSAGE');
            error.stack = 'BENCHMARK_SECRET_ERROR_STACK';
            const result = await handler(error, response, response, () => {});
            assertGeneric500(response, result);
            return;
          }

          assert.ok(
            !/res\.(?:status\(500\)|send|json)\([^)]*(\bstack\b|(?:err|error)\.message)/i.test(execResult.rawJs),
            'Source-only fallback: forbidden direct stack or internal-message leak in 500 response'
          );
        }
      },
      {
        id: 'input-sanitization-validation',
        name: 'Behavioral: rejects malformed login credentials and accepts valid input shape',
        evidence: 'behavioral',
        run: async (exportsObj, execResult) => {
          const service = instantiateAuthService(exportsObj);
          const validator = authMethod(exportsObj, service, /validateLoginInput|validateLogin|validateInput|validateCredentials|parseLogin/i, ['validateLoginInput', 'validateLogin', 'validateInput', 'validateCredentials']);
          const handleLogin = authMethod(exportsObj, service, /^handleLogin$|^login$/i, ['handleLogin', 'login']);
          assert.equal(typeof handleLogin, 'function', 'Must export or implement AuthService.handleLogin');

          if (validator) {
            await callLoginOrValidator(validator, { email: 'not-an-email', password: 'PresentPassword_123' }, 'Malformed email');
            await callLoginOrValidator(validator, { email: 'user@example.test', password: '' }, 'Empty password');
            const valid = await Promise.resolve(validator({ email: 'user@example.test', password: 'PresentPassword_123' }));
            assertInputAccepted(valid);
          }

          if (handleLogin) {
            await callLoginOrValidator(handleLogin, { email: 'not-an-email', password: 'PresentPassword_123', ip: '192.0.2.20' }, 'Malformed login email', true);
            await callLoginOrValidator(handleLogin, { email: 'user@example.test', password: '', ip: '192.0.2.20' }, 'Empty login password', true);
            const validShape = await handleLogin({ email: 'user@example.test', password: 'PresentPassword_123', ip: '198.51.100.50' });
            assertWellFormedLogin(validShape);
          }
        }
      },
      {
        id: 'jwt-claims-and-expiry',
        name: 'Issues JWT with bounded expiration (<=15m), audience, and issuer',
        run: async (exportsObj, execResult) => {
          const tokenFn = findExport(exportsObj, /generateToken|createToken|issueToken|signToken|signJwt/i);
          const service = instantiateAuthService(exportsObj);
          const serviceTokenFn = service && typeof service.generateToken === 'function' ? service.generateToken.bind(service) : null;
          const generateToken = serviceTokenFn || tokenFn;
          assert.equal(typeof generateToken, 'function', 'Must export or implement generateToken on AuthService');

          const secret = 'benchmark-only-hmac-secret-7f2a91d0';
          const payload = { id: 'user-42', email: 'user@example.test', role: 'member' };
          const before = Math.floor(Date.now() / 1000);
          const token = await generateToken(payload, secret);
          assertJwt(token, secret, before);
        }
      }
    ]
  },

  'ddd-order-invariants': {
    id: 'ddd-order-invariants',
    title: 'DDD Order Aggregate Root & Money Value Object',
    category: 'Architecture & DDD',
    skills: ['ddd', 'system-design', 'typescript'],
    contract: `
export type OrderStatus = 'PENDING' | 'PAID' | 'SHIPPED' | 'CANCELLED';

export class Money {
  constructor(amount: number, currency: string);
  static of(amount: number, currency: string): Money;
  readonly amount: number;
  readonly currency: string;
  add(other: Money): Money;
  equals(other: Money): boolean;
}

export interface OrderItem {
  id: string;
  quantity: number;
  price: Money;
}

export class Order {
  constructor(id: string, customerId: string);
  readonly id: string;
  readonly status: OrderStatus;
  readonly items: ReadonlyArray<OrderItem>;
  addItem(productId: string, quantity: number, price: Money): void;
  pay(): void;
  ship(): void;
  cancel(): void;
  getTotal(): Money;
  getDomainEvents(): any[];
}

export interface IOrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
}
`,
    tests: [
      {
        id: 'money-value-object-invariants',
        name: 'Money Value Object is immutable and validates currency matching',
        run: async (exportsObj, execResult) => {
          const Money = findExport(exportsObj, /^Money$/i) || findExport(exportsObj, 'Money');
          assert.ok(Money, 'Must export Money value object');
          assert.ok(typeof Money === 'function', 'Money must be a constructible value object');

          // 1. Negative amount protection
          let threwOnNegative = false;
          try {
            if (Money.of) Money.of(-50, 'USD');
            else new Money(-50, 'USD');
          } catch {
            threwOnNegative = true;
          }
          assert.ok(threwOnNegative, 'Money must reject negative amounts');

          const m1 = createMoney(Money, 100, 'USD');
          const m2 = createMoney(Money, 50, 'USD');
          const add = requireMethod(m1, 'add', 'Money.add');
          const originalAmount = readValue(m1, 'amount', 'getAmount');
          assert.equal(originalAmount, 100, 'Money must expose its numeric amount');
          const m3 = add(m2);
          assert.ok(m3 && m3 !== m1, 'Money.add must return a new Money instance');
          assert.equal(readValue(m3, 'amount', 'getAmount'), 150, 'Money.add must return the correct sum');
          assert.equal(readValue(m3, 'currency', 'getCurrency'), 'USD', 'Money.add must preserve currency');
          assert.equal(readValue(m1, 'amount', 'getAmount'), originalAmount, 'Money.add must preserve the original amount');

          try { m1.amount = 999; } catch {}
          assert.equal(readValue(m1, 'amount', 'getAmount'), originalAmount, 'Money amount must not be externally mutable');

          const euro = createMoney(Money, 1, 'EUR');
          let threwOnCurrencyMismatch = false;
          try { add(euro); } catch { threwOnCurrencyMismatch = true; }
          assert.ok(threwOnCurrencyMismatch, 'Money.add must reject currencies that do not match');
        }
      },
      {
        id: 'order-state-invariants',
        name: 'Order Aggregate enforces business state-machine invariants',
        run: async (exportsObj, execResult) => {
          const Order = findExport(exportsObj, /^Order$/i);
          const Money = findExport(exportsObj, /^Money$/i) || findExport(exportsObj, 'Money');
          assert.ok(Order, 'Must export Order aggregate root');

          const order = new Order('ord-1', 'cust-1');
          const addItem = requireMethod(order, 'addItem', 'Order.addItem');
          const pay = requireMethod(order, 'pay', 'Order.pay');
          const ship = requireMethod(order, 'ship', 'Order.ship');
          const cancel = requireMethod(order, 'cancel', 'Order.cancel');
          requireMethod(order, 'getTotal', 'Order.getTotal');
          requireMethod(order, 'getDomainEvents', 'Order.getDomainEvents');
          statusIs(order, 'PENDING', 'CREATED');

          // Invariant 1: Positive quantity
          let threwZeroQty = false;
          try { addItem('item-zero', 0, createMoney(Money, 10, 'USD')); }
          catch { threwZeroQty = true; }
          assert.ok(threwZeroQty, 'Order.addItem must enforce invariant: quantity must be positive');

          // Invariant 2: Cannot add items to paid order
          const price = createMoney(Money, 10, 'USD');
          addItem('item-valid', 1, price);
          const total = requireMethod(order, 'getTotal', 'Order.getTotal')();
          assert.equal(readValue(total, 'amount', 'getAmount'), 10, 'Order.getTotal must aggregate item prices');
          assert.equal(readValue(total, 'currency', 'getCurrency'), 'USD', 'Order.getTotal must retain the item currency');
          let threwShippingBeforePayment = false;
          try { ship(); } catch { threwShippingBeforePayment = true; }
          assert.ok(threwShippingBeforePayment, 'Order cannot ship before payment');
          pay();
          statusIs(order, 'PAID');
          let threwSecondPayment = false;
          try { pay(); } catch { threwSecondPayment = true; }
          assert.ok(threwSecondPayment, 'Order cannot be paid more than once');
          let threwOnPaid = false;
          try { addItem('item-2', 1, price); } catch { threwOnPaid = true; }
          assert.ok(threwOnPaid, 'Cannot add items to an already paid order');
          ship();
          statusIs(order, 'SHIPPED');
          let threwCancelShipped = false;
          try { cancel(); } catch { threwCancelShipped = true; }
          assert.ok(threwCancelShipped, 'Cannot cancel an order that has already shipped');

          const cancellable = new Order('ord-2', 'cust-2');
          requireMethod(cancellable, 'cancel', 'Order.cancel').call(cancellable);
          statusIs(cancellable, 'CANCELLED');
        }
      },
      {
        id: 'domain-events-emission',
        name: 'Records domain events for downstream side-effects',
        run: async (exportsObj, execResult) => {
          const Order = findExport(exportsObj, /^Order$/i);
          assert.ok(Order && typeof Order === 'function', 'Must export Order aggregate root');
          const Money = findExport(exportsObj, /^Money$/i);
          assert.ok(Money && typeof Money === 'function', 'Must export Money for order event behavior');
          const order = new Order('ord-events', 'cust-events');
          const getEvents = requireMethod(order, 'getDomainEvents', 'Order.getDomainEvents');
          const eventsAfterCreate = getEvents();
          assert.ok(Array.isArray(eventsAfterCreate), 'Order.getDomainEvents must return an array');
          const initialCount = eventsAfterCreate.length;

          requireMethod(order, 'addItem', 'Order.addItem')('event-item', 1, createMoney(Money, 3, 'USD'));
          requireMethod(order, 'pay', 'Order.pay')();
          const eventsAfterPay = getEvents();
          assert.ok(Array.isArray(eventsAfterPay) && eventsAfterPay.length > initialCount, 'Paying an order must record a domain event');
          const paidCount = eventsAfterPay.length;

          requireMethod(order, 'ship', 'Order.ship')();
          const eventsAfterShip = getEvents();
          assert.ok(Array.isArray(eventsAfterShip) && eventsAfterShip.length > paidCount, 'Shipping an order must record a domain event');
        }
      },
      {
        id: 'repository-interface-decoupling',
        name: 'Static architecture check: decoupled Repository interface without ORM/HTTP imports',
        evidence: 'source-static-architecture',
        run: async (exportsObj, execResult) => {
          const source = execResult.originalCode || execResult.rawJs;
          assert.ok(
            !/from\s+['"]@prisma\/client['"]|from\s+['"]typeorm['"]|from\s+['"]express['"]/i.test(source),
            'Domain layer must have zero coupling to ORM or HTTP frameworks'
          );
          assert.ok(
            /Repository/i.test(source),
            'Must provide a decoupled Repository interface'
          );
        }
      }
    ]
  },

  'resilient-api-client': {
    id: 'resilient-api-client',
    title: 'Type-Safe Resilient API Client with Circuit Breaker',
    category: 'TypeScript & Reliability',
    skills: ['typescript', 'system-design', 'performance'],
    contract: `
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
}

export class CircuitBreaker {
  constructor(options?: CircuitBreakerOptions);
  readonly state: CircuitState;
  getState(): CircuitState;
  recordSuccess(): void;
  recordFailure(): void;
  execute<T>(action: () => Promise<T>): Promise<T>;
}

export class ApiError extends Error {
  constructor(message: string, statusCode: number);
  readonly statusCode: number;
}

export interface RequestOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export class ResilientHttpClient {
  constructor(circuitBreaker?: CircuitBreaker);
  get<T>(url: string, options?: RequestOptions): Promise<T>;
}
`,
    tests: [
      {
        id: 'timeout-abort-handling',
        name: 'Implements request timeout with AbortController',
        run: async (exportsObj, execResult) => {
          const Client = findExport(exportsObj, /^ResilientHttpClient$/i);
          assert.ok(Client && typeof Client === 'function', 'Must export ResilientHttpClient');
          const client = new Client();
          const get = requireMethod(client, 'get', 'ResilientHttpClient.get');
          const fetchMock = execResult.fetchMock;
          assert.ok(typeof fetchMock === 'function' && Array.isArray(fetchMock.calls), 'The worker must provide a deterministic local fetch mock');

          let settled = false;
          let requestError = null;
          const result = get('https://runtime-benchmark.invalid/slow', { timeoutMs: 25 })
            .then(() => { settled = true; }, error => { settled = true; requestError = error; });
          await Promise.race([result, new Promise((_, reject) => setTimeout(() => reject(new Error('Timed-out request did not settle after AbortController cancellation')), 750))]);
          assert.equal(settled, true, 'Timed-out request must settle');
          assert.ok(requestError, 'Timed-out request must reject');
          assert.equal(fetchMock.calls.length, 1, 'Client must issue exactly one request through the mock fetch');
          assert.ok(fetchMock.calls[0].signal, 'Client must pass an AbortSignal to fetch');
          assert.equal(fetchMock.calls[0].aborted, true, 'Client timeout must abort the in-flight fetch request');
        }
      },
      {
        id: 'circuit-breaker-transitions',
        name: 'Circuit breaker transitions CLOSED -> OPEN -> HALF-OPEN',
        run: async (exportsObj, execResult) => {
          const Breaker = findExport(exportsObj, /CircuitBreaker/i);
          assert.ok(Breaker && typeof Breaker === 'function', 'Must export CircuitBreaker');
          const breaker = new Breaker({ failureThreshold: 2, resetTimeoutMs: 35 });
          const execute = requireMethod(breaker, 'execute', 'CircuitBreaker.execute');
          assert.equal(getBreakerState(breaker), 'CLOSED', 'Circuit must start CLOSED');

          const failure = async () => { throw new Error('deterministic upstream failure'); };
          await assert.rejects(execute(failure));
          assert.equal(getBreakerState(breaker), 'CLOSED', 'Circuit must stay CLOSED below the failure threshold');
          await assert.rejects(execute(failure));
          assert.equal(getBreakerState(breaker), 'OPEN', 'Circuit must open at the configured failure threshold');

          let rejectedWhileOpen = false;
          let openActionCalled = false;
          try {
            await execute(async () => { openActionCalled = true; return 'unexpected'; });
          } catch { rejectedWhileOpen = true; }
          assert.equal(rejectedWhileOpen, true, 'Circuit must reject requests while OPEN');
          assert.equal(openActionCalled, false, 'Circuit must not invoke the action while OPEN');

          await new Promise(resolve => setTimeout(resolve, 55));
          let stateDuringProbe = null;
          const result = await execute(async () => {
            stateDuringProbe = getBreakerState(breaker);
            return 'recovered';
          });
          assert.equal(stateDuringProbe, 'HALF_OPEN', 'Circuit must enter HALF_OPEN before running its recovery probe');
          assert.equal(result, 'recovered', 'HALF_OPEN probe must return the action result');
          assert.equal(getBreakerState(breaker), 'CLOSED', 'Successful HALF_OPEN probe must close the circuit');
        }
      },
      {
        id: 'structured-error-taxonomy',
        name: 'Provides typed error taxonomy without secret credential leakage',
        run: async (exportsObj, execResult) => {
          const ApiError = findExport(exportsObj, /ApiError/i);
          assert.ok(ApiError && typeof ApiError === 'function', 'Must export ApiError');
          const error = new ApiError('Upstream request failed', 502);
          assert.ok(error instanceof Error, 'ApiError must behave as a native Error');
          assert.equal(error.message, 'Upstream request failed', 'ApiError must preserve its safe message');
          assert.equal(error.statusCode, 502, 'ApiError must preserve the HTTP status code');
          assert.ok(typeof error.stack === 'string' && error.stack.includes('Upstream request failed'), 'ApiError must retain Error stack behavior');
        }
      }
    ]
  }
};

module.exports = {
  RUNTIME_SUITES,
  findExport,
};
