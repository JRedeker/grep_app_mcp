import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimitError } from '../core/retry.js';
import { UserError } from 'fastmcp';

vi.mock('../core/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../core/github-utils.js', async () => {
  const actual = await vi.importActual<typeof import('../core/github-utils.js')>('../core/github-utils.js');
  return {
    ...actual,
    fetchGitHubFilesWithOptions: vi.fn(),
  };
});

vi.mock('../core/cache.js', () => ({
  findCacheFiles: vi.fn(),
  getCachedData: vi.fn(),
}));

vi.mock('../core/grep-app-client.js', () => ({
  searchTool: {
    execute: vi.fn(),
  },
}));

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const reportProgress = vi.fn(async () => {});

describe('rate limit surfacing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns a top-level rate limit error for github_batch_files', async () => {
    const { fetchGitHubFilesWithOptions } = await import('../core/github-utils.js');
    vi.mocked(fetchGitHubFilesWithOptions).mockRejectedValueOnce(
      new RateLimitError('rate limited', 3, 45),
    );

    const { githubBatchFilesTool } = await import('../tools/github-batch-files-tool.js');
    const result = await githubBatchFilesTool.execute(
      { files: [{ owner: 'a', repo: 'b', path: 'c.ts' }] },
      { log, reportProgress },
    );

    expect(JSON.parse(result)).toEqual({
      error: 'GitHub API rate limit reached after 3 attempts. Try again in 45 seconds.',
    });
  });

  it('returns a top-level rate limit error for batch retrieval', async () => {
    const { fetchGitHubFilesWithOptions } = await import('../core/github-utils.js');
    const { findCacheFiles, getCachedData } = await import('../core/cache.js');

    vi.mocked(findCacheFiles).mockResolvedValueOnce(['cache-key.json']);
    vi.mocked(getCachedData).mockResolvedValueOnce({
      data: {
        nextPage: null,
        count: 1,
        hits: {
          hits: {
            'owner/repo': {
              'src/index.ts': {
                '1': 'match',
              },
            },
          },
        },
      },
      timestamp: Date.now(),
      size: 1,
      query: 'needle',
    });
    vi.mocked(fetchGitHubFilesWithOptions).mockRejectedValueOnce(
      new RateLimitError('rate limited', 4, 30),
    );

    const { batchRetrieveFiles } = await import('../core/batch-retrieval.js');
    const result = await batchRetrieveFiles(
      { query: 'needle', resultNumbers: [1] },
      { log, reportProgress },
    );

    expect(result).toMatchObject({
      success: false,
      files: [],
      error: 'GitHub API rate limit reached after 4 attempts. Try again in 30 seconds.',
    });
  });

  it('throws a UserError when grep.app retries are exhausted', async () => {
    const { searchTool } = await import('../core/grep-app-client.js');
    vi.mocked(searchTool.execute).mockRejectedValueOnce(
      new RateLimitError('rate limited', 2, 12),
    );

    const { searchCodeTool } = await import('../tools/search-code.js');

    await expect(
      searchCodeTool.execute(
        { query: 'needle', caseSensitive: false, useRegex: false, wholeWords: false },
        { log, reportProgress },
      ),
    ).rejects.toEqual(
      new UserError('grep.app rate limit reached after 2 attempts. Try again in 12 seconds.'),
    );
  });
});
