"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export function useOnlineStatus(onReconnect?: () => void): boolean {
  const [online, setOnline] = useState(true);
  const wasOffline = useRef(false);
  const reconnectHandler = useRef(onReconnect);
  reconnectHandler.current = onReconnect;

  useEffect(() => {
    const update = () => {
      const nextOnline = window.navigator.onLine;
      if (nextOnline && wasOffline.current) reconnectHandler.current?.();
      wasOffline.current = !nextOnline;
      setOnline(nextOnline);
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}

export function OnlineStatus() {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  const online = useOnlineStatus(refresh);
  if (online) return null;
  return (
    <div className="offline-banner" role="status" aria-live="polite">
      You are offline. Private records are not stored on this device. Reconnect
      to view or save work.
    </div>
  );
}
