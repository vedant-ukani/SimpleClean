import { PGlite } from "@electric-sql/pglite";
import type { ServerConfig } from "@laundrorama/config";
import { sql, type SQL } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import * as schema from "./schema.js";

export type DatabaseHandle =
  PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

export interface DatabaseExecutor {
  execute(query: SQL): Promise<unknown>;
}

export interface DatabaseConnection {
  readonly driver: "pglite" | "postgres";
  readonly database: DatabaseHandle;
  transaction<T>(
    operation: (database: DatabaseExecutor) => Promise<T>,
  ): Promise<T>;
  migrate(): Promise<void>;
  isReady(): Promise<boolean>;
  close(): Promise<void>;
}

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export function createDatabase(config: ServerConfig): DatabaseConnection {
  if (config.databaseDriver === "postgres") {
    if (!config.databaseUrl) {
      throw new Error("PostgreSQL database configuration is incomplete");
    }

    const client = postgres(config.databaseUrl, { max: 10 });
    const database = drizzlePostgres(client, { schema });
    return {
      driver: "postgres",
      database,
      async transaction(operation) {
        return database.transaction(async (transaction) =>
          operation(transaction),
        );
      },
      async migrate() {
        await migratePostgres(database, { migrationsFolder });
      },
      async isReady() {
        try {
          await database.execute(sql`select 1`);
          return true;
        } catch {
          return false;
        }
      },
      async close() {
        await client.end();
      },
    };
  }

  if (config.pgliteDataDir !== ":memory:") {
    mkdirSync(dirname(config.pgliteDataDir), { recursive: true });
  }
  const client =
    config.pgliteDataDir === ":memory:"
      ? new PGlite()
      : new PGlite(config.pgliteDataDir);
  const database = drizzlePglite(client, { schema });
  return {
    driver: "pglite",
    database,
    async transaction(operation) {
      return database.transaction(async (transaction) =>
        operation(transaction),
      );
    },
    async migrate() {
      await migratePglite(database, { migrationsFolder });
    },
    async isReady() {
      try {
        await database.execute(sql`select 1`);
        return true;
      } catch {
        return false;
      }
    },
    async close() {
      await client.close();
    },
  };
}

export async function migrateDatabase(config: ServerConfig): Promise<void> {
  const connection = createDatabase(config);
  try {
    await connection.migrate();
  } finally {
    await connection.close();
  }
}
