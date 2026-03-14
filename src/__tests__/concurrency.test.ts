import { describe, it, expect, vi } from 'vitest';
import { pLimit } from '../core/concurrency.js';

describe('pLimit', () => {
  it('limits concurrent executions', async () => {
    const limit = pLimit(2);
    let running = 0;
    let maxRunning = 0;

    const task = () => limit(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise(resolve => setTimeout(resolve, 50));
      running--;
      return 'done';
    });

    const results = await Promise.all([task(), task(), task(), task(), task(), task()]);

    expect(maxRunning).toBeLessThanOrEqual(2);
    expect(results).toEqual(['done', 'done', 'done', 'done', 'done', 'done']);
  });

  it('returns results in correct order', async () => {
    const limit = pLimit(2);
    const results = await Promise.all([
      limit(async () => { await new Promise(r => setTimeout(r, 30)); return 'a'; }),
      limit(async () => { await new Promise(r => setTimeout(r, 10)); return 'b'; }),
      limit(async () => 'c'),
    ]);

    expect(results).toEqual(['a', 'b', 'c']);
  });

  it('propagates errors', async () => {
    const limit = pLimit(2);
    await expect(limit(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  });

  it('allows concurrency of 1 (serial)', async () => {
    const limit = pLimit(1);
    let running = 0;
    let maxRunning = 0;

    const task = () => limit(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise(resolve => setTimeout(resolve, 10));
      running--;
      return 'done';
    });

    await Promise.all([task(), task(), task()]);
    expect(maxRunning).toBe(1);
  });

  it('handles high concurrency limit gracefully', async () => {
    const limit = pLimit(100);
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => limit(async () => i))
    );
    expect(results).toEqual([0, 1, 2, 3, 4]);
  });
});
