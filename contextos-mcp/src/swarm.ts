/**
 * Swarm mode — orchestrates coding agents in parallel via the RLM loop.
 *
 * Usage: swarm --dir ./my-project "add error handling to all API routes"
 *
 * This module:
 *   1. Parses swarm-specific CLI args
 *   2. Scans the target directory to build a codebase context
 *   3. Sets up ThreadManager + WorktreeManager
 *   4. Runs the RLM loop with the swarm orchestrator prompt
 *   5. Cleans up worktrees on exit
 */

import "./env.js";
import * as fs from "node:fs";
import * as path from "node:path";

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
// Api/Model types used via resolveModel from model-resolver
import { loadHooks, runHooks } from "./hooks/runner.js";
import { EpisodicMemory } from "./memory/episodic.js";
import { buildSwarmSystemPrompt } from "./prompts/orchestrator.js";
import { resolveModel } from "./routing/model-resolver.js";
import { classifyTaskComplexity, describeAvailableAgents, FailureTracker, routeTask } from "./routing/model-router.js";
import { ThreadManager, type ThreadProgressCallback } from "./threads/manager.js";
import { renderBanner } from "./ui/banner.js";
import { ThreadDashboard } from "./ui/dashboard.js";
import {
	isJsonMode,
	logAnswer,
	logError,
	logRouter,
	logSuccess,
	logVerbose,
	logWarn,
	setJsonMode,
	setLogLevel,
} from "./ui/log.js";
import { runOnboarding } from "./ui/onboarding.js";
// UI system
import { Spinner } from "./ui/spinner.js";
import { StreamingFeed } from "./ui/streaming-feed.js";
import { renderSummary, type SessionSummary } from "./ui/summary.js";
import { type MergeAllOptions, mergeAllThreads } from "./worktree/merge.js";

// ── Arg parsing ─────────────────────────────────────────────────────────────

interface SwarmArgs {
	dir: string;
	orchestratorModel: string;
	agent: string;
	dryRun: boolean;
	maxBudget: number | null;
	verbose: boolean;
	quiet: boolean;
	json: boolean;
	autoRoute: boolean;
	query: string;
}

function parseSwarmArgs(args: string[]): SwarmArgs {
	let dir = "";
	let orchestratorModel = "";
	let agent = "";
	let dryRun = false;
	let maxBudget: number | null = null;
	let verbose = false;
	let quiet = false;
	let json = false;
	let autoRoute = false;
	const positional: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--help" || arg === "-h") {
			process.stderr.write(`\nUsage: swarm --dir <path> [options] "your task"\n\n`);
			process.stderr.write(`Options:\n`);
			process.stderr.write(`  --dir <path>           Target repository directory\n`);
			process.stderr.write(`  --orchestrator <model> Orchestrator LLM model\n`);
			process.stderr.write(`  --agent <backend>      Agent backend (opencode, claude, codex, aider)\n`);
			process.stderr.write(`  --dry-run              Plan only, don't spawn threads\n`);
			process.stderr.write(`  --max-budget <usd>     Maximum session budget\n`);
			process.stderr.write(`  --auto-route           Enable automatic model selection\n`);
			process.stderr.write(`  --verbose              Detailed progress output\n`);
			process.stderr.write(`  --quiet / -q           Suppress non-essential output\n`);
			process.stderr.write(`  --json                 Machine-readable JSON output\n\n`);
			process.exit(0);
		} else if (arg === "--dir" && i + 1 < args.length) {
			dir = args[++i];
		} else if (arg === "--orchestrator" && i + 1 < args.length) {
			orchestratorModel = args[++i];
		} else if (arg === "--agent" && i + 1 < args.length) {
			agent = args[++i];
		} else if (arg === "--dry-run") {
			dryRun = true;
		} else if (arg === "--max-budget" && i + 1 < args.length) {
			const rawBudget = args[++i];
			const parsed = parseFloat(rawBudget);
			if (Number.isFinite(parsed) && parsed > 0) {
				maxBudget = parsed;
			} else {
				logWarn(`Invalid --max-budget value "${rawBudget}", ignoring`);
			}
		} else if (arg === "--verbose") {
			verbose = true;
		} else if (arg === "--quiet" || arg === "-q") {
			quiet = true;
		} else if (arg === "--json") {
			json = true;
		} else if (arg === "--auto-route") {
			autoRoute = true;
		} else if (arg.startsWith("--")) {
			logWarn(`Unknown flag: ${arg}`);
		} else {
			positional.push(arg);
		}
	}

	if (!dir) {
		logError("--dir <path> is required for swarm mode", 'Usage: swarm --dir ./project "your task"');
		process.exit(1);
	}

	if (positional.length === 0) {
		logError("Query argument is required", 'Usage: swarm --dir ./project "your task description"');
		process.exit(1);
	}

	return {
		dir: path.resolve(dir),
		orchestratorModel: orchestratorModel || process.env.RLM_MODEL || "claude-sonnet-4-6",
		agent: agent || "",
		dryRun,
		maxBudget,
		autoRoute,
		verbose,
		quiet,
		json,
		query: positional.join(" "),
	};
}

// ── Codebase scanning ───────────────────────────────────────────────────────

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

// ── Main ────────────────────────────────────────────────────────────────────

export async function runSwarmMode(rawArgs: string[]): Promise<void> {
	const args = parseSwarmArgs(rawArgs);
	const config = loadConfig();
	const hooks = loadHooks(args.dir);

	// Configure UI
	if (args.json) setJsonMode(true);
	if (args.quiet) setLogLevel("quiet");
	else if (args.verbose) setLogLevel("verbose");

	// Verify target directory before anything else
	if (!fs.existsSync(args.dir)) {
		logError(`Directory "${args.dir}" does not exist`);
		process.exit(1);
	}

	// First-run onboarding (after dir validation so we don't waste user's time)
	await runOnboarding();

	// Override config with CLI args
	if (args.agent) config.default_agent = args.agent;
	if (args.maxBudget !== null) config.max_session_budget_usd = args.maxBudget;
	if (args.autoRoute) config.auto_model_selection = true;

	// Resolve orchestrator model — prefer CLI arg, then config's default_model
	const orchestratorModelId =
		args.orchestratorModel !== "claude-sonnet-4-6"
			? args.orchestratorModel
			: config.default_model || args.orchestratorModel;
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

	// Initialize episodic memory if enabled
	let episodicMemory: EpisodicMemory | undefined;
	if (config.episodic_memory_enabled) {
		episodicMemory = new EpisodicMemory(config.memory_dir);
		await episodicMemory.init();
	}

	// Initialize failure tracker for session-level agent failure tracking
	const failureTracker = new FailureTracker();

	// Render banner
	renderBanner({
		dir: args.dir,
		model: resolved.model.id,
		provider: resolved.provider,
		agent: config.default_agent,
		routing: config.auto_model_selection ? "auto" : "orchestrator-driven",
		query: args.query,
		dryRun: args.dryRun,
		memorySize: episodicMemory?.size,
	});

	// Scan codebase with spinner
	const spinner = new Spinner();
	spinner.start("scanning codebase");
	const context = scanDirectory(args.dir);
	spinner.stop();
	logSuccess(`Scanned codebase — ${(context.length / 1024).toFixed(1)}KB context`);

	// Start REPL
	const repl = new PythonRepl();
	const ac = new AbortController();

	// Thread dashboard and streaming feed for live status
	const dashboard = new ThreadDashboard();
	const streamingFeed = new StreamingFeed();
	spinner.setDashboard(dashboard);
	spinner.setStreamingFeed(streamingFeed);

	// Progress callback for thread events
	const threadProgress: ThreadProgressCallback = (threadId, phase, detail) => {
		if (phase === "completed" || phase === "failed" || phase === "cancelled") {
			dashboard.complete(threadId, phase, detail);
			streamingFeed.completeThread(threadId, phase, detail);
		} else {
			dashboard.update(threadId, phase, detail);
			streamingFeed.updateThread(threadId, phase, detail);
		}
	};

	// Enable OpenCode server mode for persistent connections (reduces cold-start)
	if (config.default_agent === "opencode" && config.opencode_server_mode) {
		opencodeMod.enableServerMode();
		logVerbose("OpenCode server mode enabled");
	}

	// Initialize thread manager
	const threadManager = new ThreadManager(args.dir, config, threadProgress, ac.signal);
	threadManager.setThreadOutputCallback((threadId, chunk) => {
		streamingFeed.appendOutput(threadId, chunk);
	});
	await threadManager.init();

	if (episodicMemory) {
		threadManager.setEpisodicMemory(episodicMemory);
	}

	const abortAndExit = () => {
		spinner.stop();
		dashboard.clear();
		logWarn("Aborting...");
		ac.abort();
	};
	process.on("SIGINT", abortAndExit);
	process.on("SIGTERM", abortAndExit);

	try {
		await repl.start(ac.signal);

		// Register LLM summarizer for llm-summary compression strategy
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
		if (args.dryRun) {
			systemPrompt +=
				"\n\n## DRY RUN MODE\nDo NOT call thread() or async_thread(). Instead, describe what threads you WOULD spawn (task, files, model). Call FINAL() with your execution plan.";
		}

		// Add episodic memory hints
		if (episodicMemory && episodicMemory.size > 0) {
			const hints = episodicMemory.getStrategyHints(args.query);
			if (hints) {
				systemPrompt += `\n\n## Episodic Memory\n${hints}\nConsider these strategies when decomposing your task.`;
			}
		}

		// Thread handler
		const threadHandler = async (
			task: string,
			threadContext: string,
			agentBackend: string,
			model: string,
			files: string[],
		) => {
			// Context-size guard: warn and truncate if orchestrator sends too much context
			const MAX_THREAD_CONTEXT = 50_000;
			if (threadContext.length > MAX_THREAD_CONTEXT) {
				logWarn(
					`Thread context too large (${(threadContext.length / 1024).toFixed(0)}KB) — truncating to ${MAX_THREAD_CONTEXT / 1000}KB. Agents have full worktree access; pass only relevant excerpts.`,
				);
				threadContext = `${threadContext.slice(0, MAX_THREAD_CONTEXT)}\n\n[... truncated — ${threadContext.length - MAX_THREAD_CONTEXT} chars removed ...]`;
			}

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

			// Update dashboard and streaming feed with task info
			dashboard.update(threadId, "queued", undefined, {
				task,
				agent: resolvedAgent,
				model: resolvedModel,
			});
			streamingFeed.updateThread(threadId, "queued", undefined, {
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

			// Run post-thread hooks (typecheck, lint, etc.) — success is silent, only errors surface
			if (result.success && hooks.post_thread.length > 0) {
				try {
					const worktreePath = path.join(args.dir, config.worktree_base_dir, `wt-${threadId}`);
					if (fs.existsSync(worktreePath)) {
						runHooks(hooks.post_thread, worktreePath, "post_thread");
					}
				} catch (hookErr: any) {
					logWarn(`Post-thread hook failed: ${hookErr.message}`);
				}
			}

			// Track failure in the failure tracker for routing adjustments
			if (!result.success) {
				failureTracker.recordFailure(resolvedAgent, resolvedModel, task, result.summary || "unknown error");
			}

			// Record episode
			if (episodicMemory && result.success && routeSlot) {
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

			const summary = results
				.map((r) => (r.success ? `Merged ${r.branch}: ${r.message}` : `FAILED ${r.branch}: ${r.message}`))
				.join("\n");

			// Run post-merge hooks (tests, etc.) — success is silent
			if (merged > 0 && hooks.post_merge.length > 0) {
				try {
					const hookResults = runHooks(hooks.post_merge, args.dir, "post_merge");
					const hookFailures = hookResults.filter((r) => !r.success);
					if (hookFailures.length > 0) {
						const hookOutput = hookFailures.map((r) => r.output).join("\n");
						return {
							result: `${summary}\n\nPost-merge verification failed:\n${hookOutput}`,
							success: false,
						};
					}
				} catch (hookErr: any) {
					return {
						result: `${summary}\n\nPost-merge hook blocked: ${hookErr.message}`,
						success: false,
					};
				}
			}

			return {
				result: summary || "No threads to merge",
				success: results.every((r) => r.success),
			};
		};

		// Run the orchestrator
		spinner.start();
		const startTime = Date.now();

		const result = await runRlmLoop({
			context,
			query: args.query,
			model: resolved.model,
			repl,
			signal: ac.signal,
			systemPrompt,
			threadHandler: args.dryRun ? undefined : threadHandler,
			mergeHandler: args.dryRun ? undefined : mergeHandler,
			onProgress: (info) => {
				spinner.update(
					`iteration ${info.iteration}/${info.maxIterations}` +
						(info.subQueries > 0 ? ` · ${info.subQueries} queries` : ""),
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

		// Render summary
		const summary: SessionSummary = {
			elapsed,
			iterations: result.iterations,
			subQueries: result.totalSubQueries,
			completed: result.completed,
			answer: result.answer,
			threads: threadManager.getThreads(),
			budget: threadManager.getBudgetState(),
			cacheStats: threadManager.getCacheStats(),
			episodeCount: episodicMemory?.size,
		};

		renderSummary(summary);

		// Output the answer
		if (isJsonMode()) {
			// Already output via renderSummary
		} else {
			process.stderr.write("\n");
			logAnswer(result.answer);
		}
	} finally {
		spinner.stop();
		dashboard.clear();
		streamingFeed.clear();
		process.removeListener("SIGINT", abortAndExit);
		process.removeListener("SIGTERM", abortAndExit);
		repl.shutdown();
		await threadManager.cleanup();
		// Shut down any managed OpenCode server instances
		await opencodeMod.disableServerMode();
	}
}
