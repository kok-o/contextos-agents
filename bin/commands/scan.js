/**
 * bin/commands/scan.js
 * ContextOS CLI Command Handler: scan
 *
 * Runs security, placeholder, and write-scope checks against Git staged files.
 */

'use strict';

const { runScan } = require('../lib/scan.js');

function scanCommand(args, flags) {
  const isJson = flags.json || args.includes('--json');
  const enforce = flags.enforce || args.includes('--enforce');
  const checkPlaceholders = flags.placeholders || args.includes('--placeholders');
  const checkSecrets = !args.includes('--no-secrets');

  const scopeIdx = args.indexOf('--scope');
  const scopeFile = scopeIdx !== -1 && args[scopeIdx + 1] ? args[scopeIdx + 1] : null;

  const result = runScan({
    cwd: process.cwd(),
    staged: true,
    secrets: checkSecrets,
    placeholders: checkPlaceholders,
    scope: scopeFile,
    enforce,
  });

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.code);
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  ContextOS Staged Index Scanner');
  console.log('══════════════════════════════════════════════════════\n');

  if (result.code === 2) {
    console.error(`  [ERROR] ${result.error || 'Scan incomplete'}\n`);
    process.exit(2);
  }

  console.log(`  Staged Files Scanned : ${result.stats.stagedFilesCount}`);
  console.log(`  Enforcement Mode     : ${enforce ? 'STRICT (fails on findings)' : 'ADVISORY (warnings only)'}`);
  console.log(`  Violations Found     : ${result.stats.violationsCount}\n`);

  if (result.findings.length > 0) {
    console.log('  Findings:');
    for (const f of result.findings) {
      const loc = f.line ? `${f.file}:${f.line}` : f.file;
      const tag = f.severity === 'error' ? 'ERROR' : 'WARN';
      console.log(`    • [${f.ruleId}] [${tag}] ${loc}`);
      console.log(`      ${f.details}`);
    }
    console.log('');
  }

  console.log('──────────────────────────────────────────────────────');
  if (result.ok) {
    console.log('  RESULT: PASSED (No blocking violations in staged index)');
  } else {
    console.log('  RESULT: FAILED (Commit blocked due to staged violations)');
  }
  console.log('──────────────────────────────────────────────────────\n');

  process.exit(result.code);
}

module.exports = scanCommand;
