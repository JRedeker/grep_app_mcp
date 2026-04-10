import { Octokit } from '@octokit/rest';
import { logger } from './logger.js';

/** Per-request timeout for GitHub API calls (ms). Override via GITHUB_API_TIMEOUT_MS env var. */
const _rawGithubTimeout = Number(process.env.GITHUB_API_TIMEOUT_MS);
const GITHUB_API_TIMEOUT_MS = (Number.isFinite(_rawGithubTimeout) && _rawGithubTimeout > 0) ? _rawGithubTimeout : 10_000;

/**
 * Create a configured Octokit instance.
 * Uses GITHUB_TOKEN from environment if available (5,000 req/hr).
 * Falls back to unauthenticated mode (60 req/hr) with a warning.
 */
export function createOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;

  if (token) {
    logger.info('GitHub API: using authenticated Octokit (5,000 req/hr)');
    return new Octokit({ auth: token, request: { timeout: GITHUB_API_TIMEOUT_MS } });
  }

  logger.warn('GitHub API: GITHUB_TOKEN not set — using unauthenticated mode (60 req/hr). Set GITHUB_TOKEN to increase rate limit.');
  return new Octokit({ request: { timeout: GITHUB_API_TIMEOUT_MS } });
}

/**
 * Shared Octokit instance for the entire application.
 * Timeout is configured once at module load via GITHUB_API_TIMEOUT_MS env var (default 10 000 ms).
 * All modules should import this instead of creating their own instances.
 */
export const octokit: Octokit = createOctokit();
