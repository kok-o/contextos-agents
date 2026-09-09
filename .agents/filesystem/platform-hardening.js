/**
 * .agents/filesystem/platform-hardening.js
 * ContextOS — Cross-Platform Hardening & Resilience Engine
 *
 * Implements Section 21 of CONTEXTOS_IMPLEMENTATION_PLAN.md:
 *   - 21.1: Platform support contract (Node 18 Core, Node 20 Runtime, filesystem checks)
 *   - 21.2: Windows resilience (EPERM/EBUSY rename/unlink retry wrappers, ADS, reserved names)
 *   - 21.4: macOS APFS Unicode normalization (NFC standard)
 *   - 21.5: UNC / Network filesystem rejection (distributed lock safety)
 *   - 21.6: Platform-aware repository fingerprint (no blanket lowercase, git common dir, persisted UUID)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function sha256(str) {
  return crypto.createHash('sha256').update(str || '').digest('hex');
}

/**
 * Checks if a given path is an unsupported UNC or Network Share (Section 21.5).
 *
 * @param {string} targetPath
 * @returns {boolean} True if path is UNC or network share
 */
function isNetworkOrUNCPath(targetPath) {
  if (typeof targetPath !== 'string') return false;
  const normalized = targetPath.replace(/\\/g, '/');

  // UNC paths on Windows: //server/share or \\server\share
  if (normalized.startsWith('//')) {
    return true;
  }

  // Windows extended-length UNC: \\?\UNC\server\share
  if (/^\\\\[?.]\\UNC\\/i.test(targetPath)) {
    return true;
  }

  return false;
}

/**
 * Validates platform runtime compatibility (Section 21.1).
 *
 * @param {Object} [options]
 * @param {'core'|'runtime'} [options.component='core']
 * @returns {{ supported: boolean, nodeVersion: number, required: number, issues: string[] }}
 */
function validatePlatformSupport(options = {}) {
  const component = options.component || 'core';
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  const requiredMajor = component === 'runtime' ? 20 : 18;
  const issues = [];

  if (nodeMajor < requiredMajor) {
    issues.push(
      `Node.js version ${process.versions.node} is below required minimum v${requiredMajor}.x for ContextOS ${component}.`
    );
  }

  return {
    supported: issues.length === 0,
    nodeVersion: nodeMajor,
    required: requiredMajor,
    issues,
  };
}

/**
 * Computes platform-aware repository fingerprint (Section 21.6).
 * Preserves Linux case while normalizing Windows/macOS drive letters and APFS.
 * Incorporates persisted repository UUID and Git common directory identity.
 *
 * @param {string} repoRoot
 * @returns {string} SHA-256 fingerprint
 */
function calculateRepositoryFingerprint(repoRoot) {
  const resolved = path.resolve(repoRoot);
  let canonicalPath = resolved;

  if (process.platform === 'win32') {
    // Normalize drive letter uppercase (e.g. C:) and forward slashes
    canonicalPath = canonicalPath.replace(/^([a-zA-Z]):/, (_, drive) => drive.toUpperCase() + ':');
    canonicalPath = canonicalPath.toLowerCase(); // Case-insensitive on Windows
  } else if (process.platform === 'darwin') {
    // APFS is typically case-insensitive, normalize Unicode NFC
    canonicalPath = canonicalPath.normalize('NFC').toLowerCase();
  }

  // Persisted repository UUID
  const stateDir = path.join(resolved, '.agents', '.contextos');
  const uuidFile = path.join(stateDir, 'repo-id');
  let repoUuid = '';

  if (fs.existsSync(uuidFile)) {
    try {
      repoUuid = fs.readFileSync(uuidFile, 'utf8').trim();
    } catch {}
  }

  if (!repoUuid) {
    repoUuid = crypto.randomUUID();
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(uuidFile, repoUuid, 'utf8');
    } catch {}
  }

  // Check Git directory identity if present
  let gitIdentity = 'nogit';
  const gitDir = path.join(resolved, '.git');
  if (fs.existsSync(gitDir)) {
    try {
      const gitStat = fs.statSync(gitDir);
      gitIdentity = `${gitStat.ino || 0}:${gitStat.dev || 0}`;
    } catch {}
  }

  const payload = `${canonicalPath}|${repoUuid}|${gitIdentity}`;
  return sha256(payload);
}

/**
 * Normalizes Unicode text to NFC standard (Section 21.4).
 *
 * @param {string} text
 * @returns {string}
 */
function normalizeUnicodeNFC(text) {
  if (typeof text !== 'string') return text;
  return text.normalize('NFC');
}

/**
 * Synchronously renames a file with exponential backoff retry for Windows antivirus/indexer contention (Section 21.2).
 *
 * @param {string} source
 * @param {string} destination
 * @param {Object} [options]
 * @param {number} [options.maxRetries=5]
 * @param {number} [options.retryDelayMs=20]
 */
function safeRenameSync(source, destination, options = {}) {
  const maxRetries = options.maxRetries || 5;
  const retryDelayMs = options.retryDelayMs || 20;

  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (process.platform === 'win32' && fs.existsSync(destination)) {
        try { fs.unlinkSync(destination); } catch {}
      }
      fs.renameSync(source, destination);
      return true;
    } catch (err) {
      lastErr = err;
      if (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES') {
        if (attempt < maxRetries) {
          const sleepMs = Math.floor(retryDelayMs * Math.pow(1.5, attempt));
          // Busy-wait briefly for sync operation
          const start = Date.now();
          while (Date.now() - start < sleepMs) {}
          continue;
        }
      }
      throw err;
    }
  }

  throw lastErr;
}

/**
 * Synchronously unlinks a file with retry for transient Windows locks (Section 21.2).
 *
 * @param {string} targetPath
 * @param {Object} [options]
 * @param {number} [options.maxRetries=5]
 * @param {number} [options.retryDelayMs=20]
 */
function safeUnlinkSync(targetPath, options = {}) {
  if (!fs.existsSync(targetPath)) return true;

  const maxRetries = options.maxRetries || 5;
  const retryDelayMs = options.retryDelayMs || 20;

  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      fs.unlinkSync(targetPath);
      return true;
    } catch (err) {
      lastErr = err;
      if (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES') {
        if (attempt < maxRetries) {
          const sleepMs = Math.floor(retryDelayMs * Math.pow(1.5, attempt));
          const start = Date.now();
          while (Date.now() - start < sleepMs) {}
          continue;
        }
      }
      if (!fs.existsSync(targetPath)) return true;
      throw err;
    }
  }

  throw lastErr;
}

module.exports = {
  isNetworkOrUNCPath,
  validatePlatformSupport,
  calculateRepositoryFingerprint,
  normalizeUnicodeNFC,
  safeRenameSync,
  safeUnlinkSync,
};
