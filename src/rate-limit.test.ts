import { describe, expect, it } from "vitest";
import { ApiError } from "./api-platform.js";
import { createFixedWindowRateLimiter } from "./rate-limit.js";

describe("customer scan rate limit", () => {
  it("allows requests up to the account limit and then directs the customer to support", () => {
    const limit = createFixedWindowRateLimiter({
      limit: 2,
      windowMs: 60_000,
      contactEmail: "barnabas@adaptmypage.com",
      now: () => 1_000,
    });

    expect(limit.consume("user_123")).toEqual({ remaining: 1, resetAt: 61_000 });
    expect(limit.consume("user_123")).toEqual({ remaining: 0, resetAt: 61_000 });
    expect(() => limit.consume("user_123")).toThrowError(
      expect.objectContaining({
        status: 429,
        code: "rate_limit_exceeded",
        message:
          "You're using this API a lot. Please contact barnabas@adaptmypage.com to discuss higher limits.",
      } satisfies Partial<ApiError>),
    );
  });

  it("keeps each customer account in a separate usage bucket", () => {
    const limit = createFixedWindowRateLimiter({
      limit: 1,
      windowMs: 60_000,
      contactEmail: "barnabas@adaptmypage.com",
      now: () => 1_000,
    });

    limit.consume("user_one");
    expect(limit.consume("user_two")).toEqual({ remaining: 0, resetAt: 61_000 });
  });
});
