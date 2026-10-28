/**
 * .agents/filesystem/ownership.js
 * Does the project own the file that currently sits at a managed path?
 *
 * Shared by export (before overwriting or pruning) and uninstall (before
 * deleting), so that both treat user edits the same way.
 */

const { computeExactHash, computeSemanticHash } = require('./lockfile-v2.js');

// Reconstruct complete versions, including a diff3 base, preserving their line
// endings. A marker by itself (including a Markdown underline) proves nothing.
function conflictSides(text) {
  const ours = [];
  const theirs = [];
  const base = [];
  let state = 'outside';
  let found = false;
  let hasBase = false;
  let baseStart = 0;
  for (const raw of text.match(/[^\n]*\n|[^\n]+$/g) || []) {
    const line = raw.replace(/\r?\n$/, '');
    if (/^<{7}(?: .*)?$/.test(line)) {
      if (state !== 'outside') return null;
      state = 'ours';
      found = true;
      baseStart = base.length;
    } else if (/^\|{7}(?: .*)?$/.test(line)) {
      if (state !== 'ours') return null;
      state = 'base';
      hasBase = true;
      base.length = baseStart;
    } else if (line === '=======') {
      if (state !== 'ours' && state !== 'base') return null;
      state = 'theirs';
    } else if (/^>{7}(?: .*)?$/.test(line)) {
      if (state !== 'theirs') return null;
      state = 'outside';
    } else {
      if (state === 'outside' || state === 'ours') ours.push(raw);
      if (state === 'outside' || state === 'theirs') theirs.push(raw);
      // Two-way hunks have no discarded base text: use ours for that portion.
      // A diff3 marker replaces it with the actual base, which must also match
      // a recorded complete version before any of its bytes can be removed.
      if (state !== 'theirs') base.push(raw);
    }
  }
  return found && state === 'outside'
    ? [ours.join(''), theirs.join(''), ...(hasBase ? [base.join('')] : [])] : null;
}

function isTextMedia(mediaType) {
  return /^text\/|yaml|json/.test(mediaType || '');
}

const TEXT_EXTENSION = /\.(md|mdc|txt|ya?ml|json|js|ts|py)$/i;

/**
 * Owned means one of:
 *  - it still matches what ContextOS last wrote (byte-exact, or for text up to line endings),
 *    or matches the other side of a merged lockfile;
 *  - every complete merge version, including a diff3 base, matches recorded hashes;
 *  - it matches a legacy (lockfile v1) installation record.
 */
function isStrictBoundedRule(relPath, record) {
  return record?.generator === 'gemini@2' && /^\.agents\/rules\/contextos-bounded-[a-f0-9]{24}-\d{3,}\.md$/.test(relPath);
}

function ownsDiskFile({ diskBuf, textLike, existing, alternates = [], legacyRecord = null, strict = false }) {
  const matchesOwned = content => {
    const exact = computeExactHash(content);
    const semantic = computeSemanticHash(content);
    const matches = record => Boolean(record) && (
      exact === record.exactSha256 || (textLike && semantic === record.semanticTextSha256)
    );
    return matches(existing) || alternates.some(matches) || Boolean(
      !strict && legacyRecord?.managed && legacyRecord.sha256 === semantic.replace('sha256:', '')
    );
  };
  if (matchesOwned(diskBuf)) return true;
  if (strict) return false;
  const sides = textLike ? conflictSides(diskBuf.toString('utf8')) : null;
  return Boolean(sides && sides.every(matchesOwned));
}

module.exports = { isTextMedia, ownsDiskFile, isStrictBoundedRule, TEXT_EXTENSION };
