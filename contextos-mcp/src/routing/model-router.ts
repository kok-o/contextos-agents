/**
 * Model router — auto-selects the best agent + model combination per task.
 *
 * Inspired by Slate's approach: the orchestrator LLM naturally selects agents
 * and models based on task complexity. This module provides a fallback
 * rule-based router for when auto_model_selection is enabled, ensuring
 * cost-efficient defaults even when the orchestrator doesn't explicitly choose.
 *
 * Two routing dimensions:
 *   1. Task complexity (simple/medium/complex) → picks model tier
 *   2. Task slot (execution/search/reasoning/planning) → picks agent + model specialty
 *
 * Two routing modes:
 *   1. Orchestrator-driven (default): The orchestrator prompt teaches the LLM
 *      about agent strengths, and the LLM passes agent/model in thread() calls.
 *   2. Auto-routing (auto_model_selection=true): This router overrides the
 *      orchestrator's choice with a cost-optimal selection based on task analysis.
 *
 * Enhanced with:
 *   - FailureTracker: session-level failure tracking with decay weighting
 *   - Success rate weighting: penalizes agents with high failure rates
 *   - File pattern matching: boosts agents that historically handle specific file types
 *   - Aggregate episodic stats: fallback to best-performing agent per slot
 */

import { getAvailableAgents } from "../agents/provider.js";
import type { ModelSlots } from "../config.js";
import type { SwarmConfig } from "../core/types.js";
import type { EpisodicMemory } from "../memory/episodic.js";

// ── Agent capabilities ─────────────────────────────────────────────────────

export interface AgentCapability {
	name: string;
	/** Cost tier: 1 = cheapest, 5 = most expensive */
	costTier: number;
	/** Speed tier: 1 = fastest, 5 = slowest */
	speedTier: number;
	/** What this agent excels at */
	strengths: string[];
	/** Best model for this agent (provider/model-id format) */
	defaultModel: string;
	/** Cheaper model for simple tasks */
	cheapModel: string;
	/** Premium model for complex tasks */
	premiumModel: string;
}

export const AGENT_CAPABILITIES: Record<string, AgentCapability> = {
	opencode: {
		name: "opencode",
		costTier: 2,
		speedTier: 2,
		strengths: ["general-purpose", "multi-language", "fast", "tool-use", "testing"],
		defaultModel: "anthropic/claude-sonnet-4-6",
		cheapModel: "anthropic/claude-haiku-4-5",
		premiumModel: "anthropic/claude-opus-4-6",
	},
	"claude-code": {
		name: "claude-code",
		costTier: 3,
		speedTier: 3,
		strengths: ["deep-analysis", "refactoring", "architecture", "complex-reasoning", "large-codebase"],
		defaultModel: "claude-sonnet-4-6",
		cheapModel: "claude-haiku-4-5",
		premiumModel: "claude-opus-4-6",
	},
	codex: {
		name: "codex",
		costTier: 2,
		speedTier: 2,
		strengths: ["code-execution", "shell-commands", "testing", "openai-models", "tool-use"],
		defaultModel: "o3-mini",
		cheapModel: "gpt-4o-mini",
		premiumModel: "o3",
	},
	aider: {
		name: "aider",
		costTier: 1,
		speedTier: 1,
		strengths: ["targeted-edits", "minimal-changes", "git-aware", "cost-efficient", "linting", "formatting"],
		defaultModel: "anthropic/claude-sonnet-4-6",
		cheapModel: "anthropic/claude-haiku-4-5",
		premiumModel: "anthropic/claude-opus-4-6",
	},
	"direct-llm": {
		name: "direct-llm",
		costTier: 1,
		speedTier: 1,
		strengths: ["analysis", "planning", "no-file-changes", "classification", "lightweight"],
		defaultModel: "anthropic/claude-sonnet-4-6",
		cheapModel: "anthropic/claude-haiku-4-5",
		premiumModel: "anthropic/claude-opus-4-6",
	},
};

// ── Task complexity classification ─────────────────────────────────────────

export type TaskComplexity = "simple" | "medium" | "complex";

/** Simple keyword-based complexity classifier. */
export function classifyTaskComplexity(task: string): TaskComplexity {
	const lower = task.toLowerCase();

	// Complex indicators
	const complexPatterns = [
		"refactor",
		"architect",
		"redesign",
		"migrate",
		"rewrite",
		"overhaul",
		"restructure",
		"security audit",
		"performance optim",
		"complex",
		"multiple files",
		"across the codebase",
		"entire",
		"all files",
		"comprehensive",
	];
	if (complexPatterns.some((p) => lower.includes(p))) return "complex";

	// Simple indicators
	const simplePatterns = [
		"add comment",
		"fix typo",
		"rename",
		"format",
		"lint",
		"add import",
		"remove unused",
		"update version",
		"bump",
		"simple",
		"add docstring",
		"fix indent",
		"whitespace",
	];
	if (simplePatterns.some((p) => lower.includes(p))) return "simple";

	// Default to medium
	return "medium";
}

// ── Named model slots ─────────────────────────────────────────────────────

/**
 * Task slots — named categories that map to specialized model/agent combos.
 * Inspired by Slate's model slots (main, subagent, search, reasoning).
 */
export type TaskSlot = "execution" | "search" | "reasoning" | "planning";

export const DEFAULT_MODEL_SLOTS: ModelSlots = {
	execution: "", // empty = use agent's default based on complexity
	search: "",
	reasoning: "",
	planning: "",
};

/** Preferred agent per slot when auto-routing. */
const SLOT_AGENT_PREFERENCES: Record<TaskSlot, string[]> = {
	execution: ["opencode", "codex", "claude-code", "aider"],
	search: ["direct-llm", "opencode", "codex"],
	reasoning: ["claude-code", "direct-llm", "opencode"],
	planning: ["direct-llm", "claude-code"],
};

/** Classify a task into a named slot based on keyword analysis. */
export function classifyTaskSlot(task: string): TaskSlot {
	const lower = task.toLowerCase();

	// Search patterns — retrieving information, finding things
	const searchPatterns = [
		"search",
		"find",
		"look up",
		"locate",
		"grep",
		"what is",
		"where is",
		"which file",
		"list all",
		"documentation",
		"docs",
		"research",
		"investigate",
	];
	if (searchPatterns.some((p) => lower.includes(p))) return "search";

	// Reasoning patterns — analysis, review, understanding
	const reasoningPatterns = [
		"analyze",
		"analysis",
		"review",
		"explain",
		"understand",
		"why does",
		"how does",
		"debug",
		"diagnose",
		"trace",
		"reason",
		"evaluate",
		"assess",
		"compare",
	];
	if (reasoningPatterns.some((p) => lower.includes(p))) return "reasoning";

	// Planning patterns — design, architecture, strategy
	const planningPatterns = [
		"plan",
		"design",
		"architect",
		"propose",
		"strategy",
		"roadmap",
		"outline",
		"spec",
		"specification",
		"rfc",
		"how should",
		"what approach",
		"break down",
	];
	if (planningPatterns.some((p) => lower.includes(p))) return "planning";

	// Default: execution (coding, fixing, building)
	return "execution";
}

// ── Failure Tracker ────────────────────────────────────────────────────────

/** Patterns that indicate transient errors (rate limits, timeouts, server errors). */
const TRANSIENT_ERROR_PATTERNS = [
	/timeout/i,
	/timed?\s*out/i,
	/rate limit/i,
	/429/,
	/503/,
	/502/,
	/500/,
	/too many requests/i,
	/temporarily unavailable/i,
	/server error/i,
	/overloaded/i,
	/capacity/i,
	/ECONNRESET/i,
	/ECONNREFUSED/i,
	/EPIPE/i,
];

export interface FailureRecord {
	agent: string;
	model: string;
	task: string;
	error: string;
	timestamp: number;
	/** Transient errors (rate limit, timeout) decay faster than permanent ones. */
	isTransient: boolean;
}

/**
 * Tracks agent/model failures within a session to inform routing decisions.
 *
 * Failure records decay over time — recent failures weigh more heavily.
 * Transient errors (rate limits, timeouts) decay faster than permanent ones.
 */
export class FailureTracker {
	private failures: FailureRecord[] = [];
	/** Half-life for permanent failure decay (ms). Failures lose half their weight after this. */
	private readonly permanentHalfLifeMs: number;
	/** Half-life for transient failure decay (ms). Shorter — transient issues resolve quickly. */
	private readonly transientHalfLifeMs: number;

	constructor(permanentHalfLifeMs: number = 10 * 60 * 1000, transientHalfLifeMs: number = 3 * 60 * 1000) {
		this.permanentHalfLifeMs = permanentHalfLifeMs;
		this.transientHalfLifeMs = transientHalfLifeMs;
	}

	/**
	 * Record a failure for an agent+model pair.
	 * Classifies the error as transient or permanent based on pattern matching.
	 */
	recordFailure(agent: string, model: string, task: string, error: string): void {
		const isTransient = TRANSIENT_ERROR_PATTERNS.some((p) => p.test(error));
		this.failures.push({
			agent,
			model,
			task,
			error,
			timestamp: Date.now(),
			isTransient,
		});
	}

	/**
	 * Get the weighted failure rate for an agent+model pair (0-1).
	 *
	 * Uses exponential decay so recent failures count more than old ones.
	 * The rate is capped at 1.0 (effectively: agent is completely unreliable).
	 */
	getFailureRate(agent: string, model?: string): number {
		const now = Date.now();
		let weightedFailures = 0;

		for (const f of this.failures) {
			if (f.agent !== agent) continue;
			if (model && f.model !== model) continue;

			const age = now - f.timestamp;
			const halfLife = f.isTransient ? this.transientHalfLifeMs : this.permanentHalfLifeMs;
			// Exponential decay: weight = 2^(-age/halfLife)
			const weight = 2 ** (-age / halfLife);
			weightedFailures += weight;
		}

		// Normalize: 3 weighted failures = rate of 1.0
		// This means a single recent failure gives ~0.33, two give ~0.67, three+ saturate at 1.0
		return Math.min(1, weightedFailures / 3);
	}

	/**
	 * Check if an agent has a 100% failure rate (all recent attempts failed,
	 * with no significant decay). Used to skip completely broken agents.
	 */
	isFullyFailed(agent: string): boolean {
		return this.getFailureRate(agent) >= 0.99;
	}

	/** Get all failure records (for debugging/inspection). */
	getFailures(): FailureRecord[] {
		return [...this.failures];
	}

	/** Get the number of raw (undecayed) failures for an agent. */
	getFailureCount(agent: string): number {
		return this.failures.filter((f) => f.agent === agent).length;
	}

	/** Clear all failure records. */
	clear(): void {
		this.failures = [];
	}
}

// ── File pattern extraction ────────────────────────────────────────────────

/** Common file extensions to look for in task descriptions. */
const FILE_EXTENSION_PATTERN =
	/\.(ts|tsx|js|jsx|py|rs|go|java|rb|cpp|c|h|css|scss|html|json|yaml|yml|toml|md|sql|sh|bash|zsh|vue|svelte|swift|kt|cs|php)\b/gi;

/**
 * Extract file extensions mentioned in a task description.
 * Returns unique lowercase extensions (e.g., [".ts", ".py"]).
 */
export function extractFileExtensions(task: string): string[] {
	const matches = task.match(FILE_EXTENSION_PATTERN);
	if (!matches) return [];
	const unique = new Set(matches.map((m) => m.toLowerCase()));
	return [...unique];
}

// ── Router ─────────────────────────────────────────────────────────────────

export interface RouteResult {
	agent: string;
	model: string;
	slot: TaskSlot;
	reason: string;
}

/**
 * Route a task to the best agent + model combination.
 *
 * Logic:
 *   1. Classify task complexity (simple/medium/complex)
 *   2. Classify task slot (execution/search/reasoning/planning)
 *   3. Check for slot-specific model overrides in config
 *   4. Score agents with slot preference bonus
 *   5. Apply failure rate penalty (skip fully-failed agents)
 *   6. Apply file pattern matching bonus from episodic memory
 *   7. Fallback to aggregate episodic stats when no high-confidence match
 *   8. Pick the highest-scoring capable option
 */
export async function routeTask(
	task: string,
	config: SwarmConfig,
	memory?: EpisodicMemory,
	failureTracker?: FailureTracker,
): Promise<RouteResult> {
	const complexity = classifyTaskComplexity(task);
	const slot = classifyTaskSlot(task);
	const available = await getAvailableAgents();
	const lower = task.toLowerCase();

	// Check for slot-specific model override from config
	const slotOverrides = config.model_slots || DEFAULT_MODEL_SLOTS;
	const slotModel = slotOverrides[slot];

	// Check episodic memory for past successful strategies
	const memoryRecommendation = memory?.recommendStrategy(task);

	// Extract file extensions for file-pattern matching
	const taskExtensions = extractFileExtensions(task);

	// Get aggregate stats from episodic memory (if available)
	const aggregateStats = memory?.getAggregateStats?.();

	// If no agents available, fall back to direct-llm
	if (available.length === 0) {
		return {
			agent: "direct-llm",
			model: slotModel || config.default_model,
			slot,
			reason: "no agent backends available, falling back to direct LLM",
		};
	}

	// If episodic memory has a recommendation at confidence >= 0.3, consider it —
	// but weight by (1 - failureRate) of the recommended agent
	if (
		memoryRecommendation &&
		memoryRecommendation.confidence >= 0.3 &&
		available.includes(memoryRecommendation.agent)
	) {
		const failureRate = failureTracker?.getFailureRate(memoryRecommendation.agent) ?? 0;
		const adjustedConfidence = memoryRecommendation.confidence * (1 - failureRate);

		// Only take the fast path if adjusted confidence is still strong (>= 0.5)
		if (adjustedConfidence >= 0.5 && !failureTracker?.isFullyFailed(memoryRecommendation.agent)) {
			return {
				agent: memoryRecommendation.agent,
				model: slotModel || memoryRecommendation.model,
				slot,
				reason:
					`${slot}/${complexity} → ${memoryRecommendation.agent} (episodic memory, ` +
					`${(memoryRecommendation.confidence * 100).toFixed(0)}% confidence` +
					`${failureRate > 0 ? `, adjusted: ${(adjustedConfidence * 100).toFixed(0)}%` : ""})`,
			};
		}
	}

	// Build file-extension success map from episodic memory
	const fileExtensionBonus: Map<string, number> = new Map();
	if (taskExtensions.length > 0 && aggregateStats?.fileExtensions) {
		for (const ext of taskExtensions) {
			const agentsForExt = aggregateStats.fileExtensions.get(ext);
			if (agentsForExt) {
				for (const [agent, count] of agentsForExt) {
					const current = fileExtensionBonus.get(agent) || 0;
					// Bonus scales with number of successful episodes for this extension,
					// capped at 2 points per extension
					fileExtensionBonus.set(agent, current + Math.min(2, count * 0.5));
				}
			}
		}
	}

	// Get preferred agents for this slot
	const slotPrefs = SLOT_AGENT_PREFERENCES[slot];

	// Score each available agent for this task
	const scored = available
		.filter((name) => {
			// Skip agents that are fully failed (100% failure rate)
			if (failureTracker?.isFullyFailed(name)) return false;
			return true;
		})
		.map((name) => {
			const cap = AGENT_CAPABILITIES[name];
			if (!cap) return { name, score: 0, model: config.default_model };

			let score = 0;

			// Strength matching (word-boundary to avoid substring false positives)
			for (const strength of cap.strengths) {
				const keywords = strength.split("-");
				for (const kw of keywords) {
					if (kw.length > 3 && new RegExp(`\\b${kw}\\b`).test(lower)) score += 2;
				}
			}

			// Slot preference bonus — agents preferred for this slot get a boost
			const slotRank = slotPrefs.indexOf(name);
			if (slotRank !== -1) {
				score += (slotPrefs.length - slotRank) * 2;
			}

			// Episodic memory boost — agents that worked well for similar tasks
			if (memoryRecommendation && memoryRecommendation.agent === name) {
				const failureRate = failureTracker?.getFailureRate(name) ?? 0;
				// Weight the memory recommendation by (1 - failureRate)
				score += memoryRecommendation.confidence * 5 * (1 - failureRate);
			}

			// Aggregate stats boost — if no strong episodic match, use historical performance
			if (aggregateStats && (!memoryRecommendation || memoryRecommendation.confidence < 0.3)) {
				const agentStats = aggregateStats.perAgent.get(name);
				if (agentStats) {
					// Boost agents that historically perform well for this slot
					if (agentStats.slotCounts.get(slot)) {
						const slotSuccesses = agentStats.slotCounts.get(slot)!;
						// Small boost proportional to past successes in this slot (capped at 3)
						score += Math.min(3, slotSuccesses * 0.5);
					}
					// Slight efficiency bonus for agents with low average cost
					if (agentStats.avgCostUsd < 0.05) {
						score += 1;
					}
				}
			}

			// File pattern matching bonus — agents that succeeded with these file types
			const extBonus = fileExtensionBonus.get(name) || 0;
			if (extBonus > 0) {
				score += extBonus;
			}

			// Complexity-cost alignment
			if (complexity === "simple") {
				// Prefer cheap + fast agents
				score += 5 - cap.costTier + (5 - cap.speedTier);
			} else if (complexity === "medium") {
				// Balanced — moderate cost/capability, favor speed
				score += 3 - Math.abs(cap.costTier - 2) + (4 - cap.speedTier);
			} else if (complexity === "complex") {
				// Prefer capable agents, cost is less important
				score += cap.costTier; // Higher cost often = more capable
			}

			// Failure rate penalty — penalize agents that have been failing recently
			if (failureTracker) {
				const failureRate = failureTracker.getFailureRate(name);
				score -= failureRate * 10;
			}

			// Select model: slot override > memory suggestion > complexity-based default
			let model: string;
			if (slotModel) {
				model = slotModel;
			} else if (memoryRecommendation && memoryRecommendation.agent === name && memoryRecommendation.model) {
				model = memoryRecommendation.model;
			} else {
				switch (complexity) {
					case "simple":
						model = cap.cheapModel;
						break;
					case "complex":
						model = cap.premiumModel;
						break;
					default:
						model = cap.defaultModel;
						break;
				}
			}

			return { name, score, model };
		})
		.sort((a, b) => b.score - a.score);

	// If all agents were filtered out (all fully failed), fall back to direct-llm
	if (scored.length === 0) {
		return {
			agent: "direct-llm",
			model: slotModel || config.default_model,
			slot,
			reason: `${slot}/${complexity} → direct-llm (all agents have 100% failure rate, fallback)`,
		};
	}

	const best = scored[0];
	const memNote = memoryRecommendation ? `, memory: ${memoryRecommendation.agent}` : "";
	const bestFailRate = failureTracker?.getFailureRate(best.name) ?? 0;
	const failNote = bestFailRate > 0 ? `, failures: ${(bestFailRate * 100).toFixed(0)}%` : "";

	return {
		agent: best.name,
		model: best.model,
		slot,
		reason: `${slot}/${complexity} → ${best.name} (score: ${best.score.toFixed(1)}${memNote}${failNote})`,
	};
}

/**
 * Get a description of available agents and their capabilities
 * for inclusion in the orchestrator prompt.
 */
export async function describeAvailableAgents(): Promise<string> {
	const available = await getAvailableAgents();
	if (available.length === 0) return "No agent backends available.";

	const lines: string[] = [];
	for (const name of available) {
		const cap = AGENT_CAPABILITIES[name];
		if (!cap) {
			lines.push(`- **${name}**: Available (no capability metadata)`);
			continue;
		}
		const cost = ["$", "$$", "$$$", "$$$$", "$$$$$"][cap.costTier - 1];
		const speed = ["fast", "fast", "medium", "slow", "very slow"][cap.speedTier - 1];
		lines.push(
			`- **${name}** (${cost}, ${speed}): ${cap.strengths.join(", ")}` +
				`\n  Default model: \`${cap.defaultModel}\` | Cheap: \`${cap.cheapModel}\` | Premium: \`${cap.premiumModel}\``,
		);
	}

	// Add slot routing info
	lines.push("");
	lines.push("**Model slots** (auto-routing selects the best agent per task type):");
	lines.push("- `execution` — coding, fixing, building → prefers opencode, codex");
	lines.push("- `search` — finding files, researching docs → prefers direct-llm");
	lines.push("- `reasoning` — analysis, debugging, review → prefers claude-code, direct-llm");
	lines.push("- `planning` — design, architecture, strategy → prefers direct-llm, claude-code");

	return lines.join("\n");
}
