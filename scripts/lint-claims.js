/**
 * scripts/lint-claims.js
 * ContextOS — Claim Governance & Quantitative Assertion Linter
 *
 * Implements Section 23.4 of CONTEXTOS_IMPLEMENTATION_PLAN.md:
 *   - Verifies claims registry integrity (benchmarks/claims.json)
 *   - Scans documentation for quantitative assertions (% savings, benchmark statements)
 *   - Ensures every quantitative performance claim has a registered, valid claim ID
 *   - Warns on unverified marketing buzzwords (absolute guarantee, 100% secure)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CLAIMS_FILE = path.join(ROOT, 'benchmarks', 'claims.json');

const SUSPICIOUS_UNLINKED_PATTERNS = [
  /(?:saves|reduces|improves)\s+\d+(?:\.\d+)?%/i,
  /\b\d+x\s+faster\b/i,
  /\bguaranteed\s+(?:success|security)\b/i,
  /\b100%\s+secure\b/i,
];

function lintClaims() {
  console.log('[lint-claims] Validating claims registry and documentation claims...');

  if (!fs.existsSync(CLAIMS_FILE)) {
    console.error(`[ERROR] Missing claims registry file: ${CLAIMS_FILE}`);
    process.exit(1);
  }

  let claimsData;
  try {
    claimsData = JSON.parse(fs.readFileSync(CLAIMS_FILE, 'utf8'));
  } catch (err) {
    console.error(`[ERROR] Failed to parse ${CLAIMS_FILE}: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(claimsData.claims)) {
    console.error('[ERROR] Claims registry must contain a "claims" array.');
    process.exit(1);
  }

  const validStatuses = new Set([
    'deterministic',
    'measured',
    'observed',
    'aspirational',
    'deprecated',
    'stale',
    'invalidated',
    'supported',
  ]);

  const claimIds = new Set();
  let errors = 0;

  for (const claim of claimsData.claims) {
    if (!claim.id || typeof claim.id !== 'string') {
      console.error('[ERROR] Claim missing valid "id".');
      errors++;
      continue;
    }

    if (claimIds.has(claim.id)) {
      console.error(`[ERROR] Duplicate claim id: "${claim.id}"`);
      errors++;
    }
    claimIds.add(claim.id);

    if (!validStatuses.has(claim.status)) {
      console.error(`[ERROR] Claim "${claim.id}" has invalid status: "${claim.status}"`);
      errors++;
    }

    if (!claim.statement) {
      console.error(`[ERROR] Claim "${claim.id}" missing statement.`);
      errors++;
    }

    if (!claim.evidenceArtifact) {
      console.error(`[ERROR] Claim "${claim.id}" missing evidenceArtifact link.`);
      errors++;
    } else {
      const evidencePath = path.resolve(ROOT, claim.evidenceArtifact);
      const relativeEvidencePath = path.relative(ROOT, evidencePath);
      if (relativeEvidencePath.startsWith('..') || path.isAbsolute(relativeEvidencePath)) {
        console.error(`[ERROR] Claim "${claim.id}" evidenceArtifact escapes the repository.`);
        errors++;
      } else if (!fs.existsSync(evidencePath)) {
        console.error(`[ERROR] Claim "${claim.id}" evidenceArtifact does not exist: ${claim.evidenceArtifact}`);
        errors++;
      }
    }

    if (claim.validUntil && Number.isNaN(Date.parse(claim.validUntil))) {
      console.error(`[ERROR] Claim "${claim.id}" has invalid validUntil date: ${claim.validUntil}`);
      errors++;
    }
  }

  console.log(`[lint-claims] Verified ${claimIds.size} registered claim(s) in registry.`);

  // Scan documentation files for unlinked claims
  const docsToScan = ['README.md', 'CONTRIBUTING.md'];
  const docsDir = path.join(ROOT, 'docs');
  if (fs.existsSync(docsDir)) {
    const scanDir = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(full);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          docsToScan.push(path.relative(ROOT, full));
        }
      }
    };
    scanDir(docsDir);
  }

  let unlinkedWarnings = 0;
  for (const relDoc of docsToScan) {
    const fullPath = path.join(ROOT, relDoc);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, idx) => {
      // If line contains quantitative pattern, check if it links to a claim or benchmark
      for (const pattern of SUSPICIOUS_UNLINKED_PATTERNS) {
        if (pattern.test(line)) {
          // Check if claim ID or benchmark citation is present on the same line or in doc
          const hasCitation = /claim-[a-z0-9-]+/i.test(line) || /\[benchmark/i.test(line) || /benchmarks\/claims/i.test(content);
          if (!hasCitation) {
            console.warn(`[WARN] ${relDoc}:${idx + 1}: Uncited quantitative claim pattern: "${line.trim()}"`);
            unlinkedWarnings++;
          }
        }
      }
    });
  }

  if (errors > 0) {
    console.error(`\n[lint-claims] FAILED with ${errors} error(s).`);
    process.exit(1);
  }

  console.log(`[lint-claims] PASSED with 0 errors and ${unlinkedWarnings} warning(s).\n`);
}

if (require.main === module) {
  lintClaims();
}

module.exports = {
  lintClaims,
};
