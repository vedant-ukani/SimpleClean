import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-heading">
        <div className="brand-mark" aria-hidden="true">
          SC
        </div>
        <p className="eyebrow">Simply Clean Operations</p>
        <h1 id="login-heading">Staff sign in</h1>
        <p className="lede">
          Use your individual staff account. Sign out before handing a shared
          tablet to another person.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
