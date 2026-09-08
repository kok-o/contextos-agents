/**
 * Thread cache — caches thread results by (task, files, agent) hash.
 *
 * Slate's "subthread reuse" optimization: when the orchestrator spawns
 * an identical thread (same task + same files + same agent), return the
 * cached result instead of re-running the agent. Saves cost and time.
 *
 * Two modes:
 *   1. Session-scoped (default): in-memory Map, cleared on exit.
 *   2. Disk-persistent: reads/writes JSON files in a cache directory,
 *      with TTL-based expiry so stale entries don't accumulate.
 *
 * Cache keys are SHA-256 hashes of normalized (task, files, agent, model).
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { CompressedResult } from "../core/types.js";

export interface ThreadCacheEntry {
	result: CompressedResult;
	cachedAt: number;
	hitCount: number;
	fileHashes?: Record<string, string>;
	commitSha?: string;
}

/** On-disk format for persistent cache entries. */
interface DiskCacheEntry {
	key: string;
	result: CompressedResult;
	cachedAt: number;
	fileHashes?: Record<string, string>;
	commitSha?: string;
}

/** Compute SHA-256 hash of a file on disk. Returns empty string if file does not exist. */
export function computeFileHash(filePath: string): string {
	try {
		if (!fs.existsSync(filePath)) return "";
		const buffer = fs.readFileSync(filePath);
		return createHash("sha256").update(buffer).digest("hex");
	} catch {
		return "";
	}
}

/** Compute file hashes for a list of context files inside repoRoot. */
export function computeContextHashes(repoRoot: string, files: string[]): Record<string, string> {
	const hashes: Record<string, string> = {};
	for (const file of files) {
		const absPath = path.isAbsolute(file) ? file : path.join(repoRoot, file);
		hashes[file] = computeFileHash(absPath);
	}
	return hashes;
}

export interface ThreadCacheStats {
	size: number;
	hits: number;
	misses: number;
	totalSavedMs: number;
	totalSavedUsd: number;
	persistedEntries: number;
}

/**
 * Compute a stable cache key from thread parameters.
 * Normalizes inputs: trims task, sorts files, lowercases agent/model.
 */
function computeCacheKey(
	task: string,
	files: string[],
	agent: string,
	model: string,
	repoRoot: string = "",
	commitSha: string = "",
): string {
	const normalized = JSON.stringify({
		task: task.trim(),
		files: [...files].sort(),
		agent: agent.toLowerCase(),
		model: model.toLowerCase(),
		repo: repoRoot.trim().toLowerCase(),
		commit: commitSha.trim(),
	});
	return createHash("sha256").update(normalized).digest("hex");
}

export class ThreadCache {
	private cache: Map<string, ThreadCacheEntry> = new Map();
	private hits: number = 0;
	private misses: number = 0;
	private totalSavedMs: number = 0;
	private totalSavedUsd: number = 0;
	private maxEntries: number;
	private persistDir?: string;
	private ttlMs: number;
	private persistedKeys: Set<string> = new Set();

	constructor(maxEntries: number = 100, persistDir?: string, ttlHours: number = 24) {
		this.maxEntries = maxEntries;
		this.persistDir = persistDir;
		this.ttlMs = ttlHours * 60 * 60 * 1000;
	}

	/** Initialize persistent cache — load entries from disk. */
	async init(): Promise<void> {
		if (!this.persistDir) return;

		fs.mkdirSync(this.persistDir, { recursive: true });

		let files: string[];
		try {
			files = fs.readdirSync(this.persistDir).filter((f) => f.endsWith(".json"));
		} catch {
			return;
		}

		const now = Date.now();
		for (const file of files) {
			try {
				const filePath = path.join(this.persistDir, file);
				const raw = fs.readFileSync(filePath, "utf-8");
				const entry: DiskCacheEntry = JSON.parse(raw);

				// Skip expired entries
				if (now - entry.cachedAt > this.ttlMs) {
					fs.unlinkSync(filePath);
					continue;
				}

				// Only load successful results
				if (!entry.result.success) {
					fs.unlinkSync(filePath);
					continue;
				}

				this.cache.set(entry.key, {
					result: entry.result,
					cachedAt: entry.cachedAt,
					hitCount: 0,
					fileHashes: entry.fileHashes,
					commitSha: entry.commitSha,
				});
				this.persistedKeys.add(entry.key);
			} catch {
				// Skip corrupt files
			}
		}

		// Trim to max capacity
		while (this.cache.size > this.maxEntries) {
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey !== undefined) {
				this.cache.delete(oldestKey);
				this.deleteDiskEntry(oldestKey);
			}
		}
	}

	/**
	 * Look up a cached result for the given thread parameters.
	 * Returns undefined on cache miss or if context files drifted.
	 */
	get(
		task: string,
		files: string[],
		agent: string,
		model: string,
		repoRoot: string = "",
		commitSha: string = "",
	): CompressedResult | undefined {
		const key = computeCacheKey(task, files, agent, model, repoRoot, commitSha);
		const entry = this.cache.get(key);

		if (!entry) {
			this.misses++;
			return undefined;
		}

		// Check TTL expiry
		if (Date.now() - entry.cachedAt > this.ttlMs) {
			this.cache.delete(key);
			this.deleteDiskEntry(key);
			this.misses++;
			return undefined;
		}

		// Only return successful cached results
		if (!entry.result.success) {
			this.misses++;
			return undefined;
		}

		// Task 2.5e: Context hash verification
		// If context files were recorded, verify that their contents on disk have not drifted
		if (repoRoot && entry.fileHashes && Object.keys(entry.fileHashes).length > 0) {
			for (const [file, recordedHash] of Object.entries(entry.fileHashes)) {
				const absPath = path.isAbsolute(file) ? file : path.join(repoRoot, file);
				const currentHash = computeFileHash(absPath);
				if (currentHash !== recordedHash) {
					// Stale cache hit with drifted context files -> invalidate and miss
					this.cache.delete(key);
					this.deleteDiskEntry(key);
					this.misses++;
					return undefined;
				}
			}
		}

		this.hits++;
		entry.hitCount++;
		this.totalSavedMs += entry.result.durationMs;
		this.totalSavedUsd += entry.result.estimatedCostUsd;

		return entry.result;
	}

	/**
	 * Store a thread result in the cache.
	 * Only caches successful results — failed threads should be retried.
	 */
	set(
		task: string,
		files: string[],
		agent: string,
		model: string,
		result: CompressedResult,
		repoRoot: string = "",
		commitSha: string = "",
	): void {
		// Don't cache failures
		if (!result.success) return;

		// Evict oldest entry if at capacity
		if (this.cache.size >= this.maxEntries) {
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey !== undefined) {
				this.cache.delete(oldestKey);
				this.deleteDiskEntry(oldestKey);
			}
		}

		const key = computeCacheKey(task, files, agent, model, repoRoot, commitSha);
		const now = Date.now();
		const fileHashes = repoRoot && files.length > 0 ? computeContextHashes(repoRoot, files) : undefined;

		this.cache.set(key, {
			result,
			cachedAt: now,
			hitCount: 0,
			fileHashes,
			commitSha,
		});

		// Persist to disk
		this.saveDiskEntry(key, result, now, fileHashes, commitSha);
	}

	/** Get cache statistics. */
	getStats(): ThreadCacheStats {
		return {
			size: this.cache.size,
			hits: this.hits,
			misses: this.misses,
			totalSavedMs: this.totalSavedMs,
			totalSavedUsd: this.totalSavedUsd,
			persistedEntries: this.persistedKeys.size,
		};
	}

	/** Clear all cached entries (in-memory and on disk). */
	clear(): void {
		if (this.persistDir) {
			for (const key of this.cache.keys()) {
				this.deleteDiskEntry(key);
			}
		}
		this.cache.clear();
	}

	// ── Disk persistence ──────────────────────────────────────────────────

	private saveDiskEntry(
		key: string,
		result: CompressedResult,
		cachedAt: number,
		fileHashes?: Record<string, string>,
		commitSha?: string,
	): void {
		if (!this.persistDir) return;
		try {
			const entry: DiskCacheEntry = { key, result, cachedAt, fileHashes, commitSha };
			const filePath = path.join(this.persistDir, `${key}.json`);
			fs.writeFileSync(filePath, JSON.stringify(entry), "utf-8");
			this.persistedKeys.add(key);
		} catch {
			// Non-fatal
		}
	}

	private deleteDiskEntry(key: string): void {
		if (!this.persistDir) return;
		try {
			const filePath = path.join(this.persistDir, `${key}.json`);
			if (fs.existsSync(filePath)) {
				fs.unlinkSync(filePath);
				this.persistedKeys.delete(key);
			}
		} catch {
			// Non-fatal
		}
	}
}
