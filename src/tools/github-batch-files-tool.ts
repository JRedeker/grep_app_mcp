import { z } from 'zod';
import { GitHubFileRequestSchema, fetchGitHubFilesWithOptions } from '../core/github-utils.js';
import type { ToolContext } from '../core/types.js';
import { RateLimitError } from '../core/retry.js';

// Schema for batch file request
const BatchFileRequestSchema = z.object({
  files: z.array(GitHubFileRequestSchema)
});

type BatchFileRequest = z.infer<typeof BatchFileRequestSchema>;

export const githubBatchFilesTool = {
  name: 'github_batch_files',
  description: 'Fetch multiple file contents from GitHub repositories in parallel',
  version: '1.0.0',
  parameters: BatchFileRequestSchema,
  annotations: {
    title: 'GitHub Batch Files Fetcher',
    readOnlyHint: true,
    openWorldHint: true,
  },
  execute: async (args: BatchFileRequest, context: ToolContext) => {
    const params = BatchFileRequestSchema.parse(args);
    try {
      const results = await fetchGitHubFilesWithOptions(params.files, undefined, {
        throwOnRateLimit: true,
      });
      return JSON.stringify(results, null, 2);
    } catch (error) {
      if (error instanceof RateLimitError) {
        const waitMsg = error.retryAfterSeconds
          ? `Try again in ${error.retryAfterSeconds} seconds.`
          : 'Try again later.';
        return JSON.stringify({
          error: `GitHub API rate limit reached after ${error.attempts} attempts. ${waitMsg}`
        }, null, 2);
      }
      return JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }, null, 2);
    }
  }
};
