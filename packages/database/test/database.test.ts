import { parseServerEnvironment } from "@laundrorama/config";
import { createTestEnvironment } from "@laundrorama/test-support";
import { describe, expect, it } from "vitest";

import { createDatabase } from "../src/index.js";

describe("database factory", () => {
  it("selects the configured PGlite adapter", async () => {
    const connection = createDatabase(
      parseServerEnvironment(createTestEnvironment()),
    );
    expect(connection.driver).toBe("pglite");
    expect(connection.database).toBeDefined();
    await connection.close();
  });
});
