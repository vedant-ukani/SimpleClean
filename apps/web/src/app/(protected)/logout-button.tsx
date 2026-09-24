"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

import { authClient } from "../../lib/auth-client";
import { clearPublicPwaCaches } from "../pwa-registration";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function logout() {
    setPending(true);
    setError(undefined);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("Sign out failed. Do not hand off this device yet.");
        setPending(false);
        return;
      }
      await clearPublicPwaCaches(
        "caches" in window ? window.caches : undefined,
        "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
      ).catch(() => {
        // Public assets contain no user data; failed cleanup must not undo a
        // successful server-side sign-out.
      });
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Sign out failed. Do not hand off this device yet.");
      setPending(false);
    }
  }

  return (
    <div className="logout-control">
      <button className="secondary-button" type="button" onClick={logout}>
        <LogOut aria-hidden="true" size={16} />
        {pending ? "Signing out…" : "Switch user / sign out"}
      </button>
      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
