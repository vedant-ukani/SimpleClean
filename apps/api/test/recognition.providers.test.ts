import { describe, expect, it, vi } from "vitest";
import { createTestEnvironment } from "@laundrorama/test-support";

import {
  DeterministicFakeOcrVerifier,
  DeterministicFakeSemanticRecognizer,
} from "../src/modules/inventory/intake/recognition/providers/fake.adapters.js";
import { GeminiSemanticRecognizer } from "../src/modules/inventory/intake/recognition/providers/gemini.semantic.adapter.js";
import { GoogleVisionOcrVerifier } from "../src/modules/inventory/intake/recognition/providers/google-vision.verifier.adapter.js";
import { OpenAISemanticRecognizer } from "../src/modules/inventory/intake/recognition/providers/openai.semantic.adapter.js";
import { DeterministicIntakeConfidencePolicy } from "../src/modules/inventory/intake/recognition.policy.js";
import { PaddleOcrVerifier } from "../src/modules/inventory/intake/recognition/providers/paddleocr.verifier.adapter.js";
import { RecognitionProviderError } from "../src/modules/inventory/intake/recognition/providers/provider.errors.js";
import {
  createOcrVerifier,
  createSemanticRecognizer,
} from "../src/modules/inventory/intake/recognition.service.js";
import { parseServerEnvironment } from "@laundrorama/config";
import { boundedJsonPost } from "../src/platform/provider-http.js";

const photoId = "00000000-0000-4000-8000-000000000001";
const image = {
  photoId,
  sourceChecksum: "sha256:fixture",
  bytes: Buffer.from("jpeg-fixture"),
  mediaType: "image/jpeg" as const,
  width: 100,
  height: 100,
};

function semanticPayload() {
  return {
    groups: [
      {
        key: "machine-1",
        photoIds: [photoId],
        confidence: 0.98,
        fields: [],
        quality: [],
      },
    ],
  };
}

describe("intake recognition provider adapters", () => {
  it("uses one timeout across response headers and a stalled body", async () => {
    const cancel = vi.fn();
    const started = performance.now();
    await expect(
      boundedJsonPost(
        "https://provider.example.test",
        {},
        {},
        {
          timeoutMs: 150,
          maxResponseBytes: 1_024,
          fetch: async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode("{"));
                },
                cancel,
              }),
            );
          },
        },
      ),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(performance.now() - started).toBeLessThan(240);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("does not construct credentialed adapters while recognition is disabled", async () => {
    const config = parseServerEnvironment(
      createTestEnvironment({
        INTAKE_RECOGNITION_ENABLED: "false",
        INTAKE_RECOGNITION_SEMANTIC_PROVIDER: "openai",
        INTAKE_RECOGNITION_VERIFIER_PROVIDER: "paddleocr",
      }),
    );
    const semantic = createSemanticRecognizer(config);
    const verifier = createOcrVerifier(config);
    await expect(semantic.recognize([image])).rejects.toMatchObject({
      code: "invalid_configuration",
    });
    await expect(verifier.verify([image])).rejects.toMatchObject({
      code: "invalid_configuration",
    });
  });

  it("provides deterministic fake semantic and OCR results", async () => {
    const semantic = await new DeterministicFakeSemanticRecognizer().recognize([
      image,
    ]);
    const ocr = await new DeterministicFakeOcrVerifier().verify([image]);
    expect(semantic.groups[0]?.photoIds).toEqual([photoId]);
    expect(ocr.lines).toEqual([]);
  });

  it("validates fixture output and rejects unknown nested fields", async () => {
    const adapter = new DeterministicFakeSemanticRecognizer({
      result: {
        provider: "fake",
        model: "fixture",
        schemaVersion: "intake-v1",
        requestId: null,
        groups: [{ ...semanticPayload().groups[0], extra: true }],
      } as never,
    });
    await expect(adapter.recognize([image])).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("pairs each bounded JPEG with same-photo OCR for layout-aware OpenAI assignment", async () => {
    const secondPhotoId = "00000000-0000-4000-8000-000000000002";
    const secondImage = {
      ...image,
      photoId: secondPhotoId,
      sourceChecksum: "sha256:private-second-checksum",
      bytes: Buffer.from("second-jpeg-fixture"),
      width: 200,
      height: 300,
    };
    let capturedBody:
      | {
          input: Array<{
            content: Array<{
              type: string;
              text?: string;
              image_url?: string;
              detail?: string;
            }>;
          }>;
          text: {
            format: {
              schema: {
                properties: {
                  groups: {
                    items: {
                      properties: {
                        fields: {
                          items: {
                            properties: Record<string, unknown>;
                            required: string[];
                          };
                        };
                        quality: unknown;
                      };
                    };
                  };
                };
                required: string[];
              };
            };
          };
        }
      | undefined;
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as typeof capturedBody;
      return new Response(
        JSON.stringify({ output_text: JSON.stringify(semanticPayload()) }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "req-safe",
          },
        },
      );
    });
    const result = await new OpenAISemanticRecognizer({
      apiKey: "secret",
      fetch: fetcher,
    }).recognize([image, secondImage], {
      provider: "google-vision",
      model: "document-text-detection",
      lines: [
        {
          lineId: "ocr-line-1",
          photoId,
          text: "ACME M1 SN-1",
          confidence: 0.99,
          box: { x: 0, y: 0, width: 1, height: 1 },
        },
        {
          lineId: "ocr-line-2",
          photoId: secondPhotoId,
          text: "EH020XA1321121011",
          confidence: 0.98,
          box: { x: 0.1, y: 0.2, width: 0.6, height: 0.1 },
        },
      ],
    });
    expect(result.provider).toBe("openai");
    expect(result.requestId).toBe("req-safe");
    expect(fetcher).toHaveBeenCalledOnce();
    const body = capturedBody!;
    const contents = body.input[0]?.content ?? [];
    const imageParts = contents.filter((part) => part.type === "input_image");
    expect(imageParts).toEqual([
      {
        type: "input_image",
        image_url: `data:image/jpeg;base64,${image.bytes.toString("base64")}`,
        detail: "auto",
      },
      {
        type: "input_image",
        image_url: `data:image/jpeg;base64,${secondImage.bytes.toString("base64")}`,
        detail: "auto",
      },
    ]);
    const prompt = contents.find((part) => part.type === "input_text")?.text;
    expect(prompt).toEqual(expect.stringContaining(photoId));
    expect(prompt).toEqual(expect.stringContaining("equipmentClass"));
    expect(prompt).toEqual(
      expect.stringContaining("supplied Google Cloud Vision OCR evidence"),
    );
    expect(prompt).toEqual(
      expect.stringContaining(
        "Copy visible identity and utility values exactly",
      ),
    );
    expect(prompt).toEqual(expect.stringContaining("layout"));
    expect(prompt).toEqual(expect.stringContaining("cropped"));
    expect(prompt).toEqual(
      expect.stringContaining("cannot repair or invent characters"),
    );
    expect(prompt).toEqual(expect.stringContaining("HEAT SOURCE"));
    expect(prompt).toEqual(
      expect.stringContaining("MAX STEAM PSI do not establish fuel"),
    );
    expect(contents).toEqual([
      expect.objectContaining({ type: "input_text" }),
      expect.objectContaining({
        type: "input_text",
        text: expect.stringContaining(
          JSON.stringify({
            lineId: "ocr-line-1",
            photoId,
            text: "ACME M1 SN-1",
            confidence: 0.99,
            box: { x: 0, y: 0, width: 1, height: 1 },
          }),
        ),
      }),
      imageParts[0],
      expect.objectContaining({
        type: "input_text",
        text: expect.stringContaining(
          JSON.stringify({
            lineId: "ocr-line-2",
            photoId: secondPhotoId,
            text: "EH020XA1321121011",
            confidence: 0.98,
            box: { x: 0.1, y: 0.2, width: 0.6, height: 0.1 },
          }),
        ),
      }),
      imageParts[1],
    ]);
    expect(contents[1]?.text).not.toContain("ocr-line-2");
    expect(contents[3]?.text).not.toContain("ocr-line-1");
    const serializedBody = JSON.stringify(body);
    expect(serializedBody).not.toContain(image.sourceChecksum);
    expect(serializedBody).not.toContain(secondImage.sourceChecksum);
    expect(serializedBody).not.toContain('"width":200');
    expect(serializedBody).not.toContain('"height":300');
    expect(
      body.text.format.schema.properties.groups.items.properties.fields,
    ).toBeDefined();
    expect(
      body.text.format.schema.properties.groups.items.properties.quality,
    ).toBeDefined();
    const fieldSchema =
      body.text.format.schema.properties.groups.items.properties.fields.items;
    expect(fieldSchema.properties).not.toHaveProperty("correction");
    expect(fieldSchema.required).toEqual(
      expect.arrayContaining(Object.keys(fieldSchema.properties)),
    );
    expect(fieldSchema.required).toHaveLength(
      Object.keys(fieldSchema.properties).length,
    );
    expect(body.text.format.schema.required).toContain("requestId");
  });

  it("requires OCR evidence for OpenAI assignment", async () => {
    const adapter = new OpenAISemanticRecognizer({
      apiKey: "secret",
      fetch: vi.fn(),
    });
    await expect(adapter.recognize([image])).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("marks a photo with zero Google OCR lines non-ready without calling OpenAI", async () => {
    const fetcher = vi.fn();
    const ocr = {
      provider: "google-vision",
      model: "document-text-detection",
      lines: [],
    };
    const semantic = await new OpenAISemanticRecognizer({
      apiKey: "secret",
      fetch: fetcher,
    }).recognize([image], ocr);
    expect(fetcher).not.toHaveBeenCalled();
    expect(semantic.groups).toEqual([]);
    const decisions = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic,
      ocr,
      config: { version: "intake-nameplate-policy-v4" },
    });
    expect(decisions).toMatchObject([
      {
        photoIds: [photoId],
        accepted: false,
        reasons: ["missing_critical_fact"],
      },
    ]);
  });

  it("passes bounded provider-neutral OCR evidence to OpenAI assignment", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        input: Array<{ content: Array<Record<string, string>> }>;
      };
      const text = body.input[0]?.content
        .filter((part) => part.type === "input_text")
        .map((part) => part.text)
        .join("\n");
      expect(text).toContain("ocr-line-1");
      expect(text).toContain("ACME M1 SN-1");
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            groups: [
              {
                key: "photo-1",
                photoIds: [photoId],
                confidence: 0.99,
                fields: [
                  {
                    field: "serial",
                    value: "SN-1",
                    confidence: 0.99,
                    photoId,
                    box: { x: 0, y: 0, width: 1, height: 1 },
                    ocrLineIds: ["ocr-line-1"],
                  },
                ],
                quality: [],
              },
            ],
            requestId: null,
          }),
        }),
        { status: 200, headers: { "x-request-id": "req-v2" } },
      );
    });
    const result = await new OpenAISemanticRecognizer({
      apiKey: "secret",
      fetch: fetcher,
    }).recognize([image], {
      provider: "google-vision",
      model: "document-text-detection",
      lines: [
        {
          lineId: "ocr-line-1",
          photoId,
          text: "ACME M1 SN-1",
          confidence: 0.99,
          box: { x: 0, y: 0, width: 1, height: 1 },
        },
      ],
    });
    expect(result.schemaVersion).toBe("intake-nameplate-v3");
    expect(result.groups[0]?.fields[0]?.ocrLineIds).toEqual(["ocr-line-1"]);
  });

  it("parses Gemini candidates and PaddleOCR result lines", async () => {
    const gemini = new GeminiSemanticRecognizer({
      apiKey: "secret",
      fetch: vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          contents: Array<{
            parts: Array<{ text?: string; inlineData?: unknown }>;
          }>;
          generationConfig: {
            responseSchema?: unknown;
            responseJsonSchema?: unknown;
            thinkingConfig?: { thinkingLevel?: string };
          };
        };
        expect(body.generationConfig).not.toHaveProperty("responseMimeType");
        expect(body.generationConfig.responseSchema).toBeUndefined();
        expect(body.generationConfig.responseJsonSchema).toBeUndefined();
        expect(body.generationConfig.thinkingConfig).toEqual({
          thinkingLevel: "low",
        });
        expect(body.contents[0]?.parts[0]?.inlineData).toBeDefined();
        const prompt = body.contents[0]?.parts.find(
          (part) => typeof part.text === "string",
        )?.text;
        expect(prompt).toEqual(
          expect.stringContaining("equipmentClass, manufacturer, model, serial"),
        );
        expect(prompt).toEqual(expect.stringContaining("stack_dryer"));
        expect(prompt).toEqual(expect.stringContaining("washer_dryer_combo"));
        expect(prompt).toEqual(
          expect.stringContaining("same-photo OCR explicitly names"),
        );
        expect(prompt).toEqual(expect.stringContaining("ocr-line-1"));
        expect(prompt).not.toEqual(expect.stringContaining("machineType"));
        expect(prompt).toEqual(
          expect.stringContaining("Do not add extra keys or markdown"),
        );
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(semanticPayload()) }],
                },
              },
            ],
          }),
        );
      }),
    });
    const result = await gemini.recognize([image], {
      provider: "google-vision",
      model: "document-text-detection",
      lines: [{
        lineId: "ocr-line-1",
        photoId,
        text: "STACK DRYER",
        confidence: 0.99,
        box: { x: 0, y: 0, width: 1, height: 1 },
      }],
    });
    expect(result.groups).toHaveLength(1);
    expect(result.schemaVersion).toBe("intake-nameplate-v3");

    const paddle = new PaddleOcrVerifier({
      request: async () => ({
        results: [
          {
            photoId,
            lines: [{ text: "MAYTAG", confidence: 0.99, box: [0, 0, 50, 20] }],
          },
        ],
      }),
    });
    const ocr = await paddle.verify([image]);
    expect(ocr.lines[0]).toMatchObject({
      photoId,
      text: "MAYTAG",
      confidence: 0.99,
    });
    expect(ocr.lines[0]?.box).toEqual({ x: 0, y: 0, width: 0.5, height: 0.2 });
  });

  it("uses Gemini 3.8 MIME-only JSON output with low thinking", async () => {
    const gemini = new GeminiSemanticRecognizer({
      apiKey: "secret",
      model: "gemini-3.8-flash",
      fetch: vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          contents: Array<{
            parts: Array<{ text?: string; inlineData?: unknown }>;
          }>;
          generationConfig: {
            responseSchema?: unknown;
            responseJsonSchema?: unknown;
            thinkingConfig?: { thinkingLevel?: string };
          };
        };
        expect(body.generationConfig).not.toHaveProperty("responseMimeType");
        expect(body.generationConfig.responseSchema).toBeUndefined();
        expect(body.generationConfig.responseJsonSchema).toBeUndefined();
        expect(body.generationConfig.thinkingConfig).toEqual({
          thinkingLevel: "low",
        });
        expect(body.contents[0]?.parts[0]?.inlineData).toBeDefined();
        expect(
          body.contents[0]?.parts.find((part) => typeof part.text === "string")
            ?.text,
        ).toEqual(expect.stringContaining("Do not add extra keys or markdown"));
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(semanticPayload()) }],
                },
              },
            ],
          }),
        );
      }),
    });
    await expect(gemini.recognize([image])).resolves.toMatchObject({
      provider: "gemini",
      groups: [{ photoIds: [photoId] }],
    });
  });

  it("normalizes Google Vision full text and word boxes", async () => {
    const google = new GoogleVisionOcrVerifier({
      request: async () => ({
        responses: [
          {
            fullTextAnnotation: {
              text: "MAYTAG",
              pages: [
                {
                  width: 100,
                  height: 100,
                  blocks: [
                    {
                      paragraphs: [
                        {
                          words: [
                            {
                              symbols: [{ text: "MAYTAG", confidence: 0.98 }],
                              boundingBox: {
                                vertices: [
                                  { x: 0, y: 0 },
                                  { x: 50, y: 0 },
                                  { x: 50, y: 20 },
                                  { x: 0, y: 20 },
                                ],
                              },
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      }),
    });
    const result = await google.verify([image]);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({
      photoId,
      text: "MAYTAG",
      confidence: 0.98,
      box: { x: 0, y: 0, width: 0.5, height: 0.2 },
    });
    expect(result.lines[1]?.text).toBe("MAYTAG");
  });

  it("maps timeout and oversized output to safe errors", async () => {
    const timeout = new OpenAISemanticRecognizer({
      apiKey: "secret",
      timeoutMs: 100,
      fetch: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    });
    await expect(
      timeout.recognize([image], {
        provider: "google-vision",
        model: "document-text-detection",
        lines: [
          {
            lineId: "ocr-line-1",
            photoId,
            text: "ACME",
            confidence: 0.99,
            box: { x: 0, y: 0, width: 1, height: 1 },
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "timeout",
    });

    const huge = new OpenAISemanticRecognizer({
      apiKey: "secret",
      maxResponseBytes: 1_024,
      fetch: async () => new Response("x".repeat(2_000)),
    });
    await expect(
      huge.recognize([image], {
        provider: "google-vision",
        model: "document-text-detection",
        lines: [
          {
            lineId: "ocr-line-1",
            photoId,
            text: "ACME",
            confidence: 0.99,
            box: { x: 0, y: 0, width: 1, height: 1 },
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "response_too_large",
    });
    try {
      await huge.recognize([image], {
        provider: "google-vision",
        model: "document-text-detection",
        lines: [
          {
            lineId: "ocr-line-1",
            photoId,
            text: "ACME",
            confidence: 0.99,
            box: { x: 0, y: 0, width: 1, height: 1 },
          },
        ],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(RecognitionProviderError);
      expect((error as Error).message).not.toContain("x".repeat(20));
    }
  });
});
