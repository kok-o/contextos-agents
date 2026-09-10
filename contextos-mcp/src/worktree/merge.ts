/**
 * Merge thread branches back into the main branch.
 *
 * Phase 2 enhancements:
 *   - Partial merge: continues merging non-conflicting branches after a conflict
 *   - Conflict hunks: captures the actual diff of conflicted files
 *   - Merge ordering: accepts optional order array from orchestrator
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import * as path from "node:path";
import type { MergeResult, ThreadState } from "../core/types.js";
import { assertWithinRepository, SecurityBoundaryException } from "../security/repository-boundary.js";
import { createRepositoryFingerprint } from "./manager.js";

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

/** Abort a merge safely without ever destroying user's uncommitted work tree. */
async function abortMergeSafe(repoRoot: string): Promise<void> {
	try {
		await git(["merge", "--abort"], repoRoot);
	} catch {
		// NEVER run git reset --hard HEAD in repoRoot: it would erase user's uncommitted files.
		// If git merge --abort failed, leave the workspace intact for manual inspection.
	}
}

export interface MergeEligibility {
	eligible: boolean;
	reason?: string;
}

export interface MergeEligibilityOptions {
	currentHeadSha?: string;
	currentDiffSha256?: string;
	repositoryFingerprint?: string;
	isAutoMerge?: boolean;
	userOverride?: boolean;
	isFromRepoConfig?: boolean;
}

/**
 * Strict merge predicate:
 * A thread is eligible for merge if and only if:
 * 1. Status is "completed"
 * 2. Result exists and success is true
 * 3. Scope violation flag is false/absent
 * 4. Automated verification attestation passed ("PASS") with valid proof-of-work evidence
 * 5. Independent review attestation passed ("PASS") with rawOutputDigest and dual PASS verdicts
 * 6. Attestation subjects match each other and bind to exact candidate state (headSha, diffSha256, repositoryFingerprint)
 * 7. Candidate state has not diverged from attestation subjects (otherwise marks attestations STALE)
 */
export function isEligibleForMerge(thread: ThreadState, options?: MergeEligibilityOptions): MergeEligibility {
	if (thread.status !== "completed") {
		return { eligible: false, reason: `Thread status is "${thread.status}", expected "completed"` };
	}
	if (!thread.result?.success) {
		return { eligible: false, reason: "Thread execution result is not successful" };
	}
	if (thread.scopeViolation) {
		return { eligible: false, reason: "Thread touched files outside its assigned writeScope" };
	}

	// 1. Verification Attestation validation
	if (!thread.verificationAttestation) {
		return {
			eligible: false,
			reason: "Missing verification attestation",
		};
	}
	const vAtt = thread.verificationAttestation;

	// Invalidation to STALE if live candidate options provided and mismatched
	if (options?.currentHeadSha && vAtt.subject?.headSha && vAtt.subject.headSha !== options.currentHeadSha) {
		vAtt.status = "STALE";
		if (thread.reviewAttestation) thread.reviewAttestation.status = "STALE";
		thread.verificationStatus = "STALE";
		thread.reviewStatus = "STALE";
		thread.mergeStatus = "BLOCKED";
		return {
			eligible: false,
			reason: `Candidate branch HEAD commit (${options.currentHeadSha}) does not match verification subject headSha (${vAtt.subject.headSha}): attestation is STALE`,
		};
	}
	if (options?.currentDiffSha256 && vAtt.subject?.diffSha256 && vAtt.subject.diffSha256 !== options.currentDiffSha256) {
		vAtt.status = "STALE";
		if (thread.reviewAttestation) thread.reviewAttestation.status = "STALE";
		thread.verificationStatus = "STALE";
		thread.reviewStatus = "STALE";
		thread.mergeStatus = "BLOCKED";
		return {
			eligible: false,
			reason: `Candidate diff hash (${options.currentDiffSha256}) does not match verification subject diffSha256 (${vAtt.subject.diffSha256}): attestation is STALE`,
		};
	}
	if (
		options?.repositoryFingerprint &&
		vAtt.subject?.repositoryFingerprint &&
		vAtt.subject.repositoryFingerprint !== options.repositoryFingerprint
	) {
		return {
			eligible: false,
			reason: `Repository fingerprint mismatch: attestation is for "${vAtt.subject.repositoryFingerprint}", repository is "${options.repositoryFingerprint}"`,
		};
	}

	// Negative status matrix check for verification
	if (vAtt.status !== "PASS") {
		const detail =
			vAtt.status === "NOT_CONFIGURED"
				? "evidence-bearing PASS required"
				: vAtt.status === "STALE"
					? "candidate changed after verification"
					: vAtt.status === "UNAVAILABLE"
						? "verifier service unavailable"
						: vAtt.status === "MALFORMED"
							? "verifier output malformed"
							: vAtt.status;
		return {
			eligible: false,
			reason: `Verification status is not PASS. Status is "${vAtt.status}" (${detail})`,
		};
	}

	// Verification Evidence verification (evidence-bearing PASS)
	if (!vAtt.evidence) {
		return {
			eligible: false,
			reason: "Verification attestation is missing proof-of-work evidence",
		};
	}
	if (vAtt.subject?.headSha && (!vAtt.evidence.outputSha256 || !vAtt.evidence.outputSha256.trim())) {
		return {
			eligible: false,
			reason: "Verification attestation is missing proof-of-work evidence: outputSha256 digest required",
		};
	}

	// Host-unsafe auto-merge governance (Section 19.1 & W5.4)
	if (options?.isAutoMerge && vAtt.runnerMode === "host-unsafe") {
		if (options.userOverride) {
			if (options.isFromRepoConfig) {
				return {
					eligible: false,
					reason:
						"Auto-merge blocked: repository configuration cannot enable host-unsafe auto-merge override. Only user-local safety override is permitted.",
				};
			}
		} else {
			return {
				eligible: false,
				reason:
					"Auto-merge blocked: candidate was verified in host-unsafe mode. Isolated OCI container or explicit user-local safety override required.",
			};
		}
	}

	// 2. Review Attestation validation
	if (!thread.reviewAttestation) {
		return {
			eligible: false,
			reason: "Missing review attestation: rejected by independent reviewer gate",
		};
	}
	const rAtt = thread.reviewAttestation;

	// Invalidation to STALE if live candidate options provided and mismatched
	if (options?.currentHeadSha && rAtt.subject?.headSha && rAtt.subject.headSha !== options.currentHeadSha) {
		rAtt.status = "STALE";
		thread.reviewStatus = "STALE";
		thread.mergeStatus = "BLOCKED";
		return {
			eligible: false,
			reason: `Candidate branch HEAD commit (${options.currentHeadSha}) does not match review subject headSha (${rAtt.subject.headSha}): attestation is STALE`,
		};
	}
	if (options?.currentDiffSha256 && rAtt.subject?.diffSha256 && rAtt.subject.diffSha256 !== options.currentDiffSha256) {
		rAtt.status = "STALE";
		thread.reviewStatus = "STALE";
		thread.mergeStatus = "BLOCKED";
		return {
			eligible: false,
			reason: `Candidate diff hash (${options.currentDiffSha256}) does not match review subject diffSha256 (${rAtt.subject.diffSha256}): attestation is STALE`,
		};
	}

	// Negative status matrix check for review
	if (rAtt.status !== "PASS") {
		const detail =
			rAtt.status === "NOT_CONFIGURED"
				? "evidence-bearing PASS required"
				: rAtt.status === "STALE"
					? "candidate changed after review"
					: rAtt.status === "UNAVAILABLE"
						? "reviewer service unavailable"
						: rAtt.status === "MALFORMED"
							? "reviewer output malformed"
							: rAtt.status;
		return {
			eligible: false,
			reason: `Review status is not PASS. Status is "${rAtt.status}" (${detail})`,
		};
	}

	// Review Evidence verification (rawOutputDigest required)
	if (rAtt.subject?.headSha && (!rAtt.rawOutputDigest || !rAtt.rawOutputDigest.trim())) {
		return {
			eligible: false,
			reason: "Review attestation is missing evidence: rawOutputDigest digest required",
		};
	}

	// Dual-verdict checks
	if (rAtt.llmVerdict?.specCompliance !== "PASS") {
		return {
			eligible: false,
			reason: `Review failed: specCompliance is ${rAtt.llmVerdict?.specCompliance || "MISSING"}. Summary: ${rAtt.llmVerdict?.summary}`,
		};
	}
	if (rAtt.llmVerdict?.codeQuality !== "PASS") {
		return {
			eligible: false,
			reason: `Review failed: codeQuality is ${rAtt.llmVerdict?.codeQuality || "MISSING"}. Summary: ${rAtt.llmVerdict?.summary}`,
		};
	}

	// 3. Subject Completeness and Cross-Attestation Binding
	const vSub = vAtt.subject;
	const rSub = rAtt.subject;
	if (!vSub || !rSub) {
		return { eligible: false, reason: "Missing attestation subject" };
	}

	// Cross-attestation consistency
	if (vSub.headSha && rSub.headSha && vSub.headSha !== rSub.headSha) {
		return {
			eligible: false,
			reason: `Subject headSha mismatch between verification ("${vSub.headSha}") and review ("${rSub.headSha}") attestations`,
		};
	}
	if (vSub.diffSha256 && rSub.diffSha256 && vSub.diffSha256 !== rSub.diffSha256) {
		return {
			eligible: false,
			reason: `Subject diffSha256 mismatch between verification ("${vSub.diffSha256}") and review ("${rSub.diffSha256}") attestations`,
		};
	}
	if (
		vSub.repositoryFingerprint &&
		rSub.repositoryFingerprint &&
		vSub.repositoryFingerprint !== rSub.repositoryFingerprint
	) {
		return {
			eligible: false,
			reason: `Subject repositoryFingerprint mismatch between verification ("${vSub.repositoryFingerprint}") and review ("${rSub.repositoryFingerprint}") attestations`,
		};
	}
	if (vSub.baseSha && rSub.baseSha && vSub.baseSha !== rSub.baseSha) {
		return {
			eligible: false,
			reason: `Subject baseSha mismatch between verification ("${vSub.baseSha}") and review ("${rSub.baseSha}") attestations`,
		};
	}

	return { eligible: true };
}

/**
 * Merge a single thread branch into the current branch.
 * On conflict, captures the conflicted file list and diff hunks before aborting.
 */
export async function mergeThreadBranch(
	repoRoot: string,
	branchName: string,
	threadId: string,
	threadState?: ThreadState,
): Promise<MergeResult> {
	const canonicalRepoRoot = assertWithinRepository(repoRoot, repoRoot);
	if (!branchName || branchName.startsWith("-") || branchName.includes("..") || path.isAbsolute(branchName)) {
		throw new SecurityBoundaryException(`Invalid branch name: ${branchName}`);
	}
	assertWithinRepository(path.resolve(canonicalRepoRoot, ".git", "refs", "heads", branchName), canonicalRepoRoot);

	if (threadState) {
		let currentHeadSha: string | undefined;
		let currentDiffSha256: string | undefined;
		try {
			const { stdout: headOut } = await git(["rev-parse", branchName], canonicalRepoRoot);
			currentHeadSha = headOut.trim();

			const baseSha = threadState.verificationAttestation?.subject?.baseSha || threadState.taskBrief?.baseSha;
			if (baseSha) {
				const { stdout: diffOut } = await git(
					["diff", `${baseSha}...${branchName}`, "--", ":(exclude).contextos-owner", ":(exclude).contextos-session"],
					canonicalRepoRoot,
				);
				currentDiffSha256 = createHash("sha256").update(diffOut).digest("hex");
			}
		} catch {
			// Branch query failure will be surfaced either by predicate or git merge
		}

		const repoFingerprint = createRepositoryFingerprint(canonicalRepoRoot);
		const check = isEligibleForMerge(threadState, {
			currentHeadSha,
			currentDiffSha256,
			repositoryFingerprint: repoFingerprint,
		});
		if (!check.eligible) {
			return {
				success: false,
				branch: branchName,
				conflicts: [],
				conflictDiff: "",
				message: `Merge blocked by strict merge predicate: ${check.reason}`,
			};
		}
	}
	try {
		const { stdout } = await git(
			["merge", "--no-ff", "-m", `swarm: merge thread ${threadId}`, branchName],
			canonicalRepoRoot,
		);
		if (threadState) {
			threadState.mergeStatus = "MERGED";
		}

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
	/** If true, user-local safety override to allow host-unsafe auto-merge. */
	userOverride?: boolean;
	/** If true, indicates the override originated from repo-scoped config (strictly rejected). */
	isFromRepoConfig?: boolean;
	/** Whether this is an auto-merge batch invocation (defaults to false for backwards-compatibility). */
	isAutoMerge?: boolean;
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
	const canonicalRepoRoot = assertWithinRepository(repoRoot, repoRoot);
	const { order, continueOnConflict = true, userOverride, isFromRepoConfig, isAutoMerge } = options;
	const results: MergeResult[] = [];
	// Filter strictly to threads passing isEligibleForMerge with a valid branch
	const eligible = threads.filter(
		(t) =>
			Boolean(t.branchName) &&
			isEligibleForMerge(t, {
				isAutoMerge,
				userOverride,
				isFromRepoConfig,
			}).eligible,
	);

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
		const result = await mergeThreadBranch(canonicalRepoRoot, thread.branchName!, thread.id, thread);
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
