import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ role: "owner_admin" }));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => "session=test" }),
}));
vi.mock("../src/lib/identity-client", () => ({
  getCurrentIdentity: async () => ({ user: { role: identity.role } }),
}));
vi.mock("../src/lib/production-client", () => ({
  getTestQueue: async () => ({
    initialChecks: [],
    orders: [],
    myActiveMachines: [],
    availableTests: [],
    activeSession: null,
    specialties: [],
    otherMachineCount: 0,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../src/lib/server-route-state", () => ({
  readProtectedRouteData: async (data: Promise<unknown>) => data,
}));

import WorkPage from "../src/app/(protected)/work/page";

beforeEach(() => {
  identity.role = "owner_admin";
});

describe("Production Work page heading", () => {
  it.each([
    ["owner_admin", "Production Work"],
    ["technician_cleaner", "My Work"],
  ])("shows %s the %s heading", async (role, heading) => {
    identity.role = role;
    const markup = renderToStaticMarkup(
      await WorkPage({ searchParams: Promise.resolve({}) }),
    );
    expect(markup).toContain(`<h1>${heading}</h1>`);
    if (role === "owner_admin") expect(markup).not.toContain("Initial checks");
  });
});
