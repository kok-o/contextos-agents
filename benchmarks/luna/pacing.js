'use strict';

// Request pacing is an estimate, not a promise about provider rate limits.
// The spending guard independently checks every actual HTTP attempt.
class Pacer {
  constructor({ tokensPerMinute = 60000, requestsPerMinute = 500, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), onWait = () => {} } = {}) {
    if (!Number.isSafeInteger(tokensPerMinute) || tokensPerMinute < 1000 || tokensPerMinute > 10000000) throw new Error('Invalid TPM pacing limit');
    if (!Number.isSafeInteger(requestsPerMinute) || requestsPerMinute < 1 || requestsPerMinute > 500) throw new Error('Invalid RPM pacing limit');
    this.requestsPerMinute = requestsPerMinute; this.requests = [];
    this.rate = tokensPerMinute / 60000;
    this.capacity = tokensPerMinute;
    this.tokens = 0; // Warm up rather than assuming an idle OpenAI project.
    this.updatedAt = now(); this.now = now; this.sleep = sleep; this.onWait = onWait;
  }
  async wait(body) {
    const estimate = Math.ceil(Buffer.byteLength(JSON.stringify(body)) / 3) + body.max_output_tokens;
    if (estimate > this.capacity) throw new Error('Request is too large for this TPM pacing setting');
    while (true) {
      const now = this.now(); this.tokens = Math.min(this.capacity, this.tokens + Math.max(0, now - this.updatedAt) * this.rate); this.updatedAt = now;
      this.requests = this.requests.filter(time => time > now - 60000);
      const requestDelay = this.requests.length >= this.requestsPerMinute ? this.requests[0] + 60000 - now : 0;
      if (this.tokens >= estimate && requestDelay <= 0) { this.tokens -= estimate; this.requests.push(now); return; }
      const delay = Math.min(30000, Math.max(requestDelay, Math.ceil((estimate - this.tokens) / this.rate)));
      this.onWait(delay); await this.sleep(delay);
    }
  }
}

module.exports = { Pacer };
