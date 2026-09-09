import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiKeyAuthenticator } from "./api-platform.js";

describe("API key authentication", () => {
  it("returns the customer identity attached to a valid key", async () => {
    const verify = vi.fn().mockResolvedValue({
      id: "ak_test_123",
      subject: "user_123",
      scopes: ["scans:run"],
    });
    const authenticate = createApiKeyAuthenticator(verify);

    await expect(authenticate("Bearer ak_test_secret")).resolves.toEqual({
      keyId: "ak_test_123",
      subject: "user_123",
      scopes: ["scans:run"],
    });
    expect(verify).toHaveBeenCalledWith("ak_test_secret");
  });

  it.each([undefined, "", "Basic abc", "Bearer", "Bearer one two"])(
    "rejects a missing or malformed bearer credential: %s",
    async (authorization) => {
      const authenticate = createApiKeyAuthenticator(vi.fn());

      await expect(authenticate(authorization)).rejects.toMatchObject({
        status: 401,
        code: "api_key_required",
      } satisfies Partial<ApiError>);
    },
  );

  it("does not expose validation dependency failures", async () => {
    const authenticate = createApiKeyAuthenticator(async () => {
      throw new Error("upstream details");
    });

    await expect(authenticate("Bearer ak_test_secret")).rejects.toMatchObject({
      status: 503,
      code: "authentication_unavailable",
    } satisfies Partial<ApiError>);
  });
});
