/**
 * ContextOS MCP Plugin Loader
 * Typed orchestration layer connecting MCP to the canonical supply-chain core.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
	AtomicPluginUpdater,
	calculateTreeDigest,
	ScriptGrantManager,
	validateArchiveEntry,
	validatePluginPinning,
	verifyNpmTarballIntegrity,
} from "./core/index.js";
import type {
	ArchiveEntryLimits,
	ArchiveEntryType,
	ArchiveValidationResult,
	AtomicUpdateOptions,
	AtomicUpdateResult,
	AuthorizationResult,
	GrantOptions,
	PinningValidationOptions,
	PinningValidationResult,
	PluginSourceSpec,
	TreeDigestResult,
} from "./core/types.js";

export interface ArchiveManifestEntry {
	path: string;
	size?: number;
	compressedSize?: number;
	type?: ArchiveEntryType;
	linkTarget?: string;
}

export interface InstalledPluginRecord {
	name: string;
	ref: string;
	type: string;
	sha256?: string;
	treeDigest?: string;
	installedAt?: string;
	verified?: boolean;
}

export class PluginLoader {
	/**
	 * Validates a plugin source specification according to pinning rules.
	 */
	static validateSource(sourceSpec: PluginSourceSpec, options: PinningValidationOptions = {}): PinningValidationResult {
		return validatePluginPinning(sourceSpec, options);
	}

	/**
	 * Verifies tree integrity of an installed plugin directory against expected digest.
	 */
	static verifyPluginDigest(pluginDir: string, expectedTreeDigest: string): boolean {
		if (!fs.existsSync(pluginDir)) return false;
		const digest = calculateTreeDigest(pluginDir);
		return digest.treeDigest === expectedTreeDigest;
	}

	/**
	 * Calculates the deterministic tree digest of a plugin directory.
	 */
	static computeDigest(pluginDir: string): TreeDigestResult {
		return calculateTreeDigest(pluginDir);
	}

	/**
	 * Pre-scans a full archive manifest before extraction.
	 * Enforces traversal, symlink escapes, ratio bombs, and case collisions.
	 */
	static validateArchive(
		entries: ArchiveManifestEntry[],
		options: { maxFiles?: number; maxTotalBytes?: number; maxRatio?: number } = {},
	): ArchiveValidationResult {
		const seenPaths = new Set<string>();
		let currentTotalBytes = 0;

		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			const uncompressedSize = entry.size ?? 0;
			currentTotalBytes += uncompressedSize;

			const limits: ArchiveEntryLimits = {
				currentCount: i,
				maxFiles: options.maxFiles ?? 1000,
				currentTotalBytes,
				maxTotalBytes: options.maxTotalBytes ?? 50 * 1024 * 1024,
				uncompressedSize,
				compressedSize: entry.compressedSize,
				maxRatio: options.maxRatio ?? 100,
				seenPaths,
				linkTarget: entry.linkTarget,
				entryType: entry.type,
			};

			const result = validateArchiveEntry(entry.path, limits);
			if (!result.valid) {
				return result;
			}
		}

		return { valid: true };
	}

	/**
	 * Instantiates a ScriptGrantManager for a given grants file.
	 */
	static getGrantManager(grantsFilePath: string): ScriptGrantManager {
		return new ScriptGrantManager(grantsFilePath);
	}

	/**
	 * Verifies whether a plugin script is authorized.
	 */
	static checkScriptAuthorization(
		grantsFilePath: string,
		scriptPath: string,
		options: GrantOptions = {},
	): AuthorizationResult {
		const manager = new ScriptGrantManager(grantsFilePath);
		return manager.checkAuthorization(scriptPath, options);
	}

	/**
	 * Atomically updates a plugin directory with backup and rollback.
	 */
	static applyAtomicUpdate(
		targetDir: string,
		stagedDir: string,
		options: AtomicUpdateOptions = {},
	): AtomicUpdateResult {
		return AtomicPluginUpdater.applyUpdate(targetDir, stagedDir, options);
	}

	/**
	 * Loads installed plugins recorded in plugins.json and verifies their tree digests.
	 */
	static loadInstalledPlugins(agentsDir: string): InstalledPluginRecord[] {
		const pluginsJsonPath = path.join(agentsDir, "plugins.json");
		if (!fs.existsSync(pluginsJsonPath)) {
			return [];
		}

		try {
			const data = JSON.parse(fs.readFileSync(pluginsJsonPath, "utf8"));
			const plugins: InstalledPluginRecord[] = Array.isArray(data.plugins) ? data.plugins : [];

			return plugins.map((plugin) => {
				const pluginDir = path.join(agentsDir, "plugins", plugin.name);
				if (!plugin.treeDigest || !fs.existsSync(pluginDir)) {
					return { ...plugin, verified: false };
				}
				const isClean = PluginLoader.verifyPluginDigest(pluginDir, plugin.treeDigest);
				return { ...plugin, verified: isClean };
			});
		} catch {
			return [];
		}
	}

	/**
	 * Verifies npm package tarball integrity.
	 */
	static verifyNpmIntegrity(tarballBuffer: Buffer, expectedIntegrity: string): boolean {
		return verifyNpmTarballIntegrity(tarballBuffer, expectedIntegrity);
	}
}
