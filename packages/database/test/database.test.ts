import { parseServerEnvironment } from "@simply-clean/config";
import { createTestEnvironment } from "@simply-clean/test-support";
import { describe, expect, it } from "vitest";

import { createDatabase } from "../src/index.js";

describe("database factory", () => {
  it("selects the configured PGlite adapter", async () => {
    const connection = createDatabase(
      parseServerEnvironment(createTestEnvironment()),
    );
    expect(connection.driver).toBe("pglite");
    await connection.close();
  });
});
