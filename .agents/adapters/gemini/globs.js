'use strict';
const path = require('node:path');

const MAX_PATTERNS = 128;
const escapeLiteral = value => value.replace(/[\\*?\[\]{}]/g, '\\$&');

// The client splits on every comma, including commas inside {a,b} or [a,b].
// Expand nested alternatives before serialization, with a bound on fan-out.
function expandAlternatives(pattern) {
  if (pattern.length > 4096) throw new Error('Antigravity glob exceeds 4096 characters');
  const pending = [pattern], result = [];
  while (pending.length) {
    const current = pending.pop();
    let start = -1, depth = 0, inClass = false, end = -1, last = 0;
    const alternatives = [];
    for (let i = 0; i < current.length; i++) {
      const ch = current[i];
      if (ch === '\\') { i++; continue; }
      if (ch === '[') inClass = true;
      if (ch === ']') inClass = false;
      if (inClass) continue;
      if (ch === '{') {
        if (depth++ === 0) { start = i; last = i + 1; }
      } else if (ch === '}') {
        if (!depth) throw new Error(`Antigravity glob has unmatched braces: ${pattern}`);
        if (--depth === 0) { alternatives.push(current.slice(last, i)); end = i; break; }
      } else if (ch === ',' && depth === 1) {
        alternatives.push(current.slice(last, i)); last = i + 1;
      }
    }
    if (depth) throw new Error(`Antigravity glob has unmatched braces: ${pattern}`);
    if (start < 0) {
      if (!current.trim()) throw new Error('Antigravity glob expansion contains an empty pattern');
      if (current.includes(',')) throw new Error('Antigravity globs cannot represent a literal comma');
      result.push(current);
    } else {
      for (const alternative of alternatives.reverse()) pending.push(current.slice(0, start) + alternative + current.slice(end + 1));
    }
    if (pending.length + result.length > MAX_PATTERNS) throw new Error(`Antigravity glob expansion exceeds ${MAX_PATTERNS} patterns`);
  }
  return result;
}

// Match treats '\\' as an ordinary character. A single-character wildcard
// must explicitly exclude it; an unconstrained '*' cannot preserve depth.
function finiteComponent(component) {
  let output = '';
  for (let i = 0; i < component.length; i++) {
    const ch = component[i];
    if (ch === '?') output += '[^\\\\]';
    else if (ch === '[') {
      const end = component.indexOf(']', i + 1);
      if (end < 0) return null;
      const content = component.slice(i + 1, end);
      if (!content) return null;
      const negated = content[0] === '!' || content[0] === '^';
      if (!negated) {
        for (let j = 1; j < content.length - 1; j++) {
          if (content[j] === '-' && content.charCodeAt(j - 1) <= 92 && content.charCodeAt(j + 1) >= 92) return null;
        }
      }
      output += `[${content}${negated ? '\\\\' : ''}]`;
      i = end;
    } else if ('*\\{},'.includes(ch)) return null;
    else output += ch;
  }
  return output;
}

function windowsVariants(glob, projectRoot) {
  if (glob.includes('\\') || path.win32.isAbsolute(glob)) return [];
  const parts = glob.replace(/^\.\//, '').split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) return [];
  let prefix = escapeLiteral(path.win32.normalize(projectRoot).replace(/\\$/, ''));
  prefix = prefix.replace(/^([a-z]):/i, (_, drive) => `[${drive.toLowerCase()}${drive.toUpperCase()}]:`);
  let variants = [prefix + '\\\\'];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i], leaf = i === parts.length - 1;
    // **/*[finite suffix] is recursively scoped already, so a native '*'
    // may consume separators without widening this particular scope.
    if (part === '**' && i === parts.length - 2 && parts[i + 1].startsWith('*')) {
      const suffix = finiteComponent(parts[i + 1].slice(1));
      if (suffix !== null) return variants.map(value => value + '*' + suffix);
    }
    if (part === '**' && !leaf) {
      variants = variants.flatMap(value => [value, value + '*\\\\']);
    } else {
      const finite = finiteComponent(part);
      if (finite === null) return [];
      variants = variants.map(value => value + finite + (leaf ? '' : '\\\\'));
    }
    if (variants.length > MAX_PATTERNS) throw new Error(`Antigravity glob expansion exceeds ${MAX_PATTERNS} patterns`);
  }
  return variants;
}

function antigravityGlobs(globs, projectRoot) {
  if (globs.length > MAX_PATTERNS) throw new Error(`Antigravity glob expansion exceeds ${MAX_PATTERNS} patterns`);
  const expanded = globs.flatMap(expandAlternatives);
  const native = [], portable = [];
  const windows = /^[a-z]:[\\/]/i.test(projectRoot) && !projectRoot.includes(',');
  for (const glob of expanded) {
    const variants = windows ? windowsVariants(glob, projectRoot) : [];
    native.push(...variants);
    // The retained portable form is evaluated too. In a global **/*? or
    // **/*[!x] pattern, an unguarded character could consume a backslash
    // before an empty basename, even if the added native form is correct.
    portable.push(variants.length ? glob.split('/').map(part => {
      if (part === '**' || part === '*') return part;
      if (part.startsWith('*')) {
        const suffix = finiteComponent(part.slice(1));
        if (suffix !== null) return '*' + suffix;
      }
      return finiteComponent(part) ?? part;
    }).join('/') : glob);
  }
  const result = [...new Set([...portable, ...native])];
  if (result.length > MAX_PATTERNS) throw new Error(`Antigravity glob expansion exceeds ${MAX_PATTERNS} patterns`);
  if (Buffer.byteLength(result.join(', ')) > 16000) throw new Error('Antigravity glob field exceeds 16000 bytes');
  return result;
}

// For these Windows file patterns, enumerate the finite number of possible
// filename lengths. Unlike '*', each character cannot consume a separator.
// NTFS supports at most 255 UTF-16 code units in a filename component.
function boundedWindowsGlobs(globs, projectRoot) {
  if (!/^[a-z]:[\\/]/i.test(projectRoot)) return [];
  const result = new Set();
  for (const source of globs.flatMap(expandAlternatives)) {
    if (source.includes('\\') || path.win32.isAbsolute(source)) continue;
    const parts = source.replace(/^\.\//, '').split('/');
    if (parts.length < 2 || parts.some(p => !p || p === '.' || p === '..')) continue;
    const leaf = parts.pop();
    const match = /^([^*?\[\]{},\\]*)\*([^*?\[\]{},\\]*)$/.exec(leaf);
    if (!match) continue;
    const recursive = parts.at(-1) === '**';
    if (recursive) parts.pop();
    if (!parts.length || parts.some(p => /[*?\[\]{},\\]/.test(p))) continue;
    // The existing compact translation already represents recursive *suffix.
    if (recursive && !match[1] && windowsVariants(source, projectRoot).length) continue;
    if (projectRoot.includes(',')) throw new Error('Antigravity bounded Windows globs cannot represent a comma in the workspace path');
    const maxLength = 255 - match[1].length - match[2].length;
    if (maxLength < 0) throw new Error(`Antigravity glob filename literals exceed the NTFS component limit: ${source}`);
    let prefix = escapeLiteral(path.win32.join(projectRoot, ...parts));
    prefix = prefix.replace(/^([a-z]):/i, (_, drive) => `[${drive.toLowerCase()}${drive.toUpperCase()}]:`);
    const base = `${prefix}\\\\`, before = escapeLiteral(match[1]), after = escapeLiteral(match[2]);
    for (let length = 0; length <= maxLength; length++) {
      const filename = before + '[^\\\\]'.repeat(length) + after;
      result.add(base + filename);
      if (recursive) result.add(base + '*\\\\' + filename);
      if (result.size > 2048) throw new Error('Antigravity bounded Windows glob expansion exceeds 2048 patterns');
    }
  }
  return [...result];
}

module.exports = { antigravityGlobs, boundedWindowsGlobs };
