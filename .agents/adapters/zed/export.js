/**
 * .agents/adapters/zed/export.js
 * ContextOS Zed IDE Pure Adapter (.zed/rules.md & .zed/prompts/*.md)
 */

const fs = require('fs');
const path = require('path');
const { getSkillEntrypointPath, readSkillMetadata, readCoreRules, collectAlwaysRules, collectSkillDirectories, stripFrontmatter, relocateSkillLinks } = require('../shared.js');
const { registerAdapter, applyArtifacts, createProvenanceHeader } = require('../pure-compiler.js');

const GENERATOR_ID = 'zed@2';

function describe() {
  return {
    name: 'zed',
    version: '2.0.0',
    description: 'Compiles instructions and prompts for Zed IDE (.zed/rules.md and .zed/prompts/*.md)',
    targetPattern: '.zed/**',
  };
}

function buildSkillSection(skillDir, context) {
  const skillName = path.basename(skillDir);
  const skillMdPath = getSkillEntrypointPath(skillDir);

  if (!fs.existsSync(skillMdPath)) return null;
  const raw = fs.readFileSync(skillMdPath, 'utf8');
  const body = relocateSkillLinks(stripFrontmatter(raw), { skillDir, destination: `.zed/prompts/${skillName}.md`, projectRoot: context.projectRoot });
  // Preserve the existing body preview for skills without routing metadata.
  const fallbackDescription = body.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#'));
  const { name: title, description } = readSkillMetadata(skillDir, { fallbackDescription });

  const descLine = description ? `> ${description.replace(/\r?\n+/g, ' ').trim()}\n` : '';
  const promptRef = `*Prompt template: \`.zed/prompts/${skillName}.md\` (Use via /${skillName})*\n`;
  return {
    skillName,
    title,
    section: `\n### Skill: ${title}\n${descLine}${promptRef}`,
    prompt: `# ContextOS — ${title}\n\n${descLine}\n${body}\n`,
  };
}

function render(context) {
  const agentsMd = readCoreRules(context?.projectRoot);

  const prov = createProvenanceHeader({
    generator: GENERATOR_ID,
    profileId: context?.profileId,
  });

  const artifacts = [];
  const rulesLines = [];

  rulesLines.push(prov + `# ContextOS — AI Rules for Zed Assistant\n\n`);

  if (agentsMd !== null) {
    rulesLines.push(`> **Core law: Do not read everything. Read only what the current task requires.**\n\n`);
    rulesLines.push(`## Core Rules & Step 0\n\n${agentsMd}\n\n---\n`);

    artifacts.push({
      path: '.zed/prompts/contextos.md',
      content: (prov + `# ContextOS Master Prompt\n\n${agentsMd}\n`).replace(/\r\n/g, '\n'),
      mediaType: 'text/markdown',
      kind: 'generated-adapter',
      generator: GENERATOR_ID,
      sourceSkillIds: ['project-rules'],
    });
  }

  const allSkills = collectSkillDirectories(context?.profile, context?.projectRoot);
  const alwaysRules = collectAlwaysRules(allSkills, { projectRoot: context.projectRoot, destination: '.zed/rules.md' });
  if (alwaysRules.length > 0) {
    rulesLines.push(`\n## Always-on Rules\n`);
    for (const rule of alwaysRules) rulesLines.push(`\n### ${rule.title}\n\n${rule.body}\n`);
  }

  rulesLines.push(
    `\n## Skills Library\n\n` +
    `Each skill is also available as a slash-command prompt in \`.zed/prompts/<skill>.md\`.\n\n` +
    `### Available Skills\n`
  );

  const skills = allSkills;
  for (const skill of skills) {
    const res = buildSkillSection(skill, context);
    if (res) {
      rulesLines.push(res.section);

      artifacts.push({
        path: `.zed/prompts/${res.skillName}.md`,
        content: (prov + res.prompt).replace(/\r\n/g, '\n'),
        mediaType: 'text/markdown',
        kind: 'generated-adapter',
        generator: GENERATOR_ID,
        sourceSkillIds: [res.skillName],
      });
    }
  }

  artifacts.push({
    path: '.zed/rules.md',
    content: rulesLines.join('').replace(/\r\n/g, '\n'),
    mediaType: 'text/markdown',
    kind: 'generated-adapter',
    generator: GENERATOR_ID,
    sourceSkillIds: skills.map(s => path.basename(s)),
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
  const projectRoot = options.projectRoot || '.';
  const context = loadCompilerContext(projectRoot, options);
  const artifacts = render(context);
  const result = applyArtifacts(projectRoot, artifacts, { command: 'export zed', context, force: options.force });
  console.log(`✓ Zed export complete: ${result.appliedCount} files applied (tx: ${result.txId})`);
  return result;
}

const adapter = {
  describe,
  render,
  validate,
  run,
};

registerAdapter('zed', adapter);

module.exports = adapter;
