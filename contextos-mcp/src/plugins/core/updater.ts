/**
 * ContextOS Atomic Plugin Updater & Local Modification Protection
 * Section 20.7 & Threat Model Hardening
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { calculateTreeDigest } from "./digest.js";
import { type AtomicUpdateOptions, type AtomicUpdateResult, THREAT_CODES } from "./types.js";

export class AtomicPluginUpdater {
	/**
	 * Checks if local plugin has been modified since it was installed/recorded in lockfile.
	 */
	static isModifiedLocally(pluginDir: string, expectedTreeDigest: string): boolean {
		if (!fs.existsSync(pluginDir)) return false;
		const current = calculateTreeDigest(pluginDir);
		return current.treeDigest !== expectedTreeDigest;
	}

	/**
	 * Atomically installs or updates a plugin directory with rollback.
	 * Rejects updates when local uncommitted user modifications exist unless forced.
	 */
	static applyUpdate(targetDir: string, stagedDir: string, options: AtomicUpdateOptions = {}): AtomicUpdateResult {
		const { expectedOldTreeDigest, force = false } = options;
		const resolvedTarget = path.resolve(targetDir);
		const resolvedStaged = path.resolve(stagedDir);

		if (fs.existsSync(resolvedTarget) && expectedOldTreeDigest && !force) {
			if (AtomicPluginUpdater.isModifiedLocally(resolvedTarget, expectedOldTreeDigest)) {
				const err = new Error(
					`Plugin in "${resolvedTarget}" has local modifications. Update aborted to prevent overwriting user changes. Pass --force to overwrite.`,
				) as Error & { code: string };
				err.code = THREAT_CODES.MODIFIED_LOCALLY;
				throw err;
			}
		}

		const backupDir = `${resolvedTarget}.bak-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		let hasBackup = false;

		try {
			if (fs.existsSync(resolvedTarget)) {
				fs.renameSync(resolvedTarget, backupDir);
				hasBackup = true;
			}

			fs.renameSync(resolvedStaged, resolvedTarget);

			// Verify new directory digest
			const digest = calculateTreeDigest(resolvedTarget);

			// Clean up backup upon success
			if (hasBackup) {
				fs.rmSync(backupDir, { recursive: true, force: true });
			}

			return { success: true, treeDigest: digest.treeDigest };
		} catch (err) {
			// Rollback on failure
			if (hasBackup && !fs.existsSync(resolvedTarget)) {
				try {
					fs.renameSync(backupDir, resolvedTarget);
				} catch {
					// Ignore rollback rename failure to preserve original error
				}
			}
			throw err;
		}
	}
}
