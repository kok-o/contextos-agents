const fs = require('fs');
const path = require('path');
const { collectSkillDirectories, resetDirectory, readMeaningfulMarkdown, extractYamlField } = require('../shared.js');

const GENERATED_SKILLS_PATH = path.join(__dirname, '..', '..', 'generated', 'gemini', 'skills');

function generateGeminiSkill(skillDir) {
  const skillName = path.basename(skillDir);
  const yamlPath = path.join(skillDir, 'skill.yaml');
  const existingSkillMdPath = path.join(skillDir, 'SKILL.md');
  const outputDir = path.join(GENERATED_SKILLS_PATH, skillName);

  if (!fs.existsSync(existingSkillMdPath) && !fs.existsSync(yamlPath)) {
    console.log(`Skipping ${skillName} (no skill.yaml or SKILL.md)`);
    return;
  }

  let name = skillName;
  let description = null;

  if (fs.existsSync(yamlPath)) {
    const yamlText = fs.readFileSync(yamlPath, 'utf8');
    name = extractYamlField(yamlText, 'name') || skillName;
    description = extractYamlField(yamlText, 'description');
    if (!description) {
      const descRegex = new RegExp(`^description:\\s*>\\s*\\n\\s*([^\\n]+)`, 'm');
      const descMatch = yamlText.match(descRegex);
      if (descMatch) description = descMatch[1].trim();
    }
  }
  description = description || `ContextOS skill for ${name}`;

  // Find all .md files in the skill directory deterministically
  const files = fs.readdirSync(skillDir).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  const mdFiles = files.filter(f => f.endsWith('.md'));

  // Primary skill content first: SKILL.md is canonical; fallback to <skillName>.md
  const primaryMd = mdFiles.includes('SKILL.md')
    ? 'SKILL.md'
    : (mdFiles.find(f => f === `${skillName}.md`) || mdFiles[0]);

  let mergedContent = '';
  if (primaryMd) {
    let primaryText = fs.readFileSync(path.join(skillDir, primaryMd), 'utf8');
    // Strip existing frontmatter from source so we don't double-nest
    primaryText = primaryText.replace(/^---[\s\S]*?---\r?\n/, '');
    mergedContent += primaryText;
  }

  // Partition supplemental markdown files for deterministic, logical ordering:
  // 1. Specific topic / reference docs (e.g. accessibility.md), sorted alphabetically
  // 2. EXAMPLES.md
  // 3. TROUBLESHOOTING.md
  const otherTopicFiles = mdFiles.filter(f => f !== primaryMd && f !== 'EXAMPLES.md' && f !== 'TROUBLESHOOTING.md');
  const orderedExtras = [...otherTopicFiles];
  if (mdFiles.includes('EXAMPLES.md') && primaryMd !== 'EXAMPLES.md') orderedExtras.push('EXAMPLES.md');
  if (mdFiles.includes('TROUBLESHOOTING.md') && primaryMd !== 'TROUBLESHOOTING.md') orderedExtras.push('TROUBLESHOOTING.md');

  for (const mdFile of orderedExtras) {
    // Avoid re-appending content that was already inlined via Source comments in SKILL.md
    if (mergedContent.includes(`<!-- Source: ${mdFile} -->`)) continue;
    const extraContent = readMeaningfulMarkdown(path.join(skillDir, mdFile));
    if (extraContent) {
      mergedContent += `\n\n<!-- Source: ${mdFile} -->\n\n` + extraContent;
    }
  }

  // Construct Gemini SKILL.md format (normalizing line endings to \n)
  const outputContent = `---
name: ${name}
description: >
  ${description}
---
${mergedContent.trimStart()}
`.replace(/\r\n/g, '\n');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'SKILL.md'), outputContent);

  console.log(`Generated SKILL.md for ${skillName}`);
}

const ANTIGRAVITY_SKILLS_PATH = path.join(__dirname, '..', '..', 'skills');

function copyFolderRecursiveSync(source, target) {
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
  const files = fs.readdirSync(source).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  for (const file of files) {
    const curSource = path.join(source, file);
    const curTarget = path.join(target, file);
    if (fs.statSync(curSource).isDirectory()) {
      copyFolderRecursiveSync(curSource, curTarget);
    } else {
      fs.copyFileSync(curSource, curTarget);
    }
  }
}

function run() {
  console.log('Starting Gemini adapter export...');
  resetDirectory(GENERATED_SKILLS_PATH);
  
  const skills = collectSkillDirectories();
  for (const skill of skills) {
    generateGeminiSkill(skill);
  }

  // Also sync to .agents/skills for Antigravity IDE native discovery
  resetDirectory(ANTIGRAVITY_SKILLS_PATH);
  copyFolderRecursiveSync(GENERATED_SKILLS_PATH, ANTIGRAVITY_SKILLS_PATH);

  console.log('Export complete. Skills are in generated/gemini/skills and .agents/skills');
}

module.exports = { run };
