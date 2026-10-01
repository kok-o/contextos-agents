'use strict';

// Request pacing is an estimate, not a promise about provider rate limits.
// The spending guard independently checks every actual HTTP attempt.
class Pacer {
  constructor({ tokensPerMinute = 60000, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), onWait = () => {} } = {}) {
    if (!Number.isSafeInteger(tokensPerMinute) || tokensPerMinute < 1000 || tokensPerMinute > 10000000) throw new Error('Invalid TPM pacing limit');
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
      if (this.tokens >= estimate) { this.tokens -= estimate; return; }
      const delay = Math.min(30000, Math.ceil((estimate - this.tokens) / this.rate));
      this.onWait(delay); await this.sleep(delay);
    }
  }
}

module.exports = { Pacer };
