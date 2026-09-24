"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient } from "../../lib/auth-client";
import { scanReturnPathFromLoginHash } from "../../lib/qr-client";

export function LoginError({ message }: Readonly<{ message: string }>) {
  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const result = await authClient.signIn.email({
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        rememberMe: false,
      });
      if (result.error) {
        setError("Email or password was not accepted.");
        setPending(false);
        return;
      }
      router.replace(scanReturnPathFromLoginHash(window.location.hash) ?? "/");
      router.refresh();
    } catch {
      setError("Email or password was not accepted.");
      setPending(false);
    }
  }

  return (
    <form className="auth-form" method="post" onSubmit={submit}>
      <label>
        <span>Email address</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          placeholder="name@company.com"
          required
        />
      </label>
      <label>
        <span>Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          required
        />
      </label>
      {error ? <LoginError message={error} /> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
