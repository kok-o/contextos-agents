/**
 * ContextOS Plugin Full-Tree Digest Calculation
 * Section 20.3 & Threat Model Hardening
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { TreeDigestOptions, TreeDigestResult, TreeFileEntry } from "./types.js";

export function sha256(data: Buffer | string): string {
	return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Calculates a deterministic full-tree digest for a directory.
 * Includes file modes, types (files, symlinks), sizes, and content digests.
 */
export function calculateTreeDigest(dirPath: string, _options: TreeDigestOptions = {}): TreeDigestResult {
	const resolvedDir = path.resolve(dirPath);
	if (!fs.existsSync(resolvedDir)) {
		throw new Error(`Directory does not exist: ${resolvedDir}`);
	}

	const fileEntries: TreeFileEntry[] = [];

	function walk(current: string): void {
		const items = fs.readdirSync(current, { withFileTypes: true });
		// Deterministic alphabetical sorting
		items.sort((a, b) => a.name.localeCompare(b.name));

		for (const item of items) {
			const fullPath = path.join(current, item.name);
			if (item.isDirectory()) {
				walk(fullPath);
			} else if (item.isSymbolicLink()) {
				const rel = path.relative(resolvedDir, fullPath).replace(/\\/g, "/");
				const stat = fs.lstatSync(fullPath);
				const linkTarget = fs.readlinkSync(fullPath);
				const hash = sha256(linkTarget);

				fileEntries.push({
					relativePath: rel,
					size: stat.size,
					mode: stat.mode & 0o777,
					sha256: hash,
					type: "symlink",
				});
			} else if (item.isFile()) {
				const rel = path.relative(resolvedDir, fullPath).replace(/\\/g, "/");
				const stat = fs.statSync(fullPath);
				const content = fs.readFileSync(fullPath);
				const hash = sha256(content);

				fileEntries.push({
					relativePath: rel,
					size: stat.size,
					mode: stat.mode & 0o777,
					sha256: hash,
					type: "file",
				});
			}
		}
	}

	walk(resolvedDir);

	// Deterministically sort by relativePath
	fileEntries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

	const manifestString = fileEntries
		.map((f) => `${f.relativePath}|${f.size}|${f.mode}|${f.type}|${f.sha256}`)
		.join("\n");

	const treeDigest = sha256(manifestString);

	return {
		treeDigest,
		files: fileEntries,
	};
}
