#!/usr/bin/env tsx
/**
 * RLM Trajectory Viewer — interactive TUI for browsing saved trajectory JSON files.
 *
 * Navigate through iterations with arrow keys, view code, REPL output,
 * sub-queries, and the final answer in a beautifully formatted display.
 *
 * Usage:
 *   rlm viewer                              # pick from list
 *   rlm viewer trajectories/file.json       # open specific file
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ── Types ───────────────────────────────────────────────────────────────────

interface SubQueryEntry {
	index: number;
	contextLength: number;
	instruction: string;
	resultLength: number;
	resultPreview: string;
	elapsedMs?: number;
}

interface TrajectoryStep {
	iteration: number;
	code: string | null;
	stdout: string;
	stderr: string;
	subQueries: SubQueryEntry[];
	hasFinal: boolean;
	elapsedMs: number;
	userMessage?: string;
	rawResponse?: string;
	systemPrompt?: string;
}

interface TrajectoryData {
	model: string;
	query: string;
	contextLength: number;
	contextLines: number;
	startTime: string;
	iterations: TrajectoryStep[];
	result: { answer: string; iterations: number; totalSubQueries: number; completed: boolean } | null;
	totalElapsedMs: number;
	/** Swarm-specific: thread events recorded during the run. */
	swarm?: SwarmTrajectoryData;
}

// ── Swarm trajectory types ─────────────────────────────────────────────────

interface SwarmThreadEvent {
	threadId: string;
	task: string;
	agent: string;
	model: string;
	slot?: string;
	status: "completed" | "failed" | "cancelled" | "cache_hit";
	filesChanged: string[];
	durationMs: number;
	estimatedCostUsd: number;
	/** Which iteration spawned this thread. */
	iteration: number;
	/** IDs of threads whose output was passed as context (DAG edges). */
	dependsOn?: string[];
}

interface SwarmTrajectoryData {
	threads: SwarmThreadEvent[];
	mergeEvents: Array<{ branch: string; success: boolean; message: string }>;
	cacheStats: { hits: number; misses: number; savedMs: number; savedUsd: number };
	episodeCount?: number;
	totalCostUsd: number;
}

// ── ANSI helpers ────────────────────────────────────────────────────────────

const c = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	italic: "\x1b[3m",
	underline: "\x1b[4m",
	inverse: "\x1b[7m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",
	gray: "\x1b[90m",
	bgBlue: "\x1b[44m",
	bgCyan: "\x1b[46m",
	bgGray: "\x1b[100m",
	clearScreen: "\x1b[2J",
	cursorHome: "\x1b[H",
	hideCursor: "\x1b[?25l",
	showCursor: "\x1b[?25h",
	altScreenOn: "\x1b[?1049h",
	altScreenOff: "\x1b[?1049l",
};

function W(...args: string[]): void {
	process.stdout.write(args.join(""));
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function getWidth(): number {
	return Math.min(process.stdout.columns || 80, 120);
}

function getHeight(): number {
	return process.stdout.rows || 24;
}

function hline(ch = "━", color = c.cyan): string {
	return `${color}${ch.repeat(getWidth())}${c.reset}`;
}

function centeredHeader(text: string, color = c.cyan): string {
	const w = getWidth();
	const stripped = text.replace(/\x1b\[[0-9;]*m/g, "");
	const pad = Math.max(0, w - stripped.length - 4);
	const left = Math.floor(pad / 2);
	const right = pad - left;
	return `${color}${"━".repeat(left)} ${text}${color} ${"━".repeat(right)}${c.reset}`;
}

function boxed(title: string, content: string, color: string): void {
	const w = getWidth() - 4;
	const display = content;
	W(`  ${color}${c.bold}${title}${c.reset}\n`);
	W(`  ${color}┌${"─".repeat(w)}┐${c.reset}\n`);
	for (const line of display.split("\n")) {
		const stripped = line.replace(/\x1b\[[0-9;]*m/g, "");
		const padding = Math.max(0, w - stripped.length - 1);
		W(`  ${color}│${c.reset} ${line}${" ".repeat(padding)}${color}│${c.reset}\n`);
	}
	W(`  ${color}└${"─".repeat(w)}┘${c.reset}\n`);
}

function kvLine(key: string, value: string): void {
	W(`  ${c.gray}${key}:${c.reset} ${value}\n`);
}

function formatSize(chars: number): string {
	if (chars >= 1_000_000) return `${(chars / 1_000_000).toFixed(1)}M`;
	if (chars >= 1000) return `${(chars / 1000).toFixed(1)}K`;
	return `${chars}`;
}

// ── File picker ─────────────────────────────────────────────────────────────

interface FileEntry {
	name: string;
	path: string;
	size: number;
	mtime: Date;
	traj?: TrajectoryData;
}

/** Parse only the metadata fields from a trajectory JSON (not the full iterations array). */
function parseTrajectoryMeta(filePath: string): Partial<TrajectoryData> | undefined {
	try {
		const raw = fs.readFileSync(filePath, "utf-8");
		// Quick partial parse: extract just the top-level fields we need for the list
		const data = JSON.parse(raw);
		return {
			query: data.query,
			iterations: data.iterations ? (new Array(data.iterations.length) as any) : [],
			result: data.result ? ({ completed: data.result.completed } as any) : null,
		};
	} catch {
		return undefined;
	}
}

function listTrajectories(): FileEntry[] {
	// Check both ~/.rlm/trajectories/ (default) and ./trajectories/ (legacy/local)
	const homeDir = path.join(os.homedir(), ".rlm", "trajectories");
	const localDir = path.resolve(process.cwd(), "trajectories");
	const dir = fs.existsSync(homeDir) ? homeDir : localDir;
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.map((f) => {
			const full = path.join(dir, f);
			const stat = fs.statSync(full);
			const traj = parseTrajectoryMeta(full) as TrajectoryData | undefined;
			return { name: f, path: full, size: stat.size, mtime: stat.mtime, traj };
		})
		.sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // newest first
}

async function pickFile(files: FileEntry[]): Promise<string> {
	return new Promise((resolve) => {
		let selected = 0;
		const maxVisible = Math.min(files.length, getHeight() - 10);

		function render(): void {
			W(c.cursorHome, c.clearScreen, c.hideCursor);
			W(`\n${hline()}\n`);
			W(`${centeredHeader(`${c.bold}${c.white}RLM Trajectory Viewer${c.reset}`)}\n`);
			W(`${hline()}\n\n`);
			W(`  ${c.bold}Select a trajectory:${c.reset}  ${c.dim}(up/down navigate, enter select, q quit)${c.reset}\n\n`);

			const scrollStart = Math.max(0, selected - Math.floor(maxVisible / 2));
			const scrollEnd = Math.min(files.length, scrollStart + maxVisible);

			for (let i = scrollStart; i < scrollEnd; i++) {
				const f = files[i];
				const isSel = i === selected;
				const sizeKB = (f.size / 1024).toFixed(1);

				// Extract info from trajectory data
				const steps = f.traj?.iterations?.length ?? 0;
				const completed = f.traj?.result?.completed;
				const status =
					completed === true ? `${c.green}done${c.reset}` : completed === false ? `${c.yellow}partial${c.reset}` : "";
				const queryPreview = f.traj?.query
					? f.traj.query.length > 40
						? `${f.traj.query.slice(0, 37)}...`
						: f.traj.query
					: "";

				// Date from filename
				const dateMatch = f.name.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})/);
				const dateStr = dateMatch ? `${dateMatch[1]} ${dateMatch[2]}:${dateMatch[3]}` : f.name;

				const prefix = isSel ? `${c.cyan}${c.bold}  > ` : `    `;
				const nameColor = isSel ? `${c.cyan}${c.bold}` : c.white;

				W(`${prefix}${nameColor}${dateStr}${c.reset}`);
				W(`  ${c.dim}${sizeKB}KB${c.reset}`);
				W(`  ${c.dim}${steps} step${steps !== 1 ? "s" : ""}${c.reset}`);
				if (status) W(`  ${status}`);
				if (queryPreview) W(`  ${c.dim}${queryPreview}${c.reset}`);
				W(`\n`);
			}

			if (files.length > maxVisible) {
				W(
					`\n  ${c.dim}${scrollStart > 0 ? "^ more above" : ""}  ${scrollEnd < files.length ? "v more below" : ""}${c.reset}\n`,
				);
			}
			W(`\n`);
		}

		render();

		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding("utf8");

		function onKey(key: string): void {
			if (key === "\x1b[A") {
				selected = Math.max(0, selected - 1);
				render();
			} else if (key === "\x1b[B") {
				selected = Math.min(files.length - 1, selected + 1);
				render();
			} else if (key === "\r" || key === "\n") {
				process.stdin.removeListener("data", onKey);
				process.stdin.setRawMode(false);
				process.stdin.pause();
				resolve(files[selected].path);
			} else if (key === "q" || key === "\x03") {
				W(c.showCursor, c.altScreenOff);
				process.exit(0);
			}
		}

		process.stdin.on("data", onKey);
	});
}

// ── Rendering views ─────────────────────────────────────────────────────────

type ViewMode =
	| "overview"
	| "iteration"
	| "result"
	| "subqueries"
	| "subqueryDetail"
	| "llmInput"
	| "llmResponse"
	| "systemPrompt"
	| "swarm"
	| "swarmThreadDetail";

interface ViewState {
	mode: ViewMode;
	iterIdx: number; // 0-based index into iterations
	subQueryIdx: number; // 0-based index into sub-queries for current iteration
	scrollY: number;
	traj: TrajectoryData;
	swarmThreadIdx: number; // 0-based index into flat thread list for swarm view
	showCostBreakdown: boolean; // toggle cost breakdown panel in swarm view
}

function buildIterLine(step: TrajectoryStep, isSelected: boolean): string {
	const isFinal = step.hasFinal;
	const elapsed = (step.elapsedMs / 1000).toFixed(1);
	const sqCount = step.subQueries.length;

	const bullet = isFinal ? `${c.green}${c.bold}*${c.reset}` : `${c.blue}o${c.reset}`;
	const sel = isSelected ? `${c.inverse}${c.cyan}` : "";
	const codeLen = step.code ? step.code.split("\n").length : 0;
	const outLen = step.stdout ? step.stdout.split("\n").length : 0;
	const sqInfo = sqCount > 0 ? ` | ${c.magenta}${sqCount} sub-quer${sqCount !== 1 ? "ies" : "y"}${c.reset}` : "";
	const errInfo = step.stderr ? ` | ${c.red}stderr${c.reset}` : "";

	let line = `  ${sel} ${bullet} ${c.bold}Iteration ${step.iteration}${c.reset}`;
	line += `${sel ? c.reset : ""} ${c.dim}${elapsed}s${c.reset}`;
	line += ` | ${c.green}${codeLen}L code${c.reset} | ${c.yellow}${outLen}L output${c.reset}${sqInfo}${errInfo}`;
	if (isFinal) line += ` | ${c.green}${c.bold}FINAL${c.reset}`;
	return line;
}

function renderOverview(state: ViewState): void {
	const { traj } = state;
	const w = getWidth();
	const h = getHeight();

	// Build all lines into a buffer
	const buf: string[] = [];

	// Header
	buf.push(``);
	buf.push(hline());
	buf.push(centeredHeader(`${c.bold}${c.white}RLM Trajectory Viewer${c.reset}`));
	buf.push(hline());
	buf.push(``);
	buf.push(`  ${c.gray}Model   :${c.reset} ${c.bold}${traj.model}${c.reset}`);
	buf.push(`  ${c.gray}Query   :${c.reset} ${c.yellow}${traj.query}${c.reset}`);
	buf.push(
		`  ${c.gray}Context :${c.reset} ${traj.contextLength.toLocaleString()} chars | ${traj.contextLines.toLocaleString()} lines`,
	);
	buf.push(
		`  ${c.gray}Duration:${c.reset} ${(traj.totalElapsedMs / 1000).toFixed(1)}s  ${c.gray}|${c.reset}  ${traj.result?.completed ? `${c.green}Completed${c.reset}` : `${c.red}Incomplete${c.reset}`}`,
	);
	buf.push(``);
	buf.push(`  ${c.bold}Iterations${c.reset}  ${c.dim}(${traj.iterations.length} total)${c.reset}`);
	buf.push(``);

	const headerSize = buf.length;
	const footerSize = 2;
	const answerSize = traj.result ? 4 : 0;
	const iterBudget = h - headerSize - footerSize - answerSize;

	// Build iteration lines (each iteration = summary + separator)
	const flatLines: string[] = [];
	const iterStartOffsets: number[] = [];
	for (let i = 0; i < traj.iterations.length; i++) {
		const step = traj.iterations[i];
		const isSel = i === state.iterIdx;
		iterStartOffsets.push(flatLines.length);
		flatLines.push(buildIterLine(step, isSel));
		if (i < traj.iterations.length - 1) {
			flatLines.push(`  ${c.dim}  |${c.reset}`);
		}
	}

	// Scroll so selected iteration is visible
	const selStart = iterStartOffsets[state.iterIdx] ?? 0;
	let scrollY = Math.max(0, selStart - 2);

	// If everything fits, no scroll needed
	if (flatLines.length <= iterBudget) {
		scrollY = 0;
	}

	const showFrom = scrollY;
	const showTo = Math.min(flatLines.length, scrollY + iterBudget);

	if (showFrom > 0) {
		buf.push(`  ${c.dim}  ^ more above${c.reset}`);
	}

	for (let i = showFrom; i < showTo; i++) {
		buf.push(flatLines[i]);
	}

	if (showTo < flatLines.length) {
		buf.push(`  ${c.dim}  | more below${c.reset}`);
	}

	// Answer preview
	if (traj.result) {
		buf.push(`${c.green}${"─".repeat(w)}${c.reset}`);
		buf.push(`  ${c.green}${c.bold}Answer Preview:${c.reset}`);
		const preview = traj.result.answer.split("\n")[0] || "";
		buf.push(`  ${c.white}${preview}${c.reset}`);
		if (traj.result.answer.split("\n").length > 1) {
			buf.push(`  ${c.dim}... (press 'r' to see full result)${c.reset}`);
		}
	}

	// Render
	W(c.cursorHome, c.clearScreen, c.hideCursor);
	for (const l of buf) W(`${l}\n`);

	// Footer
	W(`${hline("─", c.gray)}\n`);
	const swarmHint = traj.swarm ? `  ${c.dim}t${c.reset} threads` : "";
	W(
		`  ${c.dim}up/down${c.reset} select  ${c.dim}enter${c.reset} view  ${c.dim}r${c.reset} result${swarmHint}  ${c.dim}q${c.reset} quit\n`,
	);
}

function buildIterationContent(step: TrajectoryStep, traj: TrajectoryData): string[] {
	const lines: string[] = [];
	const w = getWidth() - 4;

	// Title
	lines.push(``);
	lines.push(hline());
	const finalTag = step.hasFinal ? `  ${c.green}${c.bold}FINAL${c.reset}` : "";
	lines.push(
		centeredHeader(`${c.bold}${c.white}Iteration ${step.iteration} / ${traj.iterations.length}${c.reset}${finalTag}`),
	);
	lines.push(hline());
	lines.push(``);

	// Metadata
	const elapsed = (step.elapsedMs / 1000).toFixed(1);
	lines.push(`  ${c.gray}Elapsed    :${c.reset} ${elapsed}s`);
	lines.push(`  ${c.gray}Sub-queries:${c.reset} ${step.subQueries.length}`);
	lines.push(
		`  ${c.gray}Has Final  :${c.reset} ${step.hasFinal ? `${c.green}yes${c.reset}` : `${c.gray}no${c.reset}`}`,
	);
	lines.push(``);

	// Code
	if (step.code) {
		lines.push(`  ${c.green}${c.bold}Generated Code${c.reset}`);
		lines.push(`  ${c.green}┌${"─".repeat(w)}┐${c.reset}`);
		for (const cl of syntaxHighlight(step.code).split("\n")) {
			const stripped = cl.replace(/\x1b\[[0-9;]*m/g, "");
			const padding = Math.max(0, w - stripped.length - 1);
			lines.push(`  ${c.green}│${c.reset} ${cl}${" ".repeat(padding)}${c.green}│${c.reset}`);
		}
		lines.push(`  ${c.green}└${"─".repeat(w)}┘${c.reset}`);
		lines.push(``);
	}

	// REPL Output
	if (step.stdout) {
		lines.push(`  ${c.yellow}${c.bold}REPL Output${c.reset}`);
		lines.push(`  ${c.yellow}┌${"─".repeat(w)}┐${c.reset}`);
		for (const ol of step.stdout.split("\n")) {
			const stripped = ol.replace(/\x1b\[[0-9;]*m/g, "");
			const padding = Math.max(0, w - stripped.length - 1);
			lines.push(`  ${c.yellow}│${c.reset} ${ol}${" ".repeat(padding)}${c.yellow}│${c.reset}`);
		}
		lines.push(`  ${c.yellow}└${"─".repeat(w)}┘${c.reset}`);
		lines.push(``);
	}

	// Stderr
	if (step.stderr) {
		lines.push(`  ${c.red}${c.bold}Stderr${c.reset}`);
		lines.push(`  ${c.red}┌${"─".repeat(w)}┐${c.reset}`);
		for (const el of step.stderr.split("\n")) {
			const stripped = el.replace(/\x1b\[[0-9;]*m/g, "");
			const padding = Math.max(0, w - stripped.length - 1);
			lines.push(`  ${c.red}│${c.reset} ${el}${" ".repeat(padding)}${c.red}│${c.reset}`);
		}
		lines.push(`  ${c.red}└${"─".repeat(w)}┘${c.reset}`);
		lines.push(``);
	}

	// Sub-queries
	if (step.subQueries.length > 0) {
		lines.push(
			`  ${c.magenta}${c.bold}Sub-queries (${step.subQueries.length})${c.reset}  ${c.dim}press 's' for details${c.reset}`,
		);
		for (const sq of step.subQueries) {
			const instrPreview = sq.instruction.length > 60 ? `${sq.instruction.slice(0, 57)}...` : sq.instruction;
			const sqElapsed = sq.elapsedMs ? `  ${c.dim}${(sq.elapsedMs / 1000).toFixed(1)}s${c.reset}` : "";
			lines.push(
				`    ${c.magenta}#${sq.index}${c.reset} ${c.dim}(${formatSize(sq.contextLength)})${c.reset}${sqElapsed} ${instrPreview}`,
			);
		}
		lines.push(``);
	}

	return lines;
}

function renderIteration(state: ViewState): void {
	const { traj, iterIdx } = state;
	const step = traj.iterations[iterIdx];
	if (!step) return;

	const allLines = buildIterationContent(step, traj);

	const h = getHeight();
	const footerSize = 2;
	const viewable = h - footerSize;

	// Clamp scrollY
	const maxScroll = Math.max(0, allLines.length - viewable);
	if (state.scrollY > maxScroll) state.scrollY = maxScroll;
	if (state.scrollY < 0) state.scrollY = 0;

	const from = state.scrollY;
	// Reserve lines for scroll indicators when needed
	const hasScrollUp = from > 0;
	const hasScrollDown = from + viewable < allLines.length;
	const contentLines = viewable - (hasScrollUp ? 1 : 0) - (hasScrollDown ? 1 : 0);
	const to = Math.min(allLines.length, from + contentLines);

	W(c.cursorHome, c.clearScreen, c.hideCursor);

	if (hasScrollUp) {
		W(`  ${c.dim}^ scroll up (${from} lines above)${c.reset}\n`);
	}
	for (let i = from; i < to; i++) W(`${allLines[i]}\n`);

	if (hasScrollDown) {
		W(`  ${c.dim}v scroll down (${allLines.length - to} lines below)${c.reset}\n`);
	}

	// Footer
	const hints: string[] = [];
	if (step.userMessage) hints.push(`${c.dim}i${c.reset} input`);
	if (step.rawResponse) hints.push(`${c.dim}l${c.reset} response`);
	if (step.systemPrompt || traj.iterations[0]?.systemPrompt) hints.push(`${c.dim}p${c.reset} prompt`);

	W(`${hline("─", c.gray)}\n`);
	W(`  ${c.dim}esc${c.reset} back  `);
	W(`${c.dim}up/down${c.reset} scroll  `);
	W(`${c.dim}n/N${c.reset} next/prev`);
	if (step.subQueries.length > 0) W(`${c.dim}s${c.reset} sub-queries  `);
	for (const hint of hints) W(`${hint}  `);
	W(`${c.dim}r${c.reset} result  `);
	W(`${c.dim}q${c.reset} quit\n`);
}

function renderResult(state: ViewState): void {
	const { traj } = state;
	const result = traj.result;

	W(c.cursorHome, c.clearScreen, c.hideCursor);

	W(`\n${hline("━", c.green)}\n`);
	W(`${centeredHeader(`${c.bold}${c.white}Final Result${c.reset}`, c.green)}\n`);
	W(`${hline("━", c.green)}\n\n`);

	if (!result) {
		W(`  ${c.red}${c.bold}No result available${c.reset} — the run may have been interrupted.\n`);
	} else {
		kvLine("Completed   ", result.completed ? `${c.green}yes${c.reset}` : `${c.red}no${c.reset}`);
		kvLine("Iterations  ", `${result.iterations}`);
		kvLine("Sub-queries ", `${result.totalSubQueries}`);
		kvLine("Duration    ", `${(traj.totalElapsedMs / 1000).toFixed(1)}s`);
		W(`\n`);

		boxed("Answer", result.answer, c.green);
	}

	W(`\n${hline("─", c.gray)}\n`);
	W(`  ${c.dim}esc${c.reset} back  `);
	W(`${c.dim}q${c.reset} quit\n`);
}

function renderSubQueries(state: ViewState): void {
	const { traj, iterIdx } = state;
	const step = traj.iterations[iterIdx];
	if (!step) return;

	const h = getHeight();

	// Build buffer
	const buf: string[] = [];

	buf.push(``);
	buf.push(hline("━", c.magenta));
	buf.push(centeredHeader(`${c.bold}${c.white}Sub-queries — Iteration ${step.iteration}${c.reset}`, c.magenta));
	buf.push(hline("━", c.magenta));
	buf.push(``);

	if (step.subQueries.length === 0) {
		buf.push(`  ${c.dim}No sub-queries in this iteration.${c.reset}`);
	} else {
		// Clamp subQueryIdx
		if (state.subQueryIdx >= step.subQueries.length) state.subQueryIdx = step.subQueries.length - 1;
		if (state.subQueryIdx < 0) state.subQueryIdx = 0;

		const headerSize = buf.length;
		const footerSize = 2;
		const listBudget = h - headerSize - footerSize;

		// Build list lines (each sub-query = 2 lines: summary + separator)
		const listLines: string[] = [];
		const sqStartOffsets: number[] = [];
		for (let i = 0; i < step.subQueries.length; i++) {
			const sq = step.subQueries[i];
			const isSel = i === state.subQueryIdx;
			const sqElapsed = sq.elapsedMs ? `${(sq.elapsedMs / 1000).toFixed(1)}s` : "";
			const instrPreview = sq.instruction.length > 50 ? `${sq.instruction.slice(0, 47)}...` : sq.instruction;

			sqStartOffsets.push(listLines.length);

			const sel = isSel ? `${c.inverse}${c.magenta}` : "";
			const prefix = isSel ? `${c.magenta}${c.bold}  > ` : `    `;
			let line = `${prefix}${sel}#${sq.index}${c.reset}`;
			line += `  ${c.dim}${sqElapsed}${c.reset}`;
			line += `  ${c.dim}${formatSize(sq.contextLength)} in, ${formatSize(sq.resultLength)} out${c.reset}`;
			line += `  ${instrPreview}`;
			listLines.push(line);

			if (i < step.subQueries.length - 1) {
				listLines.push(`  ${c.dim}  |${c.reset}`);
			}
		}

		// Scroll so selected sub-query is visible
		const selStart = sqStartOffsets[state.subQueryIdx] ?? 0;
		let scrollY = Math.max(0, selStart - 2);
		if (listLines.length <= listBudget) scrollY = 0;

		const showFrom = scrollY;
		const showTo = Math.min(listLines.length, scrollY + listBudget);

		if (showFrom > 0) {
			buf.push(`  ${c.dim}  ^ more above${c.reset}`);
		}
		for (let i = showFrom; i < showTo; i++) {
			buf.push(listLines[i]);
		}
		if (showTo < listLines.length) {
			buf.push(`  ${c.dim}  | more below${c.reset}`);
		}
	}

	// Render
	W(c.cursorHome, c.clearScreen, c.hideCursor);
	for (const l of buf) W(`${l}\n`);

	// Footer
	W(`${hline("─", c.gray)}\n`);
	W(
		`  ${c.dim}up/down${c.reset} select  ${c.dim}enter${c.reset} view  ${c.dim}esc${c.reset} back  ${c.dim}q${c.reset} quit\n`,
	);
}

function renderSubQueryDetail(state: ViewState): void {
	const { traj, iterIdx } = state;
	const step = traj.iterations[iterIdx];
	if (!step) return;

	// Clamp subQueryIdx
	if (state.subQueryIdx >= step.subQueries.length) state.subQueryIdx = step.subQueries.length - 1;
	if (state.subQueryIdx < 0) state.subQueryIdx = 0;
	const sq = step.subQueries[state.subQueryIdx];
	if (!sq) return;

	const w = getWidth() - 4;
	const h = getHeight();

	// Build all content lines
	const allLines: string[] = [];

	allLines.push(``);
	allLines.push(hline("━", c.magenta));
	allLines.push(
		centeredHeader(`${c.bold}${c.white}Sub-query #${sq.index} — Iteration ${step.iteration}${c.reset}`, c.magenta),
	);
	allLines.push(hline("━", c.magenta));
	allLines.push(``);

	// Metadata
	const sqElapsed = sq.elapsedMs ? `${(sq.elapsedMs / 1000).toFixed(1)}s` : "n/a";
	allLines.push(`  ${c.gray}Elapsed       :${c.reset} ${sqElapsed}`);
	allLines.push(`  ${c.gray}Context length:${c.reset} ${formatSize(sq.contextLength)} chars`);
	allLines.push(`  ${c.gray}Result length :${c.reset} ${formatSize(sq.resultLength)} chars`);
	allLines.push(`  ${c.gray}Position      :${c.reset} ${state.subQueryIdx + 1} of ${step.subQueries.length}`);
	allLines.push(``);

	// Full instruction (boxed, no truncation)
	allLines.push(`  ${c.magenta}${c.bold}Instruction${c.reset}`);
	allLines.push(`  ${c.magenta}┌${"─".repeat(w)}┐${c.reset}`);
	for (const line of sq.instruction.split("\n")) {
		const stripped = line.replace(/\x1b\[[0-9;]*m/g, "");
		const padding = Math.max(0, w - stripped.length - 1);
		allLines.push(`  ${c.magenta}│${c.reset} ${line}${" ".repeat(padding)}${c.magenta}│${c.reset}`);
	}
	allLines.push(`  ${c.magenta}└${"─".repeat(w)}┘${c.reset}`);
	allLines.push(``);

	// Full result preview (boxed, no truncation)
	allLines.push(`  ${c.cyan}${c.bold}Result Preview${c.reset}`);
	allLines.push(`  ${c.cyan}┌${"─".repeat(w)}┐${c.reset}`);
	for (const line of sq.resultPreview.split("\n")) {
		const stripped = line.replace(/\x1b\[[0-9;]*m/g, "");
		const padding = Math.max(0, w - stripped.length - 1);
		allLines.push(`  ${c.cyan}│${c.reset} ${line}${" ".repeat(padding)}${c.cyan}│${c.reset}`);
	}
	allLines.push(`  ${c.cyan}└${"─".repeat(w)}┘${c.reset}`);
	allLines.push(``);

	// Scrollable rendering
	const footerSize = 2;
	const viewable = h - footerSize;

	const maxScroll = Math.max(0, allLines.length - viewable);
	if (state.scrollY > maxScroll) state.scrollY = maxScroll;
	if (state.scrollY < 0) state.scrollY = 0;

	const from = state.scrollY;
	const hasScrollUp = from > 0;
	const hasScrollDown = from + viewable < allLines.length;
	const contentLines = viewable - (hasScrollUp ? 1 : 0) - (hasScrollDown ? 1 : 0);
	const to = Math.min(allLines.length, from + contentLines);

	W(c.cursorHome, c.clearScreen, c.hideCursor);

	if (hasScrollUp) {
		W(`  ${c.dim}^ scroll up (${from} lines above)${c.reset}\n`);
	}
	for (let i = from; i < to; i++) W(`${allLines[i]}\n`);

	if (hasScrollDown) {
		W(`  ${c.dim}v scroll down (${allLines.length - to} lines below)${c.reset}\n`);
	}

	// Footer
	W(`${hline("─", c.gray)}\n`);
	W(
		`  ${c.dim}up/down${c.reset} scroll  ${c.dim}n/N${c.reset} next/prev  ${c.dim}esc${c.reset} back  ${c.dim}q${c.reset} quit\n`,
	);
}

function renderLlmInput(state: ViewState): void {
	const { traj, iterIdx } = state;
	const step = traj.iterations[iterIdx];
	if (!step) return;

	W(c.cursorHome, c.clearScreen, c.hideCursor);

	W(`\n${hline("━", c.blue)}\n`);
	W(`${centeredHeader(`${c.bold}${c.white}LLM Input — Iteration ${step.iteration}${c.reset}`, c.blue)}\n`);
	W(`${hline("━", c.blue)}\n\n`);

	if (step.userMessage) {
		kvLine("Length", `${step.userMessage.length.toLocaleString()} chars`);
		W(`\n`);
		boxed("User Message", step.userMessage, c.blue);
	} else {
		W(`  ${c.dim}No user message recorded for this iteration.${c.reset}\n`);
	}

	W(`\n${hline("─", c.gray)}\n`);
	W(`  ${c.dim}esc${c.reset} back  `);
	W(`${c.dim}q${c.reset} quit\n`);
}

function renderLlmResponse(state: ViewState): void {
	const { traj, iterIdx } = state;
	const step = traj.iterations[iterIdx];
	if (!step) return;

	W(c.cursorHome, c.clearScreen, c.hideCursor);

	W(`\n${hline("━", c.green)}\n`);
	W(`${centeredHeader(`${c.bold}${c.white}LLM Response — Iteration ${step.iteration}${c.reset}`, c.green)}\n`);
	W(`${hline("━", c.green)}\n\n`);

	if (step.rawResponse) {
		kvLine("Length", `${step.rawResponse.length.toLocaleString()} chars`);
		W(`\n`);
		boxed("Full LLM Response", step.rawResponse, c.green);
	} else {
		W(`  ${c.dim}No response recorded for this iteration.${c.reset}\n`);
	}

	W(`\n${hline("─", c.gray)}\n`);
	W(`  ${c.dim}esc${c.reset} back  `);
	W(`${c.dim}q${c.reset} quit\n`);
}

function renderSystemPrompt(state: ViewState): void {
	const { traj, iterIdx } = state;
	const step = traj.iterations[iterIdx];
	if (!step) return;

	W(c.cursorHome, c.clearScreen, c.hideCursor);

	W(`\n${hline("━", c.cyan)}\n`);
	W(`${centeredHeader(`${c.bold}${c.white}System Prompt${c.reset}`, c.cyan)}\n`);
	W(`${hline("━", c.cyan)}\n\n`);

	const sysPrompt = step.systemPrompt || traj.iterations[0]?.systemPrompt;
	if (sysPrompt) {
		boxed("System Prompt", sysPrompt, c.cyan);
	} else {
		W(`  ${c.dim}System prompt not recorded in this trajectory.${c.reset}\n`);
	}

	W(`\n${hline("─", c.gray)}\n`);
	W(`  ${c.dim}esc${c.reset} back  `);
	W(`${c.dim}q${c.reset} quit\n`);
}

// ── Swarm view helpers ──────────────────────────────────────────────────────

/** Build a timing bar: filled blocks for elapsed portion, empty for remainder. */
function timingBar(durationMs: number, maxDurationMs: number, barWidth: number): string {
	if (maxDurationMs <= 0) return "░".repeat(barWidth);
	const filled = Math.min(barWidth, Math.max(1, Math.round((durationMs / maxDurationMs) * barWidth)));
	const empty = barWidth - filled;
	return "█".repeat(filled) + "░".repeat(empty);
}

/** Get status color for a thread. */
function statusColor(status: SwarmThreadEvent["status"]): string {
	switch (status) {
		case "completed":
			return c.green;
		case "failed":
			return c.red;
		case "cache_hit":
			return c.yellow;
		case "cancelled":
			return c.gray;
		default:
			return c.white;
	}
}

/** Get status label for a thread. */
function statusLabel(status: SwarmThreadEvent["status"]): string {
	switch (status) {
		case "cache_hit":
			return "CACHED";
		default:
			return status.toUpperCase();
	}
}

/** Get the flat ordered thread list (grouped by iteration). */
function getFlatThreadList(swarm: SwarmTrajectoryData): SwarmThreadEvent[] {
	const byIteration: Map<number, SwarmThreadEvent[]> = new Map();
	for (const t of swarm.threads) {
		const group = byIteration.get(t.iteration) || [];
		group.push(t);
		byIteration.set(t.iteration, group);
	}
	const iterations = [...byIteration.keys()].sort((a, b) => a - b);
	const flat: SwarmThreadEvent[] = [];
	for (const iter of iterations) {
		flat.push(...byIteration.get(iter)!);
	}
	return flat;
}

// ── Swarm view ──────────────────────────────────────────────────────────────

function renderSwarmView(state: ViewState): void {
	const { traj } = state;
	const swarm = traj.swarm;
	const h = getHeight();

	const buf: string[] = [];

	// Header
	buf.push(``);
	buf.push(hline("━", c.cyan));
	buf.push(centeredHeader(`${c.bold}${c.white}Swarm Thread DAG${c.reset}`, c.cyan));
	buf.push(hline("━", c.cyan));
	buf.push(``);

	if (!swarm || swarm.threads.length === 0) {
		buf.push(`  ${c.dim}No swarm thread data in this trajectory.${c.reset}`);
		buf.push(`  ${c.dim}(Run in swarm mode to generate thread data)${c.reset}`);

		W(c.cursorHome, c.clearScreen, c.hideCursor);
		for (const l of buf) W(`${l}\n`);
		W(`\n${hline("─", c.gray)}\n`);
		W(`  ${c.dim}esc${c.reset} back  ${c.dim}q${c.reset} quit\n`);
		return;
	}

	// Compute stats
	const completed = swarm.threads.filter((t) => t.status === "completed").length;
	const failed = swarm.threads.filter((t) => t.status === "failed").length;
	const cached = swarm.threads.filter((t) => t.status === "cache_hit").length;
	const cancelled = swarm.threads.filter((t) => t.status === "cancelled").length;
	const aggregateDuration = swarm.threads.reduce((s, t) => s + t.durationMs, 0);
	const maxDurationMs = Math.max(...swarm.threads.map((t) => t.durationMs), 1);

	// Estimate wall-clock time: sum of max-duration per iteration
	const byIteration: Map<number, SwarmThreadEvent[]> = new Map();
	for (const t of swarm.threads) {
		const group = byIteration.get(t.iteration) || [];
		group.push(t);
		byIteration.set(t.iteration, group);
	}
	const iterations = [...byIteration.keys()].sort((a, b) => a - b);
	let wallClockMs = 0;
	for (const iter of iterations) {
		const threads = byIteration.get(iter)!;
		wallClockMs += Math.max(...threads.map((t) => t.durationMs));
	}

	// Summary stats
	buf.push(
		`  ${c.gray}Threads :${c.reset} ${swarm.threads.length} total  ${c.green}${completed} ok${c.reset}  ${failed > 0 ? `${c.red}${failed} fail${c.reset}  ` : ""}${cached > 0 ? `${c.yellow}${cached} cached${c.reset}  ` : ""}${cancelled > 0 ? `${c.gray}${cancelled} cancelled${c.reset}  ` : ""}`,
	);
	buf.push(`  ${c.gray}Cost    :${c.reset} $${swarm.totalCostUsd.toFixed(4)}`);
	buf.push(
		`  ${c.gray}Time    :${c.reset} ${(wallClockMs / 1000).toFixed(1)}s wall / ${(aggregateDuration / 1000).toFixed(1)}s aggregate  ${c.dim}(${aggregateDuration > 0 ? (aggregateDuration / Math.max(wallClockMs, 1)).toFixed(1) : "1.0"}x parallelism)${c.reset}`,
	);
	if (swarm.cacheStats.hits > 0) {
		buf.push(
			`  ${c.gray}Cache   :${c.reset} ${swarm.cacheStats.hits} hits, saved ${(swarm.cacheStats.savedMs / 1000).toFixed(1)}s / $${swarm.cacheStats.savedUsd.toFixed(4)}`,
		);
	}
	if (swarm.episodeCount !== undefined) {
		buf.push(`  ${c.gray}Episodes:${c.reset} ${swarm.episodeCount} in memory`);
	}
	buf.push(``);

	// Build flat thread list for navigation
	const flatThreads = getFlatThreadList(swarm);

	// Clamp swarmThreadIdx
	if (state.swarmThreadIdx >= flatThreads.length) state.swarmThreadIdx = flatThreads.length - 1;
	if (state.swarmThreadIdx < 0) state.swarmThreadIdx = 0;

	// Determine timing bar width (fits within terminal minus prefix overhead)
	const barWidth = 10;

	// Build DAG lines — each thread produces 2-3 lines, iteration headers produce 1 line + connector
	const dagLines: string[] = [];
	const threadLineOffsets: number[] = []; // maps flat thread index -> dagLines offset
	let flatIdx = 0;

	for (let iterPos = 0; iterPos < iterations.length; iterPos++) {
		const iter = iterations[iterPos];
		const threads = byIteration.get(iter)!;

		// Iteration header with dependency info
		const allDeps = new Set<string>();
		for (const t of threads) {
			if (t.dependsOn) {
				for (const d of t.dependsOn) allDeps.add(d);
			}
		}
		// Filter deps to only those from prior iterations
		const priorThreadIds = new Set<string>();
		for (let pi = 0; pi < iterPos; pi++) {
			const priorIter = iterations[pi];
			for (const pt of byIteration.get(priorIter)!) {
				priorThreadIds.add(pt.threadId);
			}
		}
		const externalDeps = [...allDeps].filter((d) => priorThreadIds.has(d));
		const depSuffix =
			externalDeps.length > 0
				? `  ${c.dim}(depends on: ${externalDeps.map((d) => d.slice(0, 8)).join(", ")})${c.reset}`
				: "";

		dagLines.push(`  ${c.cyan}${c.bold}Iteration ${iter}${c.reset}${depSuffix}`);

		for (let ti = 0; ti < threads.length; ti++) {
			const t = threads[ti];
			const isSelected = flatIdx === state.swarmThreadIdx;
			const isLast = ti === threads.length - 1;
			const connector = isLast ? "└─" : "├─";
			const subConnector = isLast ? "   " : "│  ";

			const tag = t.threadId.slice(0, 8);
			const sColor = statusColor(t.status);
			const sLabel = statusLabel(t.status).padEnd(9);
			const bar = timingBar(t.durationMs, maxDurationMs, barWidth);
			const duration = `${(t.durationMs / 1000).toFixed(1)}s`.padStart(6);
			const cost = `$${t.estimatedCostUsd.toFixed(4)}`;

			const highlight = isSelected ? `${c.inverse}` : "";
			const highlightEnd = isSelected ? `${c.reset}` : "";

			// Thread main line
			threadLineOffsets.push(dagLines.length);
			const mainLine = `    ${connector} ${highlight}${c.dim}${tag}${c.reset}${highlightEnd} ${sColor}${sLabel}${c.reset}  ${sColor}${bar}${c.reset}  ${c.dim}${duration}  ${cost}${c.reset}  ${t.agent}/${c.bold}${t.model}${c.reset}`;
			dagLines.push(mainLine);

			// Task description line
			const taskPreview = t.task.length > 65 ? `${t.task.slice(0, 62)}...` : t.task;
			const fileCount = t.filesChanged.length;
			const fileSuffix = fileCount > 0 ? ` ${c.dim}(${fileCount} file${fileCount !== 1 ? "s" : ""})${c.reset}` : "";
			dagLines.push(`    ${subConnector} └─ ${taskPreview}${fileSuffix}`);

			flatIdx++;
		}

		// Inter-iteration connector
		if (iterPos < iterations.length - 1) {
			dagLines.push(`  ${c.dim}│${c.reset}`);
		}
	}

	// Merge events
	if (swarm.mergeEvents.length > 0) {
		dagLines.push(``);
		dagLines.push(`  ${c.magenta}${c.bold}Merge Results${c.reset}`);
		for (const m of swarm.mergeEvents) {
			const icon = m.success ? `${c.green}+${c.reset}` : `${c.red}x${c.reset}`;
			dagLines.push(`    ${icon} ${m.branch}: ${m.message}`);
		}
	}

	// Cost breakdown panel (toggled with 'c')
	if (state.showCostBreakdown) {
		dagLines.push(``);
		dagLines.push(`  ${c.yellow}${c.bold}Cost Breakdown by Agent${c.reset}`);
		dagLines.push(`  ${c.yellow}${"─".repeat(40)}${c.reset}`);
		const costByAgent: Map<string, { cost: number; count: number; durationMs: number }> = new Map();
		for (const t of swarm.threads) {
			const key = `${t.agent}/${t.model}`;
			const entry = costByAgent.get(key) || { cost: 0, count: 0, durationMs: 0 };
			entry.cost += t.estimatedCostUsd;
			entry.count++;
			entry.durationMs += t.durationMs;
			costByAgent.set(key, entry);
		}
		const sorted = [...costByAgent.entries()].sort((a, b) => b[1].cost - a[1].cost);
		for (const [agent, stats] of sorted) {
			const pct = swarm.totalCostUsd > 0 ? ((stats.cost / swarm.totalCostUsd) * 100).toFixed(0) : "0";
			dagLines.push(
				`    ${c.bold}${agent}${c.reset}  ${c.dim}${stats.count} thread${stats.count !== 1 ? "s" : ""}${c.reset}  $${stats.cost.toFixed(4)}  ${c.dim}(${pct}%)${c.reset}  ${c.dim}${(stats.durationMs / 1000).toFixed(1)}s${c.reset}`,
			);
		}
		dagLines.push(`  ${c.yellow}${"─".repeat(40)}${c.reset}`);
		dagLines.push(`    ${c.bold}Total${c.reset}  ${swarm.threads.length} threads  $${swarm.totalCostUsd.toFixed(4)}`);
	}

	// Calculate scrolling for DAG content
	const headerSize = buf.length;
	const footerSize = 2;
	const dagBudget = h - headerSize - footerSize;

	// Scroll so selected thread is visible
	const selLineOffset = threadLineOffsets[state.swarmThreadIdx] ?? 0;
	let scrollY = Math.max(0, selLineOffset - Math.floor(dagBudget / 2));
	if (dagLines.length <= dagBudget) scrollY = 0;

	// Reserve lines for scroll indicators when needed
	const hasScrollUp = scrollY > 0;
	const hasScrollDown = scrollY + dagBudget < dagLines.length;
	const contentBudget = dagBudget - (hasScrollUp ? 1 : 0) - (hasScrollDown ? 1 : 0);
	const showFrom = scrollY;
	const showTo = Math.min(dagLines.length, scrollY + contentBudget);

	if (hasScrollUp) {
		buf.push(`  ${c.dim}^ more above (${showFrom} lines)${c.reset}`);
	}
	for (let i = showFrom; i < showTo; i++) {
		buf.push(dagLines[i]);
	}
	if (hasScrollDown) {
		buf.push(`  ${c.dim}v more below (${dagLines.length - showTo} lines)${c.reset}`);
	}

	// Render
	W(c.cursorHome, c.clearScreen, c.hideCursor);
	for (const l of buf) W(`${l}\n`);

	// Footer
	W(`${hline("─", c.gray)}\n`);
	W(
		`  ${c.dim}up/down${c.reset} select  ${c.dim}enter${c.reset} detail  ${c.dim}c${c.reset} cost  ${c.dim}m${c.reset} merges  ${c.dim}esc${c.reset} back  ${c.dim}q${c.reset} quit\n`,
	);
}

// ── Swarm thread detail ─────────────────────────────────────────────────────

function renderSwarmThreadDetail(state: ViewState): void {
	const { traj } = state;
	const swarm = traj.swarm;
	if (!swarm || swarm.threads.length === 0) return;

	const flatThreads = getFlatThreadList(swarm);
	if (state.swarmThreadIdx >= flatThreads.length) state.swarmThreadIdx = flatThreads.length - 1;
	if (state.swarmThreadIdx < 0) state.swarmThreadIdx = 0;

	const t = flatThreads[state.swarmThreadIdx];
	if (!t) return;

	const w = getWidth() - 4;
	const h = getHeight();
	const maxDurationMs = Math.max(...swarm.threads.map((th) => th.durationMs), 1);
	const barWidth = 20;

	// Build all content lines
	const allLines: string[] = [];

	allLines.push(``);
	allLines.push(hline("━", c.cyan));
	allLines.push(
		centeredHeader(
			`${c.bold}${c.white}Thread ${t.threadId.slice(0, 8)}  —  ${statusLabel(t.status)}${c.reset}`,
			c.cyan,
		),
	);
	allLines.push(hline("━", c.cyan));
	allLines.push(``);

	// Status with color + timing bar
	const sColor = statusColor(t.status);
	const bar = timingBar(t.durationMs, maxDurationMs, barWidth);
	allLines.push(
		`  ${c.gray}Status   :${c.reset} ${sColor}${c.bold}${statusLabel(t.status)}${c.reset}  ${sColor}${bar}${c.reset}`,
	);
	allLines.push(`  ${c.gray}Thread ID:${c.reset} ${t.threadId}`);
	allLines.push(`  ${c.gray}Iteration:${c.reset} ${t.iteration}`);
	allLines.push(`  ${c.gray}Agent    :${c.reset} ${t.agent}`);
	allLines.push(`  ${c.gray}Model    :${c.reset} ${c.bold}${t.model}${c.reset}`);
	if (t.slot) {
		allLines.push(`  ${c.gray}Slot     :${c.reset} ${t.slot}`);
	}
	allLines.push(
		`  ${c.gray}Duration :${c.reset} ${(t.durationMs / 1000).toFixed(1)}s  ${c.dim}(${t.durationMs}ms)${c.reset}`,
	);
	allLines.push(`  ${c.gray}Cost     :${c.reset} $${t.estimatedCostUsd.toFixed(4)}`);
	allLines.push(``);

	// Full task description (boxed)
	allLines.push(`  ${c.cyan}${c.bold}Task${c.reset}`);
	allLines.push(`  ${c.cyan}┌${"─".repeat(w)}┐${c.reset}`);
	for (const line of t.task.split("\n")) {
		const stripped = line.replace(/\x1b\[[0-9;]*m/g, "");
		const padding = Math.max(0, w - stripped.length - 1);
		allLines.push(`  ${c.cyan}│${c.reset} ${line}${" ".repeat(padding)}${c.cyan}│${c.reset}`);
	}
	allLines.push(`  ${c.cyan}└${"─".repeat(w)}┘${c.reset}`);
	allLines.push(``);

	// Dependencies
	if (t.dependsOn && t.dependsOn.length > 0) {
		allLines.push(
			`  ${c.magenta}${c.bold}Dependencies${c.reset}  ${c.dim}(${t.dependsOn.length} thread${t.dependsOn.length !== 1 ? "s" : ""} provided context)${c.reset}`,
		);
		for (const depId of t.dependsOn) {
			const depThread = swarm.threads.find((th) => th.threadId === depId);
			if (depThread) {
				const depColor = statusColor(depThread.status);
				const depTaskPreview = depThread.task.length > 50 ? `${depThread.task.slice(0, 47)}...` : depThread.task;
				allLines.push(
					`    ${depColor}${depId.slice(0, 8)}${c.reset}  ${depColor}${statusLabel(depThread.status)}${c.reset}  ${c.dim}${depTaskPreview}${c.reset}`,
				);
			} else {
				allLines.push(`    ${c.dim}${depId.slice(0, 8)}  (not found in thread list)${c.reset}`);
			}
		}
		allLines.push(``);
	}

	// Downstream (threads that depend on this one)
	const downstream = swarm.threads.filter((th) => th.dependsOn?.includes(t.threadId));
	if (downstream.length > 0) {
		allLines.push(
			`  ${c.blue}${c.bold}Downstream${c.reset}  ${c.dim}(${downstream.length} thread${downstream.length !== 1 ? "s" : ""} depend on this)${c.reset}`,
		);
		for (const ds of downstream) {
			const dsColor = statusColor(ds.status);
			const dsTaskPreview = ds.task.length > 50 ? `${ds.task.slice(0, 47)}...` : ds.task;
			allLines.push(
				`    ${dsColor}${ds.threadId.slice(0, 8)}${c.reset}  ${dsColor}${statusLabel(ds.status)}${c.reset}  ${c.dim}iter ${ds.iteration}${c.reset}  ${c.dim}${dsTaskPreview}${c.reset}`,
			);
		}
		allLines.push(``);
	}

	// Files changed
	if (t.filesChanged.length > 0) {
		allLines.push(`  ${c.green}${c.bold}Files Changed${c.reset}  ${c.dim}(${t.filesChanged.length})${c.reset}`);
		for (const f of t.filesChanged) {
			allLines.push(`    ${c.green}+${c.reset} ${f}`);
		}
		allLines.push(``);
	} else {
		allLines.push(`  ${c.dim}No files changed.${c.reset}`);
		allLines.push(``);
	}

	// Position info
	const posInFlat = state.swarmThreadIdx + 1;
	allLines.push(`  ${c.dim}Thread ${posInFlat} of ${flatThreads.length}${c.reset}`);

	// Scrollable rendering
	const footerSize = 2;
	const viewable = h - footerSize;

	const maxScroll = Math.max(0, allLines.length - viewable);
	if (state.scrollY > maxScroll) state.scrollY = maxScroll;
	if (state.scrollY < 0) state.scrollY = 0;

	const from = state.scrollY;
	const hasScrollUp = from > 0;
	const hasScrollDown = from + viewable < allLines.length;
	const contentLines = viewable - (hasScrollUp ? 1 : 0) - (hasScrollDown ? 1 : 0);
	const to = Math.min(allLines.length, from + contentLines);

	W(c.cursorHome, c.clearScreen, c.hideCursor);

	if (hasScrollUp) {
		W(`  ${c.dim}^ scroll up (${from} lines above)${c.reset}\n`);
	}
	for (let i = from; i < to; i++) W(`${allLines[i]}\n`);

	if (hasScrollDown) {
		W(`  ${c.dim}v scroll down (${allLines.length - to} lines below)${c.reset}\n`);
	}

	// Footer
	W(`${hline("─", c.gray)}\n`);
	W(
		`  ${c.dim}up/down${c.reset} scroll  ${c.dim}n/N${c.reset} next/prev  ${c.dim}esc${c.reset} back  ${c.dim}q${c.reset} quit\n`,
	);
}

// ── Minimal syntax highlighting ─────────────────────────────────────────────

function syntaxHighlight(code: string): string {
	return code
		.replace(
			/\b(import|from|def|class|return|if|elif|else|for|while|in|not|and|or|try|except|finally|with|as|raise|pass|break|continue|yield|lambda|True|False|None|await|async)\b/g,
			`${c.magenta}$1${c.reset}`,
		)
		.replace(
			/\b(print|len|range|enumerate|sorted|set|list|dict|str|int|float|type|isinstance|zip|map|filter)\b/g,
			`${c.cyan}$1${c.reset}`,
		)
		.replace(/(#.*)$/gm, `${c.gray}$1${c.reset}`)
		.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"]*"|'[^']*')/g, `${c.yellow}$1${c.reset}`)
		.replace(/\b(llm_query|async_llm_query|context|FINAL|FINAL_VAR)\b/g, `${c.green}${c.bold}$1${c.reset}`);
}

// ── Main interactive loop ───────────────────────────────────────────────────

async function main(): Promise<void> {
	// Enter alternate screen buffer so output never scrolls the main terminal
	W(c.altScreenOn);

	// Ensure we always restore terminal on exit (alt screen, cursor, raw mode)
	const cleanup = () => {
		try {
			process.stdin.setRawMode(false);
		} catch {}
		W(c.showCursor, c.altScreenOff);
	};
	process.on("exit", cleanup);
	process.on("SIGINT", () => {
		cleanup();
		process.exit(0);
	});
	process.on("SIGTERM", () => {
		cleanup();
		process.exit(0);
	});

	let filePath: string | undefined = process.argv[2];

	if (!filePath) {
		const files = listTrajectories();
		if (files.length === 0) {
			console.error(
				`${c.red}No trajectory files found in ~/.rlm/trajectories/${c.reset}\nRun a query first to generate trajectories.`,
			);
			process.exit(1);
		}
		filePath = await pickFile(files);
	}

	// Load trajectory
	if (!fs.existsSync(filePath)) {
		console.error(`${c.red}File not found: ${filePath}${c.reset}`);
		process.exit(1);
	}
	let traj: TrajectoryData;
	try {
		traj = JSON.parse(fs.readFileSync(filePath, "utf-8"));
	} catch (err: any) {
		console.error(`${c.red}Could not parse trajectory file: ${err.message}${c.reset}`);
		process.exit(1);
	}

	if (!traj.iterations || traj.iterations.length === 0) {
		console.error(`${c.red}Trajectory has no iterations (empty run).${c.reset}`);
		process.exit(1);
	}

	// State
	const state: ViewState = {
		mode: "overview",
		iterIdx: 0,
		subQueryIdx: 0,
		scrollY: 0,
		traj,
		swarmThreadIdx: 0,
		showCostBreakdown: false,
	};

	function render(): void {
		switch (state.mode) {
			case "overview":
				renderOverview(state);
				break;
			case "iteration":
				renderIteration(state);
				break;
			case "result":
				renderResult(state);
				break;
			case "subqueries":
				renderSubQueries(state);
				break;
			case "subqueryDetail":
				renderSubQueryDetail(state);
				break;
			case "llmInput":
				renderLlmInput(state);
				break;
			case "llmResponse":
				renderLlmResponse(state);
				break;
			case "systemPrompt":
				renderSystemPrompt(state);
				break;
			case "swarm":
				renderSwarmView(state);
				break;
			case "swarmThreadDetail":
				renderSwarmThreadDetail(state);
				break;
		}
	}

	render();

	// Key handling
	process.stdin.setRawMode(true);
	process.stdin.resume();
	process.stdin.setEncoding("utf8");

	process.stdin.on("data", (key: string) => {
		const maxIter = traj.iterations.length - 1;

		switch (state.mode) {
			case "overview":
				if (key === "\x1b[A") {
					state.iterIdx = Math.max(0, state.iterIdx - 1);
				} else if (key === "\x1b[B") {
					state.iterIdx = Math.min(maxIter, state.iterIdx + 1);
				} else if (key === "\r" || key === "\n" || key === "\x1b[C") {
					// Drill into iteration detail
					state.mode = "iteration";
					state.scrollY = 0;
				} else if (key === "r") {
					state.mode = "result";
				} else if (key === "t" && traj.swarm) {
					state.mode = "swarm";
				} else if (key === "q" || key === "\x03") {
					W(c.showCursor, "\n");
					process.exit(0);
				}
				break;

			case "iteration":
				if (key === "\x1b[A") {
					state.scrollY = Math.max(0, state.scrollY - 3);
				} else if (key === "\x1b[B") {
					state.scrollY += 3;
				} else if (key === "n") {
					if (state.iterIdx < maxIter) {
						state.iterIdx++;
						state.scrollY = 0;
					}
				} else if (key === "N") {
					if (state.iterIdx > 0) {
						state.iterIdx--;
						state.scrollY = 0;
					}
				} else if (key === "\x1b[D" || key === "\x1b" || key === "b") {
					state.mode = "overview";
					state.scrollY = 0;
				} else if (key === "s" && traj.iterations[state.iterIdx]?.subQueries.length > 0) {
					state.mode = "subqueries";
					state.subQueryIdx = 0;
				} else if (key === "i") {
					state.mode = "llmInput";
				} else if (key === "l") {
					state.mode = "llmResponse";
				} else if (key === "p") {
					state.mode = "systemPrompt";
				} else if (key === "r") {
					state.mode = "result";
				} else if (key === "q" || key === "\x03") {
					W(c.showCursor, "\n");
					process.exit(0);
				}
				break;

			case "result":
				if (key === "\x1b[D" || key === "\x1b" || key === "b") {
					state.mode = "overview";
				} else if (key === "q" || key === "\x03") {
					W(c.showCursor, "\n");
					process.exit(0);
				}
				break;

			case "subqueries": {
				const sqCount = traj.iterations[state.iterIdx]?.subQueries.length ?? 0;
				if (key === "\x1b[A") {
					state.subQueryIdx = Math.max(0, state.subQueryIdx - 1);
				} else if (key === "\x1b[B") {
					state.subQueryIdx = Math.min(sqCount - 1, state.subQueryIdx + 1);
				} else if (key === "\r" || key === "\n" || key === "\x1b[C") {
					state.mode = "subqueryDetail";
					state.scrollY = 0;
				} else if (key === "\x1b[D" || key === "\x1b" || key === "b") {
					state.mode = "iteration";
				} else if (key === "q" || key === "\x03") {
					W(c.showCursor, "\n");
					process.exit(0);
				}
				break;
			}

			case "subqueryDetail": {
				const sqMax = (traj.iterations[state.iterIdx]?.subQueries.length ?? 1) - 1;
				if (key === "\x1b[A") {
					state.scrollY = Math.max(0, state.scrollY - 3);
				} else if (key === "\x1b[B") {
					state.scrollY += 3;
				} else if (key === "n" || key === "\x1b[C") {
					if (state.subQueryIdx < sqMax) {
						state.subQueryIdx++;
						state.scrollY = 0;
					}
				} else if (key === "p" || key === "N") {
					if (state.subQueryIdx > 0) {
						state.subQueryIdx--;
						state.scrollY = 0;
					}
				} else if (key === "\x1b[D" || key === "\x1b" || key === "b") {
					state.mode = "subqueries";
					state.scrollY = 0;
				} else if (key === "q" || key === "\x03") {
					W(c.showCursor, "\n");
					process.exit(0);
				}
				break;
			}

			case "llmInput":
			case "llmResponse":
			case "systemPrompt":
				if (key === "\x1b[D" || key === "\x1b" || key === "b") {
					state.mode = "iteration";
				} else if (key === "q" || key === "\x03") {
					W(c.showCursor, "\n");
					process.exit(0);
				}
				break;

			case "swarm": {
				const swarmThreadCount = traj.swarm ? getFlatThreadList(traj.swarm).length : 0;
				if (key === "\x1b[A") {
					state.swarmThreadIdx = Math.max(0, state.swarmThreadIdx - 1);
				} else if (key === "\x1b[B") {
					state.swarmThreadIdx = Math.min(swarmThreadCount - 1, state.swarmThreadIdx + 1);
				} else if (key === "\r" || key === "\n" || key === "\x1b[C") {
					if (swarmThreadCount > 0) {
						state.mode = "swarmThreadDetail";
						state.scrollY = 0;
					}
				} else if (key === "c") {
					state.showCostBreakdown = !state.showCostBreakdown;
				} else if (key === "m") {
					// Scroll to merge events section (jump selection to last thread)
					state.swarmThreadIdx = Math.max(0, swarmThreadCount - 1);
				} else if (key === "\x1b[D" || key === "\x1b" || key === "b") {
					state.mode = "overview";
				} else if (key === "q" || key === "\x03") {
					W(c.showCursor, "\n");
					process.exit(0);
				}
				break;
			}

			case "swarmThreadDetail": {
				const stMax = traj.swarm ? getFlatThreadList(traj.swarm).length - 1 : 0;
				if (key === "\x1b[A") {
					state.scrollY = Math.max(0, state.scrollY - 3);
				} else if (key === "\x1b[B") {
					state.scrollY += 3;
				} else if (key === "n" || key === "\x1b[C") {
					if (state.swarmThreadIdx < stMax) {
						state.swarmThreadIdx++;
						state.scrollY = 0;
					}
				} else if (key === "N") {
					if (state.swarmThreadIdx > 0) {
						state.swarmThreadIdx--;
						state.scrollY = 0;
					}
				} else if (key === "\x1b[D" || key === "\x1b" || key === "b") {
					state.mode = "swarm";
					state.scrollY = 0;
				} else if (key === "q" || key === "\x03") {
					W(c.showCursor, "\n");
					process.exit(0);
				}
				break;
			}
		}

		render();
	});

	// (cleanup handler already registered at top of main)
}

main().catch((err) => {
	W(c.showCursor, c.altScreenOff);
	console.error(`Fatal: ${err}`);
	process.exit(1);
});
