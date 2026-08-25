/**
 * Bordered text input for the interactive REPL.
 *
 * Visual style inspired by OpenCode — full-width bordered text area with
 * a darker background row, accent-colored bottom border, and multi-line
 * paste support.
 *
 * Keys:
 *   - Enter: submit
 *   - Escape / Ctrl+C: exit
 *   - Ctrl+D: submit
 *   - Backspace, left/right, home/end: editing
 *   - Paste (multi-char with newlines): captured as multi-line
 */

import { coral, dim, isTTY, termWidth } from "./theme.js";

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const BG_DARK = "\x1b[48;2;30;33;39m"; // dark background for input row
const RESET = "\x1b[0m";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const BORDER_COLOR = "\x1b[38;2;60;63;68m"; // subtle gray for top border
const ACCENT_COLOR = "\x1b[38;2;215;119;87m"; // coral for bottom border

export interface TextInputResult {
	text: string;
	action: "submit" | "escape";
}

export function readTextInput(_prompt: string): Promise<TextInputResult> {
	if (!isTTY) {
		return new Promise((resolve) => {
			let data = "";
			process.stdin.setEncoding("utf-8");
			const onData = (chunk: string) => {
				data += chunk;
				if (data.includes("\n")) {
					process.stdin.removeListener("data", onData);
					resolve({ text: data.trim(), action: "submit" });
				}
			};
			process.stdin.on("data", onData);
			process.stdin.resume();
		});
	}

	return new Promise((resolve) => {
		const linesBuf: string[] = [""];
		let cursorPos = 0;
		const origRawMode = process.stdin.isRaw;
		const w = termWidth();

		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding("utf-8");

		// Tracks cursor position relative to top border after each drawBox()
		let cursorRowFromTop = 0;
		let prevTotalRows = 0;

		function buildRows(): string[] {
			const promptVisibleLen = 2;
			const rows: string[] = [];

			// Top border
			rows.push(`${BORDER_COLOR}${"─".repeat(w)}${RESET}`);

			// Content rows
			const promptChar = `${ACCENT_COLOR}❯${RESET} `;
			for (let i = 0; i < linesBuf.length; i++) {
				const lineText = linesBuf[i];
				const prefix = i === 0 ? promptChar : `${dim("·")} `;
				const contentWidth = w - promptVisibleLen;
				const displayText = lineText.length > contentWidth ? lineText.slice(0, contentWidth - 1) + "…" : lineText;
				const padding = Math.max(0, contentWidth - displayText.length);
				rows.push(`${BG_DARK}${prefix}${displayText}${" ".repeat(padding)}${RESET}`);
			}

			// Bottom border
			rows.push(`${ACCENT_COLOR}${"─".repeat(w)}${RESET}`);

			// Hints — pad to full width so it fully overwrites old content
			const hintsText = "  enter submit  esc exit";
			const hintsPad = Math.max(0, w - hintsText.length);
			rows.push(`${dim(hintsText)}${" ".repeat(hintsPad)}`);

			return rows;
		}

		function drawBox() {
			const out = process.stderr;
			const promptVisibleLen = 2;
			const rows = buildRows();
			const totalRows = rows.length;

			if (prevTotalRows > 0) {
				// ── Redraw: overwrite rows in place (no \n, no scrolling) ──
				// Move cursor to top border row
				if (cursorRowFromTop > 0) {
					out.write(`\x1b[${cursorRowFromTop}A`);
				}
				out.write("\r");

				// Overwrite each row in place
				const commonRows = Math.min(totalRows, prevTotalRows);
				for (let i = 0; i < commonRows; i++) {
					out.write(`\x1b[2K${rows[i]}`);
					if (i < commonRows - 1) {
						out.write("\x1b[1B\r"); // cursor down 1 (no scroll), start of line
					}
				}

				if (totalRows > prevTotalRows) {
					// More rows than before (multi-line paste) — append with \n
					for (let i = commonRows; i < totalRows; i++) {
						out.write(`\n\x1b[2K${rows[i]}`);
					}
				} else if (prevTotalRows > totalRows) {
					// Fewer rows than before — erase leftover old rows
					for (let i = totalRows; i < prevTotalRows; i++) {
						out.write("\x1b[1B\r\x1b[2K");
					}
					// Move back to last new row
					const extra = prevTotalRows - totalRows;
					if (extra > 0) out.write(`\x1b[${extra}A`);
				}

				// Cursor is now on the last row (hints).
			} else {
				// ── Initial draw: use \n between rows, no trailing \n ──
				for (let i = 0; i < totalRows; i++) {
					if (i > 0) out.write("\n");
					out.write(rows[i]);
				}
				// Cursor is on the hints line (last row).
			}

			prevTotalRows = totalRows;

			// Position cursor at the active content row
			// Cursor is currently on the hints line (last row = index totalRows-1).
			// Content cursor is on row (1 + currentLineIdx).
			const currentLineIdx = linesBuf.length - 1;
			const targetRow = 1 + currentLineIdx;
			const hintsRow = totalRows - 1;
			const rowsUp = hintsRow - targetRow;
			if (rowsUp > 0) out.write(`\x1b[${rowsUp}A`);

			// Set column
			const col = promptVisibleLen + cursorPos + 1;
			out.write(`\x1b[${col}G`);

			cursorRowFromTop = targetRow;
		}

		// Initial draw
		process.stderr.write(HIDE_CURSOR);
		drawBox();
		process.stderr.write(SHOW_CURSOR);

		const onData = (data: string) => {
			const hasNewlines = data.includes("\n") || data.includes("\r");
			const isMultiChar = data.length > 1;
			const isPaste = hasNewlines && isMultiChar;

			if (isPaste) {
				const pastedLines = data.split(/\r\n|\r|\n/);
				const currentLine = linesBuf[linesBuf.length - 1];
				linesBuf[linesBuf.length - 1] = currentLine.slice(0, cursorPos) + pastedLines[0] + currentLine.slice(cursorPos);
				cursorPos = (currentLine.slice(0, cursorPos) + pastedLines[0]).length;

				for (let i = 1; i < pastedLines.length; i++) {
					const line = pastedLines[i];
					if (i === pastedLines.length - 1 && line === "") break;
					linesBuf.push(line);
					cursorPos = line.length;
				}

				drawBox();
				return;
			}

			for (let i = 0; i < data.length; i++) {
				const ch = data[i];

				// Escape sequences
				if (ch === "\x1b") {
					if (data[i + 1] === "[") {
						const code = data[i + 2];
						if (code === "C" && cursorPos < linesBuf[linesBuf.length - 1].length) {
							cursorPos++;
							i += 2;
							drawBox();
							continue;
						}
						if (code === "D" && cursorPos > 0) {
							cursorPos--;
							i += 2;
							drawBox();
							continue;
						}
						if (code === "H") {
							cursorPos = 0;
							i += 2;
							drawBox();
							continue;
						}
						if (code === "F") {
							cursorPos = linesBuf[linesBuf.length - 1].length;
							i += 2;
							drawBox();
							continue;
						}
						i += 2;
						continue;
					}
					// Bare Escape — exit
					finishAndClear();
					resolve({ text: "", action: "escape" });
					return;
				}

				// Ctrl+D — submit
				if (ch === "\x04") {
					const text = linesBuf.join("\n").trim();
					finishAndClear();
					resolve({ text, action: "submit" });
					return;
				}

				// Ctrl+C — exit
				if (ch === "\x03") {
					finishAndClear();
					resolve({ text: "", action: "escape" });
					return;
				}

				// Enter — submit
				if (ch === "\r" || ch === "\n") {
					const text = linesBuf.join("\n").trim();
					finishAndClear();
					resolve({ text, action: "submit" });
					return;
				}

				// Backspace
				if (ch === "\x7f" || ch === "\b") {
					if (cursorPos > 0) {
						const line = linesBuf[linesBuf.length - 1];
						linesBuf[linesBuf.length - 1] = line.slice(0, cursorPos - 1) + line.slice(cursorPos);
						cursorPos--;
						drawBox();
					}
					continue;
				}

				// Tab — insert spaces
				if (ch === "\t") {
					const line = linesBuf[linesBuf.length - 1];
					linesBuf[linesBuf.length - 1] = line.slice(0, cursorPos) + "  " + line.slice(cursorPos);
					cursorPos += 2;
					drawBox();
					continue;
				}

				// Regular printable character
				if (ch >= " ") {
					const line = linesBuf[linesBuf.length - 1];
					linesBuf[linesBuf.length - 1] = line.slice(0, cursorPos) + ch + line.slice(cursorPos);
					cursorPos++;
					drawBox();
				}
			}
		};

		function finishAndClear() {
			process.stdin.removeListener("data", onData);
			if (origRawMode !== undefined) {
				process.stdin.setRawMode(origRawMode);
			}

			// Move cursor to top of box
			if (cursorRowFromTop > 0) {
				process.stderr.write(`\x1b[${cursorRowFromTop}A`);
			}
			process.stderr.write("\r\x1b[J"); // erase from here to end of screen

			// Write the submitted text as a clean line (so it's visible in scrollback)
			const fullText = linesBuf.join("\n").trim();
			if (fullText) {
				const displayLines = fullText.split("\n");
				for (let i = 0; i < displayLines.length; i++) {
					const prefix = i === 0 ? `  ${coral("swarm")}${dim(">")} ` : `  ${dim(".")}       `;
					process.stderr.write(`${prefix}${displayLines[i]}\n`);
				}
			}
		}

		process.stdin.on("data", onData);
	});
}
