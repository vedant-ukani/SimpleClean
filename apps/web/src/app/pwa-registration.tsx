"use client";

import { useEffect } from "react";

import {
  PWA_CLEAR_CACHE_MESSAGE,
  isOwnedPublicPwaCache,
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
      .filter(isOwnedPublicPwaCache)
      .map((name) => cacheStorage.delete(name)),
  );
}

export async function disablePwaServiceWorker(
  serviceWorkers: Pick<ServiceWorkerContainer, "getRegistration"> | undefined,
  cacheStorage: Pick<CacheStorage, "delete" | "keys"> | undefined,
): Promise<void> {
  const registration = await serviceWorkers?.getRegistration("/");
  await registration?.unregister();
  await clearPublicPwaCaches(cacheStorage, undefined);
}

export function PwaRegistration() {
  useEffect(() => {
    const serviceWorkers =
      "serviceWorker" in navigator ? navigator.serviceWorker : undefined;
    const cacheStorage = "caches" in window ? window.caches : undefined;

    if (process.env.NODE_ENV !== "production") {
      void disablePwaServiceWorker(serviceWorkers, cacheStorage).catch(() => {
        // The authenticated web app remains usable when PWA cleanup fails.
      });
      return;
    }

    void registerPwaServiceWorker(serviceWorkers, window.isSecureContext).catch(
      () => {
        // The authenticated web app remains usable when PWA installation fails.
      },
    );
  }, []);

  return null;
}
