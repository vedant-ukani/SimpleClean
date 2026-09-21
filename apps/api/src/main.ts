import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { parseServerEnvironment } from "@simply-clean/config";

import { AppModule } from "./app.module.js";
import { StructuredLogger } from "./platform/logging.js";

async function bootstrap(): Promise<void> {
  const config = parseServerEnvironment(process.env);
  const app = await NestFactory.create(AppModule.register(config), {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(StructuredLogger));
  app.enableShutdownHooks();
  await app.listen(config.apiPort, "0.0.0.0");
}

void bootstrap();
