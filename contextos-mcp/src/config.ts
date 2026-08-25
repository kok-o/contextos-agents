/**
 * Configuration loader for swarm-code.
 *
 * Reads swarm_config.yaml (or rlm_config.yaml fallback) from project root or cwd.
 * Extends RLM config with swarm-specific fields.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/** Named model slot overrides — lets users assign specific models per task type. */
export interface ModelSlots {
	execution: string;
	search: string;
	reasoning: string;
	planning: string;
}

export interface SwarmConfig {
	// Inherited from RLM
	max_iterations: number;
	max_depth: number;
	max_sub_queries: number;
	truncate_len: number;
	metadata_preview_lines: number;

	// Swarm extensions
	max_threads: number;
	max_total_threads: number;
	thread_timeout_ms: number;
	max_thread_budget_usd: number;
	max_session_budget_usd: number;
	default_agent: string;
	default_model: string;
	auto_model_selection: boolean;
	compression_strategy: "structured" | "llm-summary" | "diff-only" | "truncate";
	compression_max_tokens: number;
	worktree_base_dir: string;
	auto_cleanup_worktrees: boolean;
	episodic_memory_enabled: boolean;
	memory_dir: string;
	thread_retries: number;
	model_slots: ModelSlots;
	thread_cache_persist: boolean;
	thread_cache_dir: string;
	thread_cache_ttl_hours: number;
	opencode_server_mode: boolean;
}

// Also export as RlmConfig for backwards compat with forked modules
export type RlmConfig = SwarmConfig;

const DEFAULTS: SwarmConfig = {
	// RLM defaults
	max_iterations: 20,
	max_depth: 3,
	max_sub_queries: 50,
	truncate_len: 5000,
	metadata_preview_lines: 20,

	// Swarm defaults
	max_threads: 5,
	max_total_threads: 20,
	thread_timeout_ms: 300000,
	max_thread_budget_usd: 1.0,
	max_session_budget_usd: 10.0,
	default_agent: "opencode",
	default_model: "anthropic/claude-sonnet-4-6",
	auto_model_selection: true,
	compression_strategy: "structured",
	compression_max_tokens: 1000,
	worktree_base_dir: ".swarm-worktrees",
	auto_cleanup_worktrees: true,
	episodic_memory_enabled: false,
	memory_dir: path.join(os.homedir(), ".swarm", "memory"),
	thread_retries: 1,
	model_slots: {
		execution: "", // empty = use agent's default based on complexity
		search: "",
		reasoning: "",
		planning: "",
	},
	thread_cache_persist: false,
	thread_cache_dir: path.join(os.homedir(), ".swarm", "cache"),
	thread_cache_ttl_hours: 24,
	opencode_server_mode: true,
};

function parseYaml(text: string): Record<string, unknown> {
	// Minimal YAML parser for flat key:value files (no nested objects, no arrays)
	const result: Record<string, unknown> = {};
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const colonIdx = trimmed.indexOf(":");
		if (colonIdx === -1) continue;
		const key = trimmed.slice(0, colonIdx).trim();
		const rawVal = trimmed.slice(colonIdx + 1).trim();
		// Strip inline comments (but not inside quoted strings)
		let val: string;
		if ((rawVal.startsWith('"') && rawVal.includes('"', 1)) || (rawVal.startsWith("'") && rawVal.includes("'", 1))) {
			// Quoted value — don't strip inline comments
			val = rawVal;
		} else {
			val = rawVal.replace(/\s+#.*$/, "");
		}
		// Parse number
		const num = Number(val);
		if (!Number.isNaN(num) && val !== "") {
			result[key] = num;
		} else if (val === "true") {
			result[key] = true;
		} else if (val === "false") {
			result[key] = false;
		} else {
			// Strip quotes
			result[key] = val.replace(/^["']|["']$/g, "");
		}
	}
	return result;
}

export function loadConfig(cwd?: string): SwarmConfig {
	// Search order: cwd swarm_config, cwd rlm_config, package root swarm_config, package root rlm_config
	// User prefs (~/.swarm/config.yaml) are overlaid on top of the first found project config
	const projectDir = cwd || process.cwd();
	const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
	const userConfigPath = path.join(os.homedir(), ".swarm", "config.yaml");
	const candidates = [
		path.resolve(projectDir, "swarm_config.yaml"),
		path.resolve(projectDir, "rlm_config.yaml"),
		path.resolve(pkgRoot, "swarm_config.yaml"),
		path.resolve(pkgRoot, "rlm_config.yaml"),
	];

	for (const configPath of candidates) {
		if (fs.existsSync(configPath)) {
			try {
				const raw = fs.readFileSync(configPath, "utf-8");
				let parsed = parseYaml(raw);

				// Overlay user preferences from ~/.swarm/config.yaml
				if (fs.existsSync(userConfigPath)) {
					try {
						const userRaw = fs.readFileSync(userConfigPath, "utf-8");
						const userParsed = parseYaml(userRaw);
						parsed = { ...parsed, ...userParsed };
					} catch {
						/* ignore malformed user config */
					}
				}
				const clamp = (v: unknown, min: number, max: number, def: number) =>
					typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : def;
				const str = (v: unknown, def: string) => (typeof v === "string" && v.length > 0 ? v : def);
				const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);

				const validStrategies = ["structured", "llm-summary", "diff-only", "truncate"] as const;
				const strategyVal = str(parsed.compression_strategy, DEFAULTS.compression_strategy);
				const strategy = (validStrategies as readonly string[]).includes(strategyVal)
					? (strategyVal as SwarmConfig["compression_strategy"])
					: DEFAULTS.compression_strategy;

				return {
					// RLM fields
					max_iterations: clamp(parsed.max_iterations, 1, 100, DEFAULTS.max_iterations),
					max_depth: clamp(parsed.max_depth, 1, 10, DEFAULTS.max_depth),
					max_sub_queries: clamp(parsed.max_sub_queries, 1, 500, DEFAULTS.max_sub_queries),
					truncate_len: clamp(parsed.truncate_len, 500, 50000, DEFAULTS.truncate_len),
					metadata_preview_lines: clamp(parsed.metadata_preview_lines, 5, 100, DEFAULTS.metadata_preview_lines),

					// Swarm fields
					max_threads: clamp(parsed.max_threads, 1, 20, DEFAULTS.max_threads),
					max_total_threads: clamp(parsed.max_total_threads, 1, 100, DEFAULTS.max_total_threads),
					thread_timeout_ms: clamp(parsed.thread_timeout_ms, 10000, 3600000, DEFAULTS.thread_timeout_ms),
					max_thread_budget_usd:
						typeof parsed.max_thread_budget_usd === "number" &&
						Number.isFinite(parsed.max_thread_budget_usd) &&
						parsed.max_thread_budget_usd > 0
							? parsed.max_thread_budget_usd
							: DEFAULTS.max_thread_budget_usd,
					max_session_budget_usd:
						typeof parsed.max_session_budget_usd === "number" &&
						Number.isFinite(parsed.max_session_budget_usd) &&
						parsed.max_session_budget_usd > 0
							? parsed.max_session_budget_usd
							: DEFAULTS.max_session_budget_usd,
					default_agent: str(parsed.default_agent, DEFAULTS.default_agent),
					default_model: str(parsed.default_model, DEFAULTS.default_model),
					auto_model_selection: bool(parsed.auto_model_selection, DEFAULTS.auto_model_selection),
					compression_strategy: strategy,
					compression_max_tokens: clamp(parsed.compression_max_tokens, 100, 10000, DEFAULTS.compression_max_tokens),
					worktree_base_dir: str(parsed.worktree_base_dir, DEFAULTS.worktree_base_dir),
					auto_cleanup_worktrees: bool(parsed.auto_cleanup_worktrees, DEFAULTS.auto_cleanup_worktrees),
					episodic_memory_enabled: bool(parsed.episodic_memory_enabled, DEFAULTS.episodic_memory_enabled),
					memory_dir: str(parsed.memory_dir, DEFAULTS.memory_dir),
					thread_retries: clamp(parsed.thread_retries, 0, 3, DEFAULTS.thread_retries),
					model_slots: {
						execution: str(parsed.model_slot_execution, DEFAULTS.model_slots.execution),
						search: str(parsed.model_slot_search, DEFAULTS.model_slots.search),
						reasoning: str(parsed.model_slot_reasoning, DEFAULTS.model_slots.reasoning),
						planning: str(parsed.model_slot_planning, DEFAULTS.model_slots.planning),
					},
					thread_cache_persist: bool(parsed.thread_cache_persist, DEFAULTS.thread_cache_persist),
					thread_cache_dir: str(parsed.thread_cache_dir, DEFAULTS.thread_cache_dir),
					thread_cache_ttl_hours: clamp(parsed.thread_cache_ttl_hours, 1, 720, DEFAULTS.thread_cache_ttl_hours),
					opencode_server_mode: bool(parsed.opencode_server_mode, DEFAULTS.opencode_server_mode),
				};
			} catch {
				// Fall through to defaults
			}
		}
	}

	return { ...DEFAULTS };
}
