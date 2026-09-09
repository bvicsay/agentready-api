import { describe, expect, it } from "vitest";
import { validatePublicUrl } from "./public-network.js";

describe("validatePublicUrl", () => {
  it.each([
    "http://127.0.0.1",
    "http://[::1]",
    "http://localhost",
    "http://service.local",
    "https://example.com:8443",
    "ftp://example.com/file"
  ])("rejects non-public scan target %s", (target) => {
    expect(() => validatePublicUrl(target)).toThrow();
  });

  it("accepts a public HTTPS URL", () => {
    expect(validatePublicUrl("https://example.com/docs").href).toBe("https://example.com/docs");
  });
});
