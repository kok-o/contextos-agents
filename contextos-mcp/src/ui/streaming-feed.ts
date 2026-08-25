/**
 * Streaming feed — live grouped-waves view of swarm thread activity.
 *
 * Layout (top to bottom):
 *   1. Completed summary   (single line, hidden when 0)
 *   2. Failed summary      (single line, hidden when 0)
 *   3. Retried summary     (single line, hidden when 0)
 *   4. Running section      (interleaved feed, capped at MAX_FEED_LINES)
 *   5. Queued summary       (single line, hidden when 0)
 *   6. Wave marker          (single line, hidden when no waves)
 *
 * Rendering is owned by the Spinner — this component builds lines but does
 * NOT write to stderr directly.
 */

import { getLogLevel, isJsonMode } from "./log.js";
import { coral, cyan, dim, green, isTTY, red, stripAnsi, symbols, termWidth, truncate } from "./theme.js";

// ── Constants ────────────────────────────────────────────────────────────────

/** Max visible feed lines in the running section. */
const MAX_FEED_LINES = 8;

/** Max completed/failed thread names shown individually before collapsing. */
const COLLAPSE_THRESHOLD = 5;

/** Greek labels for low thread counts. */
const GREEK = [
	"α",
	"β",
	"γ",
	"δ",
	"ε",
	"ζ",
	"η",
	"θ",
	"ι",
	"κ",
	"λ",
	"μ",
	"ν",
	"ξ",
	"ο",
	"π",
	"ρ",
	"σ",
	"τ",
	"υ",
	"φ",
	"χ",
	"ψ",
	"ω",
];

// ── Types ────────────────────────────────────────────────────────────────────

interface ThreadInfo {
	id: string;
	label: string;
	task: string;
	phase: string;
	startedAt: number;
	completedAt?: number;
	durationSec?: number;
	filesChanged?: number;
	costUsd?: number;
	detail?: string;
	error?: string;
}

interface FeedLine {
	threadId: string;
	label: string;
	text: string;
	timestamp: number;
}

interface WaveInfo {
	waveNumber: number;
	threadCount: number;
	timestamp: number;
}

// ── StreamingFeed ────────────────────────────────────────────────────────────

export type ThreadOutputCallback = (threadId: string, chunk: string) => void;

export class StreamingFeed {
	private threads: Map<string, ThreadInfo> = new Map();
	private feedLines: FeedLine[] = [];
	private waves: WaveInfo[] = [];
	private labelIndex = 0;
	private enabled: boolean;
	/** Tracks the highest completed count at each wave boundary. */
	private completedAtLastSpawn = 0;
	private currentWave = 1;

	/** Cumulative stats for the session summary. */
	private totalCompleted = 0;
	private totalFailed = 0;
	private totalFilesChanged = 0;
	private totalCostUsd = 0;

	constructor() {
		this.enabled = isTTY && !isJsonMode() && getLogLevel() !== "quiet";
	}

	// ── Thread lifecycle ───────────────────────────────────────────────────

	/** Called when a thread's phase changes. */
	updateThread(
		id: string,
		phase: string,
		detail?: string,
		extra?: {
			task?: string;
			agent?: string;
			model?: string;
			filesChanged?: number;
			costUsd?: number;
		},
	): void {
		const existing = this.threads.get(id);
		if (existing) {
			existing.phase = phase;
			if (detail !== undefined) existing.detail = detail;
			if (extra?.filesChanged !== undefined) existing.filesChanged = extra.filesChanged;
			if (extra?.costUsd !== undefined) existing.costUsd = extra.costUsd;
		} else {
			// New thread — assign label and detect wave
			const label = this.assignLabel();
			this.threads.set(id, {
				id,
				label,
				task: extra?.task || "",
				phase,
				startedAt: Date.now(),
				detail,
			});
			this.detectWave();
		}
	}

	/** Called when a thread completes, fails, or is cancelled. */
	completeThread(id: string, phase: string, detail?: string): void {
		const existing = this.threads.get(id);
		if (!existing) return;

		existing.phase = phase;
		existing.completedAt = Date.now();
		existing.durationSec = Math.round((existing.completedAt - existing.startedAt) / 1000);
		if (detail) existing.detail = detail;

		// Parse detail for file count and cost (format: "3 files, $0.04 (1500+800 tokens)")
		if (detail && phase === "completed") {
			const filesMatch = detail.match(/(\d+)\s+files?/);
			if (filesMatch) {
				existing.filesChanged = Number.parseInt(filesMatch[1], 10);
				this.totalFilesChanged += existing.filesChanged;
			}
			const costMatch = detail.match(/\$([0-9.]+)/);
			if (costMatch) {
				existing.costUsd = Number.parseFloat(costMatch[1]);
				this.totalCostUsd += existing.costUsd;
			}
			this.totalCompleted++;
		} else if (phase === "failed") {
			existing.error = detail;
			this.totalFailed++;
		}
	}

	// ── Agent output streaming ─────────────────────────────────────────────

	/** Append a chunk of agent output for a thread. */
	appendOutput(threadId: string, chunk: string): void {
		const thread = this.threads.get(threadId);
		if (!thread) return;

		// Split into lines, ignore empty
		const lines = chunk.split("\n").filter((l) => l.trim().length > 0);
		for (const line of lines) {
			this.feedLines.push({
				threadId,
				label: thread.label,
				text: line.trim(),
				timestamp: Date.now(),
			});
		}

		// Cap total feed lines to prevent unbounded memory growth
		if (this.feedLines.length > 500) {
			this.feedLines = this.feedLines.slice(-300);
		}
	}

	// ── Wave tracking ──────────────────────────────────────────────────────

	private detectWave(): void {
		const completed = this.countByPhase("completed") + this.countByPhase("failed");
		if (completed > this.completedAtLastSpawn && this.threads.size > 1) {
			this.currentWave++;
			const runningCount =
				this.countByPhase("agent_running") + this.countByPhase("creating_worktree") + this.countByPhase("queued");
			this.waves.push({
				waveNumber: this.currentWave,
				threadCount: runningCount,
				timestamp: Date.now(),
			});
			this.completedAtLastSpawn = completed;
		}
	}

	// ── Rendering ──────────────────────────────────────────────────────────

	/** Get the status bar text (used by Spinner as its detail). */
	getStatusDetail(): string {
		const running = this.countByPhase("agent_running") + this.countByPhase("creating_worktree");
		const queued = this.countByPhase("queued");
		const completed = this.totalCompleted;
		const failed = this.totalFailed;
		const total = this.threads.size;

		const parts: string[] = [];
		if (total > 0) parts.push(`${total} threads`);
		if (running > 0) parts.push(`${running} running`);
		if (completed > 0) parts.push(`${completed} done`);
		if (queued > 0) parts.push(`${queued} queued`);
		if (failed > 0) parts.push(`${failed} failed`);
		return parts.join(" · ");
	}

	/** Build all display lines (called by Spinner on each render tick). */
	getLines(): string[] {
		if (!this.enabled || this.threads.size === 0) return [];

		const w = Math.min(termWidth(), 100);
		const lines: string[] = [];

		// Completed summary
		const completedLines = this.buildCompletedLine(w);
		if (completedLines) lines.push(completedLines);

		// Failed summary
		const failedLine = this.buildFailedLine(w);
		if (failedLine) lines.push(failedLine);

		// Running section
		const runningLines = this.buildRunningSection(w);
		lines.push(...runningLines);

		// Queued summary
		const queuedLine = this.buildQueuedLine(w);
		if (queuedLine) lines.push(queuedLine);

		// Wave marker
		const waveLine = this.buildWaveLine();
		if (waveLine) lines.push(waveLine);

		return lines;
	}

	/** Clear all state. */
	clear(): void {
		this.threads.clear();
		this.feedLines = [];
		this.waves = [];
		this.labelIndex = 0;
	}

	/** Get session summary stats. */
	getSessionStats(): {
		totalThreads: number;
		completed: number;
		failed: number;
		totalFiles: number;
		totalCost: number;
		waves: number;
	} {
		return {
			totalThreads: this.threads.size,
			completed: this.totalCompleted,
			failed: this.totalFailed,
			totalFiles: this.totalFilesChanged,
			totalCost: this.totalCostUsd,
			waves: this.currentWave,
		};
	}

	// ── Private rendering helpers ──────────────────────────────────────────

	private buildCompletedLine(w: number): string | null {
		const completed = this.getThreadsByPhase("completed");
		if (completed.length === 0) return null;

		if (completed.length <= COLLAPSE_THRESHOLD) {
			// Show individual thread names
			const names = completed
				.map((t) => {
					const dur = t.durationSec ? `${t.durationSec}s` : "";
					return `${t.label} ${truncate(this.shortTask(t.task), 12)} ${dur}`;
				})
				.join(dim(" · "));
			const files = this.totalFilesChanged > 0 ? dim(` · ${this.totalFilesChanged} files`) : "";
			return this.truncateLine(
				`  ${green(symbols.check)} ${green("completed")} ${dim(`(${completed.length})`)}  ${dim(names)}${files}`,
				w,
			);
		}

		// Collapsed — aggregate stats
		const avgDur = this.avgDuration(completed);
		const avgCost = this.totalCostUsd > 0 ? ` · $${(this.totalCostUsd / completed.length).toFixed(2)} each` : "";
		return this.truncateLine(
			`  ${green(symbols.check)} ${green("completed")} ${dim(`(${completed.length})`)}  ${dim(`avg ${avgDur}s${avgCost} · ${this.totalFilesChanged} files`)}`,
			w,
		);
	}

	private buildFailedLine(w: number): string | null {
		const failed = this.getThreadsByPhase("failed");
		if (failed.length === 0) return null;

		if (failed.length <= COLLAPSE_THRESHOLD) {
			const names = failed
				.map((t) => {
					const err = t.error || t.detail || "error";
					return `${t.label} ${truncate(err, 20)}`;
				})
				.join(dim(" · "));
			return this.truncateLine(
				`  ${red(symbols.cross)} ${red("failed")} ${dim(`(${failed.length})`)}  ${dim(names)}`,
				w,
			);
		}

		return this.truncateLine(`  ${red(symbols.cross)} ${red("failed")} ${dim(`(${failed.length})`)}`, w);
	}

	private buildRunningSection(w: number): string[] {
		const running = this.getThreadsByPhase("agent_running", "creating_worktree", "capturing_diff", "compressing");
		if (running.length === 0) return [];

		const lines: string[] = [];

		// Section header
		const showingNote =
			running.length > MAX_FEED_LINES ? dim(`  showing ${Math.min(running.length, 4)} most active`) : "";
		lines.push(`  ${coral("▸")} ${coral("running")} ${dim(`(${running.length})`)}${showingNote}`);

		// Feed lines — show recent output from active threads
		const activeIds = new Set(running.map((t) => t.id));
		const relevantLines = this.feedLines.filter((fl) => activeIds.has(fl.threadId));
		const recentLines = relevantLines.slice(-MAX_FEED_LINES);

		if (recentLines.length > 0) {
			for (const fl of recentLines) {
				const label = coral(fl.label);
				const text = truncate(fl.text, w - 10);
				lines.push(`    ${label} ${dim(symbols.vertLine)} ${text}`);
			}

			// Add cursor on last line of most active thread
			const lastLine = recentLines[recentLines.length - 1];
			if (lastLine) {
				const thread = this.threads.get(lastLine.threadId);
				if (thread && (thread.phase === "agent_running" || thread.phase === "creating_worktree")) {
					// Replace the last line to add cursor
					const idx = lines.length - 1;
					lines[idx] = `${lines[idx]} ${dim("▌")}`;
				}
			}
		} else {
			// No output yet — show phase info for each running thread
			for (const t of running.slice(0, MAX_FEED_LINES)) {
				const label = coral(t.label);
				const phase = this.formatPhaseShort(t.phase);
				const task = t.task ? dim(truncate(this.shortTask(t.task), w - 20)) : "";
				lines.push(`    ${label} ${dim(symbols.vertLine)} ${phase} ${task}`);
			}
		}

		return lines;
	}

	private buildQueuedLine(w: number): string | null {
		const queued = this.getThreadsByPhase("queued");
		if (queued.length === 0) return null;

		if (queued.length <= COLLAPSE_THRESHOLD) {
			const names = queued.map((t) => t.label).join(" ");
			return this.truncateLine(`  ${dim("·")} ${dim("queued")} ${dim(`(${queued.length})`)}  ${dim(names)}`, w);
		}

		return this.truncateLine(`  ${dim("·")} ${dim("queued")} ${dim(`(${queued.length})`)}`, w);
	}

	private buildWaveLine(): string | null {
		if (this.waves.length === 0) return null;
		const latest = this.waves[this.waves.length - 1];
		return `  ${dim("↳")} ${dim(`wave ${latest.waveNumber} — ${latest.threadCount} threads spawned from previous results`)}`;
	}

	// ── Utility ────────────────────────────────────────────────────────────

	private assignLabel(): string {
		const idx = this.labelIndex++;
		if (idx < GREEK.length) return GREEK[idx];
		// Beyond 24 threads: use indexed labels like τ₂₅
		const base = GREEK[idx % GREEK.length];
		const num = idx + 1;
		return `${base}${this.subscript(num)}`;
	}

	private subscript(n: number): string {
		const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
		return String(n)
			.split("")
			.map((d) => SUBSCRIPT_DIGITS[Number.parseInt(d, 10)])
			.join("");
	}

	private shortTask(task: string): string {
		// Extract a short label from the task description
		const firstLine = task.split("\n")[0];
		// Remove common prefixes
		return firstLine.replace(/^(fix|add|update|create|implement|refactor|write|remove|delete)\s+/i, "").trim();
	}

	private countByPhase(...phases: string[]): number {
		let count = 0;
		for (const [, t] of this.threads) {
			if (phases.includes(t.phase)) count++;
		}
		return count;
	}

	private getThreadsByPhase(...phases: string[]): ThreadInfo[] {
		const result: ThreadInfo[] = [];
		for (const [, t] of this.threads) {
			if (phases.includes(t.phase)) result.push(t);
		}
		return result;
	}

	private avgDuration(threads: ThreadInfo[]): number {
		if (threads.length === 0) return 0;
		const total = threads.reduce((sum, t) => sum + (t.durationSec || 0), 0);
		return Math.round(total / threads.length);
	}

	private formatPhaseShort(phase: string): string {
		switch (phase) {
			case "agent_running":
				return coral("running");
			case "creating_worktree":
				return cyan("creating worktree");
			case "capturing_diff":
				return cyan("capturing diff");
			case "compressing":
				return dim("compressing");
			default:
				return dim(phase);
		}
	}

	private truncateLine(line: string, maxWidth: number): string {
		const visible = stripAnsi(line);
		if (visible.length <= maxWidth) return line;
		const ansiOverhead = line.length - visible.length;
		return `${line.slice(0, maxWidth - 1 + ansiOverhead)}\x1b[0m`;
	}
}
