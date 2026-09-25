import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

import { viewport } from "../src/app/layout";
import manifest from "../src/app/manifest";
import { GET as getServiceWorker } from "../src/app/sw.js/route";
import {
  clearPublicPwaCaches,
  disablePwaServiceWorker,
  registerPwaServiceWorker,
} from "../src/app/pwa-registration";
import {
  PWA_CACHE_NAME,
  PWA_CACHE_PREFIX,
  PWA_LEGACY_CACHE_PREFIX,
  PWA_CLEAR_CACHE_MESSAGE,
  PWA_OFFLINE_PATH,
  createServiceWorkerSource,
  isCacheablePublicAsset,
  isOwnedPublicPwaCache,
} from "../src/lib/pwa-cache-policy";

const origin = "https://operations.example.test";

describe("PWA install metadata", () => {
  it("describes a scoped standalone application with safe public icons", () => {
    expect(manifest()).toMatchObject({
      name: "Laundrorama Operations",
      start_url: "/",
      scope: "/",
      display: "standalone",
      theme_color: "#132d29",
    });
    expect(manifest().icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ purpose: "any" }),
        expect.objectContaining({ purpose: "maskable" }),
      ]),
    );
    expect(viewport).toMatchObject({
      width: "device-width",
      initialScale: 1,
      themeColor: "#132d29",
    });
  });
});

describe("PWA cache policy", () => {
  it.each([
    "/_next/static/chunks/app.abc123.js",
    "/_next/static/css/layout.abc123.css?version=1",
    "/icons/app-icon-v1.svg",
    "/icons/app-maskable-v1.svg",
  ])("allows the public versioned asset %s", (path) => {
    expect(
      isCacheablePublicAsset(
        { method: "GET", url: `${origin}${path}` },
        origin,
      ),
    ).toBe(true);
  });

  it.each([
    "/",
    "/login",
    "/loads",
    "/machines/machine-1",
    "/scan",
    "/api/session",
    "/api/files/file-1/content",
    "/admin/imports/run-1/report",
    "/api/inventory/machines/machine-1/qr-label",
    "/manifest.webmanifest",
    PWA_OFFLINE_PATH,
  ])("never stores application response %s", (path) => {
    expect(
      isCacheablePublicAsset(
        { method: "GET", url: `${origin}${path}` },
        origin,
      ),
    ).toBe(false);
  });

  it("rejects writes, cross-origin assets, malformed URLs, and prefix lookalikes", () => {
    expect(
      isCacheablePublicAsset(
        { method: "POST", url: `${origin}/_next/static/chunk.js` },
        origin,
      ),
    ).toBe(false);
    expect(
      isCacheablePublicAsset(
        {
          method: "GET",
          url: "https://cdn.example.test/_next/static/chunk.js",
        },
        origin,
      ),
    ).toBe(false);
    expect(
      isCacheablePublicAsset({ method: "GET", url: "http://[" }, origin),
    ).toBe(false);
    expect(
      isCacheablePublicAsset(
        { method: "GET", url: `${origin}/_next/static-private/record` },
        origin,
      ),
    ).toBe(false);
  });

  it("builds a worker that caches only the allowlist and network-fetches navigations", () => {
    const source = createServiceWorkerSource();

    expect(source).toContain(`const CACHE_NAME = "${PWA_CACHE_NAME}"`);
    expect(source).toContain("isCacheablePublicAsset(request)");
    expect(source).toContain('request.mode === "navigate"');
    expect(source).toContain("navigateWithOfflineFallback(request)");
    expect(source).not.toContain('cache.put("/api');
    expect(source).not.toContain('cache.put("/loads');
  });

  it("removes old Laundrorama and legacy public caches on activation and handoff", async () => {
    const source = createServiceWorkerSource();
    const deleteCache = vi.fn().mockResolvedValue(true);
    const claim = vi.fn().mockResolvedValue(undefined);
    const names = [
      `${PWA_CACHE_PREFIX}v1`,
      PWA_CACHE_NAME,
      `${PWA_LEGACY_CACHE_PREFIX}v2`,
      "other-application-cache",
      `unrelated-${PWA_LEGACY_CACHE_PREFIX}v2`,
    ];
    const listeners: Record<string, (event: unknown) => void> = {};
    runInNewContext(source, {
      caches: { keys: vi.fn().mockResolvedValue(names), delete: deleteCache },
      self: {
        addEventListener: (
          name: string,
          listener: (event: unknown) => void,
        ) => {
          listeners[name] = listener;
        },
        clients: { claim },
      },
    });
    let completion: Promise<unknown> | undefined;
    listeners.activate!({
      waitUntil: (work: Promise<unknown>) => {
        completion = work;
      },
    });
    await completion;

    expect(PWA_CACHE_NAME).toBe(`${PWA_CACHE_PREFIX}v2`);
    expect(deleteCache.mock.calls.map(([name]) => name)).toEqual([
      `${PWA_CACHE_PREFIX}v1`,
      `${PWA_LEGACY_CACHE_PREFIX}v2`,
    ]);
    expect(claim).toHaveBeenCalledOnce();

    deleteCache.mockClear();
    listeners.message!({
      data: { type: PWA_CLEAR_CACHE_MESSAGE },
      waitUntil: (work: Promise<unknown>) => {
        completion = work;
      },
    });
    await completion;
    expect(deleteCache.mock.calls.map(([name]) => name)).toEqual(
      names.slice(0, 3),
    );
    expect(isOwnedPublicPwaCache("other-application-cache")).toBe(false);
  });

  it("serves the worker with root scope and no HTTP caching", () => {
    const response = getServiceWorker();

    expect(response.headers.get("content-type")).toContain("text/javascript");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("service-worker-allowed")).toBe("/");
  });
});

describe("PWA lifecycle", () => {
  it("registers only in a secure context with update caching disabled", async () => {
    const register = vi.fn().mockResolvedValue(undefined);

    await registerPwaServiceWorker({ register }, true);
    await registerPwaServiceWorker({ register }, false);
    await registerPwaServiceWorker(undefined, true);

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  });

  it("clears only this application's public caches on shared-device handoff", async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    const postMessage = vi.fn();

    await clearPublicPwaCaches(
      {
        keys: vi
          .fn()
          .mockResolvedValue([
            `${PWA_CACHE_PREFIX}v0`,
            PWA_CACHE_NAME,
            `${PWA_LEGACY_CACHE_PREFIX}v1`,
            "other",
          ]),
        delete: deleteCache,
      },
      { controller: { postMessage } as unknown as ServiceWorker },
    );

    expect(deleteCache).toHaveBeenCalledTimes(3);
    expect(deleteCache).toHaveBeenCalledWith(`${PWA_CACHE_PREFIX}v0`);
    expect(deleteCache).toHaveBeenCalledWith(PWA_CACHE_NAME);
    expect(deleteCache).toHaveBeenCalledWith(`${PWA_LEGACY_CACHE_PREFIX}v1`);
    expect(deleteCache).not.toHaveBeenCalledWith("other");
    expect(postMessage).toHaveBeenCalledWith({
      type: PWA_CLEAR_CACHE_MESSAGE,
    });
  });

  it("disables the app worker and removes stale app caches in development", async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const getRegistration = vi.fn().mockResolvedValue({ unregister });
    const deleteCache = vi.fn().mockResolvedValue(true);
    const keys = vi
      .fn()
      .mockResolvedValue([
        `${PWA_CACHE_PREFIX}v1`,
        PWA_CACHE_NAME,
        `${PWA_LEGACY_CACHE_PREFIX}v1`,
        "other-application-cache",
      ]);

    await disablePwaServiceWorker(
      { getRegistration },
      { delete: deleteCache, keys },
    );

    expect(getRegistration).toHaveBeenCalledWith("/");
    expect(unregister).toHaveBeenCalledOnce();
    expect(deleteCache).toHaveBeenCalledWith(`${PWA_CACHE_PREFIX}v1`);
    expect(deleteCache).toHaveBeenCalledWith(PWA_CACHE_NAME);
    expect(deleteCache).toHaveBeenCalledWith(`${PWA_LEGACY_CACHE_PREFIX}v1`);
    expect(deleteCache).not.toHaveBeenCalledWith("other-application-cache");
  });
});
