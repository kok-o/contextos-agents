/**
 * Live thread status dashboard — shows running/queued/completed threads.
 *
 * Rendering is owned by the Spinner — the dashboard builds lines but does NOT
 * write directly to stderr. This prevents interleaving between the spinner's
 * 80ms animation loop and async thread progress callbacks.
 */

import { getLogLevel, isJsonMode } from "./log.js";
import { coral, cyan, dim, green, isTTY, red, stripAnsi, symbols, termWidth, truncate, yellow } from "./theme.js";

interface ThreadStatus {
	id: string;
	task: string;
	phase: string;
	agent: string;
	model: string;
	startedAt: number;
	filesChanged?: number;
	detail?: string;
}

/**
 * Thread dashboard — manages thread state and builds status lines.
 * Does NOT write to stderr directly — the Spinner calls getLines()
 * on each render tick to include dashboard output atomically.
 */
export class ThreadDashboard {
	private threads: Map<string, ThreadStatus> = new Map();
	private pendingTimers: Set<ReturnType<typeof setTimeout>> = new Set();
	private enabled: boolean;

	constructor() {
		this.enabled = isTTY && !isJsonMode() && getLogLevel() !== "quiet";
	}

	/** Update a thread's status. */
	update(
		id: string,
		phase: string,
		detail?: string,
		extra?: {
			task?: string;
			agent?: string;
			model?: string;
			filesChanged?: number;
		},
	): void {
		const existing = this.threads.get(id);
		if (existing) {
			existing.phase = phase;
			if (detail) existing.detail = detail;
			if (extra?.filesChanged !== undefined) existing.filesChanged = extra.filesChanged;
		} else {
			this.threads.set(id, {
				id,
				task: extra?.task || "",
				phase,
				agent: extra?.agent || "",
				model: extra?.model || "",
				startedAt: Date.now(),
				filesChanged: extra?.filesChanged,
				detail,
			});
		}
		// No direct render — spinner picks up changes on next tick
	}

	/** Mark a thread as done. Auto-removes after 1.5s. */
	complete(id: string, phase: string, detail?: string): void {
		const existing = this.threads.get(id);
		if (existing) {
			existing.phase = phase;
			if (detail) existing.detail = detail;
		}

		const timer = setTimeout(() => {
			this.pendingTimers.delete(timer);
			this.threads.delete(id);
		}, 1500);
		this.pendingTimers.add(timer);
	}

	/** Clear all state and cancel pending timers. */
	clear(): void {
		for (const timer of this.pendingTimers) clearTimeout(timer);
		this.pendingTimers.clear();
		this.threads.clear();
	}

	/** Get the current dashboard lines (called by Spinner.render). */
	getLines(): string[] {
		if (!this.enabled || this.threads.size === 0) return [];
		return this.buildLines();
	}

	private buildLines(): string[] {
		const w = Math.min(termWidth(), 80);
		const lines: string[] = [];
		const now = Date.now();

		for (const [, t] of this.threads) {
			const elapsed = ((now - t.startedAt) / 1000).toFixed(1);
			const tag = dim(t.id.slice(0, 8));
			const phase = this.formatPhase(t.phase);
			const time = dim(`${elapsed}s`);
			const task = t.task ? truncate(t.task, 40) : "";
			const detail = t.detail ? dim(t.detail) : "";

			let line: string;
			if (t.phase === "completed") {
				const files = t.filesChanged !== undefined ? dim(`${t.filesChanged} files`) : "";
				line = `    ${tag}  ${phase}  ${time}  ${files}  ${detail}`;
			} else if (t.phase === "failed" || t.phase === "cancelled") {
				line = `    ${tag}  ${phase}  ${time}  ${detail}`;
			} else {
				line = `    ${tag}  ${phase}  ${time}  ${dim(task)}`;
			}

			// ANSI-safe truncation — count visible chars, not raw string length
			const visible = stripAnsi(line);
			if (visible.length > w) {
				// Rebuild truncated: just trim the last visible portion
				const ansiOverhead = line.length - visible.length;
				line = `${line.slice(0, w - 1 + ansiOverhead)}\x1b[0m`;
			}
			lines.push(line);
		}

		return lines;
	}

	private formatPhase(phase: string): string {
		switch (phase) {
			case "queued":
				return dim("queued");
			case "creating_worktree":
				return cyan("creating worktree");
			case "agent_running":
				return coral("running agent");
			case "capturing_diff":
				return cyan("capturing diff");
			case "compressing":
				return dim("compressing");
			case "completed":
				return green(`${symbols.check} completed`);
			case "failed":
				return red(`${symbols.cross} failed`);
			case "cancelled":
				return yellow("cancelled");
			case "retrying":
				return yellow("retrying");
			default:
				return dim(phase);
		}
	}
}
