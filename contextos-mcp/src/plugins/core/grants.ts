/**
 * ContextOS Script Execution Capability Grants & Invalidation Engine
 * Section 20.6 & Threat Model Hardening
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { sha256 } from "./digest.js";
import type { AuthorizationResult, GrantOptions, GrantRecord } from "./types.js";

export class ScriptGrantManager {
	readonly grantsFilePath: string;
	private grants: Record<string, GrantRecord>;

	constructor(grantsFilePath: string) {
		this.grantsFilePath = path.resolve(grantsFilePath);
		this.grants = this._load();
	}

	private _load(): Record<string, GrantRecord> {
		if (!fs.existsSync(this.grantsFilePath)) return {};
		try {
			return JSON.parse(fs.readFileSync(this.grantsFilePath, "utf8"));
		} catch {
			return {};
		}
	}

	private _save(): void {
		fs.mkdirSync(path.dirname(this.grantsFilePath), { recursive: true });
		fs.writeFileSync(this.grantsFilePath, JSON.stringify(this.grants, null, 2), "utf8");
	}

	/**
	 * Grants execution permission to a specific script by its content hash.
	 * Binds both to plugin identity and content hash.
	 */
	grant(scriptPath: string, options: GrantOptions = {}): void {
		const resolved = path.resolve(scriptPath);
		const content = fs.readFileSync(resolved);
		const hash = sha256(content);

		const record: GrantRecord = {
			hash,
			grantedAt: Date.now(),
			pluginId: options.pluginId,
			relPath: options.relPath,
		};

		if (options.pluginId) {
			const idKey = `plugin:${options.pluginId}:${options.relPath || path.basename(scriptPath)}`;
			this.grants[idKey] = record;
		}

		// Also register by resolved file path for local execution and compatibility
		this.grants[resolved] = record;
		this._save();
	}

	/**
	 * Verifies if a script is authorized to run.
	 * Invalidates grant immediately if script was altered.
	 */
	checkAuthorization(scriptPath: string, options: GrantOptions = {}): AuthorizationResult {
		const resolved = path.resolve(scriptPath);
		if (!fs.existsSync(resolved)) {
			return { authorized: false, reason: "Script file not found." };
		}

		let record: GrantRecord | undefined;
		if (options.pluginId) {
			const idKey = `plugin:${options.pluginId}:${options.relPath || path.basename(scriptPath)}`;
			record = this.grants[idKey] || this.grants[resolved];
		} else {
			record = this.grants[resolved];
		}

		if (!record) {
			return {
				authorized: false,
				reason: "Script execution is disabled by default. Requires explicit user grant.",
			};
		}

		const currentHash = sha256(fs.readFileSync(resolved));
		if (currentHash !== record.hash) {
			// Invalidate immediately upon tampering
			delete this.grants[resolved];
			if (options.pluginId) {
				delete this.grants[`plugin:${options.pluginId}:${options.relPath || path.basename(scriptPath)}`];
			}
			this._save();

			return {
				authorized: false,
				reason: "Script content has been modified since grant was issued. Grant invalidated.",
			};
		}

		return { authorized: true, reason: "Authorized" };
	}
}
