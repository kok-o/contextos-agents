/**
 * .agents/filesystem/managed-block.js
 * ContextOS managed-block helpers for files that also hold user-authored text
 * (CLAUDE.md-style instruction files, Copilot instructions).
 *
 * The generated region is delimited by START/END marker lines. Everything
 * outside the markers belongs to the user and is never rewritten.
 */

const CONTEXTOS_BLOCK_START = '<!-- CONTEXTOS:START -->';
const CONTEXTOS_BLOCK_END = '<!-- CONTEXTOS:END -->';

const OPEN_LINE = /^<{7}(?: .*)?$/;
const CLOSE_LINE = /^>{7}(?: .*)?$/;
const CONFLICT_LINE = /^(<{7}|={7}|>{7})(?: .*)?$/;

function hasConflictMarkers(text) {
  return String(text).split(/\r?\n/).some(line => CONFLICT_LINE.test(line));
}

/** Character ranges [from, to) of each conflict hunk, from its opening to its closing marker line. */
function conflictHunks(text) {
  const hunks = [];
  let offset = 0;
  let open = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const next = offset + raw.length + 1;
    if (OPEN_LINE.test(line)) {
      open = offset;
    } else if (CLOSE_LINE.test(line) && open !== null) {
      hunks.push({ from: open, to: Math.min(next, text.length) });
      open = null;
    }
    offset = next;
  }
  if (open !== null) hunks.push({ from: open, to: text.length });
  return hunks;
}

/**
 * Locate the managed region. Returns null when no marker is present.
 *
 * With unresolved merge-conflict markers the region spans from the first START
 * to the last END marker, widened to whole conflict hunks, so that both sides
 * of a conflict inside the region are replaced together. Conflict markers
 * outside the region are an error: the user text there needs a human decision.
 */
function locateBlock(text, start, end, label) {
  const hasStart = text.includes(start);
  const hasEnd = text.includes(end);
  if (!hasStart && !hasEnd) return null;

  if (hasConflictMarkers(text)) {
    const first = text.indexOf(start);
    const last = text.lastIndexOf(end);
    if (first === -1 || last === -1 || last < first) {
      throw new Error(`Unresolved merge conflict in ${label}; resolve it, then export again.`);
    }
    let from = first;
    let to = last + end.length;
    const hunks = conflictHunks(text);
    // Mask each complete managed block without changing character offsets.
    // Widening to a whole conflict is safe only if it contains no user text.
    const escape = marker => marker.replace(/[$.*+?^{}()|[\]\\]/g, '\\$&');
    const unmanaged = text.replace(new RegExp(escape(start) + '[\\s\\S]*?' + escape(end), 'g'),
      block => ' '.repeat(block.length));
    for (const hunk of hunks) {
      const outside = unmanaged.slice(hunk.from, hunk.to)
        .replace(/^(?:<{7}(?: .*)?|={7}|>{7}(?: .*)?|\|{7}(?: .*)?)\r?$/gm, '');
      if (outside.trim()) {
        throw new Error('Unresolved merge conflict outside the ContextOS block in ' + label + '; resolve it, then export again.');
      }
      if (hunk.from <= from && from < hunk.to) from = hunk.from;
      if (hunk.from < to && to <= hunk.to) to = hunk.to;
    }
    for (const hunk of hunks) {
      if (hunk.from < from || hunk.to > to) {
        throw new Error(`Unresolved merge conflict outside the ContextOS block in ${label}; resolve it, then export again.`);
      }
    }
    return { from, to, conflicted: true };
  }

  const startCount = text.split(start).length - 1;
  const endCount = text.split(end).length - 1;
  if (startCount !== 1 || endCount !== 1 || text.indexOf(end) < text.indexOf(start)) {
    throw new Error(`Malformed ContextOS block in ${label}; refusing to overwrite.`);
  }
  return { from: text.indexOf(start), to: text.indexOf(end) + end.length, conflicted: false };
}

/**
 * Replace the managed block. Returns null when the text has no block yet, so
 * the caller can decide how to append one.
 */
function replaceManagedBlock(text, block, start, end, label) {
  const region = locateBlock(text, start, end, label);
  if (!region) return null;
  const tail = text.slice(region.to);
  // A widened conflict region swallows the newline that ended its last marker line.
  const keepNewline = region.conflicted && text[region.to - 1] === '\n';
  return text.slice(0, region.from) + block + (keepNewline ? '\n' : '') + tail;
}

/**
 * Remove the managed block together with the blank lines it introduced.
 * Returns the remaining text and whether a block was found.
 */
function removeManagedBlock(text, start, end, label = 'file') {
  const region = locateBlock(text, start, end, label);
  if (!region) return { content: text, found: false };
  const before = text.slice(0, region.from).replace(/\s+$/, '');
  const after = text.slice(region.to).replace(/^\s+/, '');
  let content = before && after ? `${before}\n\n${after}` : (before || after);
  if (content && !content.endsWith('\n')) content += '\n';
  return { content, found: true };
}

/** The generated region including its markers, or null when the text has none. */
function extractManagedBlock(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (from === -1 || to === -1 || to < from) return null;
  return text.slice(from, to + end.length);
}

module.exports = {
  CONTEXTOS_BLOCK_START,
  CONTEXTOS_BLOCK_END,
  extractManagedBlock,
  hasConflictMarkers,
  replaceManagedBlock,
  removeManagedBlock,
};
