/**
 * .agents/adapters/aider/export.js
 * ContextOS Aider Pure Adapter (.aider.conf.yml & CONVENTIONS.md)
 */

const fs = require('fs');
const path = require('path');
const { AGENTS_MD_PATH, collectSkillDirectories, extractYamlField, stripFrontmatter } = require('../shared.js');
const { registerAdapter, applyArtifacts, createProvenanceHeader } = require('../pure-compiler.js');

const GENERATOR_ID = 'aider@2';

function describe() {
  return {
    name: 'aider',
    version: '2.0.0',
    description: 'Compiles configuration and conventions for Aider (.aider.conf.yml and CONVENTIONS.md)',
    targetPattern: '{.aider.conf.yml,CONVENTIONS.md}',
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
  const skillRef = `*Source: \`.agents/skills/${skillName}/SKILL.md\` — Load via \`/read .agents/skills/${skillName}/SKILL.md\`*\n`;
  return `\n## Skill: ${title}\n${descLine}${skillRef}`;
}

function render(context) {
  const projectRoot = context?.projectRoot || process.cwd();
  const agentsMdPath = fs.existsSync(path.join(projectRoot, '.agents', 'AGENTS.md'))
    ? path.join(projectRoot, '.agents', 'AGENTS.md')
    : AGENTS_MD_PATH;

  const yamlProv = createProvenanceHeader({
    generator: GENERATOR_ID,
    sourceGraphHash: context?.sourceGraphHash,
    profileId: context?.profileId,
    profileHash: context?.profileHash,
  }, 'yaml');

  const mdProv = createProvenanceHeader({
    generator: GENERATOR_ID,
    sourceGraphHash: context?.sourceGraphHash,
    profileId: context?.profileId,
    profileHash: context?.profileHash,
  }, 'markdown');

  // 1. .aider.conf.yml
  const aiderConfContent = [
    yamlProv,
    '# Load project conventions as a read-only context file on every session',
    'read:',
    '  - CONVENTIONS.md',
    '',
    '# Auto commit edits with standard git format',
    'auto-commits: true',
    'dirty-commits: true',
    '',
  ].join('\n');

  // 2. CONVENTIONS.md
  const convSections = [];
  convSections.push(
    mdProv +
    `# ContextOS — Project Conventions for Aider\n\n` +
    `> **Core law: Do not read everything. Read only what the current task requires.**\n\n`
  );

  if (fs.existsSync(agentsMdPath)) {
    const agentsMd = fs.readFileSync(agentsMdPath, 'utf8');
    convSections.push(`## Core Operational Rules\n\n${agentsMd}\n\n---\n`);
  }

  convSections.push(`\n## Available Specialist Skills\n\n` +
    `Skills are loaded on demand. Use \`/read .agents/skills/<skill>/SKILL.md\` when needed.\n\n` +
    `### Skill Index\n`);

  const skills = collectSkillDirectories(context?.profile);
  for (const skill of skills) {
    const section = buildSkillSection(skill);
    if (section) convSections.push(section);
  }

  return [
    {
      path: '.aider.conf.yml',
      content: aiderConfContent.replace(/\r\n/g, '\n'),
      mediaType: 'application/yaml',
      kind: 'generated-adapter',
      generator: GENERATOR_ID,
      sourceSkillIds: [],
      inputsHash: context?.sourceGraphHash || 'none',
    },
    {
      path: 'CONVENTIONS.md',
      content: convSections.join('\n').replace(/\r\n/g, '\n'),
      mediaType: 'text/markdown',
      kind: 'generated-adapter',
      generator: GENERATOR_ID,
      sourceSkillIds: skills.map(s => path.basename(s)),
      inputsHash: context?.sourceGraphHash || 'none',
    },
  ];
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
  const result = applyArtifacts(projectRoot, artifacts, { command: 'export aider', context });
  console.log(`✓ Aider export complete: ${result.appliedCount} files applied (tx: ${result.txId})`);
  return result;
}

const adapter = {
  describe,
  render,
  validate,
  run,
};

registerAdapter('aider', adapter);

module.exports = adapter;
