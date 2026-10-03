/**
 * .agents/adapters/copilot/export.js
 * ContextOS GitHub Copilot Pure Adapter (.github/copilot-instructions.md)
 */

const fs = require('fs');
const path = require('path');
const { getSkillEntrypointPath, collectSkillDirectories, extractYamlField, stripFrontmatter } = require('../shared.js');
const { registerAdapter, applyArtifacts, createProvenanceHeader } = require('../pure-compiler.js');

const GENERATOR_ID = 'copilot@2';

function describe() {
  return {
    name: 'copilot',
    version: '2.0.0',
    description: 'Compiles instructions for GitHub Copilot (.github/copilot-instructions.md)',
    targetPattern: '.github/copilot-instructions.md',
  };
}

function buildSkillSection(skillDir, context) {
  const skillName = path.basename(skillDir);
  const skillMdPath = getSkillEntrypointPath(skillDir);
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
  const sourcePath = path.relative(context?.projectRoot || '.', skillMdPath).split(path.sep).join('/');
  const skillRef = `*Source: \`${sourcePath}\` (Read on demand)*\n`;
  return `\n### ${title}\n${descLine}${skillRef}`;
}

function render(context) {
  const lines = [];

  const prov = createProvenanceHeader({
    generator: GENERATOR_ID,
    sourceGraphHash: context?.sourceGraphHash,
    profileId: context?.profileId,
    profileHash: context?.profileHash,
  });

  lines.push(
    prov +
    `# GitHub Copilot Instructions — ContextOS\n\n` +
    `## Project Rules\n\n` +
    `### Step 0 — Identify Before Acting\n\n` +
    `When useful for substantial work, identify:\n` +
    `\`\`\`\n1. WHAT DOMAIN?   → Frontend / Backend / Architecture / Full-Stack / DevOps\n2. WHAT PHASE?    → Define / Plan / Build / Verify / Review / Ship\n3. WHAT ROLE?     → Declare specialist role for this phase\n\`\`\`\n\n` +
    `> **Anti-Spam Invariant**: Declare this strictly once at the start of a task or phase. Never repeat before intermediate tool calls or step updates.\n\n` +
    `### Non-Negotiable Rules\n\n` +
    `- **Zero-Assumption Investigation**: Never guess file paths or signatures. Inspect before modifying.\n` +
    `- **Zero-Placeholder Production Code**: Never emit lazy stubs, \`// TODO\`, or partial code.\n` +
    `- **Mandatory Proof-of-Work Verification**: Always run tests and validators before claiming completion.\n` +
    `- **Surgical Blast Radius**: Modify only files strictly within scope.\n` +
    `- **Fast-Track Exception**: Routine maintenance, git commands, version bumps, typo fixes, and diagnostics skip spec/plan ceremonies.\n\n` +
    `---\n\n` +
    `## Skills Library\n\n` +
    `ContextOS uses on-demand progressive disclosure. Read the relevant \`SKILL.md\` file only when your task matches the trigger.\n\n` +
    `### Skill Routing Table\n\n` +
    `| Trigger / Domain | Skill | Path |\n` +
    `| --- | --- | --- |\n`
  );

  const skills = collectSkillDirectories(context?.profile, context?.projectRoot);
  for (const skill of skills) {
    const skillName = path.basename(skill);
    const yamlPath = path.join(skill, 'skill.yaml');
    let tags = skillName;
    if (fs.existsSync(yamlPath)) {
      const yaml = fs.readFileSync(yamlPath, 'utf8');
      const rawTags = extractYamlField(yaml, 'tags');
      if (rawTags) tags = rawTags.replace(/[\[\]]/g, '');
    }
    const relPath = path.relative(context?.projectRoot || '.', getSkillEntrypointPath(skill)).replace(/\\/g, '/');
    lines.push(`| \`${tags}\` | **${skillName}** | \`${relPath}\` |\n`);
  }
  lines.push(`\n---\n`);

  for (const skill of skills) {
    const section = buildSkillSection(skill, context);
    if (section) {
      lines.push(section);
    }
  }

  const target = path.join(context?.projectRoot || '.', '.github/copilot-instructions.md');
  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  const start = '<!-- CONTEXTOS:START -->';
  const end = '<!-- CONTEXTOS:END -->';
  const block = `${start}\n${lines.join('').replace(/\r\n/g, '\n')}${end}`;
  let content;
  if (existing.includes(start) || existing.includes(end)) {
    if (existing.split(start).length !== 2 || existing.split(end).length !== 2 || existing.indexOf(end) < existing.indexOf(start)) {
      throw new Error('Malformed ContextOS block in Copilot instructions; refusing to overwrite.');
    }
    content = existing.slice(0, existing.indexOf(start)) + block + existing.slice(existing.indexOf(end) + end.length);
  } else {
    const { LockfileV2Manager, computeExactHash } = require('../../filesystem/index.js');
    const managed = new LockfileV2Manager(context?.projectRoot || '.').read()?.managedFiles?.['.github/copilot-instructions.md'];
    const legacyManaged = managed?.generator === GENERATOR_ID && managed.exactSha256 === computeExactHash(Buffer.from(existing));
    content = legacyManaged ? block + '\n' : existing + (existing && !existing.endsWith('\n') ? '\n' : '') + (existing ? '\n' : '') + block + '\n';
  }

  return [
    {
      path: '.github/copilot-instructions.md',
      content,
      preservesUserContent: true,
      expectedBeforeHash: fs.existsSync(target) ? require('../../filesystem/index.js').computeExactHash(Buffer.from(existing)) : 'NONE',
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
  const projectRoot = options.projectRoot || '.';
  const context = loadCompilerContext(projectRoot, options);
  const artifacts = render(context);
  const result = applyArtifacts(projectRoot, artifacts, { command: 'export copilot', context });
  console.log(`✓ Copilot export complete: ${result.appliedCount} files applied (tx: ${result.txId})`);
  return result;
}

const adapter = {
  describe,
  render,
  validate,
  run,
};

registerAdapter('copilot', adapter);

module.exports = adapter;
