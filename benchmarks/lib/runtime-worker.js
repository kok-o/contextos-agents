'use strict';

const { runRuntimeSuite } = require('./runtime-runner');
const { RUNTIME_SUITES } = require('./runtime-suites');
const nativeCrypto = require('node:crypto');

async function readInput(maxBytes = 1_100_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Worker input exceeded its size limit.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function createDeterministicFetchMock() {
  const calls = [];
  const mockFetch = (url, init = {}) => {
    const signal = init && init.signal;
    const call = { url: String(url), signal: signal || null, aborted: false };
    calls.push(call);

    return new Promise((resolve, reject) => {
      const abort = () => {
        call.aborted = true;
        const error = new Error('Deterministic benchmark fetch was aborted.');
        error.name = 'AbortError';
        reject(error);
      };
      if (!signal || typeof signal.addEventListener !== 'function') return;
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
    });
  };
  Object.defineProperty(mockFetch, 'calls', { value: calls });
  return mockFetch;
}

function createCryptoAuditHarness() {
  const audit = { timingSafeEqualCalls: 0, passwordKdfCalls: 0 };
  const crypto = new Proxy(nativeCrypto, {
    get(target, property) {
      if (property === 'timingSafeEqual') {
        return (left, right) => {
          audit.timingSafeEqualCalls++;
          return target.timingSafeEqual(left, right);
        };
      }
      if (['scrypt', 'scryptSync', 'pbkdf2', 'pbkdf2Sync'].includes(property)) {
        const value = Reflect.get(target, property, target);
        return (...args) => {
          audit.passwordKdfCalls++;
          return value.apply(target, args);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  const kdf = (value, salt) => crypto.scryptSync(String(value), salt, 32).toString('hex');
  let saltSequence = 0;
  const nextSalt = () => `benchmark-salt-${++saltSequence}`;
  const parseHash = encoded => {
    const match = /^\$benchmark-kdf\$([^$]+)\$([a-f0-9]{64})$/.exec(String(encoded));
    return match ? { salt: match[1], digest: match[2] } : null;
  };
  const bcryptMock = {
    genSalt: async () => nextSalt(),
    genSaltSync: () => nextSalt(),
    hash: async (value, saltOrRounds) => {
      const salt = typeof saltOrRounds === 'string' ? saltOrRounds : nextSalt();
      return `$benchmark-kdf$${salt}$${kdf(value, salt)}`;
    },
    hashSync: (value, saltOrRounds) => {
      const salt = typeof saltOrRounds === 'string' ? saltOrRounds : nextSalt();
      return `$benchmark-kdf$${salt}$${kdf(value, salt)}`;
    },
    compare: async (value, encoded) => {
      const parsed = parseHash(encoded);
      if (!parsed) return false;
      const expected = Buffer.from(kdf(value, parsed.salt));
      const actual = Buffer.from(parsed.digest);
      if (expected.length !== actual.length) return false;
      return crypto.timingSafeEqual(expected, actual);
    },
    compareSync: (value, encoded) => {
      const parsed = parseHash(encoded);
      if (!parsed) return false;
      const expected = Buffer.from(kdf(value, parsed.salt));
      const actual = Buffer.from(parsed.digest);
      if (expected.length !== actual.length) return false;
      return crypto.timingSafeEqual(expected, actual);
    },
  };
  const argon2Mock = {
    hash: async value => {
      const salt = nextSalt();
      return `$argon2id$benchmark$${salt}$${kdf(value, salt)}`;
    },
    verify: async (encoded, value) => {
      const match = /^\$argon2id\$benchmark\$([^$]+)\$([a-f0-9]{64})$/.exec(String(encoded));
      if (!match) return false;
      const expected = Buffer.from(kdf(value, match[1]));
      const actual = Buffer.from(match[2]);
      return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    },
  };
  return {
    audit,
    crypto,
    mocks: {
      crypto,
      'node:crypto': crypto,
      bcrypt: bcryptMock,
      bcryptjs: bcryptMock,
      argon2: argon2Mock,
    },
  };
}

async function main() {
  const request = await readInput();
  const suite = RUNTIME_SUITES[request.suiteId];
  if (!suite) throw new Error(`Unknown runtime suite: ${String(request.suiteId)}`);
  if (typeof request.rawCode !== 'string') throw new Error('Worker request is missing generated code.');

  const fetchMock = createDeterministicFetchMock();
  const cryptoHarness = createCryptoAuditHarness();
  const instrumentedSuite = {
    ...suite,
    tests: suite.tests.map(test => ({
      ...test,
      run: (exportsObj, execResult) => {
        execResult.fetchMock = fetchMock;
        execResult.cryptoAudit = cryptoHarness.audit;
        return test.run(exportsObj, execResult);
      },
    })),
  };
  const result = await runRuntimeSuite(instrumentedSuite, request.rawCode, {
    inProcess: true,
    console: Object.freeze({ log() {}, info() {}, warn() {}, error() {}, debug() {} }),
    fetch: fetchMock,
    globals: { crypto: cryptoHarness.crypto },
    mocks: cryptoHarness.mocks,
  });
  process.stdout.write(JSON.stringify(result));
}

main().catch(error => {
  process.stderr.write(String(error?.stack || error));
  process.exitCode = 1;
});
