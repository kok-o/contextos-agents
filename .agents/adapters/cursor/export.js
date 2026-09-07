const fs = require('fs');
const path = require('path');
const { AGENTS_MD_PATH, collectSkillDirectories, extractYamlField, stripFrontmatter, readMeaningfulMarkdown } = require('../shared.js');

// Output paths
const OUTPUT_FILE = path.join(process.cwd(), '.cursorrules');
const CURSOR_RULES_DIR = path.join(process.cwd(), '.cursor', 'rules');

/**
 * Cursor adapter — export.js
 *
 * Generates:
 *   1. Modern modular Cursor rules in `.cursor/rules/<skill>.mdc` with glob filters
 *   2. Flat `.cursorrules` at project root for backwards compatibility
 *
 * Format spec: https://docs.cursor.com/context/rules-for-ai
 */

function getSkillGlobsAndFlags(skillName) {
  const ALWAYS_APPLY_SKILLS = ['engineering-workflow', 'gstack-roles', 'ponytail-mindset'];
  if (ALWAYS_APPLY_SKILLS.includes(skillName)) {
    return { globs: '', alwaysApply: true };
  }

  // Precise surgical globs mapping to prevent context flooding
  const GLOB_MAP = {
    'react': '**/*.{tsx,jsx}',
    'react-best-practices': '**/*.{tsx,jsx}',
    'nextjs': 'app/**/*,pages/**/*,next.config.*',
    'typescript': '**/*.{ts,tsx}',
    'ui-design': '**/*.{tsx,jsx,css,scss}',
    'ui-ux-pro': '**/*.{tsx,jsx,css,scss}',
    'ux-design': '**/*.{tsx,jsx}',
    'impeccable-design': '**/*.{tsx,jsx,css,scss}',
    'brutalist-design': '**/*.{tsx,jsx,css,scss}',
    'minimalist-design': '**/*.{tsx,jsx,css,scss}',
    'soft-design': '**/*.{tsx,jsx,css,scss}',
    'redesign-audit': '**/*.{tsx,jsx,css,scss}',
    'web-accessibility': '**/*.{tsx,jsx,html}',
    'ddd': '**/domain/**/*,**/entities/**/*,**/aggregates/**/*',
    'microservices': '**/services/**/*,docker-compose.*,**/gateway/**/*',
    'nestjs': '**/*.module.ts,**/*.controller.ts,**/*.service.ts,nest-cli.json',
    'node': '**/*.{ts,js}',
    'database': '**/*.{prisma,sql,sqlite,db,drizzle.config.*}',
    'docker': '**/Dockerfile*,**/docker-compose*.{yml,yaml}',
    'testing': '**/*.{test,spec}.{ts,js,tsx,jsx},vitest.config.*,jest.config.*',
    'state-management': '**/*{store,state,slice,reducer,atom}*.{ts,js,tsx,jsx}',
    'performance': '**/*.{ts,tsx,js,jsx,json}',
    'vercel-optimize': '**/*.{ts,tsx,js,jsx,json}',
    'fastapi': '**/*.{py,requirements.txt,Pipfile,pyproject.toml}',
  };

  if (GLOB_MAP[skillName]) {
    return { globs: GLOB_MAP[skillName], alwaysApply: false };
  }

  return { globs: '', alwaysApply: false };
}

function buildSkillSection(skillDir) {
  const skillName  = path.basename(skillDir);
  const skillMdPath  = path.join(skillDir, 'SKILL.md');
  const yamlPath   = path.join(skillDir, 'skill.yaml');

  let title = skillName;
  let description = '';
  if (fs.existsSync(yamlPath)) {
    const yaml = fs.readFileSync(yamlPath, 'utf8');
    title = extractYamlField(yaml, 'name') || skillName;
    description = extractYamlField(yaml, 'description') || '';
  }

  if (!fs.existsSync(skillMdPath)) {
    return null;
  }

  const raw = fs.readFileSync(skillMdPath, 'utf8');
  const body = stripFrontmatter(raw);

  if (!description) {
    const firstLine = body.split(/\r?\n/).map(l => l.trim()).find(l => l && !l.startsWith('#'));
    description = firstLine || '';
  }

  const descLine = description ? `> ${description.replace(/\r?\n+/g, ' ').trim()}\n` : '';
  return `\n## Skill: ${title}\n${descLine}*Rule file: \`.cursor/rules/${skillName}.mdc\` (load on demand)*\n`;
}

function generateCursorMdc(skillDir) {
  const skillName = path.basename(skillDir);
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const yamlPath = path.join(skillDir, 'skill.yaml');

  if (!fs.existsSync(skillMdPath)) return null;

  let title = skillName;
  let description = `ContextOS rules for ${skillName}`;
  if (fs.existsSync(yamlPath)) {
    const yaml = fs.readFileSync(yamlPath, 'utf8');
    title = extractYamlField(yaml, 'name') || skillName;
    const desc = extractYamlField(yaml, 'description');
    if (desc) description = desc;
  }

  let raw = fs.readFileSync(skillMdPath, 'utf8');
  const examples = readMeaningfulMarkdown(path.join(skillDir, 'EXAMPLES.md'));
  if (examples) raw += '\n\n' + examples;

  const troubleshooting = readMeaningfulMarkdown(path.join(skillDir, 'TROUBLESHOOTING.md'));
  if (troubleshooting) raw += '\n\n' + troubleshooting;

  const body = stripFrontmatter(raw);
  const { globs, alwaysApply } = getSkillGlobsAndFlags(skillName);

  let cleanDescription = description.replace(/\r?\n+/g, ' ').replace(/"/g, "'").trim();
  if (!globs && !alwaysApply) {
    cleanDescription = `Agent-requested: invoke when working on ${title}. ${cleanDescription}`.trim();
  }
  const mdcContent = `---
description: "${cleanDescription}"
globs: ${globs ? `"${globs}"` : '""'}
alwaysApply: ${alwaysApply}
---

# Skill: ${title}

${body}
`;

  return { skillName, mdcContent };
}

function run() {
  console.log('Starting Cursor adapter export...');

  const sections = [];

  // ── Header ──────────────────────────────────────────────────────────────────
  sections.push(
    `# ContextOS — AI Rules for Cursor\n` +
    `# Auto-generated by: node .agents/ctx.js export cursor\n` +
    `# Source: .agents/core/skills/  ·  Do not edit manually.\n\n` +
    `> **Core law: Do not read everything. Read only what the current task requires.**\n\n` +
    `Detailed rules are modularized in \`.cursor/rules/*.mdc\` with file-glob activation.\n` +
    `Core orchestration is handled by \`.cursor/rules/00-project-rules.mdc\`.\n`
  );

  // Prepare .cursor/rules directory
  fs.mkdirSync(CURSOR_RULES_DIR, { recursive: true });

  let count = 0;
  let mdcCount = 0;

  // Write 00-project-rules.mdc
  if (fs.existsSync(AGENTS_MD_PATH)) {
    const agentsMd = fs.readFileSync(AGENTS_MD_PATH, 'utf8');
    const projectMdc = `---
description: "ContextOS core project rules and role orchestration"
globs: ""
alwaysApply: true
---

# ContextOS — Project Operating System Rules

${agentsMd}
`;
    fs.writeFileSync(path.join(CURSOR_RULES_DIR, '00-project-rules.mdc'), projectMdc);
    mdcCount++;
  }

  // ── Skills Index ─────────────────────────────────────────────────────────────
  sections.push('\n---\n\n# Skills Index (Loaded On-Demand)\n\n' +
    'The following specialist skills are configured as `.cursor/rules/<skill>.mdc`:\n');
  const skills = collectSkillDirectories();
  const activeMdcFiles = new Set(['00-project-rules.mdc']);

  for (const skill of skills) {
    const section = buildSkillSection(skill);
    if (section) {
      sections.push(section);
      count++;
    }

    const mdc = generateCursorMdc(skill);
    if (mdc) {
      const mdcFileName = `${mdc.skillName}.mdc`;
      activeMdcFiles.add(mdcFileName);
      fs.writeFileSync(path.join(CURSOR_RULES_DIR, mdcFileName), mdc.mdcContent);
      mdcCount++;
    }
  }

  // Clean up stale .mdc rules from uninstalled skills/plugins
  if (fs.existsSync(CURSOR_RULES_DIR)) {
    for (const file of fs.readdirSync(CURSOR_RULES_DIR)) {
      if (file.endsWith('.mdc') && !activeMdcFiles.has(file)) {
        fs.unlinkSync(path.join(CURSOR_RULES_DIR, file));
      }
    }
  }

  fs.writeFileSync(OUTPUT_FILE, sections.join('\n'));
  console.log(`Generated .cursorrules (${count} skills) → ${OUTPUT_FILE}`);
  console.log(`Generated .cursor/rules/*.mdc (${mdcCount} rules) → ${CURSOR_RULES_DIR}`);
}

module.exports = { run };
