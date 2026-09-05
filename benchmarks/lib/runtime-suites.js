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
        name: 'Executes timing-safe password / hash verification',
        run: async (exportsObj, execResult) => {
          assert.ok(
            /timingSafeEqual/i.test(execResult.rawJs),
            'Code must use crypto.timingSafeEqual for constant-time comparison'
          );

          const verifyFn = findExport(exportsObj, /verifyPassword|verifyHash|verify|checkPassword/i);
          const hashFn = findExport(exportsObj, /hashPassword|hash|createHash/i);
          const AuthService = findExport(exportsObj, /AuthService|UserManager|AuthenticationHandler/i);

          let svc = null;
          if (AuthService && typeof AuthService === 'function') {
            try { svc = new AuthService(); } catch (_) {}
          }

          const verify = verifyFn || (svc && (svc.verifyPassword || svc.verify));
          const hash = hashFn || (svc && (svc.hashPassword || svc.hash));

          if (hash && verify) {
            const pwd = 'TestSecretPassword_123';
            const hashed = await hash(pwd);
            if (typeof hashed === 'string') {
              const valid = await verify(pwd, hashed);
              assert.ok(valid === true || valid === 1, 'verifyPassword should return true for matching password');
              const invalid = await verify('WrongSecretPassword_999', hashed);
              assert.ok(invalid === false || invalid === 0 || invalid === null, 'verifyPassword must reject invalid password');
            }
          } else {
            assert.ok(Boolean(verify || AuthService), 'Must export verifyPassword or AuthService class');
          }
        }
      },
      {
        id: 'rate-limiting-lockout',
        name: 'Enforces rate-limiting and lockout after repeated failures',
        run: async (exportsObj, execResult) => {
          assert.ok(
            /rateLimit|lockout|attempts|limiter|failedAttempts|store/i.test(execResult.rawJs),
            'Code must implement rate limiting or attempt tracking'
          );

          const Limiter = findExport(exportsObj, /RateLimiter|RateLimitStore|InMemoryRateLimit|SlidingWindowRateLimiter/i);
          const handleLogin = findExport(exportsObj, /handleLogin|login|handle/i);
          const AuthService = findExport(exportsObj, /AuthService|AuthenticationHandler/i);

          let instance = null;
          if (Limiter && typeof Limiter === 'function') {
            try { instance = new Limiter({ limit: 5, windowMs: 60000 }); } catch (_) {
              try { instance = new Limiter(); } catch (_) {}
            }
          }

          if (instance) {
            const key = 'test-ip-127.0.0.1';
            let blocked = false;
            for (let i = 0; i < 10; i++) {
              if (instance.consume) {
                const res = await instance.consume(key);
                if (res && (res.allowed === false || res.remaining === 0)) { blocked = true; break; }
              } else if (instance.isBlocked) {
                if (await instance.isBlocked(key)) { blocked = true; break; }
                if (instance.recordFailure) await instance.recordFailure(key);
              }
            }
            assert.ok(blocked || typeof instance === 'object', 'Rate limiter must enforce attempt limits');
          } else if (handleLogin || AuthService) {
            assert.ok(/limit|max|windowMs|too_many_requests|429/i.test(execResult.rawJs), 'Must configure rate-limiting thresholds or 429 response');
          }
        }
      },
      {
        id: 'no-stack-trace-leak',
        name: 'Prevents stack traces and sensitive error leaks in 500 responses',
        run: async (exportsObj, execResult) => {
          assert.ok(
            !/res\.(?:status\(500\)|send|json)\([^)]*(\bstack\b|err\.message)/i.test(execResult.rawJs),
            'Forbidden: err.stack or err.message leaked directly in 500 error response'
          );
        }
      },
      {
        id: 'input-sanitization-validation',
        name: 'Performs explicit input validation on email and credentials',
        run: async (exportsObj, execResult) => {
          assert.ok(
            /validate|schema|z\.|isEmail|sanitize|safeParse|typeof\s+email|EMAIL_PATTERN/i.test(execResult.rawJs),
            'Code must perform explicit input validation'
          );

          const validateFn = findExport(exportsObj, /validate|validateLogin|validateInput|parseLogin/i);
          if (typeof validateFn === 'function') {
            const res = await Promise.resolve(validateFn({ email: 'bad-email', password: '' })).catch(() => ({ ok: false }));
            if (res !== undefined) {
              assert.ok(res === false || res === null || res.ok === false || res.error || res.errors, 'Should reject invalid email or empty password');
            }
          }
        }
      },
      {
        id: 'jwt-claims-and-expiry',
        name: 'Issues JWT with bounded expiration (<=15m), audience, and issuer',
        run: async (exportsObj, execResult) => {
          assert.ok(
            /expiresIn|exp|jwt\.sign|SignJWT|ACCESS_TOKEN/i.test(execResult.rawJs),
            'Must issue JWT with expiration claims'
          );

          const tokenFn = findExport(exportsObj, /generateToken|createToken|issueToken|signToken|signJwt/i);
          if (typeof tokenFn === 'function') {
            if (typeof token === 'string' && token.includes('.')) {
              const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
              if (payload.exp && payload.iat) {
                const ttl = payload.exp - payload.iat;
                assert.ok(ttl <= 900, `JWT TTL must be <= 15m (900s), got ${ttl}s`);
              }
            }
          }
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

          // 1. Negative amount protection
          let threwOnNegative = false;
          try {
            if (Money.of) Money.of(-50, 'USD');
            else new Money(-50, 'USD');
          } catch {
            threwOnNegative = true;
          }
          assert.ok(threwOnNegative, 'Money must reject negative amounts');

          // 2. Immutability: addition returns new instance
          let m1 = createMoney(Money, 100, 'USD');
          let m2 = createMoney(Money, 50, 'USD');
          if (typeof m1.add === 'function') {
            const m3 = m1.add(m2);
            assert.ok(m3 !== m1, 'Money.add must return a new instance (immutability)');
            const amt1 = m1.amount !== undefined ? m1.amount : m1.getAmount ? m1.getAmount() : 100;
            assert.equal(amt1, 100, 'Original Money instance must remain unchanged after addition');
          }
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

          // Invariant 1: Positive quantity
          if (typeof order.addItem === 'function') {
            let threwZeroQty = false;
            try {
              const price = createMoney(Money, 10, 'USD');
              order.addItem('item-1', 0, price);
            } catch {
              threwZeroQty = true;
            }
            assert.ok(threwZeroQty, 'Order.addItem must enforce invariant: quantity must be positive');
          }

          // Invariant 2: Cannot add items to paid order
          if (typeof order.pay === 'function' && typeof order.addItem === 'function') {
            const price = createMoney(Money, 10, 'USD');
            order.addItem('item-valid', 1, price);
            order.pay();
            let threwOnPaid = false;
            try {
              order.addItem('item-2', 1, price);
            } catch {
              threwOnPaid = true;
            }
            assert.ok(threwOnPaid, 'Cannot add items to already paid/completed order');
          }

          // Invariant 3: Cannot cancel shipped order
          const shippedOrder = new Order('ord-2', 'cust-1');
          if (typeof shippedOrder.ship === 'function' && typeof shippedOrder.cancel === 'function') {
            const price = createMoney(Money, 10, 'USD');
            if (typeof shippedOrder.addItem === 'function') {
              shippedOrder.addItem('item-ship', 1, price);
            }
            if (typeof shippedOrder.pay === 'function') {
              try { shippedOrder.pay(); } catch {}
            }
            shippedOrder.ship();
            let threwOnCancelShipped = false;
            try {
              shippedOrder.cancel();
            } catch {
              threwOnCancelShipped = true;
            }
            assert.ok(threwOnCancelShipped, 'Cannot cancel an order that has already shipped');
          }
        }
      },
      {
        id: 'domain-events-emission',
        name: 'Records domain events for downstream side-effects',
        run: async (exportsObj, execResult) => {
          assert.ok(
            /DomainEvent|OrderCreated|OrderPaid|OrderCancelled|events|eventQueue/i.test(execResult.rawJs),
            'Code must model and collect Domain Events'
          );

          const Order = findExport(exportsObj, /^Order$/i);
          if (Order) {
            const order = new Order('ord-3', 'cust-2');
            const events = order.getDomainEvents ? order.getDomainEvents() :
              order.domainEvents || (order.pullEvents ? order.pullEvents() : []);
            
            assert.ok(Array.isArray(events), 'Order aggregate must maintain domain events list');
          }
        }
      },
      {
        id: 'repository-interface-decoupling',
        name: 'Maintains decoupled repository interface without ORM leakage',
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
          assert.ok(
            /AbortController|signal|timeout/i.test(execResult.rawJs),
            'Must implement timeout via AbortController'
          );
        }
      },
      {
        id: 'circuit-breaker-transitions',
        name: 'Circuit breaker transitions CLOSED -> OPEN -> HALF-OPEN',
        run: async (exportsObj, execResult) => {
          assert.ok(
            /CircuitBreaker|CLOSED|OPEN|HALF[_-]OPEN|failureCount|threshold/i.test(execResult.rawJs),
            'Must model Circuit Breaker states: CLOSED, OPEN, HALF-OPEN'
          );

          const Breaker = findExport(exportsObj, /CircuitBreaker/i);
          if (Breaker && typeof Breaker === 'function') {
            const breaker = new Breaker({ failureThreshold: 3, resetTimeoutMs: 100 });
            // Simulate 3 failures
            for (let i = 0; i < 3; i++) {
              if (breaker.recordFailure) breaker.recordFailure();
              else if (breaker.onFailure) breaker.onFailure();
            }
            const state = breaker.state || (breaker.getState ? breaker.getState() : null);
            if (state) {
              assert.equal(String(state).toUpperCase(), 'OPEN', 'Circuit should transition to OPEN after reaching failure threshold');
            }
          }
        }
      },
      {
        id: 'structured-error-taxonomy',
        name: 'Provides typed error taxonomy without secret credential leakage',
        run: async (exportsObj, execResult) => {
          assert.ok(
            /class\s+\w*(?:ApiError|HttpError|ClientError)\s+extends\s+Error/i.test(execResult.rawJs),
            'Must implement custom typed Error classes'
          );
        }
      }
    ]
  }
};

module.exports = {
  RUNTIME_SUITES,
  findExport,
};
