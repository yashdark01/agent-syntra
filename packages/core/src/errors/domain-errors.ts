/**
 * Base domain error for all LLM operations in Syntra.
 */
export class LLMError extends Error {
  public readonly provider?: string;
  public readonly statusCode?: number;
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    options: {
      provider?: string;
      statusCode?: number;
      isRetryable?: boolean;
      cause?: unknown;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.provider = options.provider;
    this.statusCode = options.statusCode;
    this.isRetryable = options.isRetryable ?? false;
    if (options.cause) {
      this.cause = options.cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Returns a clean, user-friendly message suitable for terminal display.
   */
  public toUserMessage(): string {
    const providerStr = this.provider ? ` [${this.provider}]` : '';
    return `${this.message}${providerStr}`;
  }
}

/**
 * Thrown when credentials (API key, token) are missing, expired, or rejected.
 */
export class AuthenticationError extends LLMError {
  constructor(message = 'Authentication failed. Please verify your API key.', options: { provider?: string; cause?: unknown } = {}) {
    super(message, { ...options, statusCode: 401, isRetryable: false });
  }
}

/**
 * Thrown when provider rate limit / quota has been exceeded.
 */
export class RateLimitError extends LLMError {
  public readonly retryAfterSeconds?: number;

  constructor(
    message = 'Rate limit reached. Please try again later or switch providers.',
    options: { provider?: string; retryAfterSeconds?: number; cause?: unknown } = {}
  ) {
    super(message, { ...options, statusCode: 429, isRetryable: true });
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/**
 * Thrown when the provider API is down, unresponsive, or experiencing server errors (5xx).
 */
export class ProviderUnavailableError extends LLMError {
  constructor(
    message = 'Provider service is currently unavailable or unreachable.',
    options: { provider?: string; statusCode?: number; cause?: unknown } = {}
  ) {
    super(message, { ...options, statusCode: options.statusCode ?? 503, isRetryable: true });
  }
}

/**
 * Thrown when user or system configuration is invalid or missing.
 */
export class InvalidConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidConfigurationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when input prompt + generation exceeds the model context window.
 */
export class ContextLengthError extends LLMError {
  constructor(
    message = 'Context length exceeded. Prompt is too large for the selected model.',
    options: { provider?: string; cause?: unknown } = {}
  ) {
    super(message, { ...options, statusCode: 400, isRetryable: false });
  }
}

/**
 * Thrown when request arguments or payload format are invalid.
 */
export class InvalidRequestError extends LLMError {
  constructor(
    message = 'Invalid request parameters.',
    options: { provider?: string; statusCode?: number; cause?: unknown } = {}
  ) {
    super(message, { ...options, statusCode: options.statusCode ?? 400, isRetryable: false });
  }
}

/**
 * Thrown when an active operation is cancelled by the user (e.g. via Ctrl+C / AbortSignal).
 */
export class CancellationError extends LLMError {
  constructor(
    message = 'Operation was cancelled.',
    options: { provider?: string; cause?: unknown } = {}
  ) {
    super(message, { ...options, isRetryable: false });
  }
}
