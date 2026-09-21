export const PWA_CACHE_PREFIX = "simply-clean-public-";
export const PWA_CACHE_VERSION = "v1";
export const PWA_CACHE_NAME = `${PWA_CACHE_PREFIX}${PWA_CACHE_VERSION}`;
export const PWA_CLEAR_CACHE_MESSAGE = "CLEAR_PUBLIC_PWA_CACHES";
export const PWA_OFFLINE_PATH = "/offline";

export const PWA_PUBLIC_ASSETS = [
  "/icons/app-icon-v1.svg",
  "/icons/app-maskable-v1.svg",
] as const;

export const PWA_PRECACHE_PATHS = [
  PWA_OFFLINE_PATH,
  ...PWA_PUBLIC_ASSETS,
] as const;

const PUBLIC_VERSIONED_PREFIXES = ["/_next/static/"] as const;

type CacheCandidate = {
  method: string;
  url: string;
};

export function isCacheablePublicAsset(
  request: CacheCandidate,
  applicationOrigin: string,
): boolean {
  if (request.method !== "GET") {
    return false;
  }

  let url: URL;
  try {
    url = new URL(request.url, applicationOrigin);
  } catch {
    return false;
  }

  if (url.origin !== applicationOrigin) {
    return false;
  }

  return (
    PUBLIC_VERSIONED_PREFIXES.some((prefix) =>
      url.pathname.startsWith(prefix),
    ) || PWA_PUBLIC_ASSETS.some((asset) => url.pathname === asset)
  );
}

export function createServiceWorkerSource(): string {
  return `"use strict";

const CACHE_PREFIX = ${JSON.stringify(PWA_CACHE_PREFIX)};
const CACHE_NAME = ${JSON.stringify(PWA_CACHE_NAME)};
const CLEAR_CACHE_MESSAGE = ${JSON.stringify(PWA_CLEAR_CACHE_MESSAGE)};
const OFFLINE_PATH = ${JSON.stringify(PWA_OFFLINE_PATH)};
const PRECACHE_PATHS = ${JSON.stringify(PWA_PRECACHE_PATHS)};
const PUBLIC_ASSETS = new Set(${JSON.stringify(PWA_PUBLIC_ASSETS)});
const PUBLIC_VERSIONED_PREFIXES = ${JSON.stringify(PUBLIC_VERSIONED_PREFIXES)};

function isCacheablePublicAsset(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return PUBLIC_ASSETS.has(url.pathname) ||
    PUBLIC_VERSIONED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

async function precachePublicShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(PRECACHE_PATHS.map(async (path) => {
    const response = await fetch(new Request(path, {
      cache: "reload",
      credentials: "omit",
    }));
    if (!response.ok || response.type === "opaqueredirect") {
      throw new Error("Public PWA asset could not be cached");
    }
    await cache.put(path, response);
  }));
}

async function removeOldPublicCaches() {
  const names = await caches.keys();
  await Promise.all(names
    .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
    .map((name) => caches.delete(name)));
}

async function clearPublicCaches() {
  const names = await caches.keys();
  await Promise.all(names
    .filter((name) => name.startsWith(CACHE_PREFIX))
    .map((name) => caches.delete(name)));
}

async function cachePublicAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
  }
  return response;
}

async function navigateWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(OFFLINE_PATH)) || new Response(
      "Simply Clean Operations is offline. Reconnect and try again.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precachePublicShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(removeOldPublicCaches().then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === CLEAR_CACHE_MESSAGE) {
    event.waitUntil(clearPublicCaches());
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (isCacheablePublicAsset(request)) {
    event.respondWith(cachePublicAsset(request));
    return;
  }

  if (
    request.method === "GET" &&
    request.mode === "navigate" &&
    url.origin === self.location.origin
  ) {
    event.respondWith(navigateWithOfflineFallback(request));
  }
});
`;
}
