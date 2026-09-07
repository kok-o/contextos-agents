/**
 * ContextOS Direct LLM agent backend.
 *
 * Enhanced version of the original direct-llm provider.
 * Key improvements:
 *   1. Accepts a ContextOS system prompt (project rules/standards)
 *   2. Parses code blocks from LLM responses and writes them to the worktree
 *   3. Builds a coding-oriented prompt that instructs the LLM to produce file edits
 *   4. Reports files changed based on parsed code blocks
 *
 * Uses @mariozechner/pi-ai for unified access to OpenAI, Anthropic, and Gemini.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { AgentProvider, AgentResult, AgentRunOptions } from "../core/types.js";
import { isPathAllowed } from "../security/file-policy.js";
import { containsSecrets, isBlockedPath, redactSecrets } from "../security/secret-filter.js";
import { registerAgent } from "./provider.js";

// ── Code Block Parser ──────────────────────────────────────────────────────

interface ParsedFileBlock {
	filePath: string;
	content: string;
	language: string;
}

/**
 * Parse code blocks from LLM output that include file paths.
 *
 * Supports formats:
 *   ```language:path/to/file.ts
 *   ```language filepath="path/to/file.ts"
 *   <!-- FILE: path/to/file.ts -->
 *   // FILE: path/to/file.ts
 */
function parseCodeBlocks(output: string): ParsedFileBlock[] {
	const blocks: ParsedFileBlock[] = [];
	const codeBlockRegex = /```(\w+)?(?::([^\n]+)|[^\S\n]+filepath="([^"]+)")?\n([\s\S]*?)```/g;

	let match: RegExpExecArray | null;
	while ((match = codeBlockRegex.exec(output)) !== null) {
		const language = match[1] || "";
		const filePath = match[2] || match[3] || "";
		const content = match[4] || "";

		if (filePath && content.trim()) {
			blocks.push({
				filePath: filePath.trim(),
				content: content,
				language,
			});
		}
	}

	// Also try FILE: comment pattern
	const fileCommentRegex = /(?:<!--\s*FILE:\s*(.+?)\s*-->|\/\/\s*FILE:\s*(.+))\n```\w*\n([\s\S]*?)```/g;
	while ((match = fileCommentRegex.exec(output)) !== null) {
		const filePath = (match[1] || match[2] || "").trim();
		const content = match[3] || "";

		if (filePath && content.trim()) {
			// Avoid duplicates
			if (!blocks.some((b) => b.filePath === filePath)) {
				blocks.push({ filePath, content, language: "" });
			}
		}
	}

	return blocks;
}

/**
 * Write parsed code blocks to the worktree directory.
 * Creates directories as needed. Returns list of written file paths.
 */
function writeCodeBlocks(workDir: string, blocks: ParsedFileBlock[]): string[] {
	const written: string[] = [];

	for (const block of blocks) {
		// Security: prevent path traversal and blocked/forbidden paths
		const normalized = path.normalize(block.filePath);
		if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
			process.stderr.write(`[contextos-agent] Skipping unsafe path (traversal): ${block.filePath}\n`);
			continue;
		}

		if (isBlockedPath(normalized) || !isPathAllowed(normalized, workDir)) {
			process.stderr.write(`[contextos-agent] Skipping forbidden/policy-blocked path: ${block.filePath}\n`);
			continue;
		}

		const fullPath = path.join(workDir, normalized);

		// Ensure parent directory exists
		const dir = path.dirname(fullPath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}

		writeFileSync(fullPath, block.content, "utf-8");
		written.push(normalized);
		process.stderr.write(`[contextos-agent] Wrote: ${normalized}\n`);
	}

	return written;
}

// ── Prompt Builder ─────────────────────────────────────────────────────────

/**
 * Build a coding-oriented prompt that tells the LLM to produce file edits
 * in a parseable format.
 */
function buildCodingPrompt(task: string, workDir: string, files?: string[], contextosPrompt?: string): string {
	const sections: string[] = [];

	// ContextOS project standards (if provided)
	if (contextosPrompt) {
		sections.push(contextosPrompt);
	}

	// Coding instructions
	sections.push(`
## Your Task

You are a coding agent. Your job is to implement the following task by writing code.

**Task**: ${task}

## Output Format

For EVERY file you create or modify, output it in this exact format:

\`\`\`language:path/to/file.ts
// file contents here
\`\`\`

The path must be relative to the project root. Include the COMPLETE file contents.
Do NOT use placeholders like "// ... rest of the code". Write the full file.

## Important Rules
- Write production-quality code
- Include proper error handling
- Follow existing code style and patterns in the project
- Do not modify files that are not related to the task
`);

	// Include existing file contents for context
	if (files && files.length > 0) {
		sections.push("\n## Existing Files (for context)\n");
		for (const file of files.slice(0, 10)) {
			// Cap at 10 files
			if (!isPathAllowed(file, workDir) || isBlockedPath(file)) {
				process.stderr.write(`[direct-llm] Skipping blocked or out-of-boundary file: ${file}\n`);
				continue;
			}
			const fullPath = path.resolve(workDir, file);
			if (existsSync(fullPath)) {
				try {
					const rawContent = readFileSync(fullPath, "utf-8");
					if (containsSecrets(rawContent)) {
						process.stderr.write(`[direct-llm] Redacting detected secrets in: ${file}\n`);
					}
					const content = redactSecrets(rawContent);
					// Cap per-file content at 3000 chars
					const truncated = content.length > 3000 ? `${content.slice(0, 3000)}\n// ... [truncated]` : content;
					sections.push(`### ${file}\n\`\`\`\n${truncated}\n\`\`\`\n`);
				} catch {
					// Skip unreadable files
				}
			}
		}
	}

	return sections.join("\n");
}

// ── Provider ───────────────────────────────────────────────────────────────

/**
 * Extended run options that include ContextOS system prompt.
 */
export interface ContextosAgentRunOptions extends AgentRunOptions {
	/** ContextOS system prompt assembled from .agents/ rules and skills. */
	contextosPrompt?: string;
}

const contextosDirectLlm: AgentProvider = {
	name: "direct-llm",

	async isAvailable(): Promise<boolean> {
		return !!(
			process.env.ANTHROPIC_API_KEY ||
			process.env.OPENAI_API_KEY ||
			process.env.GEMINI_API_KEY ||
			process.env.OPENROUTER_API_KEY
		);
	},

	async run(options: AgentRunOptions): Promise<AgentResult> {
		const startTime = Date.now();
		const extOptions = options as ContextosAgentRunOptions;

		try {
			const { completeSimple, getModels, getProviders } = await import("@mariozechner/pi-ai");
			const modelId =
				options.model || process.env.CONTEXTOS_DEFAULT_MODEL || process.env.RLM_MODEL || "claude-sonnet-4-6";

			// Find model
			let model;
			for (const provider of getProviders()) {
				for (const m of getModels(provider)) {
					if (m.id === modelId) {
						model = m;
						break;
					}
				}
				if (model) break;
			}

			if (!model) {
				return {
					success: false,
					output: "",
					filesChanged: [],
					diff: "",
					durationMs: Date.now() - startTime,
					error: `Model "${modelId}" not found. Available models depend on your API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY).`,
				};
			}

			// Build the coding prompt with ContextOS rules
			const codingPrompt = buildCodingPrompt(options.task, options.workDir, options.files, extOptions.contextosPrompt);

			// Abort-aware LLM call — race against cancellation signal to stop
			// spending money on abandoned requests (P1.9 fix)
			const llmPromise = completeSimple(model, {
				systemPrompt:
					"You are an expert coding agent. You write complete, production-ready code. Follow all project standards provided to you.",
				messages: [
					{
						role: "user" as const,
						content: codingPrompt,
						timestamp: Date.now(),
					},
				],
			});

			let response;
			const { signal } = options;
			if (signal) {
				const abortPromise = new Promise<never>((_, reject) => {
					if (signal.aborted) {
						reject(new DOMException("LLM request aborted", "AbortError"));
						return;
					}
					signal.addEventListener(
						"abort",
						() => {
							reject(new DOMException("LLM request aborted", "AbortError"));
						},
						{ once: true },
					);
				});
				response = await Promise.race([llmPromise, abortPromise]);
			} else {
				response = await llmPromise;
			}

			const output = response.content
				.filter((b): b is { type: "text"; text: string } => b.type === "text")
				.map((b) => b.text)
				.join("\n");

			// Parse code blocks and write to worktree
			const codeBlocks = parseCodeBlocks(output);
			let filesChanged: string[] = [];

			if (codeBlocks.length > 0 && options.workDir) {
				filesChanged = writeCodeBlocks(options.workDir, codeBlocks);
				process.stderr.write(
					`[contextos-agent] Parsed ${codeBlocks.length} code blocks, wrote ${filesChanged.length} files\n`,
				);
			} else {
				process.stderr.write(`[contextos-agent] No code blocks found in LLM response (${output.length} chars)\n`);
			}

			return {
				success: true,
				output,
				filesChanged,
				diff: "", // Will be captured by WorktreeManager.getDiff()
				durationMs: Date.now() - startTime,
			};
		} catch (err) {
			return {
				success: false,
				output: "",
				filesChanged: [],
				diff: "",
				durationMs: Date.now() - startTime,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	},
};

registerAgent(contextosDirectLlm);
export default contextosDirectLlm;
