import { describe, expect, it, vi } from "vitest";

const heicMocks = vi.hoisted(() => ({
  all: vi.fn(),
}));

vi.mock("heic-decode", () => ({
  default: Object.assign(vi.fn(), { all: heicMocks.all }),
}));

const { createIntakeAnalysisImage, createIntakePreview } =
  await import("../src/modules/files/content-policy.js");

describe("HEIC preview allocation limits", () => {
  it("rejects an over-limit descriptor before decoding pixels", async () => {
    const decode = vi.fn();
    const dispose = vi.fn();
    const images = [{ width: 10_000, height: 5_000, decode }];
    Object.assign(images, { dispose });
    heicMocks.all.mockReset();
    heicMocks.all.mockResolvedValueOnce(images);
    await expect(
      createIntakePreview(Buffer.from("synthetic"), "image/heic"),
    ).rejects.toMatchObject({ code: "dimensions_exceeded" });
    expect(decode).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("uses the configured analysis pixel limit for HEIC", async () => {
    const decode = vi.fn();
    const dispose = vi.fn();
    const images = [{ width: 100, height: 100, decode }];
    Object.assign(images, { dispose });
    heicMocks.all.mockReset();
    heicMocks.all.mockResolvedValueOnce(images);

    await expect(
      createIntakeAnalysisImage(Buffer.from("synthetic"), "image/heic", {
        maxImageBytes: 2 * 1024 * 1024,
        maxBatchBytes: 40 * 1024 * 1024,
        maxPixels: 5_000,
      }),
    ).rejects.toMatchObject({ code: "dimensions_exceeded" });
    expect(decode).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
