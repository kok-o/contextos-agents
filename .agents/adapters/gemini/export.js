const fs = require('fs');
const path = require('path');
const { collectSkillDirectories, resetDirectory, readMeaningfulMarkdown, extractYamlField } = require('../shared.js');

const GENERATED_SKILLS_PATH = path.join(__dirname, '..', '..', 'generated', 'gemini', 'skills');

function generateGeminiSkill(skillDir) {
  const skillName = path.basename(skillDir);
  const yamlPath = path.join(skillDir, 'skill.yaml');
  const existingSkillMdPath = path.join(skillDir, 'SKILL.md');
  const outputDir = path.join(GENERATED_SKILLS_PATH, skillName);
  
  if (!fs.existsSync(yamlPath)) {
    if (fs.existsSync(existingSkillMdPath)) {
      fs.mkdirSync(outputDir, { recursive: true });
      
      let finalContent = fs.readFileSync(existingSkillMdPath, 'utf8');
      
      const examples = readMeaningfulMarkdown(path.join(skillDir, 'EXAMPLES.md'));
      if (examples) {
        finalContent += '\n\n' + examples;
      }
      
      const troubleshooting = readMeaningfulMarkdown(path.join(skillDir, 'TROUBLESHOOTING.md'));
      if (troubleshooting) {
        finalContent += '\n\n' + troubleshooting;
      }
      
      fs.writeFileSync(path.join(outputDir, 'SKILL.md'), finalContent);
      
      // Copy remaining files (like VALIDATION.json, scripts/)
      const files = fs.readdirSync(skillDir);
      for (const file of files) {
        if (file !== 'SKILL.md' && file !== 'EXAMPLES.md' && file !== 'TROUBLESHOOTING.md') {
          const srcPath = path.join(skillDir, file);
          const destPath = path.join(outputDir, file);
          if (fs.statSync(srcPath).isFile()) {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      }
      console.log(`Bundled and copied SKILL.md for ${skillName}`);
      return;
    }
    console.log(`Skipping ${skillName} (no skill.yaml or SKILL.md)`);
    return;
  }

  const yamlText = fs.readFileSync(yamlPath, 'utf8');
  const name = extractYamlField(yamlText, 'name') || skillName;
  let description = extractYamlField(yamlText, 'description');
  if (!description) {
    const descRegex = new RegExp(`^description:\\s*>\\s*\\n\\s*([^\\n]+)`, 'm');
    const descMatch = yamlText.match(descRegex);
    if (descMatch) description = descMatch[1].trim();
  }
  description = description || `ContextOS skill for ${name}`;

  // Find all .md files in the skill directory to merge, filtering placeholder stubs
  const files = fs.readdirSync(skillDir);
  const mdFiles = files.filter(f => f.endsWith('.md'));
  
  let mergedContent = '';
  // Primary skill content first (SKILL.md or <skillName>.md)
  const primaryMd = mdFiles.find(f => f === 'SKILL.md' || f === `${skillName}.md`) || mdFiles[0];
  if (primaryMd) {
    let primaryText = fs.readFileSync(path.join(skillDir, primaryMd), 'utf8');
    // Strip existing frontmatter from source so we don't double-nest
    primaryText = primaryText.replace(/^---[\s\S]*?---\r?\n/, '');
    mergedContent += primaryText;
  }

  // Then append other meaningful md files if present
  for (const mdFile of mdFiles) {
    if (mdFile === primaryMd) continue;
    const extraContent = readMeaningfulMarkdown(path.join(skillDir, mdFile));
    if (extraContent) {
      mergedContent += `\n\n<!-- Source: ${mdFile} -->\n\n` + extraContent;
    }
  }

  // Construct Gemini SKILL.md format
  const outputContent = `---
name: ${name}
description: >
  ${description}
---
${mergedContent.trimStart()}
`;

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'SKILL.md'), outputContent);
  console.log(`Generated SKILL.md for ${skillName}`);
}

const ANTIGRAVITY_SKILLS_PATH = path.join(__dirname, '..', '..', 'skills');

function copyFolderRecursiveSync(source, target) {
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
  const files = fs.readdirSync(source);
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
