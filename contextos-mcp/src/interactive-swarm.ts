/**
 * Interactive swarm REPL — a persistent session for follow-up tasks,
 * thread inspection, manual merge/reject, and live DAG visualization.
 *
 * Usage: swarm --dir ./project   (no query argument enters interactive mode)
 *
 * Commands:
 *   <task>          Run a task through the RLM orchestrator
 *   /threads (/t)   List all threads with status, cost, duration
 *   /thread <id>    Show detailed info for a specific thread
 *   /merge [id...]  Merge specific thread branches (or all if no args)
 *   /reject <id>    Discard a thread's worktree and branch
 *   /dag            Show thread dependency DAG with status indicators
 *   /budget         Show budget state
 *   /status         Overall session status
 *   /help           Show available commands
 *   /quit (/exit)   Cleanup and exit
 */

import "./env.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readTextInput } from "./ui/text-input.js";

// Dynamic imports — ensures env.js has set process.env BEFORE pi-ai loads
await import("@mariozechner/pi-ai");
const { PythonRepl } = await import("./core/repl.js");
const { runRlmLoop } = await import("./core/rlm.js");
const { loadConfig } = await import("./config.js");

// Register agent backends
const opencodeMod = await import("./agents/opencode.js");
await import("./agents/direct-llm.js");
await import("./agents/claude-code.js");
await import("./agents/codex.js");
await import("./agents/aider.js");

import { randomBytes } from "node:crypto";
import type { SwarmConfig } from "./config.js";
import type { ThreadState } from "./core/types.js";
import { EpisodicMemory } from "./memory/episodic.js";
import { buildSwarmSystemPrompt } from "./prompts/orchestrator.js";
import { type ResolvedModel, resolveModel } from "./routing/model-resolver.js";
import { classifyTaskComplexity, describeAvailableAgents, FailureTracker, routeTask } from "./routing/model-router.js";
import { ThreadManager, type ThreadProgressCallback } from "./threads/manager.js";
import { ThreadDashboard } from "./ui/dashboard.js";
import { logError, logRouter, logSuccess, logVerbose, logWarn, setLogLevel } from "./ui/log.js";
import { runOnboarding } from "./ui/onboarding.js";
import { RunLogger } from "./ui/run-log.js";
// UI system
import { Spinner } from "./ui/spinner.js";
import { StreamingFeed } from "./ui/streaming-feed.js";
import { bold, coral, cyan, dim, green, isTTY, red, symbols, termWidth, truncate, yellow } from "./ui/theme.js";
import { type MergeAllOptions, mergeAllThreads, mergeThreadBranch } from "./worktree/merge.js";

// ── Arg parsing ─────────────────────────────────────────────────────────────

interface InteractiveSwarmArgs {
	dir: string;
	orchestratorModel: string;
	agent: string;
	maxBudget: number | null;
	verbose: boolean;
	quiet: boolean;
	autoRoute: boolean;
}

function parseInteractiveArgs(args: string[]): InteractiveSwarmArgs {
	let dir = "";
	let orchestratorModel = "";
	let agent = "";
	let maxBudget: number | null = null;
	let verbose = false;
	let quiet = false;
	let autoRoute = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--dir" && i + 1 < args.length) {
			dir = args[++i];
		} else if (arg === "--orchestrator" && i + 1 < args.length) {
			orchestratorModel = args[++i];
		} else if (arg === "--agent" && i + 1 < args.length) {
			agent = args[++i];
		} else if (arg === "--max-budget" && i + 1 < args.length) {
			const raw = args[++i];
			const parsed = parseFloat(raw);
			if (Number.isFinite(parsed) && parsed > 0) maxBudget = parsed;
		} else if (arg === "--verbose") {
			verbose = true;
		} else if (arg === "--quiet" || arg === "-q") {
			quiet = true;
		} else if (arg === "--auto-route") {
			autoRoute = true;
		}
		// Silently ignore unknown flags and positional args
	}

	if (!dir) {
		dir = process.cwd();
	}

	return {
		dir: path.resolve(dir),
		orchestratorModel: orchestratorModel || process.env.RLM_MODEL || "claude-sonnet-4-6",
		agent: agent || "",
		maxBudget,
		verbose,
		quiet,
		autoRoute,
	};
}

// ── Codebase scanning (mirrored from swarm.ts) ──────────────────────────────

const SKIP_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	".next",
	".venv",
	"venv",
	"__pycache__",
	".swarm-worktrees",
	"coverage",
	".turbo",
	".cache",
]);

const SKIP_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".ico",
	".svg",
	".woff",
	".woff2",
	".ttf",
	".eot",
	".mp3",
	".mp4",
	".webm",
	".zip",
	".tar",
	".gz",
	".lock",
	".map",
]);

function scanDirectory(dir: string, maxFiles: number = 200, maxTotalSize: number = 2 * 1024 * 1024): string {
	const files: { relPath: string; content: string }[] = [];
	let totalSize = 0;

	function walk(currentDir: string, depth: number) {
		if (depth > 15 || files.length >= maxFiles || totalSize >= maxTotalSize) return;

		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(currentDir, { withFileTypes: true });
		} catch {
			return;
		}

		entries.sort((a, b) => a.name.localeCompare(b.name));

		for (const entry of entries) {
			if (files.length >= maxFiles || totalSize >= maxTotalSize) return;

			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
					walk(path.join(currentDir, entry.name), depth + 1);
				}
			} else if (entry.isFile()) {
				const ext = path.extname(entry.name).toLowerCase();
				if (SKIP_EXTENSIONS.has(ext)) continue;

				const fullPath = path.join(currentDir, entry.name);
				try {
					const stat = fs.statSync(fullPath);
					if (stat.size > 100 * 1024) continue;
					if (stat.size === 0) continue;

					const content = fs.readFileSync(fullPath, "utf-8");
					if (content.includes("\0")) continue;

					const relPath = path.relative(dir, fullPath);
					files.push({ relPath, content });
					totalSize += content.length;
				} catch {}
			}
		}
	}

	walk(dir, 0);

	const parts: string[] = [];
	parts.push(`Codebase: ${path.basename(dir)}`);
	parts.push(`Files: ${files.length}`);
	parts.push(`Total size: ${(totalSize / 1024).toFixed(1)}KB`);
	parts.push("---");

	for (const file of files) {
		parts.push(`\n=== ${file.relPath} ===`);
		parts.push(file.content);
	}

	return parts.join("\n");
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const s = ms / 1000;
	if (s < 60) return `${s.toFixed(1)}s`;
	const m = Math.floor(s / 60);
	const rem = s % 60;
	return `${m}m ${rem.toFixed(0)}s`;
}

function formatCost(usd: number): string {
	return `$${usd.toFixed(4)}`;
}

function statusIcon(status: string): string {
	switch (status) {
		case "completed":
			return green(symbols.check);
		case "failed":
			return red(symbols.cross);
		case "cancelled":
			return yellow(symbols.dash);
		case "running":
			return coral(symbols.arrow);
		case "pending":
			return dim(symbols.dot);
		default:
			return dim("?");
	}
}

function statusColor(status: string): (s: string) => string {
	switch (status) {
		case "completed":
			return green;
		case "failed":
			return red;
		case "cancelled":
			return yellow;
		case "running":
			return coral;
		default:
			return dim;
	}
}

// ── Command handlers ────────────────────────────────────────────────────────

function cmdHelp(): void {
	const w = Math.min(termWidth(), 70);
	const out = process.stderr;

	out.write("\n");
	out.write(`  ${bold(cyan("Interactive Swarm Commands"))}\n`);
	out.write(`  ${dim(symbols.horizontal.repeat(Math.min(w - 4, 40)))}\n`);
	out.write("\n");
	out.write(`  ${yellow("<task>")}              ${dim("Run a task through the orchestrator")}\n`);
	out.write(`  ${cyan("/threads")} ${dim("(/t)")}       ${dim("List all threads with status")}\n`);
	out.write(`  ${cyan("/thread")} ${yellow("<id>")}       ${dim("Show detailed info for a thread")}\n`);
	out.write(`  ${cyan("/merge")} ${yellow("[id...]")}    ${dim("Merge thread branches (all if no args)")}\n`);
	out.write(`  ${cyan("/reject")} ${yellow("<id>")}      ${dim("Discard a thread worktree and branch")}\n`);
	out.write(`  ${cyan("/dag")}               ${dim("Show thread DAG with status indicators")}\n`);
	out.write(`  ${cyan("/budget")}            ${dim("Show budget state")}\n`);
	out.write(`  ${cyan("/status")}            ${dim("Overall session status")}\n`);
	out.write(`  ${cyan("/configure")} ${dim("(/c)")}  ${dim("Change agent, model, or backend")}\n`);
	out.write(`  ${cyan("/help")}              ${dim("Show this help")}\n`);
	out.write(`  ${cyan("/quit")} ${dim("(/exit)")}     ${dim("Cleanup and exit")}\n`);
	out.write("\n");
}

function cmdThreads(threadManager: ThreadManager): void {
	const threads = threadManager.getThreads();
	const out = process.stderr;

	if (threads.length === 0) {
		out.write(`\n  ${dim("No threads yet. Type a task to get started.")}\n\n`);
		return;
	}

	out.write("\n");
	out.write(`  ${bold(cyan("Threads"))} ${dim(`(${threads.length} total)`)}\n`);
	out.write(`  ${dim(symbols.horizontal.repeat(Math.min(termWidth() - 4, 60)))}\n`);

	for (const t of threads) {
		const icon = statusIcon(t.status);
		const id = dim(t.id.slice(0, 8));
		const status = statusColor(t.status)(t.status);
		const dur =
			t.completedAt && t.startedAt
				? dim(formatDuration(t.completedAt - t.startedAt))
				: t.startedAt
					? dim(formatDuration(Date.now() - t.startedAt))
					: dim("--");
		const cost = t.estimatedCostUsd > 0 ? dim(formatCost(t.estimatedCostUsd)) : "";
		const files = t.result?.filesChanged.length ?? 0;
		const fileStr = files > 0 ? dim(`${files} files`) : "";
		const task = truncate(t.config.task, 45);

		out.write(`  ${icon} ${id}  ${status}  ${dur}  ${cost}  ${fileStr}  ${dim(task)}\n`);
	}
	out.write("\n");
}

function cmdThread(threadManager: ThreadManager, threadId: string): void {
	const out = process.stderr;

	if (!threadId) {
		logError("Usage: /thread <id>");
		return;
	}

	// Find thread by prefix match
	const threads = threadManager.getThreads();
	const matches = threads.filter((t) => t.id.startsWith(threadId));

	if (matches.length === 0) {
		logError(`No thread found matching "${threadId}"`);
		return;
	}
	if (matches.length > 1) {
		logWarn(`Multiple matches for "${threadId}": ${matches.map((t) => t.id.slice(0, 8)).join(", ")}`);
		return;
	}

	const t = matches[0];
	out.write("\n");
	out.write(`  ${bold(cyan("Thread"))} ${dim(t.id)}\n`);
	out.write(`  ${dim(symbols.horizontal.repeat(Math.min(termWidth() - 4, 60)))}\n`);
	out.write(`  ${dim("Status")}     ${statusColor(t.status)(t.status)} ${statusIcon(t.status)}\n`);
	out.write(`  ${dim("Phase")}      ${t.phase}\n`);
	out.write(`  ${dim("Task")}       ${t.config.task}\n`);
	out.write(`  ${dim("Agent")}      ${t.config.agent.backend || "default"}\n`);
	out.write(`  ${dim("Model")}      ${t.config.agent.model || "default"}\n`);
	out.write(`  ${dim("Attempt")}    ${t.attempt}/${t.maxAttempts}\n`);

	if (t.startedAt) {
		const started = new Date(t.startedAt).toLocaleTimeString();
		out.write(`  ${dim("Started")}    ${started}\n`);
	}
	if (t.completedAt && t.startedAt) {
		out.write(`  ${dim("Duration")}   ${formatDuration(t.completedAt - t.startedAt)}\n`);
	}
	if (t.estimatedCostUsd > 0) {
		out.write(`  ${dim("Cost")}       ${formatCost(t.estimatedCostUsd)}\n`);
	}
	if (t.branchName) {
		out.write(`  ${dim("Branch")}     ${cyan(t.branchName)}\n`);
	}
	if (t.worktreePath) {
		out.write(`  ${dim("Worktree")}   ${t.worktreePath}\n`);
	}
	if (t.error) {
		out.write(`  ${dim("Error")}      ${red(t.error)}\n`);
	}

	// Show result summary
	if (t.result) {
		out.write("\n");
		out.write(`  ${bold("Result")}\n`);
		if (t.result.filesChanged.length > 0) {
			out.write(`  ${dim("Files changed:")}\n`);
			for (const f of t.result.filesChanged) {
				out.write(`    ${green("+")} ${f}\n`);
			}
		}
		if (t.result.diffStats && t.result.diffStats !== "(no changes)") {
			out.write(`\n  ${dim("Diff stats:")}\n`);
			for (const line of t.result.diffStats.split("\n")) {
				out.write(`    ${dim(line)}\n`);
			}
		}
		if (t.result.summary) {
			out.write(`\n  ${dim("Summary:")}\n`);
			const lines = t.result.summary.split("\n");
			for (const line of lines.slice(0, 20)) {
				out.write(`    ${line}\n`);
			}
			if (lines.length > 20) {
				out.write(`    ${dim(`... ${lines.length - 20} more lines`)}\n`);
			}
		}
	}
	out.write("\n");
}

async function cmdMerge(threadManager: ThreadManager, dir: string, idArgs: string[]): Promise<void> {
	const threads = threadManager.getThreads();
	const out = process.stderr;

	if (idArgs.length === 0) {
		// Merge all completed threads
		out.write(`\n  ${dim("Merging all completed thread branches...")}\n`);
		const opts: MergeAllOptions = { continueOnConflict: true };
		const results = await mergeAllThreads(dir, threads, opts);

		if (results.length === 0) {
			out.write(`  ${dim("No eligible threads to merge.")}\n\n`);
			return;
		}

		for (const r of results) {
			if (r.success) {
				out.write(`  ${green(symbols.check)} ${cyan(r.branch)} ${dim(r.message)}\n`);
			} else {
				out.write(`  ${red(symbols.cross)} ${cyan(r.branch)} ${red(r.message)}\n`);
				if (r.conflicts.length > 0) {
					out.write(`    ${dim("Conflicts:")} ${r.conflicts.join(", ")}\n`);
				}
			}
		}

		const merged = results.filter((r) => r.success).length;
		const failed = results.filter((r) => !r.success).length;
		if (merged > 0) logSuccess(`Merged ${merged} branches`);
		if (failed > 0) logWarn(`${failed} branches had conflicts`);
		out.write("\n");
	} else {
		// Merge specific threads by ID prefix
		for (const idArg of idArgs) {
			const match = threads.find((t) => t.id.startsWith(idArg));
			if (!match) {
				logError(`No thread found matching "${idArg}"`);
				continue;
			}
			if (match.status !== "completed" || !match.branchName) {
				logWarn(`Thread ${match.id.slice(0, 8)} is not eligible for merge (status: ${match.status})`);
				continue;
			}
			if (!match.result?.success) {
				logWarn(`Thread ${match.id.slice(0, 8)} did not complete successfully`);
				continue;
			}

			out.write(`  ${dim("Merging")} ${cyan(match.branchName)}${dim("...")}\n`);
			const result = await mergeThreadBranch(dir, match.branchName, match.id);

			if (result.success) {
				out.write(`  ${green(symbols.check)} ${dim(result.message)}\n`);
			} else {
				out.write(`  ${red(symbols.cross)} ${red(result.message)}\n`);
				if (result.conflicts.length > 0) {
					out.write(`    ${dim("Conflicts:")} ${result.conflicts.join(", ")}\n`);
				}
			}
		}
		out.write("\n");
	}
}

async function cmdReject(threadManager: ThreadManager, threadId: string): Promise<void> {
	const out = process.stderr;

	if (!threadId) {
		logError("Usage: /reject <id>");
		return;
	}

	const threads = threadManager.getThreads();
	const match = threads.find((t) => t.id.startsWith(threadId));

	if (!match) {
		logError(`No thread found matching "${threadId}"`);
		return;
	}

	const wtManager = threadManager.getWorktreeManager();
	const wtInfo = wtManager.getWorktreeInfo(match.id);

	if (wtInfo) {
		out.write(`  ${dim("Destroying worktree and branch for")} ${dim(match.id.slice(0, 8))}${dim("...")}\n`);
		await wtManager.destroy(match.id, true);
		logSuccess(`Rejected thread ${match.id.slice(0, 8)} — worktree and branch removed`);
	} else {
		logWarn(`Thread ${match.id.slice(0, 8)} has no active worktree (may already be cleaned up)`);
	}
}

function cmdDag(threadManager: ThreadManager): void {
	const threads = threadManager.getThreads();
	const out = process.stderr;

	if (threads.length === 0) {
		out.write(`\n  ${dim("No threads yet.")}\n\n`);
		return;
	}

	out.write("\n");
	out.write(`  ${bold(cyan("Thread DAG"))}\n`);
	out.write(`  ${dim(symbols.horizontal.repeat(Math.min(termWidth() - 4, 60)))}\n`);
	out.write("\n");

	// Group by status for visual clarity
	const running = threads.filter((t) => t.status === "running" || t.status === "pending");
	const completed = threads.filter((t) => t.status === "completed");
	const failed = threads.filter((t) => t.status === "failed");
	const cancelled = threads.filter((t) => t.status === "cancelled");

	// Main branch root
	out.write(`  ${cyan(symbols.dot)} ${bold("main")}\n`);

	const renderThread = (t: ThreadState, isLast: boolean) => {
		const connector = isLast ? symbols.bottomLeft : `${symbols.vertLine}`;
		const branch = t.branchName || `swarm/${t.id.slice(0, 8)}`;
		const icon = statusIcon(t.status);
		const task = truncate(t.config.task, 35);
		const dur = t.completedAt && t.startedAt ? dim(formatDuration(t.completedAt - t.startedAt)) : "";

		out.write(`  ${cyan(symbols.vertLine)}\n`);
		out.write(`  ${cyan(connector)}${cyan(symbols.horizontal.repeat(2))} ${icon} ${dim(branch)} ${dim(task)} ${dur}\n`);
	};

	const allThreads = [...running, ...completed, ...failed, ...cancelled];
	for (let i = 0; i < allThreads.length; i++) {
		renderThread(allThreads[i], i === allThreads.length - 1);
	}

	out.write("\n");

	// Legend
	out.write(
		`  ${dim("Legend:")} ${green(symbols.check)} completed  ${red(symbols.cross)} failed  ${yellow(symbols.dash)} cancelled  ${coral(symbols.arrow)} running  ${dim(symbols.dot)} pending\n`,
	);
	out.write("\n");
}

function cmdBudget(threadManager: ThreadManager): void {
	const budget = threadManager.getBudgetState();
	const out = process.stderr;

	out.write("\n");
	out.write(`  ${bold(cyan("Budget"))}\n`);
	out.write(`  ${dim(symbols.horizontal.repeat(Math.min(termWidth() - 4, 40)))}\n`);

	const pct = budget.sessionLimitUsd > 0 ? ((budget.totalSpentUsd / budget.sessionLimitUsd) * 100).toFixed(1) : "0";
	const budgetColor = budget.totalSpentUsd > budget.sessionLimitUsd * 0.8 ? yellow : green;

	out.write(
		`  ${dim("Spent")}         ${budgetColor(formatCost(budget.totalSpentUsd))} / ${formatCost(budget.sessionLimitUsd)} (${pct}%)\n`,
	);
	out.write(`  ${dim("Per-thread")}    ${formatCost(budget.perThreadLimitUsd)} max\n`);

	if (budget.actualCostThreads > 0 || budget.estimatedCostThreads > 0) {
		out.write(
			`  ${dim("Cost source")}   ${budget.actualCostThreads} actual, ${budget.estimatedCostThreads} estimated\n`,
		);
	}

	const tokens = budget.totalTokens;
	if (tokens.input > 0 || tokens.output > 0) {
		const totalK = ((tokens.input + tokens.output) / 1000).toFixed(1);
		out.write(
			`  ${dim("Tokens")}        ${tokens.input.toLocaleString()} in + ${tokens.output.toLocaleString()} out (${totalK}K)\n`,
		);
	}

	// Per-thread costs
	if (budget.threadCosts.size > 0) {
		out.write(`\n  ${dim("Per-thread costs:")}\n`);
		for (const [id, cost] of budget.threadCosts) {
			out.write(`    ${dim(id.slice(0, 8))}  ${formatCost(cost)}\n`);
		}
	}

	out.write("\n");
}

function cmdStatus(threadManager: ThreadManager, sessionStartTime: number, taskCount: number): void {
	const threads = threadManager.getThreads();
	const budget = threadManager.getBudgetState();
	const cache = threadManager.getCacheStats();
	const concurrency = threadManager.getConcurrencyStats();
	const out = process.stderr;

	out.write("\n");
	out.write(`  ${bold(cyan("Session Status"))}\n`);
	out.write(`  ${dim(symbols.horizontal.repeat(Math.min(termWidth() - 4, 40)))}\n`);

	const elapsed = formatDuration(Date.now() - sessionStartTime);
	out.write(`  ${dim("Uptime")}        ${elapsed}\n`);
	out.write(`  ${dim("Tasks run")}     ${taskCount}\n`);

	// Thread stats
	const completed = threads.filter((t) => t.status === "completed").length;
	const failed = threads.filter((t) => t.status === "failed").length;
	const running = threads.filter((t) => t.status === "running").length;
	const pending = threads.filter((t) => t.status === "pending").length;

	out.write(`  ${dim("Threads")}       ${threads.length} total`);
	if (completed > 0) out.write(` ${green(`${completed} done`)}`);
	if (failed > 0) out.write(` ${red(`${failed} failed`)}`);
	if (running > 0) out.write(` ${coral(`${running} running`)}`);
	if (pending > 0) out.write(` ${dim(`${pending} pending`)}`);
	out.write("\n");

	out.write(
		`  ${dim("Concurrency")}   ${concurrency.active}/${concurrency.max} active, ${concurrency.waiting} waiting\n`,
	);

	// Budget
	const pct = budget.sessionLimitUsd > 0 ? ((budget.totalSpentUsd / budget.sessionLimitUsd) * 100).toFixed(1) : "0";
	out.write(
		`  ${dim("Budget")}        ${formatCost(budget.totalSpentUsd)} / ${formatCost(budget.sessionLimitUsd)} (${pct}%)\n`,
	);

	// Cache
	if (cache.hits > 0 || cache.size > 0) {
		const saved = cache.totalSavedMs > 0 ? `, saved ${formatDuration(cache.totalSavedMs)}` : "";
		out.write(`  ${dim("Cache")}         ${cache.hits} hits, ${cache.misses} misses, ${cache.size} entries${saved}\n`);
	}

	out.write("\n");
}

// ── Configure command ───────────────────────────────────────────────────────

async function cmdConfigure(config: SwarmConfig, resolved: ResolvedModel): Promise<void> {
	const out = process.stderr;
	const ask = async (q: string): Promise<string> => {
		const { readTextInput: readInput } = await import("./ui/text-input.js");
		const result = await readInput(q);
		return result.text;
	};

	out.write("\n");
	out.write(`  ${bold(cyan("Configuration"))}\n`);
	out.write(`  ${dim(symbols.horizontal.repeat(40))}\n\n`);

	out.write(`  ${dim("Current settings:")}\n`);
	out.write(`    ${cyan("1")}  Agent          ${bold(config.default_agent)}\n`);
	const displayModel =
		resolved.provider === "ollama"
			? `ollama/${resolved.model.id}`
			: resolved.provider === "openrouter"
				? `openrouter/${resolved.model.id}`
				: resolved.model.id;
	out.write(
		`    ${cyan("2")}  Model          ${bold(displayModel)}${displayModel !== config.default_model ? dim(` (config: ${config.default_model})`) : ""}\n`,
	);
	out.write(`    ${cyan("3")}  Max threads    ${bold(String(config.max_threads))}\n`);
	out.write(`    ${cyan("4")}  Auto routing   ${bold(config.auto_model_selection ? "on" : "off")}\n`);
	out.write(`    ${cyan("5")}  Session budget ${bold(`$${config.max_session_budget_usd.toFixed(2)}`)}\n`);
	out.write(`    ${cyan("6")}  Thread budget  ${bold(`$${config.max_thread_budget_usd.toFixed(2)}`)}\n`);
	out.write(`    ${cyan("7")}  Compression    ${bold(config.compression_strategy)}\n`);
	out.write("\n");

	const choice = await ask(`  ${coral(symbols.arrow)} Setting to change [1-7, or enter to cancel]: `);
	if (!choice) {
		out.write(`  ${dim("No changes made.")}\n\n`);
		return;
	}

	switch (choice) {
		case "1": {
			const agents = (await import("./agents/provider.js")).listAgents();
			out.write(`\n  ${dim("Available agents:")} ${agents.join(", ")}\n`);
			const val = await ask(`  ${coral(symbols.arrow)} New agent [${config.default_agent}]: `);
			if (val && agents.includes(val)) {
				config.default_agent = val;
				logSuccess(`Agent set to ${bold(val)}`);
			} else if (val) {
				logWarn(`Unknown agent "${val}"`);
			}
			break;
		}
		case "2": {
			out.write(
				`\n  ${dim("Enter model ID (e.g. ollama/deepseek-coder-v2, anthropic/claude-sonnet-4-6, openrouter/auto)")}\n`,
			);
			const val = await ask(`  ${coral(symbols.arrow)} New model [${displayModel}]: `);
			if (val) {
				// Check for required API keys
				const keyChecks: Record<string, { env: string; url: string }> = {
					openrouter: { env: "OPENROUTER_API_KEY", url: "https://openrouter.ai/keys" },
					openai: { env: "OPENAI_API_KEY", url: "https://platform.openai.com/api-keys" },
					anthropic: { env: "ANTHROPIC_API_KEY", url: "https://console.anthropic.com/settings/keys" },
					google: { env: "GEMINI_API_KEY", url: "https://aistudio.google.com/apikey" },
				};
				// Determine which provider the model needs
				let requiredProvider = "";
				if (val.startsWith("openrouter/")) requiredProvider = "openrouter";
				else if (val.startsWith("anthropic/") || val.startsWith("claude")) requiredProvider = "anthropic";
				else if (val.startsWith("openai/") || val.startsWith("gpt") || val.startsWith("o3") || val.startsWith("o4"))
					requiredProvider = "openai";
				else if (val.startsWith("google/") || val.startsWith("gemini")) requiredProvider = "google";

				const check = requiredProvider ? keyChecks[requiredProvider] : undefined;
				const envVal = check ? process.env[check.env] : undefined;
				const hasRealKey = envVal && envVal !== "ollama-local";
				if (check && !hasRealKey) {
					out.write(`\n  ${dim(`${requiredProvider} requires an API key (${check.url})`)}\n`);
					const key = await ask(`  ${coral(symbols.arrow)} ${check.env}: `);
					if (key) {
						process.env[check.env] = key;
						logSuccess(`${check.env} set for this session`);
					} else {
						logWarn(`No API key provided — cannot use ${requiredProvider}`);
						break;
					}
				}
				const lookupId =
					val.startsWith("ollama/") || val.startsWith("openrouter/")
						? val
						: val.replace(/^(anthropic|openai|google)\//, "");
				const newResolved = resolveModel(lookupId, logWarn);
				if (newResolved) {
					config.default_model = val;
					resolved.model = newResolved.model;
					resolved.provider = newResolved.provider;
					logSuccess(`Model set to ${bold(val)}`);
				} else {
					logWarn(`Could not resolve model "${val}"`);
				}
			}
			break;
		}
		case "3": {
			const val = await ask(`  ${coral(symbols.arrow)} Max concurrent threads [${config.max_threads}]: `);
			const n = parseInt(val, 10);
			if (n >= 1 && n <= 20) {
				config.max_threads = n;
				logSuccess(`Max threads set to ${bold(String(n))}`);
			} else if (val) {
				logWarn("Must be between 1 and 20");
			}
			break;
		}
		case "4": {
			config.auto_model_selection = !config.auto_model_selection;
			logSuccess(`Auto routing ${bold(config.auto_model_selection ? "enabled" : "disabled")}`);
			break;
		}
		case "5": {
			const val = await ask(`  ${coral(symbols.arrow)} Session budget USD [${config.max_session_budget_usd}]: `);
			const n = parseFloat(val);
			if (Number.isFinite(n) && n > 0) {
				config.max_session_budget_usd = n;
				logSuccess(`Session budget set to ${bold(`$${n.toFixed(2)}`)}`);
			} else if (val) {
				logWarn("Must be a positive number");
			}
			break;
		}
		case "6": {
			const val = await ask(`  ${coral(symbols.arrow)} Per-thread budget USD [${config.max_thread_budget_usd}]: `);
			const n = parseFloat(val);
			if (Number.isFinite(n) && n > 0) {
				config.max_thread_budget_usd = n;
				logSuccess(`Thread budget set to ${bold(`$${n.toFixed(2)}`)}`);
			} else if (val) {
				logWarn("Must be a positive number");
			}
			break;
		}
		case "7": {
			const strategies = ["structured", "llm-summary", "diff-only", "truncate"] as const;
			out.write(`\n  ${dim("Options:")} ${strategies.join(", ")}\n`);
			const val = await ask(`  ${coral(symbols.arrow)} Compression [${config.compression_strategy}]: `);
			if (val && (strategies as readonly string[]).includes(val)) {
				config.compression_strategy = val as SwarmConfig["compression_strategy"];
				logSuccess(`Compression set to ${bold(val)}`);
			} else if (val) {
				logWarn(`Unknown strategy "${val}"`);
			}
			break;
		}
		default:
			logWarn("Invalid option");
	}

	// Persist config changes to ~/.swarm/config.yaml
	if (choice >= "1" && choice <= "7") {
		try {
			const configDir = path.join(os.homedir(), ".swarm");
			fs.mkdirSync(configDir, { recursive: true });
			const configLines = [
				"# Swarm user preferences (updated by /configure)",
				`# Updated: ${new Date().toISOString()}`,
				"",
				`default_agent: ${config.default_agent}`,
				`default_model: ${config.default_model}`,
				"",
			];
			fs.writeFileSync(path.join(configDir, "config.yaml"), configLines.join("\n"), "utf-8");
		} catch {
			// Non-fatal
		}
	}

	out.write("\n");
}

// ── Interactive banner ──────────────────────────────────────────────────────

function renderInteractiveBanner(config: {
	dir: string;
	model: string;
	provider: string;
	agent: string;
	routing: string;
}): void {
	const w = Math.max(Math.min(termWidth(), 60), 24);
	const out = process.stderr;

	if (isTTY) {
		const title = " swarm ";
		const mode = " interactive ";
		const padLen = Math.max(0, w - title.length - mode.length - 4);
		const leftPad = symbols.horizontal.repeat(Math.floor(padLen / 2));
		const rightPad = symbols.horizontal.repeat(Math.ceil(padLen / 2));

		out.write("\n");
		out.write(
			`  ${cyan(`${symbols.topLeft}${leftPad}`)}${bold(coral(title))}${dim(mode)}${cyan(`${rightPad}${symbols.topRight}`)}\n`,
		);
		out.write(`  ${cyan(symbols.vertLine)}${" ".repeat(Math.max(0, w - 2))}${cyan(symbols.vertLine)}\n`);
	} else {
		out.write("\nswarm interactive\n");
	}

	const kv = (key: string, val: string) => {
		out.write(`  ${dim(key.padEnd(12))} ${val}\n`);
	};

	kv("Directory", config.dir);
	kv("Model", `${config.model} ${dim(`(${config.provider})`)}`);
	kv("Agent", config.agent);
	kv("Routing", config.routing);

	if (isTTY) {
		out.write(`  ${cyan(symbols.vertLine)}${" ".repeat(Math.max(0, w - 2))}${cyan(symbols.vertLine)}\n`);
		out.write(
			`  ${cyan(symbols.bottomLeft)}${cyan(symbols.horizontal.repeat(Math.max(0, w - 2)))}${cyan(symbols.bottomRight)}\n`,
		);
	}

	out.write(`\n  ${dim("Type a task to run, or /help for commands.")}\n\n`);
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function runInteractiveSwarm(rawArgs: string[]): Promise<void> {
	const args = parseInteractiveArgs(rawArgs);
	const config = loadConfig();

	// Configure UI
	if (args.quiet) setLogLevel("quiet");
	else if (args.verbose) setLogLevel("verbose");

	// Verify target directory
	if (!fs.existsSync(args.dir)) {
		logError(`Directory "${args.dir}" does not exist`);
		process.exit(1);
	}

	// First-run onboarding (may create ~/.swarm/config.yaml with user's chosen model)
	await runOnboarding();

	// Reload config to pick up any changes from onboarding
	// (onboarding writes ~/.swarm/config.yaml but loadConfig() already ran before it)
	Object.assign(config, loadConfig());

	// Override config with CLI args
	if (args.agent) config.default_agent = args.agent;
	if (args.maxBudget !== null) config.max_session_budget_usd = args.maxBudget;
	if (args.autoRoute) config.auto_model_selection = true;

	// Resolve orchestrator model — prefer CLI arg, then config's default_model
	const orchestratorModelId =
		args.orchestratorModel !== "claude-sonnet-4-6"
			? args.orchestratorModel
			: config.default_model || args.orchestratorModel;
	// For standard pi-ai models, strip provider prefix (e.g. "anthropic/claude-sonnet-4-6" → "claude-sonnet-4-6")
	// Ollama/OpenRouter prefixes are kept as-is (handled by resolveModel)
	const modelLookupId =
		orchestratorModelId.startsWith("ollama/") || orchestratorModelId.startsWith("openrouter/")
			? orchestratorModelId
			: orchestratorModelId.replace(/^(anthropic|openai|google)\//, "");
	const resolved = resolveModel(modelLookupId, logWarn);
	if (!resolved) {
		logError(
			`Could not find model "${orchestratorModelId}"`,
			"Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY in your .env file, or use Ollama/OpenRouter",
		);
		process.exit(1);
	}

	// Initialize episodic memory and failure tracker
	let episodicMemory: EpisodicMemory | undefined;
	if (config.episodic_memory_enabled) {
		episodicMemory = new EpisodicMemory(config.memory_dir);
		await episodicMemory.init();
	}
	const failureTracker = new FailureTracker();

	// Render banner
	renderInteractiveBanner({
		dir: args.dir,
		model: resolved.model.id,
		provider: resolved.provider,
		agent: config.default_agent,
		routing: config.auto_model_selection ? "auto" : "orchestrator-driven",
	});

	// Scan codebase
	const spinner = new Spinner();
	spinner.start("scanning codebase");
	const context = scanDirectory(args.dir);
	spinner.stop();
	logSuccess(`Scanned codebase — ${(context.length / 1024).toFixed(1)}KB context`);

	// Start REPL and thread infrastructure
	const repl = new PythonRepl();
	const sessionAc = new AbortController();

	const dashboard = new ThreadDashboard();
	const streamingFeed = new StreamingFeed();
	spinner.setDashboard(dashboard);
	spinner.setStreamingFeed(streamingFeed);

	const threadProgress: ThreadProgressCallback = (threadId, phase, detail) => {
		if (phase === "completed" || phase === "failed" || phase === "cancelled") {
			dashboard.complete(threadId, phase, detail);
			streamingFeed.completeThread(threadId, phase, detail);
		} else {
			dashboard.update(threadId, phase, detail);
			streamingFeed.updateThread(threadId, phase, detail);
		}
	};

	// Enable OpenCode server mode
	if (config.default_agent === "opencode" && config.opencode_server_mode) {
		opencodeMod.enableServerMode();
		logVerbose("OpenCode server mode enabled");
	}

	// Initialize thread manager
	const threadManager = new ThreadManager(args.dir, config, threadProgress, sessionAc.signal);
	threadManager.setThreadOutputCallback((threadId, chunk) => {
		streamingFeed.appendOutput(threadId, chunk);
	});
	await threadManager.init();

	if (episodicMemory) {
		threadManager.setEpisodicMemory(episodicMemory);
	}

	// Register LLM summarizer if needed
	if (config.compression_strategy === "llm-summary") {
		const { setSummarizer } = await import("./compression/compressor.js");
		const { completeSimple } = await import("@mariozechner/pi-ai");
		setSummarizer(async (text: string, instruction: string) => {
			const response = await completeSimple(resolved.model, {
				systemPrompt: instruction,
				messages: [
					{
						role: "user",
						content: text,
						timestamp: Date.now(),
					},
				],
			});
			return response.content
				.filter((b): b is { type: "text"; text: string } => b.type === "text")
				.map((b) => b.text)
				.join("");
		});
	}

	// Build system prompt
	const agentDesc = await describeAvailableAgents();
	let systemPrompt = buildSwarmSystemPrompt(config, agentDesc);

	// Add episodic memory hints for general context
	if (episodicMemory && episodicMemory.size > 0) {
		const hints = episodicMemory.getStrategyHints("general coding tasks");
		if (hints) {
			systemPrompt += `\n\n## Episodic Memory\n${hints}\nConsider these strategies when decomposing your task.`;
		}
	}

	// Session state
	const sessionStartTime = Date.now();
	let taskCount = 0;

	// Start Python REPL
	await repl.start(sessionAc.signal);

	let currentTaskAc: AbortController | null = null;
	let currentRunLog: RunLogger | null = null;
	let cleanupCalled = false;

	async function cleanup() {
		if (cleanupCalled) return;
		cleanupCalled = true;
		spinner.stop();
		dashboard.clear();
		streamingFeed.clear();
		sessionAc.abort();
		repl.shutdown();
		await threadManager.cleanup();
		await opencodeMod.disableServerMode();
		process.exit(0);
	}

	// Thread handler (reused across tasks)
	const threadHandler = async (
		task: string,
		threadContext: string,
		agentBackend: string,
		model: string,
		files: string[],
	) => {
		let resolvedAgent = agentBackend || config.default_agent;
		let resolvedModel = model || config.default_model;
		let routeSlot = "";
		let routeComplexity = "";

		if (config.auto_model_selection && !agentBackend && !model) {
			const route = await routeTask(task, config, episodicMemory, failureTracker);
			resolvedAgent = route.agent;
			resolvedModel = route.model;
			routeSlot = route.slot;
			routeComplexity = classifyTaskComplexity(task);
			logRouter(`${route.reason} [slot: ${route.slot}]`);
		}

		const threadId = randomBytes(6).toString("hex");

		dashboard.update(threadId, "queued", undefined, {
			task,
			agent: resolvedAgent,
			model: resolvedModel,
		});

		const result = await threadManager.spawnThread({
			id: threadId,
			task,
			context: threadContext,
			agent: {
				backend: resolvedAgent,
				model: resolvedModel,
			},
			files,
		});

		// Log thread to current run
		currentRunLog?.addThread({
			id: threadId,
			task,
			agent: resolvedAgent,
			model: resolvedModel,
			success: result.success,
			durationMs: result.durationMs,
			filesChanged: result.filesChanged,
			error: result.success ? undefined : result.summary,
		});

		// Record episode or failure
		if (result.success) {
			if (episodicMemory && routeSlot) {
				episodicMemory
					.record({
						task,
						agent: resolvedAgent,
						model: resolvedModel,
						slot: routeSlot,
						complexity: routeComplexity,
						success: true,
						durationMs: result.durationMs,
						estimatedCostUsd: result.estimatedCostUsd,
						filesChanged: result.filesChanged,
						summary: result.summary,
					})
					.catch(() => {});
			}
		} else {
			failureTracker.recordFailure(resolvedAgent, resolvedModel, task, result.summary || "unknown error");
		}

		return {
			result: result.summary,
			success: result.success,
			filesChanged: result.filesChanged,
			durationMs: result.durationMs,
		};
	};

	// Merge handler
	const mergeHandler = async () => {
		spinner.update("merging thread branches");
		const threads = threadManager.getThreads();
		const mergeOpts: MergeAllOptions = { continueOnConflict: true };
		const results = await mergeAllThreads(args.dir, threads, mergeOpts);

		const merged = results.filter((r) => r.success).length;
		const failed = results.filter((r) => !r.success).length;
		if (failed > 0) {
			logWarn(`Merged ${merged} branches, ${failed} failed`);
		} else if (merged > 0) {
			logSuccess(`Merged ${merged} branches`);
		}

		// Clean up merged worktrees
		if (config.auto_cleanup_worktrees) {
			for (const r of results) {
				if (r.success) {
					const thread = threads.find((t) => t.branchName === r.branch);
					if (thread) {
						try {
							await threadManager.destroyWorktree(thread.id);
						} catch {
							// Non-fatal
						}
					}
				}
			}
		}

		const summary = results
			.map((r) => (r.success ? `Merged ${r.branch}: ${r.message}` : `FAILED ${r.branch}: ${r.message}`))
			.join("\n");

		return {
			result: summary || "No threads to merge",
			success: results.every((r) => r.success),
		};
	};

	// Run a task through the RLM loop
	const runTask = async (query: string): Promise<void> => {
		taskCount++;
		currentTaskAc = new AbortController();

		// Link task abort to session abort
		const onSessionAbort = () => currentTaskAc?.abort();
		sessionAc.signal.addEventListener("abort", onSessionAbort, { once: true });

		spinner.start();
		const startTime = Date.now();
		const runLog = new RunLogger(query, resolved.model.id, config.default_agent, args.dir, config.max_iterations || 20);
		currentRunLog = runLog;

		try {
			// Update episodic memory hints per-task
			let taskSystemPrompt = systemPrompt;
			if (episodicMemory && episodicMemory.size > 0) {
				const hints = episodicMemory.getStrategyHints(query);
				if (hints) {
					// Replace existing hints or add new ones
					const memoryIdx = taskSystemPrompt.indexOf("## Episodic Memory");
					if (memoryIdx !== -1) {
						const endIdx = taskSystemPrompt.indexOf("\n## ", memoryIdx + 1);
						const before = taskSystemPrompt.slice(0, memoryIdx);
						const after = endIdx !== -1 ? taskSystemPrompt.slice(endIdx) : "";
						taskSystemPrompt = `${before}## Episodic Memory\n${hints}\nConsider these strategies when decomposing your task.${after}`;
					}
				}
			}

			const result = await runRlmLoop({
				context,
				query,
				model: resolved.model,
				repl,
				signal: currentTaskAc.signal,
				systemPrompt: taskSystemPrompt,
				threadHandler,
				mergeHandler,
				onProgress: (info) => {
					spinner.update(
						`iteration ${info.iteration}/${info.maxIterations}` +
							(info.subQueries > 0 ? ` \u00B7 ${info.subQueries} queries` : ""),
					);
					logVerbose(
						`Iteration ${info.iteration}/${info.maxIterations} | ` +
							`Sub-queries: ${info.subQueries} | Phase: ${info.phase}`,
					);
				},
			});

			spinner.stop();
			dashboard.clear();

			const elapsed = (Date.now() - startTime) / 1000;

			// Log the run
			runLog.complete(
				{ completed: result.completed, iterations: result.iterations, answer: result.answer },
				Date.now() - startTime,
			);
			const logPath = runLog.save();

			// Show concise result
			process.stderr.write("\n");
			const status = result.completed ? green("completed") : yellow("incomplete");
			process.stderr.write(
				`  ${status} in ${bold(`${elapsed.toFixed(1)}s`)} ${dim(`(${result.iterations} iterations)`)}\n`,
			);

			// Show answer
			if (result.answer) {
				process.stderr.write("\n");
				const answerLines = result.answer.split("\n");
				for (const line of answerLines) {
					process.stderr.write(`  ${line}\n`);
				}
			}

			if (logPath) {
				process.stderr.write(`  ${dim(`log: ${logPath}`)}\n`);
			}
			process.stderr.write("\n");
		} catch (err) {
			spinner.stop();
			dashboard.clear();

			const errMsg = err instanceof Error ? err.message : String(err);
			runLog.complete({ completed: false, iterations: 0, error: errMsg }, Date.now() - startTime);
			runLog.save();

			if (currentTaskAc?.signal.aborted) {
				logWarn("Task cancelled");
			} else {
				logError(`Task failed: ${errMsg}`);
			}
		} finally {
			sessionAc.signal.removeEventListener("abort", onSessionAbort);
			currentTaskAc = null;
			currentRunLog = null;
		}
	};

	// Process a line of input
	const processLine = async (line: string): Promise<boolean> => {
		const trimmed = line.trim();
		if (!trimmed) return false;

		// Parse commands
		if (trimmed.startsWith("/")) {
			const parts = trimmed.split(/\s+/);
			const cmd = parts[0].toLowerCase();
			const cmdArgs = parts.slice(1);

			switch (cmd) {
				case "/help":
				case "/h":
					cmdHelp();
					break;

				case "/threads":
				case "/t":
					cmdThreads(threadManager);
					break;

				case "/thread":
					cmdThread(threadManager, cmdArgs[0] || "");
					break;

				case "/merge":
				case "/m":
					await cmdMerge(threadManager, args.dir, cmdArgs);
					break;

				case "/reject":
				case "/r":
					await cmdReject(threadManager, cmdArgs[0] || "");
					break;

				case "/dag":
				case "/d":
					cmdDag(threadManager);
					break;

				case "/budget":
				case "/b":
					cmdBudget(threadManager);
					break;

				case "/status":
				case "/s":
					cmdStatus(threadManager, sessionStartTime, taskCount);
					break;

				case "/configure":
				case "/config":
				case "/c":
					await cmdConfigure(config, resolved);
					break;

				case "/quit":
				case "/exit":
				case "/q":
					return true; // Signal exit

				default:
					logWarn(`Unknown command: ${cmd}. Type /help for available commands.`);
					break;
			}

			return false;
		}

		// Not a command — run as a task
		await runTask(trimmed);
		return false;
	};

	// REPL loop — multi-line text input
	const promptStr = `${coral("swarm")}${dim(">")} `;

	while (!cleanupCalled) {
		const result = await readTextInput(promptStr);

		if (result.action === "escape") {
			await cleanup();
			return;
		}

		const text = result.text;
		if (!text) continue;

		try {
			const shouldExit = await processLine(text);
			if (shouldExit) {
				await cleanup();
				return;
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			logError(`Unexpected error: ${msg}`);
		}
	}
}
