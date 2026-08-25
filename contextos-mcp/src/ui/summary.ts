/**
 * End-of-session summary — shows a clean recap of what happened.
 */

import type { BudgetState, ThreadState } from "../core/types.js";
import type { ThreadCacheStats } from "../threads/cache.js";
import { getLogLevel, isJsonMode, logJson, logSeparator } from "./log.js";
import { bold, dim, green, red, symbols, yellow } from "./theme.js";

export interface SessionSummary {
	elapsed: number;
	iterations: number;
	subQueries: number;
	completed: boolean;
	answer: string;
	threads: ThreadState[];
	budget: BudgetState;
	cacheStats?: ThreadCacheStats;
	episodeCount?: number;
}

/** Render the end-of-session summary. */
export function renderSummary(summary: SessionSummary): void {
	if (isJsonMode()) {
		logJson({
			success: summary.completed,
			elapsed_s: summary.elapsed,
			iterations: summary.iterations,
			sub_queries: summary.subQueries,
			threads: {
				total: summary.threads.length,
				completed: summary.threads.filter((t) => t.status === "completed").length,
				failed: summary.threads.filter((t) => t.status === "failed").length,
				cancelled: summary.threads.filter((t) => t.status === "cancelled").length,
			},
			budget: {
				spent_usd: summary.budget.totalSpentUsd,
				limit_usd: summary.budget.sessionLimitUsd,
				actual_cost_threads: summary.budget.actualCostThreads,
				estimated_cost_threads: summary.budget.estimatedCostThreads,
			},
			tokens: summary.budget.totalTokens
				? {
						input: summary.budget.totalTokens.input,
						output: summary.budget.totalTokens.output,
						total: summary.budget.totalTokens.input + summary.budget.totalTokens.output,
					}
				: undefined,
			cache: summary.cacheStats
				? {
						hits: summary.cacheStats.hits,
						misses: summary.cacheStats.misses,
						saved_ms: summary.cacheStats.totalSavedMs,
					}
				: undefined,
			episodes: summary.episodeCount,
			answer: summary.answer,
		});
		return;
	}

	if (getLogLevel() === "quiet") return;

	process.stderr.write("\n");
	logSeparator();

	// Overall status
	const status = summary.completed ? green("completed") : yellow("incomplete");
	const elapsed = `${summary.elapsed.toFixed(1)}s`;
	process.stderr.write(`  ${bold(status)} in ${bold(elapsed)}`);
	process.stderr.write(`  ${dim(symbols.dot)} ${summary.iterations} iterations`);
	process.stderr.write(`  ${dim(symbols.dot)} ${summary.subQueries} sub-queries\n`);

	// Thread breakdown
	if (summary.threads.length > 0) {
		const completed = summary.threads.filter((t) => t.status === "completed").length;
		const failed = summary.threads.filter((t) => t.status === "failed").length;
		const cancelled = summary.threads.filter((t) => t.status === "cancelled").length;

		const parts: string[] = [];
		if (completed > 0) parts.push(green(`${completed} completed`));
		if (failed > 0) parts.push(red(`${failed} failed`));
		if (cancelled > 0) parts.push(yellow(`${cancelled} cancelled`));

		process.stderr.write(`  ${dim("Threads")}  ${parts.join(dim(`  ${symbols.dot}  `))}\n`);

		// Budget with actual vs estimated breakdown
		const spent = summary.budget.totalSpentUsd;
		const limit = summary.budget.sessionLimitUsd;
		const pct = limit > 0 ? ((spent / limit) * 100).toFixed(0) : "0";
		const budgetColor = spent > limit * 0.8 ? yellow : dim;
		const costSource =
			summary.budget.actualCostThreads > 0
				? dim(` (${summary.budget.actualCostThreads} actual, ${summary.budget.estimatedCostThreads} estimated)`)
				: dim(" (estimated)");
		process.stderr.write(
			`  ${dim("Budget")}   ${budgetColor(`$${spent.toFixed(4)} / $${limit.toFixed(2)} (${pct}%)`)}${costSource}\n`,
		);

		// Token usage (if any real usage data)
		const tokens = summary.budget.totalTokens;
		if (tokens && (tokens.input > 0 || tokens.output > 0)) {
			const totalK = ((tokens.input + tokens.output) / 1000).toFixed(1);
			process.stderr.write(
				`  ${dim("Tokens")}   ${dim(`${tokens.input.toLocaleString()} in + ${tokens.output.toLocaleString()} out (${totalK}K total)`)}\n`,
			);
		}

		// Cache stats
		if (summary.cacheStats && (summary.cacheStats.hits > 0 || summary.cacheStats.size > 0)) {
			const c = summary.cacheStats;
			const saved = c.totalSavedMs > 0 ? `, saved ${(c.totalSavedMs / 1000).toFixed(1)}s` : "";
			process.stderr.write(`  ${dim("Cache")}    ${dim(`${c.hits} hits, ${c.misses} misses${saved}`)}\n`);
		}

		// Episodic memory
		if (summary.episodeCount !== undefined && summary.episodeCount > 0) {
			process.stderr.write(`  ${dim("Memory")}   ${dim(`${summary.episodeCount} episodes`)}\n`);
		}

		// Per-thread detail table (if verbose or few threads)
		if (summary.threads.length <= 10 || getLogLevel() === "verbose") {
			process.stderr.write("\n");
			for (const t of summary.threads) {
				const icon =
					t.status === "completed"
						? green(symbols.check)
						: t.status === "failed"
							? red(symbols.cross)
							: yellow(symbols.dash);
				const id = dim(t.id.slice(0, 8));
				const dur =
					t.completedAt && t.startedAt ? dim(`${((t.completedAt - t.startedAt) / 1000).toFixed(1)}s`) : dim("--");
				const task = t.config.task.length > 50 ? `${t.config.task.slice(0, 49)}\u2026` : t.config.task;
				const files = t.result?.filesChanged.length ?? 0;
				const fileStr = files > 0 ? dim(`${files} files`) : "";

				process.stderr.write(`    ${icon} ${id}  ${dur}  ${fileStr}  ${dim(task)}\n`);
			}
		}
	}

	logSeparator();
}
