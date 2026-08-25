/**
 * Unit tests for MCP tool registration and handlers.
 *
 * Mocks the session module and captures tool handlers via a mock McpServer.
 * Tests input validation, error handling, and JSON formatting.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock session module ─────────────────────────────────────────────────────

const mockSession = {
	dir: "/tmp/test-repo",
	config: { default_agent: "mock", default_model: "mock-model" },
	threadManager: {
		getThreads: vi.fn(() => []),
		getBudgetState: vi.fn(() => ({
			totalSpentUsd: 0,
			threadCosts: new Map(),
			sessionLimitUsd: 10,
			perThreadLimitUsd: 1,
			totalTokens: { input: 0, output: 0 },
			actualCostThreads: 0,
			estimatedCostThreads: 0,
		})),
		cancelThread: vi.fn(() => false),
	},
	abortController: new AbortController(),
	createdAt: Date.now(),
};

vi.mock("../../src/mcp/session.js", () => ({
	getSession: vi.fn(async (dir: string) => {
		if (dir.includes("nonexistent")) throw new Error(`Directory does not exist: ${dir}`);
		return mockSession;
	}),
	spawnThread: vi.fn(async (_session: unknown, params: { task: string }) => ({
		success: true,
		summary: `Done: ${params.task}`,
		filesChanged: ["hello.ts"],
		diffStats: "1 file changed",
		durationMs: 100,
		estimatedCostUsd: 0.01,
	})),
	getThreads: vi.fn(() => []),
	getBudgetState: vi.fn(() => ({
		totalSpentUsd: 0.05,
		threadCosts: new Map(),
		sessionLimitUsd: 10,
		perThreadLimitUsd: 1,
		totalTokens: { input: 5000, output: 2000 },
		actualCostThreads: 1,
		estimatedCostThreads: 0,
	})),
	mergeThreads: vi.fn(async () => [
		{ success: true, branch: "swarm/t-1", conflicts: [], conflictDiff: "", message: "Merged" },
	]),
	cancelThreads: vi.fn(() => ({ cancelled: true, message: "All threads cancelled" })),
	cleanupSession: vi.fn(async () => "Session cleaned up"),
}));

// ── Mock McpServer ──────────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{
	content: { type: string; text: string }[];
	isError?: boolean;
}>;

const registeredTools = new Map<string, ToolHandler>();

const mockServer = {
	registerTool: vi.fn((name: string, _config: unknown, handler: ToolHandler) => {
		registeredTools.set(name, handler);
	}),
};

// ── Import + register ───────────────────────────────────────────────────────

import { killActiveSubprocesses, registerTools } from "../../src/mcp/tools.js";

beforeEach(() => {
	registeredTools.clear();
	vi.clearAllMocks();
	registerTools(mockServer as any, "/tmp/default-dir");
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("registerTools", () => {
	it("registers all 6 tools", () => {
		expect(registeredTools.size).toBe(6);
		expect(registeredTools.has("swarm_run")).toBe(true);
		expect(registeredTools.has("swarm_thread")).toBe(true);
		expect(registeredTools.has("swarm_status")).toBe(true);
		expect(registeredTools.has("swarm_merge")).toBe(true);
		expect(registeredTools.has("swarm_cancel")).toBe(true);
		expect(registeredTools.has("swarm_cleanup")).toBe(true);
	});
});

describe("swarm_thread tool", () => {
	it("returns JSON result on success", async () => {
		const handler = registeredTools.get("swarm_thread")!;
		const result = await handler({ task: "add a test" });

		expect(result.isError).toBeUndefined();
		expect(result.content).toHaveLength(1);
		expect(result.content[0].type).toBe("text");

		const parsed = JSON.parse(result.content[0].text);
		expect(parsed.success).toBe(true);
		expect(parsed.summary).toContain("add a test");
		expect(parsed.files_changed).toContain("hello.ts");
		expect(parsed.duration_ms).toBe(100);
		expect(parsed.cost_usd).toBe(0.01);
	});

	it("returns error when dir is required but missing", async () => {
		// Re-register with no default dir
		registeredTools.clear();
		registerTools(mockServer as any, undefined);

		const handler = registeredTools.get("swarm_thread")!;
		const result = await handler({ task: "test" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("dir");
	});
});

describe("swarm_status tool", () => {
	it("returns session status with threads and budget", async () => {
		const handler = registeredTools.get("swarm_status")!;
		const result = await handler({});

		expect(result.isError).toBeUndefined();
		const parsed = JSON.parse(result.content[0].text);
		expect(parsed.dir).toBeDefined();
		expect(parsed.threads).toBeInstanceOf(Array);
		expect(parsed.counts).toBeDefined();
		expect(parsed.counts.total).toBe(0);
		expect(parsed.budget).toBeDefined();
		expect(parsed.budget.spent_usd).toBe(0.05);
		expect(parsed.session_age_ms).toBeGreaterThanOrEqual(0);
	});
});

describe("swarm_merge tool", () => {
	it("returns merge results as JSON", async () => {
		const handler = registeredTools.get("swarm_merge")!;
		const result = await handler({});

		expect(result.isError).toBeUndefined();
		const parsed = JSON.parse(result.content[0].text);
		expect(parsed.merged).toBe(1);
		expect(parsed.results).toHaveLength(1);
		expect(parsed.results[0].success).toBe(true);
		expect(parsed.results[0].branch).toBe("swarm/t-1");
	});
});

describe("swarm_cancel tool", () => {
	it("returns cancel result as JSON", async () => {
		const handler = registeredTools.get("swarm_cancel")!;
		const result = await handler({});

		expect(result.isError).toBeUndefined();
		const parsed = JSON.parse(result.content[0].text);
		expect(parsed.cancelled).toBe(true);
		expect(parsed.message).toContain("cancelled");
	});

	it("passes thread_id when specified", async () => {
		const { cancelThreads } = await import("../../src/mcp/session.js");
		const handler = registeredTools.get("swarm_cancel")!;
		await handler({ thread_id: "t-123" });

		expect(cancelThreads).toHaveBeenCalledWith(mockSession, "t-123");
	});
});

describe("swarm_cleanup tool", () => {
	it("returns cleanup result as JSON", async () => {
		const handler = registeredTools.get("swarm_cleanup")!;
		const result = await handler({});

		expect(result.isError).toBeUndefined();
		const parsed = JSON.parse(result.content[0].text);
		expect(parsed.cleaned_up).toBe(true);
		expect(parsed.message).toContain("cleaned up");
	});
});

describe("swarm_run tool", () => {
	it("returns error when dir is required but missing", async () => {
		registeredTools.clear();
		registerTools(mockServer as any, undefined);

		const handler = registeredTools.get("swarm_run")!;
		const result = await handler({ task: "test" });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("dir");
	});
});

describe("killActiveSubprocesses", () => {
	it("does not throw when called with no active subprocesses", () => {
		expect(() => killActiveSubprocesses()).not.toThrow();
	});
});
