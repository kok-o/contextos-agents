/**
 * .agents/profiles.js
 * ContextOS — Project Profile & Stack Detection Engine
 *
 * Provides:
 *   1. Profile management (mvp, startup, enterprise, hackathon, frontend, backend)
 *   2. Tech stack auto-detection from project files
 *   3. Active profile resolution for adapters and skill compiler
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { ProjectMutationLock, JournaledTransaction } = require('./filesystem/index.js');

const AGENTS_DIR = path.join(__dirname);
const PROFILES_DIR = path.join(AGENTS_DIR, 'core', 'profiles');

/**
 * @typedef {Object} ProfileConfig
 * @property {number} [schemaVersion] - Profile schema version
 * @property {string} id - Profile unique slug
 * @property {string} name - Human-readable profile title
 * @property {string} description - Summary of the profile's purpose
 * @property {Object} skills - Profile skill groups (required, preferred, excluded)
 * @property {Object} policy - Quality gate policies
 * @property {Object} generation - Document templates to generate
 * @property {Object} technologyDefaults - Default framework/tool selections
 * @property {string[]} prefer_skills - Legacy priority skills
 * @property {string[]} exclude_skills - Legacy filtered out skills
 * @property {string[]} require_skills - Legacy mandatory skills
 * @property {string[]} generate_docs - Legacy documentation templates
 * @property {string[]} skip_docs - Legacy documentation to skip
 * @property {Object} enforce - Legacy invariant rules
 * @property {Object} defaults - Legacy default parameters
 */

/**
 * Parses a profile YAML string into a structured ProfileConfig object.
 *
 * @param {string} text - Raw YAML profile file content
 * @returns {ProfileConfig} Structured profile configuration
 */
function parseYamlProfile(text) {
  const result = {
    schemaVersion: 1,
    id: '',
    name: '',
    description: '',
    skills: {
      required: [],
      preferred: [],
      excluded: [],
    },
    policy: {
      verification: 'recommended',
      review: 'recommended',
      security: 'recommended',
      adr: 'off',
      testing: 'recommended',
      accessibility: 'off',
    },
    generation: {
      documents: [],
    },
    technologyDefaults: {},
    prefer_skills: [],
    exclude_skills: [],
    require_skills: [],
    generate_docs: [],
    skip_docs: [],
    enforce: {},
    defaults: {},
  };

  const schemaMatch = text.match(/^schemaVersion:\s*(\d+)/m);
  if (schemaMatch) result.schemaVersion = parseInt(schemaMatch[1], 10);

  const idMatch = text.match(/^id:\s*(.+)$/m);
  if (idMatch) result.id = idMatch[1].trim().replace(/^['"]|['"]$/g, '');

  const nameMatch = text.match(/^name:\s*(.+)$/m);
  if (nameMatch) result.name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');

  const descMatch = text.match(/^description:\s*(.+)$/m);
  if (descMatch) result.description = descMatch[1].trim().replace(/^['"]|['"]$/g, '');

  function parseList(field, sourceText = text) {
    const blockRegex = new RegExp(`^[ \\t]*${field}:\\s*\\n((?:[ \\t]+-[^\\n]*\\n?)+)`, 'm');
    const match = sourceText.match(blockRegex);
    if (!match) {
      const inlineRegex = new RegExp(`^[ \t]*${field}:\\s*\\[([^\\]]*)]`, 'm');
      const inlineMatch = sourceText.match(inlineRegex);
      if (!inlineMatch || !inlineMatch[1].trim()) return [];
      return inlineMatch[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    }
    return match[1]
      .split('\n')
      .map(l => l.replace(/^[ \t]+-\s*/, '').replace(/#.*$/, '').trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  function parseMap(field, sourceText = text) {
    const blockRegex = new RegExp(`^[ \t]*${field}:\\s*\\n((?:[ \t]+[a-zA-Z0-9_-]+:[^\\n]*\\n?)+)`, 'm');
    const match = sourceText.match(blockRegex);
    if (!match) return {};
    const map = {};
    const lines = match[1].split('\n');
    for (const line of lines) {
      const lineClean = line.replace(/#.*$/, '').trim();
      if (!lineClean) continue;
      const kv = lineClean.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (kv) {
        const key = kv[1].trim();
        let val = kv[2].trim().replace(/^['"]|['"]$/g, '');
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (/^\d+$/.test(val)) val = parseInt(val, 10);
        map[key] = val;
      }
    }
    return map;
  }

  function getSectionBlock(sectionKey) {
    const blockRegex = new RegExp(`^${sectionKey}:\\s*\\n((?:[ \t]+[^\\n]*\\n?)+)`, 'm');
    const match = text.match(blockRegex);
    return match ? match[1] : '';
  }

  // Parse ProfileV2 sections
  const skillsBlock = getSectionBlock('skills');
  if (skillsBlock) {
    result.schemaVersion = 2;
    result.skills.required = parseList('required', skillsBlock);
    result.skills.preferred = parseList('preferred', skillsBlock);
    result.skills.excluded = parseList('excluded', skillsBlock);
  }

  const policyBlock = getSectionBlock('policy');
  if (policyBlock) {
    result.schemaVersion = 2;
    result.policy = { ...result.policy, ...parseMap('policy', `policy:\n${policyBlock}`) };
  }

  const genBlock = getSectionBlock('generation');
  if (genBlock) {
    result.schemaVersion = 2;
    result.generation.documents = parseList('documents', genBlock);
  }

  const techDefaultsBlock = getSectionBlock('technologyDefaults');
  if (techDefaultsBlock) {
    result.schemaVersion = 2;
    result.technologyDefaults = parseMap('technologyDefaults', `technologyDefaults:\n${techDefaultsBlock}`);
  }

  // Legacy fields
  result.prefer_skills = parseList('prefer_skills');
  result.exclude_skills = parseList('exclude_skills');
  result.require_skills = parseList('require_skills');
  result.generate_docs = parseList('generate_docs');
  result.skip_docs = parseList('skip_docs');
  result.enforce = parseMap('enforce');
  result.defaults = parseMap('defaults');

  // Normalization and bidirectional sync
  if (result.skills.preferred.length === 0 && result.prefer_skills.length > 0) {
    result.skills.preferred = [...result.prefer_skills];
  } else if (result.prefer_skills.length === 0 && result.skills.preferred.length > 0) {
    result.prefer_skills = [...result.skills.preferred];
  }

  if (result.skills.excluded.length === 0 && result.exclude_skills.length > 0) {
    result.skills.excluded = [...result.exclude_skills];
  } else if (result.exclude_skills.length === 0 && result.skills.excluded.length > 0) {
    result.exclude_skills = [...result.skills.excluded];
  }

  if (result.skills.required.length === 0 && result.require_skills.length > 0) {
    result.skills.required = [...result.require_skills];
  } else if (result.require_skills.length === 0 && result.skills.required.length > 0) {
    result.require_skills = [...result.skills.required];
  }

  if (Object.keys(result.technologyDefaults).length === 0 && Object.keys(result.defaults).length > 0) {
    result.technologyDefaults = { ...result.defaults };
  } else if (Object.keys(result.defaults).length === 0 && Object.keys(result.technologyDefaults).length > 0) {
    result.defaults = { ...result.technologyDefaults };
  }

  if (result.generation.documents.length === 0 && result.generate_docs.length > 0) {
    result.generation.documents = [...result.generate_docs];
  } else if (result.generate_docs.length === 0 && result.generation.documents.length > 0) {
    result.generate_docs = [...result.generation.documents];
  }

  // Policy <-> Enforce sync
  if (policyBlock) {
    result.enforce.testing = result.policy.testing === 'required' || result.policy.verification === 'required';
    result.enforce.adr = result.policy.adr === 'required';
    result.enforce.code_review = result.policy.review === 'required';
    result.enforce.security_audit = result.policy.security === 'required';
    result.enforce.accessibility_audit = result.policy.accessibility === 'required';
  } else if (Object.keys(result.enforce).length > 0) {
    if (result.enforce.testing !== undefined) {
      result.policy.testing = result.enforce.testing ? 'required' : 'off';
      result.policy.verification = result.enforce.testing ? 'required' : 'off';
    }
    if (result.enforce.adr !== undefined) {
      result.policy.adr = result.enforce.adr ? 'required' : 'off';
    }
    if (result.enforce.code_review !== undefined) {
      result.policy.review = result.enforce.code_review ? 'required' : 'off';
    }
    if (result.enforce.security_audit !== undefined) {
      result.policy.security = result.enforce.security_audit ? 'required' : 'off';
    }
    if (result.enforce.accessibility_audit !== undefined) {
      result.policy.accessibility = result.enforce.accessibility_audit ? 'required' : 'off';
    }
  }

  return result;
}

/**
 * Validates a profile configuration for contradictions and unknown skills.
 *
 * @param {ProfileConfig} profile - Profile to validate
 * @param {Object} [registry] - Compiled skill registry
 * @returns {{ valid: boolean }} Validation result
 */
function validateProfile(profile, registry = null) {
  if (!profile || typeof profile !== 'object') {
    const err = new Error('Invalid profile: expected an object');
    err.code = 'CTX_PROFILE_INVALID';
    throw err;
  }
  if (!profile.id || typeof profile.id !== 'string') {
    const err = new Error('Invalid profile: missing profile id');
    err.code = 'CTX_PROFILE_INVALID';
    throw err;
  }

  const required = profile.skills?.required || profile.require_skills || [];
  const preferred = profile.skills?.preferred || profile.prefer_skills || [];
  const excluded = profile.skills?.excluded || profile.exclude_skills || [];

  // Check contradictions between required and excluded
  const excSet = new Set(excluded);
  for (const s of required) {
    if (excSet.has(s)) {
      const err = new Error(`Profile contradiction in '${profile.id}': skill '${s}' cannot be both required and excluded.`);
      err.code = 'CTX_PROFILE_CONTRADICTION';
      err.skill = s;
      throw err;
    }
  }

  // Check contradictions between preferred and excluded
  for (const s of preferred) {
    if (excSet.has(s)) {
      const err = new Error(`Profile contradiction in '${profile.id}': skill '${s}' cannot be both preferred and excluded.`);
      err.code = 'CTX_PROFILE_CONTRADICTION';
      err.skill = s;
      throw err;
    }
  }

  // Validate skill IDs against registry if provided
  if (registry && registry.skills) {
    const validSkillIds = new Set(Object.keys(registry.skills));
    const allSkills = [...required, ...preferred, ...excluded];
    for (const s of allSkills) {
      if (!validSkillIds.has(s)) {
        const err = new Error(`Unknown skill ID '${s}' in profile '${profile.id}'. Real registered skill IDs only.`);
        err.code = 'CTX_PROFILE_UNKNOWN_SKILL';
        err.skill = s;
        throw err;
      }
    }
  }

  // Validate policy values
  const validPolicyValues = new Set(['required', 'recommended', 'off']);
  const policy = profile.policy || {};
  for (const [key, val] of Object.entries(policy)) {
    if (typeof val === 'string' && !validPolicyValues.has(val)) {
      const err = new Error(`Invalid policy value '${val}' for '${key}' in profile '${profile.id}'. Expected: required, recommended, off.`);
      err.code = 'CTX_PROFILE_INVALID_POLICY';
      throw err;
    }
  }

  return { valid: true };
}

/**
 * Lists all available project profiles defined in core/profiles.
 *
 * @returns {ProfileConfig[]} Array of profile configurations
 */
function listProfiles() {
  if (!fs.existsSync(PROFILES_DIR)) return [];
  const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  return files.map(file => {
    const content = fs.readFileSync(path.join(PROFILES_DIR, file), 'utf8');
    const parsed = parseYamlProfile(content);
    if (!parsed.id) parsed.id = path.basename(file, path.extname(file));
    if (!parsed.name) parsed.name = parsed.id;
    return parsed;
  });
}

/**
 * Finds a profile by its slug ID or title.
 *
 * @param {string} name - Profile identifier or name
 * @returns {ProfileConfig|null} Found profile or null
 */
function getProfile(name) {
  if (!name) return null;
  const clean = name.toLowerCase().trim();
  const all = listProfiles();
  return all.find(p => p.id.toLowerCase() === clean || p.name.toLowerCase() === clean) || null;
}

function getProfileLockPath(projectDir = process.cwd()) {
  return path.join(projectDir, '.agents', 'profile.json');
}

/**
 * Gets the active profile, taking package overrides into account when a file or scope is passed.
 *
 * @param {string} [projectDir=process.cwd()] - Project directory
 * @param {string} [targetFileOrScope] - Optional file path or package scope
 * @returns {Object|null} Active profile config or null
 */
function getActiveProfile(projectDir = process.cwd(), targetFileOrScope = null) {
  const lockPath = getProfileLockPath(projectDir);
  if (!fs.existsSync(lockPath)) return null;
  let lockData = null;
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    lockData = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!lockData) return null;

  // Check for monorepo package override
  if (targetFileOrScope && lockData.overrides && typeof lockData.overrides === 'object') {
    const normalizedScope = targetFileOrScope.replace(/\\/g, '/').replace(/^\.\//, '');

    // 1. Direct key match in overrides
    let matchedProfileName = lockData.overrides[normalizedScope];
    let matchedScope = normalizedScope;

    // 2. Prefix match in overrides
    if (!matchedProfileName) {
      for (const [scopeKey, profName] of Object.entries(lockData.overrides)) {
        const cleanScope = scopeKey.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
        if (normalizedScope === cleanScope || normalizedScope.startsWith(cleanScope + '/')) {
          matchedProfileName = profName;
          matchedScope = cleanScope;
          break;
        }
      }
    }

    // 3. Nearest package match via WorkspaceGraphBuilder
    if (!matchedProfileName) {
      try {
        const { WorkspaceGraphBuilder } = require('./workspace/workspace-graph.js');
        const builder = new WorkspaceGraphBuilder();
        const graph = builder.build(projectDir);
        const nearestPkg = builder.findNearestPackage(normalizedScope, graph);
        if (nearestPkg) {
          if (lockData.overrides[nearestPkg.name]) {
            matchedProfileName = lockData.overrides[nearestPkg.name];
            matchedScope = nearestPkg.name;
          } else if (lockData.overrides[nearestPkg.root]) {
            matchedProfileName = lockData.overrides[nearestPkg.root];
            matchedScope = nearestPkg.root;
          }
        }
      } catch {
        // ignore workspace graph failure
      }
    }

    if (matchedProfileName) {
      const overrideProf = getProfile(matchedProfileName);
      if (overrideProf) {
        return {
          ...overrideProf,
          profile: overrideProf.id,
          isOverride: true,
          scope: matchedScope,
          rootProfile: lockData.profile,
          overrides: lockData.overrides,
        };
      }
    }
  }

  return lockData;
}

/**
 * Applies a profile to the project, supporting root apply or package-scoped overrides.
 *
 * @param {string} profileName - Profile slug or name
 * @param {string} [projectDir=process.cwd()] - Project directory
 * @param {Object} [options={}] - Options (scope, noExport)
 * @returns {Object} Updated profile lock data
 */
function applyProfile(profileName, projectDir = process.cwd(), options = {}) {
  const profile = getProfile(profileName);
  if (!profile) {
    throw new Error(`Profile '${profileName}' not found. Available profiles: ${listProfiles().map(p => p.id).join(', ')}`);
  }

  validateProfile(profile);

  const lockPath = getProfileLockPath(projectDir);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  let existing = {};
  if (fs.existsSync(lockPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    } catch {
      existing = {};
    }
  }

  let lockData;
  if (options.scope) {
    const scope = options.scope.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
    const overrides = existing.overrides || {};
    overrides[scope] = profile.id;

    lockData = {
      ...existing,
      overrides,
      updatedAt: new Date().toISOString(),
    };
    if (!lockData.profile) {
      lockData.profile = profile.id;
      lockData.name = profile.name;
      lockData.description = profile.description;
      lockData.skills = profile.skills;
      lockData.policy = profile.policy;
      lockData.generation = profile.generation;
      lockData.technologyDefaults = profile.technologyDefaults;
      lockData.exclude_skills = profile.exclude_skills || [];
      lockData.prefer_skills = profile.prefer_skills || [];
      lockData.require_skills = profile.require_skills || [];
      lockData.enforce = profile.enforce || {};
      lockData.defaults = profile.defaults || {};
    }
  } else {
    lockData = {
      schemaVersion: 2,
      profile: profile.id,
      name: profile.name,
      description: profile.description,
      skills: profile.skills || {
        required: profile.require_skills || [],
        preferred: profile.prefer_skills || [],
        excluded: profile.exclude_skills || [],
      },
      policy: profile.policy || {},
      generation: profile.generation || {
        documents: profile.generate_docs || [],
      },
      technologyDefaults: profile.technologyDefaults || profile.defaults || {},
      exclude_skills: profile.exclude_skills || [],
      prefer_skills: profile.prefer_skills || [],
      require_skills: profile.require_skills || [],
      enforce: profile.enforce || {},
      defaults: profile.defaults || {},
      overrides: existing.overrides || {},
      appliedAt: new Date().toISOString(),
    };
  }

  const lock = new ProjectMutationLock(projectDir);
  const lockToken = lock.acquire({ command: `profile apply ${profile.id}` });

  try {
    const tx = new JournaledTransaction(projectDir);
    tx.stageWrite(path.relative(projectDir, lockPath).replace(/\\/g, '/'), JSON.stringify(lockData, null, 2) + '\n');
    tx.commit();
  } finally {
    lock.release(lockToken);
  }

  return lockData;
}

/**
 * Removes active profile lock or a specific package override.
 *
 * @param {string} [projectDir=process.cwd()] - Project directory
 * @param {Object} [options={}] - Options (scope)
 * @returns {boolean} True if removed
 */
function removeActiveProfile(projectDir = process.cwd(), options = {}) {
  const lockPath = getProfileLockPath(projectDir);
  if (!fs.existsSync(lockPath)) return false;

  if (options && options.scope) {
    try {
      const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const cleanScope = options.scope.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
      if (lockData.overrides && lockData.overrides[cleanScope]) {
        delete lockData.overrides[cleanScope];
        
        const lock = new ProjectMutationLock(projectDir);
        const lockToken = lock.acquire({ command: 'profile remove override' });
        try {
          const tx = new JournaledTransaction(projectDir);
          tx.stageWrite(path.relative(projectDir, lockPath).replace(/\\/g, '/'), JSON.stringify(lockData, null, 2) + '\n');
          tx.commit();
        } finally {
          lock.release(lockToken);
        }
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  const lock = new ProjectMutationLock(projectDir);
  const lockToken = lock.acquire({ command: 'profile remove' });
  try {
    const tx = new JournaledTransaction(projectDir);
    tx.stageDelete(path.relative(projectDir, lockPath).replace(/\\/g, '/'));
    tx.commit();
  } finally {
    lock.release(lockToken);
  }
  return true;
}

/**
 * Returns structured explanation of a profile.
 *
 * @param {string} profileName - Profile slug or name
 * @param {string} [projectDir=process.cwd()] - Project directory
 * @returns {Object} Explanation structure
 */
function explainProfile(profileName, projectDir = process.cwd()) {
  const profile = getProfile(profileName);
  if (!profile) {
    throw new Error(`Profile '${profileName}' not found. Available profiles: ${listProfiles().map(p => p.id).join(', ')}`);
  }

  return {
    schemaVersion: profile.schemaVersion || 2,
    id: profile.id,
    name: profile.name,
    description: profile.description,
    skills: {
      required: profile.skills?.required || profile.require_skills || [],
      preferred: profile.skills?.preferred || profile.prefer_skills || [],
      excluded: profile.skills?.excluded || profile.exclude_skills || [],
    },
    policy: profile.policy || {},
    technologyDefaults: profile.technologyDefaults || profile.defaults || {},
    generation: {
      documents: profile.generation?.documents || profile.generate_docs || [],
    },
  };
}

/**
 * Formats structured profile explanation into human-readable text.
 *
 * @param {Object} explanation - Profile explanation object
 * @returns {string} Formatted text
 */
function formatProfileExplanation(explanation) {
  const lines = [];
  lines.push(`Profile: ${explanation.name} (${explanation.id})`);
  lines.push(`Description: ${explanation.description}`);
  lines.push('');
  lines.push('Skills:');
  lines.push(`  Required:  ${explanation.skills.required.length > 0 ? explanation.skills.required.join(', ') : 'none'}`);
  lines.push(`  Preferred: ${explanation.skills.preferred.length > 0 ? explanation.skills.preferred.join(', ') : 'none'}`);
  lines.push(`  Excluded:  ${explanation.skills.excluded.length > 0 ? explanation.skills.excluded.join(', ') : 'none'}`);
  lines.push('');
  lines.push('Policy:');
  for (const [key, val] of Object.entries(explanation.policy)) {
    lines.push(`  ${(key.charAt(0).toUpperCase() + key.slice(1)).padEnd(14)}: ${val}`);
  }
  lines.push('');
  lines.push('Technology Defaults:');
  const techKeys = Object.keys(explanation.technologyDefaults);
  if (techKeys.length === 0) {
    lines.push('  none');
  } else {
    for (const [key, val] of Object.entries(explanation.technologyDefaults)) {
      lines.push(`  ${key.padEnd(14)}: ${val}`);
    }
  }
  lines.push('');
  lines.push('Generation Documents:');
  lines.push(`  ${explanation.generation.documents.join(', ') || 'none'}`);
  return lines.join('\n');
}

/**
 * @typedef {Object} StackDetectionResult
 * @property {string[]} detected - List of identified technologies and frameworks
 * @property {string} recommendedProfile - Recommended profile identifier
 * @property {string[]} recommendedSkills - Recommended skill IDs for the detected stack
 */

/**
 * Auto-detect tech stack from project files and suggest best profile and skills.
 *
 * @param {string} [projectDir=process.cwd()] - Target directory to inspect
 * @returns {StackDetectionResult} Detected stack and recommendations
 */
function detectStack(projectDir = process.cwd()) {
  const detected = [];
  const recommendedSkills = new Set(['engineering-workflow', 'gstack-roles', 'ponytail-mindset', 'security']);

  // Check package.json
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      if (deps['next']) {
        detected.push('Next.js');
        recommendedSkills.add('nextjs');
        recommendedSkills.add('react');
        recommendedSkills.add('typescript');
        recommendedSkills.add('ui-ux-pro');
        recommendedSkills.add('impeccable-design');
      } else if (deps['react']) {
        detected.push('React');
        recommendedSkills.add('react');
        recommendedSkills.add('typescript');
        recommendedSkills.add('ui-ux-pro');
      }

      if (deps['tailwindcss']) {
        detected.push('Tailwind CSS');
        recommendedSkills.add('ui-ux-pro');
        recommendedSkills.add('ui-design');
      }

      if (deps['typescript'] || fs.existsSync(path.join(projectDir, 'tsconfig.json'))) {
        detected.push('TypeScript');
        recommendedSkills.add('typescript');
      }

      if (deps['@nestjs/core']) {
        detected.push('NestJS');
        recommendedSkills.add('nestjs');
        recommendedSkills.add('system-design');
        recommendedSkills.add('ddd');
      } else if (deps['express'] || deps['fastify'] || deps['koa']) {
        detected.push('Node.js Backend');
        recommendedSkills.add('node');
        recommendedSkills.add('system-design');
      }

      if (deps['@prisma/client'] || deps['prisma'] || deps['drizzle-orm'] || deps['typeorm'] || deps['pg']) {
        detected.push('Relational DB / ORM');
        recommendedSkills.add('system-design');
        recommendedSkills.add('ddd');
      }
    } catch {
      // ignore parse error
    }
  }

  // Check Python files
  const hasPyFiles = fs.existsSync(path.join(projectDir, 'requirements.txt')) ||
                     fs.existsSync(path.join(projectDir, 'pyproject.toml')) ||
                     fs.existsSync(path.join(projectDir, 'Pipfile'));
  if (hasPyFiles) {
    detected.push('Python');
    recommendedSkills.add('fastapi');
    recommendedSkills.add('system-design');
  }

  // Infer recommended profile
  let recommendedProfile = 'startup';
  const hasFrontend = detected.some(d => ['React', 'Next.js', 'Tailwind CSS'].includes(d));
  const hasBackend = detected.some(d => ['Node.js Backend', 'NestJS', 'Python'].includes(d));

  if (hasFrontend && !hasBackend) {
    recommendedProfile = 'frontend';
  } else if (!hasFrontend && hasBackend) {
    recommendedProfile = 'backend';
  } else if (hasFrontend && hasBackend) {
    recommendedProfile = 'startup';
  }

  return {
    detected,
    recommendedProfile,
    recommendedSkills: Array.from(recommendedSkills),
  };
}

module.exports = {
  listProfiles,
  getProfile,
  getActiveProfile,
  applyProfile,
  removeActiveProfile,
  detectStack,
  parseYamlProfile,
  validateProfile,
  explainProfile,
  formatProfileExplanation,
};
