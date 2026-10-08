import { describe, it, expect } from 'vitest';
import {
  LLMError,
  AuthenticationError,
  RateLimitError,
  ProviderUnavailableError,
  ContextLengthError,
  InvalidRequestError,
  CancellationError,
} from '@syntra/core';

describe('Domain Errors Hierarchy', () => {
  it('instantiates AuthenticationError with status 401 and non-retryable flag', () => {
    const err = new AuthenticationError('Bad credentials', { provider: 'openai' });
    expect(err).toBeInstanceOf(LLMError);
    expect(err.statusCode).toBe(401);
    expect(err.isRetryable).toBe(false);
    expect(err.provider).toBe('openai');
    expect(err.toUserMessage()).toContain('[openai]');
  });

  it('instantiates RateLimitError with status 429 and retryable flag', () => {
    const err = new RateLimitError('Limit hit', { provider: 'anthropic', retryAfterSeconds: 30 });
    expect(err.statusCode).toBe(429);
    expect(err.isRetryable).toBe(true);
    expect(err.retryAfterSeconds).toBe(30);
  });

  it('instantiates ProviderUnavailableError with 503 and retryable flag', () => {
    const err = new ProviderUnavailableError('Server down', { provider: 'gemini' });
    expect(err.statusCode).toBe(503);
    expect(err.isRetryable).toBe(true);
  });

  it('instantiates ContextLengthError and InvalidRequestError with non-retryable flag', () => {
    const ctxErr = new ContextLengthError();
    expect(ctxErr.isRetryable).toBe(false);
    expect(ctxErr.statusCode).toBe(400);

    const reqErr = new InvalidRequestError();
    expect(reqErr.isRetryable).toBe(false);
    expect(reqErr.statusCode).toBe(400);
  });

  it('instantiates CancellationError cleanly', () => {
    const cancelErr = new CancellationError('Cancelled by user');
    expect(cancelErr.message).toBe('Cancelled by user');
    expect(cancelErr.isRetryable).toBe(false);
  });
});
