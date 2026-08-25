/**
 * Episodic memory — persists successful thread strategies to disk.
 *
 * Records episodes after successful thread completions:
 *   - Task pattern (normalized keywords)
 *   - Agent + model used
 *   - Result quality (success, duration, cost, files changed)
 *   - Task slot + complexity classification
 *
 * Recall: given a new task, find similar past episodes and return
 * the strategies that worked. Used to inform agent/model selection
 * and provide context hints to the orchestrator.
 *
 * Storage: JSON files in ~/.swarm/memory/episodes/ indexed by
 * task similarity hash (trigram-based).
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────

export interface Episode {
	/** Unique episode ID (SHA-256 of task + timestamp). */
	id: string;
	/** Original task description. */
	task: string;
	/** Normalized task keywords for similarity matching. */
	taskKeywords: string[];
	/** Agent backend used. */
	agent: string;
	/** Model used. */
	model: string;
	/** Task slot (execution/search/reasoning/planning). */
	slot: string;
	/** Task complexity (simple/medium/complex). */
	complexity: string;
	/** Whether the thread succeeded. */
	success: boolean;
	/** Duration in ms. */
	durationMs: number;
	/** Estimated cost in USD. */
	estimatedCostUsd: number;
	/** Number of files changed. */
	filesChangedCount: number;
	/** File paths changed (for pattern matching). */
	filesChanged: string[];
	/** Compressed result summary (the episode content). */
	summary: string;
	/** Timestamp. */
	timestamp: number;
}

export interface EpisodeRecall {
	episode: Episode;
	/** Similarity score (0-1). */
	similarity: number;
}

/** Per-agent aggregate statistics derived from episodic memory. */
export interface AgentAggregateStats {
	/** Total number of successful episodes. */
	totalEpisodes: number;
	/** Average duration in ms. */
	avgDurationMs: number;
	/** Average cost in USD. */
	avgCostUsd: number;
	/** Success count per slot (execution/search/reasoning/planning). */
	slotCounts: Map<string, number>;
	/** File extensions this agent has successfully worked with. */
	fileExtensions: Set<string>;
}

/** Aggregate stats across all agents. */
export interface AggregateStats {
	/** Per-agent statistics. */
	perAgent: Map<string, AgentAggregateStats>;
	/**
	 * File extension → agent → success count.
	 * Used by the router to boost agents that handle specific file types well.
	 */
	fileExtensions: Map<string, Map<string, number>>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Stop words to filter from task keywords. */
const STOP_WORDS = new Set([
	"the",
	"a",
	"an",
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"being",
	"have",
	"has",
	"had",
	"do",
	"does",
	"did",
	"will",
	"would",
	"could",
	"should",
	"may",
	"might",
	"shall",
	"can",
	"to",
	"of",
	"in",
	"for",
	"on",
	"with",
	"at",
	"by",
	"from",
	"as",
	"into",
	"through",
	"during",
	"before",
	"after",
	"above",
	"below",
	"between",
	"and",
	"but",
	"or",
	"not",
	"no",
	"all",
	"each",
	"every",
	"both",
	"few",
	"more",
	"most",
	"other",
	"some",
	"such",
	"than",
	"too",
	"very",
	"just",
	"about",
	"this",
	"that",
	"these",
	"those",
	"it",
	"its",
	"my",
	"your",
	"our",
]);

/** Extract normalized keywords from a task string. */
function extractKeywords(task: string): string[] {
	return task
		.toLowerCase()
		.replace(/[^a-z0-9\s-_./]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 2 && !STOP_WORDS.has(w))
		.sort();
}

/** Generate trigrams from a string for fuzzy matching. */
function trigrams(s: string): Set<string> {
	const padded = `  ${s.toLowerCase()}  `;
	const result = new Set<string>();
	for (let i = 0; i < padded.length - 2; i++) {
		result.add(padded.slice(i, i + 3));
	}
	return result;
}

/** Compute Jaccard similarity between two trigram sets. */
function trigramSimilarity(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 && b.size === 0) return 1;
	let intersection = 0;
	for (const t of a) {
		if (b.has(t)) intersection++;
	}
	const union = a.size + b.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

/** Generate a deterministic episode ID. */
function episodeId(task: string, timestamp: number): string {
	return createHash("sha256").update(`${task}:${timestamp}`).digest("hex").slice(0, 16);
}

// ── Episodic Memory Store ──────────────────────────────────────────────────

export class EpisodicMemory {
	private memoryDir: string;
	private episodes: Episode[] = [];
	private loaded: boolean = false;
	private maxEpisodes: number;

	constructor(memoryDir: string, maxEpisodes: number = 500) {
		this.memoryDir = path.join(memoryDir, "episodes");
		this.maxEpisodes = maxEpisodes;
	}

	/** Initialize — create directory and load existing episodes. */
	async init(): Promise<void> {
		fs.mkdirSync(this.memoryDir, { recursive: true });
		await this.loadAll();
	}

	/** Record a new episode from a completed thread. */
	async record(params: {
		task: string;
		agent: string;
		model: string;
		slot: string;
		complexity: string;
		success: boolean;
		durationMs: number;
		estimatedCostUsd: number;
		filesChanged: string[];
		summary: string;
	}): Promise<Episode> {
		// Only record successful episodes — failures don't teach useful strategies
		if (!params.success) {
			return {
				id: "",
				taskKeywords: [],
				filesChangedCount: params.filesChanged.length,
				timestamp: Date.now(),
				...params,
			};
		}

		const timestamp = Date.now();
		const episode: Episode = {
			id: episodeId(params.task, timestamp),
			task: params.task,
			taskKeywords: extractKeywords(params.task),
			agent: params.agent,
			model: params.model,
			slot: params.slot,
			complexity: params.complexity,
			success: params.success,
			durationMs: params.durationMs,
			estimatedCostUsd: params.estimatedCostUsd,
			filesChangedCount: params.filesChanged.length,
			filesChanged: params.filesChanged,
			summary: params.summary.slice(0, 2000), // Cap stored summary
			timestamp,
		};

		this.episodes.push(episode);

		// Evict oldest if over capacity
		if (this.episodes.length > this.maxEpisodes) {
			const removed = this.episodes.shift()!;
			this.deleteFile(removed.id);
		}

		// Persist to disk
		await this.saveEpisode(episode);

		return episode;
	}

	/**
	 * Recall similar past episodes for a given task.
	 * Returns episodes sorted by similarity (highest first).
	 */
	recall(task: string, maxResults: number = 5, minSimilarity: number = 0.15): EpisodeRecall[] {
		if (this.episodes.length === 0) return [];

		const taskTrigrams = trigrams(task);
		const taskKeywords = new Set(extractKeywords(task));

		const scored: EpisodeRecall[] = [];

		for (const episode of this.episodes) {
			if (!episode.success) continue;

			// Trigram similarity on full task string
			const triSim = trigramSimilarity(taskTrigrams, trigrams(episode.task));

			// Keyword overlap bonus
			const epKeywords = new Set(episode.taskKeywords);
			let keywordOverlap = 0;
			for (const kw of taskKeywords) {
				if (epKeywords.has(kw)) keywordOverlap++;
			}
			const maxKeywords = Math.max(taskKeywords.size, epKeywords.size);
			const kwSim = maxKeywords > 0 ? keywordOverlap / maxKeywords : 0;

			// Combined similarity (weighted: trigrams 60%, keywords 40%)
			const similarity = triSim * 0.6 + kwSim * 0.4;

			if (similarity >= minSimilarity) {
				scored.push({ episode, similarity });
			}
		}

		return scored.sort((a, b) => b.similarity - a.similarity).slice(0, maxResults);
	}

	/**
	 * Get strategy recommendations based on past episodes.
	 * Returns a formatted string for inclusion in orchestrator context.
	 */
	getStrategyHints(task: string): string | null {
		const recalls = this.recall(task, 3, 0.2);
		if (recalls.length === 0) return null;

		const lines: string[] = ["Past successful strategies for similar tasks:"];
		for (const { episode, similarity } of recalls) {
			const sim = (similarity * 100).toFixed(0);
			const cost = episode.estimatedCostUsd.toFixed(4);
			const duration = (episode.durationMs / 1000).toFixed(1);
			lines.push(
				`  - [${sim}% match] "${episode.task.slice(0, 80)}" → ` +
					`${episode.agent}/${episode.model} (${episode.slot}, ${duration}s, $${cost}, ` +
					`${episode.filesChangedCount} files)`,
			);
		}

		return lines.join("\n");
	}

	/**
	 * Get the best agent/model recommendation for a task based on past episodes.
	 * Returns null if no relevant episodes found.
	 */
	recommendStrategy(task: string): { agent: string; model: string; confidence: number } | null {
		const recalls = this.recall(task, 5, 0.25);
		if (recalls.length === 0) return null;

		// Score agent+model pairs as composite keys to avoid mismatched combos
		const pairScores: Map<string, { agent: string; model: string; score: number }> = new Map();

		for (const { episode, similarity } of recalls) {
			const quality = 1 / (1 + episode.estimatedCostUsd * 10 + episode.durationMs / 60000);
			const score = similarity * quality;

			const pairKey = `${episode.agent}::${episode.model}`;
			const existing = pairScores.get(pairKey);
			if (existing) {
				existing.score += score;
			} else {
				pairScores.set(pairKey, { agent: episode.agent, model: episode.model, score });
			}
		}

		// Pick highest-scoring agent+model pair
		let bestPair: { agent: string; model: string; score: number } | null = null;
		for (const pair of pairScores.values()) {
			if (!bestPair || pair.score > bestPair.score) {
				bestPair = pair;
			}
		}

		if (!bestPair) return null;

		return {
			agent: bestPair.agent,
			model: bestPair.model,
			confidence: Math.min(1, recalls[0].similarity),
		};
	}

	/**
	 * Get aggregate statistics across all episodes, grouped by agent.
	 *
	 * Returns per-agent success rates, average costs/durations, slot distributions,
	 * and a file-extension-to-agent mapping. Used by the model router as a fallback
	 * when no high-confidence episodic match exists.
	 *
	 * Returns null if no episodes are loaded (graceful degradation).
	 */
	getAggregateStats(): AggregateStats | null {
		if (this.episodes.length === 0) return null;

		const perAgent: Map<string, AgentAggregateStats> = new Map();
		const fileExtensions: Map<string, Map<string, number>> = new Map();

		for (const episode of this.episodes) {
			if (!episode.success) continue;

			// Initialize agent stats if needed
			let stats = perAgent.get(episode.agent);
			if (!stats) {
				stats = {
					totalEpisodes: 0,
					avgDurationMs: 0,
					avgCostUsd: 0,
					slotCounts: new Map(),
					fileExtensions: new Set(),
				};
				perAgent.set(episode.agent, stats);
			}

			// Running average: update incrementally
			const n = stats.totalEpisodes;
			stats.avgDurationMs = (stats.avgDurationMs * n + episode.durationMs) / (n + 1);
			stats.avgCostUsd = (stats.avgCostUsd * n + episode.estimatedCostUsd) / (n + 1);
			stats.totalEpisodes++;

			// Slot counts
			if (episode.slot) {
				stats.slotCounts.set(episode.slot, (stats.slotCounts.get(episode.slot) || 0) + 1);
			}

			// Extract file extensions from changed files
			for (const filePath of episode.filesChanged) {
				const dotIdx = filePath.lastIndexOf(".");
				if (dotIdx !== -1 && dotIdx < filePath.length - 1) {
					const ext = filePath.slice(dotIdx).toLowerCase();
					stats.fileExtensions.add(ext);

					// Update global file extension → agent mapping
					let agentMap = fileExtensions.get(ext);
					if (!agentMap) {
						agentMap = new Map();
						fileExtensions.set(ext, agentMap);
					}
					agentMap.set(episode.agent, (agentMap.get(episode.agent) || 0) + 1);
				}
			}
		}

		return { perAgent, fileExtensions };
	}

	/** Get total episode count. */
	get size(): number {
		return this.episodes.length;
	}

	/** Get all episodes (for viewer). */
	getAll(): Episode[] {
		return [...this.episodes];
	}

	// ── Persistence ──────────────────────────────────────────────────────────

	private async loadAll(): Promise<void> {
		if (this.loaded) return;
		this.loaded = true;

		if (!fs.existsSync(this.memoryDir)) return;

		let files: string[];
		try {
			files = fs.readdirSync(this.memoryDir).filter((f) => f.endsWith(".json"));
		} catch {
			return;
		}

		for (const file of files) {
			try {
				const raw = fs.readFileSync(path.join(this.memoryDir, file), "utf-8");
				const episode: Episode = JSON.parse(raw);
				if (episode.id && episode.task) {
					this.episodes.push(episode);
				}
			} catch {
				// Skip corrupt files
			}
		}

		// Sort by timestamp (oldest first for consistent eviction)
		this.episodes.sort((a, b) => a.timestamp - b.timestamp);

		// Trim to max
		while (this.episodes.length > this.maxEpisodes) {
			const removed = this.episodes.shift()!;
			this.deleteFile(removed.id);
		}
	}

	private async saveEpisode(episode: Episode): Promise<void> {
		try {
			const filePath = path.join(this.memoryDir, `${episode.id}.json`);
			fs.writeFileSync(filePath, JSON.stringify(episode, null, 2), "utf-8");
		} catch {
			// Non-fatal — memory is best-effort
		}
	}

	private deleteFile(id: string): void {
		try {
			const filePath = path.join(this.memoryDir, `${id}.json`);
			if (fs.existsSync(filePath)) {
				fs.unlinkSync(filePath);
			}
		} catch {
			// Non-fatal
		}
	}
}
