import { parseWebServerEnvironment } from "@simply-clean/config";
import {
  CurrentIdentityResponseSchema,
  IdentityUserListResponseSchema,
  IdentityUserResponseSchema,
  RevokeIdentitySessionsResponseSchema,
  type ChangeIdentityActiveRequest,
  type ChangeIdentityRoleRequest,
  type CreateIdentityUserRequest,
  type CurrentIdentityResponse,
  type IdentityUser,
} from "@simply-clean/contracts";

import { requestStatus } from "./request-status";

export class IdentityRequestError extends Error {
  constructor(readonly status: number) {
    super(`Identity request failed with status ${status}`);
    this.name = "IdentityRequestError";
  }
}

export function identityRequiresSignIn(error: unknown): boolean {
  const status = requestStatus(error);
  return (
    error instanceof IdentityRequestError && (status === 401 || status === 403)
  );
}

async function requestJson(
  url: string,
  fetcher: typeof fetch,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetcher(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
    headers: {
      accept: "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new IdentityRequestError(response.status);
  }
  return response.json();
}

export async function getCurrentIdentity(
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<CurrentIdentityResponse> {
  const { apiBaseUrl } = parseWebServerEnvironment(environment);
  const response = await requestJson(
    `${apiBaseUrl}/identity/me`,
    fetcher,
    cookie ? { headers: { cookie } } : {},
  );
  return CurrentIdentityResponseSchema.parse(response);
}

export async function getIdentityUsers(
  fetcher: typeof fetch = fetch,
  environment: Record<string, string | undefined> = process.env,
  cookie?: string,
): Promise<IdentityUser[]> {
  const { apiBaseUrl } = parseWebServerEnvironment(environment);
  const response = await requestJson(
    `${apiBaseUrl}/identity/users`,
    fetcher,
    cookie ? { headers: { cookie } } : {},
  );
  return IdentityUserListResponseSchema.parse(response).users;
}

async function browserMutation(
  path: string,
  method: "POST" | "PATCH",
  body?: unknown,
): Promise<unknown> {
  return requestJson(`/api${path}`, fetch, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export async function createIdentityUser(
  input: CreateIdentityUserRequest,
): Promise<IdentityUser> {
  return IdentityUserResponseSchema.parse(
    await browserMutation("/identity/users", "POST", input),
  ).user;
}

export async function changeIdentityRole(
  userId: string,
  input: ChangeIdentityRoleRequest,
): Promise<IdentityUser> {
  return IdentityUserResponseSchema.parse(
    await browserMutation(`/identity/users/${userId}/role`, "PATCH", input),
  ).user;
}

export async function changeIdentityActive(
  userId: string,
  input: ChangeIdentityActiveRequest,
): Promise<IdentityUser> {
  return IdentityUserResponseSchema.parse(
    await browserMutation(`/identity/users/${userId}/active`, "PATCH", input),
  ).user;
}

export async function revokeIdentitySessions(userId: string): Promise<void> {
  RevokeIdentitySessionsResponseSchema.parse(
    await browserMutation(`/identity/users/${userId}/revoke-sessions`, "POST"),
  );
}
