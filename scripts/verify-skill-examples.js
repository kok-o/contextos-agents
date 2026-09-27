#!/usr/bin/env node
/**
 * scripts/verify-skill-examples.js
 * ContextOS Phase 4: Skill Code Examples Extractor and Verifier
 *
 * Extracts code blocks from skill definitions, classifies them into
 * runnable / illustrative / expected-failure, and verifies their syntax,
 * types, and execution behavior.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// First Coverage Scope Definitions (Task 4.1)
const FIRST_COVERAGE_SKILLS = [
  {
    id: 'fastapi',
    file: path.join(PROJECT_ROOT, 'catalog', 'skills', 'fastapi', 'SKILL.md'),
    domain: 'backend',
  },
  {
    id: 'web-accessibility',
    file: path.join(PROJECT_ROOT, 'catalog', 'skills', 'web-accessibility', 'SKILL.md'),
    domain: 'frontend',
  },
  {
    id: 'adapters',
    file: path.join(PROJECT_ROOT, 'catalog', 'skills', 'adapters', 'SKILL.md'),
    domain: 'adapters',
  },
  {
    id: 'security',
    file: path.join(PROJECT_ROOT, '.agents', 'core', 'skills', 'security', 'SKILL.md'),
    domain: 'security',
  },
];

/**
 * Extracts and classifies markdown code blocks from a skill file.
 */
function extractSkillExamples(skillDef) {
  if (!fs.existsSync(skillDef.file)) {
    throw new Error(`Skill file not found: ${skillDef.file}`);
  }

  const content = fs.readFileSync(skillDef.file, 'utf8');
  const lines = content.split(/\r?\n/);
  const examples = [];

  let inBlock = false;
  let blockLang = '';
  let blockLines = [];
  let blockStartLine = 0;
  let currentHeading = 'Overview';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track active heading
    const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch && !inBlock) {
      currentHeading = headingMatch[1].trim();
      continue;
    }

    // Code block boundaries
    if (line.startsWith('```')) {
      if (!inBlock) {
        inBlock = true;
        blockLang = line.slice(3).trim();
        blockLines = [];
        blockStartLine = i + 1;
      } else {
        inBlock = false;
        const code = blockLines.join('\n');
        const exampleMeta = classifyBlock(skillDef.id, currentHeading, blockLang, code, blockStartLine);
        examples.push(exampleMeta);
      }
    } else if (inBlock) {
      blockLines.push(line);
    }
  }

  return examples;
}

/**
 * Classifies code blocks based on language, content, and context.
 */
function classifyBlock(skillId, heading, lang, code, startLine) {
  const normLang = (lang || '').toLowerCase();
  const slug = heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const id = `${skillId}:${slug}:${startLine}`;

  // 1. Illustrative: Directory trees, placeholders, HTTP headers, raw output
  if (
    normLang === '' ||
    normLang === 'text' ||
    normLang === 'http' ||
    code.includes('├──') ||
    code.includes('{{') ||
    code.startsWith('app/')
  ) {
    return {
      id,
      skillId,
      heading,
      lang: normLang || 'text',
      type: 'illustrative',
      startLine,
      code,
      reason: 'Directory structure, schema template, or HTTP headers',
    };
  }

  // 2. Explicit negative failure examples
  if (heading.toLowerCase().includes('negative') || code.includes('[FAIL]')) {
    return {
      id,
      skillId,
      heading,
      lang: normLang,
      type: 'expected-failure',
      startLine,
      code,
      reason: 'Negative anti-pattern or prohibited constraint',
    };
  }

  // 3. Runnable: Python, JS, TS, TSX, CSS
  if (['python', 'javascript', 'typescript', 'tsx', 'jsx', 'css'].includes(normLang)) {
    return {
      id,
      skillId,
      heading,
      lang: normLang,
      type: 'runnable',
      startLine,
      code,
    };
  }

  return {
    id,
    skillId,
    heading,
    lang: normLang,
    type: 'illustrative',
    startLine,
    code,
    reason: 'Supplementary documentation block',
  };
}

/**
 * Validates language syntax using esbuild (for JS/TS/TSX/JSX) and Python AST parser.
 * Note: Syntax validation confirms grammatical correctness; it does not prove behavioral correctness.
 *
 * @param {Object} block - Code block metadata from classifyBlock
 * @returns {Object|null} Verification result or null if not applicable
 */
function verifyBlockSyntax(block) {
  const lang = (block.lang || '').toLowerCase();
  const code = block.code || '';

  if (block.type === 'illustrative' || block.type === 'expected-failure') {
    return null;
  }

  // Check JavaScript / TypeScript / TSX / JSX with esbuild
  if (['javascript', 'js', 'typescript', 'ts', 'tsx', 'jsx'].includes(lang)) {
    try {
      const esbuild = require('esbuild');
      const loader = (lang === 'typescript' || lang === 'ts') ? 'ts'
        : (lang === 'tsx' || lang === 'jsx') ? 'tsx'
        : 'js';
      esbuild.transformSync(code, { loader });
      return {
        id: `syntax:${block.id}`,
        kind: 'syntax-parsing',
        passed: true,
        note: 'Syntax parsed cleanly via esbuild (syntax validation only; not behavioral proof)',
      };
    } catch (err) {
      return {
        id: `syntax:${block.id}`,
        kind: 'syntax-parsing',
        passed: false,
        error: `Syntax error: ${err.message}`,
      };
    }
  }

  // Check Python with AST parsing
  if (lang === 'python' || lang === 'py') {
    try {
      execFileSync('python', ['-c', 'import ast, sys; ast.parse(sys.stdin.read())'], {
        input: code,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return {
        id: `syntax:${block.id}`,
        kind: 'syntax-parsing',
        passed: true,
        note: 'Python AST parsed cleanly (syntax validation only; not behavioral proof)',
      };
    } catch (err) {
      return {
        id: `syntax:${block.id}`,
        kind: 'syntax-parsing',
        passed: false,
        error: `Python syntax error: ${err.message}`,
      };
    }
  }

  return null;
}

/**
 * Runs execution and syntax verifications for the first coverage suite.
 */
async function verifyCoverageExamples() {
  const securityRunner = require('../tests/fixtures/skill-examples/security-runner.js');
  const a11yRunner = require('../tests/fixtures/skill-examples/web-accessibility-runner.js');
  const adaptersRunner = require('../tests/fixtures/skill-examples/adapters-runner.js');

  const verificationResults = [];

  // 1. Verify Security Examples
  const secTimingResults = securityRunner.runSecurityExamples();
  secTimingResults.forEach(r => verificationResults.push({ ...r, kind: 'behavioral-test' }));

  const secSsrfResults = await securityRunner.runSsrfExamples();
  secSsrfResults.forEach(r => verificationResults.push({ ...r, kind: 'behavioral-test' }));

  // 2. Verify Web Accessibility Examples
  const a11yModalResults = a11yRunner.verifyAccessibleModalBehavior();
  a11yModalResults.forEach(r => verificationResults.push({ ...r, kind: 'behavioral-test' }));

  const a11ySkillFile = path.join(PROJECT_ROOT, 'catalog', 'skills', 'web-accessibility', 'SKILL.md');
  const a11yContent = fs.readFileSync(a11ySkillFile, 'utf8');
  const a11yCssResults = a11yRunner.verifyFocusVisibleCss(a11yContent);
  a11yCssResults.forEach(r => verificationResults.push({ ...r, kind: 'behavioral-test' }));

  // 3. Verify Adapters CLI Examples
  const adapterResults = adaptersRunner.verifyAdaptersSkillCommands();
  adapterResults.forEach(r => verificationResults.push({ ...r, kind: 'behavioral-test' }));

  // 4. Verify FastAPI Python Examples
  const pyRunnerPath = path.join(PROJECT_ROOT, 'tests', 'fixtures', 'skill-examples', 'fastapi-runner.py');
  try {
    const pyOutput = execFileSync('python', [pyRunnerPath], { encoding: 'utf8' });
    const pyParsed = JSON.parse(pyOutput);
    if (pyParsed.results) {
      pyParsed.results.forEach(r => verificationResults.push({ ...r, kind: 'behavioral-test' }));
    }
  } catch (err) {
    verificationResults.push({
      id: 'fastapi:python-environment',
      kind: 'behavioral-test',
      passed: false,
      error: `Python runner failed: ${err.message}`,
    });
  }

  return verificationResults;
}

/**
 * Main verification pipeline.
 */
async function run() {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');

  const inventory = [];
  for (const skill of FIRST_COVERAGE_SKILLS) {
    const blocks = extractSkillExamples(skill);
    inventory.push(...blocks);
  }

  // Syntax validation pass across all extracted runnable code blocks
  const syntaxResults = [];
  for (const block of inventory) {
    const res = verifyBlockSyntax(block);
    if (res) syntaxResults.push(res);
  }

  // Behavioral execution pass
  const behavioralResults = await verifyCoverageExamples();
  const allVerifications = [...syntaxResults, ...behavioralResults];
  const failedVerifications = allVerifications.filter(v => !v.passed);

  const stats = {
    totalBlocks: inventory.length,
    byType: {
      runnable: inventory.filter(b => b.type === 'runnable').length,
      illustrative: inventory.filter(b => b.type === 'illustrative').length,
      expectedFailure: inventory.filter(b => b.type === 'expected-failure').length,
      unverified: inventory.filter(b => b.type === 'unverified').length,
    },
    syntaxChecksRun: syntaxResults.length,
    syntaxChecksPassed: syntaxResults.filter(r => r.passed).length,
    behavioralChecksRun: behavioralResults.length,
    behavioralChecksPassed: behavioralResults.filter(r => r.passed).length,
    verificationsRun: allVerifications.length,
    verificationsPassed: allVerifications.filter(v => v.passed).length,
    verificationsFailed: failedVerifications.length,
  };

  const ok = failedVerifications.length === 0 && stats.byType.unverified === 0;

  if (isJson) {
    console.log(JSON.stringify({ ok, stats, inventory, syntaxResults, behavioralResults }, null, 2));
    process.exit(ok ? 0 : 1);
  }

  console.log('\n======================================================');
  console.log('  ContextOS Phase 4: Skill Examples Quality Gate');
  console.log('======================================================\n');
  console.log(`  Skills in Scope      : ${FIRST_COVERAGE_SKILLS.map(s => s.id).join(', ')}`);
  console.log(`  Total Code Blocks    : ${stats.totalBlocks}`);
  console.log(`    • Runnable         : ${stats.byType.runnable}`);
  console.log(`    • Illustrative     : ${stats.byType.illustrative}`);
  console.log(`    • Expected-Failure : ${stats.byType.expectedFailure}`);
  console.log(`    • Unverified       : ${stats.byType.unverified}\n`);

  console.log('  Syntax Parsing Checks (Language Grammar):');
  for (const v of syntaxResults) {
    const icon = v.passed ? '✓' : '✗';
    console.log(`    ${icon} ${v.id}${v.error ? ` [ERROR: ${v.error}]` : ''}`);
  }

  console.log('\n  Behavioral Runtime Checks (Negative/Positive Execution):');
  for (const v of behavioralResults) {
    const icon = v.passed ? '✓' : '✗';
    console.log(`    ${icon} ${v.id}${v.error ? ` [ERROR: ${v.error}]` : ''}`);
  }

  console.log('\n------------------------------------------------------');
  if (ok) {
    console.log(`  RESULT: PASSED (${stats.verificationsPassed}/${stats.verificationsRun} checks green: ${stats.syntaxChecksPassed} syntax, ${stats.behavioralChecksPassed} behavioral, 0 unverified)`);
  } else {
    console.log(`  RESULT: FAILED (${failedVerifications.length} checks failed)`);
  }
  console.log('------------------------------------------------------\n');

  process.exit(ok ? 0 : 1);
}

if (require.main === module) {
  run().catch(err => {
    console.error('Fatal verification error:', err);
    process.exit(1);
  });
}

module.exports = {
  FIRST_COVERAGE_SKILLS,
  extractSkillExamples,
  classifyBlock,
  verifyBlockSyntax,
  verifyCoverageExamples,
};
