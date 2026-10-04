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
			writeScope: ["."],
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
		verificationAttestation: {
			status: "PASS",
			evidence: {
				exitCode: 0,
				outputSha256: "",
				redactedPreview: "",
				totalTests: 1,
				passedTests: 1,
				failedTests: 0,
				signal: null,
			},
			subject: { repositoryFingerprint: "", baseSha: "", headSha: "", diffSha256: "", scopeSha256: "" },
			runnerMode: "host-unsafe",
			schemaVersion: 1,
		},
		reviewAttestation: {
			status: "PASS",
			llmVerdict: { specCompliance: "PASS", codeQuality: "PASS", summary: "" },
			subject: { repositoryFingerprint: "", baseSha: "", headSha: "", diffSha256: "", scopeSha256: "" },
			implementerExecutionId: "",
			reviewerExecutionId: "",
			provider: "",
			model: "",
			independenceLevel: "same_process",
			rawOutputDigest: "",
			retries: 0,
			schemaVersion: 1,
		},
		scopeViolation: false,
	},
	{
		id: "ctx_task1_anthropic",
		status: "completed",
		phase: "completed",
		config: {
			task: "Add feature",
			writeScope: ["."],
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
		verificationAttestation: {
			status: "PASS",
			evidence: {
				exitCode: 0,
				outputSha256: "",
				redactedPreview: "",
				totalTests: 1,
				passedTests: 1,
				failedTests: 0,
				signal: null,
			},
			subject: { repositoryFingerprint: "", baseSha: "", headSha: "", diffSha256: "", scopeSha256: "" },
			runnerMode: "host-unsafe",
			schemaVersion: 1,
		},
		reviewAttestation: {
			status: "PASS",
			llmVerdict: { specCompliance: "PASS", codeQuality: "PASS", summary: "" },
			subject: { repositoryFingerprint: "", baseSha: "", headSha: "", diffSha256: "", scopeSha256: "" },
			implementerExecutionId: "",
			reviewerExecutionId: "",
			provider: "",
			model: "",
			independenceLevel: "same_process",
			rawOutputDigest: "",
			retries: 0,
			schemaVersion: 1,
		},
		scopeViolation: false,
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
	inspectSession: vi.fn(() => ({
		dir: process.cwd(),
		threads: mockThreads,
		asyncTasks: {},
		budget: { totalSpentUsd: 0.05, sessionLimitUsd: 10, totalTokens: { input: 5000, output: 2000 } },
	})),
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
	isEligibleForMerge: vi.fn(() => ({ eligible: true })),
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

import { cleanupSession, getSession, inspectSession, recordAsyncJob, spawnThread } from "../../src/mcp/session.js";
import { registerContextosTools } from "../../src/mcp/tools/contextos.js";
import { isEligibleForMerge, mergeThreadBranch } from "../../src/worktree/merge.js";

vi.mock("../../src/worktree/manager.js", () => ({
	readWorktreeDiff: vi.fn(async () => "diff --git a/hello.ts b/hello.ts\n+console.log('hello');"),
}));

// Handler contracts use a controlled context dependency. Real source loading
// is exercised by loader and installed-consumer tests.
vi.mock("../../src/contextos/loader.js", () => ({
	assembleContextPrompt: vi.fn(() => ({
		prompt: "Fixture engineering instructions",
		report: { sources: [], warnings: [] },
	})),
}));

beforeEach(() => {
	registeredTools.clear();
	vi.clearAllMocks();
	registerContextosTools(mockServer as any, process.cwd());
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("registerContextosTools", () => {
	it("registers exactly three read-only tools by default", () => {
		expect(registeredTools.size).toBe(3);
		expect(registeredTools.has("contextos_delegate")).toBe(false);
		expect(registeredTools.has("contextos_status")).toBe(true);
		expect(registeredTools.has("contextos_compare")).toBe(true);
		expect(registeredTools.has("contextos_diff")).toBe(true);
		expect(registeredTools.has("contextos_merge")).toBe(false);
		expect(registeredTools.has("contextos_cleanup")).toBe(false);
	});

	it("exposes mutation tools only with explicit experimental runtime opt-in", () => {
		registeredTools.clear();
		registerContextosTools(mockServer as any, process.cwd(), true);
		expect([...registeredTools.keys()].sort()).toEqual([
			"contextos_cleanup",
			"contextos_compare",
			"contextos_delegate",
			"contextos_diff",
			"contextos_merge",
			"contextos_status",
		]);
	});

	it("read-only handlers inspect state without creating a runtime session", async () => {
		for (const name of ["contextos_status", "contextos_compare", "contextos_diff"]) {
			const res = await registeredTools.get(name)!({ dir: process.cwd(), thread_id: "ctx_task1_openai" });
			expect(res.isError).toBeFalsy();
		}
		expect(inspectSession).toHaveBeenCalledTimes(3);
		expect(getSession).not.toHaveBeenCalled();
	});

	it("rejects a missing repository before inspecting state", async () => {
		const res = await registeredTools.get("contextos_status")!({ dir: "nonexistent-release-repository" });
		expect(res.isError).toBe(true);
		expect(inspectSession).not.toHaveBeenCalled();
		expect(getSession).not.toHaveBeenCalled();
	});

	describe("contextos_delegate", () => {
		beforeEach(() => {
			registeredTools.clear();
			registerContextosTools(mockServer as any, process.cwd(), true);
		});
		it("delegates synchronously and forwards the bounded write scope", async () => {
			const handler = registeredTools.get("contextos_delegate")!;
			const res = await handler({
				dir: process.cwd(),
				task: "Build authentication modal with React",
				write_scope: { allow: ["src"], deny: [] },
				agents: [
					{ provider: "openai", model: "gpt-4o" },
					{ provider: "anthropic", model: "claude-sonnet-4-6" },
				],
				wait: true,
			});

			expect(res.isError, res.content[0].text).toBeFalsy();
			const parsed = JSON.parse(res.content[0].text);
			expect(parsed.status).toBe("completed");
			expect(parsed.agents.length).toBe(2);
			expect(parsed.agents[0].status).toBe("completed");
			expect(spawnThread).toHaveBeenCalledTimes(2);
			expect(spawnThread).toHaveBeenCalledWith(mockSession, expect.objectContaining({ writeScope: ["src"] }));
		});

		it("blocks file paths that escape repository before session creation or execution", async () => {
			const handler = registeredTools.get("contextos_delegate")!;
			const res = await handler({
				dir: process.cwd(),
				task: "Test task",
				write_scope: { allow: ["src"], deny: [] },
				agents: [{ provider: "openai", model: "gpt-4o" }],
				files: ["../../../../etc/passwd"],
			});

			expect(res.isError).toBe(true);
			expect(res.content[0].text).toContain("File path security violation");
			expect(getSession).not.toHaveBeenCalled();
			expect(spawnThread).not.toHaveBeenCalled();
		});

		it("delegates asynchronously and records completion after the response", async () => {
			const handler = registeredTools.get("contextos_delegate")!;
			const res = await handler({
				dir: process.cwd(),
				task: "Refactor backend database models",
				write_scope: { allow: ["src"], deny: [] },
				agents: [{ provider: "gemini", model: "gemini-2.5-pro" }],
				wait: false,
			});

			expect(res.isError, res.content[0].text).toBeFalsy();
			const parsed = JSON.parse(res.content[0].text);
			expect(parsed.status).toBe("running");
			expect(parsed.message).toContain("Poll status with contextos_status");
			expect(parsed.agents[0].status).toBe("running");
			expect(recordAsyncJob).toHaveBeenCalledWith(mockSession, parsed.task_id, 1, "running");
			await vi.waitFor(() =>
				expect(recordAsyncJob).toHaveBeenLastCalledWith(mockSession, parsed.task_id, 1, "completed"),
			);
		});

		it("denies execution without a write scope even when focus files are supplied", async () => {
			const res = await registeredTools.get("contextos_delegate")!({
				dir: process.cwd(),
				task: "Change source",
				files: ["src/index.ts"],
				agents: [{ provider: "openai" }],
			});
			expect(res.isError).toBe(true);
			expect(res.content[0].text).toContain("write_scope is required");
			expect(spawnThread).not.toHaveBeenCalled();
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
		beforeEach(() => {
			registeredTools.clear();
			registerContextosTools(mockServer as any, process.cwd(), true);
		});
		it("merges the selected thread branch through the eligibility gate", async () => {
			const handler = registeredTools.get("contextos_merge")!;
			const res = await handler({
				dir: process.cwd(),
				thread_id: "ctx_task1_openai",
			});

			expect(res.isError).toBeFalsy();
			const parsed = JSON.parse(res.content[0].text);
			expect(parsed.merged).toBe(true);
			expect(parsed.branch).toBe("swarm/ctx_task1_openai");
			expect(mergeThreadBranch).toHaveBeenCalledWith(
				mockSession.dir,
				mockThreads[0].branchName,
				mockThreads[0].id,
				mockThreads[0],
			);
		});
		it("refuses a stale verification result before calling Git merge", async () => {
			vi.mocked(isEligibleForMerge).mockReturnValueOnce({ eligible: false, reason: "verification is STALE" });
			const res = await registeredTools.get("contextos_merge")!({ dir: process.cwd(), thread_id: "ctx_task1_openai" });
			expect(res.isError).toBe(true);
			expect(res.content[0].text).toContain("STALE");
			expect(mergeThreadBranch).not.toHaveBeenCalled();
		});
	});

	describe("contextos_cleanup", () => {
		beforeEach(() => {
			registeredTools.clear();
			registerContextosTools(mockServer as any, process.cwd(), true);
		});
		it("cleans up session resources", async () => {
			const handler = registeredTools.get("contextos_cleanup")!;
			const res = await handler({ dir: process.cwd() });

			expect(res.isError).toBeFalsy();
			const parsed = JSON.parse(res.content[0].text);
			expect(parsed.cleaned_up).toBe(true);
			expect(cleanupSession).toHaveBeenCalledTimes(1);
		});
		it("preserves dry-run semantics", async () => {
			const res = await registeredTools.get("contextos_cleanup")!({ dir: process.cwd(), dry_run: true });
			expect(JSON.parse(res.content[0].text)).toMatchObject({ cleaned_up: false, dry_run: true });
			expect(cleanupSession).toHaveBeenCalledWith(mockSession.dir, undefined, true);
		});
	});
});
