import { randomUUID } from "node:crypto";
import jsQrModule, { type Options, type QRCode } from "jsqr";
import { describe, expect, it } from "vitest";

import { QrLabelRenderer } from "../src/modules/inventory/qr/qr-label.renderer.js";
import { QrLabelSigner } from "../src/modules/inventory/qr/qr-label.signer.js";

type DecodeQr = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: Options,
) => QRCode | null;
const decodeQr = (
  "default" in jsQrModule ? jsQrModule.default : jsQrModule
) as DecodeQr;

function decodeEmbeddedQr(labelSvg: string): string | undefined {
  const encoded = /base64,([^"']+)/.exec(labelSvg)?.[1];
  if (!encoded) return undefined;
  const qrSvg = Buffer.from(encoded, "base64").toString("utf8");
  const size = Number(/viewBox="0 0 (\d+) \d+"/.exec(qrSvg)?.[1]);
  const path = /<path stroke="#[0-9a-fA-F]+" d="([^"]+)"/.exec(qrSvg)?.[1];
  if (!Number.isInteger(size) || size <= 0 || !path) return undefined;

  const scale = 8;
  const width = size * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (const rowPath of path.split(/(?=M)/).filter(Boolean)) {
    const start = /^M(\d+) (\d+(?:\.\d+)?)/.exec(rowPath);
    if (!start) continue;
    let x = Number(start[1]);
    let y = Math.floor(Number(start[2]));
    const commands = rowPath.slice(start[0].length);
    for (const command of commands.matchAll(
      /([hm])(-?\d+(?:\.\d+)?)(?: (-?\d+(?:\.\d+)?))?/g,
    )) {
      const distance = Number(command[2]);
      if (command[1] === "m") {
        x += distance;
        y += Number(command[3] ?? 0);
        continue;
      }
      for (let moduleX = x; moduleX < x + distance; moduleX += 1) {
        for (let pixelY = y * scale; pixelY < (y + 1) * scale; pixelY += 1) {
          for (
            let pixelX = moduleX * scale;
            pixelX < (moduleX + 1) * scale;
            pixelX += 1
          ) {
            const offset = (pixelY * width + pixelX) * 4;
            pixels[offset] = 17;
            pixels[offset + 1] = 17;
            pixels[offset + 2] = 17;
          }
        }
      }
      x += distance;
    }
  }
  return decodeQr(pixels, width, width, {
    inversionAttempts: "dontInvert",
  })?.data;
}

describe("QR label signer", () => {
  const signer = new QrLabelSigner(
    "test-only-qr-secret-with-at-least-32-characters",
  );

  it("regenerates opaque signed versioned tokens deterministically", () => {
    const labelId = randomUUID();
    const token = signer.sign(labelId);
    expect(signer.sign(labelId)).toBe(token);
    expect(signer.verify(token)).toEqual({ version: 1, labelId });
    expect(token).not.toContain("machine");
    expect(token.split(".")).toHaveLength(3);
  });

  it("rejects forged, malformed, wrong-version, and guessed references", () => {
    const token = signer.sign(randomUUID());
    const forged = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    expect(signer.verify(forged)).toBeNull();
    expect(signer.verify(token.replace(/^v1/, "v2"))).toBeNull();
    expect(signer.verify("v1.not-a-uuid.short")).toBeNull();
    expect(signer.verify(randomUUID())).toBeNull();
  });

  it("generates high-entropy Crockford fallback codes", () => {
    const codes = new Set(
      Array.from({ length: 128 }, () => signer.createFallbackCode()),
    );
    expect(codes.size).toBe(128);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
      expect(signer.normalizeFallbackCode(` ${code.toLowerCase()} `)).toBe(
        code,
      );
    }
    expect(signer.normalizeFallbackCode("MACHINE-ID")).toBeNull();
  });
});

describe("QR label renderer", () => {
  it("creates a private-printable minimal SVG with a decodable payload", async () => {
    const url =
      "https://platform.example.test/scan#v1.86bee7c3-380b-4a94-976d-4fe7d6ef8b3a.signature";
    const rendered = await new QrLabelRenderer().render({
      url,
      fallbackCode: "01ARZ3NDEKTSV4RR",
    });
    expect(rendered.filename).toBe(
      "simply-clean-equipment-01ARZ3NDEKTSV4RR.svg",
    );
    expect(rendered.svg).toContain('viewBox="0 0 432 576"');
    expect(rendered.svg).toContain('role="img"');
    expect(rendered.svg).toContain("Simply Clean Equipment");
    expect(rendered.svg).toContain("01ARZ3NDEKTSV4RR");
    const encoded = /base64,([^"']+)/.exec(rendered.svg)?.[1];
    expect(encoded).toBeDefined();
    expect(Buffer.from(encoded!, "base64").toString("utf8")).toContain("<svg");
    expect(decodeEmbeddedQr(rendered.svg)).toBe(url);
    expect(Buffer.from(encoded!, "base64").toString("utf8")).not.toContain(
      "86bee7c3-380b-4a94-976d-4fe7d6ef8b3a",
    );
    expect(rendered.svg).not.toContain("serial");
    expect(rendered.svg).not.toContain("model");
  });

  it("escapes renderer text inputs", async () => {
    const rendered = await new QrLabelRenderer().render({
      url: "https://platform.example.test/scan#safe",
      fallbackCode: "<script>&bad",
    });
    expect(rendered.svg).not.toContain("<script>");
    expect(rendered.svg).toContain("&lt;script&gt;&amp;bad");
  });
});
