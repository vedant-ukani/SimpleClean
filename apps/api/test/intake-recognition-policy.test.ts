import { describe, expect, it } from "vitest";
import type {
  IntakeRecognitionField,
  IntakeOcrResult,
  IntakeSemanticResult,
} from "@laundrorama/contracts";
import {
  DeterministicIntakeConfidencePolicy,
  parseExplicitCapacityLb,
} from "../src/modules/inventory/intake/recognition.policy.js";

const photo = "00000000-0000-4000-8000-000000000001";
const image = {
  photoId: photo,
  sourceChecksum: "a".repeat(64),
  bytes: Buffer.from("jpeg"),
  mediaType: "image/jpeg" as const,
  width: 100,
  height: 100,
};
const box = { x: 0, y: 0, width: 1, height: 1 };
const semantic = (
  serial = "SN-1",
  secondPhoto = photo,
): IntakeSemanticResult => ({
  provider: "fake",
  model: "fake",
  schemaVersion: "intake-v1" as const,
  requestId: null,
  groups: [
    {
      key: "g",
      photoIds: [photo],
      confidence: 0.99,
      fields: (
        [
          ["machineType", "washer"],
          ["manufacturer", "ACME"],
          ["model", "M1"],
          ["serial", serial],
        ] as const satisfies ReadonlyArray<
          readonly [IntakeRecognitionField, string]
        >
      ).map(([field, value]) => ({
        field,
        value,
        confidence: 0.99,
        photoId: secondPhoto,
        box,
      })),
      quality: [],
    },
  ],
});
const ocr = (text: string) => ({
  provider: "fake",
  model: "fake",
  lines: [{ photoId: photo, text, confidence: 0.99, box }],
});
const config = {
  version: "v1",
  groupFloor: 0.9,
  fieldFloor: 0.9,
  ocrFloor: 0.9,
};

function nameplateSemantic(
  fields: IntakeSemanticResult["groups"][number]["fields"],
  photoId = photo,
): IntakeSemanticResult {
  return {
    provider: "openai",
    model: "test",
    schemaVersion: "intake-nameplate-v2",
    requestId: null,
    groups: [
      {
        key: `photo-${photoId}`,
        photoIds: [photoId],
        confidence: 0.99,
        fields,
        quality: [],
      },
    ],
  };
}

function ocrLines(
  entries: ReadonlyArray<readonly [string, string]>,
): IntakeOcrResult["lines"] {
  return entries.map(([lineId, text]) => ({
    lineId,
    photoId: photo,
    text,
    confidence: 0.99,
    box,
  }));
}

describe("deterministic intake recognition policy", () => {
  it("accepts a stack class only when its cited same-photo OCR explicitly names it", () => {
    const fields = (
      [
        ["manufacturer", "ACME", "maker"],
        ["model", "M1", "model"],
        ["serial", "SN-1", "serial"],
        ["equipmentClass", "stacked_washer_dryer", "class"],
      ] as const
    ).map(([field, value, line]) => ({
      field,
      value,
      confidence: 0.99,
      photoId: photo,
      box,
      ocrLineIds: [line],
    }));
    const lines = ocrLines([
      ["maker", "ACME"],
      ["model", "M1"],
      ["serial", "SN-1"],
      ["class", "STACKED WASHER/DRYER"],
    ]);
    const policy = new DeterministicIntakeConfidencePolicy();
    const accepted = policy.evaluate({
      images: [image],
      semantic: nameplateSemantic(fields),
      ocr: { provider: "fake", model: "fake", lines },
      config,
    });
    expect(
      accepted[0]?.fields.find((field) => field.field === "equipmentClass"),
    ).toMatchObject({ accepted: true, value: "stacked_washer_dryer" });
    const wrongCitation = fields.map((field) =>
      field.field === "equipmentClass"
        ? { ...field, ocrLineIds: ["model"] }
        : field,
    );
    const rejected = policy.evaluate({
      images: [image],
      semantic: nameplateSemantic(wrongCitation),
      ocr: { provider: "fake", model: "fake", lines },
      config,
    });
    expect(
      rejected[0]?.fields.find((field) => field.field === "equipmentClass"),
    ).toMatchObject({ accepted: false, value: null });
    expect(rejected[0]?.accepted).toBe(true);
  });
  it("accepts only explicitly unit-qualified capacity and normalizes kilograms", () => {
    expect(parseExplicitCapacityLb("40 lb")).toBe(40);
    expect(parseExplicitCapacityLb("18 kg")).toBe(40);
    expect(parseExplicitCapacityLb("Capacity: 60 pounds")).toBe(60);
    expect(parseExplicitCapacityLb("25 lb / 11 kg")).toBe(25);
    expect(parseExplicitCapacityLb("25 lb / 20 kg")).toBeNull();
    expect(parseExplicitCapacityLb("40")).toBeNull();
    expect(parseExplicitCapacityLb("MODEL-40")).toBeNull();
  });

  it("keeps an invalid optional capacity from blocking identity readiness", () => {
    const fields = (
      [
        ["manufacturer", "ACME"],
        ["model", "M1"],
        ["serial", "SN-1"],
        ["capacityLb", "40"],
      ] as const satisfies ReadonlyArray<
        readonly [IntakeRecognitionField, string]
      >
    ).map(([field, value], index) => ({
      field,
      value,
      confidence: 0.99,
      photoId: photo,
      box,
      ocrLineIds: [`line-${index}`],
    }));
    const decision = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic: nameplateSemantic(fields),
      ocr: {
        provider: "google-vision",
        model: "test",
        lines: ocrLines([
          ["line-0", "ACME"],
          ["line-1", "M1"],
          ["line-2", "SN-1"],
          ["line-3", "40"],
        ]),
      },
      config,
    })[0]!;
    expect(decision.accepted).toBe(true);
    expect(decision.reasons).not.toContain("unsupported_evidence");
    expect(decision.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "capacityLb",
          value: null,
          accepted: false,
        }),
      ]),
    );
  });

  it("requires exact serial agreement and evidence in the group", () => {
    const policy = new DeterministicIntakeConfidencePolicy();
    expect(
      policy.evaluate({
        images: [image],
        semantic: semantic(),
        ocr: ocr("SN-2"),
        config,
      })[0]?.reasons,
    ).toContain("ocr_disagreement");
    expect(
      policy.evaluate({
        images: [image],
        semantic: semantic("SN-1", "00000000-0000-4000-8000-000000000002"),
        ocr: ocr("SN-1"),
        config,
      })[0]?.reasons,
    ).toContain("unsupported_evidence");
  });
  it("blocks unconfigured floors and quality blockers", () => {
    const policy = new DeterministicIntakeConfidencePolicy();
    expect(
      policy.evaluate({
        images: [image],
        semantic: semantic(),
        ocr: ocr("SN-1"),
        config: { version: "v1" },
      })[0]?.reasons,
    ).toContain("policy_unconfigured");
    const blocked = semantic();
    blocked.groups[0]!.quality = [{ photoId: photo, reason: "glare" }];
    expect(
      policy.evaluate({
        images: [image],
        semantic: blocked,
        ocr: ocr("SN-1"),
        config,
      })[0]?.reasons,
    ).toContain("glare");
  });

  it("rejects unknown group photos and creates an exception for omitted input", () => {
    const policy = new DeterministicIntakeConfidencePolicy();
    const unknownPhoto = "00000000-0000-4000-8000-000000000099";
    const withUnknown = semantic();
    withUnknown.groups[0]!.photoIds.push(unknownPhoto);
    expect(
      policy.evaluate({
        images: [image],
        semantic: withUnknown,
        ocr: ocr("SN-1"),
        config,
      })[0]?.reasons,
    ).toContain("unsupported_evidence");

    const omitted = policy.evaluate({
      images: [image],
      semantic: { ...semantic(), groups: [] },
      ocr: ocr("SN-1"),
      config,
    });
    expect(omitted).toEqual([
      expect.objectContaining({
        photoIds: [photo],
        accepted: false,
        reasons: ["ambiguous_grouping"],
      }),
    ]);
  });

  it("normalizes supported machine facts and rejects unknown enum values", () => {
    const policy = new DeterministicIntakeConfidencePolicy();
    const aliased = semantic();
    aliased.groups[0]!.fields.push(
      ...(
        [
          ["phase", "3 phase"],
          ["fuel", "natural gas"],
        ] as const satisfies ReadonlyArray<
          readonly [IntakeRecognitionField, string]
        >
      ).map(([field, value]) => ({
        field,
        value,
        confidence: 0.99,
        photoId: photo,
        box,
      })),
    );
    const aliasedOcr = {
      provider: "fake",
      model: "fake",
      lines: ["washer", "ACME", "M1", "SN-1", "three_phase", "gas"].map(
        (text) => ({ photoId: photo, text, confidence: 0.99, box }),
      ),
    };
    const accepted = policy.evaluate({
      images: [image],
      semantic: aliased,
      ocr: aliasedOcr,
      config,
    })[0]!;
    expect(accepted.accepted).toBe(true);
    expect(accepted.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "phase", value: "three_phase" }),
        expect.objectContaining({ field: "fuel", value: "gas" }),
      ]),
    );

    const unknown = semantic();
    unknown.groups[0]!.fields[0]!.value = "washer-ish";
    const rejected = policy.evaluate({
      images: [image],
      semantic: unknown,
      ocr: ocr("SN-1"),
      config,
    })[0]!;
    expect(rejected.accepted).toBe(false);
    expect(rejected.fields[0]).toMatchObject({
      field: "machineType",
      accepted: false,
      reason: "unsupported_evidence",
    });
  });

  it("rejects every group that shares an evidence photo", () => {
    const policy = new DeterministicIntakeConfidencePolicy();
    const overlapping = semantic();
    overlapping.groups.push({
      ...overlapping.groups[0]!,
      key: "g-2",
    });
    const decisions = policy.evaluate({
      images: [image],
      semantic: overlapping,
      ocr: ocr("SN-1"),
      config,
    });
    expect(decisions).toHaveLength(2);
    expect(
      decisions.every((decision) =>
        decision.reasons.includes("ambiguous_grouping"),
      ),
    ).toBe(true);
    expect(decisions.every((decision) => !decision.accepted)).toBe(true);
  });

  it("evaluates each v2 nameplate photo independently and requires OCR references", () => {
    const secondPhoto = "00000000-0000-4000-8000-000000000002";
    const photos = [image, { ...image, photoId: secondPhoto }];
    const fieldsFor = (photoId: string, serial: string) =>
      (
        [
          ["machineType", "washer"],
          ["manufacturer", "ACME"],
          ["model", "M1"],
          ["serial", serial],
        ] as const
      ).map(([field, value], index) => ({
        field,
        value,
        confidence: 0.99,
        photoId,
        box,
        ocrLineIds: [`${photoId}:line-${index + 1}`],
      }));
    const result = new DeterministicIntakeConfidencePolicy().evaluate({
      images: photos,
      semantic: {
        provider: "openai",
        model: "test",
        schemaVersion: "intake-nameplate-v2",
        requestId: null,
        groups: [
          {
            key: "photo-1",
            photoIds: [photo],
            confidence: 0.99,
            fields: fieldsFor(photo, "SN-1"),
            quality: [],
          },
          {
            key: "photo-2",
            photoIds: [secondPhoto],
            confidence: 0.99,
            fields: fieldsFor(secondPhoto, "SN-2"),
            quality: [],
          },
        ],
      },
      ocr: {
        provider: "google-vision",
        model: "document-text-detection",
        lines: photos.flatMap((candidate) =>
          [
            "washer",
            "ACME",
            "M1",
            candidate.photoId === photo ? "SN-1" : "SN-2",
          ].map((text, index) => ({
            lineId: `${candidate.photoId}:line-${index + 1}`,
            photoId: candidate.photoId,
            text,
            confidence: 0.99,
            box,
          })),
        ),
      },
      config,
    });
    expect(result).toHaveLength(2);
    expect(result.every((decision) => decision.photoIds.length === 1)).toBe(
      true,
    );
    expect(result.every((decision) => decision.accepted)).toBe(true);
    expect(result[0]?.fields[0]?.ocrLineIds).toEqual([`${photo}:line-1`]);
  });

  it("accepts Dexter identity values found inside a cited full-nameplate OCR block", () => {
    const fullTextLine = "full-nameplate";
    const fields = (
      [
        ["manufacturer", "THE DEXTER COMPANY"],
        ["model", "DC30X2NA-65EC1X-SWBSG-USA"],
        ["serial", "D1.15162.017"],
      ] as const
    ).map(([field, value]) => ({
      field,
      value,
      confidence: 0.99,
      photoId: photo,
      box,
      ocrLineIds: [fullTextLine],
    }));
    const decision = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic: nameplateSemantic(fields),
      ocr: {
        provider: "google-vision",
        model: "document-text-detection",
        lines: ocrLines([
          [
            fullTextLine,
            "THE DEXTER COMPANY MODEL NO. DC30X2NA-65EC1X-SWBSG-USA SERIAL NO. D1.15162.017 VOLTS: 120 AC PHASE: 1 EQUIPPED FOR: NATURAL GAS",
          ],
        ]),
      },
      config,
    })[0]!;

    expect(decision.accepted).toBe(true);
    expect(decision.reasons).toEqual([]);
    expect(decision.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "manufacturer", accepted: true }),
        expect.objectContaining({ field: "model", accepted: true }),
        expect.objectContaining({ field: "serial", accepted: true }),
      ]),
    );
  });

  it("rejects a model character that does not exist anywhere in same-photo OCR", () => {
    const fullTextLine = "full-nameplate";
    const fields = (
      [
        ["manufacturer", "THE DEXTER COMPANY"],
        ["model", "DC30X2NA-65EC1X-SWBSG-USB"],
        ["serial", "D1.15162.017"],
      ] as const
    ).map(([field, value]) => ({
      field,
      value,
      confidence: 0.99,
      photoId: photo,
      box,
      ocrLineIds: [fullTextLine],
    }));
    const decision = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic: nameplateSemantic(fields),
      ocr: {
        provider: "google-vision",
        model: "document-text-detection",
        lines: ocrLines([
          [
            fullTextLine,
            "THE DEXTER COMPANY MODEL NO. DC30X2NA-65EC1X-SWBSG-USA SERIAL NO. D1.15162.017",
          ],
        ]),
      },
      config,
    })[0]!;

    expect(decision.accepted).toBe(false);
    expect(decision.reasons).toContain("unsupported_evidence");
    expect(decision.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "model",
          accepted: false,
          value: null,
          reason: "unsupported_evidence",
        }),
      ]),
    );
  });

  it("does not support a model from inside a larger OCR token", () => {
    const fullTextLine = "full-nameplate";
    const fields = (
      [
        ["manufacturer", "ACME"],
        ["model", "M1"],
        ["serial", "SN-1"],
      ] as const
    ).map(([field, value]) => ({
      field,
      value,
      confidence: 0.99,
      photoId: photo,
      box,
      ocrLineIds: [fullTextLine],
    }));
    const decision = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic: nameplateSemantic(fields),
      ocr: {
        provider: "google-vision",
        model: "document-text-detection",
        lines: ocrLines([[fullTextLine, "ACME MODEL NO. M10 SERIAL NO. SN-1"]]),
      },
      config,
    })[0]!;

    expect(decision.accepted).toBe(false);
    expect(decision.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "model",
          accepted: false,
          value: null,
          reason: "unsupported_evidence",
        }),
      ]),
    );
  });

  it("does not support a serial from inside a larger part-number token", () => {
    const fullTextLine = "full-nameplate";
    const fields = (
      [
        ["manufacturer", "ACME"],
        ["model", "M1"],
        ["serial", "SN-1"],
      ] as const
    ).map(([field, value]) => ({
      field,
      value,
      confidence: 0.99,
      photoId: photo,
      box,
      ocrLineIds: [fullTextLine],
    }));
    const decision = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic: nameplateSemantic(fields),
      ocr: {
        provider: "google-vision",
        model: "document-text-detection",
        lines: ocrLines([
          [fullTextLine, "ACME MODEL NO. M1 PART NO. 9999-SN-1-001"],
        ]),
      },
      config,
    })[0]!;

    expect(decision.accepted).toBe(false);
    expect(decision.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "serial",
          accepted: false,
          value: null,
          reason: "unsupported_evidence",
        }),
      ]),
    );
  });

  it("does not use OCR from another photo to support a field", () => {
    const secondPhoto = "00000000-0000-4000-8000-000000000002";
    const fullTextLine = "photo-one-full-nameplate";
    const fields = (
      [
        ["manufacturer", "ACME"],
        ["model", "M2"],
        ["serial", "SN-1"],
      ] as const
    ).map(([field, value]) => ({
      field,
      value,
      confidence: 0.99,
      photoId: photo,
      box,
      ocrLineIds: [fullTextLine],
    }));
    const decision = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image, { ...image, photoId: secondPhoto }],
      semantic: nameplateSemantic(fields),
      ocr: {
        provider: "google-vision",
        model: "document-text-detection",
        lines: [
          ...ocrLines([[fullTextLine, "ACME MODEL NO. M1 SERIAL NO. SN-1"]]),
          {
            lineId: "photo-two-model",
            photoId: secondPhoto,
            text: "M2",
            confidence: 0.99,
            box,
          },
        ],
      },
      config,
    })[0]!;

    expect(decision.accepted).toBe(false);
    expect(decision.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "model",
          accepted: false,
          reason: "unsupported_evidence",
        }),
      ]),
    );
  });

  it("uses field-aware same-photo OCR support while optional mismatches stay non-blocking", () => {
    const fullTextLine = "full-nameplate";
    const fields = (
      [
        ["manufacturer", "THE DEXTER COMPANY"],
        ["model", "DC30X2NA"],
        ["serial", "D1.15162.017"],
        ["voltage", "120 V AC"],
        ["phase", "single_phase"],
        ["fuel", "steam"],
      ] as const
    ).map(([field, value]) => ({
      field,
      value,
      confidence: 0.99,
      photoId: photo,
      box,
      ocrLineIds: [fullTextLine],
    }));
    const decision = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic: nameplateSemantic(fields),
      ocr: {
        provider: "google-vision",
        model: "document-text-detection",
        lines: ocrLines([
          ["word-1", "120"],
          ["word-2", "V"],
          ["word-3", "AC"],
          ["word-4", "1"],
          [
            fullTextLine,
            "THE DEXTER COMPANY MODEL NO. DC30X2NA SERIAL NO. D1.15162.017 VOLTS: 120 AC PHASE: 1 EQUIPPED FOR: NATURAL GAS",
          ],
        ]),
      },
      config,
    })[0]!;

    expect(decision.accepted).toBe(true);
    expect(decision.reasons).toEqual([]);
    expect(decision.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "voltage",
          value: "120 V AC",
          accepted: true,
        }),
        expect.objectContaining({
          field: "phase",
          value: "single_phase",
          accepted: true,
        }),
        expect.objectContaining({
          field: "fuel",
          value: null,
          accepted: false,
          reason: "unsupported_evidence",
        }),
      ]),
    );
  });

  it("compares equivalent voltage labels, units, and punctuation canonically", () => {
    const fields = [
      ["manufacturer", "ACME", "manufacturer-line"],
      ["model", "M1", "model-line"],
      ["serial", "SN-1", "serial-line"],
      ["voltage", "120 AC; 120/208-240 V", "voltage-line"],
    ] as const;
    const decision = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic: nameplateSemantic(
        fields.map(([field, value, lineId]) => ({
          field,
          value,
          confidence: 0.99,
          photoId: photo,
          box,
          ocrLineIds: [lineId],
        })),
      ),
      ocr: {
        provider: "google-vision",
        model: "document-text-detection",
        lines: ocrLines([
          ["manufacturer-line", "ACME"],
          ["model-line", "M1"],
          ["serial-line", "SN-1"],
          ["voltage-line", "VOLTS 120 AC 120 208-240"],
        ]),
      },
      config,
    })[0]!;
    expect(decision.accepted).toBe(true);
    expect(decision.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "voltage",
          accepted: true,
          verification: expect.objectContaining({
            normalizedSemantic: "ac:120,208,240",
            normalizedOcr: "ac:120,208,240",
          }),
        }),
      ]),
    );
  });

  it("treats blur and confidence findings as provenance when identity verifies", () => {
    const fields = (
      [
        ["manufacturer", "ACME", "manufacturer-line"],
        ["model", "M1", "model-line"],
        ["serial", "SN-1", "serial-line"],
      ] as const
    ).map(([field, value, lineId]) => ({
      field,
      value,
      confidence: 0.99,
      photoId: photo,
      box,
      ocrLineIds: [lineId],
    }));
    const semantic = nameplateSemantic(fields);
    semantic.groups[0]!.quality = [{ photoId: photo, reason: "blur" }];
    const decision = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic,
      ocr: {
        provider: "google-vision",
        model: "document-text-detection",
        lines: ocrLines([
          ["manufacturer-line", "ACME"],
          ["model-line", "M1"],
          ["serial-line", "SN-1"],
        ]),
      },
      config,
    })[0]!;
    expect(decision.accepted).toBe(true);
    expect(decision.reasons).not.toContain("blur");
    expect(decision.quality).toEqual([{ photoId: photo, reason: "blur" }]);

    const failed = nameplateSemantic(
      fields.map((field) =>
        field.field === "model" ? { ...field, confidence: 0.5 } : field,
      ),
    );
    failed.groups[0]!.quality = [{ photoId: photo, reason: "blur" }];
    const failedDecision = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic: failed,
      ocr: {
        provider: "google-vision",
        model: "document-text-detection",
        lines: ocrLines([
          ["manufacturer-line", "ACME"],
          ["model-line", "M1"],
          ["serial-line", "SN-1"],
        ]),
      },
      config,
    })[0]!;
    expect(failedDecision.accepted).toBe(true);
    expect(failedDecision.reasons).not.toContain("low_confidence");
    expect(failedDecision.reasons).not.toContain("blur");
  });

  it("normalizes labeled OCR and accepts null optional fields", () => {
    const fields = [
      {
        field: "machineType" as const,
        value: null,
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: [],
      },
      {
        field: "manufacturer" as const,
        value: "ACME",
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: ["manufacturer-line"],
      },
      {
        field: "model" as const,
        value: "MODEL: M1",
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: ["model-line"],
      },
      {
        field: "serial" as const,
        value: "SERIAL: SN-1",
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: ["serial-line"],
      },
    ];
    const decision = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic: nameplateSemantic(fields),
      ocr: {
        provider: "google-vision",
        model: "document-text-detection",
        lines: ocrLines([
          ["manufacturer-line", "MANUFACTURER: ACME"],
          ["model-line", "MODEL: M1"],
          ["serial-line", "SERIAL: SN-1"],
        ]),
      },
      config,
    })[0]!;
    expect(decision.accepted).toBe(true);
    expect(decision.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "machineType",
          value: null,
          accepted: true,
          ocrLineIds: [],
        }),
        expect.objectContaining({
          field: "model",
          value: "M1",
          correction: {
            from: "MODEL: M1",
            to: "M1",
            reason: "deterministic normalization",
          },
          verification: expect.objectContaining({
            normalizedOcr: "m1",
          }),
        }),
      ]),
    );
  });

  it("normalizes explicit number labels without changing unseparated values", () => {
    const fields = (
      [
        ["manufacturer", "ACME"],
        ["model", "MODEL NO. MX-1"],
        ["serial", "1990300131068"],
      ] as const
    ).map(([field, value], index) => ({
      field: field as IntakeRecognitionField,
      value,
      confidence: 0.99,
      photoId: photo,
      box,
      ocrLineIds: [`line-${index}`],
    }));
    const decision = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic: nameplateSemantic(fields),
      ocr: {
        provider: "google-vision",
        model: "document-text-detection",
        lines: ocrLines([
          ["line-0", "ACME"],
          ["line-1", "MODEL NO. MX-1"],
          ["line-2", "NO.1990300131068"],
        ]),
      },
      config,
    })[0]!;
    expect(decision.accepted).toBe(true);
    expect(decision.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "model", value: "MX-1" }),
        expect.objectContaining({
          field: "serial",
          value: "1990300131068",
        }),
      ]),
    );

    const unchanged = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic: nameplateSemantic(
        (
          [
            ["manufacturer", "ACME"],
            ["model", "NO123"],
            ["serial", "SERIAL NO. 1990300131068"],
          ] as const
        ).map(([field, value], index) => ({
          field: field as IntakeRecognitionField,
          value,
          confidence: 0.99,
          photoId: photo,
          box,
          ocrLineIds: [`unchanged-${index}`],
        })),
      ),
      ocr: {
        provider: "google-vision",
        model: "document-text-detection",
        lines: ocrLines([
          ["unchanged-0", "ACME"],
          ["unchanged-1", "NO123"],
          ["unchanged-2", "S/N 1990300131068"],
        ]),
      },
      config,
    })[0]!;
    expect(unchanged.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "model", value: "NO123" }),
      ]),
    );
  });

  it("accepts semantic values supported by multiple referenced OCR lines", () => {
    const fields = [
      {
        field: "manufacturer" as const,
        value: "THE DEXTER CO",
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: ["manufacturer-1", "manufacturer-2", "manufacturer-3"],
      },
      {
        field: "model" as const,
        value: "M1",
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: ["model-line"],
      },
      {
        field: "serial" as const,
        value: "SN-1",
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: ["serial-line"],
      },
      {
        field: "voltage" as const,
        value: "208-240 V AC",
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: ["voltage-1", "voltage-2", "voltage-3"],
      },
    ];
    const decision = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic: nameplateSemantic(fields),
      ocr: {
        provider: "google-vision",
        model: "document-text-detection",
        lines: ocrLines([
          ["manufacturer-1", "THE"],
          ["manufacturer-2", "DEXTER"],
          ["manufacturer-3", "CO"],
          ["model-line", "M1"],
          ["serial-line", "SN-1"],
          ["voltage-1", "208-240"],
          ["voltage-2", "V"],
          ["voltage-3", "AC"],
        ]),
      },
      config,
    })[0]!;

    expect(decision.accepted).toBe(true);
    expect(decision.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "manufacturer",
          value: "THE DEXTER CO",
          verification: expect.objectContaining({
            ocrValue: "THE DEXTER CO",
            normalizedOcr: "thedexterco",
            ocrLineIds: ["manufacturer-1", "manufacturer-2", "manufacturer-3"],
          }),
        }),
        expect.objectContaining({
          field: "voltage",
          value: "208-240 V AC",
          verification: expect.objectContaining({
            ocrValue: "208-240 V AC",
            normalizedOcr: "ac:208,240",
            ocrLineIds: ["voltage-1", "voltage-2", "voltage-3"],
          }),
        }),
      ]),
    );
  });

  it("accepts Google-authoritative Dexter and Girbau identifiers exactly", () => {
    const cases = [
      {
        manufacturer: "THE DEXTER COMPANY",
        model: "DL2X30QA",
        serial: "1990300131068",
      },
      {
        manufacturer: "Continental Girbau, Inc.",
        model: "EH020XA1321121011",
        serial: "1443229G16",
      },
    ] as const;
    for (const values of cases) {
      const ids = ["manufacturer-line", "model-line", "serial-line"];
      const fields = (
        [
          ["manufacturer", values.manufacturer],
          ["model", values.model],
          ["serial", values.serial],
        ] as const
      ).map(([field, value], index) => ({
        field,
        value,
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: [ids[index]!],
      }));
      const decision = new DeterministicIntakeConfidencePolicy().evaluate({
        images: [image],
        semantic: nameplateSemantic(fields),
        ocr: {
          provider: "google-vision",
          model: "document-text-detection",
          lines: ocrLines([
            [ids[0]!, values.manufacturer],
            [ids[1]!, values.model],
            [ids[2]!, values.serial],
          ]),
        },
        config,
      })[0]!;
      expect(decision.accepted).toBe(true);
      expect(decision.reasons).toEqual([]);
    }
  });

  it("accepts unlabeled stacked identity rows and only explicit-unit capacity", () => {
    const fieldsForCapacity = (capacity: string) =>
      (
        [
          ["manufacturer", "Continental Girbau, Inc.", "manufacturer-row"],
          ["model", "EH020XA1321121011", "stacked-row-1"],
          ["serial", "1443229G16", "stacked-row-2"],
          ["capacityLb", capacity, "capacity-row"],
        ] as const
      ).map(([field, value, lineId]) => ({
        field,
        value,
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: [lineId],
      }));
    const evaluate = (capacity: string, capacityOcr: string) =>
      new DeterministicIntakeConfidencePolicy().evaluate({
        images: [image],
        semantic: nameplateSemantic(fieldsForCapacity(capacity)),
        ocr: {
          provider: "google-vision",
          model: "document-text-detection",
          lines: ocrLines([
            ["manufacturer-row", "Continental Girbau, Inc."],
            ["stacked-row-1", "EH020XA1321121011"],
            ["stacked-row-2", "1443229G16"],
            ["capacity-row", capacityOcr],
          ]),
        },
        config,
      })[0]!;

    const explicit = evaluate("20 LBS", "20 LBS");
    expect(explicit.accepted).toBe(true);
    expect(explicit.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "model",
          value: "EH020XA1321121011",
          accepted: true,
        }),
        expect.objectContaining({
          field: "serial",
          value: "1443229G16",
          accepted: true,
        }),
        expect.objectContaining({
          field: "capacityLb",
          value: "20",
          accepted: true,
        }),
      ]),
    );

    const bare = evaluate("60", "60");
    expect(bare.accepted).toBe(true);
    expect(bare.reasons).not.toContain("unsupported_evidence");
    expect(bare.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "capacityLb",
          value: null,
          accepted: false,
          reason: "unsupported_evidence",
        }),
      ]),
    );
  });

  it("rejects duplicate v2 field proposals instead of choosing one", () => {
    const fields = [
      ["manufacturer", "ACME", "manufacturer-line-1"],
      ["manufacturer", "OTHER", "manufacturer-line-2"],
      ["model", "M1", "model-line"],
      ["serial", "SN-1", "serial-line"],
    ] as const;
    const proposals = fields.map(([field, value, lineId]) => ({
      field,
      value,
      confidence: 0.99,
      photoId: photo,
      box,
      ocrLineIds: [lineId],
    }));
    const decision = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic: nameplateSemantic(proposals),
      ocr: {
        provider: "google-vision",
        model: "document-text-detection",
        lines: ocrLines([
          ["manufacturer-line-1", "ACME"],
          ["manufacturer-line-2", "OTHER"],
          ["model-line", "M1"],
          ["serial-line", "SN-1"],
        ]),
      },
      config,
    })[0]!;
    expect(decision.accepted).toBe(false);
    expect(decision.reasons).toContain("conflicting_evidence");
    expect(
      decision.fields.filter((field) => field.field === "manufacturer"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accepted: false,
          value: null,
          reason: "conflicting_evidence",
        }),
      ]),
    );
  });

  it("rejects unknown v2 photo, quality, and OCR evidence references", () => {
    const unknownPhoto = "00000000-0000-4000-8000-000000000099";
    const fields = (
      [
        ["manufacturer", "ACME", "unknown-line"],
        ["model", "M1", "model-line"],
        ["serial", "SN-1", "serial-line"],
      ] as const
    ).map(([field, value, lineId]) => ({
      field,
      value,
      confidence: 0.99,
      photoId: photo,
      box,
      ocrLineIds: [lineId],
    }));
    const semantic = nameplateSemantic(fields);
    semantic.groups[0]!.photoIds.push(unknownPhoto);
    semantic.groups[0]!.quality = [
      { photoId: unknownPhoto, reason: "small_text" },
    ];
    const decisions = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic,
      ocr: {
        provider: "google-vision",
        model: "document-text-detection",
        lines: ocrLines([
          ["model-line", "M1"],
          ["serial-line", "SN-1"],
        ]),
      },
      config,
    });
    expect(decisions[0]?.accepted).toBe(false);
    expect(decisions[0]?.reasons).toContain("unsupported_evidence");
    expect(decisions[0]?.fields[0]?.reason).toBe("unsupported_evidence");
  });

  it("ignores unknown-only groups and rejects the real photo safely", () => {
    const unknownPhoto = "00000000-0000-4000-8000-000000000099";
    const fields = [
      {
        field: "manufacturer" as const,
        value: "ACME",
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: ["manufacturer-line"],
      },
      {
        field: "model" as const,
        value: "M1",
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: ["model-line"],
      },
      {
        field: "serial" as const,
        value: "SN-1",
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: ["serial-line"],
      },
    ];
    const semantic = nameplateSemantic(fields);
    semantic.groups.push({
      key: "unknown-only",
      photoIds: [unknownPhoto],
      confidence: 0.99,
      fields: [],
      quality: [],
    });
    const ocrResult = {
      provider: "google-vision",
      model: "document-text-detection",
      lines: ocrLines([
        ["manufacturer-line", "ACME"],
        ["model-line", "M1"],
        ["serial-line", "SN-1"],
      ]),
    };
    const policy = new DeterministicIntakeConfidencePolicy();
    const decisions = policy.evaluate({
      images: [image],
      semantic,
      ocr: ocrResult,
      config,
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toEqual(
      expect.objectContaining({
        photoIds: [photo],
        accepted: false,
      }),
    );
    expect(decisions[0]?.reasons).toContain("unsupported_evidence");
    expect(
      policy.evaluate({
        images: [],
        semantic,
        ocr: ocrResult,
        config,
      }),
    ).toEqual([]);
  });

  it.each([
    ["machineType", "washer-ish"],
    ["phase", "two_phase"],
    ["fuel", "diesel"],
  ] as const)("rejects unsupported v2 %s values", (field, value) => {
    const fields = [
      {
        field: "manufacturer" as const,
        value: "ACME",
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: ["manufacturer-line"],
      },
      {
        field: "model" as const,
        value: "M1",
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: ["model-line"],
      },
      {
        field: "serial" as const,
        value: "SN-1",
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: ["serial-line"],
      },
      {
        field,
        value,
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: ["optional-line"],
      },
    ];
    const decision = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic: nameplateSemantic(fields),
      ocr: ocrLines([
        ["manufacturer-line", "ACME"],
        ["model-line", "M1"],
        ["serial-line", "SN-1"],
        ["optional-line", value],
      ]).reduce(
        (result, line) => ({
          ...result,
          provider: "google-vision",
          model: "document-text-detection",
          lines: [...result.lines, line],
        }),
        {
          provider: "google-vision",
          model: "document-text-detection",
          lines: [],
        } as IntakeOcrResult,
      ),
      config,
    })[0]!;
    expect(decision.accepted).toBe(true);
    expect(decision.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field,
          value: null,
          accepted: false,
          reason: "unsupported_evidence",
        }),
      ]),
    );
  });

  it("rejects duplicate photo IDs in one v2 group", () => {
    const fields = [
      {
        field: "manufacturer" as const,
        value: "ACME",
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: ["manufacturer-line"],
      },
      {
        field: "model" as const,
        value: "M1",
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: ["model-line"],
      },
      {
        field: "serial" as const,
        value: "SN-1",
        confidence: 0.99,
        photoId: photo,
        box,
        ocrLineIds: ["serial-line"],
      },
    ];
    const semantic = nameplateSemantic(fields);
    semantic.groups[0]!.photoIds = [photo, photo];
    const decision = new DeterministicIntakeConfidencePolicy().evaluate({
      images: [image],
      semantic,
      ocr: {
        provider: "google-vision",
        model: "document-text-detection",
        lines: ocrLines([
          ["manufacturer-line", "ACME"],
          ["model-line", "M1"],
          ["serial-line", "SN-1"],
        ]),
      },
      config,
    })[0]!;
    expect(decision.accepted).toBe(false);
    expect(decision.reasons).toEqual(
      expect.arrayContaining(["ambiguous_grouping", "unsupported_evidence"]),
    );
    expect(decision.photoIds).toEqual([photo]);
  });

  it("rejects an OCR-unsupported confusable without guessing", () => {
    const policy = new DeterministicIntakeConfidencePolicy();
    const candidate = semantic("SN-O");
    candidate.schemaVersion = "intake-nameplate-v2";
    candidate.groups[0]!.photoIds = [photo];
    candidate.groups[0]!.fields = candidate.groups[0]!.fields.map(
      (field, index) => ({
        ...field,
        ocrLineIds: [`${photo}:line-${index + 1}`],
      }),
    );
    expect(
      policy.evaluate({
        images: [image],
        semantic: candidate,
        ocr: {
          provider: "google-vision",
          model: "document-text-detection",
          lines: ["washer", "ACME", "M1", "SN-0"].map((text, index) => ({
            lineId: `${photo}:line-${index + 1}`,
            photoId: photo,
            text,
            confidence: 0.99,
            box,
          })),
        },
        config,
      })[0],
    ).toMatchObject({
      accepted: false,
      reasons: expect.arrayContaining(["unsupported_evidence"]),
      fields: expect.arrayContaining([
        expect.objectContaining({
          field: "serial",
          reason: "unsupported_evidence",
          value: null,
        }),
      ]),
    });
  });
});
