import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FailureRecord } from "../../src/routing/model-router.js";
import {
	AGENT_CAPABILITIES,
	classifyTaskComplexity,
	classifyTaskSlot,
	extractFileExtensions,
	FailureTracker,
} from "../../src/routing/model-router.js";

// ── classifyTaskComplexity ─────────────────────────────────────────────────

describe("classifyTaskComplexity", () => {
	it('returns "complex" for refactoring tasks', () => {
		expect(classifyTaskComplexity("refactor the auth module")).toBe("complex");
	});

	it('returns "simple" for typo fixes', () => {
		expect(classifyTaskComplexity("fix typo in README")).toBe("simple");
	});

	it('returns "medium" as the default when no strong signal', () => {
		expect(classifyTaskComplexity("add error handling to API routes")).toBe("medium");
	});

	it('returns "complex" for full rewrites', () => {
		expect(classifyTaskComplexity("rewrite the entire database layer")).toBe("complex");
	});

	it('returns "simple" for lint tasks', () => {
		expect(classifyTaskComplexity("lint the codebase")).toBe("simple");
	});

	it('returns "complex" for architecture tasks', () => {
		expect(classifyTaskComplexity("architect a new microservices layout")).toBe("complex");
	});

	it('returns "simple" for formatting tasks', () => {
		expect(classifyTaskComplexity("format the code")).toBe("simple");
	});

	it('returns "complex" for migration tasks', () => {
		expect(classifyTaskComplexity("migrate from Express to Fastify")).toBe("complex");
	});

	it("is case-insensitive", () => {
		expect(classifyTaskComplexity("REFACTOR the auth module")).toBe("complex");
		expect(classifyTaskComplexity("FIX TYPO in readme")).toBe("simple");
	});
});

// ── classifyTaskSlot ───────────────────────────────────────────────────────

describe("classifyTaskSlot", () => {
	it('returns "search" for finding tasks', () => {
		expect(classifyTaskSlot("find all API endpoints")).toBe("search");
	});

	it('returns "reasoning" for analysis tasks', () => {
		expect(classifyTaskSlot("analyze the performance bottleneck")).toBe("reasoning");
	});

	it('returns "planning" for design tasks', () => {
		expect(classifyTaskSlot("design a new auth architecture")).toBe("planning");
	});

	it('returns "execution" as the default', () => {
		expect(classifyTaskSlot("fix the login bug")).toBe("execution");
	});

	it('returns "reasoning" for debugging tasks', () => {
		expect(classifyTaskSlot("debug the memory leak")).toBe("reasoning");
	});

	it('returns "search" for documentation lookup', () => {
		expect(classifyTaskSlot("look up the documentation for the API")).toBe("search");
	});

	it('returns "planning" for strategy tasks', () => {
		expect(classifyTaskSlot("propose a strategy for scaling")).toBe("planning");
	});

	it('returns "reasoning" for review tasks', () => {
		expect(classifyTaskSlot("review the pull request changes")).toBe("reasoning");
	});

	it("is case-insensitive", () => {
		expect(classifyTaskSlot("FIND all endpoints")).toBe("search");
		expect(classifyTaskSlot("ANALYZE performance")).toBe("reasoning");
	});
});

// ── extractFileExtensions ──────────────────────────────────────────────────

describe("extractFileExtensions", () => {
	it("extracts .ts and .py from a task mentioning those files", () => {
		const result = extractFileExtensions("fix src/auth.ts and src/utils.py");
		expect(result).toEqual(expect.arrayContaining([".ts", ".py"]));
		expect(result).toHaveLength(2);
	});

	it("returns an empty array when no extensions are present", () => {
		expect(extractFileExtensions("no extensions here")).toEqual([]);
	});

	it("extracts .css and .tsx", () => {
		const result = extractFileExtensions("update styles.css and app.tsx");
		expect(result).toEqual(expect.arrayContaining([".css", ".tsx"]));
		expect(result).toHaveLength(2);
	});

	it("deduplicates extensions", () => {
		const result = extractFileExtensions("fix foo.ts and bar.ts");
		expect(result).toEqual([".ts"]);
	});

	it("normalises extensions to lowercase", () => {
		const result = extractFileExtensions("edit App.TSX and main.Tsx");
		expect(result).toEqual([".tsx"]);
	});

	it("handles many different extensions in one task", () => {
		const result = extractFileExtensions("update index.html, style.css, app.js, server.py, and config.json");
		expect(result).toEqual(expect.arrayContaining([".html", ".css", ".js", ".py", ".json"]));
		expect(result).toHaveLength(5);
	});

	it("does not match extensions that are not in the allowed set", () => {
		const result = extractFileExtensions("open photo.png and video.mp4");
		expect(result).toEqual([]);
	});
});

// ── FailureTracker ─────────────────────────────────────────────────────────

describe("FailureTracker", () => {
	let tracker: FailureTracker;

	beforeEach(() => {
		tracker = new FailureTracker();
	});

	// ── Basic operations ───────────────────────────────────────────────────

	describe("basic operations", () => {
		it("has a zero failure rate for a fresh tracker", () => {
			expect(tracker.getFailureRate("opencode")).toBe(0);
		});

		it("reports a failure rate of ~0.33 for a single recent failure", () => {
			tracker.recordFailure("opencode", "gpt-4", "fix bug", "some error");
			const rate = tracker.getFailureRate("opencode");
			expect(rate).toBeGreaterThan(0.3);
			expect(rate).toBeLessThanOrEqual(0.34);
		});

		it("saturates at 1.0 with three recent failures", () => {
			tracker.recordFailure("opencode", "gpt-4", "task1", "error1");
			tracker.recordFailure("opencode", "gpt-4", "task2", "error2");
			tracker.recordFailure("opencode", "gpt-4", "task3", "error3");
			expect(tracker.getFailureRate("opencode")).toBeCloseTo(1.0, 1);
		});

		it("isFullyFailed returns true at >= 0.99 failure rate", () => {
			tracker.recordFailure("opencode", "gpt-4", "t1", "e1");
			tracker.recordFailure("opencode", "gpt-4", "t2", "e2");
			tracker.recordFailure("opencode", "gpt-4", "t3", "e3");
			expect(tracker.isFullyFailed("opencode")).toBe(true);
		});

		it("isFullyFailed returns false with only one failure", () => {
			tracker.recordFailure("opencode", "gpt-4", "t1", "e1");
			expect(tracker.isFullyFailed("opencode")).toBe(false);
		});

		it("getFailureCount counts raw failures per agent", () => {
			tracker.recordFailure("opencode", "gpt-4", "t1", "e1");
			tracker.recordFailure("opencode", "gpt-4", "t2", "e2");
			tracker.recordFailure("aider", "sonnet", "t3", "e3");
			expect(tracker.getFailureCount("opencode")).toBe(2);
			expect(tracker.getFailureCount("aider")).toBe(1);
			expect(tracker.getFailureCount("codex")).toBe(0);
		});

		it("clear() resets everything", () => {
			tracker.recordFailure("opencode", "gpt-4", "t1", "e1");
			tracker.recordFailure("aider", "sonnet", "t2", "e2");
			tracker.clear();
			expect(tracker.getFailureRate("opencode")).toBe(0);
			expect(tracker.getFailureCount("opencode")).toBe(0);
			expect(tracker.getFailures()).toEqual([]);
		});

		it("getFailures() returns copies (not references to internal state)", () => {
			tracker.recordFailure("opencode", "gpt-4", "t1", "e1");
			const failures1 = tracker.getFailures();
			const failures2 = tracker.getFailures();
			expect(failures1).toEqual(failures2);
			expect(failures1).not.toBe(failures2);
		});
	});

	// ── Transient vs permanent classification ──────────────────────────────

	describe("transient vs permanent error classification", () => {
		it('classifies "timeout" as transient', () => {
			tracker.recordFailure("opencode", "gpt-4", "task", "request timeout");
			const failures = tracker.getFailures();
			expect(failures[0].isTransient).toBe(true);
		});

		it('classifies "429" as transient', () => {
			tracker.recordFailure("opencode", "gpt-4", "task", "HTTP 429 Too Many Requests");
			const failures = tracker.getFailures();
			expect(failures[0].isTransient).toBe(true);
		});

		it('classifies "rate limit" as transient', () => {
			tracker.recordFailure("opencode", "gpt-4", "task", "rate limit exceeded");
			const failures = tracker.getFailures();
			expect(failures[0].isTransient).toBe(true);
		});

		it('classifies "503" as transient', () => {
			tracker.recordFailure("opencode", "gpt-4", "task", "503 Service Unavailable");
			expect(tracker.getFailures()[0].isTransient).toBe(true);
		});

		it('classifies "ECONNRESET" as transient', () => {
			tracker.recordFailure("opencode", "gpt-4", "task", "ECONNRESET");
			expect(tracker.getFailures()[0].isTransient).toBe(true);
		});

		it('classifies "authentication failed" as permanent', () => {
			tracker.recordFailure("opencode", "gpt-4", "task", "authentication failed");
			const failures = tracker.getFailures();
			expect(failures[0].isTransient).toBe(false);
		});

		it('classifies "invalid API key" as permanent', () => {
			tracker.recordFailure("opencode", "gpt-4", "task", "invalid API key");
			expect(tracker.getFailures()[0].isTransient).toBe(false);
		});

		it("classifies generic errors as permanent", () => {
			tracker.recordFailure("opencode", "gpt-4", "task", "unknown error occurred");
			expect(tracker.getFailures()[0].isTransient).toBe(false);
		});
	});

	// ── Model-scoped failure rates ─────────────────────────────────────────

	describe("model-scoped failure rates", () => {
		it("filters failures by model when model is specified", () => {
			tracker.recordFailure("opencode", "gpt-4", "t1", "err");
			tracker.recordFailure("opencode", "gpt-3.5", "t2", "err");
			const rateAll = tracker.getFailureRate("opencode");
			const rateGpt4 = tracker.getFailureRate("opencode", "gpt-4");
			// Two failures without model filter vs one with model filter
			expect(rateAll).toBeGreaterThan(rateGpt4);
			expect(rateGpt4).toBeGreaterThan(0.3);
			expect(rateGpt4).toBeLessThanOrEqual(0.34);
		});

		it("returns 0 for a model with no failures", () => {
			tracker.recordFailure("opencode", "gpt-4", "t1", "err");
			expect(tracker.getFailureRate("opencode", "gpt-3.5")).toBe(0);
		});
	});

	// ── FailureRecord structure ────────────────────────────────────────────

	describe("FailureRecord structure", () => {
		it("stores all expected fields", () => {
			tracker.recordFailure("opencode", "gpt-4", "fix bug", "timeout");
			const records = tracker.getFailures();
			expect(records).toHaveLength(1);
			const rec: FailureRecord = records[0];
			expect(rec.agent).toBe("opencode");
			expect(rec.model).toBe("gpt-4");
			expect(rec.task).toBe("fix bug");
			expect(rec.error).toBe("timeout");
			expect(rec.timestamp).toBeTypeOf("number");
			expect(rec.isTransient).toBe(true);
		});
	});
});

// ── Exponential decay ──────────────────────────────────────────────────────

describe("FailureTracker exponential decay", () => {
	it("very old failures have near-zero weight", () => {
		vi.useFakeTimers();
		try {
			const tracker = new FailureTracker(100, 50);
			tracker.recordFailure("opencode", "gpt-4", "task", "authentication failed"); // permanent
			// Advance by 5 half-lives (500ms / 100ms)
			vi.advanceTimersByTime(500);
			const rate = tracker.getFailureRate("opencode");
			// After ~5 half-lives, weight should be ~1/32,
			// so rate should be very small (< 0.05)
			expect(rate).toBeLessThan(0.05);
		} finally {
			vi.useRealTimers();
		}
	});

	it("transient failures decay faster than permanent ones", () => {
		vi.useFakeTimers();
		try {
			// permanentHalfLife = 400ms, transientHalfLife = 50ms
			const tracker = new FailureTracker(400, 50);

			// Record one transient and one permanent failure
			tracker.recordFailure("agent-t", "model", "task", "timeout");
			tracker.recordFailure("agent-p", "model", "task", "authentication failed");

			// Advance 200ms: transient has gone through 4 half-lives (weight ~1/16),
			// permanent has gone through 0.5 half-lives (weight ~0.7)
			vi.advanceTimersByTime(200);

			const transientRate = tracker.getFailureRate("agent-t");
			const permanentRate = tracker.getFailureRate("agent-p");

			expect(permanentRate).toBeGreaterThan(transientRate);
		} finally {
			vi.useRealTimers();
		}
	});

	it("recent failures still have high weight", () => {
		const tracker = new FailureTracker(100, 50);
		tracker.recordFailure("opencode", "gpt-4", "task", "error");
		// Immediately after recording, weight should be ~1.0
		const rate = tracker.getFailureRate("opencode");
		expect(rate).toBeGreaterThan(0.3);
	});
});

// ── AGENT_CAPABILITIES ─────────────────────────────────────────────────────

describe("AGENT_CAPABILITIES", () => {
	const expectedAgents = ["opencode", "claude-code", "codex", "aider", "direct-llm"];

	it("has entries for all expected agents", () => {
		for (const agent of expectedAgents) {
			expect(AGENT_CAPABILITIES).toHaveProperty(agent);
		}
	});

	it.each(expectedAgents)("'%s' has all required fields", (agent) => {
		const cap = AGENT_CAPABILITIES[agent];
		expect(cap.name).toBe(agent);
		expect(cap.costTier).toBeTypeOf("number");
		expect(cap.costTier).toBeGreaterThanOrEqual(1);
		expect(cap.costTier).toBeLessThanOrEqual(5);
		expect(cap.speedTier).toBeTypeOf("number");
		expect(cap.speedTier).toBeGreaterThanOrEqual(1);
		expect(cap.speedTier).toBeLessThanOrEqual(5);
		expect(Array.isArray(cap.strengths)).toBe(true);
		expect(cap.strengths.length).toBeGreaterThan(0);
		expect(cap.defaultModel).toBeTypeOf("string");
		expect(cap.defaultModel.length).toBeGreaterThan(0);
		expect(cap.cheapModel).toBeTypeOf("string");
		expect(cap.cheapModel.length).toBeGreaterThan(0);
		expect(cap.premiumModel).toBeTypeOf("string");
		expect(cap.premiumModel.length).toBeGreaterThan(0);
	});

	it("opencode has expected strengths", () => {
		expect(AGENT_CAPABILITIES.opencode.strengths).toContain("general-purpose");
		expect(AGENT_CAPABILITIES.opencode.strengths).toContain("fast");
	});

	it("aider is the cheapest (lowest costTier)", () => {
		const aiderCost = AGENT_CAPABILITIES.aider.costTier;
		for (const agent of expectedAgents) {
			expect(AGENT_CAPABILITIES[agent].costTier).toBeGreaterThanOrEqual(aiderCost);
		}
	});

	it("claude-code has deep-analysis and refactoring strengths", () => {
		const strengths = AGENT_CAPABILITIES["claude-code"].strengths;
		expect(strengths).toContain("deep-analysis");
		expect(strengths).toContain("refactoring");
	});

	it("direct-llm has no-file-changes strength", () => {
		expect(AGENT_CAPABILITIES["direct-llm"].strengths).toContain("no-file-changes");
	});
});
