export type RetryFn = <T>(fn: () => Promise<T>) => Promise<T>;

export const withRetry = <T>(
  fn: () => Promise<T>,
  attempts = 3,
  delayMs = 500,
): Promise<T> =>
  fn().catch((error) => {
    if (attempts > 1) {
      return new Promise((r) => setTimeout(r, delayMs)).then(() =>
        withRetry(fn, attempts - 1, delayMs)
      );
    }
    throw error;
  });

export const defaultRetry: RetryFn = (fn) => withRetry(fn);
