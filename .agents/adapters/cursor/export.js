/**
 * .agents/adapters/cursor/export.js
 * ContextOS Cursor Pure Adapter (.cursorrules and .cursor/rules/*.mdc)
 */

const fs = require('fs');
const path = require('path');
const { AGENTS_MD_PATH, collectSkillDirectories, extractYamlField, stripFrontmatter, readMeaningfulMarkdown } = require('../shared.js');
const { registerAdapter, applyArtifacts, createProvenanceHeader } = require('../pure-compiler.js');

const GENERATOR_ID = 'cursor@2';

function describe() {
  return {
    name: 'cursor',
    version: '2.0.0',
    description: 'Compiles modular rules for Cursor (.cursor/rules/*.mdc and legacy .cursorrules)',
    targetPattern: '.cursor/rules/*.mdc',
  };
}

function getSkillGlobsAndFlags(skillName) {
  const ALWAYS_APPLY_SKILLS = ['engineering-workflow', 'gstack-roles', 'ponytail-mindset'];
  if (ALWAYS_APPLY_SKILLS.includes(skillName)) {
    return { globs: '', alwaysApply: true };
  }

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
  const skillName = path.basename(skillDir);
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const yamlPath = path.join(skillDir, 'skill.yaml');

  let title = skillName;
  let description = '';
  if (fs.existsSync(yamlPath)) {
    const yaml = fs.readFileSync(yamlPath, 'utf8');
    title = extractYamlField(yaml, 'name') || skillName;
    description = extractYamlField(yaml, 'description') || '';
  }

  if (!fs.existsSync(skillMdPath)) return null;

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

function render(context) {
  const projectRoot = context?.projectRoot || process.cwd();
  const agentsMdPath = fs.existsSync(path.join(projectRoot, '.agents', 'AGENTS.md'))
    ? path.join(projectRoot, '.agents', 'AGENTS.md')
    : AGENTS_MD_PATH;

  const artifacts = [];
  const sections = [];

  const prov = createProvenanceHeader({
    generator: GENERATOR_ID,
    sourceGraphHash: context?.sourceGraphHash,
    profileId: context?.profileId,
    profileHash: context?.profileHash,
  });

  sections.push(
    prov +
    `# ContextOS — AI Rules for Cursor\n\n` +
    `> **Core law: Do not read everything. Read only what the current task requires.**\n\n` +
    `Detailed rules are modularized in \`.cursor/rules/*.mdc\` with file-glob activation.\n` +
    `Core orchestration is handled by \`.cursor/rules/00-project-rules.mdc\`.\n`
  );

  // 1. 00-project-rules.mdc
  if (fs.existsSync(agentsMdPath)) {
    const agentsMd = fs.readFileSync(agentsMdPath, 'utf8');
    const projectMdc = `---
description: "ContextOS core project rules and role orchestration"
globs: ""
alwaysApply: true
---

${prov}
# ContextOS — Project Operating System Rules

${agentsMd}
`;
    artifacts.push({
      path: '.cursor/rules/00-project-rules.mdc',
      content: projectMdc.replace(/\r\n/g, '\n'),
      mediaType: 'text/markdown',
      kind: 'generated-adapter',
      generator: GENERATOR_ID,
      sourceSkillIds: ['project-rules'],
      inputsHash: context?.sourceGraphHash || 'none',
    });
  }

  // 2. Individual .mdc files
  sections.push('\n---\n\n# Skills Index (Loaded On-Demand)\n\n' +
    'The following specialist skills are configured as `.cursor/rules/<skill>.mdc`:\n');

  const skills = collectSkillDirectories(context?.profile);
  for (const skill of skills) {
    const section = buildSkillSection(skill);
    if (section) sections.push(section);

    const mdc = generateCursorMdc(skill);
    if (mdc) {
      const fullMdc = mdc.mdcContent.replace(/\r\n/g, '\n');
      artifacts.push({
        path: `.cursor/rules/${mdc.skillName}.mdc`,
        content: fullMdc,
        mediaType: 'text/markdown',
        kind: 'generated-adapter',
        generator: GENERATOR_ID,
        sourceSkillIds: [mdc.skillName],
        inputsHash: context?.sourceGraphHash || 'none',
      });
    }
  }

  // 3. Flat .cursorrules
  artifacts.push({
    path: '.cursorrules',
    content: sections.join('\n').replace(/\r\n/g, '\n'),
    mediaType: 'text/markdown',
    kind: 'generated-adapter',
    generator: GENERATOR_ID,
    sourceSkillIds: skills.map(s => path.basename(s)),
    inputsHash: context?.sourceGraphHash || 'none',
  });

  return artifacts;
}

function validate(artifacts) {
  const diagnostics = [];
  for (const art of artifacts) {
    if (!art.content || art.content.length === 0) {
      diagnostics.push({ path: art.path, message: 'Empty artifact content' });
    }
  }
  return diagnostics;
}

function run(options = {}) {
  const { loadCompilerContext } = require('../pure-compiler.js');
  const projectRoot = process.cwd();
  const context = loadCompilerContext(projectRoot, options);
  const artifacts = render(context);
  const result = applyArtifacts(projectRoot, artifacts, { command: 'export cursor', context });
  console.log(`✓ Cursor export complete: ${result.appliedCount} files applied (tx: ${result.txId})`);
  return result;
}

const adapter = {
  describe,
  render,
  validate,
  run,
};

registerAdapter('cursor', adapter);

module.exports = adapter;
