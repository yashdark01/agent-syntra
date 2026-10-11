export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitter?: boolean;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  signal?: AbortSignal;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'signal' | 'onRetry' | 'shouldRetry'>> = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  backoffFactor: 2,
  jitter: true,
};

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Operation aborted'));
      return;
    }

    const timer = setTimeout(() => {
      resolve();
    }, ms);

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(signal.reason ?? new Error('Operation aborted'));
        },
        { once: true }
      );
    }
  });
}

/**
 * Calculates exponential backoff delay with optional random jitter.
 */
export function calculateBackoff(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffFactor: number,
  useJitter: boolean
): number {
  const baseDelay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
  const cappedDelay = Math.min(baseDelay, maxDelayMs);

  if (!useJitter) {
    return cappedDelay;
  }

  // Jitter between 0.5x and 1.5x of capped delay
  const randomFactor = 0.5 + Math.random();
  return Math.min(Math.floor(cappedDelay * randomFactor), maxDelayMs);
}

/**
 * Executes an asynchronous operation with exponential backoff and jitter.
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_RETRY_OPTIONS.maxAttempts;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_RETRY_OPTIONS.initialDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_RETRY_OPTIONS.maxDelayMs;
  const backoffFactor = options.backoffFactor ?? DEFAULT_RETRY_OPTIONS.backoffFactor;
  const jitter = options.jitter ?? DEFAULT_RETRY_OPTIONS.jitter;

  let attempt = 1;

  while (attempt <= maxAttempts) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error('Operation aborted');
    }

    try {
      return await operation(attempt);
    } catch (error: unknown) {
      if (options.signal?.aborted) {
        throw options.signal.reason ?? error;
      }

      if (attempt >= maxAttempts) {
        throw error;
      }

      // Check whether error is retryable
      if (options.shouldRetry && !options.shouldRetry(error, attempt)) {
        throw error;
      }

      const delayMs = calculateBackoff(attempt, initialDelayMs, maxDelayMs, backoffFactor, jitter);
      if (options.onRetry) {
        options.onRetry(error, attempt, delayMs);
      }

      await sleep(delayMs, options.signal);
      attempt++;
    }
  }

  throw new Error(`Exceeded maximum retry attempts (${maxAttempts})`);
}
