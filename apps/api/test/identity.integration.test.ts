import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { parseServerEnvironment } from "@simply-clean/config";
import type { DatabaseConnection } from "@simply-clean/database";
import { createTestEnvironment } from "@simply-clean/test-support";
import { sql } from "drizzle-orm";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { IdentityService } from "../src/modules/identity/identity.service.js";
import { DATABASE_CONNECTION } from "../src/platform/database.module.js";

const applications: INestApplication[] = [];

afterEach(async () => {
  await Promise.all(
    applications.splice(0).map((application) => application.close()),
  );
});

async function createApplication(): Promise<INestApplication> {
  const config = parseServerEnvironment(createTestEnvironment());
  const module = await Test.createTestingModule({
    imports: [AppModule.register(config)],
  }).compile();
  await module.get<DatabaseConnection>(DATABASE_CONNECTION).migrate();
  const app = module.createNestApplication({ bodyParser: false });
  applications.push(app);
  await app.init();
  return app;
}

async function provision(
  app: INestApplication,
  input: {
    name: string;
    email: string;
    password: string;
    role: "owner_admin" | "warehouse" | "technician_cleaner";
  },
) {
  return app
    .get(IdentityService)
    .provisionUser(input, { requestId: "test-provision" });
}

async function login(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string[]> {
  const response = await request(app.getHttpServer())
    .post("/auth/sign-in/email")
    .set("origin", "http://localhost:3000")
    .send({ email, password })
    .expect(200);
  return response.headers["set-cookie"] as unknown as string[];
}

describe("identity authentication", () => {
  it("provisions, signs in, resolves the current profile, and logs out", async () => {
    const app = await createApplication();
    await request(app.getHttpServer()).get("/identity/me").expect(401);
    await request(app.getHttpServer())
      .post("/auth/sign-up/email")
      .set("origin", "http://localhost:3000")
      .send({
        name: "Public Signup",
        email: "signup@example.test",
        password: "not-allowed-password",
      })
      .expect(400);

    await provision(app, {
      name: "Pilot Owner",
      email: "OWNER@EXAMPLE.TEST",
      password: "correct-horse-battery-staple",
      role: "owner_admin",
    });

    const cookies = await login(
      app,
      "owner@example.test",
      "correct-horse-battery-staple",
    );
    expect(cookies.join(";")).toContain("HttpOnly");
    expect(cookies.join(";")).toContain("SameSite=Lax");

    await request(app.getHttpServer())
      .get("/identity/me")
      .set("Cookie", cookies)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          user: {
            email: "owner@example.test",
            role: "owner_admin",
            active: true,
          },
          permissions: [
            "platform.access",
            "identity.self.read",
            "identity.users.read",
            "identity.users.manage",
            "inventory.loads.read",
            "inventory.loads.manage",
            "inventory.machines.read",
            "inventory.machines.manage",
            "inventory.machines.verify",
            "inventory.machines.relocate",
            "inventory.locations.read",
            "inventory.locations.manage",
            "files.read",
            "files.write",
            "files.manage",
            "operations.audit.read",
            "operations.jobs.read",
            "operations.jobs.manage",
          ],
        });
      });

    await request(app.getHttpServer())
      .post("/auth/sign-out")
      .set("origin", "http://localhost:3000")
      .set("Cookie", cookies)
      .expect(200);
    await request(app.getHttpServer())
      .get("/identity/me")
      .set("Cookie", cookies)
      .expect(401);

    const activity = await app.get<DatabaseConnection>(DATABASE_CONNECTION)
      .database.execute(sql`
        select action from identity_security_activity order by created_at
      `);
    const rows = "rows" in activity ? activity.rows : activity;
    expect(rows.map((row) => row.action)).toEqual([
      "user_created",
      "signed_in",
      "signed_out",
    ]);
  });

  it("enforces Owner Admin user management and ignores forged roles", async () => {
    const app = await createApplication();
    const owner = await provision(app, {
      name: "Pilot Owner",
      email: "owner@example.test",
      password: "correct-horse-battery-staple",
      role: "owner_admin",
    });
    const ownerCookies = await login(
      app,
      owner.email,
      "correct-horse-battery-staple",
    );

    const created = await request(app.getHttpServer())
      .post("/identity/users")
      .set("Cookie", ownerCookies)
      .send({
        name: "Warehouse Worker",
        email: "warehouse@example.test",
        password: "warehouse-password",
        role: "warehouse",
      })
      .expect(201);
    const warehouse = created.body.user as {
      id: string;
      version: number;
    };
    const warehouseCookies = await login(
      app,
      "warehouse@example.test",
      "warehouse-password",
    );

    await request(app.getHttpServer())
      .get("/identity/users")
      .set("Cookie", warehouseCookies)
      .set("x-role", "owner_admin")
      .set("x-permissions", "identity.users.manage")
      .expect(403);
    await request(app.getHttpServer())
      .post("/identity/users")
      .set("Cookie", warehouseCookies)
      .send({
        name: "Forged Owner",
        email: "forged@example.test",
        password: "forged-password",
        role: "owner_admin",
        actorRole: "owner_admin",
      })
      .expect(403);

    await request(app.getHttpServer())
      .get("/identity/users")
      .set("Cookie", ownerCookies)
      .expect(200)
      .expect(({ body }) => {
        expect(body.users).toHaveLength(2);
      });

    const changedRole = await request(app.getHttpServer())
      .patch(`/identity/users/${warehouse.id}/role`)
      .set("Cookie", ownerCookies)
      .send({
        role: "technician_cleaner",
        expectedVersion: warehouse.version,
      })
      .expect(200);
    expect(changedRole.body.user.role).toBe("technician_cleaner");
    await request(app.getHttpServer())
      .get("/identity/me")
      .set("Cookie", warehouseCookies)
      .expect(401);

    const technicianCookies = await login(
      app,
      "warehouse@example.test",
      "warehouse-password",
    );
    await request(app.getHttpServer())
      .get("/identity/users")
      .set("Cookie", technicianCookies)
      .expect(403);

    const deactivated = await request(app.getHttpServer())
      .patch(`/identity/users/${warehouse.id}/active`)
      .set("Cookie", ownerCookies)
      .send({
        active: false,
        expectedVersion: changedRole.body.user.version,
      })
      .expect(200);
    await request(app.getHttpServer())
      .get("/identity/me")
      .set("Cookie", technicianCookies)
      .expect(401);
    await request(app.getHttpServer())
      .post("/auth/sign-in/email")
      .set("origin", "http://localhost:3000")
      .send({
        email: "warehouse@example.test",
        password: "warehouse-password",
      })
      .expect(401);

    const reactivated = await request(app.getHttpServer())
      .patch(`/identity/users/${warehouse.id}/active`)
      .set("Cookie", ownerCookies)
      .send({
        active: true,
        expectedVersion: deactivated.body.user.version,
      })
      .expect(200);
    expect(reactivated.body.user.active).toBe(true);
    const reactivatedCookies = await login(
      app,
      "warehouse@example.test",
      "warehouse-password",
    );
    await request(app.getHttpServer())
      .post(`/identity/users/${warehouse.id}/revoke-sessions`)
      .set("Cookie", ownerCookies)
      .expect(201)
      .expect({ revoked: true });
    await request(app.getHttpServer())
      .get("/identity/me")
      .set("Cookie", reactivatedCookies)
      .expect(401);

    const activity = await app.get<DatabaseConnection>(DATABASE_CONNECTION)
      .database.execute(sql`
        select action from identity_security_activity order by created_at
      `);
    const rows = "rows" in activity ? activity.rows : activity;
    expect(rows.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        "authorization_denied",
        "role_changed",
        "user_deactivated",
        "user_activated",
        "sessions_revoked",
      ]),
    );
    const central = await app.get<DatabaseConnection>(DATABASE_CONNECTION)
      .database.execute(sql`
        select action from operations_audit_entry
        where target_id = ${warehouse.id}
        order by created_at
      `);
    const centralRows = "rows" in central ? central.rows : central;
    expect(centralRows.map((row) => row.action)).toEqual([
      "identity.user.created",
      "identity.user.role_changed",
      "identity.user.deactivated",
      "identity.user.activated",
      "identity.user.sessions_revoked",
    ]);
  });

  it("protects the final active Owner Admin and rejects stale versions", async () => {
    const app = await createApplication();
    const owner = await provision(app, {
      name: "Pilot Owner",
      email: "owner@example.test",
      password: "correct-horse-battery-staple",
      role: "owner_admin",
    });
    const cookies = await login(
      app,
      owner.email,
      "correct-horse-battery-staple",
    );

    await request(app.getHttpServer())
      .patch(`/identity/users/${owner.id}/active`)
      .set("Cookie", cookies)
      .send({ active: false, expectedVersion: owner.version })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/identity/users/${owner.id}/role`)
      .set("Cookie", cookies)
      .send({ role: "warehouse", expectedVersion: owner.version })
      .expect(409);

    const second = await request(app.getHttpServer())
      .post("/identity/users")
      .set("Cookie", cookies)
      .send({
        name: "Second Owner",
        email: "second-owner@example.test",
        password: "second-owner-password",
        role: "owner_admin",
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/identity/users/${second.body.user.id}/role`)
      .set("Cookie", cookies)
      .send({
        role: "warehouse",
        expectedVersion: second.body.user.version + 1,
      })
      .expect(409);

    const identityService = app.get(IdentityService);
    const concurrent = await Promise.allSettled([
      identityService.changeRole(
        owner.id,
        { role: "warehouse", expectedVersion: owner.version },
        { actorUserId: owner.id, requestId: "concurrent-a" },
      ),
      identityService.changeRole(
        second.body.user.id,
        {
          role: "warehouse",
          expectedVersion: second.body.user.version,
        },
        { actorUserId: owner.id, requestId: "concurrent-b" },
      ),
    ]);
    expect(concurrent.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const owners = await app.get<DatabaseConnection>(DATABASE_CONNECTION)
      .database.execute(sql`
        select user_id
        from identity_profile
        where role = 'owner_admin' and active = true
      `);
    const ownerRows = "rows" in owners ? owners.rows : owners;
    expect(ownerRows).toHaveLength(1);
  });

  it("rejects an expired persisted session", async () => {
    const app = await createApplication();
    const owner = await provision(app, {
      name: "Pilot Owner",
      email: "owner@example.test",
      password: "correct-horse-battery-staple",
      role: "owner_admin",
    });
    const cookies = await login(
      app,
      owner.email,
      "correct-horse-battery-staple",
    );
    await app
      .get<DatabaseConnection>(DATABASE_CONNECTION)
      .database.execute(
        sql`update "session" set expires_at = now() - interval '1 minute' where user_id = ${owner.id}`,
      );
    await request(app.getHttpServer())
      .get("/identity/me")
      .set("Cookie", cookies)
      .expect(401);
  });
});
