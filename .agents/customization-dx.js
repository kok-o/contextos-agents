/**
 * .agents/customization-dx.js
 * ContextOS — Customization Layer & Developer Experience (DX) Engine
 *
 * Implements Section 22 of CONTEXTOS_IMPLEMENTATION_PLAN.md:
 *   - 22.2: Ownership layout (.agents/vendor, .agents/project, .agents/generated, .agents/state)
 *   - 22.2: Skill customization (override, eject, diff)
 *   - 22.3: Conflict management (list, show, accept-local, accept-upstream)
 *   - 22.6: Privacy-safe diagnostic bundle export (no prompts, code, repo URLs, env vars)
 *   - Pure Node.js (zero external dependencies)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class SkillCustomizationManager {
  /**
   * @param {string} projectRoot
   */
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = path.resolve(projectRoot);
    this.coreSkillsDir = path.join(this.projectRoot, '.agents', 'core', 'skills');
    this.vendorSkillsDir = path.join(this.projectRoot, '.agents', 'vendor', 'skills');
    this.projectSkillsDir = path.join(this.projectRoot, '.agents', 'project', 'skills');
  }

  _findUpstreamSkill(skillName) {
    const inCore = path.join(this.coreSkillsDir, skillName);
    if (fs.existsSync(inCore)) return inCore;

    const inVendor = path.join(this.vendorSkillsDir, skillName);
    if (fs.existsSync(inVendor)) return inVendor;

    return null;
  }

  /**
   * Creates a project-level override for an upstream skill (Section 22.2).
   *
   * @param {string} skillName
   * @returns {{ success: boolean, overridePath: string }}
   */
  override(skillName) {
    const upstream = this._findUpstreamSkill(skillName);
    if (!upstream) {
      const err = new Error(`Skill "${skillName}" not found in upstream core or vendor catalog.`);
      err.code = 'CTX_SKILL_NOT_FOUND';
      throw err;
    }

    const targetDir = path.join(this.projectSkillsDir, skillName);
    if (fs.existsSync(targetDir)) {
      const err = new Error(`Skill override for "${skillName}" already exists at ${targetDir}`);
      err.code = 'CTX_SKILL_OVERRIDE_EXISTS';
      throw err;
    }

    fs.mkdirSync(targetDir, { recursive: true });

    // Copy SKILL.md and skill.yaml if present
    const files = fs.readdirSync(upstream);
    for (const file of files) {
      const srcFile = path.join(upstream, file);
      if (fs.statSync(srcFile).isFile()) {
        fs.copyFileSync(srcFile, path.join(targetDir, file));
      }
    }

    return {
      success: true,
      overridePath: targetDir,
    };
  }

  /**
   * Ejects an upstream skill into a completely standalone, unlinked project skill.
   *
   * @param {string} skillName
   * @returns {{ success: boolean, ejectedPath: string }}
   */
  eject(skillName) {
    const res = this.override(skillName);
    const markerFile = path.join(res.overridePath, '.ejected');
    fs.writeFileSync(markerFile, JSON.stringify({ ejectedAt: Date.now(), skillName }, null, 2), 'utf8');
    return {
      success: true,
      ejectedPath: res.overridePath,
    };
  }

  /**
   * Computes diff between upstream skill and local project override.
   *
   * @param {string} skillName
   * @returns {{ isOverridden: boolean, diff?: string, upstreamPath?: string, projectPath?: string }}
   */
  diff(skillName) {
    const upstream = this._findUpstreamSkill(skillName);
    const local = path.join(this.projectSkillsDir, skillName);

    if (!fs.existsSync(local)) {
      return { isOverridden: false };
    }

    const upstreamSkillMd = upstream && fs.existsSync(path.join(upstream, 'SKILL.md'))
      ? fs.readFileSync(path.join(upstream, 'SKILL.md'), 'utf8')
      : '';
    const localSkillMd = fs.existsSync(path.join(local, 'SKILL.md'))
      ? fs.readFileSync(path.join(local, 'SKILL.md'), 'utf8')
      : '';

    const isDifferent = upstreamSkillMd !== localSkillMd;

    return {
      isOverridden: true,
      isDifferent,
      upstreamPath: upstream,
      projectPath: local,
    };
  }
}

class ConflictManager {
  /**
   * @param {string} projectRoot
   */
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = path.resolve(projectRoot);
    this.conflictsFile = path.join(this.projectRoot, '.agents', '.contextos', 'conflicts.json');
  }

  _load() {
    if (!fs.existsSync(this.conflictsFile)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.conflictsFile, 'utf8'));
    } catch {
      return [];
    }
  }

  _save(conflicts) {
    fs.mkdirSync(path.dirname(this.conflictsFile), { recursive: true });
    fs.writeFileSync(this.conflictsFile, JSON.stringify(conflicts, null, 2), 'utf8');
  }

  /**
   * Records a detected conflict.
   *
   * @param {Object} conflict
   * @param {string} conflict.id
   * @param {string} conflict.filePath
   * @param {string} conflict.localContent
   * @param {string} conflict.upstreamContent
   */
  recordConflict(conflict) {
    const list = this._load();
    const existingIdx = list.findIndex((c) => c.id === conflict.id);
    if (existingIdx !== -1) {
      list[existingIdx] = { ...conflict, recordedAt: Date.now() };
    } else {
      list.push({ ...conflict, recordedAt: Date.now() });
    }
    this._save(list);
  }

  /**
   * Lists active conflicts.
   *
   * @returns {Array<Object>}
   */
  list() {
    return this._load();
  }

  /**
   * Displays details for a conflict.
   *
   * @param {string} id
   * @returns {Object|null}
   */
  show(id) {
    const list = this._load();
    return list.find((c) => c.id === id) || null;
  }

  /**
   * Resolves conflict by accepting the local version.
   *
   * @param {string} id
   * @returns {boolean}
   */
  acceptLocal(id) {
    let list = this._load();
    const target = list.find((c) => c.id === id);
    if (!target) return false;

    list = list.filter((c) => c.id !== id);
    this._save(list);
    return true;
  }

  /**
   * Resolves conflict by overwriting with upstream version.
   *
   * @param {string} id
   * @returns {boolean}
   */
  acceptUpstream(id) {
    let list = this._load();
    const target = list.find((c) => c.id === id);
    if (!target) return false;

    const fullPath = path.resolve(this.projectRoot, target.filePath);
    fs.writeFileSync(fullPath, target.upstreamContent, 'utf8');

    list = list.filter((c) => c.id !== id);
    this._save(list);
    return true;
  }
}

class DiagnosticsExporter {
  /**
   * Generates privacy-safe diagnostic export bundle (Section 22.6).
   * Strictly omits prompts, code, repo URLs, env vars, and user names.
   *
   * @param {string} projectRoot
   * @returns {Object} Diagnostic bundle
   */
  static exportBundle(projectRoot = process.cwd()) {
    const resolvedRoot = path.resolve(projectRoot);
    const pkgJsonPath = path.join(resolvedRoot, 'package.json');
    let pkgVersion = 'unknown';

    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        pkgVersion = pkg.version || 'unknown';
      } catch {}
    }

    // Count skills without leaking contents
    let skillCount = 0;
    const coreSkills = path.join(resolvedRoot, '.agents', 'core', 'skills');
    if (fs.existsSync(coreSkills)) {
      skillCount = fs.readdirSync(coreSkills).filter((f) => {
        return fs.statSync(path.join(coreSkills, f)).isDirectory();
      }).length;
    }

    // Check lockfile v2 presence
    const lockfilePresent = fs.existsSync(path.join(resolvedRoot, '.agents', 'lockfile.v2.json'));

    return {
      schemaVersion: 'contextos-diagnostics-v1',
      timestamp: Date.now(),
      platform: {
        os: process.platform,
        arch: process.arch,
        nodeVersion: process.versions.node,
      },
      contextos: {
        packageVersion: pkgVersion,
        skillCount,
        lockfileV2Present: lockfilePresent,
      },
      anonymized: true,
      privacyGuarantee:
        'Contains zero prompt contents, source code, repository URLs, usernames, or environment variables.',
    };
  }
}

module.exports = {
  SkillCustomizationManager,
  ConflictManager,
  DiagnosticsExporter,
};
