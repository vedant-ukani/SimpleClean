import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { parseServerEnvironment } from "@simply-clean/config";
import { createTestEnvironment } from "@simply-clean/test-support";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module.js";

const applications: INestApplication[] = [];

afterEach(async () => {
  await Promise.all(
    applications.splice(0).map((application) => application.close()),
  );
});

describe("health endpoints", () => {
  it("reports liveness even when the database is unavailable", async () => {
    const module = await Test.createTestingModule({
      imports: [
        AppModule.register(
          parseServerEnvironment(
            createTestEnvironment({
              DATABASE_DRIVER: "postgres",
              DATABASE_URL:
                "postgres://unavailable:unavailable@127.0.0.1:1/unavailable",
            }),
          ),
        ),
      ],
    }).compile();
    const app = module.createNestApplication();
    applications.push(app);
    await app.init();

    await request(app.getHttpServer())
      .get("/health/live")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: "ok", service: "api" });
      });
    await request(app.getHttpServer())
      .get("/health/ready")
      .expect(503)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: "not_ready",
          dependencies: { database: "down" },
        });
      });
  });

  it("reports readiness with an isolated PGlite database", async () => {
    const module = await Test.createTestingModule({
      imports: [
        AppModule.register(parseServerEnvironment(createTestEnvironment())),
      ],
    }).compile();
    const app = module.createNestApplication();
    applications.push(app);
    await app.init();

    await request(app.getHttpServer())
      .get("/health/ready")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: "ready",
          dependencies: { database: "up" },
        });
      });
  });
});
