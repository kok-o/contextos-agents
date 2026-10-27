/**
 * .agents/filesystem/ownership.js
 * Does the project own the file that currently sits at a managed path?
 *
 * Shared by export (before overwriting or pruning) and uninstall (before
 * deleting), so that both treat user edits the same way.
 */

const { computeExactHash, computeSemanticHash } = require('./lockfile-v2.js');
const { hasConflictMarkers } = require('./managed-block.js');

function isTextMedia(mediaType) {
  return /^text\/|yaml|json/.test(mediaType || '');
}

const TEXT_EXTENSION = /\.(md|mdc|txt|ya?ml|json|js|ts|py)$/i;

/**
 * Owned means one of:
 *  - it still matches what ContextOS last wrote (byte-exact, or for text up to line endings),
 *    or matches the other side of a merged lockfile;
 *  - it is an unresolved merge of such files (conflict markers in a recorded text file);
 *  - it matches a legacy (lockfile v1) installation record.
 */
function isStrictBoundedRule(relPath, record) {
  return record?.generator === 'gemini@2' && /^\.agents\/rules\/contextos-bounded-[a-f0-9]{24}-\d{3,}\.md$/.test(relPath);
}

function ownsDiskFile({ diskBuf, textLike, existing, alternates = [], legacyRecord = null, strict = false }) {
  const diskExact = computeExactHash(diskBuf);
  const diskSemantic = computeSemanticHash(diskBuf);
  const matches = record => Boolean(record) && (
    diskExact === record.exactSha256 || (textLike && diskSemantic === record.semanticTextSha256)
  );
  if (matches(existing) || alternates.some(matches)) return true;
  if (strict) return false;
  if (existing && textLike && hasConflictMarkers(diskBuf.toString('utf8'))) return true;
  return Boolean(legacyRecord && legacyRecord.managed && legacyRecord.sha256 === diskSemantic.replace('sha256:', ''));
}

module.exports = { isTextMedia, ownsDiskFile, isStrictBoundedRule, TEXT_EXTENSION };
