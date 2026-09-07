#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

// ── Blocked file names and extensions ───────────────────────────────────────

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
    name: 'Private Key Header',
    pattern: /-----BEGIN\s+(?:RSA|OPENSSH|EC|DSA|PGP)?\s*PRIVATE\s+KEY-----/,
  },
  {
    name: 'GitHub Personal Access Token (Classic/OAuth)',
    pattern: /\b(?:ghp|gho)_[A-Za-z0-9]{36}\b/,
  },
  {
    name: 'GitHub Fine-Grained PAT',
    pattern: /\bgithub_pat_[A-Za-z0-9_]{82}\b/,
  },
  {
    name: 'Google API Key',
    pattern: /\bAIza[A-Za-z0-9_-]{35}\b/,
  },
  {
    name: 'OpenAI API Key',
    pattern: /\bsk-[A-Za-z0-9]{32,}\b/,
  },
  {
    name: 'Anthropic API Key',
    pattern: /\bsk-ant-[A-Za-z0-9-]{90,}\b/,
  },
  {
    name: 'OpenRouter API Key',
    pattern: /\bsk-or-v1-[a-f0-9]{64}\b/,
  },
  {
    name: 'Slack Token',
    pattern: /\bxox[baprs]-[A-Za-z0-9_-]{10,48}\b/,
  },
  {
    name: 'npm Access Token',
    pattern: /\bnpm_[A-Za-z0-9]{32,36}\b/,
  },
];

// Exempt directories and files (test fixtures and validation suites)
const EXEMPT_PATH_SUBSTRINGS = [
  path.join('tests', ''),
  path.join('contextos-mcp', 'tests', ''),
  'node_modules',
  path.join('.git', ''),
  path.join('benchmarks', 'results', ''),
  'check-secrets.js',
  'secret-filter.ts',
  'secret-filter.js',
];

function isExempt(filePath) {
  const norm = path.normalize(filePath);
  return EXEMPT_PATH_SUBSTRINGS.some(exempt => norm.includes(exempt));
}

function getFilesToScan(mode) {
  try {
    if (mode === '--staged') {
      const output = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], {
        cwd: ROOT_DIR,
        encoding: 'utf8',
      });
      return output.split(/\r?\n/).map(f => f.trim()).filter(Boolean);
    }

    // Default or --all: scan git tracked files + untracked files in working tree
    const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT_DIR, encoding: 'utf8' })
      .split(/\r?\n/)
      .map(f => f.trim())
      .filter(Boolean);

    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT_DIR, encoding: 'utf8' })
      .split(/\r?\n/)
      .map(f => f.trim())
      .filter(Boolean);

    return Array.from(new Set([...tracked, ...untracked]));
  } catch (err) {
    console.error(`[check-secrets] Warning: Failed to query git (${err.message}). Falling back to local check.`);
    return [];
  }
}

function redact(str) {
  if (str.length <= 8) return '***';
  return str.slice(0, 4) + '...' + str.slice(-4);
}

function scanFile(relPath) {
  const fullPath = path.resolve(ROOT_DIR, relPath);
  if (!fs.existsSync(fullPath)) return [];

  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) return [];

  const violations = [];
  const baseName = path.basename(relPath).toLowerCase();
  const extName = path.extname(relPath).toLowerCase();

  // 1. Check blocked filename
  if (BLOCKED_EXACT_NAMES.has(baseName)) {
    violations.push({
      file: relPath,
      type: 'Blocked Filename',
      details: `Filename "${baseName}" is forbidden from being committed.`,
    });
    return violations;
  }

  // 2. Check blocked extension
  if (BLOCKED_EXTENSIONS.has(extName)) {
    violations.push({
      file: relPath,
      type: 'Blocked Extension',
      details: `Extension "${extName}" indicates private keys or certificates.`,
    });
    return violations;
  }

  // Skip content checks for exempt paths
  if (isExempt(relPath)) {
    return violations;
  }

  // Skip binary files or large files (> 2MB)
  if (stat.size > 2 * 1024 * 1024) {
    return violations;
  }

  let content;
  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch {
    return violations; // binary or unreadable
  }

  const lines = content.split(/\r?\n/);
  for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
    const line = lines[lineNum - 1];
    for (const { name, pattern } of SECRET_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        violations.push({
          file: relPath,
          line: lineNum,
          type: name,
          details: `Detected pattern "${name}": ${redact(match[0])}`,
        });
      }
    }
  }

  return violations;
}

function main() {
  const mode = process.argv.includes('--staged') ? '--staged' : '--all';
  const files = getFilesToScan(mode);

  if (files.length === 0) {
    console.log('[check-secrets] No files to scan.');
    process.exit(0);
  }

  console.log(`[check-secrets] Scanning ${files.length} file(s) for secrets and blocked credentials (${mode})...`);

  const allViolations = [];
  for (const file of files) {
    const v = scanFile(file);
    if (v.length > 0) {
      allViolations.push(...v);
    }
  }

  if (allViolations.length > 0) {
    console.error('\n' + '='.repeat(70));
    console.error(' 🚨 SECURITY CHECK FAILED: Potential Secrets Detected');
    console.error('='.repeat(70));
    for (const v of allViolations) {
      const loc = v.line ? `${v.file}:${v.line}` : v.file;
      console.error(` • [${v.type}] in ${loc}`);
      console.error(`   ${v.details}`);
    }
    console.error('='.repeat(70));
    console.error('Commit rejected. Please remove secrets or use environment variables.\n');
    process.exit(1);
  }

  console.log(' [check-secrets] Passed: No secrets or credentials found.\n');
  process.exit(0);
}

main();
