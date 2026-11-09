import { AsyncLocalStorage } from "async_hooks";

const held = new AsyncLocalStorage<Set<string>>();
const tails = new Map<string, Promise<void>>();

export function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const current = held.getStore();
  if (current?.has(userId)) return Promise.resolve().then(fn);

  const run = () => {
    const set = new Set(held.getStore());
    set.add(userId);
    return held.run(set, fn);
  };

  const prev = tails.get(userId) ?? Promise.resolve();
  const next = prev.then(run, run);
  let settled!: Promise<void>;
  settled = next.then(
    () => {
      if (tails.get(userId) === settled) tails.delete(userId);
    },
    () => {
      if (tails.get(userId) === settled) tails.delete(userId);
    },
  );
  tails.set(userId, settled);
  return next;
}
