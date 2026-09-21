import { createTestEnvironment } from "@simply-clean/test-support";
import { describe, expect, it, vi } from "vitest";

import {
  getCurrentIdentity,
  IdentityRequestError,
  identityRequiresSignIn,
} from "../src/lib/identity-client";

describe("identity client", () => {
  it("validates the current identity response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: "user-1",
            name: "Warehouse Worker",
            email: "warehouse@example.test",
            role: "warehouse",
            active: true,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          permissions: ["platform.access", "identity.self.read"],
        }),
        { status: 200 },
      ),
    );
    await expect(
      getCurrentIdentity(fetcher, createTestEnvironment(), "session=cookie"),
    ).resolves.toMatchObject({ user: { role: "warehouse" } });
    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:3001/identity/me",
      expect.objectContaining({
        headers: expect.objectContaining({ cookie: "session=cookie" }),
      }),
    );
  });

  it("rejects an unvalidated role from the API", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: "user-1",
            name: "Forged",
            email: "forged@example.test",
            role: "admin",
            active: true,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          permissions: ["identity.users.manage"],
        }),
        { status: 200 },
      ),
    );
    await expect(
      getCurrentIdentity(fetcher, createTestEnvironment()),
    ).rejects.toThrow();
  });

  it("separates expired sessions from service unavailability", () => {
    expect(identityRequiresSignIn(new IdentityRequestError(401))).toBe(true);
    expect(identityRequiresSignIn(new IdentityRequestError(403))).toBe(true);
    expect(identityRequiresSignIn(new IdentityRequestError(503))).toBe(false);
    expect(identityRequiresSignIn(new TypeError("network unavailable"))).toBe(
      false,
    );
  });
});
