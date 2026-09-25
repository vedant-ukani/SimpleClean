import { headers } from "next/headers";
import {
  getCurrentIdentity,
  getIdentityUsers,
} from "../../../../lib/identity-client";
import {
  getProductionSpecialties,
  getTestQueue,
  getTestWork,
} from "../../../../lib/production-client";
import { readProtectedRouteData } from "../../../../lib/server-route-state";
import { TestWorkView } from "./test-work-view";

export default async function TestWorkPage({
  params,
}: Readonly<{ params: Promise<{ orderId: string }> }>) {
  const [{ orderId }, requestHeaders] = await Promise.all([params, headers()]);
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const identity = await readProtectedRouteData(
    getCurrentIdentity(fetch, process.env, cookie),
  );
  const detail = await readProtectedRouteData(
    getTestWork(orderId, fetch, process.env, cookie),
  );
  const activeSession =
    identity.user.role === "technician_cleaner"
      ? (await readProtectedRouteData(getTestQueue(fetch, process.env, cookie)))
          .activeSession
      : null;
  let assignable: { id: string; name: string }[] = [];
  if (identity.user.role === "owner_admin") {
    const [users, assignments] = await readProtectedRouteData(
      Promise.all([
        getIdentityUsers(fetch, process.env, cookie),
        getProductionSpecialties(fetch, process.env, cookie),
      ]),
    );
    assignable = users
      .filter(
        (user) =>
          user.active &&
          user.role === "technician_cleaner" &&
          assignments
            .find((assignment) => assignment.userId === user.id)
            ?.specialties.join("") === detail.order.machineType,
      )
      .map((user) => ({ id: user.id, name: user.name }));
  }
  return (
    <main className="page-main page-main--wide">
      <TestWorkView
        initialDetail={detail}
        actorUserId={identity.user.id}
        owner={identity.user.role === "owner_admin"}
        assignable={assignable}
        activeSession={activeSession}
      />
    </main>
  );
}
