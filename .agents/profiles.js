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

const AGENTS_DIR = path.join(__dirname);
const PROFILES_DIR = path.join(AGENTS_DIR, 'core', 'profiles');

/**
 * @typedef {Object} ProfileConfig
 * @property {string} id - Profile unique slug
 * @property {string} name - Human-readable profile title
 * @property {string} description - Summary of the profile's purpose
 * @property {string[]} prefer_skills - Priority skills favored by this profile
 * @property {string[]} exclude_skills - Skills filtered out for this profile
 * @property {string[]} generate_docs - Documentation templates to generate
 * @property {string[]} skip_docs - Documentation to skip
 * @property {Object} enforce - Invariant rules to enforce
 * @property {Object} defaults - Default parameters
 */

/**
 * Parses a profile YAML string into a structured ProfileConfig object.
 *
 * @param {string} text - Raw YAML profile file content
 * @returns {ProfileConfig} Structured profile configuration
 */
function parseYamlProfile(text) {
  const result = {
    id: '',
    name: '',
    description: '',
    prefer_skills: [],
    exclude_skills: [],
    generate_docs: [],
    skip_docs: [],
    enforce: {},
    defaults: {},
  };

  const idMatch = text.match(/^id:\s*(.+)$/m);
  if (idMatch) result.id = idMatch[1].trim().replace(/^['"]|['"]$/g, '');

  const nameMatch = text.match(/^name:\s*(.+)$/m);
  if (nameMatch) result.name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');

  const descMatch = text.match(/^description:\s*(.+)$/m);
  if (descMatch) result.description = descMatch[1].trim().replace(/^['"]|['"]$/g, '');

  function parseList(field) {
    const blockRegex = new RegExp(`^${field}:\\s*\\n((?:[ \\t]+-[^\\n]*\\n?)+)`, 'm');
    const match = text.match(blockRegex);
    if (!match) {
      const inlineRegex = new RegExp(`^${field}:\\s*\\[([^\\]]*)]`, 'm');
      const inlineMatch = text.match(inlineRegex);
      if (!inlineMatch || !inlineMatch[1].trim()) return [];
      return inlineMatch[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    }
    return match[1]
      .split('\n')
      .map(l => l.replace(/^[ \t]+-\s*/, '').replace(/#.*$/, '').trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  result.prefer_skills = parseList('prefer_skills');
  result.exclude_skills = parseList('exclude_skills');
  result.generate_docs = parseList('generate_docs');
  result.skip_docs = parseList('skip_docs');

  return result;
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

function getActiveProfile(projectDir = process.cwd()) {
  const lockPath = getProfileLockPath(projectDir);
  if (!fs.existsSync(lockPath)) return null;
  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function applyProfile(profileName, projectDir = process.cwd()) {
  const profile = getProfile(profileName);
  if (!profile) {
    throw new Error(`Profile '${profileName}' not found. Available profiles: ${listProfiles().map(p => p.id).join(', ')}`);
  }

  const lockPath = getProfileLockPath(projectDir);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  const lockData = {
    profile: profile.id,
    name: profile.name,
    description: profile.description,
    exclude_skills: profile.exclude_skills || [],
    prefer_skills: profile.prefer_skills || [],
    appliedAt: new Date().toISOString(),
  };

  fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2) + '\n');
  return lockData;
}

function removeActiveProfile(projectDir = process.cwd()) {
  const lockPath = getProfileLockPath(projectDir);
  if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
    return true;
  }
  return false;
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
};
