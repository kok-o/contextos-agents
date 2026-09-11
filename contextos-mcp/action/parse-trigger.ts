/**
 * Parse trigger — extract task string from GitHub event payloads.
 *
 * Supports:
 *   - issue_comment: "@swarm <task>" in comment body
 *   - workflow_dispatch: task from inputs.task
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface TriggerContext {
	/** The extracted task for swarm to execute. */
	task: string;
	/** The event type that triggered the action. */
	eventType: "issue_comment" | "workflow_dispatch" | "unknown";
	/** Issue or PR number (if applicable). */
	issueNumber?: number;
	/** The user who triggered the action. */
	actor: string;
	/** The comment ID (for issue_comment events). */
	commentId?: number;
	/** The full repo (owner/name). */
	repo: string;
}

// ── Parsing ────────────────────────────────────────────────────────────────

const TRIGGER_PREFIX = /^@swarm\b/i;

/**
 * Extract the task from an issue comment body.
 *
 * Formats supported:
 *   @swarm fix the auth bug in src/auth.ts
 *   @swarm
 *   ```
 *   multi-line task description
 *   with code blocks
 *   ```
 *   @swarm fix typo    (inline, single line)
 */
export function extractTaskFromComment(body: string): string | null {
	const lines = body.split("\n");

	// Find the line containing @swarm
	let triggerLineIdx = -1;
	for (let i = 0; i < lines.length; i++) {
		if (TRIGGER_PREFIX.test(lines[i].trim())) {
			triggerLineIdx = i;
			break;
		}
	}

	if (triggerLineIdx === -1) return null;

	const triggerLine = lines[triggerLineIdx].trim();

	// Extract inline task (everything after @swarm on the same line)
	const inlineTask = triggerLine.replace(TRIGGER_PREFIX, "").trim();

	if (inlineTask) {
		// Check if there's a code block following
		const remaining = lines.slice(triggerLineIdx + 1);
		const codeBlock = extractCodeBlock(remaining);
		if (codeBlock) {
			return `${inlineTask}\n\n${codeBlock}`;
		}
		return inlineTask;
	}

	// No inline task — look for content on subsequent lines
	const remaining = lines.slice(triggerLineIdx + 1);

	// Try code block first
	const codeBlock = extractCodeBlock(remaining);
	if (codeBlock) return codeBlock;

	// Otherwise, collect non-empty lines until a blank line or end
	const taskLines: string[] = [];
	for (const line of remaining) {
		const trimmed = line.trim();
		if (!trimmed && taskLines.length > 0) break; // blank line ends the task
		if (trimmed) taskLines.push(trimmed);
	}

	return taskLines.length > 0 ? taskLines.join("\n") : null;
}

/**
 * Extract a fenced code block from lines.
 * Returns the content between ``` markers, or null.
 */
function extractCodeBlock(lines: string[]): string | null {
	let inBlock = false;
	const blockLines: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!inBlock) {
			if (trimmed.startsWith("```")) {
				inBlock = true;
				continue;
			}
			// Skip empty lines before block
			if (!trimmed) continue;
			// Non-empty, non-block line — no code block here
			return null;
		}
		if (trimmed === "```") {
			// End of block
			return blockLines.join("\n");
		}
		blockLines.push(line);
	}

	// Unclosed block — return what we have
	return blockLines.length > 0 ? blockLines.join("\n") : null;
}

// ── Context extraction ─────────────────────────────────────────────────────

/**
 * Build a TriggerContext from GitHub Actions environment variables
 * and the event payload.
 */
export function parseTrigger(eventPayload: Record<string, unknown>): TriggerContext {
	const eventName = process.env.GITHUB_EVENT_NAME || "unknown";
	const repo = process.env.GITHUB_REPOSITORY || "";
	const actor = process.env.GITHUB_ACTOR || "unknown";

	if (eventName === "issue_comment") {
		const comment = eventPayload.comment as Record<string, unknown> | undefined;
		const issue = eventPayload.issue as Record<string, unknown> | undefined;

		const body = (comment?.body as string) || "";
		const task = extractTaskFromComment(body);

		return {
			task: task || "",
			eventType: "issue_comment",
			issueNumber: (issue?.number as number) || undefined,
			actor: ((comment?.user as Record<string, unknown>)?.login as string) || actor,
			commentId: (comment?.id as number) || undefined,
			repo,
		};
	}

	if (eventName === "workflow_dispatch") {
		const inputs = eventPayload.inputs as Record<string, string> | undefined;
		return {
			task: inputs?.task || "",
			eventType: "workflow_dispatch",
			actor,
			repo,
		};
	}

	return {
		task: "",
		eventType: "unknown",
		actor,
		repo,
	};
}
