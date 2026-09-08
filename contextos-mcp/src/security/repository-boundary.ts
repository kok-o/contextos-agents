/**
 * Repository boundary enforcement with nearest-parent realpath resolution.
 *
 * Prevents arbitrary file reads/writes, path traversals (../),
 * sibling-prefix escapes (e.g. /repo-sibling attempting to match /repo),
 * UNC paths, null bytes, and symlink/junction escapes.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export class SecurityBoundaryException extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SecurityBoundaryException";
	}
}

function normalizeForComparison(p: string): string {
	const normalized = path.normalize(p);
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isUncPath(p: string): boolean {
	return p.startsWith("\\\\") || p.startsWith("//");
}

/**
 * Checks whether targetPath is contained within repoRoot.
 */
export function isWithinRepository(targetPath: string, repoRoot: string): boolean {
	try {
		assertWithinRepository(targetPath, repoRoot);
		return true;
	} catch {
		return false;
	}
}

/**
 * Asserts that targetPath is strictly within repoRoot.
 *
 * If valid, returns the canonical resolved path.
 * If targetPath or repoRoot escapes boundaries, throws SecurityBoundaryException.
 */
export function assertWithinRepository(targetPath: string, repoRoot: string): string {
	if (!targetPath || typeof targetPath !== "string") {
		throw new SecurityBoundaryException("Target path must be a non-empty string");
	}
	if (!repoRoot || typeof repoRoot !== "string") {
		throw new SecurityBoundaryException("Repository root must be a non-empty string");
	}

	if (targetPath.includes("\0") || repoRoot.includes("\0")) {
		throw new SecurityBoundaryException("Path contains null bytes");
	}

	if (isUncPath(targetPath) || isUncPath(repoRoot)) {
		throw new SecurityBoundaryException("UNC network paths are not permitted");
	}

	let canonicalRepoRoot: string;
	try {
		const absRepoRoot = path.resolve(repoRoot);
		if (!fs.existsSync(absRepoRoot)) {
			throw new SecurityBoundaryException(`Repository root does not exist: ${repoRoot}`);
		}
		canonicalRepoRoot = fs.realpathSync(absRepoRoot);
	} catch (err: unknown) {
		if (err instanceof SecurityBoundaryException) throw err;
		const msg = err instanceof Error ? err.message : String(err);
		throw new SecurityBoundaryException(`Failed to resolve repository root: ${msg}`);
	}

	// Resolve target relative to canonicalRepoRoot if relative
	const absoluteTarget = path.isAbsolute(targetPath)
		? path.resolve(targetPath)
		: path.resolve(canonicalRepoRoot, targetPath);

	let canonicalTarget: string;

	if (fs.existsSync(absoluteTarget)) {
		try {
			canonicalTarget = fs.realpathSync(absoluteTarget);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			throw new SecurityBoundaryException(`Failed to resolve path: ${msg}`);
		}
	} else {
		// Target does not exist yet: find nearest existing parent directory
		let current = path.dirname(absoluteTarget);
		const uncreatedSegments: string[] = [path.basename(absoluteTarget)];

		while (!fs.existsSync(current)) {
			const parent = path.dirname(current);
			if (parent === current) {
				throw new SecurityBoundaryException(`Cannot resolve parent directory for: ${targetPath}`);
			}
			uncreatedSegments.unshift(path.basename(current));
			current = parent;
		}

		try {
			const resolvedParent = fs.realpathSync(current);
			const normParent = normalizeForComparison(resolvedParent);
			const normRoot = normalizeForComparison(canonicalRepoRoot);
			const rootPrefix = normRoot.endsWith(path.sep) ? normRoot : normRoot + path.sep;

			if (normParent !== normRoot && !normParent.startsWith(rootPrefix)) {
				throw new SecurityBoundaryException(
					`Parent directory ${resolvedParent} escapes repository boundary: ${canonicalRepoRoot}`,
				);
			}

			canonicalTarget = path.join(resolvedParent, ...uncreatedSegments);
		} catch (err: unknown) {
			if (err instanceof SecurityBoundaryException) throw err;
			const msg = err instanceof Error ? err.message : String(err);
			throw new SecurityBoundaryException(`Failed to resolve parent directory: ${msg}`);
		}
	}

	const normTarget = normalizeForComparison(canonicalTarget);
	const normRoot = normalizeForComparison(canonicalRepoRoot);
	const rootPrefix = normRoot.endsWith(path.sep) ? normRoot : normRoot + path.sep;

	if (normTarget !== normRoot && !normTarget.startsWith(rootPrefix)) {
		throw new SecurityBoundaryException(
			`Path "${targetPath}" resolves to "${canonicalTarget}" which is outside repository "${canonicalRepoRoot}"`,
		);
	}

	return canonicalTarget;
}
