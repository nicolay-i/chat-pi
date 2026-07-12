export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type Counter = {
  count: number;
  resetAt: number;
};

/**
 * A small per-process fixed-window limiter. It is intentionally dependency-free
 * because the API is single-instance today; move counters to Redis when it is
 * deployed behind multiple API replicas.
 */
export class FixedWindowRateLimiter {
  private readonly counters = new Map<string, Counter>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  consume(key: string): RateLimitResult {
    const timestamp = this.now();
    const previous = this.counters.get(key);
    if (!previous || timestamp >= previous.resetAt) {
      this.counters.set(key, { count: 1, resetAt: timestamp + this.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (previous.count >= this.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((previous.resetAt - timestamp) / 1000)),
      };
    }

    previous.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
