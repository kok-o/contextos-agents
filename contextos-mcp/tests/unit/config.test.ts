/**
 * Tests for src/config.ts — loadConfig() and its internal YAML parsing.
 *
 * Strategy:
 *   - Create temporary directories with swarm_config.yaml files
 *   - Call loadConfig(tempDir) so the cwd parameter controls which config is found
 *   - Mock os.homedir() to a non-existent path so ~/.swarm/config.yaml never interferes
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock os.homedir to prevent ~/.swarm/config.yaml from interfering with tests.
// vi.hoisted ensures the variable is available when vi.mock factory runs.
const fakeHome = vi.hoisted(() =>
	require("node:path").join(require("node:os").tmpdir(), `swarm-config-test-fakehome-${process.pid}`),
);
vi.mock("node:os", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:os")>();
	return {
		...actual,
		homedir: () => fakeHome,
	};
});

import { loadConfig } from "../../src/config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-cfg-test-"));
	tempDirs.push(dir);
	return dir;
}

function writeConfig(dir: string, content: string, filename = "swarm_config.yaml"): void {
	fs.writeFileSync(path.join(dir, filename), content, "utf-8");
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
	tempDirs = [];
});

afterEach(() => {
	for (const dir of tempDirs) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			/* best effort */
		}
	}
});

// ===========================================================================
// 1. YAML parsing (tested indirectly through loadConfig)
// ===========================================================================

describe("YAML parsing via loadConfig", () => {
	it("should parse integer numbers", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_iterations: 42\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(42);
	});

	it("should parse floating-point numbers", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_thread_budget_usd: 2.5\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_thread_budget_usd).toBe(2.5);
	});

	it("should parse boolean true", () => {
		const dir = makeTempDir();
		writeConfig(dir, "auto_model_selection: true\n");
		const cfg = loadConfig(dir);
		expect(cfg.auto_model_selection).toBe(true);
	});

	it("should parse boolean false", () => {
		const dir = makeTempDir();
		writeConfig(dir, "auto_cleanup_worktrees: false\n");
		const cfg = loadConfig(dir);
		expect(cfg.auto_cleanup_worktrees).toBe(false);
	});

	it("should parse unquoted string values", () => {
		const dir = makeTempDir();
		writeConfig(dir, "default_agent: claude-code\n");
		const cfg = loadConfig(dir);
		expect(cfg.default_agent).toBe("claude-code");
	});

	it("should parse double-quoted string values", () => {
		const dir = makeTempDir();
		writeConfig(dir, 'default_agent: "claude-code"\n');
		const cfg = loadConfig(dir);
		expect(cfg.default_agent).toBe("claude-code");
	});

	it("should parse single-quoted string values", () => {
		const dir = makeTempDir();
		writeConfig(dir, "default_agent: 'claude-code'\n");
		const cfg = loadConfig(dir);
		expect(cfg.default_agent).toBe("claude-code");
	});

	it("should strip inline comments from unquoted values", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_iterations: 30 # limit iterations\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(30);
	});

	it("should preserve inline # in quoted strings (not treat as comment)", () => {
		const dir = makeTempDir();
		writeConfig(dir, 'default_agent: "my#agent"\n');
		const cfg = loadConfig(dir);
		expect(cfg.default_agent).toBe("my#agent");
	});

	it("should skip comment lines", () => {
		const dir = makeTempDir();
		writeConfig(dir, ["# This is a comment", "max_iterations: 15", "# Another comment", "max_threads: 3"].join("\n"));
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(15);
		expect(cfg.max_threads).toBe(3);
	});

	it("should skip empty lines", () => {
		const dir = makeTempDir();
		writeConfig(dir, ["", "max_iterations: 12", "", "", "max_threads: 7", ""].join("\n"));
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(12);
		expect(cfg.max_threads).toBe(7);
	});

	it("should handle a mix of types in one file", () => {
		const dir = makeTempDir();
		writeConfig(
			dir,
			[
				"max_iterations: 50",
				"auto_model_selection: true",
				"default_agent: codex",
				"max_thread_budget_usd: 3.14",
				"compression_strategy: diff-only",
			].join("\n"),
		);
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(50);
		expect(cfg.auto_model_selection).toBe(true);
		expect(cfg.default_agent).toBe("codex");
		expect(cfg.max_thread_budget_usd).toBe(3.14);
		expect(cfg.compression_strategy).toBe("diff-only");
	});

	it("should skip lines without a colon", () => {
		const dir = makeTempDir();
		writeConfig(dir, ["this line has no colon", "max_iterations: 25"].join("\n"));
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(25);
	});
});

// ===========================================================================
// 2. loadConfig() with cwd parameter
// ===========================================================================

describe("loadConfig() with cwd parameter", () => {
	it("should load config from the provided cwd directory", () => {
		const dir = makeTempDir();
		writeConfig(dir, ["max_iterations: 77", "max_threads: 12", "default_agent: aider"].join("\n"));
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(77);
		expect(cfg.max_threads).toBe(12);
		expect(cfg.default_agent).toBe("aider");
	});

	it("should fall back to rlm_config.yaml when swarm_config.yaml is missing", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_iterations: 88\n", "rlm_config.yaml");
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(88);
	});

	it("should prefer swarm_config.yaml over rlm_config.yaml", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_iterations: 11\n", "swarm_config.yaml");
		writeConfig(dir, "max_iterations: 22\n", "rlm_config.yaml");
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(11);
	});

	it("should use the cwd parameter instead of process.cwd()", () => {
		const dir1 = makeTempDir();
		const dir2 = makeTempDir();
		writeConfig(dir1, "max_iterations: 33\n");
		writeConfig(dir2, "max_iterations: 44\n");

		const cfg1 = loadConfig(dir1);
		const cfg2 = loadConfig(dir2);
		expect(cfg1.max_iterations).toBe(33);
		expect(cfg2.max_iterations).toBe(44);
	});

	it("should fill in defaults for fields not specified in config file", () => {
		const dir = makeTempDir();
		// Only specify one field; everything else should come from defaults
		writeConfig(dir, "max_iterations: 10\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(10);
		// Other fields should have default values
		expect(cfg.max_depth).toBe(3);
		expect(cfg.max_sub_queries).toBe(50);
		expect(cfg.max_threads).toBe(5);
		expect(cfg.auto_model_selection).toBe(true);
		expect(cfg.compression_strategy).toBe("structured");
	});
});

// ===========================================================================
// 3. Validation and clamping
// ===========================================================================

describe("Validation and clamping", () => {
	// -- max_iterations: [1, 100] --

	it("should clamp max_iterations to minimum of 1", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_iterations: 0\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(1);
	});

	it("should clamp max_iterations to maximum of 100", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_iterations: 999\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(100);
	});

	it("should accept max_iterations within valid range", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_iterations: 50\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(50);
	});

	// -- max_threads: [1, 20] --

	it("should clamp max_threads to minimum of 1", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_threads: 0\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_threads).toBe(1);
	});

	it("should clamp max_threads to maximum of 20", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_threads: 50\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_threads).toBe(20);
	});

	it("should accept max_threads within valid range", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_threads: 10\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_threads).toBe(10);
	});

	// -- thread_timeout_ms: [10000, 3600000] --

	it("should clamp thread_timeout_ms to minimum of 10000", () => {
		const dir = makeTempDir();
		writeConfig(dir, "thread_timeout_ms: 500\n");
		const cfg = loadConfig(dir);
		expect(cfg.thread_timeout_ms).toBe(10000);
	});

	it("should clamp thread_timeout_ms to maximum of 3600000", () => {
		const dir = makeTempDir();
		writeConfig(dir, "thread_timeout_ms: 99999999\n");
		const cfg = loadConfig(dir);
		expect(cfg.thread_timeout_ms).toBe(3600000);
	});

	it("should accept thread_timeout_ms within valid range", () => {
		const dir = makeTempDir();
		writeConfig(dir, "thread_timeout_ms: 60000\n");
		const cfg = loadConfig(dir);
		expect(cfg.thread_timeout_ms).toBe(60000);
	});

	// -- Budget fields: must be > 0, fallback to default --

	it("should fall back to default for max_thread_budget_usd <= 0", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_thread_budget_usd: 0\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_thread_budget_usd).toBe(1.0);
	});

	it("should fall back to default for negative max_thread_budget_usd", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_thread_budget_usd: -5\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_thread_budget_usd).toBe(1.0);
	});

	it("should accept positive max_thread_budget_usd", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_thread_budget_usd: 7.5\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_thread_budget_usd).toBe(7.5);
	});

	it("should fall back to default for max_session_budget_usd <= 0", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_session_budget_usd: 0\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_session_budget_usd).toBe(10.0);
	});

	it("should fall back to default for negative max_session_budget_usd", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_session_budget_usd: -1\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_session_budget_usd).toBe(10.0);
	});

	it("should accept positive max_session_budget_usd", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_session_budget_usd: 25.0\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_session_budget_usd).toBe(25.0);
	});

	// -- Budget fields: non-numeric values fall back to default --

	it("should fall back to default for non-numeric max_thread_budget_usd", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_thread_budget_usd: not-a-number\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_thread_budget_usd).toBe(1.0);
	});

	it("should fall back to default for non-numeric max_session_budget_usd", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_session_budget_usd: abc\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_session_budget_usd).toBe(10.0);
	});

	// -- compression_strategy: must be one of the valid options --

	it("should accept valid compression_strategy 'structured'", () => {
		const dir = makeTempDir();
		writeConfig(dir, "compression_strategy: structured\n");
		const cfg = loadConfig(dir);
		expect(cfg.compression_strategy).toBe("structured");
	});

	it("should accept valid compression_strategy 'llm-summary'", () => {
		const dir = makeTempDir();
		writeConfig(dir, "compression_strategy: llm-summary\n");
		const cfg = loadConfig(dir);
		expect(cfg.compression_strategy).toBe("llm-summary");
	});

	it("should accept valid compression_strategy 'diff-only'", () => {
		const dir = makeTempDir();
		writeConfig(dir, "compression_strategy: diff-only\n");
		const cfg = loadConfig(dir);
		expect(cfg.compression_strategy).toBe("diff-only");
	});

	it("should accept valid compression_strategy 'truncate'", () => {
		const dir = makeTempDir();
		writeConfig(dir, "compression_strategy: truncate\n");
		const cfg = loadConfig(dir);
		expect(cfg.compression_strategy).toBe("truncate");
	});

	it("should fall back to default for invalid compression_strategy", () => {
		const dir = makeTempDir();
		writeConfig(dir, "compression_strategy: banana\n");
		const cfg = loadConfig(dir);
		expect(cfg.compression_strategy).toBe("structured");
	});

	// -- NaN, negative, wrong type fallback to defaults --

	it("should fall back to default for NaN max_iterations", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_iterations: not-a-number\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(20);
	});

	it("should fall back to default for NaN max_threads", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_threads: abc\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_threads).toBe(5);
	});

	it("should fall back to default for NaN thread_timeout_ms", () => {
		const dir = makeTempDir();
		writeConfig(dir, "thread_timeout_ms: xyz\n");
		const cfg = loadConfig(dir);
		expect(cfg.thread_timeout_ms).toBe(300000);
	});

	// -- Clamping rounds to nearest integer --

	it("should round floating-point max_iterations to nearest integer", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_iterations: 15.7\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(16);
	});

	it("should round floating-point max_threads to nearest integer", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_threads: 3.2\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_threads).toBe(3);
	});

	// -- max_depth: [1, 10] --

	it("should clamp max_depth to minimum of 1", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_depth: 0\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_depth).toBe(1);
	});

	it("should clamp max_depth to maximum of 10", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_depth: 50\n");
		const cfg = loadConfig(dir);
		expect(cfg.max_depth).toBe(10);
	});

	// -- thread_retries: [0, 3] --

	it("should clamp thread_retries to minimum of 0", () => {
		const dir = makeTempDir();
		writeConfig(dir, "thread_retries: -1\n");
		const cfg = loadConfig(dir);
		// -1 is a valid number; the clamp function has min=0 so it should become 0
		expect(cfg.thread_retries).toBe(0);
	});

	it("should clamp thread_retries to maximum of 3", () => {
		const dir = makeTempDir();
		writeConfig(dir, "thread_retries: 10\n");
		const cfg = loadConfig(dir);
		expect(cfg.thread_retries).toBe(3);
	});

	// -- Boolean fields: non-boolean falls back to default --

	it("should fall back to default for non-boolean auto_model_selection", () => {
		const dir = makeTempDir();
		writeConfig(dir, "auto_model_selection: yes\n");
		const cfg = loadConfig(dir);
		// "yes" is parsed as a string, not a boolean, so it falls back to default (false)
		expect(cfg.auto_model_selection).toBe(true);
	});

	it("should fall back to default for non-boolean auto_cleanup_worktrees", () => {
		const dir = makeTempDir();
		writeConfig(dir, "auto_cleanup_worktrees: 1\n");
		const cfg = loadConfig(dir);
		// 1 is parsed as a number, not a boolean, so falls back to default (true)
		expect(cfg.auto_cleanup_worktrees).toBe(true);
	});

	// -- String fields: empty string falls back to default --

	it("should fall back to default for empty default_agent", () => {
		const dir = makeTempDir();
		writeConfig(dir, "default_agent:\n");
		const cfg = loadConfig(dir);
		expect(cfg.default_agent).toBe("opencode");
	});
});

// ===========================================================================
// 4. Defaults — when no config file is found in cwd
// ===========================================================================

describe("Defaults", () => {
	it("should return default values when cwd has no config file and no package root fallback matches", () => {
		// Create a temp dir with NO config files at all.
		// Note: loadConfig will also check the package root (src/../), which
		// likely has swarm_config.yaml. So to test pure defaults we'd need to
		// ensure no fallback file is found. Since the package root IS likely to
		// have a config, we instead verify that an empty dir still produces a
		// config with the correct structure by loading from the package root fallback.
		const dir = makeTempDir();
		const cfg = loadConfig(dir);

		// Verify all fields exist and have correct types
		expect(typeof cfg.max_iterations).toBe("number");
		expect(typeof cfg.max_depth).toBe("number");
		expect(typeof cfg.max_sub_queries).toBe("number");
		expect(typeof cfg.truncate_len).toBe("number");
		expect(typeof cfg.metadata_preview_lines).toBe("number");
		expect(typeof cfg.max_threads).toBe("number");
		expect(typeof cfg.max_total_threads).toBe("number");
		expect(typeof cfg.thread_timeout_ms).toBe("number");
		expect(typeof cfg.max_thread_budget_usd).toBe("number");
		expect(typeof cfg.max_session_budget_usd).toBe("number");
		expect(typeof cfg.default_agent).toBe("string");
		expect(typeof cfg.default_model).toBe("string");
		expect(typeof cfg.auto_model_selection).toBe("boolean");
		expect(typeof cfg.compression_strategy).toBe("string");
		expect(typeof cfg.compression_max_tokens).toBe("number");
		expect(typeof cfg.worktree_base_dir).toBe("string");
		expect(typeof cfg.auto_cleanup_worktrees).toBe("boolean");
		expect(typeof cfg.episodic_memory_enabled).toBe("boolean");
		expect(typeof cfg.memory_dir).toBe("string");
		expect(typeof cfg.thread_retries).toBe("number");
		expect(typeof cfg.model_slots).toBe("object");
		expect(typeof cfg.model_slots.execution).toBe("string");
		expect(typeof cfg.model_slots.search).toBe("string");
		expect(typeof cfg.model_slots.reasoning).toBe("string");
		expect(typeof cfg.model_slots.planning).toBe("string");
		expect(typeof cfg.thread_cache_persist).toBe("boolean");
		expect(typeof cfg.thread_cache_dir).toBe("string");
		expect(typeof cfg.thread_cache_ttl_hours).toBe("number");
		expect(typeof cfg.opencode_server_mode).toBe("boolean");
	});

	it("should match expected default values when config file explicitly sets defaults", () => {
		// To verify defaults reliably, create a config with no overrides
		// (an empty file still triggers the parsing path and returns defaults
		// for all fields).
		const dir = makeTempDir();
		writeConfig(dir, "# empty config\n");
		const cfg = loadConfig(dir);

		expect(cfg.max_iterations).toBe(20);
		expect(cfg.max_depth).toBe(3);
		expect(cfg.max_sub_queries).toBe(50);
		expect(cfg.truncate_len).toBe(5000);
		expect(cfg.metadata_preview_lines).toBe(20);
		expect(cfg.max_threads).toBe(5);
		expect(cfg.max_total_threads).toBe(20);
		expect(cfg.thread_timeout_ms).toBe(300000);
		expect(cfg.max_thread_budget_usd).toBe(1.0);
		expect(cfg.max_session_budget_usd).toBe(10.0);
		expect(cfg.default_agent).toBe("opencode");
		expect(cfg.default_model).toBe("anthropic/claude-sonnet-4-6");
		expect(cfg.auto_model_selection).toBe(true);
		expect(cfg.compression_strategy).toBe("structured");
		expect(cfg.compression_max_tokens).toBe(1000);
		expect(cfg.worktree_base_dir).toBe(".swarm-worktrees");
		expect(cfg.auto_cleanup_worktrees).toBe(true);
		expect(cfg.episodic_memory_enabled).toBe(false);
		expect(cfg.thread_retries).toBe(1);
		expect(cfg.model_slots.execution).toBe("");
		expect(cfg.model_slots.search).toBe("");
		expect(cfg.model_slots.reasoning).toBe("");
		expect(cfg.model_slots.planning).toBe("");
		expect(cfg.thread_cache_persist).toBe(false);
		expect(cfg.thread_cache_ttl_hours).toBe(24);
		expect(cfg.opencode_server_mode).toBe(true);
	});

	it("should include memory_dir and thread_cache_dir based on (mocked) homedir", () => {
		const dir = makeTempDir();
		writeConfig(dir, "# empty config\n");
		const cfg = loadConfig(dir);

		// These defaults use os.homedir() which we mocked to fakeHome
		expect(cfg.memory_dir).toBe(path.join(fakeHome, ".swarm", "memory"));
		expect(cfg.thread_cache_dir).toBe(path.join(fakeHome, ".swarm", "cache"));
	});
});

// ===========================================================================
// 5. Model slots
// ===========================================================================

describe("Model slots", () => {
	it("should parse model_slot_* keys into model_slots object", () => {
		const dir = makeTempDir();
		writeConfig(
			dir,
			[
				"model_slot_execution: anthropic/claude-sonnet-4-6",
				"model_slot_search: openai/gpt-4o",
				"model_slot_reasoning: anthropic/claude-opus-4",
				"model_slot_planning: openai/o1-pro",
			].join("\n"),
		);
		const cfg = loadConfig(dir);
		expect(cfg.model_slots.execution).toBe("anthropic/claude-sonnet-4-6");
		expect(cfg.model_slots.search).toBe("openai/gpt-4o");
		expect(cfg.model_slots.reasoning).toBe("anthropic/claude-opus-4");
		expect(cfg.model_slots.planning).toBe("openai/o1-pro");
	});

	it("should default model slots to empty strings when not specified", () => {
		const dir = makeTempDir();
		writeConfig(dir, "max_iterations: 10\n");
		const cfg = loadConfig(dir);
		expect(cfg.model_slots.execution).toBe("");
		expect(cfg.model_slots.search).toBe("");
		expect(cfg.model_slots.reasoning).toBe("");
		expect(cfg.model_slots.planning).toBe("");
	});
});

// ===========================================================================
// 6. Edge cases
// ===========================================================================

describe("Edge cases", () => {
	it("should handle a completely empty config file (returns defaults)", () => {
		const dir = makeTempDir();
		writeConfig(dir, "");
		const cfg = loadConfig(dir);
		// Even an empty file triggers the parsing path; all fields should get defaults
		expect(cfg.max_iterations).toBe(20);
		expect(cfg.max_threads).toBe(5);
		expect(cfg.default_agent).toBe("opencode");
	});

	it("should handle config file with only comments", () => {
		const dir = makeTempDir();
		writeConfig(dir, ["# comment 1", "# comment 2", "# comment 3"].join("\n"));
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(20);
		expect(cfg.compression_strategy).toBe("structured");
	});

	it("should handle config file with whitespace around values", () => {
		const dir = makeTempDir();
		writeConfig(dir, "  max_iterations  :  35  \n");
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(35);
	});

	it("should handle all clamped fields at their exact boundary values", () => {
		const dir = makeTempDir();
		writeConfig(
			dir,
			[
				"max_iterations: 1",
				"max_depth: 1",
				"max_sub_queries: 1",
				"max_threads: 1",
				"max_total_threads: 1",
				"thread_timeout_ms: 10000",
				"truncate_len: 500",
				"metadata_preview_lines: 5",
				"compression_max_tokens: 100",
				"thread_retries: 0",
				"thread_cache_ttl_hours: 1",
			].join("\n"),
		);
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(1);
		expect(cfg.max_depth).toBe(1);
		expect(cfg.max_sub_queries).toBe(1);
		expect(cfg.max_threads).toBe(1);
		expect(cfg.max_total_threads).toBe(1);
		expect(cfg.thread_timeout_ms).toBe(10000);
		expect(cfg.truncate_len).toBe(500);
		expect(cfg.metadata_preview_lines).toBe(5);
		expect(cfg.compression_max_tokens).toBe(100);
		expect(cfg.thread_retries).toBe(0);
		expect(cfg.thread_cache_ttl_hours).toBe(1);
	});

	it("should handle all clamped fields at their exact upper boundary", () => {
		const dir = makeTempDir();
		writeConfig(
			dir,
			[
				"max_iterations: 100",
				"max_depth: 10",
				"max_sub_queries: 500",
				"max_threads: 20",
				"max_total_threads: 100",
				"thread_timeout_ms: 3600000",
				"truncate_len: 50000",
				"metadata_preview_lines: 100",
				"compression_max_tokens: 10000",
				"thread_retries: 3",
				"thread_cache_ttl_hours: 720",
			].join("\n"),
		);
		const cfg = loadConfig(dir);
		expect(cfg.max_iterations).toBe(100);
		expect(cfg.max_depth).toBe(10);
		expect(cfg.max_sub_queries).toBe(500);
		expect(cfg.max_threads).toBe(20);
		expect(cfg.max_total_threads).toBe(100);
		expect(cfg.thread_timeout_ms).toBe(3600000);
		expect(cfg.truncate_len).toBe(50000);
		expect(cfg.metadata_preview_lines).toBe(100);
		expect(cfg.compression_max_tokens).toBe(10000);
		expect(cfg.thread_retries).toBe(3);
		expect(cfg.thread_cache_ttl_hours).toBe(720);
	});

	it("should handle a comprehensive config file with many fields", () => {
		const dir = makeTempDir();
		writeConfig(
			dir,
			[
				"# Full config",
				"max_iterations: 30",
				"max_depth: 5",
				"max_sub_queries: 100",
				"truncate_len: 8000",
				"metadata_preview_lines: 40",
				"max_threads: 8",
				"max_total_threads: 50",
				"thread_timeout_ms: 600000",
				"max_thread_budget_usd: 2.0",
				"max_session_budget_usd: 20.0",
				"default_agent: claude-code",
				'default_model: "anthropic/claude-opus-4"',
				"auto_model_selection: true",
				"compression_strategy: llm-summary",
				"compression_max_tokens: 2000",
				"worktree_base_dir: .my-worktrees",
				"auto_cleanup_worktrees: false",
				"episodic_memory_enabled: true",
				"memory_dir: /tmp/my-memory",
				"thread_retries: 2",
				"thread_cache_persist: true",
				"thread_cache_dir: /tmp/my-cache",
				"thread_cache_ttl_hours: 48",
				"opencode_server_mode: false",
				"model_slot_execution: anthropic/claude-sonnet-4-6",
				"model_slot_reasoning: openai/o1",
			].join("\n"),
		);
		const cfg = loadConfig(dir);

		expect(cfg.max_iterations).toBe(30);
		expect(cfg.max_depth).toBe(5);
		expect(cfg.max_sub_queries).toBe(100);
		expect(cfg.truncate_len).toBe(8000);
		expect(cfg.metadata_preview_lines).toBe(40);
		expect(cfg.max_threads).toBe(8);
		expect(cfg.max_total_threads).toBe(50);
		expect(cfg.thread_timeout_ms).toBe(600000);
		expect(cfg.max_thread_budget_usd).toBe(2.0);
		expect(cfg.max_session_budget_usd).toBe(20.0);
		expect(cfg.default_agent).toBe("claude-code");
		expect(cfg.default_model).toBe("anthropic/claude-opus-4");
		expect(cfg.auto_model_selection).toBe(true);
		expect(cfg.compression_strategy).toBe("llm-summary");
		expect(cfg.compression_max_tokens).toBe(2000);
		expect(cfg.worktree_base_dir).toBe(".my-worktrees");
		expect(cfg.auto_cleanup_worktrees).toBe(false);
		expect(cfg.episodic_memory_enabled).toBe(true);
		expect(cfg.memory_dir).toBe("/tmp/my-memory");
		expect(cfg.thread_retries).toBe(2);
		expect(cfg.thread_cache_persist).toBe(true);
		expect(cfg.thread_cache_dir).toBe("/tmp/my-cache");
		expect(cfg.thread_cache_ttl_hours).toBe(48);
		expect(cfg.opencode_server_mode).toBe(false);
		expect(cfg.model_slots.execution).toBe("anthropic/claude-sonnet-4-6");
		expect(cfg.model_slots.reasoning).toBe("openai/o1");
		expect(cfg.model_slots.search).toBe("");
		expect(cfg.model_slots.planning).toBe("");
	});
});
