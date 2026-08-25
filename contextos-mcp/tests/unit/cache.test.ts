/**
 * Tests for ThreadCache — subthread result caching with TTL and disk persistence.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompressedResult } from "../../src/core/types.js";
import { ThreadCache } from "../../src/threads/cache.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<CompressedResult> = {}): CompressedResult {
	return {
		success: true,
		summary: "Did the thing",
		filesChanged: ["src/foo.ts"],
		diffStats: " 1 file changed, 10 insertions(+)",
		durationMs: 5000,
		estimatedCostUsd: 0.02,
		...overrides,
	};
}

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-cache-test-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			/* best effort */
		}
	}
	tempDirs = [];
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ThreadCache", () => {
	describe("get() on cache miss", () => {
		it("returns undefined and increments misses", () => {
			const cache = new ThreadCache();
			const result = cache.get("some task", ["file.ts"], "opencode", "sonnet");
			expect(result).toBeUndefined();

			const stats = cache.getStats();
			expect(stats.misses).toBe(1);
			expect(stats.hits).toBe(0);
		});
	});

	describe("set() then get()", () => {
		it("returns cached result and increments hits", () => {
			const cache = new ThreadCache();
			const mockResult = makeResult();

			cache.set("fix bug", ["src/auth.ts"], "opencode", "sonnet", mockResult);
			const cached = cache.get("fix bug", ["src/auth.ts"], "opencode", "sonnet");

			expect(cached).toBeDefined();
			expect(cached!.success).toBe(true);
			expect(cached!.summary).toBe("Did the thing");

			const stats = cache.getStats();
			expect(stats.hits).toBe(1);
			expect(stats.misses).toBe(0);
		});
	});

	describe("cache key normalization", () => {
		it("trims task whitespace", () => {
			const cache = new ThreadCache();
			cache.set("  fix bug  ", ["a.ts"], "opencode", "sonnet", makeResult());
			const cached = cache.get("fix bug", ["a.ts"], "opencode", "sonnet");
			expect(cached).toBeDefined();
		});

		it("sorts files for consistent keys", () => {
			const cache = new ThreadCache();
			cache.set("task", ["b.ts", "a.ts"], "opencode", "sonnet", makeResult());
			const cached = cache.get("task", ["a.ts", "b.ts"], "opencode", "sonnet");
			expect(cached).toBeDefined();
		});

		it("lowercases agent and model", () => {
			const cache = new ThreadCache();
			cache.set("task", ["a.ts"], "OpenCode", "Sonnet", makeResult());
			const cached = cache.get("task", ["a.ts"], "opencode", "sonnet");
			expect(cached).toBeDefined();
		});
	});

	describe("only successful results are cached", () => {
		it("ignores set() with success:false", () => {
			const cache = new ThreadCache();
			const failedResult = makeResult({ success: false });

			cache.set("task", ["a.ts"], "opencode", "sonnet", failedResult);

			const cached = cache.get("task", ["a.ts"], "opencode", "sonnet");
			expect(cached).toBeUndefined();
			expect(cache.getStats().size).toBe(0);
		});
	});

	describe("only successful results are returned", () => {
		it("returns undefined for a stored failed result", () => {
			const cache = new ThreadCache();
			// Store a successful result first, then overwrite internals to simulate
			// a failed result somehow being stored (edge case guard).
			const successResult = makeResult({ success: true });
			cache.set("task", ["a.ts"], "opencode", "sonnet", successResult);

			// Verify it exists
			expect(cache.get("task", ["a.ts"], "opencode", "sonnet")).toBeDefined();

			// The code actually prevents failed results from being stored via set(),
			// so this test confirms that the guard in set() works.
			const failedResult = makeResult({ success: false });
			cache.set("other task", ["b.ts"], "opencode", "sonnet", failedResult);
			expect(cache.get("other task", ["b.ts"], "opencode", "sonnet")).toBeUndefined();
		});
	});

	describe("TTL expiry", () => {
		it("expires entries after TTL elapses", () => {
			vi.useFakeTimers();
			try {
				// 0.001 hours = 3.6 seconds
				const cache = new ThreadCache(100, undefined, 0.001);
				cache.set("task", ["a.ts"], "opencode", "sonnet", makeResult());

				// Should still be present immediately
				expect(cache.get("task", ["a.ts"], "opencode", "sonnet")).toBeDefined();

				// Advance past TTL (3.6s)
				vi.advanceTimersByTime(4000);

				const cached = cache.get("task", ["a.ts"], "opencode", "sonnet");
				expect(cached).toBeUndefined();
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe("capacity eviction", () => {
		it("evicts oldest entry when maxEntries exceeded", () => {
			const cache = new ThreadCache(2);

			cache.set("task1", ["a.ts"], "opencode", "sonnet", makeResult({ summary: "result1" }));
			cache.set("task2", ["b.ts"], "opencode", "sonnet", makeResult({ summary: "result2" }));
			cache.set("task3", ["c.ts"], "opencode", "sonnet", makeResult({ summary: "result3" }));

			// Oldest (task1) should be evicted
			expect(cache.get("task1", ["a.ts"], "opencode", "sonnet")).toBeUndefined();
			// Newer entries should remain
			expect(cache.get("task2", ["b.ts"], "opencode", "sonnet")).toBeDefined();
			expect(cache.get("task3", ["c.ts"], "opencode", "sonnet")).toBeDefined();

			expect(cache.getStats().size).toBe(2);
		});
	});

	describe("stats tracking", () => {
		it("tracks hits, misses, saved time and cost", () => {
			const cache = new ThreadCache();
			const result = makeResult({ durationMs: 8000, estimatedCostUsd: 0.05 });

			cache.set("task", ["a.ts"], "opencode", "sonnet", result);

			// Miss
			cache.get("other", ["x.ts"], "opencode", "sonnet");
			// Hit
			cache.get("task", ["a.ts"], "opencode", "sonnet");
			// Another hit
			cache.get("task", ["a.ts"], "opencode", "sonnet");

			const stats = cache.getStats();
			expect(stats.hits).toBe(2);
			expect(stats.misses).toBe(1);
			expect(stats.totalSavedMs).toBe(16000); // 8000 * 2
			expect(stats.totalSavedUsd).toBeCloseTo(0.1); // 0.05 * 2
			expect(stats.size).toBe(1);
		});
	});

	describe("clear()", () => {
		it("empties the cache", () => {
			const cache = new ThreadCache();
			cache.set("task1", ["a.ts"], "opencode", "sonnet", makeResult());
			cache.set("task2", ["b.ts"], "opencode", "sonnet", makeResult());

			expect(cache.getStats().size).toBe(2);

			cache.clear();

			expect(cache.getStats().size).toBe(0);
			expect(cache.get("task1", ["a.ts"], "opencode", "sonnet")).toBeUndefined();
			expect(cache.get("task2", ["b.ts"], "opencode", "sonnet")).toBeUndefined();
		});
	});

	describe("disk persistence", () => {
		it("init() loads entries from disk", async () => {
			const dir = makeTempDir();

			// First cache: write to disk
			const cache1 = new ThreadCache(100, dir);
			await cache1.init();
			cache1.set("task", ["a.ts"], "opencode", "sonnet", makeResult({ summary: "persisted" }));

			// Second cache: load from disk
			const cache2 = new ThreadCache(100, dir);
			await cache2.init();

			const loaded = cache2.get("task", ["a.ts"], "opencode", "sonnet");
			expect(loaded).toBeDefined();
			expect(loaded!.summary).toBe("persisted");
		});

		it("set() writes JSON files to disk", async () => {
			const dir = makeTempDir();
			const cache = new ThreadCache(100, dir);
			await cache.init();

			cache.set("task", ["a.ts"], "opencode", "sonnet", makeResult());

			const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
			expect(files.length).toBe(1);

			const content = JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf-8"));
			expect(content.result.success).toBe(true);
			expect(content.key).toBeDefined();
			expect(content.cachedAt).toBeTypeOf("number");
		});

		it("clear() removes disk entries", async () => {
			const dir = makeTempDir();
			const cache = new ThreadCache(100, dir);
			await cache.init();

			cache.set("task1", ["a.ts"], "opencode", "sonnet", makeResult());
			cache.set("task2", ["b.ts"], "opencode", "sonnet", makeResult());

			const filesBefore = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
			expect(filesBefore.length).toBe(2);

			cache.clear();

			const filesAfter = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
			expect(filesAfter.length).toBe(0);
		});

		it("init() skips expired entries on disk", async () => {
			vi.useFakeTimers();
			try {
				const dir = makeTempDir();

				// Write with very short TTL
				const cache1 = new ThreadCache(100, dir, 0.001); // 3.6s
				await cache1.init();
				cache1.set("task", ["a.ts"], "opencode", "sonnet", makeResult());

				// Advance past TTL
				vi.advanceTimersByTime(4000);

				// New cache should NOT load the expired entry
				const cache2 = new ThreadCache(100, dir, 0.001);
				await cache2.init();

				const loaded = cache2.get("task", ["a.ts"], "opencode", "sonnet");
				expect(loaded).toBeUndefined();
			} finally {
				vi.useRealTimers();
			}
		});
	});
});
