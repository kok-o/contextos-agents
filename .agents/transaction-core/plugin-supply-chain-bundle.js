"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/plugins/adapter.ts
var adapter_exports = {};
__export(adapter_exports, {
  AtomicPluginUpdater: () => AtomicPluginUpdater,
  ScriptGrantManager: () => ScriptGrantManager,
  THREAT_CODES: () => THREAT_CODES,
  calculateTreeDigest: () => calculateTreeDigest,
  sha256: () => sha256,
  validateArchiveEntry: () => validateArchiveEntry,
  validatePluginPinning: () => validatePluginPinning,
  verifyNpmTarballIntegrity: () => verifyNpmTarballIntegrity
});
module.exports = __toCommonJS(adapter_exports);

// src/plugins/core/archive.ts
var path = __toESM(require("node:path"), 1);

// src/plugins/core/types.ts
var THREAT_CODES = {
  UNKNOWN_SOURCE_TYPE: "CTX_PLUGIN_UNKNOWN_SOURCE_TYPE",
  FLOATING_SOURCE_BLOCKED: "CTX_PLUGIN_FLOATING_SOURCE_BLOCKED",
  IMPLICIT_LATEST_BLOCKED: "CTX_PLUGIN_IMPLICIT_LATEST_BLOCKED",
  MISSING_INTEGRITY: "CTX_PLUGIN_MISSING_INTEGRITY",
  INVALID_PATH: "CTX_ARCHIVE_INVALID_PATH",
  ABSOLUTE_PATH: "CTX_ARCHIVE_ABSOLUTE_PATH",
  PATH_TRAVERSAL: "CTX_ARCHIVE_PATH_TRAVERSAL",
  RESERVED_NAME: "CTX_ARCHIVE_RESERVED_NAME",
  MAX_FILES_EXCEEDED: "CTX_ARCHIVE_MAX_FILES_EXCEEDED",
  MAX_SIZE_EXCEEDED: "CTX_ARCHIVE_MAX_SIZE_EXCEEDED",
  RATIO_EXCEEDED: "CTX_ARCHIVE_RATIO_EXCEEDED",
  CASE_COLLISION: "CTX_ARCHIVE_CASE_COLLISION",
  SYMLINK_ESCAPE: "CTX_ARCHIVE_SYMLINK_ESCAPE",
  SPECIAL_FILE: "CTX_ARCHIVE_SPECIAL_FILE",
  MODIFIED_LOCALLY: "CTX_PLUGIN_MODIFIED_LOCALLY"
};

// src/plugins/core/archive.ts
var WINDOWS_RESERVED_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
function validateArchiveEntry(entryPath, limits = {}) {
  if (typeof entryPath !== "string" || !entryPath.trim()) {
    return {
      valid: false,
      code: THREAT_CODES.INVALID_PATH,
      error: "Empty or non-string archive path"
    };
  }
  const normalized = entryPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (path.isAbsolute(entryPath) || /^[a-zA-Z]:[\\/]/.test(entryPath) || /^[a-zA-Z]:/.test(normalized) || normalized.startsWith("/")) {
    return {
      valid: false,
      code: THREAT_CODES.ABSOLUTE_PATH,
      error: `Security violation: absolute archive path rejected: "${entryPath}"`
    };
  }
  const parts = normalized.split("/");
  if (parts.includes("..") || normalized.startsWith("../") || normalized.includes("/../")) {
    return {
      valid: false,
      code: THREAT_CODES.PATH_TRAVERSAL,
      error: `Security violation: archive path attempts traversal outside destination: "${entryPath}"`
    };
  }
  for (const part of parts) {
    if (WINDOWS_RESERVED_NAMES.test(part)) {
      return {
        valid: false,
        code: THREAT_CODES.RESERVED_NAME,
        error: `Security violation: Windows reserved device name rejected: "${part}" in "${entryPath}"`
      };
    }
  }
  if (limits.entryType === "socket" || limits.entryType === "fifo" || limits.entryType === "characterDevice" || limits.entryType === "blockDevice") {
    return {
      valid: false,
      code: THREAT_CODES.SPECIAL_FILE,
      error: `Security violation: special device or socket rejected: "${entryPath}" (${limits.entryType})`
    };
  }
  if (limits.linkTarget || limits.entryType === "symlink" || limits.entryType === "hardlink") {
    if (limits.linkTarget) {
      const targetNorm = limits.linkTarget.replace(/\\/g, "/");
      if (path.isAbsolute(limits.linkTarget) || /^[a-zA-Z]:/.test(targetNorm) || targetNorm.startsWith("/")) {
        return {
          valid: false,
          code: THREAT_CODES.SYMLINK_ESCAPE,
          error: `Security violation: absolute symlink/hardlink target rejected: "${limits.linkTarget}"`
        };
      }
      const entryDir = path.posix.dirname(normalized);
      const resolvedTarget = path.posix.normalize(path.posix.join(entryDir, targetNorm));
      if (resolvedTarget.startsWith("../") || resolvedTarget === ".." || resolvedTarget.includes("/../")) {
        return {
          valid: false,
          code: THREAT_CODES.SYMLINK_ESCAPE,
          error: `Security violation: symlink target escapes archive boundary: "${limits.linkTarget}"`
        };
      }
    }
  }
  if (limits.seenPaths) {
    const folded = normalized.toLowerCase().normalize("NFC");
    if (limits.seenPaths.has(folded)) {
      return {
        valid: false,
        code: THREAT_CODES.CASE_COLLISION,
        error: `Security violation: case or Unicode collision detected for path: "${entryPath}"`
      };
    }
    limits.seenPaths.add(folded);
  }
  if (typeof limits.uncompressedSize === "number" && typeof limits.compressedSize === "number") {
    if (limits.compressedSize > 0) {
      const ratio = limits.uncompressedSize / limits.compressedSize;
      const maxRatio = limits.maxRatio ?? 100;
      if (ratio > maxRatio && limits.uncompressedSize > 1024 * 1024) {
        return {
          valid: false,
          code: THREAT_CODES.RATIO_EXCEEDED,
          error: `Security violation: suspicious compression ratio (${ratio.toFixed(1)}x) exceeds limit (${maxRatio}x)`
        };
      }
    }
  }
  if (typeof limits.currentCount === "number" && limits.maxFiles && limits.currentCount >= limits.maxFiles) {
    return {
      valid: false,
      code: THREAT_CODES.MAX_FILES_EXCEEDED,
      error: `Security violation: archive exceeds maximum permitted file count (${limits.maxFiles})`
    };
  }
  if (typeof limits.currentTotalBytes === "number" && limits.maxTotalBytes && limits.currentTotalBytes >= limits.maxTotalBytes) {
    return {
      valid: false,
      code: THREAT_CODES.MAX_SIZE_EXCEEDED,
      error: `Security violation: archive exceeds maximum uncompressed size (${limits.maxTotalBytes} bytes)`
    };
  }
  return { valid: true };
}

// src/plugins/core/digest.ts
var crypto = __toESM(require("node:crypto"), 1);
var fs = __toESM(require("node:fs"), 1);
var path2 = __toESM(require("node:path"), 1);
function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}
function calculateTreeDigest(dirPath, _options = {}) {
  const resolvedDir = path2.resolve(dirPath);
  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Directory does not exist: ${resolvedDir}`);
  }
  const fileEntries = [];
  function walk(current) {
    const items = fs.readdirSync(current, { withFileTypes: true });
    items.sort((a, b) => a.name.localeCompare(b.name));
    for (const item of items) {
      const fullPath = path2.join(current, item.name);
      if (item.isDirectory()) {
        walk(fullPath);
      } else if (item.isSymbolicLink()) {
        const rel = path2.relative(resolvedDir, fullPath).replace(/\\/g, "/");
        const stat = fs.lstatSync(fullPath);
        const linkTarget = fs.readlinkSync(fullPath);
        const hash = sha256(linkTarget);
        fileEntries.push({
          relativePath: rel,
          size: stat.size,
          mode: stat.mode & 511,
          sha256: hash,
          type: "symlink"
        });
      } else if (item.isFile()) {
        const rel = path2.relative(resolvedDir, fullPath).replace(/\\/g, "/");
        const stat = fs.statSync(fullPath);
        const content = fs.readFileSync(fullPath);
        const hash = sha256(content);
        fileEntries.push({
          relativePath: rel,
          size: stat.size,
          mode: stat.mode & 511,
          sha256: hash,
          type: "file"
        });
      }
    }
  }
  walk(resolvedDir);
  fileEntries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const manifestString = fileEntries.map((f) => `${f.relativePath}|${f.size}|${f.mode}|${f.type}|${f.sha256}`).join("\n");
  const treeDigest = sha256(manifestString);
  return {
    treeDigest,
    files: fileEntries
  };
}

// src/plugins/core/grants.ts
var fs2 = __toESM(require("node:fs"), 1);
var path3 = __toESM(require("node:path"), 1);
var ScriptGrantManager = class {
  grantsFilePath;
  grants;
  constructor(grantsFilePath) {
    this.grantsFilePath = path3.resolve(grantsFilePath);
    this.grants = this._load();
  }
  _load() {
    if (!fs2.existsSync(this.grantsFilePath)) return {};
    try {
      return JSON.parse(fs2.readFileSync(this.grantsFilePath, "utf8"));
    } catch {
      return {};
    }
  }
  _save() {
    fs2.mkdirSync(path3.dirname(this.grantsFilePath), { recursive: true });
    fs2.writeFileSync(this.grantsFilePath, JSON.stringify(this.grants, null, 2), "utf8");
  }
  /**
   * Grants execution permission to a specific script by its content hash.
   * Binds both to plugin identity and content hash.
   */
  grant(scriptPath, options = {}) {
    const resolved = path3.resolve(scriptPath);
    const content = fs2.readFileSync(resolved);
    const hash = sha256(content);
    const record = {
      hash,
      grantedAt: Date.now(),
      pluginId: options.pluginId,
      relPath: options.relPath
    };
    if (options.pluginId) {
      const idKey = `plugin:${options.pluginId}:${options.relPath || path3.basename(scriptPath)}`;
      this.grants[idKey] = record;
    }
    this.grants[resolved] = record;
    this._save();
  }
  /**
   * Verifies if a script is authorized to run.
   * Invalidates grant immediately if script was altered.
   */
  checkAuthorization(scriptPath, options = {}) {
    const resolved = path3.resolve(scriptPath);
    if (!fs2.existsSync(resolved)) {
      return { authorized: false, reason: "Script file not found." };
    }
    let record;
    if (options.pluginId) {
      const idKey = `plugin:${options.pluginId}:${options.relPath || path3.basename(scriptPath)}`;
      record = this.grants[idKey] || this.grants[resolved];
    } else {
      record = this.grants[resolved];
    }
    if (!record) {
      return {
        authorized: false,
        reason: "Script execution is disabled by default. Requires explicit user grant."
      };
    }
    const currentHash = sha256(fs2.readFileSync(resolved));
    if (currentHash !== record.hash) {
      delete this.grants[resolved];
      if (options.pluginId) {
        delete this.grants[`plugin:${options.pluginId}:${options.relPath || path3.basename(scriptPath)}`];
      }
      this._save();
      return {
        authorized: false,
        reason: "Script content has been modified since grant was issued. Grant invalidated."
      };
    }
    return { authorized: true, reason: "Authorized" };
  }
};

// src/plugins/core/pinning.ts
var crypto2 = __toESM(require("node:crypto"), 1);
var EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
var EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
function validatePluginPinning(sourceSpec = { type: "" }, options = {}) {
  if (!sourceSpec || typeof sourceSpec !== "object" || !sourceSpec.type) {
    return {
      valid: false,
      code: THREAT_CODES.UNKNOWN_SOURCE_TYPE,
      error: "Missing or invalid plugin source specification"
    };
  }
  const { type } = sourceSpec;
  const allowFloating = options.allowFloating || false;
  if (type === "github") {
    const commit = sourceSpec.commit;
    if (!commit || !EXACT_COMMIT_SHA.test(commit)) {
      if (!allowFloating) {
        return {
          valid: false,
          code: THREAT_CODES.FLOATING_SOURCE_BLOCKED,
          error: "GitHub plugin source must be pinned to an exact 40-character commit SHA. Floating branch or tag is prohibited without --allow-floating."
        };
      }
    }
  } else if (type === "npm") {
    const version = sourceSpec.version;
    const integrity = sourceSpec.integrity;
    if (!version || version === "latest" || version.startsWith("^") || version.startsWith("~") || version.includes(">") || version.includes("<") || version.includes("*") || !EXACT_SEMVER.test(version)) {
      return {
        valid: false,
        code: THREAT_CODES.IMPLICIT_LATEST_BLOCKED,
        error: 'npm plugin source must be pinned to an exact version (e.g. "1.2.3"). Ranges and "latest" are prohibited.'
      };
    }
    if (!integrity || !integrity.startsWith("sha512-")) {
      return {
        valid: false,
        code: THREAT_CODES.MISSING_INTEGRITY,
        error: "npm plugin source requires dist.integrity verification (sha512-...)."
      };
    }
  } else {
    return {
      valid: false,
      code: THREAT_CODES.UNKNOWN_SOURCE_TYPE,
      error: `Unknown or unsupported plugin source type: "${type}". Only "github" and "npm" are permitted.`
    };
  }
  return { valid: true };
}
function verifyNpmTarballIntegrity(tarballBuffer, expectedIntegrity) {
  if (!expectedIntegrity.startsWith("sha512-")) {
    return false;
  }
  const expectedHash = expectedIntegrity.slice("sha512-".length);
  const computedHash = crypto2.createHash("sha512").update(tarballBuffer).digest("base64");
  const bufA = Buffer.from(computedHash, "utf8");
  const bufB = Buffer.from(expectedHash, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto2.timingSafeEqual(bufA, bufB);
}

// src/plugins/core/updater.ts
var fs3 = __toESM(require("node:fs"), 1);
var path4 = __toESM(require("node:path"), 1);
var AtomicPluginUpdater = class _AtomicPluginUpdater {
  /**
   * Checks if local plugin has been modified since it was installed/recorded in lockfile.
   */
  static isModifiedLocally(pluginDir, expectedTreeDigest) {
    if (!fs3.existsSync(pluginDir)) return false;
    const current = calculateTreeDigest(pluginDir);
    return current.treeDigest !== expectedTreeDigest;
  }
  /**
   * Atomically installs or updates a plugin directory with rollback.
   * Rejects updates when local uncommitted user modifications exist unless forced.
   */
  static applyUpdate(targetDir, stagedDir, options = {}) {
    const { expectedOldTreeDigest, force = false } = options;
    const resolvedTarget = path4.resolve(targetDir);
    const resolvedStaged = path4.resolve(stagedDir);
    if (fs3.existsSync(resolvedTarget) && expectedOldTreeDigest && !force) {
      if (_AtomicPluginUpdater.isModifiedLocally(resolvedTarget, expectedOldTreeDigest)) {
        const err = new Error(
          `Plugin in "${resolvedTarget}" has local modifications. Update aborted to prevent overwriting user changes. Pass --force to overwrite.`
        );
        err.code = THREAT_CODES.MODIFIED_LOCALLY;
        throw err;
      }
    }
    const backupDir = `${resolvedTarget}.bak-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let hasBackup = false;
    try {
      if (fs3.existsSync(resolvedTarget)) {
        fs3.renameSync(resolvedTarget, backupDir);
        hasBackup = true;
      }
      fs3.renameSync(resolvedStaged, resolvedTarget);
      const digest = calculateTreeDigest(resolvedTarget);
      if (hasBackup) {
        fs3.rmSync(backupDir, { recursive: true, force: true });
      }
      return { success: true, treeDigest: digest.treeDigest };
    } catch (err) {
      if (hasBackup && !fs3.existsSync(resolvedTarget)) {
        try {
          fs3.renameSync(backupDir, resolvedTarget);
        } catch {
        }
      }
      throw err;
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AtomicPluginUpdater,
  ScriptGrantManager,
  THREAT_CODES,
  calculateTreeDigest,
  sha256,
  validateArchiveEntry,
  validatePluginPinning,
  verifyNpmTarballIntegrity
});
