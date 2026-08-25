/**
 * Run logger — writes structured logs for each swarm run to ~/.swarm/logs/.
 *
 * Each run creates a timestamped JSON log file with:
 *   - Task, model, agent, config
 *   - Iterations, sub-queries, thread spawns
 *   - Timing, token usage, costs
 *   - Thread details (task, agent, model, result, duration)
 *   - Final answer and completion status
 *
 * Logs are kept for dev iteration — view with `ls ~/.swarm/logs/` or parse as JSON.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const LOG_DIR = path.join(os.homedir(), ".swarm", "logs");

export interface ThreadLogEntry {
	id: string;
	task: string;
	agent: string;
	model: string;
	success: boolean;
	durationMs: number;
	filesChanged: string[];
	error?: string;
}

export interface RunLogEntry {
	timestamp: string;
	task: string;
	orchestratorModel: string;
	agent: string;
	dir: string;
	completed: boolean;
	iterations: number;
	maxIterations: number;
	durationMs: number;
	threads: ThreadLogEntry[];
	answer?: string;
	error?: string;
}

export class RunLogger {
	private entry: RunLogEntry;
	private threads: ThreadLogEntry[] = [];

	constructor(task: string, orchestratorModel: string, agent: string, dir: string, maxIterations: number) {
		this.entry = {
			timestamp: new Date().toISOString(),
			task,
			orchestratorModel,
			agent,
			dir,
			completed: false,
			iterations: 0,
			maxIterations,
			durationMs: 0,
			threads: [],
		};
	}

	addThread(thread: ThreadLogEntry): void {
		this.threads.push(thread);
	}

	complete(
		result: { completed: boolean; iterations: number; answer?: string; error?: string },
		durationMs: number,
	): void {
		this.entry.completed = result.completed;
		this.entry.iterations = result.iterations;
		this.entry.answer = result.answer;
		this.entry.error = result.error;
		this.entry.durationMs = durationMs;
		this.entry.threads = this.threads;
	}

	/** Write the log file. Call after complete(). */
	save(): string | null {
		try {
			fs.mkdirSync(LOG_DIR, { recursive: true });
			const ts = this.entry.timestamp.replace(/[:.]/g, "-").slice(0, 19);
			const filename = `run-${ts}.json`;
			const filepath = path.join(LOG_DIR, filename);
			fs.writeFileSync(filepath, JSON.stringify(this.entry, null, 2), "utf-8");
			return filepath;
		} catch {
			return null;
		}
	}
}
