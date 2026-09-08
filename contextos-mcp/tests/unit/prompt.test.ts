/**
 * Tests for buildSwarmSystemPrompt — declarative action orchestrator prompt generation (Task 0.2d).
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

describe("buildSwarmSystemPrompt (Task 0.2d)", () => {
	describe("contains declarative actions", () => {
		it("includes spawn, wait, inspect_diff, review, merge, finish", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain('"action": "spawn"');
			expect(prompt).toContain('"action": "wait"');
			expect(prompt).toContain('"action": "inspect_diff"');
			expect(prompt).toContain('"action": "review"');
			expect(prompt).toContain('"action": "merge"');
			expect(prompt).toContain('"action": "finish"');
		});

		it("contains zero references to FINAL() or print() or executable code in orchestration prompt", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).not.toContain("FINAL(");
			expect(prompt).not.toContain("print(");
			expect(prompt).not.toContain("```javascript");
			expect(prompt).not.toContain("```python");
		});
	});

	describe("contains config values", () => {
		it("includes default_model in template", () => {
			const config = makeConfig({ default_model: "my-custom/model-99" });
			const prompt = buildSwarmSystemPrompt(config);
			expect(prompt).toContain("my-custom/model-99");
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
			expect(prompt).not.toContain("## Available Agents");
		});

		it("omits Available Agents heading when descriptions is undefined", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig(), undefined);
			expect(prompt).not.toContain("## Available Agents");
		});
	});

	describe("rules section", () => {
		it("contains Orchestration Rules heading", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("## Orchestration Rules");
		});

		it("contains writeScope rule", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("writeScope");
		});

		it("contains JSON code block instruction", () => {
			const prompt = buildSwarmSystemPrompt(makeConfig());
			expect(prompt).toContain("```json");
		});
	});
});
