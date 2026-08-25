/**
 * Centralized color/formatting system with TTY detection.
 *
 * All terminal styling flows through this module. When output is piped
 * (not a TTY), colors are automatically stripped.
 */

const isTTY = process.stderr.isTTY ?? false;
const stdoutTTY = process.stdout.isTTY ?? false;

// ── ANSI helpers ────────────────────────────────────────────────────────────

function ansi(code: string): (text: string) => string {
	if (!isTTY) return (text) => text;
	return (text) => `\x1b[${code}m${text}\x1b[0m`;
}

function ansiFg(r: number, g: number, b: number): (text: string) => string {
	if (!isTTY) return (text) => text;
	return (text) => `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

// ── Theme colors ────────────────────────────────────────────────────────────

/** Brand coral — spinner, accents (inspired by Claude Code's coral orange). */
export const coral = ansiFg(215, 119, 87);

/** Primary accent — headers, borders. */
export const cyan = ansi("36");

/** Success — completed operations. */
export const green = ansi("32");

/** Warning — non-fatal issues. */
export const yellow = ansi("33");

/** Error — failures. */
export const red = ansi("31");

/** Secondary info — timestamps, ids, hints. */
export const dim = ansi("2");

/** Emphasis. */
export const bold = ansi("1");

/** Subtle emphasis. */
export const italic = ansi("3");

/** De-emphasized text. */
export const gray = ansiFg(128, 128, 128);

/** Magenta — sub-queries, memory. */
export const magenta = ansi("35");

/** White — primary content. */
export const white = ansi("37");

// ── Compound styles ─────────────────────────────────────────────────────────

export const heading = (text: string) => bold(cyan(text));
export const success = (text: string) => green(`${symbols.check} ${text}`);
export const warn = (text: string) => yellow(`${symbols.warn} ${text}`);
export const error = (text: string) => red(`${symbols.cross} ${text}`);
export const info = (text: string) => cyan(`${symbols.info} ${text}`);
export const hint = (text: string) => dim(`  ${text}`);

// ── Symbols ─────────────────────────────────────────────────────────────────

export const symbols = {
	check: isTTY ? "\u2714" : "[OK]",
	cross: isTTY ? "\u2718" : "[ERR]",
	warn: isTTY ? "\u26A0" : "[WARN]",
	info: isTTY ? "\u25CF" : "[*]",
	arrow: isTTY ? "\u25B6" : ">",
	dot: isTTY ? "\u00B7" : ".",
	dash: isTTY ? "\u2500" : "-",
	vertLine: isTTY ? "\u2502" : "|",
	topLeft: isTTY ? "\u256D" : "+",
	topRight: isTTY ? "\u256E" : "+",
	bottomLeft: isTTY ? "\u2570" : "+",
	bottomRight: isTTY ? "\u256F" : "+",
	horizontal: isTTY ? "\u2500" : "-",
	spinner: isTTY ? ["\u00B7", "\u2726", "\u2733", "\u2736", "\u273B", "\u273D"] : ["*"],
} as const;

// ── Layout helpers ──────────────────────────────────────────────────────────

/** Get terminal width, with a sensible fallback. */
export function termWidth(): number {
	return process.stderr.columns || 80;
}

/** Draw a horizontal rule. */
export function hr(char?: string): string {
	const c = char || symbols.horizontal;
	return dim(c.repeat(Math.min(termWidth(), 60)));
}

/** Right-pad a string to a given width. */
export function pad(text: string, width: number): string {
	const stripped = stripAnsi(text);
	if (stripped.length >= width) return text;
	return text + " ".repeat(width - stripped.length);
}

/** Strip ANSI escape codes from a string. */
export function stripAnsi(text: string): string {
	// eslint-disable-next-line no-control-regex
	return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Truncate a string to maxLen, adding ellipsis if needed. */
export function truncate(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text;
	return `${text.slice(0, maxLen - 1)}\u2026`;
}

// ── Exports ─────────────────────────────────────────────────────────────────

export { isTTY, stdoutTTY };
