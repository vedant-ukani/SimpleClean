import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { parseBootstrapEnvironment } from "@laundrorama/config";
import { randomUUID } from "node:crypto";

import { AppModule } from "./app.module.js";
import { IdentityService } from "./modules/identity/identity.service.js";

async function provision(): Promise<void> {
  const { server, bootstrap } = parseBootstrapEnvironment(process.env);
  const application = await NestFactory.createApplicationContext(
    AppModule.register(server),
    { logger: false },
  );
  try {
    await application.get(IdentityService).provisionUser(bootstrap, {
      requestId: `provision-${randomUUID()}`,
    });
    process.stdout.write("Bootstrap user provisioned.\n");
  } finally {
    await application.close();
  }
}

void provision();
