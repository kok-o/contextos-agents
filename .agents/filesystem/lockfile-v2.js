/**
 * .agents/filesystem/lockfile-v2.js
 * ContextOS Lockfile v2 Schema Manager & CAS Revision Tracker
 *
 * Implements:
 * - Dual-hashing: Exact byte SHA-256 + CRLF-normalized semantic text SHA-256
 * - Monotonic revision tracking with Compare-And-Swap (CAS) concurrency guard
 * - Schema v2 validation adhering to .agents/schemas/lockfile.v2.schema.json
 * - Generator provenance and artifact metadata management
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeRenameSync } = require('./safe-path.js');

const DEFAULT_LOCKFILE_SUBPATH = path.join('.agents', 'lockfile.v2.json');
const SCHEMA_PATH = path.join(__dirname, '..', 'schemas', 'lockfile.v2.schema.json');

const ERROR_CODES = {
  INVALID_SCHEMA: 'CTX_LOCKFILE_INVALID_SCHEMA',
  REVISION_CONFLICT: 'CTX_LOCKFILE_REVISION_CONFLICT',
  CORRUPT: 'CTX_LOCKFILE_CORRUPT',
};

class LockfileV2Error extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'LockfileV2Error';
    this.code = code;
    this.details = details;
  }
}

/**
 * Computes exact SHA-256 hash of raw byte buffer or string.
 * Format: sha256:<hex>
 */
function computeExactHash(content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  return `sha256:${hash}`;
}

/**
 * Computes semantic CRLF-normalized text SHA-256 hash to prevent false dirty states across Git checkouts.
 * Format: sha256:<hex>
 */
function computeSemanticHash(content) {
  const str = Buffer.isBuffer(content) ? content.toString('utf8') : String(content);
  // Normalize Windows CRLF to LF and trim trailing carriage returns
  const normalized = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const hash = crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * Split text with git conflict markers into the "ours" and "theirs" versions.
 * Lines of a diff3 base section are dropped.
 */
function splitConflictSides(raw) {
  const ours = [];
  const theirs = [];
  let mode = 'both';
  for (const line of raw.split(/\r?\n/)) {
    if (/^<{7}(?: .*)?$/.test(line)) { mode = 'ours'; continue; }
    if (mode !== 'both' && /^\|{7}(?: .*)?$/.test(line)) { mode = 'base'; continue; }
    if (mode !== 'both' && /^={7}$/.test(line)) { mode = 'theirs'; continue; }
    if (mode !== 'both' && /^>{7}(?: .*)?$/.test(line)) { mode = 'both'; continue; }
    if (mode === 'both' || mode === 'ours') ours.push(line);
    if (mode === 'both' || mode === 'theirs') theirs.push(line);
  }
  return { ours: ours.join('\n'), theirs: theirs.join('\n') };
}

function hasConflictMarkers(text) {
  return /^(<{7}|={7}|>{7})(?: .*)?$/m.test(text);
}

const RECORD_FIELD_ORDER = ['exactSha256', 'semanticTextSha256', 'kind', 'generator', 'inputsHash', 'mode', 'userContent', 'lastTransaction'];

/**
 * Deterministic lockfile text: managed files sorted by path with a fixed field
 * order, so that independent additions merge cleanly and neither line endings
 * nor insertion order change the file.
 */
function serializeLockfile(data) {
  const files = {};
  for (const file of Object.keys(data.managedFiles || {}).sort()) {
    const record = data.managedFiles[file];
    const fixed = {};
    for (const key of RECORD_FIELD_ORDER) {
      if (record[key] !== undefined) fixed[key] = record[key];
    }
    for (const key of Object.keys(record)) {
      if (!(key in fixed) && record[key] !== undefined) fixed[key] = record[key];
    }
    files[file] = fixed;
  }
  return JSON.stringify({ ...data, managedFiles: files }, null, 2) + '\n';
}

class LockfileV2Manager {
  constructor(projectRoot, options = {}) {
    this.projectRoot = path.resolve(projectRoot);
    this.lockfilePath = options.lockfilePath
      ? path.resolve(this.projectRoot, options.lockfilePath)
      : path.resolve(this.projectRoot, DEFAULT_LOCKFILE_SUBPATH);
    this.schema = this.loadSchema();
  }

  loadSchema() {
    try {
      if (fs.existsSync(SCHEMA_PATH)) {
        return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
      }
    } catch {
      // Best-effort schema load
    }
    return null;
  }

  /**
   * Initializes a fresh Lockfile v2 data structure.
   */
  createEmpty(meta = {}) {
    return {
      schemaVersion: 2,
      revision: 1,
      package: {
        name: meta.packageName || 'contextos-project',
        version: meta.packageVersion || '1.0.0',
        compilerVersion: meta.compilerVersion || '2.0.0',
      },
      profile: {
        id: meta.profileId || 'default',
        hash: meta.profileHash || 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      },
      sourceGraphHash: meta.sourceGraphHash || 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      enabledAdapters: meta.enabledAdapters || [],
      managedFiles: {},
    };
  }

  /**
   * Merge both sides of a conflicted lockfile. Managed-file records from either
   * side are kept (ours wins on a clash); the other side's record is remembered
   * as an alternate so that ownership checks still recognise its files.
   */
  recoverFromConflict(raw) {
    const sides = splitConflictSides(raw);
    let ours;
    let theirs;
    try {
      ours = JSON.parse(sides.ours);
      theirs = JSON.parse(sides.theirs);
      this.validate(ours);
      this.validate(theirs);
    } catch (err) {
      throw new LockfileV2Error(
        ERROR_CODES.CORRUPT,
        `Lockfile at '${this.lockfilePath}' has merge conflicts that cannot be recovered automatically: ${err.message}`,
        { lockfilePath: this.lockfilePath, conflict: true }
      );
    }

    const merged = { ...ours, managedFiles: { ...theirs.managedFiles, ...ours.managedFiles } };
    merged.enabledAdapters = Array.from(new Set([...(ours.enabledAdapters || []), ...(theirs.enabledAdapters || [])])).sort();
    const alternates = {};
    for (const [file, record] of Object.entries(theirs.managedFiles)) {
      const kept = ours.managedFiles[file];
      if (kept && JSON.stringify(kept) !== JSON.stringify(record)) alternates[file] = [record];
    }
    Object.defineProperty(merged, 'recovered', { value: { alternates }, enumerable: false });
    return merged;
  }

  /**
   * Reads and parses Lockfile v2 from disk. Returns null if file does not exist.
   *
   * With `tolerateConflicts`, a lockfile that still holds git merge-conflict
   * markers is rebuilt from the union of both sides instead of failing. The
   * result then carries a non-enumerable `recovered` property listing, per
   * path, the record of the side that was not kept; it is never serialized.
   */
  read(options = {}) {
    if (!fs.existsSync(this.lockfilePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(this.lockfilePath, 'utf8');
      if (hasConflictMarkers(raw)) {
        if (options.tolerateConflicts) return this.recoverFromConflict(raw);
        throw new LockfileV2Error(
          ERROR_CODES.CORRUPT,
          `Lockfile at '${this.lockfilePath}' has unresolved merge conflicts. Run 'contextos export all' to rebuild it from the rule sources.`,
          { lockfilePath: this.lockfilePath, conflict: true }
        );
      }
      const parsed = JSON.parse(raw);
      this.validate(parsed);
      return parsed;
    } catch (err) {
      if (err instanceof LockfileV2Error) throw err;
      throw new LockfileV2Error(
        ERROR_CODES.CORRUPT,
        `Lockfile at '${this.lockfilePath}' is corrupt or unparseable: ${err.message}`,
        { error: err.message, lockfilePath: this.lockfilePath }
      );
    }
  }

  /**
   * Validates lockfile structure against LockfileV2 specification.
   */
  validate(data) {
    if (!data || typeof data !== 'object') {
      throw new LockfileV2Error(ERROR_CODES.INVALID_SCHEMA, 'Lockfile data must be a non-null object');
    }

    if (data.schemaVersion !== 2) {
      throw new LockfileV2Error(
        ERROR_CODES.INVALID_SCHEMA,
        `Expected schemaVersion 2, got '${data.schemaVersion}'`
      );
    }

    if (typeof data.revision !== 'number' || data.revision < 1) {
      throw new LockfileV2Error(
        ERROR_CODES.INVALID_SCHEMA,
        `Lockfile revision must be a positive integer, got '${data.revision}'`
      );
    }

    if (!data.package || !data.package.name || !data.package.version) {
      throw new LockfileV2Error(
        ERROR_CODES.INVALID_SCHEMA,
        'Lockfile missing required package identity (name, version)'
      );
    }

    if (!data.profile || !data.profile.id || !data.profile.hash) {
      throw new LockfileV2Error(
        ERROR_CODES.INVALID_SCHEMA,
        'Lockfile missing required profile metadata (id, hash)'
      );
    }

    if (!Array.isArray(data.enabledAdapters)) {
      throw new LockfileV2Error(
        ERROR_CODES.INVALID_SCHEMA,
        'Lockfile enabledAdapters must be an array'
      );
    }

    if (!data.managedFiles || typeof data.managedFiles !== 'object') {
      throw new LockfileV2Error(
        ERROR_CODES.INVALID_SCHEMA,
        'Lockfile managedFiles must be an object map'
      );
    }

    // Validate individual file records
    for (const [filePath, record] of Object.entries(data.managedFiles)) {
      if (!record.exactSha256 || !record.semanticTextSha256 || !record.kind || !record.generator) {
        throw new LockfileV2Error(
          ERROR_CODES.INVALID_SCHEMA,
          `Managed file '${filePath}' record is missing required fields (exactSha256, semanticTextSha256, kind, generator)`,
          { filePath, record }
        );
      }
    }

    return true;
  }

  /**
   * Saves lockfile to disk with optimistic concurrency Compare-And-Swap (CAS).
   *
   * @param {object} data - Lockfile data to write
   * @param {number} [expectedRevision] - Optional expected revision on disk before increment
   * @returns {object} Updated lockfile data with incremented revision
   */
  write(data, expectedRevision = undefined) {
    const currentOnDisk = this.read();

    if (expectedRevision !== undefined && currentOnDisk !== null) {
      if (currentOnDisk.revision !== expectedRevision) {
        throw new LockfileV2Error(
          ERROR_CODES.REVISION_CONFLICT,
          `Compare-And-Swap failed: disk revision is ${currentOnDisk.revision}, expected ${expectedRevision}`,
          { actualRevision: currentOnDisk.revision, expectedRevision }
        );
      }
    }

    // Increment revision
    const nextRevision = currentOnDisk ? currentOnDisk.revision + 1 : (data.revision || 1);
    const dataToWrite = {
      ...data,
      schemaVersion: 2,
      revision: nextRevision,
    };

    this.validate(dataToWrite);

    const dir = path.dirname(this.lockfilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tmpPath = `${this.lockfilePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    fs.writeFileSync(tmpPath, serializeLockfile(dataToWrite), 'utf8');

    try {
      safeRenameSync(tmpPath, this.lockfilePath);
    } catch (err) {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // Best-effort cleanup
      }
      throw err;
    }

    return dataToWrite;
  }

  /**
   * Adds or updates a managed file entry in memory.
   */
  recordManagedFile(data, relativePosixPath, fileMeta) {
    if (!data.managedFiles) data.managedFiles = {};

    const record = {
      exactSha256: fileMeta.exactSha256,
      semanticTextSha256: fileMeta.semanticTextSha256,
      kind: fileMeta.kind || 'generated-adapter',
      generator: fileMeta.generator,
      mode: fileMeta.mode || 420,
    };
    if (fileMeta.inputsHash) record.inputsHash = fileMeta.inputsHash;
    if (fileMeta.userContent) record.userContent = true;
    if (fileMeta.lastTransaction) record.lastTransaction = fileMeta.lastTransaction;
    data.managedFiles[relativePosixPath] = record;

    return data;
  }

  /**
   * Removes a managed file entry from memory.
   */
  removeManagedFile(data, relativePosixPath) {
    if (data.managedFiles && data.managedFiles[relativePosixPath]) {
      delete data.managedFiles[relativePosixPath];
    }
    return data;
  }
}

module.exports = {
  LockfileV2Manager,
  serializeLockfile,
  hasConflictMarkers,
  computeExactHash,
  computeSemanticHash,
  LockfileV2Error,
  ERROR_CODES,
  DEFAULT_LOCKFILE_SUBPATH,
};
