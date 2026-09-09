/**
 * .agents/filesystem/safe-path.js
 * ContextOS Authoritative Safe Path Primitive
 *
 * Implements strict containment and security validation:
 * - Prevents directory traversal attacks (..)
 * - Rejects absolute, drive-qualified (C:\), and UNC (\\server\share) paths
 * - Rejects NUL bytes and Alternate Data Streams (ADS)
 * - Blocks Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
 * - Enforces parent directory containment via realpath to stop symlink/junction escapes
 */

const fs = require('fs');
const path = require('path');

const ERROR_CODES = {
  OUTSIDE_PROJECT: 'CTX_PATH_OUTSIDE_PROJECT',
  INVALID: 'CTX_PATH_INVALID',
  RESERVED_DEVICE: 'CTX_PATH_RESERVED_DEVICE',
  SYMLINK_ESCAPE: 'CTX_PATH_SYMLINK_ESCAPE',
};

const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

class SafePathError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SafePathError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Normalizes any path to forward slashes.
 */
function toPosix(p) {
  return p.replace(/\\/g, '/');
}

/**
 * Checks if a string segment is a Windows reserved device name.
 */
function isReservedDeviceName(segment) {
  if (!segment) return false;
  // Match exact name or name with extension (e.g. CON, con.txt, aux.json)
  const baseName = segment.split('.')[0].toUpperCase();
  return WINDOWS_RESERVED_NAMES.has(baseName);
}

/**
 * Resolves and strictly validates a relative path inside projectRoot.
 *
 * @param {string} projectRoot - Absolute or relative path to project root
 * @param {string} relativePath - Target relative path within project
 * @param {object} [options]
 * @param {boolean} [options.allowEscape=false] - If true, permits target outside root (default false)
 * @param {boolean} [options.checkRealpathAncestors=true] - Verify ancestors do not symlink out of root
 * @returns {{ resolvedPath: string, relativePosixPath: string }}
 */
function resolveManagedPath(projectRoot, relativePath, options = {}) {
  const { checkRealpathAncestors = true } = options;

  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new SafePathError(
      ERROR_CODES.INVALID,
      'Invalid project root: must be a non-empty string',
      { projectRoot }
    );
  }

  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    throw new SafePathError(
      ERROR_CODES.INVALID,
      'Invalid path: target relativePath must be a non-empty string',
      { relativePath }
    );
  }

  // 1. Check for NUL bytes
  if (relativePath.includes('\0') || projectRoot.includes('\0')) {
    throw new SafePathError(
      ERROR_CODES.INVALID,
      'Path contains forbidden NUL character',
      { relativePath }
    );
  }

  // 2. Absolute, drive-qualified or UNC path checks (OUTSIDE_PROJECT)
  if (/^[a-zA-Z]:[\\/]/.test(relativePath) || /^[a-zA-Z]:/.test(relativePath)) {
    throw new SafePathError(
      ERROR_CODES.OUTSIDE_PROJECT,
      `Drive-qualified paths are forbidden: ${relativePath}`,
      { relativePath }
    );
  }

  if (path.isAbsolute(relativePath)) {
    throw new SafePathError(
      ERROR_CODES.OUTSIDE_PROJECT,
      `Path must be relative to project root, received absolute path: ${relativePath}`,
      { relativePath }
    );
  }

  if (relativePath.startsWith('\\\\') || relativePath.startsWith('//')) {
    throw new SafePathError(
      ERROR_CODES.OUTSIDE_PROJECT,
      `UNC network paths are forbidden: ${relativePath}`,
      { relativePath }
    );
  }

  // 3. Alternate Data Streams (ADS) colon check
  // On Windows, 'file.txt:stream' or 'file.txt::$DATA' accesses alternate streams
  if (relativePath.includes(':')) {
    throw new SafePathError(
      ERROR_CODES.INVALID,
      'Path contains forbidden Alternate Data Stream character (":")',
      { relativePath }
    );
  }

  // 5. Windows reserved device names check
  const normalizedSegments = toPosix(relativePath).split('/').filter(Boolean);
  for (const seg of normalizedSegments) {
    if (isReservedDeviceName(seg)) {
      throw new SafePathError(
        ERROR_CODES.RESERVED_DEVICE,
        `Path segment '${seg}' is a reserved Windows device name (${Array.from(WINDOWS_RESERVED_NAMES).slice(0, 4).join(', ')}...)`,
        { segment: seg, relativePath }
      );
    }
  }

  // Resolve absolute project root
  const absRoot = path.resolve(projectRoot);
  const targetResolved = path.resolve(absRoot, relativePath);

  // 6. Strict directory traversal & containment check
  const relFromRoot = path.relative(absRoot, targetResolved);
  if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot) || relFromRoot === '') {
    if (relFromRoot === '') {
      throw new SafePathError(
        ERROR_CODES.INVALID,
        'Managed path cannot target the project root itself directly',
        { relativePath }
      );
    }
    throw new SafePathError(
      ERROR_CODES.OUTSIDE_PROJECT,
      `Path '${relativePath}' resolves outside of project root '${absRoot}'`,
      { relativePath, targetResolved, absRoot }
    );
  }

  // 7. Symlink / Junction escape check on existing ancestor directories
  if (checkRealpathAncestors) {
    let realRoot = absRoot;
    try {
      if (fs.existsSync(absRoot)) {
        realRoot = fs.realpathSync(absRoot);
      }
    } catch {
      // Best-effort if root realpath fails
    }

    // Traverse upwards from target to find the nearest existing directory
    let currentDir = targetResolved;
    while (currentDir && currentDir !== path.dirname(currentDir)) {
      if (fs.existsSync(currentDir)) {
        try {
          const realAncestor = fs.realpathSync(currentDir);
          const relFromRealRoot = path.relative(realRoot, realAncestor);
          if (relFromRealRoot.startsWith('..') || path.isAbsolute(relFromRealRoot)) {
            throw new SafePathError(
              ERROR_CODES.SYMLINK_ESCAPE,
              `Path ancestor '${currentDir}' resolves via symlink to '${realAncestor}' outside project realpath root '${realRoot}'`,
              { currentDir, realAncestor, realRoot }
            );
          }
        } catch (err) {
          if (err instanceof SafePathError) throw err;
          // Ignore transient read errors for non-existent virtual paths
        }
        break;
      }
      currentDir = path.dirname(currentDir);
    }
  }

  const relativePosixPath = toPosix(relFromRoot);

  return {
    resolvedPath: targetResolved,
    relativePosixPath,
  };
}

module.exports = {
  resolveManagedPath,
  toPosix,
  isReservedDeviceName,
  SafePathError,
  ERROR_CODES,
  WINDOWS_RESERVED_NAMES,
};
