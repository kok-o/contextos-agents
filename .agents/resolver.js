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
    category: 'stack',
    strong: [/\bnext(?:\.js)?\b/i, /\bapp\s*router\b/i, /\bserver\s*actions?\b/i, /\brsc\b/i, /некст/i],
    medium: [/\bpage\.tsx\b/i, /\blayout\.tsx\b/i],
    weak: [],
    fileGlobs: [/app\/.*\.(tsx|jsx|ts|js)$/, /next\.config\./],
  },
  {
    skill: 'react',
    category: 'stack',
    strong: [/\breact\b/i, /\buseOptimistic\b/i, /компонент/i, /хук/i],
    medium: [/\bcomponent\b/i, /\bhooks?\b/i, /\buseState\b/i, /\buseEffect\b/i, /\buseMemo\b/i, /\bprops\b/i, /модал\w*/i],
    weak: [],
    fileGlobs: [/\.(tsx|jsx)$/],
  },
  {
    skill: 'typescript',
    category: 'stack',
    strong: [/\btypescript\b/i, /\btype-?safe\b/i, /\bgenerics?\b/i, /\binterface\b/i, /\btsconfig\b/i, /тайпскрипт/i, /типизац/i],
    medium: [],
    weak: [/\btypes?\b/i],
    fileGlobs: [/\.tsx?$/, /tsconfig\.json$/],
  },
  {
    skill: 'ui-ux-pro',
    category: 'ui',
    strong: [/\bui\b/i, /\bux\b/i, /\btailwind\b/i, /\bstyling\b/i, /дизайн/i, /верстк/i, /макет/i, /интерфейс/i],
    medium: [/\bcss\b/i, /\btheme\b/i, /\bmodal\b/i, /\bbutton\b/i, /модал\w*/i, /кнопк/i],
    weak: [/\bdesign\b/i],
    fileGlobs: [/\.(css|scss|sass)$/, /tailwind\.config\./],
  },
  {
    skill: 'web-accessibility',
    category: 'ui',
    strong: [/\baccessib\w*\b/i, /\ba11y\b/i, /\baria\b/i, /\bfocus\s*trap\b/i, /\bkeyboard\s*nav/i, /\bwcag\b/i, /\bscreen\s*reader\b/i, /доступност/i, /скринридер/i],
    medium: [],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'impeccable-design',
    category: 'ui',
    strong: [/\bvisual\s*qa\b/i, /\bmicro-?animation\b/i, /\bglassmorphism\b/i, /\btypography\b/i, /анимац/i, /полировк/i],
    medium: [/\bpolish\b/i],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'database',
    category: 'intent',
    strong: [/\bdatabase\b/i, /\bsql\b/i, /\bpostgres(?:ql)?\b/i, /\bprisma\b/i, /\bdrizzle\b/i, /\bmigration\b/i, /\borm\b/i, /баз.*данн/i, /миграц/i, /таблиц/i],
    medium: [/\bschema\b/i],
    weak: [/\bquery\b/i, /\bindex(?:ing)?\b/i],
    fileGlobs: [/\.prisma$/, /drizzle\.config\./, /\bmigrations?\/.*\.sql$/],
  },
  {
    skill: 'security',
    category: 'intent',
    strong: [/\bsecurity\b/i, /\bauth\b/i, /\bjwt\b/i, /\blogin\b/i, /\bcsrf\b/i, /\bxss\b/i, /\brate\s*limit\b/i, /авториз/i, /аутентифик/i, /парол/i, /безопасност/i],
    medium: [/\bpermission\b/i, /\bsession\b/i, /\btoken\b/i, /токен/i],
    weak: [],
    fileGlobs: [/\bauth\b/, /\bsecurity\b/],
  },
  {
    skill: 'performance',
    category: 'intent',
    strong: [/\bperformance\b/i, /\blatency\b/i, /\blcp\b/i, /\bcls\b/i, /\binp\b/i, /\bcore\s*web\s*vitals\b/i, /\bwaterfall\b/i, /\bbundle\s*size\b/i, /производительн/i, /ускор/i],
    medium: [/\boptimize\b/i, /\bslow\b/i, /оптимиз/i, /медленн/i],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'testing',
    category: 'intent',
    strong: [/\bvitest\b/i, /\bjest\b/i, /\bplaywright\b/i, /\btdd\b/i, /\bbdd\b/i, /\be2e\b/i, /тестирован/i, /покрыти/i, /юнит/i],
    medium: [/\btest(?:s|ing)?\b/i, /\bmock\b/i, /тест/i],
    weak: [],
    fileGlobs: [/\.(test|spec)\.(ts|js|tsx|jsx|py)$/, /vitest\.config\./, /playwright\.config\./],
  },
  {
    skill: 'docker',
    category: 'intent',
    strong: [/\bdocker\b/i, /\bdockerfile\b/i, /\bcompose\b/i, /\bkubernetes\b/i, /\bk8s\b/i, /докер/i],
    medium: [],
    weak: [/\bcontainer\b/i, /контейнер/i],
    fileGlobs: [/Dockerfile/, /docker-compose\./],
  },
  {
    skill: 'fastapi',
    category: 'stack',
    strong: [/\bfastapi\b/i, /\bpydantic\b/i, /\buvicorn\b/i, /\bpytest\b/i, /питон/i],
    medium: [/\bpython\b/i],
    weak: [],
    fileGlobs: [/\.py$/, /requirements\.txt$/, /pyproject\.toml$/],
  },
  {
    skill: 'nestjs',
    category: 'stack',
    strong: [/\bnestjs\b/i, /\b@nestjs\b/i, /нест/i],
    medium: [],
    weak: [/\bmodule\b/i, /\bcontroller\b/i, /\binjectable\b/i],
    fileGlobs: [/nest-cli\.json$/],
  },
  {
    skill: 'node',
    category: 'stack',
    strong: [/\bnode(?:\.js)?\b/i, /\bexpress\b/i, /\bfastify\b/i],
    medium: [/\bbackend\b/i, /\bapi\s*route\b/i, /бэкенд/i, /эндпоинт/i],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'ddd',
    category: 'intent',
    strong: [/\bddd\b/i, /\bdomain-?driven\b/i, /\baggregate\b/i, /\bvalue\s*object\b/i, /\bbounded\s*context\b/i],
    medium: [/\bentity\b/i, /домен/i, /агрегат/i],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'microservices',
    category: 'intent',
    strong: [/\bmicroservices?\b/i, /\bevent-?driven\b/i, /\brabbitmq\b/i, /\bkafka\b/i, /\bgrpc\b/i, /микросервис/i],
    medium: [/\bpub\/?sub\b/i, /очеред/i],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'system-design',
    category: 'intent',
    strong: [/\bsystem\s*design\b/i, /\bhigh\s*concurrency\b/i, /\bcircuit\s*breaker\b/i, /масштабируем/i],
    medium: [/\barchitecture\b/i, /\bscalab(?:le|ility)\b/i, /архитектур/i],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'graphify',
    category: 'intent',
    strong: [/\bgraphify\b/i, /\bknowledge\s*graph\b/i, /\bcodebase\s*graph\b/i, /\bproject\s*graph\b/i, /\bblast\s*radius\b/i, /\bmap\s*(?:the\s*)?codebase\b/i, /граф\s*проект/i, /граф\s*зависимост/i],
    medium: [],
    weak: [],
    fileGlobs: [/graph\.json$/, /GRAPH_REPORT\.md$/],
  },
  {
    skill: 'architecture-diagrams',
    category: 'intent',
    strong: [/\bflowchart\b/i, /\bsequence\s*diagram\b/i],
    medium: [/\bdiagrams?\b/i, /диаграмм/i, /схем/i, /нарисуй/i],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'subagent-orchestrator',
    category: 'intent',
    strong: [/\bsubagent\b/i, /\bparallel\s*tasks\b/i, /субагент/i, /распараллел/i],
    medium: [/\bdelegate\b/i, /делегируй/i],
    weak: [],
    fileGlobs: [],
  },
  {
    skill: 'interview-me',
    category: 'intent',
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
 * Phase 2: AST & Project Dependency Graph Analysis.
 * Scans project manifests and configs to detect active technologies
 * that keyword or regex matching in prompts might omit.
 *
 * @param {string} [projectDir=process.cwd()] - Project root directory
 * @returns {Map<string, number>} Map of skill name to score weight
 */
function analyzeImportGraph(projectDir = process.cwd()) {
  const techSignals = new Map();
  if (!projectDir || !fs.existsSync(projectDir)) return techSignals;

  const addSignal = (skill, weight) => {
    techSignals.set(skill, (techSignals.get(skill) || 0) + weight);
  };

  // 1. Scan package.json dependencies and devDependencies
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
        ...(pkg.peerDependencies || {}),
      };

      const DEP_SKILL_MAP = {
        'react': 'react',
        'react-dom': 'react',
        'next': 'nextjs',
        'prisma': 'database',
        '@prisma/client': 'database',
        'drizzle-orm': 'database',
        'drizzle-kit': 'database',
        'typeorm': 'database',
        'mongoose': 'database',
        'pg': 'database',
        'mysql2': 'database',
        'vitest': 'testing',
        'jest': 'testing',
        'playwright': 'testing',
        '@playwright/test': 'testing',
        'cypress': 'testing',
        'express': 'node',
        'fastify': 'node',
        'hono': 'node',
        '@nestjs/core': 'nestjs',
        'typescript': 'typescript',
        'zod': 'typescript',
        'tailwindcss': 'ui-ux-pro',
        'lucide-react': 'ui-ux-pro',
        '@radix-ui/react-dialog': 'web-accessibility',
        'framer-motion': 'impeccable-design',
        'dockerode': 'docker',
        'ioredis': 'system-design',
        'kafkajs': 'microservices',
        'amqplib': 'microservices',
      };

      for (const [dep, skill] of Object.entries(DEP_SKILL_MAP)) {
        if (allDeps[dep]) {
          addSignal(skill, 15);
        }
      }
    } catch {
      // ignore malformed package.json
    }
  }

  // 2. Scan framework & tooling configuration files
  const CONFIG_FILE_MAP = [
    { file: 'tsconfig.json', skill: 'typescript', weight: 10 },
    { file: 'next.config.js', skill: 'nextjs', weight: 15 },
    { file: 'next.config.mjs', skill: 'nextjs', weight: 15 },
    { file: 'next.config.ts', skill: 'nextjs', weight: 15 },
    { file: 'tailwind.config.js', skill: 'ui-ux-pro', weight: 10 },
    { file: 'tailwind.config.ts', skill: 'ui-ux-pro', weight: 10 },
    { file: 'nest-cli.json', skill: 'nestjs', weight: 15 },
    { file: 'prisma/schema.prisma', skill: 'database', weight: 15 },
    { file: 'drizzle.config.ts', skill: 'database', weight: 15 },
    { file: 'drizzle.config.js', skill: 'database', weight: 15 },
    { file: 'Dockerfile', skill: 'docker', weight: 15 },
    { file: 'docker-compose.yml', skill: 'docker', weight: 15 },
    { file: 'docker-compose.yaml', skill: 'docker', weight: 15 },
    { file: 'requirements.txt', skill: 'fastapi', weight: 15 },
    { file: 'pyproject.toml', skill: 'fastapi', weight: 15 },
    { file: 'vitest.config.ts', skill: 'testing', weight: 15 },
    { file: 'vitest.config.js', skill: 'testing', weight: 15 },
    { file: 'playwright.config.ts', skill: 'testing', weight: 15 },
    { file: 'playwright.config.js', skill: 'testing', weight: 15 },
  ];

  for (const { file, skill, weight } of CONFIG_FILE_MAP) {
    if (fs.existsSync(path.join(projectDir, file))) {
      addSignal(skill, weight);
    }
  }

  return techSignals;
}

/**
 * Resolves the minimal set of skills for a given prompt, file list, and phase.
 *
 * @param {ResolveSkillsOptions} [options={}] - Task context options
 * @returns {ResolvedSkillsResult} Resolved domain, role, and activated skill names
 */
function resolveSkills({ prompt = '', files = [], phase = 'Build', domain = '', projectDir = process.cwd() } = {}) {
  const promptText = (prompt || '').toLowerCase();
  const ruleMap = new Map();
  const promptScores = new Map();
  const fileScores = new Map();

  for (const rule of SKILL_RULES) {
    ruleMap.set(rule.skill, rule);
    let pScore = 0;
    let fScore = 0;

    // Strong triggers (10 points each match)
    for (const pat of rule.strong || []) {
      if (pat.test(promptText)) pScore += 10;
    }

    // Medium triggers (5 points each match)
    for (const pat of rule.medium || []) {
      if (pat.test(promptText)) pScore += 5;
    }

    // Weak triggers (2 points each match)
    for (const pat of rule.weak || []) {
      if (pat.test(promptText)) pScore += 2;
    }

    // File matches (10 points per matching file)
    for (const file of files) {
      const normalized = file.replace(/\\/g, '/');
      for (const pat of rule.fileGlobs || []) {
        if (pat.test(normalized)) fScore += 10;
      }
    }

    if (pScore > 0) promptScores.set(rule.skill, pScore);
    if (fScore > 0) fileScores.set(rule.skill, fScore);
  }

  // Phase 2: Merge AST & Project Dependency Graph Signals
  const astSignals = projectDir ? analyzeImportGraph(projectDir) : new Map();

  // Active Profile Resolution Enforcement
  const profiles = require('./profiles.js');
  const activeProfile = projectDir ? profiles.getActiveProfile(projectDir) : null;
  const profileExcluded = new Set(activeProfile?.exclude_skills || []);
  const profilePreferred = new Set(activeProfile?.prefer_skills || []);
  const profileEnforce = activeProfile?.enforce || {};
  const profileDefaults = activeProfile?.defaults || {};

  const MAX_DOMAIN_SKILLS = 4;
  const selectedSkills = [];

  // 1. INTENT SLOTS & INTENT PRECEDENCE (Immunity against eviction)
  // Direct user intent in prompt MUST NOT be evicted by ambient stack/file signals.
  // Profile-excluded skills are strictly omitted from candidate intents.
  const candidateIntents = [];
  for (const rule of SKILL_RULES) {
    const s = rule.skill;
    if (profileExcluded.has(s)) continue;

    const p = promptScores.get(s) || 0;
    const f = fileScores.get(s) || 0;
    if (rule.category === 'intent' && (p >= 5 || (p > 0 && f >= 10))) {
      candidateIntents.push({ skill: s, score: p * 2 + f, priority: 2 });
    } else if (p >= 10) {
      candidateIntents.push({ skill: s, score: p, priority: 1 });
    }
  }

  candidateIntents.sort((a, b) => b.priority - a.priority || b.score - a.score);

  // Reserve up to 2 guaranteed intent slots for directly requested capabilities
  for (const item of candidateIntents) {
    if (selectedSkills.length < 2 && !selectedSkills.includes(item.skill)) {
      selectedSkills.push(item.skill);
    }
  }

  // 2. CONTEXT SUPPRESSION
  // If task is purely infrastructure (e.g. docker) or pure backend/architecture,
  // suppress ambient UI skills from AST to avoid polluting non-UI tasks.
  const hasPureInfraIntent = selectedSkills.includes('docker');
  const hasBackendOnlyIntent = selectedSkills.some(s => ['database', 'fastapi', 'nestjs', 'ddd'].includes(s)) &&
    !files.some(f => /\.(tsx|jsx|css|scss|html)$/.test(f)) &&
    !/\b(ui|react|css|tailwind|frontend|макет|дизайн|кнопк|стил|компонент)/i.test(promptText);

  const suppressAmbientUI = hasPureInfraIntent || hasBackendOnlyIntent;

  // 3. REMAINING SLOTS: Rank candidate skills with user-intent weighting and profile preferences
  const candidateScores = new Map();
  for (const rule of SKILL_RULES) {
    const s = rule.skill;
    if (selectedSkills.includes(s) || profileExcluded.has(s)) continue;

    const p = promptScores.get(s) || 0;
    const f = fileScores.get(s) || 0;
    const a = astSignals.get(s) || 0;

    // If ambient UI is suppressed, skip UI skills unless explicitly requested in prompt
    if (suppressAmbientUI && (rule.category === 'ui' || s === 'react') && p < 5 && f === 0) {
      continue;
    }

    // Require minimum unweighted threshold of 5 points to filter casual weak mentions,
    // then apply multiplier for strong/medium prompt matches to prioritize user intent over ambient signals.
    const rawSum = p + f + a;
    if (rawSum >= 5 || profilePreferred.has(s)) {
      let weightedScore = (p >= 5 ? p * 3 : p) + f + a;
      if (profilePreferred.has(s)) {
        weightedScore += 20; // Profile prefer boost
      }
      candidateScores.set(s, weightedScore);
    }
  }

  const remainingSorted = Array.from(candidateScores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([skill]) => skill);

  for (const s of remainingSorted) {
    if (selectedSkills.length >= MAX_DOMAIN_SKILLS) break;
    if (!selectedSkills.includes(s)) {
      selectedSkills.push(s);
    }
  }

  // 4. Synergy rules (from AGENTS.md matrix)
  const hasSynergyPrereq = selectedSkills.includes('database') ||
    selectedSkills.includes('microservices') ||
    selectedSkills.includes('ddd') ||
    selectedSkills.includes('graphify');

  if (hasSynergyPrereq && !selectedSkills.includes('system-design') && !profileExcluded.has('system-design')) {
    if (selectedSkills.length < MAX_DOMAIN_SKILLS + 1) {
      selectedSkills.push('system-design');
    }
  }

  // 5. Enforce profile invariants (e.g. enterprise or startup compliance)
  const normPhase = (phase || '').toLowerCase();
  if (profileEnforce.testing === true && ['build', 'verify', 'test'].includes(normPhase)) {
    if (!selectedSkills.includes('testing') && !profileExcluded.has('testing')) {
      selectedSkills.push('testing');
    }
  }

  if (profileEnforce.security_audit === true && (selectedSkills.includes('database') || selectedSkills.includes('node') || selectedSkills.includes('fastapi') || selectedSkills.includes('nestjs'))) {
    if (!selectedSkills.includes('security') && !profileExcluded.has('security')) {
      selectedSkills.push('security');
    }
  }

  if (profileEnforce.adr === true && (normPhase === 'plan' || selectedSkills.includes('system-design') || selectedSkills.includes('microservices'))) {
    if (!selectedSkills.includes('decisions') && !profileExcluded.has('decisions')) {
      selectedSkills.push('decisions');
    }
  }

  if (profileEnforce.accessibility_audit === true && (selectedSkills.includes('react') || selectedSkills.includes('ui-ux-pro'))) {
    if (!selectedSkills.includes('web-accessibility') && !profileExcluded.has('web-accessibility')) {
      selectedSkills.push('web-accessibility');
    }
  }

  // 6. Transitive Dependency Resolution (from compiled registry.v2.json or fallback)
  let depGraph = {
    'react': ['typescript'],
    'node': ['typescript'],
    'nextjs': ['react', 'typescript'],
    'nestjs': ['node', 'typescript'],
    'microservices': ['system-design'],
    'vercel-optimize': ['nextjs', 'react', 'typescript'],
  };

  try {
    const regPath = path.join(AGENTS_DIR, 'compiled', 'registry.v2.json');
    if (fs.existsSync(regPath)) {
      const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
      if (reg && reg.dependencyGraph) {
        depGraph = reg.dependencyGraph;
      }
    }
  } catch {
    // Keep fallback
  }

  for (let i = 0; i < selectedSkills.length; i++) {
    const s = selectedSkills[i];
    const deps = depGraph[s] || [];
    for (const dep of deps) {
      if (!selectedSkills.includes(dep) && !profileExcluded.has(dep)) {
        selectedSkills.push(dep);
      }
    }
  }

  // Foundational skills (always active unless explicitly excluded)
  const allSkills = ['ponytail-mindset', 'engineering-workflow', ...selectedSkills];
  const finalSkills = Array.from(new Set(allSkills)).filter(s => !profileExcluded.has(s));

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
  analyzeImportGraph,
  formatDeclaration,
};
