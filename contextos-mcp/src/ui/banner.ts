/**
 * Startup banner — the first thing users see when running swarm.
 */

import { getLogLevel, isJsonMode, logKeyValue } from "./log.js";
import { bold, coral, cyan, dim, isTTY, symbols, termWidth } from "./theme.js";

const VERSION = "0.1.0";

/** Render the swarm startup banner. */
export function renderBanner(config: {
	dir: string;
	model: string;
	provider: string;
	agent: string;
	routing: string;
	query: string;
	dryRun: boolean;
	memorySize?: number;
}): void {
	if (isJsonMode() || getLogLevel() === "quiet") return;

	const w = Math.max(Math.min(termWidth(), 60), 24);

	if (isTTY) {
		const title = " swarm ";
		const version = ` v${VERSION} `;
		const padLen = Math.max(0, w - title.length - version.length - 4);
		const leftPad = symbols.horizontal.repeat(Math.floor(padLen / 2));
		const rightPad = symbols.horizontal.repeat(Math.ceil(padLen / 2));

		process.stderr.write("\n");
		process.stderr.write(
			`  ${cyan(`${symbols.topLeft}${leftPad}`)}${bold(coral(title))}${dim(version)}${cyan(`${rightPad}${symbols.topRight}`)}\n`,
		);
		process.stderr.write(`  ${cyan(symbols.vertLine)}${" ".repeat(Math.max(0, w - 2))}${cyan(symbols.vertLine)}\n`);
	} else {
		process.stderr.write(`\nswarm v${VERSION}\n`);
	}

	logKeyValue("Directory", config.dir);
	logKeyValue("Model", `${config.model} ${dim(`(${config.provider})`)}`);
	logKeyValue("Agent", config.agent);
	logKeyValue("Routing", config.routing);
	if (config.memorySize !== undefined && config.memorySize > 0) {
		logKeyValue("Memory", `${config.memorySize} episodes`);
	}
	if (config.dryRun) {
		logKeyValue("Mode", bold("DRY RUN"));
	}

	if (isTTY) {
		process.stderr.write(`  ${cyan(symbols.vertLine)}${" ".repeat(Math.max(0, w - 2))}${cyan(symbols.vertLine)}\n`);
		process.stderr.write(
			`  ${cyan(symbols.bottomLeft)}${cyan(symbols.horizontal.repeat(Math.max(0, w - 2)))}${cyan(symbols.bottomRight)}\n`,
		);
	}

	// Query on its own line, slightly emphasized
	process.stderr.write(`\n  ${dim(symbols.arrow)} ${config.query}\n\n`);
}
