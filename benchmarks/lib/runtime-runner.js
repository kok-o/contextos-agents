'use strict';

const vm = require('vm');
const crypto = require('crypto');

/**
 * Cleans parameter types from a function parameter signature.
 */
function cleanParamTypes(params) {
  if (!params.trim()) return '';
  return params.split(',').map(p => {
    const trimmed = p.trim();
    // param: Type = default
    const defaultMatch = trimmed.match(/^([\w$]+)\s*\??\s*:\s*[^=]+(=.*)$/);
    if (defaultMatch) {
      return `${defaultMatch[1].trim()} ${defaultMatch[2].trim()}`;
    }
    // param: Type
    const simpleMatch = trimmed.match(/^([\w$]+)\s*\??\s*:\s*.+$/);
    if (simpleMatch) {
      return simpleMatch[1].trim();
    }
    return trimmed;
  }).join(', ');
}

let stripTypeScriptTypesNative;
try {
  stripTypeScriptTypesNative = require('node:module').stripTypeScriptTypes;
} catch (_) {}

/**
 * Robust TypeScript to CommonJS transformer.
 * Works seamlessly across Node.js 18, 20, and 22.
 * Auto-repairs unclosed braces from EOF truncation, compiles constructor parameter properties,
 * safely strips interfaces (including nested types), functions, and method type annotations
 * without mangling object literals or expressions, and cleanly bridges ESM imports and exports.
 */
function stripTypeScript(code) {
  if (!code || typeof code !== 'string') return '';

  let js = code;

  // 1. Transform ESM imports BEFORE stripping anything with "as" keyword (casts)
  js = js.replace(/import\s+\*\s+as\s+([\w$]+)\s+from\s+['"]([^'"]+)['"];?/g, 'const $1 = require(\'$2\');');

  js = js.replace(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/g, (match, imports, pkg) => {
    const seen = new Set();
    const transformed = imports.split(',').map(item => {
      const parts = item.trim().split(/\s+as\s+/);
      const name = (parts[1] || parts[0] || '').trim();
      if (!name || seen.has(name)) return null;
      seen.add(name);
      return parts.length === 2 ? `${parts[0].trim()}: ${parts[1].trim()}` : parts[0].trim();
    }).filter(Boolean).join(', ');
    return `const { ${transformed} } = require('${pkg}');`;
  });

  js = js.replace(/import\s+([\w$]+)\s+from\s+['"]([^'"]+)['"];?/g, 'const $1 = require(\'$2\');');

  // 2. Pre-clean stubs and ellipses so native parser doesn't choke
  js = js.replace(/throw\s+new\s+Error\s*\.\.\./g, "throw new Error('Validation error')");
  js = js.replace(/throw\s+\.\.\.;?/g, "throw new Error('Operation failed');");
  js = js.replace(/if\s*\(([^)]+)\)\s*\.\.\./g, "if ($1) { throw new Error('Validation error'); }");
  js = js.replace(/\{\s*\.\.\.\s*\}/g, '{ return null; }');
  js = js.replace(/=\s*\.\.\.;?/g, '= null;');
  js = js.replace(/^\s*\.\.\.\s*$/gm, '/* stub */');

  // Clean invalid question marks in imports (e.g. `import { foo? }`)
  js = js.replace(/,\s*[\w$]+\?\s*(?=,|\})/g, '');
  js = js.replace(/[\w$]+\?\s*,/g, '');

  // 3. Handle constructor parameter properties (e.g. constructor(public amount: number))
  js = js.replace(/constructor\s*\(([^)]*)\)\s*\{/g, (match, params) => {
    const assignments = [];
    const cleanedParams = params.split(',').map(param => {
      const matchProp = param.match(/\b(public|private|protected|readonly)\s+([\w$]+)/);
      if (matchProp) {
        const name = matchProp[2];
        assignments.push(`this.${name} = ${name};`);
      }
      return param.replace(/\b(public|private|protected|readonly)\s+/g, '');
    }).join(',');

    if (assignments.length > 0) {
      return `constructor(${cleanedParams}) {\n  ${assignments.join('\n  ')}\n`;
    }
    return match;
  });

  // 4. Try Node native TypeScript stripper if available (Node 22+)
  let nativeStripped = false;
  if (typeof stripTypeScriptTypesNative === 'function') {
    try {
      js = stripTypeScriptTypesNative(js);
      nativeStripped = true;
    } catch (_) {
      // fallback to regex pipeline
    }
  }

  if (!nativeStripped) {
    // 5. Remove type-only imports and declare statements
    js = js.replace(/import\s+type\s+[^;]+;/g, '');
    js = js.replace(/declare\s+[\s\S]*?;/g, '');

    // 6. Remove interfaces (handling nested braces)
    let interfaceMatch;
    while ((interfaceMatch = js.match(/\b(?:export\s+)?interface\s+[\w$]+[^{]*\{/))) {
      const startIdx = interfaceMatch.index;
      const openBraceIdx = startIdx + interfaceMatch[0].length - 1;
      let depth = 1;
      let i = openBraceIdx + 1;
      while (i < js.length && depth > 0) {
        if (js[i] === '{') depth++;
        else if (js[i] === '}') depth--;
        i++;
      }
      js = js.slice(0, startIdx) + js.slice(i);
    }

    // 7. Remove type aliases: type Foo<T> = ...; (handling nested braces)
    let typeMatch;
    while ((typeMatch = js.match(/\b(?:export\s+)?type\s+[\w$]+(?:<[^>]*>)?\s*=/))) {
      const startIdx = typeMatch.index;
      let i = startIdx + typeMatch[0].length;
      let braceDepth = 0;
      while (i < js.length) {
        if (js[i] === '{') braceDepth++;
        else if (js[i] === '}') braceDepth--;
        else if (js[i] === ';' && braceDepth <= 0) {
          i++;
          break;
        }
        i++;
      }
      js = js.slice(0, startIdx) + js.slice(i);
    }

    // 8. Clean parameters in functions, methods, and constructors
    js = js.replace(
      /(\b(?:async\s+)?function\*?\s+[\w$]*\s*(?:<[^>]*>)?\s*\()([^)]*)\)(\s*(?::\s*[^={;]+)?\s*\{)/g,
      (fullMatch, prefix, params, suffix) => `${prefix}${cleanParamTypes(params)}) ${suffix}`
    );

    js = js.replace(
      /(^|\n)\s*(?:(?:public|private|protected|static|async)\s+)*([#\w$]+)\s*\(([^)]*)\)\s*(?::\s*[^={;]+)?\s*\{/g,
      (fullMatch, lead, name, params) => `${lead}  ${name}(${cleanParamTypes(params)}) {`
    );

    js = js.replace(
      /constructor\s*\(([^)]*)\)\s*\{/g,
      (match, params) => `constructor(${cleanParamTypes(params)}) {`
    );
  }

  // 9. Remove access modifiers everywhere
  js = js.replace(/\b(public|private|protected|readonly|override)\s+/g, '');

  // 10. Remove 'implements Foo, Bar' on classes
  js = js.replace(/\s+implements\s+[\w$,\s<>]+(?=\s*\{)/g, '');

  // 11. Clean class field declarations: `foo: type = val;` -> `foo = val;`, `foo: type;` -> `foo;`
  js = js.replace(/^\s*([#\w$]+)\s*:\s*[^=;\n]+(=|;)/gm, '$1 $2');

  // 12. Remove generic invocations and casts: `<T>(`, `as Type`
  js = js.replace(/<[\w$,\s<>\[\]|&]+>(?=\s*\()/g, '');
  js = js.replace(/\)\s*:\s*(?:Promise<[^>]+>|[\w$<>[\]|&]+|\([^)]*\)\s*=>\s*[^;{]+)\s*(\{|=>>?)/g, ') $1');
  js = js.replace(/\s+as\s+const\b/g, '');
  js = js.replace(/\s+as\s+(?:any|string|number|boolean|unknown|Buffer|[\w$<>\[\]|&]+)\b/g, '');

  // 13. Auto-close missing braces if model was cut off near EOF
  const openBraces = (js.match(/\{/g) || []).length;
  const closeBraces = (js.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    js += '\n' + '}'.repeat(openBraces - closeBraces);
  }

  // 14. Track and transform exports
  const exportedNames = new Set();
  js = js.replace(/export\s+default\s+/g, 'module.exports.default = module.exports = ');

  js = js.replace(/export\s+(class|function\*?|async\s+function\*?)\s+([\w$]+)/g, (m, kind, name) => {
    exportedNames.add(name);
    return `${kind} ${name}`;
  });

  js = js.replace(/export\s+(const|let|var)\s+([\w$]+)/g, (m, kind, name) => {
    exportedNames.add(name);
    return `${kind} ${name}`;
  });

  js = js.replace(/export\s+\{([^}]+)\};?/g, (match, list) => {
    list.split(',').forEach(item => {
      const parts = item.trim().split(/\s+as\s+/);
      const name = (parts[1] || parts[0] || '').trim();
      if (name) exportedNames.add(name);
    });
    return '';
  });

  for (const name of exportedNames) {
    js += `\ntry { if (typeof ${name} !== 'undefined') module.exports.${name} = ${name}; } catch (_) {}\n`;
  }

  return js;
}

/**
 * Built-in lightweight JWT mock for testing code that signs/verifies tokens without needing npm jsonwebtoken.
 */
function createJwtMock() {
  return {
    sign: (payload, secret, options = {}) => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const now = Math.floor(Date.now() / 1000);
      let exp = options.expiresIn;
      if (typeof exp === 'string') {
        const num = parseInt(exp, 10);
        if (exp.endsWith('m')) exp = now + num * 60;
        else if (exp.endsWith('h')) exp = now + num * 3600;
        else if (exp.endsWith('s')) exp = now + num;
        else exp = now + (num || 900);
      } else if (typeof exp === 'number') {
        exp = now + exp;
      } else {
        exp = now + 900;
      }

      const fullPayload = {
        ...payload,
        iat: now,
        exp,
        iss: options.issuer || payload.iss,
        aud: options.audience || payload.aud,
      };

      const body = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
      const sig = crypto.createHmac('sha256', String(secret)).update(`${header}.${body}`).digest('base64url');
      return `${header}.${body}.${sig}`;
    },
    verify: (token, secret, options = {}) => {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid token');
      const [header, body, sig] = parts;
      const expected = crypto.createHmac('sha256', String(secret)).update(`${header}.${body}`).digest('base64url');
      if (sig !== expected) throw new Error('Invalid signature');
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('jwt expired');
      }
      return payload;
    },
    decode: (token) => {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      try {
        return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      } catch {
        return null;
      }
    }
  };
}

/**
 * Creates a sandboxed require implementation supporting Node core modules and common mock libs.
 */
function createSandboxedRequire(customMocks = {}) {
  const jwtMock = createJwtMock();

  return function sandboxedRequire(modName) {
    if (customMocks[modName]) {
      return customMocks[modName];
    }
    const cleanMod = modName.replace(/^node:/, '');
    if (['crypto', 'util', 'events', 'buffer', 'stream', 'path', 'os', 'assert', 'url'].includes(cleanMod)) {
      return require(cleanMod);
    }
    if (cleanMod === 'jsonwebtoken') {
      return jwtMock;
    }
    if (cleanMod === 'bcrypt' || cleanMod === 'bcryptjs') {
      return {
        genSalt: async (rounds) => 'salt',
        genSaltSync: (rounds) => 'salt',
        hash: async (pwd, rounds) => crypto.createHash('sha256').update(pwd).digest('hex'),
        hashSync: (pwd, rounds) => crypto.createHash('sha256').update(pwd).digest('hex'),
        compare: async (pwd, hash) => {
          const computed = crypto.createHash('sha256').update(pwd).digest('hex');
          return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
        },
        compareSync: (pwd, hash) => {
          const computed = crypto.createHash('sha256').update(pwd).digest('hex');
          return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
        }
      };
    }
    return {};
  };
}

/**
 * Executes a code snippet inside a secure sandbox and returns module.exports.
 */
function executeInSandbox(code, options = {}) {
  const timeoutMs = options.timeoutMs || 4000;
  const jsCode = stripTypeScript(code);

  const sandboxExports = {};
  const sandboxModule = { exports: sandboxExports };
  const mockRequire = createSandboxedRequire(options.mocks || {});

  const contextObj = {
    module: sandboxModule,
    exports: sandboxExports,
    require: mockRequire,
    console,
    Buffer,
    promisify: require('node:util').promisify,
    crypto: require('node:crypto'),
    util: require('node:util'),
    fetch: globalThis.fetch,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate: typeof setImmediate !== 'undefined' ? setImmediate : ((fn, ...args) => setTimeout(fn, 0, ...args)),
    clearImmediate: typeof clearImmediate !== 'undefined' ? clearImmediate : (id => clearTimeout(id)),
    Date,
    Error,
    TypeError,
    RangeError,
    Math,
    JSON,
    Promise,
    URL: typeof URL !== 'undefined' ? URL : (globalThis.URL || require('node:url').URL),
    AbortController: globalThis.AbortController || class { constructor() { this.signal = {}; } abort() {} },
    ...options.globals,
  };

  const context = vm.createContext(contextObj);

  try {
    const script = new vm.Script(jsCode, {
      timeout: timeoutMs,
      displayErrors: true,
    });
    script.runInContext(context);
    return {
      compiled: true,
      exports: sandboxModule.exports,
      error: null,
      rawJs: jsCode,
      originalCode: code,
    };
  } catch (err) {
    return {
      compiled: false,
      exports: null,
      error: err,
      rawJs: jsCode,
      originalCode: code,
    };
  }
}

/**
 * Runs a suite of runtime test functions against the sandboxed exports.
 */
async function runRuntimeSuite(taskSuite, rawCode, options = {}) {
  const started = Date.now();
  const execResult = executeInSandbox(rawCode, options);

  if (!execResult.compiled) {
    return {
      compiled: false,
      compilationError: execResult.error.message,
      tests: taskSuite.tests.map(t => ({
        id: t.id,
        name: t.name,
        passed: false,
        durationMs: 0,
        error: `Compilation/Syntax Failure: ${execResult.error.message}`,
      })),
      passRate: 0,
      totalPassed: 0,
      totalTests: taskSuite.tests.length,
      totalDurationMs: Date.now() - started,
    };
  }

  const exportsObj = execResult.exports;
  const testResults = [];
  let passedCount = 0;

  for (const testDef of taskSuite.tests) {
    const testStart = Date.now();
    try {
      await Promise.race([
        testDef.run(exportsObj, execResult),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Test timed out after 3000ms`)), 3000))
      ]);

      testResults.push({
        id: testDef.id,
        name: testDef.name,
        passed: true,
        durationMs: Date.now() - testStart,
      });
      passedCount++;
    } catch (err) {
      testResults.push({
        id: testDef.id,
        name: testDef.name,
        passed: false,
        durationMs: Date.now() - testStart,
        error: err.message,
      });
    }
  }

  const passRate = taskSuite.tests.length > 0 ? Math.round((passedCount / taskSuite.tests.length) * 100) : 100;

  return {
    compiled: true,
    compilationError: null,
    tests: testResults,
    passRate,
    totalPassed: passedCount,
    totalTests: taskSuite.tests.length,
    totalDurationMs: Date.now() - started,
  };
}

module.exports = {
  stripTypeScript,
  cleanParamTypes,
  createJwtMock,
  executeInSandbox,
  runRuntimeSuite,
};
