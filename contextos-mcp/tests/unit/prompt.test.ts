/**
 * Tests for buildSwarmSystemPrompt — orchestrator system prompt generation.
 */

import { describe, expect, it } from "vitest";
import type { SwarmConfig } from "../../src/core/types.js";
import { buildSwarmSystemPrompt } from "../../src/prompts/orchestrator.js";

// ── Mock config ──────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<SwarmConfig> = {}): SwarmConfig {
	return {
		max_iterations: 20,
		max_depth: 3,
		max_sub_queries: 50,
		truncate_len: 5000,
		metadata_preview_lines: 20,
		max_threads: 5,
		max_total_threads: 30,
		thread_timeout_ms: 120000,
		max_thread_budget_usd: 2.0,
		max_session_budget_usd: 10.0,
		default_agent: "opencode",
		default_model: "anthropic/claude-sonnet-4-6",
		auto_model_selection: false,
		compression_strategy: "structured",
		compression_max_tokens: 2000,
		worktree_base_dir: "/tmp/worktrees",
		auto_cleanup_worktrees: true,
		episodic_memory_enabled: false,
		memory_dir: "/tmp/memory",
		thread_retries: 2,
		model_slots: {
			execution: "",
			search: "",
			reasoning: "",
			planning: "",
		},
		thread_cache_persist: false,
		thread_cache_dir: "/tmp/cache",
		thread_cache_ttl_hours: 24,
		opencode_server_mode: false,
		...overrides,
	} as SwarmConfig;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("buildSwarmSystemPrompt", () => {
	describe("contains all primitives", () => {
		it("includes llm_query", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("llm_query");
		});

		it("includes thread", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("thread(");
		});

		it("includes async_thread", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("async_thread");
		});

		it("includes merge_threads", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("merge_threads");
		});

		it("includes FINAL", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("FINAL(");
		});
	});

	describe("contains config values", () => {
		it("includes default_agent", () => {
			const config = makeConfig({ default_agent: "test-agent-xyz" });
			const prompt = buildSwarmSystemPrompt(config);
			expect(prompt).toContain("test-agent-xyz");
		});

		it("includes default_model", () => {
			const config = makeConfig({ default_model: "my-custom/model-99" });
			const prompt = buildSwarmSystemPrompt(config);
			expect(prompt).toContain("my-custom/model-99");
		});

		it("includes max_threads in context", () => {
			const config = makeConfig({ max_threads: 7 });
			const prompt = buildSwarmSystemPrompt(config);
			expect(prompt).toContain("7 concurrent");
		});

		it("includes max_total_threads in context", () => {
			const config = makeConfig({ max_total_threads: 42 });
			const prompt = buildSwarmSystemPrompt(config);
			expect(prompt).toContain("42 total");
		});

		it("includes thread_timeout_ms as seconds", () => {
			const config = makeConfig({ thread_timeout_ms: 180000 });
			const prompt = buildSwarmSystemPrompt(config);
			// 180000ms / 1000 = 180s — appears as "180s per thread"
			expect(prompt).toContain("180s");
		});
	});

	describe("strategy section", () => {
		it("contains 'Analyze first'", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("Analyze first");
		});

		it("contains 'Decompose'", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("Decompose");
		});

		it("contains 'Extract context'", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("Extract context");
		});

		it("contains 'Spawn threads'", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("Spawn threads");
		});
	});

	describe("examples section", () => {
		it("contains 'Single thread' example", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("Single thread");
		});

		it("contains 'Parallel threads' example", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("Parallel threads");
		});

		it("contains asyncio.gather usage", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("asyncio.gather");
		});
	});

	describe("agent descriptions", () => {
		it("includes agent descriptions when provided", () => {
			const descriptions = "- opencode: Fast coding agent\n- claude-code: Deep reasoning agent";
			const prompt = buildSwarmSystemPrompt(makeConfig(), descriptions);

			expect(prompt).toContain("Available Agents");
			expect(prompt).toContain("opencode: Fast coding agent");
			expect(prompt).toContain("claude-code: Deep reasoning agent");
		});

		it("omits Available Agents heading when descriptions not provided", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			// The "## Available Agents" heading should not appear, though text may reference agents
			expect(prompt).not.toContain("## Available Agents");
		});

		it("omits Available Agents heading when descriptions is undefined", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig(), undefined);
			expect(prompt).not.toContain("## Available Agents");
		});
	});

	describe("rules section", () => {
		it("contains Rules heading", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("## Rules");
		});

		it("contains Python code block instruction", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("Python 3");
		});

		it("contains the 'be specific in thread tasks' rule", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("Be specific in thread tasks");
		});

		it("contains the REPL persistence rule", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("REPL persists state");
		});
	});
});
