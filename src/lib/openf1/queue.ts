/**
 * Sequential request queue enforcing OpenF1's unauthenticated rate limits.
 *
 * Limits are 3 requests/second AND 30 requests/minute. Both are enforced with
 * sliding windows: before each request we look at the timestamps of recent
 * requests and wait until sending another one cannot breach either window.
 *
 * Requests run strictly one at a time. That is slower than a parallel fan-out but
 * it is the only way to stay predictably inside a 3 req/s budget, and a full
 * session download is cached afterwards so the cost is paid once.
 */

export interface RateLimitConfig {
  perSecond: number;
  perMinute: number;
  /** Retries for transient failures (429 / 5xx / network). */
  maxRetries: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  perSecond: 3,
  perMinute: 30,
  maxRetries: 4,
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RateLimitedQueue {
  private readonly config: RateLimitConfig;
  /** Completion timestamps of recent sends, oldest first. */
  private history: number[] = [];
  /** Tail of the promise chain; every task links onto it, keeping order. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMIT, ...config };
  }

  /** Queue a task. Resolves with the task's result, preserving call order. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.chain.then(() => this.execute(task));
    // Keep the chain alive even if this task rejects, so later tasks still run.
    this.chain = result.catch(() => undefined);
    return result;
  }

  private async execute<T>(task: () => Promise<T>): Promise<T> {
    let attempt = 0;
    for (;;) {
      await this.waitForSlot();
      this.history.push(Date.now());
      try {
        return await task();
      } catch (error) {
        attempt += 1;
        if (attempt > this.config.maxRetries || !isRetryable(error)) throw error;
        // Exponential backoff: 1s, 2s, 4s, 8s.
        await sleep(1000 * 2 ** (attempt - 1));
      }
    }
  }

  /** Block until sending one more request breaches neither window. */
  private async waitForSlot(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.history = this.history.filter((t) => now - t < 60_000);

      const inLastSecond = this.history.filter((t) => now - t < 1000);
      const inLastMinute = this.history;

      let waitMs = 0;
      if (inLastSecond.length >= this.config.perSecond) {
        waitMs = Math.max(waitMs, 1000 - (now - inLastSecond[0]!));
      }
      if (inLastMinute.length >= this.config.perMinute) {
        waitMs = Math.max(waitMs, 60_000 - (now - inLastMinute[0]!));
      }

      if (waitMs <= 0) return;
      await sleep(waitMs + 20); // small cushion for clock jitter
    }
  }
}

/** HTTP error carrying the status code, so callers can branch on it. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`OpenF1 request failed (${status}): ${url}`);
    this.name = 'HttpError';
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) {
    // 429 = rate limited, 5xx = server trouble. Both are worth retrying.
    return error.status === 429 || error.status >= 500;
  }
  // Network-level failure (offline, DNS, aborted socket).
  return error instanceof TypeError;
}
