import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { CompressedResult } from "../../src/core/types.js";
import { ThreadCache } from "../../src/threads/cache.js";

function createDummyResult(): CompressedResult {
	return {
		success: true,
		summary: "Cached execution output",
		filesChanged: ["output.ts"],
		diffStats: "1 file changed",
		durationMs: 150,
		estimatedCostUsd: 0.02,
	};
}

describe("Cache Artifact & Context Hash Verification (Task 2.5e)", () => {
	it("returns cached result when context files match recorded hashes", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cache-test-"));
		try {
			const filePath = path.join(tmpDir, "context.txt");
			fs.writeFileSync(filePath, "initial context content\n");

			const cache = new ThreadCache(10);
			const result = createDummyResult();

			cache.set("task-1", ["context.txt"], "mock", "model-a", result, tmpDir, "sha1");

			// Cache lookup with unchanged file
			const hit = cache.get("task-1", ["context.txt"], "mock", "model-a", tmpDir, "sha1");
			expect(hit).toBeDefined();
			expect(hit?.summary).toBe("Cached execution output");
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("invalidates cached result when context file content drifts", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cache-drift-"));
		try {
			const filePath = path.join(tmpDir, "context.txt");
			fs.writeFileSync(filePath, "version 1 of context\n");

			const cache = new ThreadCache(10);
			const result = createDummyResult();

			cache.set("task-1", ["context.txt"], "mock", "model-a", result, tmpDir, "sha1");

			// Mutate file on disk (context drift)
			fs.writeFileSync(filePath, "version 2 of context with modified requirements\n");

			// Lookup should now detect drift, invalidate entry, and return undefined
			const miss = cache.get("task-1", ["context.txt"], "mock", "model-a", tmpDir, "sha1");
			expect(miss).toBeUndefined();

			const stats = cache.getStats();
			expect(stats.misses).toBe(1);
			expect(stats.size).toBe(0);
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("preserves context file hashes across disk reload and detects drift", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cache-disk-"));
		const cacheDir = path.join(tmpDir, ".cache");
		try {
			const filePath = path.join(tmpDir, "context.txt");
			fs.writeFileSync(filePath, "stable context\n");

			const cache1 = new ThreadCache(10, cacheDir);
			await cache1.init();
			cache1.set("task-disk", ["context.txt"], "mock", "model-a", createDummyResult(), tmpDir, "sha1");

			// Reload from disk in a fresh cache instance
			const cache2 = new ThreadCache(10, cacheDir);
			await cache2.init();

			// Initial lookup should hit
			expect(cache2.get("task-disk", ["context.txt"], "mock", "model-a", tmpDir, "sha1")).toBeDefined();

			// Mutate file
			fs.writeFileSync(filePath, "drifted context after reload\n");

			// Next lookup should miss and delete disk entry
			expect(cache2.get("task-disk", ["context.txt"], "mock", "model-a", tmpDir, "sha1")).toBeUndefined();
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
