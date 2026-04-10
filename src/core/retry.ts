import { logger } from './logger.js';

/**
 * Error thrown when all retry attempts are exhausted due to rate limiting.
 */
export class RateLimitError extends Error {
  public readonly attempts: number;
  public readonly retryAfterSeconds: number | undefined;

  constructor(message: string, attempts: number, retryAfterSeconds?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.attempts = attempts;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Options for the withRetry utility.
 */
export interface RetryOptions {
  /** Maximum number of retries after the initial attempt. Default: 3 */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff. Default: 1000 */
  baseDelay?: number;
  /** Maximum delay cap in milliseconds. Default: 5000 */
  maxDelay?: number;
  /** Whether to retry on HTTP 403 (GitHub secondary rate limit). Default: false */
  retryOn403?: boolean;
}

/**
 * Extract the HTTP status code from an error, if present.
 * Works with axios errors (error.response.status) and Octokit errors (error.status).
 */
function getStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;

  const err = error as Record<string, any>;

  // Axios-style: error.response.status
  if (err.response && typeof err.response.status === 'number') {
    return err.response.status;
  }

  // Octokit-style: error.status
  if (typeof err.status === 'number') {
    return err.status;
  }

  return undefined;
}

/**
 * Extract Retry-After header value from an error response.
 * Returns delay in milliseconds, or undefined if not present.
 */
function getRetryAfterMs(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;

  const err = error as Record<string, any>;
  const headers = err.response?.headers ?? err.headers;
  if (!headers) return undefined;

  const retryAfter = headers['retry-after'] ?? headers['Retry-After'];
  if (retryAfter) {
    const retryAfterStr = String(retryAfter);

    // Try parsing as seconds (integer)
    const seconds = Number(retryAfterStr);
    if (!isNaN(seconds) && isFinite(seconds)) {
      return seconds * 1000;
    }

    // Try parsing as HTTP date
    const date = new Date(retryAfterStr);
    if (!isNaN(date.getTime())) {
      const delayMs = date.getTime() - Date.now();
      return Math.max(0, delayMs);
    }
  }

  const rateLimitReset = headers['x-ratelimit-reset'] ?? headers['X-RateLimit-Reset'];
  if (!rateLimitReset) return undefined;

  const resetSeconds = Number(rateLimitReset);
  if (!isNaN(resetSeconds) && isFinite(resetSeconds)) {
    return Math.max(0, resetSeconds * 1000 - Date.now());
  }

  return undefined;
}

/**
 * Determine whether an error is retryable.
 */
function isRetryable(error: unknown, retryOn403: boolean): boolean {
  const status = getStatusCode(error);

  // No status code = network error (ECONNRESET, etc.) — retryable
  if (status === undefined) return true;

  // 429 Too Many Requests — always retryable
  if (status === 429) return true;

  // 403 Forbidden — retryable only if retryOn403 is enabled (GitHub secondary rate limit)
  if (status === 403 && retryOn403) return true;

  // 5xx Server errors — retryable
  if (status >= 500) return true;

  // All other status codes — not retryable
  return false;
}

/**
 * Calculate delay with exponential backoff and jitter.
 */
function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelay;
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with automatic retry on transient failures.
 *
 * Retries on:
 * - HTTP 429 (Too Many Requests)
 * - HTTP 5xx (Server errors)
 * - Network errors (no response / ECONNRESET)
 * - HTTP 403 (only when retryOn403 is true, for GitHub secondary rate limits)
 *
 * Uses exponential backoff with jitter, respects Retry-After headers.
 * Throws RateLimitError after exhausting all retries.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 5000,
    retryOn403 = false,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // If not retryable, throw immediately
      if (!isRetryable(error, retryOn403)) {
        throw error;
      }

      // If we've exhausted retries, throw RateLimitError
      if (attempt >= maxRetries) {
        const status = getStatusCode(error);
        const retryAfterMs = getRetryAfterMs(error);
        const retryAfterSeconds = retryAfterMs !== undefined
          ? Math.ceil(retryAfterMs / 1000)
          : undefined;

        throw new RateLimitError(
          `Request failed after ${attempt + 1} attempts (last status: ${status ?? 'network error'})`,
          attempt + 1,
          retryAfterSeconds,
        );
      }

      // Calculate delay
      const retryAfterMs = getRetryAfterMs(error);
      const backoffDelay = calculateDelay(attempt, baseDelay, maxDelay);
      const delay = retryAfterMs !== undefined
        ? Math.min(retryAfterMs, maxDelay)
        : backoffDelay;

      const status = getStatusCode(error);
      logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`, {
        status,
        attempt: attempt + 1,
        maxRetries,
        delayMs: Math.round(delay),
        retryAfterMs,
      });

      await sleep(delay);
    }
  }

  // Should not reach here, but just in case
  throw lastError;
}
