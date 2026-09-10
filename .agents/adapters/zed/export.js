/**
 * .agents/adapters/zed/export.js
 * ContextOS Zed IDE Pure Adapter (.zed/rules.md & .zed/prompts/*.md)
 */

const fs = require('fs');
const path = require('path');
const { AGENTS_MD_PATH, collectSkillDirectories, extractYamlField, stripFrontmatter } = require('../shared.js');
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
  const promptRef = `*Prompt template: \`.zed/prompts/${skillName}.md\` (Use via /${skillName})*\n`;
  return {
    skillName,
    title,
    section: `\n### Skill: ${title}\n${descLine}${promptRef}`,
    prompt: `# ContextOS — ${title}\n\n${descLine}\n${body}\n`,
  };
}

function render(context) {
  const projectRoot = context?.projectRoot || '.';
  const agentsMdPath = fs.existsSync(path.join(projectRoot, '.agents', 'AGENTS.md'))
    ? path.join(projectRoot, '.agents', 'AGENTS.md')
    : AGENTS_MD_PATH;

  const prov = createProvenanceHeader({
    generator: GENERATOR_ID,
    sourceGraphHash: context?.sourceGraphHash,
    profileId: context?.profileId,
    profileHash: context?.profileHash,
  });

  const artifacts = [];
  const rulesLines = [];

  rulesLines.push(
    prov +
    `# ContextOS — AI Rules for Zed Assistant\n\n` +
    `> **Core law: Do not read everything. Read only what the current task requires.**\n\n`
  );

  if (fs.existsSync(agentsMdPath)) {
    const agentsMd = fs.readFileSync(agentsMdPath, 'utf8');
    rulesLines.push(`## Core Rules & Step 0\n\n${agentsMd}\n\n---\n`);

    artifacts.push({
      path: '.zed/prompts/contextos.md',
      content: (prov + `# ContextOS Master Prompt\n\n${agentsMd}\n`).replace(/\r\n/g, '\n'),
      mediaType: 'text/markdown',
      kind: 'generated-adapter',
      generator: GENERATOR_ID,
      sourceSkillIds: ['project-rules'],
      inputsHash: context?.sourceGraphHash || 'none',
    });
  }

  rulesLines.push(
    `\n## Skills Library\n\n` +
    `Each skill is also available as a slash-command prompt in \`.zed/prompts/<skill>.md\`.\n\n` +
    `### Available Skills\n`
  );

  const skills = collectSkillDirectories(context?.profile);
  for (const skill of skills) {
    const res = buildSkillSection(skill);
    if (res) {
      rulesLines.push(res.section);

      artifacts.push({
        path: `.zed/prompts/${res.skillName}.md`,
        content: (prov + res.prompt).replace(/\r\n/g, '\n'),
        mediaType: 'text/markdown',
        kind: 'generated-adapter',
        generator: GENERATOR_ID,
        sourceSkillIds: [res.skillName],
        inputsHash: context?.sourceGraphHash || 'none',
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
  const projectRoot = options.projectRoot || '.';
  const context = loadCompilerContext(projectRoot, options);
  const artifacts = render(context);
  const result = applyArtifacts(projectRoot, artifacts, { command: 'export zed', context });
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
