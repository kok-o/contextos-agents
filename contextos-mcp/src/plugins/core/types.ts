/**
 * ContextOS Plugin Supply Chain Types & Threat Model Definitions
 * ADR-002 Canonical Core
 */

export type PluginSourceType = "github" | "npm";

export interface GitHubSourceSpec {
	type: "github";
	owner: string;
	repo: string;
	commit?: string;
	gitRef?: string;
	subPath?: string;
	raw?: string;
}

export interface NpmSourceSpec {
	type: "npm";
	package: string;
	version?: string;
	integrity?: string;
	raw?: string;
}

export type PluginSourceSpec = GitHubSourceSpec | NpmSourceSpec | { type: string; [key: string]: unknown };

export interface PinningValidationOptions {
	allowFloating?: boolean;
}

export interface PinningValidationResult {
	valid: boolean;
	code?: string;
	error?: string;
}

export type ArchiveEntryType =
	| "file"
	| "directory"
	| "symlink"
	| "hardlink"
	| "socket"
	| "fifo"
	| "characterDevice"
	| "blockDevice";

export interface ArchiveEntryLimits {
	currentCount?: number;
	maxFiles?: number;
	currentTotalBytes?: number;
	maxTotalBytes?: number;
	compressedSize?: number;
	uncompressedSize?: number;
	maxRatio?: number;
	seenPaths?: Set<string>;
	linkTarget?: string;
	entryType?: ArchiveEntryType;
}

export interface ArchiveValidationResult {
	valid: boolean;
	code?: string;
	error?: string;
}

export type TreeEntryType = "file" | "directory" | "symlink";

export interface TreeFileEntry {
	relativePath: string;
	size: number;
	mode: number;
	sha256: string;
	type: TreeEntryType;
}

export interface TreeDigestResult {
	treeDigest: string;
	files: TreeFileEntry[];
}

export interface TreeDigestOptions {
	includeDirectories?: boolean;
}

export interface GrantRecord {
	hash: string;
	grantedAt: number;
	pluginId?: string;
	relPath?: string;
}

export interface AuthorizationResult {
	authorized: boolean;
	reason: string;
}

export interface GrantOptions {
	pluginId?: string;
	relPath?: string;
}

export interface AtomicUpdateOptions {
	expectedOldTreeDigest?: string;
	force?: boolean;
}

export interface AtomicUpdateResult {
	success: boolean;
	treeDigest: string;
}

export const THREAT_CODES = {
	UNKNOWN_SOURCE_TYPE: "CTX_PLUGIN_UNKNOWN_SOURCE_TYPE",
	FLOATING_SOURCE_BLOCKED: "CTX_PLUGIN_FLOATING_SOURCE_BLOCKED",
	IMPLICIT_LATEST_BLOCKED: "CTX_PLUGIN_IMPLICIT_LATEST_BLOCKED",
	MISSING_INTEGRITY: "CTX_PLUGIN_MISSING_INTEGRITY",
	INVALID_PATH: "CTX_ARCHIVE_INVALID_PATH",
	ABSOLUTE_PATH: "CTX_ARCHIVE_ABSOLUTE_PATH",
	PATH_TRAVERSAL: "CTX_ARCHIVE_PATH_TRAVERSAL",
	RESERVED_NAME: "CTX_ARCHIVE_RESERVED_NAME",
	MAX_FILES_EXCEEDED: "CTX_ARCHIVE_MAX_FILES_EXCEEDED",
	MAX_SIZE_EXCEEDED: "CTX_ARCHIVE_MAX_SIZE_EXCEEDED",
	RATIO_EXCEEDED: "CTX_ARCHIVE_RATIO_EXCEEDED",
	CASE_COLLISION: "CTX_ARCHIVE_CASE_COLLISION",
	SYMLINK_ESCAPE: "CTX_ARCHIVE_SYMLINK_ESCAPE",
	SPECIAL_FILE: "CTX_ARCHIVE_SPECIAL_FILE",
	MODIFIED_LOCALLY: "CTX_PLUGIN_MODIFIED_LOCALLY",
} as const;
