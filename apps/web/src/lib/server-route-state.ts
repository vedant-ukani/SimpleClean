import { notFound, redirect } from "next/navigation";

import { requestStatus } from "./request-status";

export async function readProtectedRouteData<T>(
  request: Promise<T>,
): Promise<T> {
  try {
    return await request;
  } catch (error) {
    const status = requestStatus(error);
    if (status === 401) redirect("/login");
    if (status === 403 || status === 404) notFound();
    throw error;
  }
}
