'use strict';

function count(value) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeUsage(values = {}, source = 'provider') {
  const promptTokens = count(values.promptTokens);
  const completionTokens = count(values.completionTokens);
  const totalTokens = count(values.totalTokens) ?? (
    promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null
  );
  const hasUsage = promptTokens !== null || completionTokens !== null || totalTokens !== null;

  const normalized = {
    promptTokens,
    completionTokens,
    totalTokens,
    reasoningTokens: count(values.reasoningTokens),
    cachedPromptTokens: count(values.cachedPromptTokens),
    source: hasUsage ? source : 'unavailable',
  };
  const attemptCount = count(values.attemptCount);
  const unreportedAttempts = count(values.unreportedAttempts);
  if (attemptCount !== null) normalized.attemptCount = attemptCount;
  if (unreportedAttempts !== null) normalized.unreportedAttempts = unreportedAttempts;
  return normalized;
}

function normalizeOpenAIUsage(raw) {
  if (!raw || typeof raw !== 'object') return normalizeUsage({}, 'unavailable');
  return normalizeUsage({
    promptTokens: raw.prompt_tokens ?? raw.input_tokens,
    completionTokens: raw.completion_tokens ?? raw.output_tokens,
    totalTokens: raw.total_tokens,
    reasoningTokens: raw.completion_tokens_details?.reasoning_tokens ?? raw.output_tokens_details?.reasoning_tokens,
    cachedPromptTokens: raw.prompt_tokens_details?.cached_tokens ?? raw.input_tokens_details?.cached_tokens,
  });
}

function normalizeGeminiUsage(raw) {
  if (!raw || typeof raw !== 'object') return normalizeUsage({}, 'unavailable');
  return normalizeUsage({
    promptTokens: raw.promptTokenCount ?? raw.total_input_tokens ?? raw.prompt_tokens,
    completionTokens: raw.candidatesTokenCount ?? raw.total_output_tokens ?? raw.completion_tokens,
    totalTokens: raw.totalTokenCount ?? raw.total_tokens,
    reasoningTokens: raw.thoughtsTokenCount ?? raw.thoughts_token_count,
    cachedPromptTokens: raw.cachedContentTokenCount ?? raw.total_cached_tokens,
  });
}

function normalizeAnthropicUsage(raw) {
  if (!raw || typeof raw !== 'object') return normalizeUsage({}, 'unavailable');
  const input = count(raw.input_tokens);
  const cacheWrite = count(raw.cache_creation_input_tokens) ?? 0;
  const cacheRead = count(raw.cache_read_input_tokens) ?? 0;
  const promptTokens = input === null ? null : input + cacheWrite + cacheRead;
  return normalizeUsage({
    promptTokens,
    completionTokens: raw.output_tokens,
    totalTokens: promptTokens === null || count(raw.output_tokens) === null
      ? null
      : promptTokens + count(raw.output_tokens),
    cachedPromptTokens: cacheRead + cacheWrite,
  });
}

function sumUsage(usages = []) {
  const entries = usages.filter(entry => entry && typeof entry === 'object')
    .filter(entry => !(Number.isSafeInteger(entry.requestCount) && entry.requestCount === 0));
  if (entries.length === 0) {
    return {
      requestCount: 0,
      providerRequests: 0,
      userReportedRequests: 0,
      estimatedRequests: 0,
      unavailableRequests: 0,
      unreportedRetryRequests: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cachedPromptTokens: 0,
      knownTotalTokens: 0,
      complete: true,
      source: 'not_applicable',
    };
  }

  let requestCount = 0;
  let providerRequests = 0;
  let userReportedRequests = 0;
  let estimatedRequests = 0;
  let unavailableRequests = 0;
  let unreportedRetryRequests = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let knownTotalTokens = 0;
  let reasoningTokens = 0;
  let cachedPromptTokens = 0;
  let promptComplete = true;
  let completionComplete = true;
  let totalComplete = true;
  let reasoningComplete = true;
  let cacheComplete = true;
  const sources = new Set();

  for (const entry of entries) {
    const isSummary = Number.isSafeInteger(entry.requestCount) && entry.requestCount >= 0;
    if (isSummary && entry.requestCount === 0) continue;
    const source = entry.source || 'unavailable';
    const unreportedAttempts = isSummary ? 0 : (count(entry.unreportedAttempts) ?? 0);
    const countRequests = isSummary
      ? entry.requestCount
      : (count(entry.attemptCount) ?? (source === 'unavailable'
        ? Math.max(1, unreportedAttempts)
        : 1 + unreportedAttempts));
    requestCount += countRequests;
    sources.add(source);
    if (isSummary) {
      providerRequests += count(entry.providerRequests) ?? 0;
      userReportedRequests += count(entry.userReportedRequests) ?? 0;
      estimatedRequests += count(entry.estimatedRequests) ?? 0;
      unavailableRequests += count(entry.unavailableRequests) ?? countRequests;
      unreportedRetryRequests += count(entry.unreportedRetryRequests) ?? 0;
      knownTotalTokens += count(entry.knownTotalTokens) ?? count(entry.totalTokens) ?? 0;
    } else {
      if (source === 'provider') providerRequests++;
      if (source === 'user_reported') userReportedRequests++;
      if (source === 'estimated') estimatedRequests++;
      unreportedRetryRequests += unreportedAttempts;
      if (source === 'unavailable' || entry.totalTokens == null) unavailableRequests += countRequests;
      else unavailableRequests += unreportedAttempts;
      knownTotalTokens += count(entry.totalTokens) ?? 0;
    }
    for (const [field, state] of [
      ['promptTokens', 'prompt'],
      ['completionTokens', 'completion'],
      ['totalTokens', 'total'],
      ['reasoningTokens', 'reasoning'],
      ['cachedPromptTokens', 'cache'],
    ]) {
      const value = count(entry[field]);
      if (value === null || (!isSummary && unreportedAttempts > 0)) {
        if (state === 'prompt') promptComplete = false;
        else if (state === 'completion') completionComplete = false;
        else if (state === 'total') totalComplete = false;
        else if (state === 'reasoning') reasoningComplete = false;
        else cacheComplete = false;
      } else if (state === 'prompt') promptTokens += value;
      else if (state === 'completion') completionTokens += value;
      else if (state === 'total') totalTokens += value;
      else if (state === 'reasoning') reasoningTokens += value;
      else cachedPromptTokens += value;
    }
  }
  const source = sources.size === 1 ? [...sources][0] : 'mixed';

  return {
    requestCount,
    providerRequests,
    userReportedRequests,
    estimatedRequests,
    unavailableRequests,
    unreportedRetryRequests,
    promptTokens: promptComplete ? promptTokens : null,
    completionTokens: completionComplete ? completionTokens : null,
    totalTokens: totalComplete ? totalTokens : null,
    reasoningTokens: reasoningComplete ? reasoningTokens : null,
    cachedPromptTokens: cacheComplete ? cachedPromptTokens : null,
    knownTotalTokens,
    complete: unavailableRequests === 0,
    source,
  };
}

module.exports = {
  normalizeUsage,
  normalizeOpenAIUsage,
  normalizeGeminiUsage,
  normalizeAnthropicUsage,
  sumUsage,
};
