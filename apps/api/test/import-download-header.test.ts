import { describe, expect, it } from "vitest";

import { attachmentContentDisposition } from "../src/modules/imports/download-header.js";

describe("inventory import download headers", () => {
  it("uses an ASCII fallback and RFC 5987 value for Unicode filenames", () => {
    expect(attachmentContentDisposition('Inventário/清單".xlsx')).toBe(
      "attachment; filename=\"Invent_rio____.xlsx\"; filename*=UTF-8''Invent%C3%A1rio_%E6%B8%85%E5%96%AE_.xlsx",
    );
  });
});
