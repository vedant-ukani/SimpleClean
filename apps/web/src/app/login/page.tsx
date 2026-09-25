import { LockKeyhole, ShieldCheck } from "lucide-react";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-intro" aria-label="Laundrorama operations">
        <div className="auth-intro-mark" aria-hidden="true">
          <ShieldCheck size={22} strokeWidth={2.2} />
        </div>
        <p className="eyebrow">Laundrorama Operations</p>
        <h1>Keep every load moving.</h1>
        <p className="lede">
          A calm, focused workspace for receiving equipment and keeping its
          identity and evidence together.
        </p>
        <p className="auth-security-note">
          <LockKeyhole aria-hidden="true" size={16} />
          Individual staff access · private operational records
        </p>
      </section>
      <section className="auth-card" aria-labelledby="login-heading">
        <div className="auth-card-heading">
          <div className="brand-mark" aria-hidden="true">
            L
          </div>
          <div>
            <p className="eyebrow">Staff access</p>
            <h2 id="login-heading">Staff sign in</h2>
          </div>
        </div>
        <p className="lede">
          Use your individual staff account. Sign out before handing a shared
          tablet to another person.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
