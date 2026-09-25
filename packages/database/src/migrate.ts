import { parseServerEnvironment } from "@laundrorama/config";

import { migrateDatabase } from "./database.js";

async function main(): Promise<void> {
  const config = parseServerEnvironment(process.env);
  await migrateDatabase(config);
}

void main().catch(() => {
  process.stderr.write("Database migration failed.\n");
  process.exitCode = 1;
});
