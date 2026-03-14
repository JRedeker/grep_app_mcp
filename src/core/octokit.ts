import { Octokit } from '@octokit/rest';
import { logger } from './logger.js';

/**
 * Create a configured Octokit instance.
 * Uses GITHUB_TOKEN from environment if available (5,000 req/hr).
 * Falls back to unauthenticated mode (60 req/hr) with a warning.
 */
export function createOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;

  if (token) {
    logger.info('GitHub API: using authenticated Octokit (5,000 req/hr)');
    return new Octokit({ auth: token });
  }

  logger.warn('GitHub API: GITHUB_TOKEN not set — using unauthenticated mode (60 req/hr). Set GITHUB_TOKEN to increase rate limit.');
  return new Octokit();
}

/**
 * Shared Octokit instance for the entire application.
 * All modules should import this instead of creating their own instances.
 */
export const octokit: Octokit = createOctokit();
