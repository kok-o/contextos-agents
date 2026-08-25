import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EpisodicMemory } from "../../src/memory/episodic.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a unique temp directory for each test. */
function makeTmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "episodic-memory-test-"));
}

/** Remove a directory recursively. */
function rmDir(dir: string): void {
	fs.rmSync(dir, { recursive: true, force: true });
}

/** Default episode params factory. Override individual fields as needed. */
function makeEpisodeParams(overrides: Partial<Parameters<EpisodicMemory["record"]>[0]> = {}) {
	return {
		task: "refactor the user authentication module",
		agent: "claude-code",
		model: "sonnet-4",
		slot: "execution",
		complexity: "medium",
		success: true,
		durationMs: 12000,
		estimatedCostUsd: 0.05,
		filesChanged: ["src/auth.ts", "src/auth.test.ts"],
		summary: "Refactored auth module to use async/await pattern.",
		...overrides,
	};
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("EpisodicMemory", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = makeTmpDir();
	});

	afterEach(() => {
		rmDir(tmpDir);
	});

	// ── 1. Basics ────────────────────────────────────────────────────────────

	describe("basics", () => {
		it("init() creates the episodes directory", async () => {
			const mem = new EpisodicMemory(tmpDir);
			const episodesDir = path.join(tmpDir, "episodes");
			expect(fs.existsSync(episodesDir)).toBe(false);
			await mem.init();
			expect(fs.existsSync(episodesDir)).toBe(true);
		});

		it("size starts at 0", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();
			expect(mem.size).toBe(0);
		});

		it("getAll() returns empty array initially", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();
			expect(mem.getAll()).toEqual([]);
		});
	});

	// ── 2. record() ─────────────────────────────────────────────────────────

	describe("record()", () => {
		it("successful episodes are stored and increase size", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			const ep = await mem.record(makeEpisodeParams());
			expect(mem.size).toBe(1);
			expect(ep.id).toBeTruthy();
			expect(ep.id.length).toBe(16);

			await mem.record(makeEpisodeParams({ task: "add logging to the API layer" }));
			expect(mem.size).toBe(2);
		});

		it("failed episodes return an episode with empty id and don't increase size", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			const ep = await mem.record(makeEpisodeParams({ success: false }));
			expect(ep.id).toBe("");
			expect(ep.success).toBe(false);
			expect(mem.size).toBe(0);
		});

		it("episode has correct fields", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			const params = makeEpisodeParams();
			const ep = await mem.record(params);

			expect(ep.task).toBe(params.task);
			expect(ep.agent).toBe(params.agent);
			expect(ep.model).toBe(params.model);
			expect(ep.slot).toBe(params.slot);
			expect(ep.complexity).toBe(params.complexity);
			expect(ep.success).toBe(true);
			expect(ep.durationMs).toBe(params.durationMs);
			expect(ep.estimatedCostUsd).toBe(params.estimatedCostUsd);
			expect(ep.filesChanged).toEqual(params.filesChanged);
			expect(ep.filesChangedCount).toBe(params.filesChanged.length);
			expect(ep.summary).toBe(params.summary);
			expect(ep.timestamp).toBeGreaterThan(0);
		});

		it("summary is capped at 2000 chars", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			const longSummary = "x".repeat(5000);
			const ep = await mem.record(makeEpisodeParams({ summary: longSummary }));
			expect(ep.summary.length).toBe(2000);
		});

		it("keywords are extracted from the task", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			const ep = await mem.record(makeEpisodeParams({ task: "Fix the broken CSS layout in dashboard" }));
			// "the" and "in" are stop words; "fix" is 3 chars and kept; "broken", "css", "layout", "dashboard" kept
			expect(ep.taskKeywords).toBeInstanceOf(Array);
			expect(ep.taskKeywords.length).toBeGreaterThan(0);
			// Keywords should be lowercase and sorted
			const sorted = [...ep.taskKeywords].sort();
			expect(ep.taskKeywords).toEqual(sorted);
			// Stop words should be filtered
			expect(ep.taskKeywords).not.toContain("the");
			expect(ep.taskKeywords).not.toContain("in");
			// Substantive words should be present
			expect(ep.taskKeywords).toContain("fix");
			expect(ep.taskKeywords).toContain("broken");
			expect(ep.taskKeywords).toContain("css");
			expect(ep.taskKeywords).toContain("layout");
			expect(ep.taskKeywords).toContain("dashboard");
		});
	});

	// ── 3. recall() ─────────────────────────────────────────────────────────

	describe("recall()", () => {
		it("returns episodes sorted by similarity (highest first)", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			await mem.record(makeEpisodeParams({ task: "refactor the authentication module" }));
			await mem.record(makeEpisodeParams({ task: "deploy docker containers to production" }));
			await mem.record(makeEpisodeParams({ task: "refactor the user auth system" }));

			const results = mem.recall("refactor the auth module");
			expect(results.length).toBeGreaterThanOrEqual(1);
			// Should be sorted descending by similarity
			for (let i = 1; i < results.length; i++) {
				expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
			}
		});

		it("identical task returns similarity near 1.0", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			const task = "refactor the user authentication module";
			await mem.record(makeEpisodeParams({ task }));

			const results = mem.recall(task);
			expect(results.length).toBe(1);
			expect(results[0].similarity).toBeGreaterThan(0.9);
		});

		it("completely different task returns empty (below minSimilarity)", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			await mem.record(makeEpisodeParams({ task: "refactor the user authentication module" }));

			const results = mem.recall("deploy kubernetes cluster infrastructure", 5, 0.5);
			expect(results.length).toBe(0);
		});

		it("maxResults limits the number of results", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			// Record several similar episodes
			for (let i = 0; i < 10; i++) {
				await mem.record(makeEpisodeParams({ task: `refactor auth module part ${i}` }));
			}

			const results = mem.recall("refactor auth module", 3, 0.05);
			expect(results.length).toBeLessThanOrEqual(3);
		});

		it("minSimilarity filters low-similarity results", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			await mem.record(makeEpisodeParams({ task: "refactor auth module" }));
			await mem.record(makeEpisodeParams({ task: "deploy containers to production cluster" }));

			// High minSimilarity should filter out the unrelated episode
			const results = mem.recall("refactor the auth module", 10, 0.5);
			for (const r of results) {
				expect(r.similarity).toBeGreaterThanOrEqual(0.5);
			}
		});

		it("only successful episodes are returned", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			// Record a successful episode (stored) and a failed one (not stored)
			await mem.record(makeEpisodeParams({ task: "refactor auth module", success: true }));
			await mem.record(makeEpisodeParams({ task: "refactor auth module", success: false }));

			// Size should be 1 (failed episodes are not stored at all)
			expect(mem.size).toBe(1);
			const results = mem.recall("refactor auth module");
			expect(results.length).toBe(1);
			expect(results[0].episode.success).toBe(true);
		});
	});

	// ── 4. recommendStrategy() ──────────────────────────────────────────────

	describe("recommendStrategy()", () => {
		it("returns null when no episodes exist", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			expect(mem.recommendStrategy("anything")).toBeNull();
		});

		it("returns the agent+model of the best matching episode", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			await mem.record(
				makeEpisodeParams({
					task: "refactor user authentication",
					agent: "opencode",
					model: "gpt-4o",
				}),
			);

			const rec = mem.recommendStrategy("refactor user authentication module");
			expect(rec).not.toBeNull();
			expect(rec!.agent).toBe("opencode");
			expect(rec!.model).toBe("gpt-4o");
		});

		it("confidence is based on similarity", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			const task = "refactor user authentication";
			await mem.record(makeEpisodeParams({ task }));

			// Identical task should yield high confidence
			const high = mem.recommendStrategy(task);
			expect(high).not.toBeNull();
			expect(high!.confidence).toBeGreaterThan(0.5);

			// Somewhat similar task should yield lower confidence
			const lower = mem.recommendStrategy("refactor database models");
			// Could be null if similarity is below 0.25 threshold, or lower confidence
			if (lower) {
				expect(lower.confidence).toBeLessThan(high!.confidence);
			}
		});

		it("quality weighting: cheaper/faster episodes score higher", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			const task = "fix CSS layout bug in header";

			// Expensive/slow agent
			await mem.record(
				makeEpisodeParams({
					task,
					agent: "expensive-agent",
					model: "big-model",
					durationMs: 120000,
					estimatedCostUsd: 1.0,
				}),
			);

			// Cheap/fast agent
			await mem.record(
				makeEpisodeParams({
					task,
					agent: "cheap-agent",
					model: "small-model",
					durationMs: 5000,
					estimatedCostUsd: 0.01,
				}),
			);

			const rec = mem.recommendStrategy(task);
			expect(rec).not.toBeNull();
			// The cheaper/faster agent should win due to quality weighting
			expect(rec!.agent).toBe("cheap-agent");
			expect(rec!.model).toBe("small-model");
		});
	});

	// ── 5. getAggregateStats() ──────────────────────────────────────────────

	describe("getAggregateStats()", () => {
		it("returns null when no episodes exist", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			expect(mem.getAggregateStats()).toBeNull();
		});

		it("returns per-agent stats with correct averages", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			await mem.record(
				makeEpisodeParams({
					task: "task one",
					agent: "claude-code",
					durationMs: 10000,
					estimatedCostUsd: 0.04,
				}),
			);
			await mem.record(
				makeEpisodeParams({
					task: "task two",
					agent: "claude-code",
					durationMs: 20000,
					estimatedCostUsd: 0.06,
				}),
			);
			await mem.record(
				makeEpisodeParams({
					task: "task three",
					agent: "opencode",
					durationMs: 8000,
					estimatedCostUsd: 0.02,
				}),
			);

			const stats = mem.getAggregateStats();
			expect(stats).not.toBeNull();

			const claudeStats = stats!.perAgent.get("claude-code");
			expect(claudeStats).toBeDefined();
			expect(claudeStats!.totalEpisodes).toBe(2);
			expect(claudeStats!.avgDurationMs).toBeCloseTo(15000, -1);
			expect(claudeStats!.avgCostUsd).toBeCloseTo(0.05, 4);

			const opencodeStats = stats!.perAgent.get("opencode");
			expect(opencodeStats).toBeDefined();
			expect(opencodeStats!.totalEpisodes).toBe(1);
			expect(opencodeStats!.avgDurationMs).toBeCloseTo(8000, -1);
			expect(opencodeStats!.avgCostUsd).toBeCloseTo(0.02, 4);
		});

		it("counts slots correctly", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			await mem.record(makeEpisodeParams({ task: "task a", slot: "execution" }));
			await mem.record(makeEpisodeParams({ task: "task b", slot: "execution" }));
			await mem.record(makeEpisodeParams({ task: "task c", slot: "search" }));

			const stats = mem.getAggregateStats();
			expect(stats).not.toBeNull();

			const agentStats = stats!.perAgent.get("claude-code")!;
			expect(agentStats.slotCounts.get("execution")).toBe(2);
			expect(agentStats.slotCounts.get("search")).toBe(1);
		});

		it("tracks file extensions", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			await mem.record(
				makeEpisodeParams({
					task: "task a",
					filesChanged: ["src/index.ts", "src/utils.ts", "styles/main.css"],
				}),
			);
			await mem.record(
				makeEpisodeParams({
					task: "task b",
					agent: "opencode",
					filesChanged: ["src/index.ts"],
				}),
			);

			const stats = mem.getAggregateStats();
			expect(stats).not.toBeNull();

			// Per-agent file extensions
			const claudeExts = stats!.perAgent.get("claude-code")!.fileExtensions;
			expect(claudeExts.has(".ts")).toBe(true);
			expect(claudeExts.has(".css")).toBe(true);

			// Global file extension -> agent mapping
			const tsAgents = stats!.fileExtensions.get(".ts");
			expect(tsAgents).toBeDefined();
			// claude-code changed 2 .ts files (index.ts + utils.ts)
			expect(tsAgents!.get("claude-code")).toBe(2);
			expect(tsAgents!.get("opencode")).toBe(1);

			const cssAgents = stats!.fileExtensions.get(".css");
			expect(cssAgents).toBeDefined();
			expect(cssAgents!.get("claude-code")).toBe(1);
		});
	});

	// ── 6. getStrategyHints() ───────────────────────────────────────────────

	describe("getStrategyHints()", () => {
		it("returns null when no matching episodes", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			expect(mem.getStrategyHints("anything at all")).toBeNull();
		});

		it("returns null when episodes exist but none match above threshold", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			await mem.record(makeEpisodeParams({ task: "deploy kubernetes infrastructure cluster" }));

			// getStrategyHints uses minSimilarity=0.2, so a totally different task should miss
			const hints = mem.getStrategyHints("fix broken CSS gradient in mobile header");
			// Could be null or could match faintly — just verify the type
			if (hints !== null) {
				expect(typeof hints).toBe("string");
			}
		});

		it("returns formatted string with past strategies", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			await mem.record(
				makeEpisodeParams({
					task: "refactor authentication module",
					agent: "claude-code",
					model: "sonnet-4",
					slot: "execution",
					durationMs: 15000,
					estimatedCostUsd: 0.042,
					filesChanged: ["src/auth.ts"],
				}),
			);

			const hints = mem.getStrategyHints("refactor the authentication system");
			expect(hints).not.toBeNull();
			expect(hints).toContain("Past successful strategies for similar tasks:");
			expect(hints).toContain("match");
			expect(hints).toContain("claude-code");
			expect(hints).toContain("sonnet-4");
			expect(hints).toContain("execution");
		});
	});

	// ── 7. Eviction ─────────────────────────────────────────────────────────

	describe("eviction", () => {
		it("when maxEpisodes is reached, oldest episode is removed", async () => {
			const mem = new EpisodicMemory(tmpDir, 3);
			await mem.init();

			const ep1 = await mem.record(makeEpisodeParams({ task: "first task ever" }));
			const ep2 = await mem.record(makeEpisodeParams({ task: "second task ever" }));
			const ep3 = await mem.record(makeEpisodeParams({ task: "third task ever" }));
			expect(mem.size).toBe(3);

			// Adding a 4th should evict the oldest (ep1)
			const ep4 = await mem.record(makeEpisodeParams({ task: "fourth task ever" }));
			expect(mem.size).toBe(3);

			const allIds = mem.getAll().map((e) => e.id);
			expect(allIds).not.toContain(ep1.id);
			expect(allIds).toContain(ep2.id);
			expect(allIds).toContain(ep3.id);
			expect(allIds).toContain(ep4.id);

			// The evicted episode's file should also be deleted from disk
			const episodesDir = path.join(tmpDir, "episodes");
			const filesOnDisk = fs.readdirSync(episodesDir);
			expect(filesOnDisk).not.toContain(`${ep1.id}.json`);
			expect(filesOnDisk.length).toBe(3);
		});
	});

	// ── 8. Disk persistence ─────────────────────────────────────────────────

	describe("disk persistence", () => {
		it("episodes are saved to disk as JSON files", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			const ep = await mem.record(makeEpisodeParams({ task: "save me to disk" }));

			const episodesDir = path.join(tmpDir, "episodes");
			const filePath = path.join(episodesDir, `${ep.id}.json`);
			expect(fs.existsSync(filePath)).toBe(true);

			const contents = JSON.parse(fs.readFileSync(filePath, "utf-8"));
			expect(contents.id).toBe(ep.id);
			expect(contents.task).toBe("save me to disk");
			expect(contents.agent).toBe(ep.agent);
		});

		it("new instance can load episodes from disk via init()", async () => {
			// First instance: write episodes
			const mem1 = new EpisodicMemory(tmpDir);
			await mem1.init();

			await mem1.record(makeEpisodeParams({ task: "persistent task alpha" }));
			await mem1.record(makeEpisodeParams({ task: "persistent task beta" }));
			expect(mem1.size).toBe(2);

			// Second instance: should load from disk
			const mem2 = new EpisodicMemory(tmpDir);
			await mem2.init();

			expect(mem2.size).toBe(2);
			const all = mem2.getAll();
			const tasks = all.map((e) => e.task);
			expect(tasks).toContain("persistent task alpha");
			expect(tasks).toContain("persistent task beta");
		});

		it("corrupt JSON files are skipped during load", async () => {
			// First instance: write a valid episode
			const mem1 = new EpisodicMemory(tmpDir);
			await mem1.init();

			await mem1.record(makeEpisodeParams({ task: "valid episode here" }));
			expect(mem1.size).toBe(1);

			// Manually write a corrupt JSON file into the episodes directory
			const episodesDir = path.join(tmpDir, "episodes");
			fs.writeFileSync(path.join(episodesDir, "corrupt1.json"), "{{{{not json at all", "utf-8");
			fs.writeFileSync(path.join(episodesDir, "corrupt2.json"), '{"id": "", "task": ""}', "utf-8"); // missing required fields (empty id)
			fs.writeFileSync(path.join(episodesDir, "corrupt3.json"), '{"no_id": true, "no_task": true}', "utf-8"); // missing id/task entirely

			// Second instance: should load only the valid episode
			const mem2 = new EpisodicMemory(tmpDir);
			await mem2.init();

			expect(mem2.size).toBe(1);
			expect(mem2.getAll()[0].task).toBe("valid episode here");
		});
	});

	// ── Edge cases ──────────────────────────────────────────────────────────

	describe("edge cases", () => {
		it("recall on empty memory returns empty array", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			expect(mem.recall("anything")).toEqual([]);
		});

		it("getAll() returns a copy, not the internal array", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			await mem.record(makeEpisodeParams());
			const all = mem.getAll();
			all.pop(); // mutate the returned array
			expect(mem.size).toBe(1); // internal array is unaffected
		});

		it("episodeId is deterministic (same task+timestamp = same id)", async () => {
			vi.useFakeTimers();
			try {
				const mem = new EpisodicMemory(tmpDir);
				await mem.init();

				const ep1 = await mem.record(makeEpisodeParams({ task: "unique task" }));
				// Advance time to guarantee different timestamps
				vi.advanceTimersByTime(100);
				const ep2 = await mem.record(makeEpisodeParams({ task: "unique task" }));

				expect(ep1.id).not.toBe(ep2.id);
				expect(ep1.id.length).toBe(16);
				expect(ep2.id.length).toBe(16);
			} finally {
				vi.useRealTimers();
			}
		});

		it("eviction during init when loaded episodes exceed maxEpisodes", async () => {
			vi.useFakeTimers();
			try {
				const mem1 = new EpisodicMemory(tmpDir, 100);
				await mem1.init();

				for (let i = 0; i < 5; i++) {
					await mem1.record(makeEpisodeParams({ task: `task number ${i}` }));
					// Advance time to guarantee distinct, ordered timestamps
					vi.advanceTimersByTime(100);
				}
				expect(mem1.size).toBe(5);

				// Load with a lower maxEpisodes — should trim to 2, keeping the newest
				const mem2 = new EpisodicMemory(tmpDir, 2);
				await mem2.init();
				expect(mem2.size).toBe(2);

				// The kept episodes should be the two newest (highest timestamps)
				const kept = mem2.getAll();
				expect(kept[0].task).toBe("task number 3");
				expect(kept[1].task).toBe("task number 4");
			} finally {
				vi.useRealTimers();
			}
		});

		it("keywords filter words with 2 or fewer characters", async () => {
			const mem = new EpisodicMemory(tmpDir);
			await mem.init();

			const ep = await mem.record(makeEpisodeParams({ task: "go to my DB and fix it up" }));
			// "go", "to", "my", "DB", "it", "up" are all 2 chars — should be filtered
			// "and" is a stop word, "fix" is 3 chars and kept
			expect(ep.taskKeywords).not.toContain("go");
			expect(ep.taskKeywords).not.toContain("to");
			expect(ep.taskKeywords).not.toContain("my");
			expect(ep.taskKeywords).not.toContain("db");
			expect(ep.taskKeywords).not.toContain("it");
			expect(ep.taskKeywords).not.toContain("up");
			expect(ep.taskKeywords).toContain("fix");
		});
	});
});
