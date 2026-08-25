/**
 * Model resolver — resolves model IDs to pi-ai Model objects.
 *
 * Handles three cases:
 *   1. Standard pi-ai models (anthropic, openai, google) — looked up from pi-ai registry
 *   2. Ollama models (ollama/*) — creates synthetic Model<"openai-completions"> pointing at localhost:11434
 *   3. OpenRouter models (openrouter/*) — creates synthetic Model<"openai-completions"> pointing at openrouter.ai
 *
 * This preserves the RLM loop for all backends — the orchestrator always uses pi-ai's completeSimple().
 */

import type { Api, Model } from "@mariozechner/pi-ai";

const { getModels, getProviders } = await import("@mariozechner/pi-ai");

const PROVIDER_KEYS: Record<string, string> = {
	anthropic: "ANTHROPIC_API_KEY",
	openai: "OPENAI_API_KEY",
	google: "GEMINI_API_KEY",
};

const DEFAULT_MODELS: Record<string, string> = {
	anthropic: "claude-sonnet-4-6",
	openai: "gpt-4o",
	google: "gemini-2.5-flash",
};

/**
 * Create a synthetic pi-ai Model for Ollama (OpenAI-compatible API at localhost:11434).
 *
 * Uses provider "openai" so pi-ai's API key lookup resolves to OPENAI_API_KEY.
 * We set a dummy OPENAI_API_KEY if none exists — Ollama ignores auth headers.
 */
function createOllamaModel(modelId: string): Model<"openai-completions"> {
	const shortId = modelId.replace("ollama/", "");

	// pi-ai requires an API key for the "openai" provider. Ollama doesn't need one,
	// but we must satisfy pi-ai's check. Set a dummy key if no real one exists.
	if (!process.env.OPENAI_API_KEY) {
		process.env.OPENAI_API_KEY = "ollama-local";
	}

	return {
		id: shortId,
		name: shortId,
		api: "openai-completions",
		provider: "openai",
		baseUrl: "http://localhost:11434/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 32768,
		maxTokens: 4096,
		compat: {
			supportsStore: false,
			supportsDeveloperRole: false,
			supportsReasoningEffort: false,
			supportsUsageInStreaming: false,
			maxTokensField: "max_tokens",
			requiresToolResultName: false,
			requiresAssistantAfterToolResult: false,
			requiresThinkingAsText: false,
			requiresMistralToolIds: false,
			thinkingFormat: "openai",
			supportsStrictMode: false,
		},
	};
}

/**
 * Create a synthetic pi-ai Model for OpenRouter (OpenAI-compatible API).
 */
function createOpenRouterModel(modelId: string): Model<"openai-completions"> {
	const shortId = modelId.replace("openrouter/", "");
	const apiKey = process.env.OPENROUTER_API_KEY || "";
	return {
		id: shortId,
		name: shortId,
		api: "openai-completions",
		provider: "openrouter",
		baseUrl: "https://openrouter.ai/api/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 4096,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"HTTP-Referer": "https://github.com/kingjulio8238/swarm-code",
			"X-Title": "swarm-code",
		},
		compat: {
			supportsStore: false,
			supportsDeveloperRole: false,
			supportsReasoningEffort: false,
			supportsUsageInStreaming: true,
			maxTokensField: "max_tokens",
			requiresToolResultName: false,
			requiresAssistantAfterToolResult: false,
			requiresThinkingAsText: false,
			requiresMistralToolIds: false,
			thinkingFormat: "openai",
			supportsStrictMode: false,
			openRouterRouting: undefined,
		},
	};
}

export interface ResolvedModel {
	model: Model<Api>;
	provider: string;
}

/**
 * Resolve a model ID to a pi-ai Model object.
 *
 * Supports:
 *   - "ollama/deepseek-coder-v2" → Ollama local model
 *   - "openrouter/auto" → OpenRouter cloud model
 *   - "claude-sonnet-4-6" → standard pi-ai model lookup
 *   - Falls back to any available provider's default model
 */
export function resolveModel(modelId: string, warnFn?: (msg: string) => void): ResolvedModel | null {
	// Ollama models — create synthetic model
	if (modelId.startsWith("ollama/")) {
		return { model: createOllamaModel(modelId), provider: "ollama" };
	}

	// OpenRouter models — create synthetic model
	if (modelId.startsWith("openrouter/")) {
		return { model: createOpenRouterModel(modelId), provider: "openrouter" };
	}

	// Standard pi-ai model lookup
	const knownProviders = new Set(Object.keys(PROVIDER_KEYS));
	let model: Model<Api> | undefined;
	let resolvedProvider = "";

	// Try known providers with API keys first
	for (const provider of getProviders()) {
		if (!knownProviders.has(provider)) continue;
		const key = PROVIDER_KEYS[provider]!;
		if (!process.env[key]) continue;
		for (const m of getModels(provider)) {
			if (m.id === modelId) {
				model = m;
				resolvedProvider = provider;
				break;
			}
		}
		if (model) break;
	}

	// Try unknown providers
	if (!model) {
		for (const provider of getProviders()) {
			if (knownProviders.has(provider)) continue;
			for (const m of getModels(provider)) {
				if (m.id === modelId) {
					model = m;
					resolvedProvider = provider;
					break;
				}
			}
			if (model) break;
		}
	}

	// Fallback: try default model for any provider that has a key
	if (!model) {
		for (const [prov, envKey] of Object.entries(PROVIDER_KEYS)) {
			if (!process.env[envKey]) continue;
			const fallbackId = DEFAULT_MODELS[prov];
			if (!fallbackId) continue;
			for (const p of getProviders()) {
				if (p !== prov) continue;
				for (const m of getModels(p)) {
					if (m.id === fallbackId) {
						model = m;
						resolvedProvider = prov;
						if (warnFn) warnFn(`Using ${fallbackId} (${prov}) — model "${modelId}" not found`);
						break;
					}
				}
				if (model) break;
			}
			if (model) break;
		}
	}

	if (!model) return null;
	return { model, provider: resolvedProvider };
}
