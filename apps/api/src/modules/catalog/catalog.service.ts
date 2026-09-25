import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import {
  CATALOG_SPECIFICATION_ENRICHMENT_FIELDS,
  missingCatalogSpecificationFields,
  CatalogListQuerySchema,
  CatalogRevisionIdSchema,
  CatalogSeedManifestSchema,
  normalizeCatalogIdentity,
  ResolveCatalogModelRequestSchema,
  roleHasPermission,
  type IdentityUser,
  type CatalogListResponse,
  type CatalogModelDetail,
  type CatalogSeedManifest,
  type CandidateCatalogEnrichment,
  type CatalogDiscoveryPricing,
  type CatalogDiscoveryOperation,
  type CatalogDiscoveryRun,
  type CatalogDiscoveryUsage,
  type CatalogSpecificationEnrichmentField,
  type ResolveCatalogModelRequest,
  type ResolveCatalogModelResponse,
} from "@laundrorama/contracts";
import type { ServerConfig } from "@laundrorama/config";
import { createHash } from "node:crypto";

import {
  MUTATION_RECORDER,
  type MutationRecorder,
} from "../operations/operations.ports.js";
import {
  CatalogChecksumConflictError,
  CatalogRepository,
  type CatalogSpecificationBackfillCandidate,
  type CatalogResolutionWithDetail,
} from "./catalog.repository.js";
import { SERVER_CONFIG } from "../../platform/logging.js";
import {
  CatalogDiscoveryProviderError,
  type CatalogDiscoveryProvider,
  type CatalogDiscoveryRequest,
} from "./discovery/catalog-discovery.provider.js";
import {
  verifyCatalogDiscovery,
  type DiscoveryPolicyContext,
  type VerifiedCatalogDiscovery,
} from "./discovery/catalog-discovery.policy.js";

export const CATALOG_OPERATIONS = Symbol("CATALOG_OPERATIONS");
export const CATALOG_DISCOVERY_PROVIDER = Symbol("CATALOG_DISCOVERY_PROVIDER");

export interface CatalogMachineResolutionRecord {
  id: string;
  identityVersion: number;
  identityMatches: boolean;
  status: ResolveCatalogModelResponse["status"];
  matchKind: "canonical" | "alias" | null;
  revisionId: string | null;
  manufactureDate: ResolveCatalogModelResponse["manufactureDate"];
  resolvedAt: string;
  detail: CatalogModelDetail | null;
}

export interface CatalogOperations {
  resolveModel(input: unknown): Promise<CatalogResolutionWithDetail>;
  resolveAndLinkMachine(
    machineId: string,
    input: ResolveCatalogModelRequest,
    context: CatalogLinkContext,
  ): Promise<CatalogMachineResolutionRecord>;
  refreshUnresolvedAndLinkMachine(
    machineId: string,
    input: ResolveCatalogModelRequest,
    context: CatalogLinkContext,
  ): Promise<CatalogMachineResolutionRecord | undefined>;
  listUnresolvedMachineIds(
    afterMachineId?: string,
    limit?: number,
  ): Promise<string[]>;
  currentMachineResolution(
    machineId: string,
    identity?: ResolveCatalogModelRequest,
  ): Promise<CatalogMachineResolutionRecord | undefined>;
  requestDiscovery(
    input: ResolveCatalogModelRequest,
    context: { requestId: string },
  ): Promise<CandidateCatalogEnrichment>;
  enrichmentForIdentity(
    input: ResolveCatalogModelRequest,
  ): Promise<CandidateCatalogEnrichment>;
  previewSpecificationBackfill(
    scope: CatalogSpecificationBackfillScope,
    inventoryVariantIds: ReadonlySet<string>,
    maxModels: number,
  ): Promise<CatalogSpecificationBackfillPreview>;
  requestSpecificationEnrichment(
    variantId: string,
    context: { requestId: string },
  ): Promise<CatalogSpecificationEnrichmentResult>;
}

export type CatalogSpecificationBackfillScope = "inventory" | "all";

export interface CatalogSpecificationBackfillSelection extends CatalogSpecificationBackfillCandidate {
  inventoryPriority: boolean;
}

export interface CatalogSpecificationCoverage {
  total: number;
  known: Record<CatalogSpecificationEnrichmentField, number>;
}

export interface CatalogSpecificationBackfillPreview {
  selected: CatalogSpecificationBackfillSelection[];
  coverage: CatalogSpecificationCoverage;
}

export interface CatalogSpecificationEnrichmentResult {
  outcome: "published" | "no_result" | "reused";
  run: CatalogDiscoveryRun | null;
  revision: CatalogModelDetail | null;
}

export interface CatalogLinkContext {
  actorKind: "user" | "system";
  actorUserId?: string | null;
  requestId: string;
  identityVersion: number;
}

function identityFingerprint(input: ResolveCatalogModelRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.manufacturer ?? null,
        input.model ?? null,
        input.serial ?? null,
      ]),
    )
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  return value;
}

export function catalogManifestChecksum(
  manifest: Omit<CatalogSeedManifest, "checksum"> | CatalogSeedManifest,
): string {
  const content = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => key !== "checksum"),
  );
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(content)))
    .digest("hex");
}

export function catalogSpecificationCoverage(
  candidates: readonly CatalogSpecificationBackfillCandidate[],
): CatalogSpecificationCoverage {
  const known = Object.fromEntries(
    CATALOG_SPECIFICATION_ENRICHMENT_FIELDS.map((field) => [field, 0]),
  ) as Record<CatalogSpecificationEnrichmentField, number>;
  for (const candidate of candidates) {
    const missing = new Set(candidate.missingFields);
    for (const field of CATALOG_SPECIFICATION_ENRICHMENT_FIELDS)
      if (!missing.has(field)) known[field] += 1;
  }
  return { total: candidates.length, known };
}

@Injectable()
export class CatalogService implements CatalogOperations {
  constructor(
    @Inject(CatalogRepository) private readonly repository: CatalogRepository,
    @Inject(MUTATION_RECORDER) private readonly mutations: MutationRecorder,
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(CATALOG_DISCOVERY_PROVIDER)
    private readonly discoveryProvider: CatalogDiscoveryProvider,
  ) {}

  async importManifest(raw: unknown) {
    const parsed = CatalogSeedManifestSchema.safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException("Invalid Catalog snapshot");
    if (catalogManifestChecksum(parsed.data) !== parsed.data.checksum)
      throw new BadRequestException(
        "Catalog snapshot checksum does not match its content",
      );
    try {
      return await this.repository.importManifest(parsed.data);
    } catch (error) {
      if (error instanceof CatalogChecksumConflictError)
        throw new ConflictException(error.message);
      throw error;
    }
  }

  list(raw: unknown, identity: IdentityUser): Promise<CatalogListResponse> {
    this.requireRead(identity);
    const parsed = CatalogListQuerySchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException("Invalid Catalog query");
    return this.repository.list(parsed.data);
  }

  async detail(
    revisionId: string,
    identity: IdentityUser,
  ): Promise<CatalogModelDetail> {
    this.requireRead(identity);
    const parsed = CatalogRevisionIdSchema.safeParse(revisionId);
    if (!parsed.success)
      throw new BadRequestException("Invalid Catalog revision ID");
    const detail = await this.repository.detail(parsed.data);
    if (!detail)
      throw new NotFoundException("Catalog model revision not found");
    return detail;
  }

  private requireRead(identity: IdentityUser): void {
    if (!identity?.active || !roleHasPermission(identity.role, "catalog.read"))
      throw new ForbiddenException();
  }

  resolveModel(raw: unknown): Promise<CatalogResolutionWithDetail> {
    const parsed = ResolveCatalogModelRequestSchema.safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException("Invalid Catalog resolution request");
    return this.repository.resolve(parsed.data);
  }

  async resolveAndLinkMachine(
    machineId: string,
    input: ResolveCatalogModelRequest,
    context: CatalogLinkContext,
  ): Promise<CatalogMachineResolutionRecord> {
    const fingerprint = identityFingerprint(input);
    const resolution = await this.resolveModel(input);
    const id = await this.repository.transaction(async (database) => {
      if (
        !(await this.repository.claimMachineIdentity(
          database,
          machineId,
          context.identityVersion,
          fingerprint,
        ))
      )
        return null;
      const resolutionId = await this.repository.replaceMachineResolution(
        database,
        machineId,
        resolution,
      );
      await this.mutations.record(database, {
        actorKind: context.actorKind,
        ...(context.actorKind === "user" && context.actorUserId
          ? { actorUserId: context.actorUserId }
          : {}),
        action: "catalog.machine.resolved",
        targetType: "catalog_resolution",
        targetId: resolutionId,
        requestId: context.requestId,
        summary: {
          changedFields: ["status", "revision_id", "manufacture_date"],
          outcome: resolution.result.status,
        },
      });
      return resolutionId;
    });
    if (!id) {
      const existing = await this.currentMachineResolution(machineId);
      if (!existing)
        throw new Error("Catalog Machine resolution is unavailable");
      return existing;
    }
    return {
      id,
      identityVersion: context.identityVersion,
      identityMatches: true,
      status: resolution.result.status,
      matchKind: resolution.result.matchKind ?? null,
      revisionId: resolution.result.revisionId ?? null,
      manufactureDate: resolution.result.manufactureDate,
      resolvedAt: new Date().toISOString(),
      detail: resolution.detail,
    };
  }

  async refreshUnresolvedAndLinkMachine(
    machineId: string,
    input: ResolveCatalogModelRequest,
    context: CatalogLinkContext,
  ): Promise<CatalogMachineResolutionRecord | undefined> {
    const resolution = await this.resolveModel(input);
    if (resolution.result.status !== "exact")
      return this.currentMachineResolution(machineId);
    const id = await this.repository.transaction(async (database) => {
      const resolutionId =
        await this.repository.replaceUnresolvedMachineResolution(
          database,
          machineId,
          resolution,
          {
            version: context.identityVersion,
            fingerprint: identityFingerprint(input),
          },
        );
      if (!resolutionId) return null;
      await this.mutations.record(database, {
        actorKind: context.actorKind,
        ...(context.actorKind === "user" && context.actorUserId
          ? { actorUserId: context.actorUserId }
          : {}),
        action: "catalog.machine.resolved",
        targetType: "catalog_resolution",
        targetId: resolutionId,
        requestId: context.requestId,
        summary: {
          changedFields: ["status", "revision_id", "manufacture_date"],
          outcome: resolution.result.status,
        },
      });
      return resolutionId;
    });
    if (!id) return this.currentMachineResolution(machineId);
    return {
      id,
      identityVersion: context.identityVersion,
      identityMatches: true,
      status: resolution.result.status,
      matchKind: resolution.result.matchKind ?? null,
      revisionId: resolution.result.revisionId ?? null,
      manufactureDate: resolution.result.manufactureDate,
      resolvedAt: new Date().toISOString(),
      detail: resolution.detail,
    };
  }

  listUnresolvedMachineIds(
    afterMachineId?: string,
    limit?: number,
  ): Promise<string[]> {
    return this.repository.listUnresolvedMachineIds(afterMachineId, limit);
  }

  async currentMachineResolution(
    machineId: string,
    identity?: ResolveCatalogModelRequest,
  ): Promise<CatalogMachineResolutionRecord | undefined> {
    const record = await this.repository.currentMachineResolution(machineId);
    if (!record) return undefined;
    const { identityFingerprint: storedFingerprint, ...publicRecord } = record;
    return {
      ...publicRecord,
      identityMatches:
        !identity || storedFingerprint === identityFingerprint(identity),
      detail: record.revisionId
        ? ((await this.repository.detail(record.revisionId, true)) ?? null)
        : null,
    };
  }

  private pricing(): CatalogDiscoveryPricing {
    return {
      version: this.config.catalogDiscoveryPricingVersion,
      inputUsdPerMillionTokens:
        this.config.catalogDiscoveryInputUsdPerMillionTokens,
      outputUsdPerMillionTokens:
        this.config.catalogDiscoveryOutputUsdPerMillionTokens,
      webSearchUsdPerCall: this.config.catalogDiscoveryWebSearchUsdPerCall,
    };
  }

  private estimatedCost(
    usage: { inputTokens: number; outputTokens: number },
    calls: number,
    pricing: CatalogDiscoveryPricing,
  ): number {
    return (
      (usage.inputTokens / 1_000_000) * pricing.inputUsdPerMillionTokens +
      (usage.outputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens +
      calls * pricing.webSearchUsdPerCall
    );
  }

  private specificationEnrichmentAvailable(): boolean {
    return (
      this.config.catalogDiscoveryEnabled &&
      this.config.catalogDiscoveryProvider !== "disabled" &&
      (this.config.catalogDiscoveryProvider !== "openai" ||
        Boolean(this.config.catalogDiscoveryApiKey))
    );
  }

  assertSpecificationEnrichmentAvailable(): void {
    if (!this.specificationEnrichmentAvailable())
      throw new CatalogDiscoveryProviderError(
        "invalid_configuration",
        "Catalog discovery provider is unavailable",
      );
  }

  private specificationEnrichmentDedupeKey(
    candidate: CatalogSpecificationBackfillCandidate,
  ): string {
    return createHash("sha256")
      .update(
        JSON.stringify([
          "specification_enrichment",
          candidate.baseRevisionId,
          [...candidate.missingFields].sort(),
          this.config.catalogDiscoveryProvider,
          this.config.catalogDiscoveryModel,
          this.config.catalogDiscoveryPromptVersion,
          this.config.catalogDiscoverySchemaVersion,
          this.config.catalogDiscoveryPolicyVersion,
        ]),
      )
      .digest("hex");
  }

  async previewSpecificationBackfill(
    scope: CatalogSpecificationBackfillScope,
    inventoryVariantIds: ReadonlySet<string>,
    maxModels: number,
  ): Promise<CatalogSpecificationBackfillPreview> {
    if (!Number.isSafeInteger(maxModels) || maxModels <= 0)
      throw new BadRequestException("maxModels must be a positive integer");
    const incomplete =
      await this.repository.listIncompleteLatestApprovedRevisions();
    const eligible = incomplete.filter(
      (candidate) =>
        scope === "all" || inventoryVariantIds.has(candidate.variantId),
    );
    const dedupeKeys = eligible.map((candidate) =>
      this.specificationEnrichmentDedupeKey(candidate),
    );
    const runStates =
      await this.repository.discoveryRunStatesByDedupeKey(dedupeKeys);
    const now = Date.now();
    const ordered = eligible
      .map((candidate, index) => {
        const run = runStates.get(dedupeKeys[index]!);
        const reusable = Boolean(
          run?.status === "published" ||
          run?.status === "no_result" ||
          (run?.status === "running" &&
            run.leaseExpiresAt !== null &&
            run.leaseExpiresAt.getTime() > now),
        );
        return {
          candidate: {
            ...candidate,
            inventoryPriority: inventoryVariantIds.has(candidate.variantId),
          },
          reusable,
        };
      })
      .sort(
        (left, right) =>
          Number(left.reusable) - Number(right.reusable) ||
          Number(right.candidate.inventoryPriority) -
            Number(left.candidate.inventoryPriority) ||
          left.candidate.manufacturer.localeCompare(
            right.candidate.manufacturer,
          ) ||
          left.candidate.model.localeCompare(right.candidate.model) ||
          left.candidate.variantId.localeCompare(right.candidate.variantId),
      )
      .slice(0, maxModels)
      .map(({ candidate }) => candidate);
    return {
      selected: ordered,
      coverage: catalogSpecificationCoverage(ordered),
    };
  }

  private async executeDiscovery(input: {
    operation: CatalogDiscoveryOperation;
    dedupeKey: string;
    manufacturerId: string;
    normalizedManufacturer: string;
    normalizedModel: string;
    request: CatalogDiscoveryRequest;
    verification: DiscoveryPolicyContext;
    requestId: string;
    pricing: CatalogDiscoveryPricing;
    publish: (input: {
      runId: string;
      claimToken: string;
      verified: Extract<VerifiedCatalogDiscovery, { outcome: "verified" }>;
      usage: CatalogDiscoveryUsage;
      webSearchCallCount: number;
      estimatedCostUsd: number;
      responseFingerprint: string;
      providerRequestId: string | null;
    }) => Promise<CatalogDiscoveryRun>;
  }): Promise<{ run: CatalogDiscoveryRun; reused: boolean }> {
    const claim = await this.repository.reserveDiscoveryRun({
      dedupeKey: input.dedupeKey,
      manufacturerId: input.manufacturerId,
      normalizedManufacturer: input.normalizedManufacturer,
      normalizedModel: input.normalizedModel,
      provider: this.config.catalogDiscoveryProvider,
      model: this.config.catalogDiscoveryModel,
      promptVersion: this.config.catalogDiscoveryPromptVersion,
      schemaVersion: this.config.catalogDiscoverySchemaVersion,
      policyVersion: this.config.catalogDiscoveryPolicyVersion,
      pricing: input.pricing,
      requestId: input.requestId,
      leaseMs: this.config.catalogDiscoveryTimeoutMs + 30_000,
      operation: input.operation,
    });
    if (!claim.claimToken) return { run: claim.run, reused: true };
    try {
      const response = await this.discoveryProvider.discover(input.request);
      const estimatedCostUsd = this.estimatedCost(
        response.usage,
        response.webSearchCallCount,
        input.pricing,
      );
      const verified = verifyCatalogDiscovery(response.result, {
        ...input.verification,
        returnedSources: response.sources,
      });
      const run =
        verified.outcome === "verified"
          ? await input.publish({
              runId: claim.run.id,
              claimToken: claim.claimToken,
              verified,
              usage: response.usage,
              webSearchCallCount: response.webSearchCallCount,
              estimatedCostUsd,
              responseFingerprint: response.responseFingerprint,
              providerRequestId: response.requestId,
            })
          : await this.repository.completeDiscoveryNoResult({
              runId: claim.run.id,
              claimToken: claim.claimToken,
              reason: verified.reason,
              usage: response.usage,
              webSearchCallCount: response.webSearchCallCount,
              estimatedCostUsd,
              responseFingerprint: response.responseFingerprint,
              providerRequestId: response.requestId,
              requestId: input.requestId,
              operation: input.operation,
            });
      return { run, reused: false };
    } catch (error) {
      await this.repository.failDiscoveryRun(
        claim.run.id,
        claim.claimToken,
        error instanceof CatalogDiscoveryProviderError
          ? error.code
          : "provider_failed",
        input.requestId,
      );
      throw error;
    }
  }

  private async enrichmentFromRun(
    run: CatalogDiscoveryRun,
  ): Promise<CandidateCatalogEnrichment> {
    if (run.status === "published" && run.revisionId) {
      const revision = await this.repository.detail(run.revisionId);
      return {
        status: revision ? "verified" : "no_verified_specs",
        revision: revision ?? null,
        discoveryRun: run,
      };
    }
    return {
      status: run.status === "no_result" ? "no_verified_specs" : "researching",
      revision: null,
      discoveryRun: run,
    };
  }

  private async approvedBaseEnrichment(
    manufacturer: string | null | undefined,
    model: string | null | undefined,
  ): Promise<CandidateCatalogEnrichment | null> {
    if (!manufacturer?.trim() || !model?.trim()) return null;
    const match = await this.repository.approvedDocumentedBase(
      manufacturer,
      model,
    );
    if (match.status === "matched")
      return {
        status: "verified",
        revision: match.detail,
        discoveryRun: match.detail.discoveryRun ?? null,
      };
    return match.status === "ambiguous"
      ? { status: "no_verified_specs", revision: null, discoveryRun: null }
      : null;
  }

  async enrichmentForIdentity(
    input: ResolveCatalogModelRequest,
  ): Promise<CandidateCatalogEnrichment> {
    const resolved = await this.resolveModel(input);
    if (resolved.result.status === "exact" && resolved.detail)
      return {
        status: "verified",
        revision: resolved.detail,
        discoveryRun: resolved.detail.discoveryRun ?? null,
        manufactureDate: resolved.result.manufactureDate ?? null,
      };
    if (resolved.result.status === "ambiguous")
      return {
        status: "no_verified_specs",
        revision: null,
        discoveryRun: null,
      };
    const approvedBase = await this.approvedBaseEnrichment(
      input.manufacturer,
      input.model,
    );
    if (approvedBase) return approvedBase;
    if (!this.config.catalogDiscoveryEnabled)
      return { status: "disabled", revision: null, discoveryRun: null };
    const manufacturer = input.manufacturer?.trim();
    const model = input.model?.trim();
    if (!manufacturer || !model)
      return {
        status: "no_verified_specs",
        revision: null,
        discoveryRun: null,
      };
    const discoveryContext =
      await this.repository.discoveryContext(manufacturer);
    if (!discoveryContext)
      return {
        status: "no_verified_specs",
        revision: null,
        discoveryRun: null,
      };
    const run = await this.repository.latestDiscoveryRun(
      normalizeCatalogIdentity(discoveryContext.manufacturer),
      normalizeCatalogIdentity(model),
    );
    return run
      ? this.enrichmentFromRun(run)
      : { status: "researching", revision: null, discoveryRun: null };
  }

  async requestSpecificationEnrichment(
    variantId: string,
    context: { requestId: string },
  ): Promise<CatalogSpecificationEnrichmentResult> {
    this.assertSpecificationEnrichmentAvailable();
    const enrichment =
      await this.repository.specificationEnrichmentContext(variantId);
    if (!enrichment) return { outcome: "no_result", run: null, revision: null };
    const normalizedManufacturer = normalizeCatalogIdentity(
      enrichment.manufacturer,
    );
    const normalizedModel = normalizeCatalogIdentity(enrichment.model);
    const missingFields = [...enrichment.missingFields].sort();
    const pricing = this.pricing();
    const dedupeKey = this.specificationEnrichmentDedupeKey(enrichment);
    const result = await this.executeDiscovery({
      operation: "specification_enrichment",
      dedupeKey,
      manufacturerId: enrichment.manufacturerId,
      normalizedManufacturer,
      normalizedModel,
      request: {
        manufacturer: enrichment.manufacturer,
        model: enrichment.model,
        equipmentClass: enrichment.equipmentClass,
        requestedFields: missingFields,
      },
      verification: {
        manufacturer: enrichment.manufacturer,
        model: enrichment.model,
        expectedEquipmentClass: enrichment.equipmentClass,
        requestedFields: missingFields,
        trustedHostnames: enrichment.trustedHostnames,
        returnedSources: [],
      },
      requestId: context.requestId,
      pricing,
      publish: (publication) =>
        this.repository.publishSpecificationEnrichment({
          ...publication,
          baseRevisionId: enrichment.baseRevisionId,
          variantId: enrichment.variantId,
          manufacturerId: enrichment.manufacturerId,
          missingFields,
          requestId: context.requestId,
        }),
    });
    const revision = result.run.revisionId
      ? ((await this.repository.detail(result.run.revisionId)) ?? null)
      : null;
    return {
      outcome: result.reused
        ? "reused"
        : result.run.status === "published"
          ? "published"
          : "no_result",
      run: { ...result.run, operation: "specification_enrichment" },
      revision,
    };
  }

  async requestDiscovery(
    input: ResolveCatalogModelRequest,
    context: { requestId: string },
  ): Promise<CandidateCatalogEnrichment> {
    const parsed = ResolveCatalogModelRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException("Invalid Catalog discovery request");
    const existing = await this.resolveModel(parsed.data);
    if (existing.result.status === "exact" && existing.detail) {
      const approved = existing.detail;
      const enrichment =
        missingCatalogSpecificationFields(approved).length &&
        this.specificationEnrichmentAvailable()
          ? await this.requestSpecificationEnrichment(approved.modelId, context)
          : null;
      return {
        status: "verified",
        revision: enrichment?.revision ?? approved,
        discoveryRun: enrichment?.run ?? approved.discoveryRun ?? null,
      };
    }
    if (existing.result.status === "ambiguous")
      return {
        status: "no_verified_specs",
        revision: null,
        discoveryRun: null,
      };
    const approvedBase = await this.approvedBaseEnrichment(
      parsed.data.manufacturer,
      parsed.data.model,
    );
    if (approvedBase) return approvedBase;
    if (!this.config.catalogDiscoveryEnabled)
      return { status: "disabled", revision: null, discoveryRun: null };
    const manufacturerInput = parsed.data.manufacturer?.trim();
    const modelInput = parsed.data.model?.trim();
    if (!manufacturerInput || !modelInput)
      return {
        status: "no_verified_specs",
        revision: null,
        discoveryRun: null,
      };
    const discoveryContext =
      await this.repository.discoveryContext(manufacturerInput);
    if (!discoveryContext)
      return {
        status: "no_verified_specs",
        revision: null,
        discoveryRun: null,
      };
    const normalizedManufacturer = normalizeCatalogIdentity(
      discoveryContext.manufacturer,
    );
    const normalizedModel = normalizeCatalogIdentity(modelInput);
    const pricing = this.pricing();
    const dedupeKey = createHash("sha256")
      .update(
        JSON.stringify([
          normalizedManufacturer,
          normalizedModel,
          this.config.catalogDiscoveryProvider,
          this.config.catalogDiscoveryModel,
          this.config.catalogDiscoveryPromptVersion,
          this.config.catalogDiscoverySchemaVersion,
          this.config.catalogDiscoveryPolicyVersion,
        ]),
      )
      .digest("hex");
    const result = await this.executeDiscovery({
      operation: "unsupported_model_discovery",
      dedupeKey,
      manufacturerId: discoveryContext.manufacturerId,
      normalizedManufacturer,
      normalizedModel,
      request: {
        manufacturer: discoveryContext.manufacturer,
        model: modelInput,
        equipmentClass: null,
        requestedFields: [
          ...CATALOG_SPECIFICATION_ENRICHMENT_FIELDS,
          "serialRules",
        ],
      },
      verification: {
        manufacturer: discoveryContext.manufacturer,
        model: modelInput,
        trustedHostnames: discoveryContext.trustedHostnames,
        returnedSources: [],
      },
      requestId: context.requestId,
      pricing,
      publish: (publication) =>
        this.repository.publishDiscovery({
          ...publication,
          manufacturerId: discoveryContext.manufacturerId,
          normalizedModel,
          requestId: context.requestId,
        }),
    });
    return this.enrichmentFromRun(result.run);
  }
}
