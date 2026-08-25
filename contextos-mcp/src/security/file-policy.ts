/**
 * File Policy — restricts agent file access to the worktree boundary.
 *
 * Prevents agents from reading/writing files outside their designated
 * worktree directory. Also blocks access to .git/ internals.
 */

import * as path from "node:path";

/** Directories that agents must NEVER access, even within a worktree. */
const FORBIDDEN_DIRS: string[] = [
	".git",
	"node_modules", // Too large, not useful for agents
];

/**
 * Validate that a file path is within the allowed worktree boundary.
 *
 * @param filePath - The path to validate (absolute or relative)
 * @param worktreeRoot - The worktree root directory (absolute)
 * @returns true if access is ALLOWED
 */
export function isPathAllowed(filePath: string, worktreeRoot: string): boolean {
	const absPath = path.isAbsolute(filePath) ? filePath : path.join(worktreeRoot, filePath);
	const normalizedPath = path.normalize(absPath);
	const normalizedRoot = path.normalize(worktreeRoot);

	// Must be within worktree root
	if (!normalizedPath.startsWith(normalizedRoot)) {
		return false;
	}

	// Check for forbidden directories in the relative path
	const relativePath = path.relative(normalizedRoot, normalizedPath);
	const segments = relativePath.split(path.sep);

	for (const segment of segments) {
		if (FORBIDDEN_DIRS.includes(segment)) {
			return false;
		}
	}

	return true;
}

/**
 * Sanitize a list of file paths, removing any that violate the file policy.
 *
 * @param filePaths - List of file paths to filter
 * @param worktreeRoot - The worktree root directory
 * @returns Filtered list containing only allowed paths
 */
export function filterAllowedPaths(filePaths: string[], worktreeRoot: string): string[] {
	return filePaths.filter((fp) => {
		const allowed = isPathAllowed(fp, worktreeRoot);
		if (!allowed) {
			process.stderr.write(`[file-policy] Blocked path: ${fp}\n`);
		}
		return allowed;
	});
}
