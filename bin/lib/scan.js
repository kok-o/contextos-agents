/**
 * bin/lib/scan.js
 * ContextOS Staged Index Scanner & Code Governance Engine
 *
 * Inspects Git staged changes for:
 * 1. Hardcoded secrets, API tokens, private keys, and blocked files
 * 2. Unfinished lazy placeholder stubs in newly added code
 * 3. Scope containment violations against declared task scopes
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const syntheticFixtures = require('./secret-fixtures.json').entries;
const {
  findGitRoot,
  getStagedFiles,
  getStagedBlob,
  getStagedAddedLines,
} = require('./git-snapshot.js');

// ── Blocked File Names and Extensions ───────────────────────────────────────

const BLOCKED_EXACT_NAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.staging',
  '.env.test',
  '.netrc',
  '.git-credentials',
  '.npmrc',
  'credentials.json',
  'service-account.json',
  'serviceaccountkey.json',
  'id_rsa',
  'id_ed25519',
  'mcp_config.json',
]);

const BLOCKED_EXTENSIONS = new Set([
  '.key',
  '.pem',
  '.pfx',
  '.p12',
  '.pkcs12',
]);

// ── Secret Content Patterns ──────────────────────────────────────────────────

const SECRET_PATTERNS = [
  {
    ruleId: 'SEC-001',
    name: 'Private Key Header',
    pattern: /-----BEGIN\s+(?:RSA|OPENSSH|EC|DSA|PGP)?\s*PRIVATE\s+KEY-----/,
  },
  {
    ruleId: 'SEC-002',
    name: 'Hardcoded User Home Path Leak',
    pattern: /(?:[a-zA-Z]:[/\\]Users[/\\]|\/(?:home|Users)\/)[a-zA-Z0-9_-]+[/\\](?:Desktop|Documents|Downloads|code|projects|repos)\b/i,
  },
  {
    ruleId: 'SEC-003',
    name: 'GitHub Personal Access Token',
    pattern: /\b(?:ghp|gho)_[A-Za-z0-9]{36}\b/,
  },
  {
    ruleId: 'SEC-004',
    name: 'GitHub Fine-Grained PAT',
    pattern: /\bgithub_pat_[A-Za-z0-9_]{82}\b/,
  },
  {
    ruleId: 'SEC-005',
    name: 'Google API Key',
    pattern: /\bAIza[A-Za-z0-9_-]{35}\b/,
  },
  {
    ruleId: 'SEC-006',
    name: 'OpenAI API Key',
    pattern: /\bsk-[A-Za-z0-9]{32,}\b/,
  },
  {
    ruleId: 'SEC-007',
    name: 'Anthropic API Key',
    pattern: /\bsk-ant-[A-Za-z0-9-]{90,}\b/,
  },
  {
    ruleId: 'SEC-008',
    name: 'OpenRouter API Key',
    pattern: /\bsk-or-v1-[a-f0-9]{64}\b/,
  },
  {
    ruleId: 'SEC-009',
    name: 'Slack Token',
    pattern: /\bxox[baprs]-[A-Za-z0-9_-]{10,48}\b/,
  },
  {
    ruleId: 'SEC-010',
    name: 'npm Access Token',
    pattern: /\bnpm_[A-Za-z0-9]{32,36}\b/,
  },
  {
    ruleId: 'SEC-011',
    name: 'AWS Access Key ID',
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
];

// ── Lazy Placeholder Patterns ───────────────────────────────────────────────

const PLACEHOLDER_PATTERNS = [
  {
    ruleId: 'CODE-001',
    name: 'Lazy Stub Comment',
    pattern: /(?:\/\/|\/\*|#)\s*(?:TODO:\s*implement later|\.\.\.\s*rest of code stays here\s*\.\.\.|TODO:\s*implement\b)/i,
  },
  {
    ruleId: 'CODE-002',
    name: 'NotImplementedError Stub',
    pattern: /raise\s+NotImplementedError\s*\(\s*["'].*TODO.*["']\s*\)/i,
  },
  {
    ruleId: 'CODE-003',
    name: 'Python Pass Stub',
    pattern: /^\s*pass\s*#\s*TODO\b/i,
  },
];

// Only dependency/Git internals are outside content coverage. Tests are scanned.
const EXEMPT_SEGMENTS = new Set([
  '.git',
  'node_modules',
]);

function isExempt(filePath) {
  const norm = filePath.replace(/\\/g, '/');
  const segments = norm.split('/');
  return segments.some(seg => EXEMPT_SEGMENTS.has(seg));
}

function syntheticFixtureException(filePath, ruleId, line) {
  const file = filePath.replace(/\\/g, '/');
  const lineSha256 = crypto.createHash('sha256').update(line).digest('hex');
  return syntheticFixtures.find(entry => entry.file === file && entry.ruleId === ruleId && entry.lineSha256 === lineSha256);
}

function redact(str) {
  if (str.length <= 8) return '***';
  return str.slice(0, 4) + '...' + str.slice(-4);
}

/**
 * Checks if a relative path matches a glob pattern or prefix with strict segment boundaries.
 */
function matchesScope(filePath, pattern) {
  const normFile = filePath.replace(/\\/g, '/').toLowerCase();
  const normPattern = pattern.replace(/\\/g, '/').toLowerCase();

  if (normPattern.endsWith('/**')) {
    const prefix = normPattern.slice(0, -3);
    return normFile === prefix || normFile.startsWith(prefix + '/');
  }
  if (normPattern.endsWith('/*')) {
    const prefix = normPattern.slice(0, -2);
    if (!normFile.startsWith(prefix + '/')) return false;
    const rest = normFile.slice(prefix.length + 1);
    return !rest.includes('/');
  }
  if (normPattern.includes('*')) {
    const reg = new RegExp('^' + normPattern.replace(/\./g, '\\.').replace(/\*/g, '[^/]*') + '$');
    return reg.test(normFile);
  }
  return normFile === normPattern || normFile.startsWith(normPattern + '/');
}

/**
 * Runs the staged scanner on the given repository root.
 *
 * @param {Object} options - Scan configuration options
 * @returns {Object} Structured scan results with findings and status code
 */
function runScan(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const gitRoot = findGitRoot(cwd);

  if (!gitRoot) {
    return {
      ok: false,
      code: 2,
      error: 'Not a Git repository. ContextOS scanner requires Git.',
      findings: [],
      stats: { filesScanned: 0, violations: 0 },
    };
  }

  const checkSecrets = options.secrets !== false;
  const checkPlaceholders = Boolean(options.placeholders);
  const enforce = Boolean(options.enforce);

  let targetScopeFile = options.scope || null;
  let scopeStatus = 'not_configured';

  if (!targetScopeFile) {
    const defaultScope = path.join(gitRoot, '.agents', 'task-scope.json');
    if (fs.existsSync(defaultScope)) {
      targetScopeFile = '.agents/task-scope.json';
    }
  }

  let allowedScopePatterns = null;
  if (targetScopeFile) {
    const resolvedScopePath = path.resolve(gitRoot, targetScopeFile);
    if (!fs.existsSync(resolvedScopePath)) {
      return {
        ok: false,
        code: 2,
        error: `Scope file not found: ${targetScopeFile}`,
        findings: [],
        stats: { filesScanned: 0, violations: 0 },
      };
    }
    try {
      const scopeData = JSON.parse(fs.readFileSync(resolvedScopePath, 'utf8'));
      const list = Array.isArray(scopeData) ? scopeData : scopeData.allowedPaths || scopeData.files;
      if (!Array.isArray(list)) {
        throw new Error('Scope declaration must be an array of paths or have an allowedPaths array');
      }
      for (const p of list) {
        if (path.isAbsolute(p) || p.includes('..')) {
          throw new Error(`Scope entry "${p}" is invalid (must be relative and cannot traverse outside repo)`);
        }
      }
      allowedScopePatterns = list;
      scopeStatus = `active (${targetScopeFile})`;
    } catch (err) {
      return {
        ok: false,
        code: 2,
        error: `Invalid task scope file: ${err.message}`,
        findings: [],
        stats: { filesScanned: 0, violations: 0 },
      };
    }
  }

  let stagedEntries = [];
  try {
    stagedEntries = getStagedFiles(gitRoot);
  } catch (err) {
    return {
      ok: false,
      code: 2,
      error: `Failed to inspect Git index: ${err.message}`,
      findings: [],
      stats: { filesScanned: 0, violations: 0 },
    };
  }

  const findings = [];
  const excluded = [];
  let contentFilesScanned = 0;
  let addedLinesMap = new Map();
  if (checkPlaceholders) {
    try {
      const activePaths = stagedEntries.filter(e => e.status !== 'D').map(e => e.path);
      addedLinesMap = getStagedAddedLines(gitRoot, activePaths);
    } catch (err) {
      return {
        ok: false,
        code: 2,
        error: `Failed to inspect staged added lines: ${err.message}`,
        findings: [],
        stats: { filesScanned: stagedEntries.length, violations: 0 },
      };
    }
  }

  for (const entry of stagedEntries) {
    const relPath = entry.path;
    const baseName = path.basename(relPath).toLowerCase();
    const extName = path.extname(relPath).toLowerCase();

    // 1. Scope Containment Check (checked for ALL staged actions: added, modified, deleted, renamed)
    if (allowedScopePatterns) {
      const inScope = allowedScopePatterns.some(p => matchesScope(relPath, p));
      if (!inScope) {
        findings.push({
          ruleId: 'SCOPE-001',
          file: relPath,
          type: 'Scope Violation',
          severity: 'error',
          details: `Staged file "${relPath}" is outside allowed task scope`,
        });
      }
      if (entry.oldPath) {
        const oldInScope = allowedScopePatterns.some(p => matchesScope(entry.oldPath, p));
        if (!oldInScope) {
          findings.push({
            ruleId: 'SCOPE-001',
            file: entry.oldPath,
            type: 'Scope Violation',
            severity: 'error',
            details: `Source file of rename "${entry.oldPath}" is outside allowed task scope`,
          });
        }
      }
    }

    // Skip deleted files from content and blocked filename checks
    if (entry.status === 'D') continue;

    // 2. Blocked Exact Names Check
    if (checkSecrets && BLOCKED_EXACT_NAMES.has(baseName)) {
      findings.push({
        ruleId: 'SEC-000',
        file: relPath,
        type: 'Blocked Filename',
        severity: 'error',
        details: `Filename "${baseName}" is forbidden from being committed into Git.`,
      });
      continue;
    }

    // 3. Blocked Extensions Check
    if (checkSecrets && BLOCKED_EXTENSIONS.has(extName)) {
      findings.push({
        ruleId: 'SEC-000',
        file: relPath,
        type: 'Blocked Extension',
        severity: 'error',
        details: `Extension "${extName}" indicates private cryptographic keys or certificates.`,
      });
      continue;
    }

    // Skip content scan for exempt paths
    if (isExempt(relPath)) {
      excluded.push({ file: relPath, reason: 'Git/dependency internals', checks: ['secrets', 'placeholders'] });
      continue;
    }

    // Read blob from index (fails closed with code 2 on read errors in any mode)
    let blob;
    try {
      blob = getStagedBlob(relPath, gitRoot);
    } catch (err) {
      return {
        ok: false,
        code: 2,
        error: `Failed to read staged blob for "${relPath}": ${err.message}`,
        findings,
        stats: { filesScanned: stagedEntries.length, violations: findings.length },
      };
    }

    if (!blob) {
      return {
        ok: false,
        code: 2,
        error: `Failed to read staged blob for "${relPath}": file unreadable in git index`,
        findings,
        stats: { filesScanned: stagedEntries.length, violations: findings.length },
      };
    }

    // Large files (> 2MB): fail-closed in enforce mode
    if (blob.length > 2 * 1024 * 1024) {
      excluded.push({ file: relPath, reason: 'Content exceeds 2MB limit', checks: ['secrets', 'placeholders'] });
      if (enforce) {
        findings.push({
          ruleId: 'SCAN-SKIP-001',
          file: relPath,
          type: 'Skipped Large File',
          severity: 'error',
          details: `Staged file "${relPath}" exceeds 2MB limit (${(blob.length / (1024 * 1024)).toFixed(2)}MB) and cannot be verified for secrets in enforce mode.`,
        });
      }
      continue;
    }

    const content = blob.toString('utf8');
    const lines = content.split(/\r?\n/);
    contentFilesScanned++;

    // 4. Staged Content Secrets Check
    if (checkSecrets) {
      for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
        const line = lines[lineNum - 1];
        for (const { ruleId, name, pattern } of SECRET_PATTERNS) {
          const match = line.match(pattern);
          if (match) {
            const exception = syntheticFixtureException(relPath, ruleId, line);
            if (exception) {
              excluded.push({ file: relPath, line: lineNum, ruleId, reason: exception.reason });
              continue;
            }
            findings.push({
              ruleId,
              file: relPath,
              line: lineNum,
              type: name,
              severity: 'error',
              details: `Detected pattern "${name}": ${redact(match[0])}`,
            });
          }
        }
      }
    }

    // 5. Newly Added Code Placeholders Check
    if (checkPlaceholders && addedLinesMap.has(relPath)) {
      const addedLines = addedLinesMap.get(relPath);
      // Skip markdown and doc files for placeholder checks
      if (extName !== '.md' && extName !== '.txt') {
        for (const { line, content: addedLine } of addedLines) {
          if (addedLine.includes('contextos:allow-placeholder')) continue;

          for (const { ruleId, name, pattern } of PLACEHOLDER_PATTERNS) {
            const match = addedLine.match(pattern);
            if (match) {
              findings.push({
                ruleId,
                file: relPath,
                line,
                type: name,
                severity: 'warning',
                details: `Detected un-implemented placeholder stub: "${match[0].trim()}"`,
              });
            }
          }
        }
      }
    }
  }

  const hasViolations = findings.length > 0;
  // If enforce is true, violations return code 1. If enforce is false, warnings return code 0.
  // Incomplete/failed inspection returns code 2 in all modes.
  const exitCode = hasViolations && enforce ? 1 : 0;

  return {
    ok: exitCode === 0,
    code: exitCode,
    message: !hasViolations
      ? 'No violations found in the staged files'
      : (enforce
        ? 'Blocking violations detected in staged index'
        : `${findings.length} finding(s) reported in advisory mode; nothing blocks the commit (use --enforce to fail on them)`),
    gitRoot,
    enforce,
    scope: {
      file: targetScopeFile,
      status: scopeStatus,
    },
    findings,
    coverage: { excluded },
    stats: {
      stagedFilesCount: stagedEntries.length,
      contentFilesScanned,
      violationsCount: findings.length,
      errorsCount: findings.filter(f => f.severity === 'error').length,
      warningsCount: findings.filter(f => f.severity === 'warning').length,
    },
  };
}

module.exports = {
  runScan,
  BLOCKED_EXACT_NAMES,
  BLOCKED_EXTENSIONS,
  SECRET_PATTERNS,
  PLACEHOLDER_PATTERNS,
  matchesScope,
  redact,
  isExempt,
  syntheticFixtureException,
};
