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

const SUSPICIOUS_UNLINKED_PATTERNS = [
  /\b(?:saves|reduces|improves)\b[^\n.!?]{0,80}?\d+(?:\.\d+)?%/i,
  /\b\d+x\s+faster\b/i,
  /\bguaranteed\s+(?:success|security)\b/i,
  /\b100%\s+secure\b/i,
];

function lintClaims(options = {}) {
  const ROOT = path.resolve(options.rootDir || path.join(__dirname, '..'));
  const CLAIMS_FILE = path.join(ROOT, 'benchmarks', 'claims.json');
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
  const supportedClaimIds = new Set();
  const supportedStatuses = new Set(['deterministic', 'measured', 'observed', 'supported']);
  const supportedEvidenceStatuses = new Set([...supportedStatuses, 'pass', 'passed', 'accepted', 'success', 'complete', 'completed', 'ok']);
  let errors = 0;

  for (const claim of claimsData.claims) {
    if (!claim.id || typeof claim.id !== 'string') {
      console.error('[ERROR] Claim missing valid "id".');
      errors++;
      continue;
    }

    const errorsBeforeClaim = errors;
    let canSupport = supportedStatuses.has(claim.status);
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
      } else if (evidencePath.endsWith('.json')) {
        try {
          const evidenceContent = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
          if (evidenceContent.status !== undefined &&
              (typeof evidenceContent.status !== 'string' || !supportedEvidenceStatuses.has(evidenceContent.status.toLowerCase()))) {
            canSupport = false;
          }
          if (evidenceContent.validUntil && !(Date.parse(evidenceContent.validUntil) > Date.now())) canSupport = false;
          if (evidenceContent.status === 'invalidated' && claim.status !== 'invalidated') {
            console.error(
              `[ERROR] Claim "${claim.id}" has status "${claim.status}" but its evidence artifact status is "invalidated".`
            );
            errors++;
          }
        } catch (e) {
          console.error(`[ERROR] Failed to read/parse evidence artifact ${evidencePath}: ${e.message}`);
          errors++;
        }
      }
    }

    if (claim.validUntil && Number.isNaN(Date.parse(claim.validUntil))) {
      console.error(`[ERROR] Claim "${claim.id}" has invalid validUntil date: ${claim.validUntil}`);
      errors++;
    }
    if (claim.validUntil && !(Date.parse(claim.validUntil) > Date.now())) canSupport = false;
    if (canSupport && errors === errorsBeforeClaim) supportedClaimIds.add(claim.id);
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
  // These JSON files are distributed to consumers. Inspect each string field,
  // not the serialized document, so a citation in another entry cannot cover it.
  for (const relative of ['package.json', 'registry.json', '.agents/skills.json', '.agents/skills-index.json', '.agents/compiled/registry.v2.json']) {
    const file = path.join(ROOT, relative);
    if (!fs.existsSync(file)) continue;
    try {
      const visit = (value, pointer) => {
        if (typeof value === 'string') {
          if (!SUSPICIOUS_UNLINKED_PATTERNS.some(pattern => pattern.test(value))) return;
          const citations = value.match(/claim-[a-z0-9-]+/gi) || [];
          if (!citations.some(id => supportedClaimIds.has(id))) {
            console.error(`[ERROR] ${relative}:${pointer}: Quantitative claim in public metadata requires current supported evidence (not an invalidated, stale, deprecated or aspirational citation).`);
            errors++;
          }
        } else if (value && typeof value === 'object') {
          for (const [key, child] of Object.entries(value)) visit(child, `${pointer}/${key}`);
        }
      };
      visit(JSON.parse(fs.readFileSync(file, 'utf8')), '');
    } catch (error) {
      console.error(`[ERROR] ${relative}: Invalid public JSON: ${error.message}`);
      errors++;
    }
  }
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
