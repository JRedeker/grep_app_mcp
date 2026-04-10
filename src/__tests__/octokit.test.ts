import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('shared octokit instance', () => {
  const originalEnv = process.env.GITHUB_TOKEN;

  afterEach(() => {
    // Restore env
    if (originalEnv !== undefined) {
      process.env.GITHUB_TOKEN = originalEnv;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
    // Clear module cache so each test gets a fresh import
    vi.resetModules();
  });

  it('exports an octokit instance', async () => {
    const { octokit } = await import('../core/octokit.js');
    expect(octokit).toBeDefined();
    expect(typeof octokit.rest.repos.getContent).toBe('function');
  });

  it('exports a createOctokit factory', async () => {
    const { createOctokit } = await import('../core/octokit.js');
    expect(typeof createOctokit).toBe('function');
    const instance = createOctokit();
    expect(instance).toBeDefined();
  });

  it('uses GITHUB_TOKEN when available', async () => {
    process.env.GITHUB_TOKEN = 'test-token-123';
    const { createOctokit } = await import('../core/octokit.js');
    const instance = createOctokit();
    // The instance should be created — we can't easily inspect auth,
    // but we verify it doesn't throw with a token
    expect(instance).toBeDefined();
  });

  it('works without GITHUB_TOKEN (unauthenticated)', async () => {
    delete process.env.GITHUB_TOKEN;
    const { createOctokit } = await import('../core/octokit.js');
    const instance = createOctokit();
    expect(instance).toBeDefined();
  });

  it('passes request timeout to Octokit constructor (authenticated)', async () => {
    process.env.GITHUB_TOKEN = 'test-token-timeout';
    const MockOctokit = vi.fn();
    vi.doMock('@octokit/rest', () => ({ Octokit: MockOctokit }));
    vi.doMock('../core/logger.js', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { createOctokit } = await import('../core/octokit.js');
    createOctokit();

    expect(MockOctokit).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: 'test-token-timeout',
        request: expect.objectContaining({ timeout: 10000 }),
      }),
    );
  });

  it('passes request timeout to Octokit constructor (unauthenticated)', async () => {
    delete process.env.GITHUB_TOKEN;
    const MockOctokit = vi.fn();
    vi.doMock('@octokit/rest', () => ({ Octokit: MockOctokit }));
    vi.doMock('../core/logger.js', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const { createOctokit } = await import('../core/octokit.js');
    createOctokit();

    expect(MockOctokit).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ timeout: 10000 }),
      }),
    );
  });
});
