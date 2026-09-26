/**
 * bin/lib/git-snapshot.js
 * ContextOS Git Index Snapshot & Staged Blob Reader
 *
 * Inspects staged changes directly from the Git index without modifying
 * the working directory. Safely handles NUL-delimited filenames, Unicode,
 * binary files, and path spaces.
 */

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Finds the top-level repository root via Git.
 *
 * @param {string} [cwd=process.cwd()] - Working directory
 * @returns {string|null} Absolute repository root or null if not a Git repository
 */
function findGitRoot(cwd = process.cwd()) {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return path.resolve(root.trim());
  } catch {
    return null;
  }
}

/**
 * Discovers the git hooks directory, respecting core.hooksPath if set.
 *
 * @param {string} [cwd=process.cwd()] - Working directory
 * @returns {string|null} Absolute path to hooks directory or null
 */
function findHooksDir(cwd = process.cwd()) {
  try {
    const gitDir = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return path.resolve(cwd, gitDir);
  } catch {
    return null;
  }
}

/**
 * Retrieves the list of staged files from the Git index.
 * Uses NUL-delimited output (-z) to support spaces, Unicode, and escapes.
 *
 * @param {string} [cwd=process.cwd()] - Working directory
 * @returns {Array<{ status: string, path: string, oldPath?: string }>} Staged entries
 */
function getStagedFiles(cwd = process.cwd()) {
  try {
    const output = execFileSync(
      'git',
      ['diff', '--cached', '-z', '--name-status'],
      { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    if (!output) return [];

    const parts = output.split('\0');
    const entries = [];

    let i = 0;
    while (i < parts.length) {
      const statusRaw = parts[i];
      if (!statusRaw) {
        i++;
        continue;
      }

      const status = statusRaw[0];
      if (status === 'R' || status === 'C') {
        // Rename or copy includes old path followed by new path
        const oldPath = parts[i + 1];
        const newPath = parts[i + 2];
        if (newPath) {
          entries.push({ status, path: newPath, oldPath });
        }
        i += 3;
      } else {
        const filePath = parts[i + 1];
        if (filePath) {
          entries.push({ status, path: filePath });
        }
        i += 2;
      }
    }

    return entries;
  } catch (err) {
    throw new Error(`Failed to query staged files from Git: ${err.message}`);
  }
}

/**
 * Reads the content of a file directly from the Git staged index.
 *
 * @param {string} relativePath - Path relative to repo root
 * @param {string} [cwd=process.cwd()] - Working directory
 * @returns {Buffer|null} Staged file buffer or null if deleted/missing
 */
function getStagedBlob(relativePath, cwd = process.cwd()) {
  try {
    const posixPath = relativePath.replace(/\\/g, '/');
    const buf = execFileSync('git', ['show', `:${posixPath}`], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
    return buf;
  } catch (err) {
    // If file was deleted or unreadable in index, return null
    return null;
  }
}

/**
 * Extracts added lines from git diff --cached -U0 for each staged file.
 * Returns only lines that were added (+), excluding diff headers and deleted lines (-).
 *
 * @param {string} [cwd=process.cwd()] - Working directory
 * @returns {Map<string, Array<{ line: number, content: string }>>} Added lines by file
 */
function getStagedAddedLines(cwd = process.cwd()) {
  const addedLinesByFile = new Map();

  try {
    const diffOutput = execFileSync('git', ['diff', '--cached', '-U0'], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });

    if (!diffOutput) return addedLinesByFile;

    const lines = diffOutput.split(/\r?\n/);
    let currentFile = null;
    let currentLineNum = 0;

    for (const line of lines) {
      if (line.startsWith('+++ b/')) {
        currentFile = line.slice(6).trim();
        if (!addedLinesByFile.has(currentFile)) {
          addedLinesByFile.set(currentFile, []);
        }
      } else if (line.startsWith('@@ ')) {
        // Parse @@ -a,b +c,d @@ to get current target line number
        const match = line.match(/\+([0-9]+)(?:,([0-9]+))?/);
        if (match) {
          currentLineNum = parseInt(match[1], 10);
        }
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        if (currentFile) {
          const content = line.slice(1);
          addedLinesByFile.get(currentFile).push({
            line: currentLineNum,
            content,
          });
        }
        currentLineNum++;
      }
    }

    return addedLinesByFile;
  } catch {
    return addedLinesByFile;
  }
}

module.exports = {
  findGitRoot,
  findHooksDir,
  getStagedFiles,
  getStagedBlob,
  getStagedAddedLines,
};
