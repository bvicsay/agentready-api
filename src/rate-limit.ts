import { ApiError } from "./api-platform.js";

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  contactEmail: string;
  now?: () => number;
};

type RateLimitStatus = { remaining: number; resetAt: number };

export class RateLimitExceededError extends ApiError {
  constructor(
    public readonly limit: number,
    public readonly resetAt: number,
    contactEmail: string,
  ) {
    super(
      429,
      "rate_limit_exceeded",
      `You're using this API a lot. Please contact ${contactEmail} to discuss higher limits.`,
    );
  }
}

export function createFixedWindowRateLimiter({
  limit,
  windowMs,
  contactEmail,
  now = Date.now,
}: RateLimitOptions) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    consume(subject: string): RateLimitStatus {
      const timestamp = now();
      const current = buckets.get(subject);
      const bucket =
        !current || current.resetAt <= timestamp
          ? { count: 0, resetAt: timestamp + windowMs }
          : current;

      if (bucket.count >= limit) {
        throw new RateLimitExceededError(limit, bucket.resetAt, contactEmail);
      }

      bucket.count += 1;
      buckets.set(subject, bucket);
      return { remaining: limit - bucket.count, resetAt: bucket.resetAt };
    },
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const scanRateLimiter = createFixedWindowRateLimiter({
  limit: positiveInteger(process.env.API_RATE_LIMIT, 60),
  windowMs: positiveInteger(process.env.API_RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000),
  contactEmail: process.env.SUPPORT_EMAIL || "barnabas@adaptmypage.com",
});
