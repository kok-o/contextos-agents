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
      ['-c', 'core.quotepath=false', 'diff', '--cached', '-z', '--name-status', '--no-ext-diff'],
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
 * Fails closed with an error if the staged blob cannot be read.
 *
 * @param {string} relativePath - Path relative to repo root
 * @param {string} [cwd=process.cwd()] - Working directory
 * @returns {Buffer} Staged file buffer
 */
function getStagedBlob(relativePath, cwd = process.cwd()) {
  const posixPath = relativePath.replace(/\\/g, '/');
  try {
    const buf = execFileSync(
      'git',
      ['--literal-pathspecs', 'show', `:${posixPath}`],
      {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024,
      }
    );
    return buf;
  } catch (err) {
    const errMsg = err.stderr ? err.stderr.toString('utf8').trim() : err.message;
    throw new Error(`Failed to read staged blob for "${posixPath}": ${errMsg}`);
  }
}

/**
 * Extracts added lines from git diff --cached -U0 for each staged file.
 * Returns only lines that were added (+), excluding diff headers and deleted lines (-).
 * Uses --literal-pathspecs, --no-ext-diff, and --no-textconv for strict path isolation.
 *
 * @param {string} [cwd=process.cwd()] - Working directory
 * @param {string[]} [files=null] - Optional list of staged file paths. If omitted, discovered via getStagedFiles.
 * @returns {Map<string, Array<{ line: number, content: string }>>} Added lines by file
 */
function getStagedAddedLines(cwd = process.cwd(), files = null) {
  const addedLinesByFile = new Map();

  let targetFiles = files;
  if (!targetFiles) {
    const staged = getStagedFiles(cwd);
    targetFiles = staged.filter(e => e.status !== 'D').map(e => e.path);
  }

  for (const filePath of targetFiles) {
    try {
      const posixPath = filePath.replace(/\\/g, '/');
      const diffOutput = execFileSync(
        'git',
        [
          '--literal-pathspecs',
          '-c', 'core.quotepath=false',
          'diff',
          '--cached',
          '-U0',
          '--no-ext-diff',
          '--no-textconv',
          '--',
          posixPath,
        ],
        {
          cwd,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
          maxBuffer: 10 * 1024 * 1024,
        }
      );

      if (!diffOutput) continue;

      const lines = diffOutput.split(/\r?\n/);
      let currentLineNum = 0;
      const fileAddedLines = [];

      for (const line of lines) {
        if (line.startsWith('@@ ')) {
          // Parse @@ -a,b +c,d @@ to get current target line number
          const match = line.match(/\+([0-9]+)(?:,([0-9]+))?/);
          if (match) {
            currentLineNum = parseInt(match[1], 10);
          }
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
          const content = line.slice(1);
          fileAddedLines.push({
            line: currentLineNum,
            content,
          });
          currentLineNum++;
        }
      }

      if (fileAddedLines.length > 0) {
        addedLinesByFile.set(filePath, fileAddedLines);
      }
    } catch (err) {
      throw new Error(`Failed to extract staged diff for "${filePath}": ${err.message}`);
    }
  }

  return addedLinesByFile;
}

module.exports = {
  findGitRoot,
  findHooksDir,
  getStagedFiles,
  getStagedBlob,
  getStagedAddedLines,
};
