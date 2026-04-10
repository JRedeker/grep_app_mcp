import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('../core/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../core/cache.js', () => ({
  generateCacheKey: vi.fn(() => 'test-key'),
  getCachedData: vi.fn().mockResolvedValue(null),
  cacheData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('axios');

const { default: axios } = await import('axios');
const { searchTool } = await import('../core/grep-app-client.js');

describe('grep-app-client timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes timeout to axios.get requests', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        hits: { hits: [] },
        facets: { pages: 1, count: 0 },
      },
    });

    await searchTool.execute(
      { query: 'test', caseSensitive: false, useRegex: false, wholeWords: false },
      { log: { info: vi.fn() }, reportProgress: vi.fn() },
    );

    expect(axios.get).toHaveBeenCalledWith(
      'https://grep.app/api/search',
      expect.objectContaining({ timeout: 10000 }),
    );
  });
});
