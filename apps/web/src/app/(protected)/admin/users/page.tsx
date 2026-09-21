import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  getCurrentIdentity,
  getIdentityUsers,
} from "../../../../lib/identity-client";
import { canManageUsers } from "../../../../lib/navigation";
import { TeamManagement } from "./team-management";

export default async function UsersPage() {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const identity = await getCurrentIdentity(fetch, process.env, cookie);
  if (!canManageUsers(identity.user.role)) {
    redirect("/");
  }
  const users = await getIdentityUsers(fetch, process.env, cookie);
  return (
    <main className="page-main page-main--wide">
      <div className="page-heading">
        <p className="eyebrow">Owner Admin</p>
        <h1>Team management</h1>
        <p className="lede">
          Create individual staff accounts, set current roles, and end sessions
          before a shared tablet changes hands.
        </p>
      </div>
      <TeamManagement initialUsers={users} />
    </main>
  );
}
