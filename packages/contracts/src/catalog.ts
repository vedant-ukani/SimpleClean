import { z } from "zod";

export function normalizeCatalogIdentity(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
}

const IdSchema = z.string().trim().min(1).max(160);
export const CatalogRevisionIdSchema = IdSchema;
const TimestampSchema = z.iso.datetime();
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const NullableYearSchema = z.number().int().min(1800).max(2200).nullable();
const PositiveMeasurementSchema = z.number().positive().max(100_000).nullable();

export const CATALOG_EQUIPMENT_CLASSES = [
  "washer",
  "dryer",
  "stack_dryer",
  "stacked_washer_dryer",
  "washer_dryer_combo",
  "other",
] as const;
export const CATALOG_RESOLUTION_STATUSES = [
  "exact",
  "ambiguous",
  "unsupported",
  "insufficient_input",
] as const;
export const CATALOG_SPEC_FIELDS = [
  "widthIn",
  "depthIn",
  "heightIn",
  "weightLb",
  "capacityLb",
  "voltage",
  "phase",
  "fuel",
  "configuration",
] as const;
export const CATALOG_SPECIFICATION_ENRICHMENT_FIELDS = [
  ...CATALOG_SPEC_FIELDS,
  "productionStartYear",
  "productionEndYear",
] as const;
export const CATALOG_DISCOVERY_OPERATIONS = [
  "unsupported_model_discovery",
  "specification_enrichment",
] as const;
export const CATALOG_DISCOVERY_NO_RESULT_REASONS = [
  "identity_mismatch",
  "model_evidence_unverified",
  "equipment_class_evidence_unverified",
  "equipment_class_mismatch",
  "no_verified_specifications",
  "no_newly_verified_fields",
  "inverted_production_years",
  "superseded",
] as const;
export const CATALOG_SOURCE_CLASSES = [
  "official_manufacturer",
  "third_party",
  "distributor",
  "reseller",
  "marketplace",
  "unknown",
] as const;
export const CATALOG_PUBLICATION_MODES = [
  "reviewed_snapshot",
  "automatic_official_source_policy",
] as const;

export const CatalogEquipmentClassSchema = z.enum(CATALOG_EQUIPMENT_CLASSES);
export function suggestedMachineType(
  equipmentClass: z.infer<typeof CatalogEquipmentClassSchema>,
): "washer" | "dryer" | "other" {
  if (equipmentClass === "washer") return "washer";
  if (equipmentClass === "dryer" || equipmentClass === "stack_dryer")
    return "dryer";
  return "other";
}
export const CatalogResolutionStatusSchema = z.enum(
  CATALOG_RESOLUTION_STATUSES,
);
export const CatalogSpecFieldSchema = z.enum([
  ...CATALOG_SPEC_FIELDS,
  "model",
  "equipmentClass",
  "productionStartYear",
  "productionEndYear",
]);
export const CatalogSourceClassSchema = z.enum(CATALOG_SOURCE_CLASSES);
export const CatalogPublicationModeSchema = z.enum(CATALOG_PUBLICATION_MODES);
export const CatalogSpecificationEnrichmentFieldSchema = z.enum(
  CATALOG_SPECIFICATION_ENRICHMENT_FIELDS,
);
export const CatalogDiscoveryOperationSchema = z.enum(
  CATALOG_DISCOVERY_OPERATIONS,
);
export const CatalogDiscoveryNoResultReasonSchema = z.enum(
  CATALOG_DISCOVERY_NO_RESULT_REASONS,
);

export const CatalogSourceSchema = z
  .object({
    id: IdSchema,
    url: z.url().max(2_000),
    title: z.string().trim().min(1).max(500),
    retrievedAt: TimestampSchema,
    documentRevision: z.string().trim().max(200).nullable(),
    checksum: Sha256Schema.nullable(),
    checksumUnavailableReason: z.string().trim().min(1).max(500).optional(),
    sourceClass: CatalogSourceClassSchema.optional(),
  })
  .superRefine((source, context) => {
    if (source.checksum === null && !source.checksumUnavailableReason)
      context.addIssue({
        code: "custom",
        path: ["checksumUnavailableReason"],
        message: "Unavailable content checksums require an explicit reason",
      });
    if (source.checksum !== null && source.checksumUnavailableReason)
      context.addIssue({
        code: "custom",
        path: ["checksumUnavailableReason"],
        message: "Verified checksums cannot have an unavailable reason",
      });
  });

export const CatalogFieldEvidenceSchema = z.object({
  field: CatalogSpecFieldSchema,
  sourceId: IdSchema,
  locator: z.string().trim().min(1).max(500),
  officialValue: z.string().trim().max(240).nullable(),
  officialUnit: z.string().trim().max(80).nullable(),
});

export const CatalogSpecsSchema = z.object({
  widthIn: PositiveMeasurementSchema,
  depthIn: PositiveMeasurementSchema,
  heightIn: PositiveMeasurementSchema,
  weightLb: PositiveMeasurementSchema,
  capacityLb: PositiveMeasurementSchema,
  voltage: z.array(z.string().trim().min(1).max(120)).max(24),
  phase: z.array(z.enum(["single_phase", "three_phase"])).max(2),
  fuel: z.array(z.enum(["gas", "electric", "steam", "other"])).max(4),
  configuration: z.array(z.string().trim().min(1).max(240)).max(40),
});

export function missingCatalogSpecificationFields(input: {
  specs: z.infer<typeof CatalogSpecsSchema>;
  productionStartYear: number | null;
  productionEndYear: number | null;
}): z.infer<typeof CatalogSpecificationEnrichmentFieldSchema>[] {
  return CATALOG_SPECIFICATION_ENRICHMENT_FIELDS.filter((field) => {
    if (field === "productionStartYear" || field === "productionEndYear")
      return input[field] === null;
    const value = input.specs[field];
    return Array.isArray(value) ? value.length === 0 : value === null;
  });
}

const YearOrRangeSchema = z.union([
  z.number().int().min(1800).max(2200),
  z.tuple([
    z.number().int().min(1800).max(2200),
    z.number().int().min(1800).max(2200),
  ]),
]);

export const CatalogSerialRuleSchema = z
  .object({
    id: IdSchema,
    revision: z.number().int().positive(),
    sourceId: IdSchema,
    locator: z.string().trim().min(1).max(500),
    type: z.enum(["year_code_at_position", "two_digit_year_at_position"]),
    position: z.number().int().min(0).max(239),
    length: z.number().int().min(1).max(4),
    minimumSerialLength: z.number().int().min(1).max(240),
    codes: z.record(z.string().min(1).max(8), YearOrRangeSchema).optional(),
    earliestYear: z.number().int().min(1800).max(2200).optional(),
    latestYear: z.number().int().min(1800).max(2200).optional(),
  })
  .superRefine((rule, context) => {
    if (rule.position + rule.length > rule.minimumSerialLength) {
      context.addIssue({
        code: "custom",
        message: "Serial rule position exceeds its minimum length",
      });
    }
    for (const [code, value] of Object.entries(rule.codes ?? {})) {
      if (
        code.length !== rule.length ||
        (Array.isArray(value) && value[0] > value[1])
      ) {
        context.addIssue({
          code: "custom",
          path: ["codes", code],
          message: "Serial code or year range is invalid",
        });
      }
    }
    if (rule.type === "year_code_at_position" && !rule.codes) {
      context.addIssue({
        code: "custom",
        path: ["codes"],
        message: "codes are required",
      });
    }
    if (
      rule.type === "two_digit_year_at_position" &&
      (rule.length !== 2 ||
        !rule.earliestYear ||
        !rule.latestYear ||
        rule.earliestYear > rule.latestYear)
    ) {
      context.addIssue({
        code: "custom",
        message: "two-digit year bounds are invalid",
      });
    }
  });

export const CatalogRevisionSchema = z.object({
  id: IdSchema,
  revision: z.number().int().positive(),
  approvedAt: TimestampSchema,
  productionStartYear: NullableYearSchema,
  productionEndYear: NullableYearSchema,
  specs: CatalogSpecsSchema,
  evidence: z.array(CatalogFieldEvidenceSchema).max(80),
  publicationMode: CatalogPublicationModeSchema.optional(),
});

export const CatalogSeedModelSchema = z.object({
  id: IdSchema,
  family: z.string().trim().min(1).max(240),
  model: z.string().trim().min(1).max(240),
  aliases: z.array(z.string().trim().min(1).max(240)).max(80),
  equipmentClass: CatalogEquipmentClassSchema,
  revision: CatalogRevisionSchema,
  serialRules: z.array(CatalogSerialRuleSchema).max(20),
});

export const CatalogSeedManufacturerSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(240),
  aliases: z.array(z.string().trim().min(1).max(240)).max(40),
  sources: z.array(CatalogSourceSchema).min(1),
  models: z.array(CatalogSeedModelSchema),
});

export const CatalogSeedManifestSchema = z
  .object({
    datasetId: IdSchema,
    snapshotDate: z.iso.date(),
    checksum: Sha256Schema,
    manufacturers: z.array(CatalogSeedManufacturerSchema).min(1),
  })
  .superRefine((manifest, context) => {
    const manufacturerIds = new Set<string>();
    const modelIds = new Set<string>();
    const revisionIds = new Set<string>();
    const globalSourceIds = new Set<string>();
    for (const [
      manufacturerIndex,
      manufacturer,
    ] of manifest.manufacturers.entries()) {
      if (manufacturerIds.has(manufacturer.id)) {
        context.addIssue({
          code: "custom",
          path: ["manufacturers", manufacturerIndex, "id"],
          message: "duplicate manufacturer ID",
        });
      }
      manufacturerIds.add(manufacturer.id);
      const manufacturerKeys = [manufacturer.name, ...manufacturer.aliases].map(
        normalizeCatalogIdentity,
      );
      if (new Set(manufacturerKeys).size !== manufacturerKeys.length) {
        context.addIssue({
          code: "custom",
          path: ["manufacturers", manufacturerIndex, "aliases"],
          message: "duplicate normalized manufacturer name or alias",
        });
      }
      const sourceIds = new Set(
        manufacturer.sources.map((source) => source.id),
      );
      for (const source of manufacturer.sources) {
        if (globalSourceIds.has(source.id))
          context.addIssue({
            code: "custom",
            message: "Source IDs must be globally unique",
          });
        globalSourceIds.add(source.id);
      }
      if (sourceIds.size !== manufacturer.sources.length) {
        context.addIssue({
          code: "custom",
          path: ["manufacturers", manufacturerIndex, "sources"],
          message: "duplicate source ID",
        });
      }
      for (const [modelIndex, model] of manufacturer.models.entries()) {
        if (modelIds.has(model.id)) {
          context.addIssue({
            code: "custom",
            path: [
              "manufacturers",
              manufacturerIndex,
              "models",
              modelIndex,
              "id",
            ],
            message: "duplicate model ID",
          });
        }
        modelIds.add(model.id);
        if (revisionIds.has(model.revision.id)) {
          context.addIssue({
            code: "custom",
            path: [
              "manufacturers",
              manufacturerIndex,
              "models",
              modelIndex,
              "revision",
              "id",
            ],
            message: "duplicate revision ID",
          });
        }
        revisionIds.add(model.revision.id);
        if (
          model.revision.productionStartYear !== null &&
          model.revision.productionEndYear !== null &&
          model.revision.productionStartYear > model.revision.productionEndYear
        )
          context.addIssue({
            code: "custom",
            message: "Production year range is reversed",
          });
        const modelKeys = [model.model, ...model.aliases].map(
          normalizeCatalogIdentity,
        );
        if (new Set(modelKeys).size !== modelKeys.length) {
          context.addIssue({
            code: "custom",
            path: [
              "manufacturers",
              manufacturerIndex,
              "models",
              modelIndex,
              "aliases",
            ],
            message: "duplicate normalized model name or alias",
          });
        }
        const serialRuleKeys = model.serialRules.map(
          (rule) => `${rule.id}:${rule.revision}`,
        );
        if (new Set(serialRuleKeys).size !== serialRuleKeys.length) {
          context.addIssue({
            code: "custom",
            path: [
              "manufacturers",
              manufacturerIndex,
              "models",
              modelIndex,
              "serialRules",
            ],
            message: "duplicate serial rule revision",
          });
        }
        const citedFields = new Set(
          model.revision.evidence.map((item) => item.field),
        );
        for (const field of [
          "model",
          "equipmentClass",
          ...(model.revision.productionStartYear === null
            ? []
            : ["productionStartYear"]),
          ...(model.revision.productionEndYear === null
            ? []
            : ["productionEndYear"]),
        ] as const) {
          if (!citedFields.has(field as z.infer<typeof CatalogSpecFieldSchema>))
            context.addIssue({
              code: "custom",
              message: `${field} requires evidence`,
            });
        }
        const specs = model.revision.specs;
        for (const field of CATALOG_SPEC_FIELDS) {
          const value = specs[field];
          const hasValue = Array.isArray(value)
            ? value.length > 0
            : value !== null;
          if (hasValue && !citedFields.has(field)) {
            context.addIssue({
              code: "custom",
              path: [
                "manufacturers",
                manufacturerIndex,
                "models",
                modelIndex,
                "revision",
                "evidence",
              ],
              message: `${field} requires evidence`,
            });
          }
        }
        for (const evidence of model.revision.evidence) {
          if (!sourceIds.has(evidence.sourceId)) {
            context.addIssue({
              code: "custom",
              message: "field evidence references an unknown source",
            });
          }
        }
        for (const rule of model.serialRules) {
          if (!sourceIds.has(rule.sourceId)) {
            context.addIssue({
              code: "custom",
              message: "serial rule references an unknown source",
            });
          }
        }
      }
    }
  });

export const CatalogManufactureDateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("exact"),
    year: z.number().int().min(1800).max(2200),
    ruleId: IdSchema,
    ruleRevision: z.number().int().positive(),
    sourceId: IdSchema,
    locator: z.string().min(1).max(500),
  }),
  z.object({
    kind: z.literal("range"),
    startYear: z.number().int().min(1800).max(2200),
    endYear: z.number().int().min(1800).max(2200),
    ruleId: IdSchema,
    ruleRevision: z.number().int().positive(),
    sourceId: IdSchema,
    locator: z.string().min(1).max(500),
  }),
  z.object({
    kind: z.literal("unknown"),
    reason: z.enum([
      "serial_not_provided",
      "serial_rule_unavailable",
      "serial_not_decodable",
      "conflicting_rules",
      "rule_error",
    ]),
  }),
]);

export const ResolveCatalogModelRequestSchema = z.object({
  manufacturer: z.string().trim().max(240).nullable().optional(),
  model: z.string().trim().max(240).nullable().optional(),
  serial: z.string().trim().max(240).nullable().optional(),
});

export const ResolveCatalogModelResponseSchema = z.object({
  status: CatalogResolutionStatusSchema,
  matchKind: z.enum(["canonical", "alias"]).nullable().optional(),
  revisionId: IdSchema.nullable().optional(),
  manufacturer: z.string().min(1).max(240).nullable().optional(),
  model: z.string().min(1).max(240).nullable().optional(),
  equipmentClass: CatalogEquipmentClassSchema.nullable().optional(),
  manufactureDate: CatalogManufactureDateSchema.optional(),
  candidateRevisionIds: z.array(IdSchema).max(100).optional(),
});

export const CatalogModelSummarySchema = z.object({
  manufacturerId: IdSchema,
  manufacturer: z.string().min(1),
  modelId: IdSchema,
  family: z.string().min(1),
  model: z.string().min(1),
  equipmentClass: CatalogEquipmentClassSchema,
  revisionId: IdSchema,
  revision: z.number().int().positive(),
});

export const CatalogModelDetailSchema = CatalogModelSummarySchema.extend({
  aliases: z.array(z.string()),
  productionStartYear: NullableYearSchema,
  productionEndYear: NullableYearSchema,
  specs: CatalogSpecsSchema,
  sources: z.array(CatalogSourceSchema),
  evidence: z.array(CatalogFieldEvidenceSchema),
  publicationMode: CatalogPublicationModeSchema.optional(),
  discoveryRun: z
    .lazy(() => CatalogDiscoveryRunSchema)
    .nullable()
    .optional(),
});

const DiscoveryEvidenceSchema = z.object({
  sourceUrl: z.url().max(2_000),
  locator: z.string().trim().min(1).max(500),
  exactModelPresent: z.boolean(),
});

export const CatalogDiscoveryFieldSchema = DiscoveryEvidenceSchema.extend({
  field: z.enum(CATALOG_SPEC_FIELDS),
  normalizedValue: z.union([
    z.number(),
    z.string().trim().min(1).max(240),
    z.array(z.string().trim().min(1).max(120)).max(40),
  ]),
  officialValue: z.string().trim().min(1).max(240),
  officialUnit: z.string().trim().max(80).nullable(),
});

export const CatalogDiscoverySerialRuleSchema = DiscoveryEvidenceSchema.extend({
  exactModelPresent: z.boolean(),
  evidenceScope: z.enum(["exact_model", "documented_family"]),
  rule: z.object({
    id: IdSchema,
    revision: z.number().int().positive(),
    type: z.enum(["year_code_at_position", "two_digit_year_at_position"]),
    position: z.number().int().min(0).max(239),
    length: z.number().int().min(1).max(4),
    minimumSerialLength: z.number().int().min(1).max(240),
    codes: z
      .array(
        z.object({
          code: z.string().min(1).max(8),
          startYear: z.number().int().min(1800).max(2200),
          endYear: z.number().int().min(1800).max(2200).nullable(),
        }),
      )
      .max(100),
    earliestYear: z.number().int().min(1800).max(2200).nullable(),
    latestYear: z.number().int().min(1800).max(2200).nullable(),
  }),
});

export const CatalogDiscoveryResultSchema = z.object({
  manufacturer: z.string().trim().min(1).max(240),
  model: z.string().trim().min(1).max(240),
  equipmentClass: CatalogEquipmentClassSchema,
  modelEvidence: DiscoveryEvidenceSchema,
  equipmentClassEvidence: DiscoveryEvidenceSchema,
  fields: z.array(CatalogDiscoveryFieldSchema).max(80),
  productionStartYear: NullableYearSchema,
  productionEndYear: NullableYearSchema,
  productionEvidence: z
    .array(
      DiscoveryEvidenceSchema.extend({
        field: z.enum(["productionStartYear", "productionEndYear"]),
        officialValue: z.string().trim().min(1).max(240),
        officialUnit: z.string().trim().max(80).nullable(),
      }),
    )
    .max(2)
    .default([]),
  serialRules: z.array(CatalogDiscoverySerialRuleSchema).max(20),
});

export const CatalogDiscoveryUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  raw: z.record(z.string(), z.number().int().nonnegative()).default({}),
});

export const CatalogDiscoveryPricingSchema = z.object({
  version: z.string().trim().min(1).max(120),
  inputUsdPerMillionTokens: z.number().nonnegative().max(10_000),
  outputUsdPerMillionTokens: z.number().nonnegative().max(10_000),
  webSearchUsdPerCall: z.number().nonnegative().max(10_000),
});

export const CatalogDiscoveryRunSchema = z.object({
  id: IdSchema,
  status: z.enum(["running", "published", "no_result", "retryable_failure"]),
  normalizedManufacturer: z.string().min(1).max(240),
  normalizedModel: z.string().min(1).max(240),
  provider: z.string().min(1).max(120),
  model: z.string().min(1).max(120),
  promptVersion: z.string().min(1).max(120),
  schemaVersion: z.string().min(1).max(120),
  policyVersion: z.string().min(1).max(120),
  publicationMode: z.literal("automatic_official_source_policy"),
  operation: CatalogDiscoveryOperationSchema.optional(),
  revisionId: IdSchema.nullable(),
  noResultReason: CatalogDiscoveryNoResultReasonSchema.nullable(),
  usage: CatalogDiscoveryUsageSchema.nullable(),
  webSearchCallCount: z.number().int().nonnegative(),
  pricing: CatalogDiscoveryPricingSchema,
  estimatedCostUsd: z.number().nonnegative(),
  responseFingerprint: Sha256Schema.nullable(),
  createdAt: TimestampSchema,
  completedAt: TimestampSchema.nullable(),
});

export const CandidateCatalogEnrichmentSchema = z.object({
  status: z.enum(["researching", "verified", "no_verified_specs", "disabled"]),
  revision: CatalogModelDetailSchema.nullable(),
  discoveryRun: CatalogDiscoveryRunSchema.nullable(),
  manufactureDate: CatalogManufactureDateSchema.nullable().optional(),
});

export const CatalogListQuerySchema = z.object({
  manufacturer: z.string().trim().max(240).optional(),
  query: z.string().trim().max(240).default(""),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export const CatalogListResponseSchema = z.object({
  models: z.array(CatalogModelSummarySchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export const CatalogDetailResponseSchema = z.object({
  model: CatalogModelDetailSchema,
});

export const MachineActualSpecsSchema = z.object({
  widthIn: PositiveMeasurementSchema,
  depthIn: PositiveMeasurementSchema,
  heightIn: PositiveMeasurementSchema,
  weightLb: PositiveMeasurementSchema,
  version: z.number().int().positive(),
  updatedAt: TimestampSchema,
  updatedByUserId: z.string().min(1),
});
export const UpdateMachineActualSpecsRequestSchema = z
  .object({
    widthIn: PositiveMeasurementSchema.optional(),
    depthIn: PositiveMeasurementSchema.optional(),
    heightIn: PositiveMeasurementSchema.optional(),
    weightLb: PositiveMeasurementSchema.optional(),
    expectedVersion: z.number().int().nonnegative(),
  })
  .refine(
    ({ expectedVersion: _version, ...changes }) =>
      Object.values(changes).some((value) => value !== undefined),
    { message: "At least one actual specification is required" },
  );

const EffectiveValueSchema = z.object({
  value: PositiveMeasurementSchema,
  source: z.enum(["actual", "machine", "catalog", "unknown"]),
});
export const MachineEffectiveSpecsSchema = z.object({
  widthIn: EffectiveValueSchema,
  depthIn: EffectiveValueSchema,
  heightIn: EffectiveValueSchema,
  weightLb: EffectiveValueSchema,
  capacityLb: EffectiveValueSchema,
});

export const MachineCatalogEnrichmentSchema = z.object({
  resolutionId: IdSchema.nullable(),
  identityVersion: z.number().int().positive().optional(),
  pendingIdentityResolution: z.boolean().optional(),
  status: CatalogResolutionStatusSchema,
  matchKind: z.enum(["canonical", "alias"]).nullable(),
  resolvedAt: TimestampSchema.nullable(),
  revision: CatalogModelDetailSchema.nullable(),
  manufactureDate: CatalogManufactureDateSchema,
  actualSpecs: MachineActualSpecsSchema.nullable(),
  effectiveSpecs: MachineEffectiveSpecsSchema,
});

export const CatalogTypeSuggestionSchema = z.object({
  equipmentClass: CatalogEquipmentClassSchema,
  machineType: z.enum(["washer", "dryer", "other"]),
  revisionId: IdSchema,
  manufacturer: z.string().min(1),
  model: z.string().min(1),
  label: z.string().min(1),
});

export type CatalogSeedManifest = z.infer<typeof CatalogSeedManifestSchema>;
export type CatalogSeedManufacturer = z.infer<
  typeof CatalogSeedManufacturerSchema
>;
export type CatalogSeedModel = z.infer<typeof CatalogSeedModelSchema>;
export type CatalogSerialRule = z.infer<typeof CatalogSerialRuleSchema>;
export type CatalogSpecs = z.infer<typeof CatalogSpecsSchema>;
export type CatalogModelDetail = z.infer<typeof CatalogModelDetailSchema>;
export type CatalogListQuery = z.infer<typeof CatalogListQuerySchema>;
export type CatalogListResponse = z.infer<typeof CatalogListResponseSchema>;
export type ResolveCatalogModelRequest = z.infer<
  typeof ResolveCatalogModelRequestSchema
>;
export type ResolveCatalogModelResponse = z.infer<
  typeof ResolveCatalogModelResponseSchema
>;
export type MachineCatalogEnrichment = z.infer<
  typeof MachineCatalogEnrichmentSchema
>;
export type MachineActualSpecs = z.infer<typeof MachineActualSpecsSchema>;
export type UpdateMachineActualSpecsRequest = z.infer<
  typeof UpdateMachineActualSpecsRequestSchema
>;
export type MachineEffectiveSpecs = z.infer<typeof MachineEffectiveSpecsSchema>;
export type CatalogTypeSuggestion = z.infer<typeof CatalogTypeSuggestionSchema>;
export type CatalogSourceClass = z.infer<typeof CatalogSourceClassSchema>;
export type CatalogPublicationMode = z.infer<
  typeof CatalogPublicationModeSchema
>;
export type CatalogDiscoveryField = z.infer<typeof CatalogDiscoveryFieldSchema>;
export type CatalogDiscoveryResult = z.infer<
  typeof CatalogDiscoveryResultSchema
>;
export type CatalogDiscoverySerialRule = z.infer<
  typeof CatalogDiscoverySerialRuleSchema
>;
export type CatalogDiscoveryUsage = z.infer<typeof CatalogDiscoveryUsageSchema>;
export type CatalogDiscoveryPricing = z.infer<
  typeof CatalogDiscoveryPricingSchema
>;
export type CatalogDiscoveryRun = z.infer<typeof CatalogDiscoveryRunSchema>;
export type CatalogSpecificationEnrichmentField = z.infer<
  typeof CatalogSpecificationEnrichmentFieldSchema
>;
export type CatalogDiscoveryOperation = z.infer<
  typeof CatalogDiscoveryOperationSchema
>;
export type CatalogDiscoveryNoResultReason = z.infer<
  typeof CatalogDiscoveryNoResultReasonSchema
>;
export type CandidateCatalogEnrichment = z.infer<
  typeof CandidateCatalogEnrichmentSchema
>;
