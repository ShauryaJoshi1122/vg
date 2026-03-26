export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableError(err: any) {
  const msg = String(err?.message ?? err ?? "");
  return (
    msg.includes("429") ||
    /5\d\d/.test(msg) ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ECONNRESET") ||
    msg.includes("EAI_AGAIN") ||
    msg.includes("timeout") ||
    msg.includes("temporarily unavailable")
  );
}

export async function retryable<T>(fn: () => Promise<T>, input?: { attempts?: number; baseDelayMs?: number }) {
  const attempts = input?.attempts ?? 4;
  const baseDelayMs = input?.baseDelayMs ?? 800;

  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (!isRetryableError(err) || i === attempts - 1) throw err;

      const backoff = baseDelayMs * Math.pow(2, i);
      const jitter = Math.floor(Math.random() * 250);
      await sleep(backoff + jitter);
    }
  }
  throw lastErr;
}

