import { vi } from 'vitest';

const CHAIN_METHODS = ['from', 'where', 'orderBy', 'groupBy', 'limit', 'values', 'set', 'returning'] as const;

/**
 * Builds a minimal thenable stand-in for drizzle's chainable query builder
 * (`db.select().from().where()...`). Every chain method returns another
 * chainable wrapping the SAME terminal `result`, so `await` at the end of
 * any chain length resolves to `result` — good enough for route unit tests,
 * which only care about the final resolved rows, not the exact SQL shape.
 */
export function chainable<T>(result: T): T & Record<(typeof CHAIN_METHODS)[number], (...args: unknown[]) => unknown> {
  const promise = Promise.resolve(result);
  const obj: Record<string, unknown> = {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
  for (const method of CHAIN_METHODS) {
    obj[method] = vi.fn(() => chainable(result));
  }
  return obj as never;
}
