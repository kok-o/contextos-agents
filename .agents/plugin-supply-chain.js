/**
 * .agents/plugin-supply-chain.js
 * ContextOS — Plugin Supply Chain Security & Integrity Engine
 *
 * Implements Section 20 of CONTEXTOS_IMPLEMENTATION_PLAN.md:
 *   - 20.1: Source pinning (exact Git commit SHA, npm integrity sha512)
 *   - 20.3: Full-tree digest calculation (path, size, mode, sha256)
 *   - 20.4: Safe archive extraction scanner (path traversal, absolute paths, Windows reserved names, zip bombs)
 *   - 20.5: Trust levels (builtin-signed, user-local, third-party-pinned, third-party-floating)
 *   - 20.6: User-local script capability grants with hash invalidation
 *   - 20.7: Atomic update with local modification protection and rollback
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WINDOWS_RESERVED_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Calculates a deterministic full-tree digest for a directory (Section 20.3).
 *
 * @param {string} dirPath
 * @returns {{ treeDigest: string, files: Array<{ relativePath: string, size: number, mode: number, sha256: string }> }}
 */
function calculateTreeDigest(dirPath) {
  const resolvedDir = path.resolve(dirPath);
  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Directory does not exist: ${resolvedDir}`);
  }

  const fileEntries = [];

  function walk(current) {
    const items = fs.readdirSync(current, { withFileTypes: true });
    // Deterministic sorting
    items.sort((a, b) => a.name.localeCompare(b.name));

    for (const item of items) {
      const fullPath = path.join(current, item.name);
      if (item.isDirectory()) {
        walk(fullPath);
      } else if (item.isFile()) {
        const rel = path.relative(resolvedDir, fullPath).replace(/\\/g, '/');
        const stat = fs.statSync(fullPath);
        const content = fs.readFileSync(fullPath);
        const hash = sha256(content);

        fileEntries.push({
          relativePath: rel,
          size: stat.size,
          mode: stat.mode & 0o777,
          sha256: hash,
        });
      }
    }
  }

  walk(resolvedDir);

  // Deterministically sort by relativePath
  fileEntries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const manifestString = fileEntries
    .map((f) => `${f.relativePath}|${f.size}|${f.mode}|${f.sha256}`)
    .join('\n');

  const treeDigest = sha256(manifestString);

  return {
    treeDigest,
    files: fileEntries,
  };
}

/**
 * Validates an individual archive entry path against security escape vulnerabilities (Section 20.4).
 *
 * @param {string} entryPath
 * @param {Object} [limits]
 * @param {number} [limits.currentCount=0]
 * @param {number} [limits.maxFiles=1000]
 * @param {number} [limits.currentTotalBytes=0]
 * @param {number} [limits.maxTotalBytes=52428800] // 50MB
 * @returns {{ valid: boolean, error?: string, code?: string }}
 */
function validateArchiveEntry(entryPath, limits = {}) {
  if (typeof entryPath !== 'string' || !entryPath.trim()) {
    return { valid: false, code: 'CTX_ARCHIVE_INVALID_PATH', error: 'Empty or non-string archive path' };
  }

  const normalized = entryPath.replace(/\\/g, '/').replace(/^\.\//, '');

  // 1. Absolute path check
  if (path.isAbsolute(entryPath) || /^[a-zA-Z]:[\\\/]/.test(entryPath) || normalized.startsWith('/')) {
    return {
      valid: false,
      code: 'CTX_ARCHIVE_ABSOLUTE_PATH',
      error: `Security violation: absolute archive path rejected: "${entryPath}"`,
    };
  }

  // 2. Directory traversal check
  const parts = normalized.split('/');
  if (parts.includes('..') || normalized.startsWith('../') || normalized.includes('/../')) {
    return {
      valid: false,
      code: 'CTX_ARCHIVE_PATH_TRAVERSAL',
      error: `Security violation: archive path attempts traversal outside destination: "${entryPath}"`,
    };
  }

  // 3. Windows reserved device names
  for (const part of parts) {
    if (WINDOWS_RESERVED_NAMES.test(part)) {
      return {
        valid: false,
        code: 'CTX_ARCHIVE_RESERVED_NAME',
        error: `Security violation: Windows reserved device name rejected: "${part}" in "${entryPath}"`,
      };
    }
  }

  // 4. Zip bomb / count & size limits
  if (typeof limits.currentCount === 'number' && limits.maxFiles && limits.currentCount >= limits.maxFiles) {
    return {
      valid: false,
      code: 'CTX_ARCHIVE_MAX_FILES_EXCEEDED',
      error: `Security violation: archive exceeds maximum permitted file count (${limits.maxFiles})`,
    };
  }

  if (
    typeof limits.currentTotalBytes === 'number' &&
    limits.maxTotalBytes &&
    limits.currentTotalBytes >= limits.maxTotalBytes
  ) {
    return {
      valid: false,
      code: 'CTX_ARCHIVE_MAX_SIZE_EXCEEDED',
      error: `Security violation: archive exceeds maximum uncompressed size (${limits.maxTotalBytes} bytes)`,
    };
  }

  return { valid: true };
}

/**
 * Validates plugin source pinning compliance (Section 20.1).
 *
 * @param {Object} sourceSpec
 * @param {'github'|'npm'} sourceSpec.type
 * @param {string} [sourceSpec.commit] - Exact commit SHA for GitHub
 * @param {string} [sourceSpec.version] - Exact version for npm
 * @param {string} [sourceSpec.integrity] - sha512 integrity for npm
 * @param {boolean} [options.allowFloating=false]
 * @returns {{ valid: boolean, error?: string, code?: string }}
 */
function validatePluginPinning(sourceSpec = {}, options = {}) {
  const { type, commit, version, integrity } = sourceSpec;
  const allowFloating = options.allowFloating || false;

  if (type === 'github') {
    if (!commit || !/^[0-9a-f]{40}$/i.test(commit)) {
      if (!allowFloating) {
        return {
          valid: false,
          code: 'CTX_PLUGIN_FLOATING_SOURCE_BLOCKED',
          error:
            'GitHub plugin source must be pinned to an exact 40-character commit SHA. Floating branch or tag is prohibited without --allow-floating.',
        };
      }
    }
  } else if (type === 'npm') {
    if (!version || version === 'latest' || version.startsWith('^') || version.startsWith('~')) {
      return {
        valid: false,
        code: 'CTX_PLUGIN_IMPLICIT_LATEST_BLOCKED',
        error: 'npm plugin source must be pinned to an exact version (e.g. "1.2.3"). Ranges and "latest" are prohibited.',
      };
    }
    if (!integrity || !integrity.startsWith('sha512-')) {
      return {
        valid: false,
        code: 'CTX_PLUGIN_MISSING_INTEGRITY',
        error: 'npm plugin source requires dist.integrity verification (sha512-...).',
      };
    }
  }

  return { valid: true };
}

/**
 * Manages script execution capability grants (Section 20.6).
 */
class ScriptGrantManager {
  /**
   * @param {string} grantsFilePath - User-local config file path
   */
  constructor(grantsFilePath) {
    this.grantsFilePath = path.resolve(grantsFilePath);
    this.grants = this._load();
  }

  _load() {
    if (!fs.existsSync(this.grantsFilePath)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.grantsFilePath, 'utf8'));
    } catch {
      return {};
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(this.grantsFilePath), { recursive: true });
    fs.writeFileSync(this.grantsFilePath, JSON.stringify(this.grants, null, 2), 'utf8');
  }

  /**
   * Grants execution permission to a specific script by its content hash.
   *
   * @param {string} scriptPath
   */
  grant(scriptPath) {
    const resolved = path.resolve(scriptPath);
    const content = fs.readFileSync(resolved);
    const hash = sha256(content);

    this.grants[resolved] = {
      hash,
      grantedAt: Date.now(),
    };
    this._save();
  }

  /**
   * Verifies if a script is authorized to run.
   * Invalidates grant immediately if script was altered.
   *
   * @param {string} scriptPath
   * @returns {{ authorized: boolean, reason: string }}
   */
  checkAuthorization(scriptPath) {
    const resolved = path.resolve(scriptPath);
    if (!fs.existsSync(resolved)) {
      return { authorized: false, reason: 'Script file not found.' };
    }

    const record = this.grants[resolved];
    if (!record) {
      return {
        authorized: false,
        reason: 'Script execution is disabled by default. Requires explicit user grant.',
      };
    }

    const currentHash = sha256(fs.readFileSync(resolved));
    if (currentHash !== record.hash) {
      return {
        authorized: false,
        reason: 'Script content has been modified since grant was issued. Grant invalidated.',
      };
    }

    return { authorized: true, reason: 'Authorized' };
  }
}

/**
 * Handles atomic updates and protects local modifications (Section 20.7).
 */
class AtomicPluginUpdater {
  /**
   * Checks if local plugin has been modified since it was installed/recorded in lockfile.
   *
   * @param {string} pluginDir
   * @param {string} expectedTreeDigest
   * @returns {boolean} True if modified locally
   */
  static isModifiedLocally(pluginDir, expectedTreeDigest) {
    if (!fs.existsSync(pluginDir)) return false;
    const current = calculateTreeDigest(pluginDir);
    return current.treeDigest !== expectedTreeDigest;
  }

  /**
   * Atomically installs or updates a plugin directory with rollback.
   *
   * @param {string} targetDir
   * @param {string} stagedDir
   * @param {Object} [options]
   * @param {string} [options.expectedOldTreeDigest]
   * @param {boolean} [options.force=false]
   * @returns {{ success: boolean, treeDigest: string }}
   */
  static applyUpdate(targetDir, stagedDir, options = {}) {
    const { expectedOldTreeDigest, force = false } = options;
    const resolvedTarget = path.resolve(targetDir);
    const resolvedStaged = path.resolve(stagedDir);

    if (fs.existsSync(resolvedTarget) && expectedOldTreeDigest && !force) {
      if (this.isModifiedLocally(resolvedTarget, expectedOldTreeDigest)) {
        const err = new Error(
          `Plugin in "${resolvedTarget}" has local modifications. Update aborted to prevent overwriting user changes. Pass --force to overwrite.`
        );
        err.code = 'CTX_PLUGIN_MODIFIED_LOCALLY';
        throw err;
      }
    }

    const backupDir = `${resolvedTarget}.bak-${Date.now()}`;
    let hasBackup = false;

    try {
      if (fs.existsSync(resolvedTarget)) {
        fs.renameSync(resolvedTarget, backupDir);
        hasBackup = true;
      }

      fs.renameSync(resolvedStaged, resolvedTarget);

      // Verify new directory
      const digest = calculateTreeDigest(resolvedTarget);

      // Clean up backup
      if (hasBackup) {
        fs.rmSync(backupDir, { recursive: true, force: true });
      }

      return { success: true, treeDigest: digest.treeDigest };
    } catch (err) {
      // Rollback on failure
      if (hasBackup && !fs.existsSync(resolvedTarget)) {
        try {
          fs.renameSync(backupDir, resolvedTarget);
        } catch {}
      }
      throw err;
    }
  }
}

module.exports = {
  calculateTreeDigest,
  validateArchiveEntry,
  validatePluginPinning,
  ScriptGrantManager,
  AtomicPluginUpdater,
};
