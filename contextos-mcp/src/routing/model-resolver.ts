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

import { getEnvApiKey, getModels, getProviders, type Model } from "@mariozechner/pi-ai";

// Patch global fetch to bypass WAFs that block Node.js by default
const originalFetch = globalThis.fetch;
globalThis.fetch = async function (url: any, options?: RequestInit) {
	if (url.toString().includes("air-outer.com") || url.toString().includes("agentrouter.org")) {
		options = options || {};
		options.headers = {
			...options.headers,
			"User-Agent": "OpenCode",
		};
	}
	return originalFetch.apply(this, [url, options]);
};

type Api = "openai-completions" | "openai-responses";

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

/**
 * Create a synthetic pi-ai Model for AgentRouter (OpenAI-compatible API).
 */
function createAgentRouterModel(modelId: string): Model<"openai-completions"> {
	const shortId = modelId.replace("agentrouter/", "");
	const apiKey = process.env.OPENAI_API_KEY || "";
	return {
		id: shortId,
		name: shortId,
		api: "openai-completions",
		provider: "openai",
		baseUrl: "https://agentrouter.org/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 4096,
		headers: {
			Authorization: `Bearer ${apiKey}`,
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

	// AgentRouter models — create synthetic model
	if (modelId.startsWith("agentrouter/")) {
		return { model: createAgentRouterModel(modelId), provider: "agentrouter" };
	}

	// Transparent proxy via OPENAI_BASE_URL
	if (process.env.OPENAI_BASE_URL && !modelId.includes("/")) {
		const apiKey = process.env.OPENAI_API_KEY || "";
		const syntheticModel: Model<"openai-completions"> = {
			id: modelId,
			name: modelId,
			api: "openai-completions",
			provider: "openai",
			baseUrl: process.env.OPENAI_BASE_URL,
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128000,
			maxTokens: 4096,
			headers: apiKey
				? {
						Authorization: `Bearer ${apiKey}`,
						"User-Agent": "OpenCode",
					}
				: {
						"User-Agent": "OpenCode",
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
			},
		};
		return { model: syntheticModel, provider: "openai" };
	}

	// Standard pi-ai model lookup
	const knownProviders = new Set(["anthropic", "openai", "google", "groq", "cerebras", "xai", "openrouter", "mistral"]);
	let model: Model<Api> | undefined;
	let resolvedProvider = "";

	// Try known providers with API keys first
	for (const provider of getProviders()) {
		if (!knownProviders.has(provider)) continue;
		if (!getEnvApiKey(provider)) continue;
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
		for (const [prov, fallbackId] of Object.entries(DEFAULT_MODELS)) {
			if (!getEnvApiKey(prov)) continue;
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
