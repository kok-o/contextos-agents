import path from "node:path";
import { z } from "zod";

const version = z.literal(1);
const threadId = z
	.string()
	.min(1)
	.max(200)
	.regex(/^[A-Za-z0-9._:-]+$/);
const repositoryRelativePath = z
	.string()
	.min(1)
	.max(1024)
	.refine((value) => !value.includes("\0"), "Path cannot contain null bytes")
	.refine((value) => !path.posix.isAbsolute(value) && !path.win32.isAbsolute(value), "Path must be relative")
	.refine(
		(value) => !value.replaceAll("\\", "/").split("/").includes(".."),
		"Path cannot traverse outside the repository",
	);

export const SpawnActionSchema = z
	.object({
		version,
		action: z.literal("spawn"),
		task: z.string().min(1).max(20_000),
		writeScope: z.array(repositoryRelativePath).min(1).max(200),
		focusFiles: z.array(repositoryRelativePath).max(200).optional(),
		allowRepositoryWide: z.boolean().optional(),
		model: z.string().min(1).max(200).optional(),
	})
	.strict()
	.refine((data) => {
		if (data.writeScope.includes(".")) {
			return data.allowRepositoryWide === true;
		}
		return true;
	}, "Repository-wide write scope ('.') requires allowRepositoryWide to be true");

export const WaitActionSchema = z
	.object({
		version,
		action: z.literal("wait"),
		threadIds: z.array(threadId).min(1).max(100),
	})
	.strict();

export const InspectDiffActionSchema = z
	.object({
		version,
		action: z.literal("inspect_diff"),
		threadId,
	})
	.strict();

export const ReviewActionSchema = z
	.object({
		version,
		action: z.literal("review"),
		threadId,
	})
	.strict();

export const MergeActionSchema = z
	.object({
		version,
		action: z.literal("merge"),
		threadId,
	})
	.strict();

export const FinishActionSchema = z
	.object({
		version,
		action: z.literal("finish"),
		summary: z.string().min(1).max(100_000),
	})
	.strict();

export const ActionSchema = z.discriminatedUnion("action", [
	SpawnActionSchema,
	WaitActionSchema,
	InspectDiffActionSchema,
	ReviewActionSchema,
	MergeActionSchema,
	FinishActionSchema,
]);

export type SpawnAction = z.infer<typeof SpawnActionSchema>;
export type WaitAction = z.infer<typeof WaitActionSchema>;
export type InspectDiffAction = z.infer<typeof InspectDiffActionSchema>;
export type ReviewAction = z.infer<typeof ReviewActionSchema>;
export type MergeAction = z.infer<typeof MergeActionSchema>;
export type FinishAction = z.infer<typeof FinishActionSchema>;
export type Action = z.infer<typeof ActionSchema>;

export function parseAction(input: unknown): Action {
	const result = ActionSchema.safeParse(input);
	if (!result.success) {
		const details = result.error.issues
			.map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
			.join("; ");
		throw new Error(`Invalid action payload: ${details}`);
	}
	return result.data;
}
