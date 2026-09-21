"use client";

import type { ApplicationRole, IdentityUser } from "@simply-clean/contracts";
import { useState, type FormEvent } from "react";

import {
  changeIdentityActive,
  changeIdentityRole,
  createIdentityUser,
  revokeIdentitySessions,
} from "../../../../lib/identity-client";
import { useOnlineStatus } from "../../online-status";
import { useServerState } from "../../use-server-state";

const roleLabels: Record<ApplicationRole, string> = {
  owner_admin: "Owner Admin",
  warehouse: "Warehouse",
  technician_cleaner: "Technician / Cleaner",
};

export function TeamManagement({
  initialUsers,
}: Readonly<{ initialUsers: IdentityUser[] }>) {
  const [users, setUsers] = useServerState(initialUsers);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();

  function beginMutation(): boolean {
    if (!online) {
      setMessage("Reconnect before changing team access.");
      return false;
    }
    setBusy(true);
    return true;
  }

  function replaceUser(updated: IdentityUser) {
    setUsers((current) =>
      current.map((user) => (user.id === updated.id ? updated : user)),
    );
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!beginMutation()) return;
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const created = await createIdentityUser({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        role: String(form.get("role") ?? "") as ApplicationRole,
      });
      setUsers((current) => [...current, created]);
      event.currentTarget.reset();
      setMessage("User created. Share the initial password securely.");
    } catch {
      setMessage("The user could not be created. Check the details and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(user: IdentityUser, role: ApplicationRole) {
    if (!beginMutation()) return;
    try {
      replaceUser(
        await changeIdentityRole(user.id, {
          role,
          expectedVersion: user.version,
        }),
      );
      setMessage("Role updated. Existing sessions were revoked.");
    } catch {
      setMessage("The role could not be changed. Refresh and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function changeActive(user: IdentityUser) {
    if (!beginMutation()) return;
    try {
      replaceUser(
        await changeIdentityActive(user.id, {
          active: !user.active,
          expectedVersion: user.version,
        }),
      );
      setMessage(
        user.active
          ? "User deactivated and sessions revoked."
          : "User activated.",
      );
    } catch {
      setMessage("The account state could not be changed. Refresh and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(user: IdentityUser) {
    if (!beginMutation()) return;
    try {
      await revokeIdentitySessions(user.id);
      setMessage(`Sessions revoked for ${user.name}.`);
    } catch {
      setMessage("Sessions could not be revoked. Retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="management-grid">
      <section className="panel" aria-labelledby="create-user-heading">
        <h2 id="create-user-heading">Create pilot user</h2>
        <form className="auth-form" onSubmit={create}>
          <label>
            Name
            <input name="name" required />
          </label>
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Initial password
            <input name="password" type="password" minLength={8} required />
          </label>
          <label>
            Role
            <select name="role" defaultValue="warehouse">
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy || !online}>
            {busy ? "Saving…" : "Create user"}
          </button>
        </form>
      </section>

      <section className="panel team-list" aria-labelledby="team-heading">
        <h2 id="team-heading">Team</h2>
        {message ? (
          <p className="form-message" role="status">
            {message}
          </p>
        ) : null}
        {users.map((user) => (
          <article className="user-row" key={user.id}>
            <div>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
              <small>{user.active ? "Active" : "Inactive"}</small>
            </div>
            <label>
              <span className="sr-only">Role for {user.name}</span>
              <select
                disabled={busy || !online}
                value={user.role}
                onChange={(event) =>
                  void changeRole(user, event.target.value as ApplicationRole)
                }
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="row-actions">
              <button
                type="button"
                disabled={busy || !online}
                onClick={() => void changeActive(user)}
              >
                {user.active ? "Deactivate" : "Activate"}
              </button>
              <button
                type="button"
                disabled={busy || !online}
                onClick={() => void revoke(user)}
              >
                Revoke sessions
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
