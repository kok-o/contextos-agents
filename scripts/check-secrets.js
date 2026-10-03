#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseEnv } = require('node:util');
const { getStagedBlob } = require('../bin/lib/git-snapshot');

const ROOT_DIR = path.resolve(__dirname, '..');

// ── Shared Secret Rules & Patterns (from bin/lib/scan.js) ───────────────────
const {
  BLOCKED_EXACT_NAMES,
  BLOCKED_EXTENSIONS,
  SECRET_PATTERNS,
  redact,
} = require('../bin/lib/scan.js');

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
      const output = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM', '-z', '--no-ext-diff'], {
        cwd: ROOT_DIR,
        encoding: 'utf8',
      });
      return output.split('\0').filter(Boolean);
    }

    // Default or --all: scan git tracked files + untracked files in working tree
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT_DIR, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);

    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: ROOT_DIR, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);

    return Array.from(new Set([...tracked, ...untracked]));
  } catch (err) {
    console.error(`[check-secrets] Error: Failed to query git (${err.message}). Git repository verification required.`);
    process.exit(2);
  }
}


function findLocalEnvFiles(dir = ROOT_DIR) {
  const envFiles = [];
  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (['node_modules', '.git', '.swarm-worktrees', '.contextos-worktrees', '.external-skills', 'scratch'].includes(entry.name)) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if ((lower === '.env' || lower.startsWith('.env.')) && lower !== '.env.example') {
          envFiles.push(path.relative(ROOT_DIR, fullPath));
        }
      }
    }
  }
  walk(dir);
  return envFiles;
}

function scanFile(relPath, { isLocalEnvOnly = false, snapshot } = {}) {
  const fullPath = path.resolve(ROOT_DIR, relPath);
  if (!snapshot && !fs.existsSync(fullPath)) return [];

  const stat = snapshot ? { size: snapshot.length, isDirectory: () => false } : fs.statSync(fullPath);
  if (stat.isDirectory()) return [];

  const violations = [];
  const baseName = path.basename(relPath).toLowerCase();
  const extName = path.extname(relPath).toLowerCase();

  // 1. Check blocked filename (only for tracked or staged files)
  if (!isLocalEnvOnly && BLOCKED_EXACT_NAMES.has(baseName)) {
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
    content = snapshot ? snapshot.toString('utf8') : fs.readFileSync(fullPath, 'utf8');
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
          type: isLocalEnvOnly ? `Exposed Secret in Local Environment File (${name})` : name,
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

  const localEnvFiles = findLocalEnvFiles();
  const knownSecrets = [];
  for (const file of localEnvFiles) {
    const values = parseEnv(fs.readFileSync(path.join(ROOT_DIR, file), 'utf8'));
    for (const [name, value] of Object.entries(values)) {
      if (/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name) && value.length >= 16) knownSecrets.push(Buffer.from(value));
    }
  }
  // Ignored .env credentials are expected local configuration. Scan their exact
  // values against every exportable file, including normally exempt fixtures.
  const totalFilesCount = files.length;
  if (totalFilesCount === 0) {
    console.log('[check-secrets] No files to scan.');
    process.exit(0);
  }

  console.log(`[check-secrets] Scanning ${totalFilesCount} file(s) for secrets and blocked credentials (${mode})...`);

  const allViolations = [];
  for (const file of files) {
    const snapshot = mode === '--staged' ? getStagedBlob(file, ROOT_DIR) : undefined;
    const v = scanFile(file, { snapshot });
    if (v.length > 0) {
      allViolations.push(...v);
    }
    const fullPath = path.join(ROOT_DIR, file);
    const data = snapshot || (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile() ? fs.readFileSync(fullPath) : null);
    if (data && knownSecrets.some(secret => data.includes(secret))) {
      allViolations.push({ file, type: 'Local credential copied into exportable file', details: 'Credential value redacted.' });
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
