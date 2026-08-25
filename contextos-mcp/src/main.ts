#!/usr/bin/env tsx
/**
 * swarm — Swarm-native coding agent orchestrator
 *
 * Entry point for the `swarm` command.
 *
 *   swarm --dir ./project "task" → swarm mode (coding agent orchestration)
 *   swarm --dir ./project        → interactive REPL (no query)
 *   swarm mcp [--dir ./project]  → MCP server (stdio transport)
 *   swarm run                    → single-shot RLM CLI run
 *   swarm viewer                 → browse trajectory files
 *   swarm benchmark              → run benchmarks
 *   swarm                        → interactive REPL (uses current directory)
 */

import { bold, coral, cyan, dim, isTTY, symbols, termWidth, yellow } from "./ui/theme.js";

export function buildHelp(): string {
	const w = Math.max(Math.min(termWidth(), 60), 24);
	const lines: string[] = [];

	if (isTTY) {
		const title = " swarm ";
		const sub = " cli ";
		const padLen = Math.max(0, w - title.length - sub.length - 4);
		const l = symbols.horizontal.repeat(Math.floor(padLen / 2));
		const r = symbols.horizontal.repeat(Math.ceil(padLen / 2));
		lines.push("");
		lines.push(`  ${cyan(`${symbols.topLeft}${l}`)}${bold(coral(title))}${dim(sub)}${cyan(`${r}${symbols.topRight}`)}`);
		lines.push(`  ${cyan(symbols.vertLine)}${" ".repeat(w - 2)}${cyan(symbols.vertLine)}`);
		lines.push(
			`  ${cyan(symbols.vertLine)}  ${dim("Open-source orchestrator for parallel coding agents")}${" ".repeat(Math.max(0, w - 55))}${cyan(symbols.vertLine)}`,
		);
		lines.push(
			`  ${cyan(symbols.vertLine)}  ${dim("Built on RLM (arXiv:2512.24601)")}${" ".repeat(Math.max(0, w - 36))}${cyan(symbols.vertLine)}`,
		);
		lines.push(`  ${cyan(symbols.vertLine)}${" ".repeat(w - 2)}${cyan(symbols.vertLine)}`);
		lines.push(`  ${cyan(symbols.bottomLeft)}${cyan(symbols.horizontal.repeat(w - 2))}${cyan(symbols.bottomRight)}`);
	} else {
		lines.push("\nswarm — Open-source orchestrator for parallel coding agents");
	}

	lines.push("");
	lines.push(`  ${bold("SWARM MODE")} ${dim("(coding agent orchestration)")}`);
	lines.push(`    ${yellow("swarm")} --dir ./project ${dim('"add error handling to all API routes"')}`);
	lines.push(`    ${yellow("swarm")} --dir ./project --orchestrator claude-sonnet-4-6 ${dim('"task"')}`);
	lines.push(`    ${yellow("swarm")} --dir ./project --dry-run ${dim('"plan refactor"')}`);
	lines.push(`    ${yellow("swarm")} --dir ./project --max-budget 5.00 ${dim('"task"')}`);
	lines.push(`    ${yellow("swarm")} --dir ./project              ${dim("Interactive REPL (no query)")}`);

	lines.push("");
	lines.push(`  ${bold("MCP SERVER")} ${dim("(expose swarm as tools for Claude Code, Cursor, etc.)")}`);
	lines.push(`    ${yellow("swarm mcp")}                       ${dim("Start MCP server (stdio)")}`);
	lines.push(`    ${yellow("swarm mcp")} --dir ./project       ${dim("Start with default directory")}`);

	lines.push("");
	lines.push(`  ${bold("INTERACTIVE")} ${dim("(default — uses current directory)")}`);
	lines.push(`    ${yellow("swarm")}                          ${dim("Interactive REPL in current dir")}`);

	lines.push("");
	lines.push(`  ${bold("RLM MODE")} ${dim("(text processing, inherited from rlm-cli)")}`);
	lines.push(`    ${yellow("swarm run")} [options] "<query>"  ${dim("Run a single query")}`);
	lines.push(`    ${yellow("swarm viewer")}                    ${dim("Browse saved trajectory files")}`);
	lines.push(`    ${yellow("swarm benchmark")} <name> [--idx]  ${dim("Run benchmark")}`);

	lines.push("");
	lines.push(`  ${bold("SWARM OPTIONS")}`);
	lines.push(`    ${cyan("--dir")} <path>           Target repository directory`);
	lines.push(`    ${cyan("--orchestrator")} <model> Model for the orchestrator LLM`);
	lines.push(`    ${cyan("--agent")} <backend>      Default agent backend ${dim("(opencode)")}`);
	lines.push(`    ${cyan("--dry-run")}              Plan only, don't spawn threads`);
	lines.push(`    ${cyan("--max-budget")} <usd>     Maximum session budget in USD`);
	lines.push(`    ${cyan("--verbose")}              Show detailed progress`);
	lines.push(`    ${cyan("--quiet")} / ${cyan("-q")}           Suppress non-essential output`);
	lines.push(`    ${cyan("--json")}                 Machine-readable JSON output`);

	lines.push("");
	lines.push(`  ${bold("RUN OPTIONS")}`);
	lines.push(`    ${cyan("--model")} <id>     Override model ${dim("(RLM_MODEL from .env)")}`);
	lines.push(`    ${cyan("--file")} <path>    Read context from a file`);
	lines.push(`    ${cyan("--url")} <url>      Fetch context from a URL`);
	lines.push(`    ${cyan("--stdin")}          Read context from stdin`);

	lines.push("");
	lines.push(`  ${bold("CONFIGURATION")}`);
	lines.push(`    ${dim(".env file (pick one provider):")}`);
	lines.push(`      ANTHROPIC_API_KEY=sk-ant-...`);
	lines.push(`      OPENAI_API_KEY=sk-...`);
	lines.push(`      GEMINI_API_KEY=AIza...`);
	lines.push("");
	lines.push(`    ${dim("swarm_config.yaml:")}`);
	lines.push(`      max_threads: 5`);
	lines.push(`      default_agent: opencode`);
	lines.push(`      compression_strategy: structured`);

	return lines.join("\n");
}

// Lazy — evaluated on first use, not at module load
let _help: string | undefined;
function getHelp(): string {
	if (!_help) _help = buildHelp();
	return _help;
}

/**
 * Check if args contain positional (non-flag) arguments.
 * Skips known flags that take a value argument.
 */
function hasPositionalArgs(args: string[]): boolean {
	const flagsWithValue = new Set(["--dir", "--orchestrator", "--agent", "--max-budget", "--model", "--file", "--url"]);
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg.startsWith("--") || arg === "-q" || arg === "-h") {
			// Skip flags with values
			if (flagsWithValue.has(arg) && i + 1 < args.length) {
				i++; // skip the value
			}
			continue;
		}
		// Found a positional argument
		return true;
	}
	return false;
}

async function main() {
	const args = process.argv.slice(2);

	// Check if this is swarm mode (has --dir flag)
	const dirIdx = args.indexOf("--dir");
	if (dirIdx !== -1) {
		// Check if there's a query (positional args that aren't flags/flag-values)
		const hasQuery = hasPositionalArgs(args);

		if (hasQuery) {
			// Single-shot swarm mode — dynamic import to avoid loading all swarm deps upfront
			const { runSwarmMode } = await import("./swarm.js");
			await runSwarmMode(args);
		} else {
			// Interactive swarm mode — no query provided, launch REPL
			const { runInteractiveSwarm } = await import("./interactive-swarm.js");
			await runInteractiveSwarm(args);
		}
		return;
	}

	const command = args[0] || "";

	// Default: no command → interactive swarm mode using current directory
	if (!command || command === "interactive" || command === "i") {
		const { runInteractiveSwarm } = await import("./interactive-swarm.js");
		await runInteractiveSwarm(["--dir", process.cwd(), ...args.slice(command ? 1 : 0)]);
		return;
	}

	switch (command) {
		case "viewer":
		case "view": {
			process.argv = [process.argv[0], process.argv[1], ...args.slice(1)];
			await import("./viewer.js");
			break;
		}

		case "mcp": {
			const { startMcpServer } = await import("./mcp/server.js");
			await startMcpServer(args.slice(1));
			break;
		}

		case "run": {
			process.argv = [process.argv[0], process.argv[1], ...args.slice(1)];
			await import("./cli.js");
			break;
		}

		case "benchmark":
		case "bench": {
			const benchName = args[1];
			const benchArgs = args.slice(2);

			const benchScripts: Record<string, string> = {
				oolong: "benchmarks/oolong_synth.ts",
				longbench: "benchmarks/longbench_narrativeqa.ts",
			};

			if (benchName && benchScripts[benchName]) {
				const { spawn } = await import("node:child_process");
				const { dirname, join } = await import("node:path");
				const { fileURLToPath } = await import("node:url");
				const root = join(dirname(fileURLToPath(import.meta.url)), "..");
				const script = join(root, benchScripts[benchName]);
				const tsxBin = join(root, "node_modules", ".bin", "tsx");

				await new Promise<void>((resolve, reject) => {
					const child = spawn(tsxBin, [script, ...benchArgs], {
						stdio: "inherit",
						cwd: root,
					});
					child.on("exit", (code) => {
						process.exitCode = code ?? 1;
						resolve();
					});
					child.on("error", (err) => {
						reject(new Error(`Failed to spawn benchmark: ${err.message}`));
					});
				});
			} else {
				console.log(`${cyan(bold("swarm benchmark"))} ${dim("— Run direct LLM vs RLM comparison")}\n`);
				console.log(bold("USAGE"));
				console.log(`  ${yellow("swarm benchmark oolong")}    [--idx N]  Oolong Synth`);
				console.log(`  ${yellow("swarm benchmark longbench")} [--idx N]  LongBench NarrativeQA\n`);
			}
			break;
		}

		case "help":
		case "--help":
		case "-h": {
			console.log(getHelp());
			break;
		}

		case "version":
		case "--version":
		case "-v": {
			try {
				const { readFileSync } = await import("node:fs");
				const { dirname, join } = await import("node:path");
				const { fileURLToPath } = await import("node:url");
				const __dir = dirname(fileURLToPath(import.meta.url));
				const pkgPath = join(__dir, "..", "package.json");
				const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
				console.log(`swarm v${pkg.version}`);
			} catch {
				console.log("swarm (version unknown)");
			}
			break;
		}

		default: {
			if (command.startsWith("--")) {
				// Flags without subcommand — check for --dir (swarm mode)
				if (command === "--dir") {
					if (hasPositionalArgs(args)) {
						const { runSwarmMode } = await import("./swarm.js");
						await runSwarmMode(args);
					} else {
						const { runInteractiveSwarm } = await import("./interactive-swarm.js");
						await runInteractiveSwarm(args);
					}
				} else {
					// Assume "run" mode, pass all args through
					process.argv = [process.argv[0], process.argv[1], ...args];
					await import("./cli.js");
				}
			} else {
				console.error(`Unknown command: ${command}`);
				console.error('Run "swarm help" for usage information.');
				process.exit(1);
			}
		}
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
