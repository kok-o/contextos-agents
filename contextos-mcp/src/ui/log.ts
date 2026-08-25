/**
 * Structured logging — consistent formatting for all terminal output.
 *
 * All swarm-code output flows through these functions to ensure consistent
 * formatting, TTY-awareness, and proper stdout/stderr separation.
 *
 * Convention: progress/status → stderr, final answer → stdout.
 */

import { bold, cyan, dim, gray, green, hr, magenta, red, symbols, yellow } from "./theme.js";

export type LogLevel = "quiet" | "normal" | "verbose";

let _level: LogLevel = "normal";
let _jsonMode = false;

export function setLogLevel(level: LogLevel): void {
	_level = level;
}

export function setJsonMode(enabled: boolean): void {
	_jsonMode = enabled;
}

export function getLogLevel(): LogLevel {
	return _level;
}

export function isJsonMode(): boolean {
	return _jsonMode;
}

// ── Core log functions ──────────────────────────────────────────────────────

/** Standard info line. */
export function logInfo(message: string): void {
	if (_level === "quiet" || _jsonMode) return;
	process.stderr.write(`  ${cyan(symbols.info)} ${message}\n`);
}

/** Success line with checkmark. */
export function logSuccess(message: string): void {
	if (_level === "quiet" || _jsonMode) return;
	process.stderr.write(`  ${green(symbols.check)} ${message}\n`);
}

/** Warning line — always shown (never suppressed by quiet or JSON mode). */
export function logWarn(message: string): void {
	if (_jsonMode) {
		process.stderr.write(`warning: ${message}\n`);
		return;
	}
	process.stderr.write(`  ${yellow(symbols.warn)} ${message}\n`);
}

/** Error line — always shown (never suppressed by quiet or JSON mode). */
export function logError(message: string, hint?: string): void {
	if (_jsonMode) {
		process.stderr.write(`error: ${message}${hint ? ` (${hint})` : ""}\n`);
		return;
	}
	process.stderr.write(`  ${red(symbols.cross)} ${message}\n`);
	if (hint) {
		process.stderr.write(`    ${dim(hint)}\n`);
	}
}

/** Verbose-only line — only shown with --verbose. */
export function logVerbose(message: string): void {
	if (_level !== "verbose" || _jsonMode) return;
	process.stderr.write(`  ${gray(message)}\n`);
}

/** Debug/dim secondary information. */
export function logDim(message: string): void {
	if (_level === "quiet" || _jsonMode) return;
	process.stderr.write(`  ${dim(message)}\n`);
}

/** Section header. */
export function logHeader(message: string): void {
	if (_level === "quiet" || _jsonMode) return;
	process.stderr.write(`\n  ${bold(cyan(message))}\n`);
}

/** Horizontal rule separator. */
export function logSeparator(): void {
	if (_level === "quiet" || _jsonMode) return;
	process.stderr.write(`  ${hr()}\n`);
}

/** Key-value pair (for config display). */
export function logKeyValue(key: string, value: string, keyWidth = 12): void {
	if (_level === "quiet" || _jsonMode) return;
	const paddedKey = key.padEnd(keyWidth);
	process.stderr.write(`  ${dim(paddedKey)} ${value}\n`);
}

/** Thread progress line with color-coded phase. */
export function logThread(threadId: string, phase: string, detail?: string): void {
	if (_level === "quiet" || _jsonMode) return;
	const tag = dim(`[${threadId.slice(0, 8)}]`);
	const phaseColor = PHASE_COLORS[phase] || ((s: string) => s);
	const suffix = detail ? dim(` ${detail}`) : "";
	process.stderr.write(`  ${tag} ${phaseColor(phase)}${suffix}\n`);
}

/** Router/memory verbose info. */
export function logRouter(message: string): void {
	if (_level !== "verbose" || _jsonMode) return;
	process.stderr.write(`  ${magenta(symbols.arrow)} ${dim(message)}\n`);
}

/** Write the final answer to stdout. */
export function logAnswer(answer: string): void {
	if (_jsonMode) return;
	process.stdout.write(answer);
	if (!answer.endsWith("\n")) process.stdout.write("\n");
}

/** Write structured JSON output. */
export function logJson(data: Record<string, unknown>): void {
	process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

// ── Phase color mapping ────────────────────────────────────────────────────

const PHASE_COLORS: Record<string, (s: string) => string> = {
	queued: dim,
	creating_worktree: cyan,
	agent_running: bold,
	capturing_diff: cyan,
	compressing: dim,
	completed: green,
	failed: red,
	cancelled: yellow,
	retrying: yellow,
};
