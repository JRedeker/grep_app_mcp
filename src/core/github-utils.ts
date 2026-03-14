import { z } from 'zod';
import { logger } from './logger.js';
import { octokit } from './octokit.js';
import { withRetry } from './retry.js';
import { pLimit } from './concurrency.js';

/** Default maximum concurrent GitHub API requests. */
const DEFAULT_CONCURRENCY = 5;

// Schema for GitHub file request
export const GitHubFileRequestSchema = z.object({
    owner: z.string(),
    repo: z.string(),
    path: z.string(),
    ref: z.string().optional()
});

export type GitHubFileRequest = z.infer<typeof GitHubFileRequestSchema>;

export interface FetchGitHubFilesOptions {
    throwOnRateLimit?: boolean;
}

// Schema for GitHub file content response
export const GitHubFileContentSchema = z.object({
    content: z.string(),
    path: z.string(),
    sha: z.string(),
    owner: z.string(),
    repo: z.string(),
    error: z.string().optional()
});

export type GitHubFileContent = z.infer<typeof GitHubFileContentSchema>;

/**
 * Fetch multiple files from GitHub with concurrency control.
 * @param files Array of file requests.
 * @param concurrency Maximum concurrent requests (default: 5).
 */
export async function fetchGitHubFiles(files: GitHubFileRequest[], concurrency: number = DEFAULT_CONCURRENCY): Promise<GitHubFileContent[]> {
    return fetchGitHubFilesWithOptions(files, concurrency, {});
}

export async function fetchGitHubFilesWithOptions(
    files: GitHubFileRequest[],
    concurrency: number = DEFAULT_CONCURRENCY,
    options: FetchGitHubFilesOptions = {},
): Promise<GitHubFileContent[]> {
    logger.info('Fetching files from GitHub', { fileCount: files.length, concurrency });
    
    const limit = pLimit(concurrency);
    return await Promise.all(
        files.map((file) => limit(async () => {
            try {
                const response = await withRetry(
                    () => octokit.rest.repos.getContent({
                        owner: file.owner,
                        repo: file.repo,
                        path: file.path,
                        ref: file.ref
                    }),
                    { retryOn403: true }
                );

                if (Array.isArray(response.data)) {
                    throw new Error(`Path ${file.path} points to a directory, not a file`);
                }

                if (!('content' in response.data)) {
                    throw new Error(`No content found in response for ${file.path}`);
                }

                const content = Buffer.from(response.data.content, 'base64').toString('utf-8');

                return {
                    content,
                    path: response.data.path,
                    sha: response.data.sha,
                    owner: file.owner,
                    repo: file.repo
                };
            } catch (error) {
                if (options.throwOnRateLimit && error instanceof Error && error.name === 'RateLimitError') {
                    throw error;
                }
                logger.error('Failed to fetch GitHub file', { error, file });
                return {
                    content: '',
                    path: file.path,
                    sha: '',
                    owner: file.owner,
                    repo: file.repo,
                    error: error instanceof Error ? error.message : 'Unknown error occurred'
                };
            }
        }))
    );
}
