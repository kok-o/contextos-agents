/**
 * Unit tests for ContextOS MCP tool registration and handlers.
 *
 * Tests input validation, sync/async delegation, diff inspection,
 * conflict comparison, and branch merging.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock session module ─────────────────────────────────────────────────────

const mockWorktreeManager = {
	getDiff: vi.fn(async (_threadId: string) => "diff --git a/hello.ts b/hello.ts\n+console.log('hello');"),
};

const mockThreads = [
	{
		id: "ctx_task1_openai",
		status: "completed",
		phase: "completed",
		config: {
			task: "Add feature",
			agent: { backend: "direct-llm", model: "gpt-4o" },
		},
		worktreePath: "/tmp/worktrees/wt-1",
		branchName: "swarm/ctx_task1_openai",
		startedAt: 1000,
		completedAt: 2000,
		result: {
			success: true,
			filesChanged: ["src/feature.ts"],
			diffStats: "1 file changed, 10 insertions(+)",
			durationMs: 1000,
			estimatedCostUsd: 0.02,
		},
	},
	{
		id: "ctx_task1_anthropic",
		status: "completed",
		phase: "completed",
		config: {
			task: "Add feature",
			agent: { backend: "direct-llm", model: "claude-sonnet-4-6" },
		},
		worktreePath: "/tmp/worktrees/wt-2",
		branchName: "swarm/ctx_task1_anthropic",
		startedAt: 1000,
		completedAt: 2500,
		result: {
			success: true,
			filesChanged: ["src/feature.ts", "src/extra.ts"],
			diffStats: "2 files changed, 20 insertions(+)",
			durationMs: 1500,
			estimatedCostUsd: 0.03,
		},
	},
];

const mockSession = {
	dir: process.cwd(),
	config: { default_agent: "direct-llm", default_model: "mock-model" },
	threadManager: {
		getThreads: vi.fn(() => mockThreads),
		getBudgetState: vi.fn(() => ({
			totalSpentUsd: 0.05,
			threadCosts: new Map(),
			sessionLimitUsd: 10,
			perThreadLimitUsd: 1,
			totalTokens: { input: 5000, output: 2000 },
			actualCostThreads: 2,
			estimatedCostThreads: 0,
		})),
		cancelThread: vi.fn(() => false),
		getWorktreeManager: vi.fn(() => mockWorktreeManager),
	},
	abortController: new AbortController(),
	createdAt: Date.now(),
};

vi.mock("../../src/mcp/session.js", () => ({
	getSession: vi.fn(async (dir: string) => {
		if (dir.includes("nonexistent")) throw new Error(`Directory does not exist: ${dir}`);
		return mockSession;
	}),
	spawnThread: vi.fn(async (_session: unknown, params: { task: string; id?: string }) => ({
		success: true,
		summary: `Done: ${params.task}`,
		filesChanged: ["src/feature.ts"],
		diffStats: "1 file changed",
		durationMs: 100,
		estimatedCostUsd: 0.01,
	})),
	getThreads: vi.fn(() => mockThreads),
	getBudgetState: vi.fn(() => ({
		totalSpentUsd: 0.05,
		threadCosts: new Map(),
		sessionLimitUsd: 10,
		perThreadLimitUsd: 1,
		totalTokens: { input: 5000, output: 2000 },
		actualCostThreads: 2,
		estimatedCostThreads: 0,
	})),
	recordAsyncJob: vi.fn(),
	getAsyncJobs: vi.fn(() => ({})),
	cleanupSession: vi.fn(async () => "Session cleaned up"),
}));

vi.mock("../../src/worktree/merge.js", () => ({
	mergeThreadBranch: vi.fn(async () => ({
		success: true,
		branch: "swarm/ctx_task1_openai",
		message: "Merged successfully",
		conflicts: [],
	})),
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

import { registerContextosTools } from "../../src/mcp/tools/contextos.js";

beforeEach(() => {
	registeredTools.clear();
	vi.clearAllMocks();
	registerContextosTools(mockServer as any, process.cwd());
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("registerContextosTools", () => {
	it("registers all 6 ContextOS enterprise tools", () => {
		expect(registeredTools.size).toBe(6);
		expect(registeredTools.has("contextos_delegate")).toBe(true);
		expect(registeredTools.has("contextos_status")).toBe(true);
		expect(registeredTools.has("contextos_compare")).toBe(true);
		expect(registeredTools.has("contextos_diff")).toBe(true);
		expect(registeredTools.has("contextos_merge")).toBe(true);
		expect(registeredTools.has("contextos_cleanup")).toBe(true);
	});

	describe("contextos_delegate", () => {
		it("delegates synchronously and returns completed results", async () => {
			const handler = registeredTools.get("contextos_delegate")!;
			const res = await handler({
				dir: process.cwd(),
				task: "Build authentication modal with React",
				agents: [
					{ provider: "openai", model: "gpt-4o" },
					{ provider: "anthropic", model: "claude-sonnet-4-6" },
				],
				wait: true,
			});

			expect(res.isError).toBeFalsy();
			const parsed = JSON.parse(res.content[0].text);
			expect(parsed.status).toBe("completed");
			expect(parsed.agents.length).toBe(2);
			expect(parsed.agents[0].status).toBe("completed");
		});

		it("delegates asynchronously (wait: false) and returns immediately", async () => {
			const handler = registeredTools.get("contextos_delegate")!;
			const res = await handler({
				dir: process.cwd(),
				task: "Refactor backend database models",
				agents: [{ provider: "gemini", model: "gemini-2.5-pro" }],
				wait: false,
			});

			expect(res.isError).toBeFalsy();
			const parsed = JSON.parse(res.content[0].text);
			expect(parsed.status).toBe("running");
			expect(parsed.message).toContain("Poll status with contextos_status");
			expect(parsed.agents[0].status).toBe("running");
		});
	});

	describe("contextos_status", () => {
		it("returns session threads and budget statistics", async () => {
			const handler = registeredTools.get("contextos_status")!;
			const res = await handler({ dir: process.cwd() });

			expect(res.isError).toBeFalsy();
			const parsed = JSON.parse(res.content[0].text);
			expect(parsed.threads.length).toBe(2);
			expect(parsed.counts.completed).toBe(2);
			expect(parsed.budget.spent_usd).toBe(0.05);
		});
	});

	describe("contextos_compare", () => {
		it("detects potential file modification conflicts across agents", async () => {
			const handler = registeredTools.get("contextos_compare")!;
			const res = await handler({ dir: process.cwd() });

			expect(res.isError).toBeFalsy();
			const parsed = JSON.parse(res.content[0].text);
			expect(parsed.agents.length).toBe(2);
			expect(parsed.potential_conflicts.length).toBe(1);
			expect(parsed.potential_conflicts[0].file).toBe("src/feature.ts");
			expect(parsed.recommendation).toContain("Use contextos_diff to review");
		});
	});

	describe("contextos_diff", () => {
		it("returns git diff for a valid completed thread", async () => {
			const handler = registeredTools.get("contextos_diff")!;
			const res = await handler({
				dir: process.cwd(),
				thread_id: "ctx_task1_openai",
			});

			expect(res.isError).toBeFalsy();
			const parsed = JSON.parse(res.content[0].text);
			expect(parsed.thread_id).toBe("ctx_task1_openai");
			expect(parsed.diff).toContain("+console.log('hello');");
		});

		it("returns error if thread does not exist", async () => {
			const handler = registeredTools.get("contextos_diff")!;
			const res = await handler({
				dir: process.cwd(),
				thread_id: "nonexistent_thread",
			});

			expect(res.isError).toBe(true);
			expect(res.content[0].text).toContain("Thread nonexistent_thread not found");
		});
	});

	describe("contextos_merge", () => {
		it("merges the selected thread branch", async () => {
			const handler = registeredTools.get("contextos_merge")!;
			const res = await handler({
				dir: process.cwd(),
				thread_id: "ctx_task1_openai",
			});

			expect(res.isError).toBeFalsy();
			const parsed = JSON.parse(res.content[0].text);
			expect(parsed.merged).toBe(true);
			expect(parsed.branch).toBe("swarm/ctx_task1_openai");
		});
	});

	describe("contextos_cleanup", () => {
		it("cleans up session resources", async () => {
			const handler = registeredTools.get("contextos_cleanup")!;
			const res = await handler({ dir: process.cwd() });

			expect(res.isError).toBeFalsy();
			const parsed = JSON.parse(res.content[0].text);
			expect(parsed.cleaned_up).toBe(true);
		});
	});
});
