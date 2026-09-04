/**
 * .agents/resolver.js
 * ContextOS — Dynamic Skill Resolver & Progressive Index Engine
 *
 * Resolves the minimal set of skills required for a given task, file list, or prompt,
 * keeping the LLM's active context lean and fast.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname);
const CORE_SKILLS_DIR = path.join(AGENTS_DIR, 'core', 'skills');

/**
 * Keyword & Regex matching rules for dynamic resolution.
 */
const SKILL_RULES = [
  {
    skill: 'nextjs',
    triggers: [/\bnext(?:\.js)?\b/i, /\bapp\s*router\b/i, /\bserver\s*actions?\b/i, /\brsc\b/i, /\bpage\.tsx\b/i, /\blayout\.tsx\b/i],
    fileGlobs: [/app\/.*\.(tsx|jsx|ts|js)$/, /next\.config\./],
  },
  {
    skill: 'react',
    triggers: [/\breact\b/i, /\bcomponent\b/i, /\bhooks?\b/i, /\buseState\b/i, /\buseEffect\b/i, /\buseOptimistic\b/i, /\buseMemo\b/i, /\bprops\b/i],
    fileGlobs: [/\.(tsx|jsx)$/],
  },
  {
    skill: 'typescript',
    triggers: [/\btypescript\b/i, /\btype-?safe\b/i, /\bgenerics?\b/i, /\binterface\b/i, /\btsconfig\b/i, /\btypes?\b/i],
    fileGlobs: [/\.tsx?$/, /tsconfig\.json$/],
  },
  {
    skill: 'ui-ux-pro',
    triggers: [/\bui\b/i, /\bux\b/i, /\bdesign\b/i, /\bcss\b/i, /\btailwind\b/i, /\bstyling\b/i, /\btheme\b/i, /\bmodal\b/i, /\bbutton\b/i],
    fileGlobs: [/\.(css|scss|sass)$/, /tailwind\.config\./],
  },
  {
    skill: 'web-accessibility',
    triggers: [/\baccessib\w*\b/i, /\ba11y\b/i, /\baria\b/i, /\bfocus\s*trap\b/i, /\bkeyboard\s*nav/i, /\bwcag\b/i, /\bscreen\s*reader\b/i],
    fileGlobs: [],
  },
  {
    skill: 'impeccable-design',
    triggers: [/\bpolish\b/i, /\bvisual\s*qa\b/i, /\bmicro-?animation\b/i, /\bglassmorphism\b/i, /\btypography\b/i],
    fileGlobs: [],
  },
  {
    skill: 'database',
    triggers: [/\bdatabase\b/i, /\bsql\b/i, /\bpostgres(?:ql)?\b/i, /\bprisma\b/i, /\bdrizzle\b/i, /\bmigration\b/i, /\bquery\b/i, /\borm\b/i, /\bindex(?:ing)?\b/i, /\bschema\b/i],
    fileGlobs: [/\.prisma$/, /drizzle\.config\./, /\bmigrations?\/.*\.sql$/],
  },
  {
    skill: 'security',
    triggers: [/\bauth\b/i, /\bjwt\b/i, /\blogin\b/i, /\bcsrf\b/i, /\bxss\b/i, /\brate\s*limit\b/i, /\bpermission\b/i, /\bsession\b/i, /\btoken\b/i],
    fileGlobs: [/\bauth\b/, /\bsecurity\b/],
  },
  {
    skill: 'performance',
    triggers: [/\bperformance\b/i, /\boptimize\b/i, /\bslow\b/i, /\blatency\b/i, /\blcp\b/i, /\bcls\b/i, /\binp\b/i, /\bcore\s*web\s*vitals\b/i, /\bwaterfall\b/i, /\bbundle\s*size\b/i],
    fileGlobs: [],
  },
  {
    skill: 'testing',
    triggers: [/\btest(?:s|ing)?\b/i, /\bvitest\b/i, /\bjest\b/i, /\bplaywright\b/i, /\btdd\b/i, /\bbdd\b/i, /\be2e\b/i, /\bmock\b/i],
    fileGlobs: [/\.(test|spec)\.(ts|js|tsx|jsx|py)$/, /vitest\.config\./, /playwright\.config\./],
  },
  {
    skill: 'docker',
    triggers: [/\bdocker\b/i, /\bcontainer\b/i, /\bdockerfile\b/i, /\bcompose\b/i, /\bkubernetes\b/i, /\bk8s\b/i],
    fileGlobs: [/Dockerfile/, /docker-compose\./],
  },
  {
    skill: 'fastapi',
    triggers: [/\bfastapi\b/i, /\bpython\b/i, /\bpydantic\b/i, /\buvicorn\b/i, /\bpytest\b/i],
    fileGlobs: [/\.py$/, /requirements\.txt$/, /pyproject\.toml$/],
  },
  {
    skill: 'nestjs',
    triggers: [/\bnestjs\b/i, /\b@nestjs\b/i, /\bmodule\b/i, /\bcontroller\b/i, /\binjectable\b/i],
    fileGlobs: [/nest-cli\.json$/],
  },
  {
    skill: 'node',
    triggers: [/\bnode(?:\.js)?\b/i, /\bexpress\b/i, /\bfastify\b/i, /\bbackend\b/i, /\bapi\s*route\b/i],
    fileGlobs: [],
  },
  {
    skill: 'ddd',
    triggers: [/\bddd\b/i, /\bdomain-?driven\b/i, /\baggregate\b/i, /\bentity\b/i, /\bvalue\s*object\b/i, /\bbounded\s*context\b/i],
    fileGlobs: [],
  },
  {
    skill: 'microservices',
    triggers: [/\bmicroservices?\b/i, /\bevent-?driven\b/i, /\brabbitmq\b/i, /\bkafka\b/i, /\bpub\/?sub\b/i, /\bgrpc\b/i],
    fileGlobs: [],
  },
  {
    skill: 'system-design',
    triggers: [/\barchitecture\b/i, /\bsystem\s*design\b/i, /\bscalab(?:le|ility)\b/i, /\bhigh\s*concurrency\b/i, /\bcircuit\s*breaker\b/i],
    fileGlobs: [],
  },
];

/**
 * @typedef {Object} SkillIndexItem
 * @property {string} name - Skill unique identifier
 * @property {string} description - Brief summary of the skill
 * @property {string} path - Relative path to the skill markdown document
 */

/**
 * @typedef {Object} ResolveSkillsOptions
 * @property {string} [prompt] - Free-form prompt text describing the current task
 * @property {string[]} [files] - List of file paths currently touched or opened
 * @property {string} [phase] - Active lifecycle phase (Define, Plan, Build, Verify, Review, Ship)
 * @property {string} [domain] - Engineering domain override (Frontend, Backend, Architecture, Full-Stack, DevOps)
 */

/**
 * @typedef {Object} ResolvedSkillsResult
 * @property {string} domain - Identified technical domain
 * @property {string} phase - Current pipeline phase
 * @property {string} role - Specialized GStack agent role
 * @property {string[]} skills - Resolved list of minimal skill identifiers
 */

/**
 * Builds a compact, progressive index of all available skills.
 *
 * @param {string} [projectDir=process.cwd()] - Target root directory of the project
 * @returns {SkillIndexItem[]} Array of indexed skill metadata objects
 */
function buildSkillIndex(projectDir = process.cwd()) {
  const shared = require(path.join(AGENTS_DIR, 'adapters', 'shared.js'));
  const skillDirs = shared.collectSkillDirectories();
  const index = [];

  for (const dir of skillDirs) {
    const skillName = path.basename(dir);
    const skillMdPath = path.join(dir, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;

    const raw = fs.readFileSync(skillMdPath, 'utf8');
    let description = '';
    const descMatch = raw.match(/description:\s*(?:>)?\s*([^\n\r]+)/);
    if (descMatch) {
      description = descMatch[1].trim().replace(/^['"]|['"]$/g, '');
    }

    const relPath = path.relative(projectDir, skillMdPath).replace(/\\/g, '/');

    index.push({
      name: skillName,
      description: description || `ContextOS skill for ${skillName}`,
      path: relPath,
    });
  }

  return index;
}

/**
 * Resolves the minimal set of skills for a given prompt, file list, and phase.
 *
 * @param {ResolveSkillsOptions} [options={}] - Task context options
 * @returns {ResolvedSkillsResult} Resolved domain, role, and activated skill names
 */
function resolveSkills({ prompt = '', files = [], phase = 'Build', domain = '' } = {}) {
  const selectedSkills = new Set();
  const promptText = (prompt || '').toLowerCase();

  // Always include foundational skills
  selectedSkills.add('ponytail-mindset');
  selectedSkills.add('engineering-workflow');

  // Match skills against prompt text
  for (const rule of SKILL_RULES) {
    const hasPromptMatch = rule.triggers.some(pattern => pattern.test(promptText));
    if (hasPromptMatch) {
      selectedSkills.add(rule.skill);
    }
  }

  // Match skills against file paths
  for (const file of files) {
    const normalized = file.replace(/\\/g, '/');
    for (const rule of SKILL_RULES) {
      const hasFileMatch = rule.fileGlobs.some(pattern => pattern.test(normalized));
      if (hasFileMatch) {
        selectedSkills.add(rule.skill);
      }
    }
  }

  // Synergy rules (from AGENTS.md matrix)
  if (selectedSkills.has('database') || selectedSkills.has('microservices') || selectedSkills.has('ddd')) {
    selectedSkills.add('system-design');
  }

  // Infer Domain if not specified
  let inferredDomain = domain;
  if (!inferredDomain) {
    const isFrontend = selectedSkills.has('react') || selectedSkills.has('nextjs') || selectedSkills.has('ui-ux-pro');
    const isBackend = selectedSkills.has('database') || selectedSkills.has('fastapi') || selectedSkills.has('nestjs') || selectedSkills.has('node') || selectedSkills.has('system-design');
    if (isFrontend && isBackend) inferredDomain = 'Full-Stack';
    else if (isFrontend) inferredDomain = 'Frontend';
    else if (isBackend) inferredDomain = 'Backend';
    else inferredDomain = 'Architecture';
  }

  // Infer Role
  let inferredRole = 'Senior Developer';
  if (phase.toLowerCase() === 'define') inferredRole = 'Product Manager';
  else if (phase.toLowerCase() === 'plan') inferredRole = 'Architect';
  else if (phase.toLowerCase() === 'review') inferredRole = inferredDomain === 'Frontend' ? 'Staff Engineer + Senior Designer' : 'Staff Engineer';
  else if (phase.toLowerCase() === 'test') inferredRole = 'QA Lead';
  else if (phase.toLowerCase() === 'ship') inferredRole = 'Release Engineer';

  return {
    domain: inferredDomain,
    phase: phase,
    role: inferredRole,
    skills: Array.from(selectedSkills),
  };
}

/**
 * Formats resolved skills into a clean ContextOS declaration string.
 *
 * @param {ResolvedSkillsResult} resolution - Resolution result from resolveSkills
 * @returns {string} ContextOS formatted header string matching Step 0 format
 */
function formatDeclaration(resolution) {
  return `[DOMAIN: ${resolution.domain}] [PHASE: ${resolution.phase}] [ROLE: ${resolution.role}]\nSkills loaded: ${resolution.skills.join(', ')}`;
}

module.exports = {
  buildSkillIndex,
  resolveSkills,
  formatDeclaration,
};
