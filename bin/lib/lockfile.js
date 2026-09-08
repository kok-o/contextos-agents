/**
 * bin/lib/lockfile.js
 * ContextOS Lockfile Engine & Provenance Tracking (schemaVersion: 1)
 *
 * Tracks files managed by ContextOS installations to ensure:
 * - Zero data loss during updates (never overwrite user-modified files)
 * - Safe uninstallation (never delete user-created files or modified managed files)
 * - Transparent provenance for adapters and generated files
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOCKFILE_REL_PATH = '.agents/contextos.lock.json';

/**
 * Normalize a relative path to standard POSIX-style relative path without leading ./
 * e.g. ".agents\\core\\skills" -> ".agents/core/skills"
 */
function normalizePath(relPath) {
  if (!relPath) return '';
  return relPath
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\//, '');
}

/**
 * Compute SHA-256 hash of a string or buffer.
 * Automatically normalizes CRLF line endings to LF to ensure cross-platform reproducibility.
 */
function computeHash(content) {
  if (content === null || content === undefined) return '';
  const normalized = typeof content === 'string'
    ? content.replace(/\r\n/g, '\n')
    : content;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Read a file and compute its SHA-256 hash (with CRLF normalization).
 * Returns null if file does not exist or cannot be read.
 */
function computeFileHash(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    return computeHash(content);
  } catch {
    return null;
  }
}

/**
 * Create a fresh lockfile data structure.
 */
function createLockfileData(options = {}) {
  return {
    schemaVersion: 1,
    installedPackage: options.installedPackage || 'contextos-agents',
    version: options.version || '1.6.1',
    selectedProfile: options.selectedProfile || 'default',
    installedAt: options.installedAt || new Date().toISOString(),
    managedFiles: options.managedFiles ? { ...options.managedFiles } : {},
  };
}

/**
 * Record a managed file entry in the lockfile data.
 */
function recordManagedFile(lockData, relPath, contentOrHash) {
  if (!lockData || !relPath) return;
  const norm = normalizePath(relPath);
  const hash = typeof contentOrHash === 'string' && contentOrHash.length === 64 && /^[0-9a-f]{64}$/i.test(contentOrHash)
    ? contentOrHash.toLowerCase()
    : computeHash(contentOrHash);

  lockData.managedFiles[norm] = {
    sha256: hash,
    managed: true,
  };
}

/**
 * Load and parse the lockfile from target project directory.
 * Returns null if lockfile does not exist or is invalid.
 */
function loadLockfile(projectDir) {
  try {
    const lockfilePath = path.join(projectDir, LOCKFILE_REL_PATH);
    if (!fs.existsSync(lockfilePath)) return null;

    const raw = fs.readFileSync(lockfilePath, 'utf8');
    const parsed = JSON.parse(raw);

    if (parsed && parsed.schemaVersion === 1 && typeof parsed.managedFiles === 'object') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save lockfile data to target project directory atomically.
 */
function saveLockfile(projectDir, lockData) {
  const lockfilePath = path.join(projectDir, LOCKFILE_REL_PATH);
  const lockfileDir = path.dirname(lockfilePath);

  if (!fs.existsSync(lockfileDir)) {
    fs.mkdirSync(lockfileDir, { recursive: true });
  }

  const tmpPath = `${lockfilePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const content = JSON.stringify(lockData, null, 2) + '\n';

  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, lockfilePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    // Fallback direct write
    fs.writeFileSync(lockfilePath, content, 'utf8');
  }
}

/**
 * Check if a given relative path is tracked as a managed file in the lockfile.
 */
function isManagedFile(lockData, relPath) {
  if (!lockData || !lockData.managedFiles) return false;
  const norm = normalizePath(relPath);
  return Boolean(lockData.managedFiles[norm]?.managed);
}

/**
 * Check if a managed file has been modified by the user compared to its recorded installation hash.
 * Returns false if file is unmanaged or does not exist on disk.
 */
function isFileModified(projectDir, relPath, lockData) {
  if (!lockData || !lockData.managedFiles) return false;
  const norm = normalizePath(relPath);
  const entry = lockData.managedFiles[norm];

  if (!entry || !entry.managed) return false;

  const fullPath = path.join(projectDir, norm);
  if (!fs.existsSync(fullPath)) return false;

  const diskHash = computeFileHash(fullPath);
  if (!diskHash) return false;

  return diskHash !== entry.sha256;
}

/**
 * Classify a file into an explicit lifecycle state:
 * - 'UNMANAGED': File not present in lockfile (e.g. user-created skill or config)
 * - 'MANAGED_CLEAN': File present in lockfile and content matches installation hash
 * - 'MANAGED_MODIFIED': File present in lockfile but modified on disk by user
 * - 'MISSING': File present in lockfile but not found on disk
 */
function classifyFile(projectDir, relPath, lockData) {
  const norm = normalizePath(relPath);
  const fullPath = path.join(projectDir, norm);
  const exists = fs.existsSync(fullPath);
  const managed = isManagedFile(lockData, norm);

  if (!managed) return 'UNMANAGED';
  if (!exists) return 'MISSING';

  return isFileModified(projectDir, norm, lockData) ? 'MANAGED_MODIFIED' : 'MANAGED_CLEAN';
}

/**
 * Safe migration helper for existing installations that lack a lockfile.
 * Recursively scans target project's .agents directory, compares each file
 * against the distribution sourceDir.
 *
 * ONLY files whose content hash exactly matches the distribution source are
 * claimed as managed. User custom skills or edited files are left unmanaged.
 */
function migrateExistingInstallation(projectDir, sourceAgentsDir, options = {}) {
  const targetAgentsDir = path.join(projectDir, '.agents');
  const lockData = createLockfileData(options);

  if (!fs.existsSync(targetAgentsDir)) {
    if (!options.inMemory && !options.dryRun) {
      saveLockfile(projectDir, lockData);
    }
    return lockData;
  }

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        // Skip lockfile itself
        if (entry.name === 'contextos.lock.json') continue;

        const relToAgents = path.relative(targetAgentsDir, fullPath).replace(/\\/g, '/');
        const relToProject = `.agents/${relToAgents}`;

        const sourceFile = path.join(sourceAgentsDir, relToAgents);
        if (fs.existsSync(sourceFile) && fs.statSync(sourceFile).isFile()) {
          const targetHash = computeFileHash(fullPath);
          const sourceHash = computeFileHash(sourceFile);

          if (targetHash && sourceHash && targetHash === sourceHash) {
            recordManagedFile(lockData, relToProject, targetHash);
          }
        }
      }
    }
  }

  walk(targetAgentsDir);
  if (!options.inMemory && !options.dryRun) {
    saveLockfile(projectDir, lockData);
  }
  return lockData;
}

module.exports = {
  LOCKFILE_REL_PATH,
  normalizePath,
  computeHash,
  computeFileHash,
  createLockfileData,
  recordManagedFile,
  loadLockfile,
  saveLockfile,
  isManagedFile,
  isFileModified,
  classifyFile,
  migrateExistingInstallation,
};
