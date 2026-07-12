import { describe, expect, it } from 'vitest';
import { FixedWindowRateLimiter } from './rateLimiter';

describe('FixedWindowRateLimiter', () => {
  it('limits a key inside a window and resets it when the window expires', () => {
    let now = 1_000;
    const limiter = new FixedWindowRateLimiter(2, 5_000, () => now);

    expect(limiter.consume('client')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.consume('client')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.consume('client')).toEqual({ allowed: false, retryAfterSeconds: 5 });

    now = 6_000;
    expect(limiter.consume('client')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('keeps independent counters for separate clients', () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000);

    expect(limiter.consume('first').allowed).toBe(true);
    expect(limiter.consume('second').allowed).toBe(true);
    expect(limiter.consume('first').allowed).toBe(false);
  });
});
