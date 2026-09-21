"use client";

import { useEffect } from "react";

import {
  PWA_CACHE_PREFIX,
  PWA_CLEAR_CACHE_MESSAGE,
} from "../lib/pwa-cache-policy";

type ServiceWorkerRegistrationTarget = Pick<ServiceWorkerContainer, "register">;

export async function registerPwaServiceWorker(
  serviceWorkers: ServiceWorkerRegistrationTarget | undefined,
  secureContext: boolean,
): Promise<void> {
  if (!serviceWorkers || !secureContext) {
    return;
  }

  await serviceWorkers.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
}

export async function clearPublicPwaCaches(
  cacheStorage: Pick<CacheStorage, "delete" | "keys"> | undefined,
  serviceWorkers: Pick<ServiceWorkerContainer, "controller"> | undefined,
): Promise<void> {
  serviceWorkers?.controller?.postMessage({ type: PWA_CLEAR_CACHE_MESSAGE });

  if (!cacheStorage) {
    return;
  }

  const names = await cacheStorage.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(PWA_CACHE_PREFIX))
      .map((name) => cacheStorage.delete(name)),
  );
}

export function PwaRegistration() {
  useEffect(() => {
    void registerPwaServiceWorker(
      "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
      window.isSecureContext,
    ).catch(() => {
      // The authenticated web app remains usable when PWA installation fails.
    });
  }, []);

  return null;
}
