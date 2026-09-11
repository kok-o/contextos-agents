/**
 * Security validation for the swarm GitHub Action.
 *
 * Ensures actions only run for trusted users on non-fork repos.
 * Mitigates:
 *   - Unauthorized usage (only OWNER/MEMBER/COLLABORATOR)
 *   - Fork-based attacks (reject fork PRs and fork issue comments)
 *   - Budget enforcement (hard cap on spending)
 */

import { execFileSync } from "node:child_process";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SecurityResult {
	allowed: boolean;
	reason: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * Author associations considered trusted.
 * See: https://docs.github.com/en/graphql/reference/enums#commentauthorassociation
 */
const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/** Maximum budget cap (USD) to prevent runaway costs. */
const MAX_BUDGET_HARD_CAP = 50.0;

/** Default budget if not specified. */
const DEFAULT_BUDGET = 5.0;

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate whether the trigger should be allowed to execute.
 */
export function validateTrigger(eventPayload: Record<string, unknown>): SecurityResult {
	const eventName = process.env.GITHUB_EVENT_NAME || "unknown";

	// Only allow known event types
	if (eventName !== "issue_comment" && eventName !== "workflow_dispatch") {
		return {
			allowed: false,
			reason: `Unsupported event type: ${eventName}. Only issue_comment and workflow_dispatch are supported.`,
		};
	}

	// workflow_dispatch is inherently trusted (requires write access to trigger)
	if (eventName === "workflow_dispatch") {
		return { allowed: true, reason: "workflow_dispatch is trusted" };
	}

	// For issue_comment events, validate the comment author
	const comment = eventPayload.comment as Record<string, unknown> | undefined;
	if (!comment) {
		return {
			allowed: false,
			reason: "No comment payload found in issue_comment event.",
		};
	}

	// Check author association
	const authorAssociation = (comment.author_association as string) || "NONE";
	if (!TRUSTED_ASSOCIATIONS.has(authorAssociation)) {
		const user = (comment.user as Record<string, unknown>)?.login || "unknown";
		return {
			allowed: false,
			reason: `User "${user}" has association "${authorAssociation}" — only ${[...TRUSTED_ASSOCIATIONS].join(", ")} are allowed.`,
		};
	}

	// Check if the comment is on a fork PR.
	// The issue_comment event payload has a simplified pull_request field (just URLs),
	// so we use `gh pr view` to get the actual fork status.
	const issue = eventPayload.issue as Record<string, unknown> | undefined;
	if (issue?.pull_request) {
		const prNumber = issue.number as number;
		if (prNumber && isForkPr(prNumber)) {
			return {
				allowed: false,
				reason: `PR #${prNumber} is from a fork. Swarm will not run on fork PRs to prevent secret exposure.`,
			};
		}
	}

	return { allowed: true, reason: "Trusted author" };
}

/**
 * Sanitize and cap the budget value.
 * Returns a safe budget value within limits.
 */
export function sanitizeBudget(rawBudget: string | number | undefined): number {
	if (rawBudget === undefined || rawBudget === "") return DEFAULT_BUDGET;

	const parsed = typeof rawBudget === "number" ? rawBudget : parseFloat(String(rawBudget));

	if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BUDGET;
	if (parsed > MAX_BUDGET_HARD_CAP) return MAX_BUDGET_HARD_CAP;

	return parsed;
}

// ── Fork detection ─────────────────────────────────────────────────────────

/**
 * Check if a PR is from a fork using the gh CLI.
 * The issue_comment event payload only has simplified PR URLs,
 * so we need to query the full PR data.
 */
function isForkPr(prNumber: number): boolean {
	try {
		const result = execFileSync(
			"gh",
			["pr", "view", String(prNumber), "--json", "isCrossRepository", "--jq", ".isCrossRepository"],
			{ encoding: "utf-8", timeout: 10000 },
		).trim();

		return result === "true";
	} catch {
		// If we can't determine fork status, err on the side of caution
		return true;
	}
}
