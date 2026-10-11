import { describe, it, expect, vi } from 'vitest';
import { withRetry, calculateBackoff } from '@syntra/shared';
import { AuthenticationError, RateLimitError } from '@syntra/core';

describe('withRetry Utility', () => {
  it('calculates exponential backoff correctly', () => {
    const delay1 = calculateBackoff(1, 100, 1000, 2, false);
    const delay2 = calculateBackoff(2, 100, 1000, 2, false);
    const delay3 = calculateBackoff(3, 100, 1000, 2, false);

    expect(delay1).toBe(100);
    expect(delay2).toBe(200);
    expect(delay3).toBe(400);
  });

  it('caps backoff delay at maxDelayMs', () => {
    const delay = calculateBackoff(10, 100, 500, 2, false);
    expect(delay).toBe(500);
  });

  it('succeeds on first attempt without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, { maxAttempts: 3 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable transient error and eventually succeeds', async () => {
    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        throw new RateLimitError('Too many requests');
      }
      return 'recovered';
    });

    const result = await withRetry(fn, {
      maxAttempts: 4,
      initialDelayMs: 5,
      jitter: false,
      shouldRetry: (err) => err instanceof RateLimitError,
    });

    expect(result).toBe('recovered');
    expect(callCount).toBe(3);
  });

  it('aborts immediately for non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(new AuthenticationError('Invalid API key'));

    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 5,
        shouldRetry: (err) => !(err instanceof AuthenticationError),
      })
    ).rejects.toThrowError(AuthenticationError);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
