import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock winston logger before importing retry module
vi.mock('../core/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks are set up
const { withRetry, RateLimitError } = await import('../core/retry.js');

describe('RateLimitError', () => {
  it('is an instance of Error', () => {
    const err = new RateLimitError('rate limited', 3, 60);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('RateLimitError');
  });

  it('stores attempts and retryAfter', () => {
    const err = new RateLimitError('rate limited', 3, 60);
    expect(err.attempts).toBe(3);
    expect(err.retryAfterSeconds).toBe(60);
    expect(err.message).toBe('rate limited');
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and succeeds', async () => {
    const error429 = Object.assign(new Error('Too Many Requests'), {
      response: { status: 429, headers: {} },
    });
    const fn = vi.fn()
      .mockRejectedValueOnce(error429)
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { baseDelay: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 5xx and succeeds', async () => {
    const error500 = Object.assign(new Error('Internal Server Error'), {
      response: { status: 500, headers: {} },
    });
    const fn = vi.fn()
      .mockRejectedValueOnce(error500)
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { baseDelay: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on 404 (client error)', async () => {
    const error404 = Object.assign(new Error('Not Found'), {
      response: { status: 404, headers: {} },
    });
    const fn = vi.fn().mockRejectedValue(error404);

    await expect(withRetry(fn, { baseDelay: 1 })).rejects.toThrow('Not Found');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 403 by default (non-GitHub)', async () => {
    const error403 = Object.assign(new Error('Forbidden'), {
      response: { status: 403, headers: {} },
    });
    const fn = vi.fn().mockRejectedValue(error403);

    await expect(withRetry(fn, { baseDelay: 1 })).rejects.toThrow('Forbidden');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 403 when retryOn403 option is true', async () => {
    const error403 = Object.assign(new Error('Forbidden'), {
      response: { status: 403, headers: {} },
    });
    const fn = vi.fn()
      .mockRejectedValueOnce(error403)
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { baseDelay: 1, retryOn403: true });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws RateLimitError after exhausting retries', async () => {
    const error429 = Object.assign(new Error('Too Many Requests'), {
      response: { status: 429, headers: {} },
    });
    const fn = vi.fn().mockRejectedValue(error429);

    try {
      await withRetry(fn, { maxRetries: 2, baseDelay: 1 });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as any).attempts).toBe(3); // 1 initial + 2 retries
    }
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects Retry-After header (seconds)', async () => {
    const error429 = Object.assign(new Error('Too Many Requests'), {
      response: { status: 429, headers: { 'retry-after': '2' } },
    });
    const fn = vi.fn()
      .mockRejectedValueOnce(error429)
      .mockResolvedValue('ok');

    const start = Date.now();
    await withRetry(fn, { baseDelay: 1, maxDelay: 5000 });
    const elapsed = Date.now() - start;

    // Should have waited ~2000ms (Retry-After: 2 seconds)
    expect(elapsed).toBeGreaterThanOrEqual(1800);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('respects Retry-After header (HTTP date)', async () => {
    // Use a date format that parses correctly — verify the delay is > 0
    // and that the function actually retried (proving the header was read)
    const futureDate = new Date(Date.now() + 3000);
    const error429 = Object.assign(new Error('Too Many Requests'), {
      response: { status: 429, headers: { 'retry-after': futureDate.toUTCString() } },
    });
    const fn = vi.fn()
      .mockRejectedValueOnce(error429)
      .mockResolvedValue('ok');

    const start = Date.now();
    await withRetry(fn, { baseDelay: 1, maxDelay: 5000 });
    const elapsed = Date.now() - start;

    // Should have waited at least 2 seconds (3s target minus timing variance)
    expect(elapsed).toBeGreaterThanOrEqual(2000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('caps delay at maxDelay', async () => {
    const error429 = Object.assign(new Error('Too Many Requests'), {
      response: { status: 429, headers: { 'retry-after': '999' } },
    });
    const fn = vi.fn()
      .mockRejectedValueOnce(error429)
      .mockResolvedValue('ok');

    const start = Date.now();
    await withRetry(fn, { baseDelay: 1, maxDelay: 100 });
    const elapsed = Date.now() - start;

    // Should be capped at 100ms, not 999 seconds
    expect(elapsed).toBeLessThan(500);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('respects x-ratelimit-reset header', async () => {
    const resetAt = Math.ceil((Date.now() + 1200) / 1000);
    const error403 = Object.assign(new Error('Secondary rate limit'), {
      status: 403,
      response: { headers: { 'x-ratelimit-reset': String(resetAt) } },
    });
    const fn = vi.fn()
      .mockRejectedValueOnce(error403)
      .mockResolvedValue('ok');

    const start = Date.now();
    await withRetry(fn, { baseDelay: 1, maxDelay: 5000, retryOn403: true });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(700);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on network errors (no response)', async () => {
    const networkError = new Error('ECONNRESET');
    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { baseDelay: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('uses configurable maxRetries', async () => {
    const error429 = Object.assign(new Error('Too Many Requests'), {
      response: { status: 429, headers: {} },
    });
    const fn = vi.fn().mockRejectedValue(error429);

    await expect(withRetry(fn, { maxRetries: 1, baseDelay: 1 })).rejects.toBeInstanceOf(RateLimitError);
    expect(fn).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });
});
