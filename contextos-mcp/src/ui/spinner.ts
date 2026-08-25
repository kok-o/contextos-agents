/**
 * Animated spinner with rotating verbs — inspired by Claude Code.
 *
 * Runs on an isolated 80ms animation loop separated from other output.
 * Displays a coral-colored spinner glyph + a rotating verb + optional detail.
 *
 * Coordinates with ThreadDashboard or StreamingFeed — the spinner owns the
 * render cycle: spinner line first, then extra lines below. This prevents
 * interleaving.
 */

import type { ThreadDashboard } from "./dashboard.js";
import type { StreamingFeed } from "./streaming-feed.js";
import { coral, dim, isTTY, termWidth } from "./theme.js";

/** Playful verbs shown while the spinner is active. */
const VERBS = [
	"Orchestrating",
	"Decomposing",
	"Analyzing",
	"Spawning",
	"Synthesizing",
	"Weaving",
	"Parallelizing",
	"Routing",
	"Compressing",
	"Dispatching",
	"Coordinating",
	"Assembling",
	"Evaluating",
	"Distributing",
	"Reasoning",
	"Merging",
	"Refactoring",
	"Scanning",
	"Computing",
	"Resolving",
	"Strategizing",
	"Threading",
	"Optimizing",
	"Composing",
	"Investigating",
	"Constructing",
	"Iterating",
	"Transforming",
];

const SPINNER_CHARS = isTTY ? ["\u00B7", "\u2726", "\u2733", "\u2736", "\u273B", "\u273D"] : ["*"];

/** Common interface for anything that provides extra lines below the spinner. */
interface LinesProvider {
	getLines(): string[];
}

export class Spinner {
	private static _exitHandlerRegistered = false;
	private intervalId: ReturnType<typeof setInterval> | null = null;
	private frameIdx = 0;
	private totalFrames = 0;
	private verbIdx = Math.floor(Math.random() * VERBS.length);
	private detail = "";
	private startTime = 0;
	private running = false;
	private dashboard: ThreadDashboard | null = null;
	private streamingFeed: StreamingFeed | null = null;
	/** How many lines we wrote below the spinner (dashboard) */
	private extraLines = 0;

	/** Link a dashboard so the spinner owns its render cycle. */
	setDashboard(d: ThreadDashboard): void {
		this.dashboard = d;
	}

	/** Link a streaming feed so the spinner owns its render cycle. */
	setStreamingFeed(f: StreamingFeed): void {
		this.streamingFeed = f;
	}

	/** Start the spinner. */
	start(detail?: string): void {
		if (!isTTY || this.running) return;
		this.running = true;
		this.detail = detail || "";
		this.startTime = Date.now();
		this.frameIdx = 0;
		this.totalFrames = 0;
		this.extraLines = 0;
		this.verbIdx = Math.floor(Math.random() * VERBS.length);

		// Hide cursor + register exit handler to restore it
		process.stderr.write("\x1b[?25l");
		if (!Spinner._exitHandlerRegistered) {
			Spinner._exitHandlerRegistered = true;
			process.on("exit", () => {
				process.stderr.write("\x1b[?25h");
			});
		}

		const id = setInterval(() => {
			this.render();
			this.frameIdx = (this.frameIdx + 1) % SPINNER_CHARS.length;
			this.totalFrames++;
			// Rotate verb every ~2 seconds (25 frames at 80ms)
			if (this.totalFrames % 25 === 0) {
				this.verbIdx = (this.verbIdx + 1) % VERBS.length;
			}
		}, 80);
		id.unref();
		this.intervalId = id;
	}

	/** Update the detail text without restarting. */
	update(detail: string): void {
		this.detail = detail;
	}

	/** Stop the spinner and clear everything (spinner + dashboard lines). */
	stop(): void {
		if (!this.running) return;
		this.running = false;
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		// Clear spinner line + all dashboard lines below using "erase to end of screen"
		process.stderr.write(`\r\x1b[K\x1b[J\x1b[?25h`);
		this.extraLines = 0;
	}

	/** Whether the spinner is currently active. */
	get isActive(): boolean {
		return this.running;
	}

	/** Called by the dashboard when it wants to re-render. */
	requestDashboardRender(): void {
		// Dashboard render happens on next spinner tick — no immediate write.
		// This prevents interleaving.
	}

	private render(): void {
		const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
		const char = coral(SPINNER_CHARS[this.frameIdx]);
		const verb = VERBS[this.verbIdx];
		const time = dim(`${elapsed}s`);

		const maxW = termWidth();

		// When streaming feed is active, use its status detail automatically
		const activeDetail = this.streamingFeed ? this.streamingFeed.getStatusDetail() || this.detail : this.detail;

		// Build detail string, truncating if needed (ANSI-safe)
		let detailStr = "";
		if (activeDetail) {
			const prefix = `  X ${verb}...  ${elapsed}s`;
			const available = maxW - prefix.length - 1;
			if (available > 5) {
				const raw = activeDetail;
				detailStr = raw.length > available ? dim(` ${raw.slice(0, available - 2)}\u2026`) : dim(` ${raw}`);
			}
		}

		const line = `  ${char} ${verb}...${detailStr}  ${time}`;

		// Clear previous extra lines (dashboard) — move up from current position
		// Current cursor is on spinner line after last render
		if (this.extraLines > 0) {
			// Move down to the last dashboard line, then clear upward
			process.stderr.write(`\x1b[${this.extraLines}B`); // move down past dashboard
			for (let i = 0; i < this.extraLines; i++) {
				process.stderr.write("\x1b[1A\x1b[2K"); // move up + clear line
			}
		}

		// Write spinner line (we're on the spinner line now)
		process.stderr.write(`\r\x1b[2K${line}`);

		// Write extra lines below — streaming feed takes priority over dashboard
		const provider: LinesProvider | null = this.streamingFeed || this.dashboard;
		if (provider) {
			const extraLines = provider.getLines();
			if (extraLines.length > 0) {
				process.stderr.write("\n");
				process.stderr.write(extraLines.join("\n"));
				this.extraLines = extraLines.length;
				// Move cursor back up to the spinner line
				if (this.extraLines > 0) {
					process.stderr.write(`\x1b[${this.extraLines}A`);
				}
				process.stderr.write("\r");
			} else {
				this.extraLines = 0;
			}
		}
	}
}
