"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "../../lib/auth-client";

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
