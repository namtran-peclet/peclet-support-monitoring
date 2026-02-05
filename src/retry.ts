export interface RetryOptions {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxRetries, delayMs, backoffMultiplier = 2, onRetry } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const waitTime = delayMs * Math.pow(backoffMultiplier, attempt - 1);

        if (onRetry) {
          onRetry(attempt, lastError);
        }

        console.log(`Attempt ${attempt}/${maxRetries} failed. Retrying in ${waitTime}ms...`);
        await sleep(waitTime);
      }
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
