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
    strong: [/\bnext(?:\.js)?\b/i, /\bapp\s*router\b/i, /\bserver\s*actions?\b/i, /\brsc\b/i, /некст/i],
    medium: [/\bpage\.tsx\b/i, /\blayout\.tsx\b/i],
    weak: [],
    fileGlobs: [/app\/.*\.(tsx|jsx|ts|js)$/, /next\.config\./],
  },
  {
    skill: 'react',
    strong: [/\breact\b/i, /\buseOptimistic\b/i, /компонент/i, /хук/i],
    medium: [/\bcomponent\b/i, /\bhooks?\b/i, /\buseState\b/i, /\buseEffect\b/i, /\buseMemo\b/i, /\bprops\b/i, /модал\w*/i],
    weak: [],
    fileGlobs: [/\.(tsx|jsx)$/],
  },
  {
    skill: 'typescript',
    strong: [/\btypescript\b/i, /\btype-?safe\b/i, /\bgenerics?\b/i, /\binterface\b/i, /\btsconfig\b/i, /тайпскрипт/i, /типизац/i],
    medium: [],
    weak: [/\btypes?\b/i],
    fileGlobs: [/\.tsx?$/, /tsconfig\.json$/],
  },
  {
    skill: 'ui-ux-pro',
    strong: [/\bui\b/i, /\bux\b/i, /\btailwind\b/i, /\bstyling\b/i, /дизайн/i, /верстк/i, /макет/i, /интерфейс/i],
    medium: [/\bcss\b/i, /\btheme\b/i, /\bmodal\b/i, /\bbutton\b/i, /модал\w*/i, /кнопк/i],
    weak: [/\bdesign\b/i],
    fileGlobs: [/\.(css|scss|sass)$/, /tailwind\.config\./],
  },
  {
    skill: 'web-accessibility',
    strong: [/\baccessib\w*\b/i, /\ba11y\b/i, /\baria\b/i, /\bfocus\s*trap\b/i, /\bkeyboard\s*nav/i, /\bwcag\b/i, /\bscreen\s*reader\b/i, /доступност/i, /скринридер/i],
    medium: [],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'impeccable-design',
    strong: [/\bvisual\s*qa\b/i, /\bmicro-?animation\b/i, /\bglassmorphism\b/i, /\btypography\b/i, /анимац/i, /полировк/i],
    medium: [/\bpolish\b/i],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'database',
    strong: [/\bdatabase\b/i, /\bsql\b/i, /\bpostgres(?:ql)?\b/i, /\bprisma\b/i, /\bdrizzle\b/i, /\bmigration\b/i, /\borm\b/i, /баз.*данн/i, /миграц/i, /таблиц/i],
    medium: [/\bschema\b/i],
    weak: [/\bquery\b/i, /\bindex(?:ing)?\b/i],
    fileGlobs: [/\.prisma$/, /drizzle\.config\./, /\bmigrations?\/.*\.sql$/],
  },
  {
    skill: 'security',
    strong: [/\bauth\b/i, /\bjwt\b/i, /\blogin\b/i, /\bcsrf\b/i, /\bxss\b/i, /\brate\s*limit\b/i, /авториз/i, /аутентифик/i, /парол/i, /безопасност/i],
    medium: [/\bpermission\b/i, /\bsession\b/i, /\btoken\b/i, /токен/i],
    weak: [],
    fileGlobs: [/\bauth\b/, /\bsecurity\b/],
  },
  {
    skill: 'performance',
    strong: [/\bperformance\b/i, /\blatency\b/i, /\blcp\b/i, /\bcls\b/i, /\binp\b/i, /\bcore\s*web\s*vitals\b/i, /\bwaterfall\b/i, /\bbundle\s*size\b/i, /производительн/i, /ускор/i],
    medium: [/\boptimize\b/i, /\bslow\b/i, /оптимиз/i, /медленн/i],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'testing',
    strong: [/\bvitest\b/i, /\bjest\b/i, /\bplaywright\b/i, /\btdd\b/i, /\bbdd\b/i, /\be2e\b/i, /тестирован/i, /покрыти/i, /юнит/i],
    medium: [/\btest(?:s|ing)?\b/i, /\bmock\b/i, /тест/i],
    weak: [],
    fileGlobs: [/\.(test|spec)\.(ts|js|tsx|jsx|py)$/, /vitest\.config\./, /playwright\.config\./],
  },
  {
    skill: 'docker',
    strong: [/\bdocker\b/i, /\bdockerfile\b/i, /\bcompose\b/i, /\bkubernetes\b/i, /\bk8s\b/i, /докер/i],
    medium: [],
    weak: [/\bcontainer\b/i, /контейнер/i],
    fileGlobs: [/Dockerfile/, /docker-compose\./],
  },
  {
    skill: 'fastapi',
    strong: [/\bfastapi\b/i, /\bpydantic\b/i, /\buvicorn\b/i, /\bpytest\b/i, /питон/i],
    medium: [/\bpython\b/i],
    weak: [],
    fileGlobs: [/\.py$/, /requirements\.txt$/, /pyproject\.toml$/],
  },
  {
    skill: 'nestjs',
    strong: [/\bnestjs\b/i, /\b@nestjs\b/i, /нест/i],
    medium: [],
    weak: [/\bmodule\b/i, /\bcontroller\b/i, /\binjectable\b/i],
    fileGlobs: [/nest-cli\.json$/],
  },
  {
    skill: 'node',
    strong: [/\bnode(?:\.js)?\b/i, /\bexpress\b/i, /\bfastify\b/i],
    medium: [/\bbackend\b/i, /\bapi\s*route\b/i, /бэкенд/i, /эндпоинт/i],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'ddd',
    strong: [/\bddd\b/i, /\bdomain-?driven\b/i, /\baggregate\b/i, /\bvalue\s*object\b/i, /\bbounded\s*context\b/i],
    medium: [/\bentity\b/i, /домен/i, /агрегат/i],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'microservices',
    strong: [/\bmicroservices?\b/i, /\bevent-?driven\b/i, /\brabbitmq\b/i, /\bkafka\b/i, /\bgrpc\b/i, /микросервис/i],
    medium: [/\bpub\/?sub\b/i, /очеред/i],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'system-design',
    strong: [/\bsystem\s*design\b/i, /\bhigh\s*concurrency\b/i, /\bcircuit\s*breaker\b/i, /масштабируем/i],
    medium: [/\barchitecture\b/i, /\bscalab(?:le|ility)\b/i, /архитектур/i],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'graphify',
    strong: [/\bgraphify\b/i, /\bknowledge\s*graph\b/i, /\bcodebase\s*graph\b/i, /\bproject\s*graph\b/i, /\bblast\s*radius\b/i, /\bmap\s*(?:the\s*)?codebase\b/i, /граф\s*проект/i, /граф\s*зависимост/i],
    medium: [],
    weak: [],
    fileGlobs: [/graph\.json$/, /GRAPH_REPORT\.md$/],
  },
  {
    skill: 'architecture-diagrams',
    strong: [/\bflowchart\b/i, /\bsequence\s*diagram\b/i],
    medium: [/\bdiagrams?\b/i, /диаграмм/i, /схем/i, /нарисуй/i],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'subagent-orchestrator',
    strong: [/\bsubagent\b/i, /\bparallel\s*tasks\b/i, /субагент/i, /распараллел/i],
    medium: [/\bdelegate\b/i, /делегируй/i],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'interview-me',
    strong: [/\binterview\b/i, /интервью/i, /расспроси/i],
    medium: [/\bclarify\b/i, /\bquestions\b/i, /уточни\b/i],
    weak: [],
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
  const promptText = (prompt || '').toLowerCase();
  const scores = new Map();

  for (const rule of SKILL_RULES) {
    let score = 0;

    // Strong triggers (10 points each match)
    for (const pat of rule.strong || []) {
      if (pat.test(promptText)) score += 10;
    }

    // Medium triggers (5 points each match)
    for (const pat of rule.medium || []) {
      if (pat.test(promptText)) score += 5;
    }

    // Weak triggers (2 points each match)
    for (const pat of rule.weak || []) {
      if (pat.test(promptText)) score += 2;
    }

    // File matches (10 points per matching file)
    for (const file of files) {
      const normalized = file.replace(/\\/g, '/');
      for (const pat of rule.fileGlobs || []) {
        if (pat.test(normalized)) score += 10;
      }
    }

    // Minimum score threshold for domain skill activation
    if (score >= 5) {
      scores.set(rule.skill, score);
    }
  }

  // Sort matched domain skills by score descending
  const sortedDomainSkills = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([skill]) => skill);

  // Cap domain skills to top 4 max to prevent context bloat
  const MAX_DOMAIN_SKILLS = 4;
  const topDomainSkills = sortedDomainSkills.slice(0, MAX_DOMAIN_SKILLS);

  // Synergy rules (from AGENTS.md matrix)
  const hasSynergyPrereq = topDomainSkills.includes('database') ||
    topDomainSkills.includes('microservices') ||
    topDomainSkills.includes('ddd') ||
    topDomainSkills.includes('graphify');

  if (hasSynergyPrereq && !topDomainSkills.includes('system-design')) {
    if (topDomainSkills.length < MAX_DOMAIN_SKILLS + 1) {
      topDomainSkills.push('system-design');
    }
  }

  // Foundational skills (always active)
  const allSkills = ['ponytail-mindset', 'engineering-workflow', ...topDomainSkills];
  const finalSkills = Array.from(new Set(allSkills));

  // Infer Domain if not specified
  let inferredDomain = domain;
  if (!inferredDomain) {
    const isFrontend = finalSkills.includes('react') || finalSkills.includes('nextjs') || finalSkills.includes('ui-ux-pro');
    const isBackend = finalSkills.includes('database') || finalSkills.includes('fastapi') || finalSkills.includes('nestjs') || finalSkills.includes('node') || finalSkills.includes('system-design');
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
    skills: finalSkills,
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
