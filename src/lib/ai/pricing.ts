/**
 * Model pricing, in USD per million tokens.
 *
 * Cache writes cost ~1.25x the input rate and cache reads ~0.1x, so a stable
 * system prompt pays a small premium once and then costs almost nothing to
 * re-send. That matters here: observed usage runs about 25 input tokens per
 * output token, so input is essentially the whole bill.
 */
export interface ModelRate {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export const MODEL_PRICING: Record<string, ModelRate> = {
  "claude-opus-5": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  // Gemini is no longer used by any agent; kept so old usage_logs rows
  // still price correctly rather than falling through to the Opus rate.
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cacheWrite: 0.375, cacheRead: 0.03 },
};

/** Cheaper model to fall back to when the monthly budget is nearly spent. */
export const FALLBACK_MODEL = "claude-haiku-4-5";

export function costUsd(
  modelName: string,
  inputTokens: number,
  outputTokens: number,
  cacheWriteTokens = 0,
  cacheReadTokens = 0
): number {
  const rate = MODEL_PRICING[modelName];
  // An unknown model is priced as the most expensive one rather than as free,
  // so a missing entry can never silently hide spend from the budget check.
  const r = rate ?? MODEL_PRICING["claude-opus-5"];

  return (
    (inputTokens / 1_000_000) * r.input +
    (outputTokens / 1_000_000) * r.output +
    (cacheWriteTokens / 1_000_000) * r.cacheWrite +
    (cacheReadTokens / 1_000_000) * r.cacheRead
  );
}
