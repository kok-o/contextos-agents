'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * Helper to make HTTP/HTTPS JSON requests with timeout and error handling.
 */
function requestJson(urlStr, { method = 'POST', headers = {}, body = null, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const reqHeaders = {
      'Accept': 'application/json',
      ...headers,
    };

    let postData = null;
    if (body !== null) {
      postData = typeof body === 'string' ? body : JSON.stringify(body);
      if (!reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const options = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: reqHeaders,
    };

    const req = client.request(options, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let parsedBody = null;
        try {
          parsedBody = JSON.parse(raw);
        } catch {
          parsedBody = { rawText: raw };
        }
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: parsedBody,
        });
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`HTTP request timed out after ${timeoutMs}ms`));
    });

    req.on('error', reject);

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Detect provider from options, model name, or environment variables.
 */
function resolveProviderConfig(options = {}) {
  let provider = (options.provider || '').toLowerCase();
  let apiKey = options.apiKey || '';
  let model = options.model || '';
  let baseUrl = options.baseUrl || '';

  // Auto-detect provider if not explicitly given
  if (!provider) {
    if (model.startsWith('gemini-')) {
      provider = 'gemini';
    } else if (model.startsWith('claude-')) {
      provider = 'anthropic';
    } else if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('chatgpt-')) {
      provider = 'openai';
    } else if (process.env.OPENAI_API_KEY) {
      provider = 'openai';
    } else if (process.env.GEMINI_API_KEY) {
      provider = 'gemini';
    } else if (process.env.ANTHROPIC_API_KEY) {
      provider = 'anthropic';
    } else {
      provider = 'openai'; // default
    }
  }

  // Resolve API key and default models
  if (provider === 'openai') {
    apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    model = model || 'gpt-4o';
    baseUrl = baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com';
  } else if (provider === 'gemini') {
    apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    model = model || 'gemini-2.5-flash';
  } else if (provider === 'anthropic') {
    apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
    model = model || 'claude-3-7-sonnet-20250219';
    baseUrl = baseUrl || 'https://api.anthropic.com';
  }

  return { provider, apiKey, model, baseUrl };
}

/**
 * Unified LLM Client for calling OpenAI, Gemini, Anthropic, and custom endpoints.
 */
class LLMClient {
  constructor(options = {}) {
    const resolved = resolveProviderConfig(options);
    this.provider = resolved.provider;
    this.apiKey = resolved.apiKey;
    this.model = resolved.model;
    this.baseUrl = resolved.baseUrl;
    this.maxRetries = options.maxRetries || 3;
    this.timeoutMs = options.timeoutMs || 300_000;
  }

  /**
   * Complete a prompt with a given system instruction.
   */
  async generate({ prompt, systemInstruction = 'You are an expert software engineer.', temperature = 0.1, maxTokens = 8192 }) {
    if (!this.apiKey && this.provider !== 'custom') {
      throw new Error(`API key is required for provider "${this.provider}". Set environment variable or pass --api-key`);
    }

    const started = Date.now();

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        let result;
        if (this.provider === 'gemini') {
          result = await this._callGemini({ prompt, systemInstruction, temperature, maxTokens });
        } else if (this.provider === 'anthropic') {
          result = await this._callAnthropic({ prompt, systemInstruction, temperature, maxTokens });
        } else {
          // openai or custom OpenAI-compatible endpoint
          result = await this._callOpenAI({ prompt, systemInstruction, temperature, maxTokens });
        }

        return {
          text: result.text,
          latencyMs: Date.now() - started,
          usage: result.usage,
          model: this.model,
          provider: this.provider,
        };
      } catch (err) {
        const isLast = attempt === this.maxRetries;
        const isRateLimit = err.status === 429 || /rate\s*limit|quota|in-flight/i.test(err.message);
        const isInFlight = err.status === 402 && /in-flight/i.test(err.message);
        const isServerBusy = err.status === 504 || err.status === 503 || err.status === 502 || err.status === 500 || /504|Gateway\s*Time-?out/i.test(err.message);

        if ((isRateLimit || isInFlight || isServerBusy || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') && !isLast) {
          const waitMs = isInFlight ? 15000 : attempt * 4000;
          console.warn(`    [LLMClient] Attempt ${attempt}/${this.maxRetries} failed (${err.message.slice(0, 100)}). Retrying in ${waitMs / 1000}s...`);
          await sleep(waitMs);
          continue;
        }

        throw err;
      }
    }

    throw new Error(`Failed to generate output after ${this.maxRetries} attempts.`);
  }

  async _callOpenAI({ prompt, systemInstruction, temperature, maxTokens }) {
    const base = this.baseUrl.replace(/\/+$/, '');
    const endpoint = base.endsWith('/v1')
      ? `${base}/chat/completions`
      : `${base}/v1/chat/completions`;
    const isReasoningModel = /^o[1-3]/i.test(this.model);

    const payload = {
      model: this.model,
      stream: true,
      messages: [
        { role: isReasoningModel ? 'user' : 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
    };

    if (isReasoningModel) {
      payload.max_completion_tokens = maxTokens;
    } else {
      payload.temperature = temperature;
      payload.max_tokens = maxTokens;
    }

    if (this.baseUrl && this.baseUrl.includes('openrouter.ai')) {
      payload.reasoning = { effort: 'low' };
    }
    if (this.model.startsWith('glm-') || this.model.startsWith('o1') || this.model.startsWith('o3')) {
      payload.reasoning_effort = 'low';
    }

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(endpoint);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      const postData = JSON.stringify(payload);

      const reqHeaders = {
        'Accept': 'text/event-stream, application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': 'Cline/3.0.0',
        'HTTP-Referer': 'https://github.com/kok-o/contextos',
        'X-Title': 'ContextOS',
      };

      const options = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: reqHeaders,
      };

      let idleTimer = setTimeout(() => {
        req.destroy(new Error(`HTTP request idle timeout after 180s without data`));
      }, 180_000);

      const resetIdleTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          req.destroy(new Error(`HTTP request idle timeout after 180s without data`));
        }, 180_000);
      };

      const maxTimer = setTimeout(() => {
        req.destroy(new Error(`HTTP request exceeded maximum duration of ${this.timeoutMs || 300_000}ms`));
      }, this.timeoutMs || 300_000);

      const clearAllTimers = () => {
        clearTimeout(idleTimer);
        clearTimeout(maxTimer);
      };

      const req = client.request(options, res => {
        let raw = '';
        let text = '';
        let reasoningText = '';
        let promptTokens = 0;
        let completionTokens = 0;
        let buffer = '';

        res.setEncoding('utf8');

        res.on('data', chunk => {
          resetIdleTimer();
          raw += chunk;
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop(); // preserve last incomplete line
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:') && !trimmed.includes('[DONE]')) {
              try {
                const jsonStr = trimmed.replace(/^data:\s*/, '');
                const parsed = JSON.parse(jsonStr);
                const delta = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.delta?.text || '';
                text += delta;
                if (parsed.choices?.[0]?.delta?.reasoning_content) {
                  reasoningText += parsed.choices[0].delta.reasoning_content;
                }
                if (parsed.usage) {
                  promptTokens = parsed.usage.prompt_tokens || promptTokens;
                  completionTokens = parsed.usage.completion_tokens || completionTokens;
                }
              } catch {}
            }
          }
        });

        res.on('end', () => {
          clearAllTimers();
          if (buffer && buffer.trim().startsWith('data:') && !buffer.includes('[DONE]')) {
            try {
              const jsonStr = buffer.trim().replace(/^data:\s*/, '');
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.delta?.text || '';
              text += delta;
              if (parsed.choices?.[0]?.delta?.reasoning_content) {
                reasoningText += parsed.choices[0].delta.reasoning_content;
              }
            } catch {}
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            let msg = raw;
            try {
              const parsedErr = JSON.parse(raw);
              msg = parsedErr.error?.message || parsedErr.message || raw;
            } catch {}
            const err = new Error(`OpenAI API ${res.statusCode}: ${msg}`);
            err.status = res.statusCode;
            return reject(err);
          }

          // Fallback if returned non-stream JSON
          if (!text && raw) {
            try {
              const parsed = JSON.parse(raw);
              text = parsed.choices?.[0]?.message?.content || parsed.choices?.[0]?.text || '';
            } catch {}
          }

          // Fallback to reasoning content if content is empty
          if (!text && reasoningText) {
            text = reasoningText;
          }

          if (!promptTokens) {
            promptTokens = Math.round(((systemInstruction.length + prompt.length) / 4));
          }
          if (!completionTokens) {
            completionTokens = Math.round(text.length / 4);
          }

          const usage = {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          };

          resolve({ text, usage });
        });
      });

      req.on('error', err => {
        clearAllTimers();
        reject(err);
      });
      req.write(postData);
      req.end();
    });
  }

  async _callGemini({ prompt, systemInstruction, temperature, maxTokens }) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const payload = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    };

    const res = await requestJson(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      timeoutMs: this.timeoutMs,
    });

    if (res.status < 200 || res.status >= 300) {
      const msg = res.body?.error?.message || JSON.stringify(res.body);
      const err = new Error(`Gemini API ${res.status}: ${msg}`);
      err.status = res.status;
      throw err;
    }

    const candidate = res.body?.candidates?.[0];
    const text = candidate?.content?.parts?.map(p => p.text).join('') || '';
    const usage = {
      promptTokens: res.body?.usageMetadata?.promptTokenCount || 0,
      completionTokens: res.body?.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: res.body?.usageMetadata?.totalTokenCount || 0,
    };

    return { text, usage };
  }

  async _callAnthropic({ prompt, systemInstruction, temperature, maxTokens }) {
    const base = (this.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    const endpoint = base.endsWith('/v1')
      ? `${base}/messages`
      : `${base}/v1/messages`;
    const payload = {
      model: this.model,
      system: systemInstruction,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature,
    };

    const res = await requestJson(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'User-Agent': 'Cline/3.0.0',
      },
      body: payload,
      timeoutMs: this.timeoutMs,
    });

    if (res.status < 200 || res.status >= 300) {
      const msg = res.body?.error?.message || JSON.stringify(res.body);
      const err = new Error(`Anthropic API ${res.status}: ${msg}`);
      err.status = res.status;
      throw err;
    }

    const text = res.body?.content?.map(c => c.text || '').join('') || '';
    const usage = {
      promptTokens: res.body?.usage?.input_tokens || 0,
      completionTokens: res.body?.usage?.output_tokens || 0,
      totalTokens: (res.body?.usage?.input_tokens || 0) + (res.body?.usage?.output_tokens || 0),
    };

    return { text, usage };
  }
}

module.exports = {
  LLMClient,
  requestJson,
  resolveProviderConfig,
  sleep,
};
