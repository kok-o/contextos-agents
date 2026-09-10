/**
 * ContextOS Safe Archive Extraction Scanner
 * Section 20.4 & Threat Model Hardening
 */

import * as path from "node:path";
import { type ArchiveEntryLimits, type ArchiveValidationResult, THREAT_CODES } from "./types.js";

const WINDOWS_RESERVED_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

/**
 * Validates an individual archive entry path and metadata against security vulnerabilities.
 */
export function validateArchiveEntry(entryPath: string, limits: ArchiveEntryLimits = {}): ArchiveValidationResult {
	if (typeof entryPath !== "string" || !entryPath.trim()) {
		return {
			valid: false,
			code: THREAT_CODES.INVALID_PATH,
			error: "Empty or non-string archive path",
		};
	}

	const normalized = entryPath.replace(/\\/g, "/").replace(/^\.\//, "");

	// 1. Absolute path check
	if (
		path.isAbsolute(entryPath) ||
		/^[a-zA-Z]:[\\/]/.test(entryPath) ||
		/^[a-zA-Z]:/.test(normalized) ||
		normalized.startsWith("/")
	) {
		return {
			valid: false,
			code: THREAT_CODES.ABSOLUTE_PATH,
			error: `Security violation: absolute archive path rejected: "${entryPath}"`,
		};
	}

	// 2. Directory traversal check
	const parts = normalized.split("/");
	if (parts.includes("..") || normalized.startsWith("../") || normalized.includes("/../")) {
		return {
			valid: false,
			code: THREAT_CODES.PATH_TRAVERSAL,
			error: `Security violation: archive path attempts traversal outside destination: "${entryPath}"`,
		};
	}

	// 3. Windows reserved device names
	for (const part of parts) {
		if (WINDOWS_RESERVED_NAMES.test(part)) {
			return {
				valid: false,
				code: THREAT_CODES.RESERVED_NAME,
				error: `Security violation: Windows reserved device name rejected: "${part}" in "${entryPath}"`,
			};
		}
	}

	// 4. Special files (devices, sockets, fifos)
	if (
		limits.entryType === "socket" ||
		limits.entryType === "fifo" ||
		limits.entryType === "characterDevice" ||
		limits.entryType === "blockDevice"
	) {
		return {
			valid: false,
			code: THREAT_CODES.SPECIAL_FILE,
			error: `Security violation: special device or socket rejected: "${entryPath}" (${limits.entryType})`,
		};
	}

	// 5. Symlink / hardlink escape checks
	if (limits.linkTarget || limits.entryType === "symlink" || limits.entryType === "hardlink") {
		if (limits.linkTarget) {
			const targetNorm = limits.linkTarget.replace(/\\/g, "/");
			if (path.isAbsolute(limits.linkTarget) || /^[a-zA-Z]:/.test(targetNorm) || targetNorm.startsWith("/")) {
				return {
					valid: false,
					code: THREAT_CODES.SYMLINK_ESCAPE,
					error: `Security violation: absolute symlink/hardlink target rejected: "${limits.linkTarget}"`,
				};
			}

			const entryDir = path.posix.dirname(normalized);
			const resolvedTarget = path.posix.normalize(path.posix.join(entryDir, targetNorm));
			if (resolvedTarget.startsWith("../") || resolvedTarget === ".." || resolvedTarget.includes("/../")) {
				return {
					valid: false,
					code: THREAT_CODES.SYMLINK_ESCAPE,
					error: `Security violation: symlink target escapes archive boundary: "${limits.linkTarget}"`,
				};
			}
		}
	}

	// 6. Case & Unicode collision checks
	if (limits.seenPaths) {
		const folded = normalized.toLowerCase().normalize("NFC");
		if (limits.seenPaths.has(folded)) {
			return {
				valid: false,
				code: THREAT_CODES.CASE_COLLISION,
				error: `Security violation: case or Unicode collision detected for path: "${entryPath}"`,
			};
		}
		limits.seenPaths.add(folded);
	}

	// 7. Compression ratio bomb check
	if (typeof limits.uncompressedSize === "number" && typeof limits.compressedSize === "number") {
		if (limits.compressedSize > 0) {
			const ratio = limits.uncompressedSize / limits.compressedSize;
			const maxRatio = limits.maxRatio ?? 100;
			if (ratio > maxRatio && limits.uncompressedSize > 1024 * 1024) {
				return {
					valid: false,
					code: THREAT_CODES.RATIO_EXCEEDED,
					error: `Security violation: suspicious compression ratio (${ratio.toFixed(1)}x) exceeds limit (${maxRatio}x)`,
				};
			}
		}
	}

	// 8. Zip bomb / count & size limits
	if (typeof limits.currentCount === "number" && limits.maxFiles && limits.currentCount >= limits.maxFiles) {
		return {
			valid: false,
			code: THREAT_CODES.MAX_FILES_EXCEEDED,
			error: `Security violation: archive exceeds maximum permitted file count (${limits.maxFiles})`,
		};
	}

	if (
		typeof limits.currentTotalBytes === "number" &&
		limits.maxTotalBytes &&
		limits.currentTotalBytes >= limits.maxTotalBytes
	) {
		return {
			valid: false,
			code: THREAT_CODES.MAX_SIZE_EXCEEDED,
			error: `Security violation: archive exceeds maximum uncompressed size (${limits.maxTotalBytes} bytes)`,
		};
	}

	return { valid: true };
}
