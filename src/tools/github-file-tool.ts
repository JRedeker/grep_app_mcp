import { z } from 'zod';
import { octokit } from '../core/octokit.js';
import { withRetry, RateLimitError } from '../core/retry.js';

// Schema for file request
const FileRequestSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  path: z.string(),
  ref: z.string().optional()
});

type FileRequest = z.infer<typeof FileRequestSchema>;

// Schema for file content response
const FileContentSchema = z.object({
  content: z.string(),
  path: z.string(),
  sha: z.string()
});

export const githubFileTool = {
  name: 'github_file',
  description: 'Fetch file contents from GitHub repositories',
  version: '1.0.0',
  parameters: FileRequestSchema,
  annotations: {
    title: 'GitHub File Fetcher',
    readOnlyHint: true,
    openWorldHint: true,
  },
  execute: async (args: any, { log, reportProgress }: any) => {
    const params = FileRequestSchema.parse(args);
    try {
      const response = await withRetry(
        () => octokit.rest.repos.getContent({
          owner: params.owner,
          repo: params.repo,
          path: params.path,
          ref: params.ref
        }),
        { retryOn403: true }
      );

      if (Array.isArray(response.data)) {
        throw new Error('Path points to a directory, not a file');
      }

      if (!('content' in response.data)) {
        throw new Error('No content found in response');
      }

      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');

      return JSON.stringify({
        content,
        path: response.data.path,
        sha: response.data.sha
      }, null, 2);
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
