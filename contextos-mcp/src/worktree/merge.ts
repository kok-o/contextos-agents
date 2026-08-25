/**
 * Merge thread branches back into the main branch.
 *
 * Phase 2 enhancements:
 *   - Partial merge: continues merging non-conflicting branches after a conflict
 *   - Conflict hunks: captures the actual diff of conflicted files
 *   - Merge ordering: accepts optional order array from orchestrator
 */

import { execFile } from "node:child_process";
import type { MergeResult, ThreadState } from "../core/types.js";

function git(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		execFile("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
			if (err) {
				// Include stdout in error message — git merge writes CONFLICT info to stdout
				const detail = [stderr, stdout].filter((s) => s?.trim()).join("\n") || err.message;
				reject(new Error(`git ${args[0]} failed: ${detail}`));
			} else {
				resolve({ stdout, stderr });
			}
		});
	});
}

/** Abort a merge safely, falling back to hard reset if --abort fails. */
async function abortMergeSafe(repoRoot: string): Promise<void> {
	try {
		await git(["merge", "--abort"], repoRoot);
	} catch {
		try {
			await git(["reset", "--hard", "HEAD"], repoRoot);
		} catch {
			/* last resort failed — repo may be in bad state */
		}
	}
}

/**
 * Merge a single thread branch into the current branch.
 * On conflict, captures the conflicted file list and diff hunks before aborting.
 */
export async function mergeThreadBranch(repoRoot: string, branchName: string, threadId: string): Promise<MergeResult> {
	try {
		const { stdout } = await git(["merge", "--no-ff", "-m", `swarm: merge thread ${threadId}`, branchName], repoRoot);

		return {
			success: true,
			branch: branchName,
			conflicts: [],
			conflictDiff: "",
			message: stdout.trim() || `Merged ${branchName}`,
		};
	} catch (err) {
		const errMsg = String(err);

		// Check for merge conflicts
		if (errMsg.includes("CONFLICT") || errMsg.includes("Merge conflict")) {
			try {
				// Get list of conflicted files
				const { stdout: conflicted } = await git(["diff", "--name-only", "--diff-filter=U"], repoRoot);
				const conflicts = conflicted.trim().split("\n").filter(Boolean);

				// Capture the conflict diff (shows <<<<<<< markers)
				let conflictDiff = "";
				try {
					const { stdout: diff } = await git(["diff"], repoRoot);
					conflictDiff = diff.slice(0, 5000); // Cap at 5KB
				} catch {
					// diff might fail in weird states
				}

				// Abort the merge to restore clean state
				await abortMergeSafe(repoRoot);

				return {
					success: false,
					branch: branchName,
					conflicts,
					conflictDiff,
					message: `Merge conflicts in: ${conflicts.join(", ")}`,
				};
			} catch {
				await abortMergeSafe(repoRoot);
				return {
					success: false,
					branch: branchName,
					conflicts: [],
					conflictDiff: "",
					message: errMsg,
				};
			}
		}

		return {
			success: false,
			branch: branchName,
			conflicts: [],
			conflictDiff: "",
			message: errMsg,
		};
	}
}

export interface MergeAllOptions {
	/** Explicit merge order — thread IDs in desired merge sequence. */
	order?: string[];
	/** If true, continue merging remaining branches after a conflict (default: true). */
	continueOnConflict?: boolean;
}

/**
 * Merge all completed thread branches sequentially.
 *
 * Supports:
 *   - Custom merge order via options.order
 *   - Partial merge: by default continues past conflicts (skips conflicting branch)
 */
export async function mergeAllThreads(
	repoRoot: string,
	threads: ThreadState[],
	options: MergeAllOptions = {},
): Promise<MergeResult[]> {
	const { order, continueOnConflict = true } = options;
	const results: MergeResult[] = [];

	// Filter to completed+successful threads with branches
	const eligible = threads.filter((t) => t.status === "completed" && t.branchName && t.result?.success);

	// Apply ordering if specified
	let ordered: ThreadState[];
	if (order && order.length > 0) {
		const orderMap = new Map(order.map((id, idx) => [id, idx]));
		ordered = [...eligible].sort((a, b) => {
			const aIdx = orderMap.get(a.id) ?? Infinity;
			const bIdx = orderMap.get(b.id) ?? Infinity;
			return aIdx - bIdx;
		});
	} else {
		// Default: merge in completion order (earliest first)
		ordered = [...eligible].sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));
	}

	for (const thread of ordered) {
		const result = await mergeThreadBranch(repoRoot, thread.branchName!, thread.id);
		results.push(result);

		if (!result.success && !continueOnConflict) {
			// Stop on first conflict (legacy behavior)
			break;
		}
		// If conflict but continueOnConflict is true, we skip this branch
		// and proceed to the next. The merge was already aborted in mergeThreadBranch.
	}

	return results;
}
