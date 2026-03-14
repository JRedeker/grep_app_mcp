/**
 * Simple concurrency limiter (pLimit-style).
 * Limits the number of concurrent async operations.
 *
 * @param concurrency Maximum number of concurrent executions.
 * @returns A function that wraps async operations with concurrency control.
 */
export function pLimit(concurrency: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: Array<() => void> = [];

  function next(): void {
    if (queue.length > 0 && active < concurrency) {
      const resolve = queue.shift()!;
      resolve();
    }
  }

  return async function <T>(fn: () => Promise<T>): Promise<T> {
    // Wait for a slot if at capacity
    if (active >= concurrency) {
      await new Promise<void>(resolve => queue.push(resolve));
    }

    active++;
    try {
      return await fn();
    } finally {
      active--;
      next();
    }
  };
}
