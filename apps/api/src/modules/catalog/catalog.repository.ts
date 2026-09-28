import { Inject, Injectable } from "@nestjs/common";
import {
  missingCatalogSpecificationFields,
  normalizeCatalogIdentity,
} from "@laundrorama/contracts";
import type {
  CatalogDiscoveryNoResultReason,
  CatalogDiscoveryOperation,
  CatalogDiscoveryPricing,
  CatalogDiscoveryRun,
  CatalogDiscoveryUsage,
  CatalogListQuery,
  CatalogListResponse,
  CatalogModelDetail,
  CatalogSeedManifest,
  CatalogSerialRule,
  CatalogSpecificationEnrichmentField,
  CatalogSpecs,
  ResolveCatalogModelRequest,
  ResolveCatalogModelResponse,
} from "@laundrorama/contracts";
import type {
  DatabaseConnection,
  DatabaseExecutor,
} from "@laundrorama/database";
import { sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";

import { DATABASE_CONNECTION } from "../../platform/database.module.js";
import {
  MUTATION_RECORDER,
  type MutationRecorder,
} from "../operations/operations.ports.js";
import { evaluateSerialRules } from "./catalog.logic.js";
import { hasDocumentedModelRelationship } from "./discovery/catalog-discovery.policy.js";
import type { VerifiedCatalogDiscovery } from "./discovery/catalog-discovery.policy.js";

type Row = Record<string, unknown>;
function rows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  return result && typeof result === "object" && "rows" in result
    ? rows(result.rows)
    : [];
}
function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function stableId(...parts: string[]): string {
  return createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 32);
}

export class CatalogChecksumConflictError extends Error {}

export interface CatalogResolutionWithDetail {
  result: ResolveCatalogModelResponse;
  detail: CatalogModelDetail | null;
}

export interface CatalogDiscoveryContext {
  manufacturerId: string;
  manufacturer: string;
  trustedHostnames: string[];
}

export type DocumentedBaseMatch =
  | { status: "matched"; detail: CatalogModelDetail }
  | { status: "ambiguous" }
  | { status: "unmatched" };

function hasSubstantiveSpecifications(specs: CatalogSpecs): boolean {
  return Object.values(specs).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== null,
  );
}

export interface DiscoveryRunClaim {
  run: CatalogDiscoveryRun;
  claimToken: string | null;
}

export interface CatalogDiscoveryRunState {
  status: CatalogDiscoveryRun["status"];
  leaseExpiresAt: Date | null;
}

export interface CatalogSpecificationBackfillCandidate {
  variantId: string;
  baseRevisionId: string;
  revision: number;
  manufacturerId: string;
  manufacturer: string;
  family: string;
  model: string;
  equipmentClass: CatalogModelDetail["equipmentClass"];
  specs: CatalogSpecs;
  productionStartYear: number | null;
  productionEndYear: number | null;
  missingFields: CatalogSpecificationEnrichmentField[];
}

function discoveryRun(
  row: Row,
  operation?: CatalogDiscoveryOperation,
): CatalogDiscoveryRun {
  return {
    id: String(row.id),
    status: row.status as CatalogDiscoveryRun["status"],
    normalizedManufacturer: String(row.normalized_manufacturer),
    normalizedModel: String(row.normalized_model),
    provider: String(row.provider),
    model: String(row.provider_model),
    promptVersion: String(row.prompt_version),
    schemaVersion: String(row.schema_version),
    policyVersion: String(row.policy_version),
    publicationMode: "automatic_official_source_policy",
    ...(operation ? { operation } : {}),
    revisionId: nullableString(row.revision_id),
    noResultReason: nullableString(
      row.no_result_reason,
    ) as CatalogDiscoveryNoResultReason | null,
    usage: (row.usage ?? null) as CatalogDiscoveryUsage | null,
    webSearchCallCount: Number(row.web_search_call_count ?? 0),
    pricing: row.pricing as CatalogDiscoveryPricing,
    estimatedCostUsd: Number(row.estimated_cost_usd ?? 0),
    responseFingerprint: nullableString(row.response_fingerprint),
    createdAt: new Date(row.created_at as Date | string).toISOString(),
    completedAt: row.completed_at
      ? new Date(row.completed_at as Date | string).toISOString()
      : null,
  };
}

@Injectable()
export class CatalogRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
    @Inject(MUTATION_RECORDER) private readonly mutations: MutationRecorder,
  ) {}

  async importManifest(
    manifest: CatalogSeedManifest,
  ): Promise<{ imported: boolean; manufacturers: number; models: number }> {
    return this.connection.transaction(async (database) => {
      const existing = rows(
        await database.execute(
          sql`select checksum from catalog_snapshot_import where dataset_id = ${manifest.datasetId}`,
        ),
      )[0];
      const modelCount = manifest.manufacturers.reduce(
        (sum, manufacturer) => sum + manufacturer.models.length,
        0,
      );
      if (existing) {
        if (existing.checksum !== manifest.checksum)
          throw new CatalogChecksumConflictError(
            "Dataset ID already exists with different content",
          );
        return {
          imported: false,
          manufacturers: manifest.manufacturers.length,
          models: modelCount,
        };
      }
      await database.execute(sql`
        insert into catalog_snapshot_import (dataset_id, snapshot_date, checksum, manufacturer_count, model_count)
        values (${manifest.datasetId}, ${manifest.snapshotDate}, ${manifest.checksum}, ${manifest.manufacturers.length}, ${modelCount})
      `);
      for (const manufacturer of manifest.manufacturers) {
        const storedManufacturer = rows(
          await database.execute(
            sql`insert into catalog_manufacturer (id, name, normalized_name) values (${manufacturer.id}, ${manufacturer.name}, ${normalizeCatalogIdentity(manufacturer.name)}) on conflict (id) do update set id=excluded.id where catalog_manufacturer.name=excluded.name and catalog_manufacturer.normalized_name=excluded.normalized_name returning id`,
          ),
        );
        if (!storedManufacturer.length)
          throw new CatalogChecksumConflictError(
            "Canonical manufacturer identity cannot change under the same ID",
          );
        await database.execute(
          sql`insert into catalog_snapshot_manufacturer (dataset_id, manufacturer_id) values (${manifest.datasetId}, ${manufacturer.id})`,
        );
        for (const alias of manufacturer.aliases) {
          await database.execute(
            sql`insert into catalog_manufacturer_alias (id, manufacturer_id, alias, normalized_alias) values (${stableId(manufacturer.id, "alias", normalizeCatalogIdentity(alias))}, ${manufacturer.id}, ${alias}, ${normalizeCatalogIdentity(alias)}) on conflict (manufacturer_id, normalized_alias) do nothing`,
          );
        }
        for (const source of manufacturer.sources) {
          const storedSource = rows(
            await database.execute(
              sql`insert into catalog_source (id, dataset_id, manufacturer_id, url, title, retrieved_at, document_revision, checksum, checksum_unavailable_reason, source_class) values (${source.id}, ${manifest.datasetId}, ${manufacturer.id}, ${source.url}, ${source.title}, ${new Date(source.retrievedAt).toISOString()}, ${source.documentRevision}, ${source.checksum}, ${source.checksumUnavailableReason ?? null}, ${source.sourceClass ?? "official_manufacturer"}) on conflict (id) do update set id=excluded.id where catalog_source.manufacturer_id=excluded.manufacturer_id and catalog_source.url=excluded.url and catalog_source.title=excluded.title and catalog_source.retrieved_at=excluded.retrieved_at and catalog_source.document_revision is not distinct from excluded.document_revision and catalog_source.checksum is not distinct from excluded.checksum and catalog_source.checksum_unavailable_reason is not distinct from excluded.checksum_unavailable_reason and catalog_source.source_class=excluded.source_class returning id`,
            ),
          );
          if (!storedSource.length)
            throw new CatalogChecksumConflictError(
              "Source content requires a new source ID",
            );
        }
        const families = new Map<string, string>();
        for (const model of manufacturer.models) {
          const familyKey = normalizeCatalogIdentity(model.family);
          let familyId = families.get(familyKey);
          if (!familyId) {
            familyId = stableId(manufacturer.id, "family", familyKey);
            families.set(familyKey, familyId);
            await database.execute(
              sql`insert into catalog_model_family (id, manufacturer_id, name) values (${familyId}, ${manufacturer.id}, ${model.family}) on conflict (id) do nothing`,
            );
          }
          const storedVariant = rows(
            await database.execute(
              sql`insert into catalog_model_variant (id, family_id, model, normalized_model, equipment_class) values (${model.id}, ${familyId}, ${model.model}, ${normalizeCatalogIdentity(model.model)}, ${model.equipmentClass}) on conflict (id) do update set id=excluded.id where catalog_model_variant.family_id=excluded.family_id and catalog_model_variant.model=excluded.model and catalog_model_variant.equipment_class=excluded.equipment_class returning id`,
            ),
          );
          if (!storedVariant.length)
            throw new CatalogChecksumConflictError(
              "Canonical model identity cannot change under the same ID",
            );
          for (const alias of model.aliases) {
            await database.execute(
              sql`insert into catalog_model_alias (id, variant_id, alias, normalized_alias) values (${stableId(model.id, "alias", normalizeCatalogIdentity(alias))}, ${model.id}, ${alias}, ${normalizeCatalogIdentity(alias)}) on conflict (variant_id, normalized_alias) do nothing`,
            );
          }
          const revision = model.revision;
          await database.execute(
            sql`insert into catalog_spec_revision (id, variant_id, dataset_id, revision, status, approved_at, production_start_year, production_end_year, specs) values (${revision.id}, ${model.id}, ${manifest.datasetId}, ${revision.revision}, 'approved', ${new Date(revision.approvedAt).toISOString()}, ${revision.productionStartYear}, ${revision.productionEndYear}, ${JSON.stringify(revision.specs)}::jsonb)`,
          );
          for (const [index, evidence] of revision.evidence.entries()) {
            await database.execute(
              sql`insert into catalog_field_evidence (id, revision_id, field, source_id, locator, official_value, official_unit) values (${stableId(revision.id, "evidence", String(index), evidence.field)}, ${revision.id}, ${evidence.field}, ${evidence.sourceId}, ${evidence.locator}, ${evidence.officialValue}, ${evidence.officialUnit})`,
            );
          }
          for (const rule of model.serialRules) {
            const storedRule = rows(
              await database.execute(
                sql`insert into catalog_serial_rule (id, variant_id, source_id, revision, locator, rule) values (${rule.id}, ${model.id}, ${rule.sourceId}, ${rule.revision}, ${rule.locator}, ${JSON.stringify(rule)}::jsonb) on conflict (id, revision) do update set id=excluded.id where catalog_serial_rule.variant_id=excluded.variant_id and catalog_serial_rule.source_id=excluded.source_id and catalog_serial_rule.locator=excluded.locator and catalog_serial_rule.rule=excluded.rule returning id`,
              ),
            );
            if (!storedRule.length)
              throw new CatalogChecksumConflictError(
                "Serial rule content requires a new revision",
              );
          }
        }
      }
      await this.mutations.record(database, {
        actorKind: "system",
        action: "catalog.snapshot.imported",
        targetType: "catalog_snapshot",
        targetId: manifest.datasetId,
        requestId: `catalog-import:${manifest.datasetId}`,
        summary: {
          changedFields: ["manufacturers", "models", "sources", "revisions"],
          outcome: "imported",
        },
      });
      return {
        imported: true,
        manufacturers: manifest.manufacturers.length,
        models: modelCount,
      };
    });
  }

  async list(input: CatalogListQuery): Promise<CatalogListResponse> {
    const pattern = `%${input.query.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
    const manufacturerPattern = input.manufacturer
      ? `%${input.manufacturer.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`
      : null;
    const filter = sql`where r.status = 'approved'
      and (${input.query === ""} or lower(v.model) like ${pattern} escape '\\' or lower(f.name) like ${pattern} escape '\\')
      and (${manufacturerPattern}::text is null or lower(m.name) like ${manufacturerPattern} escape '\\')`;
    const count = rows(
      await this.connection.database.execute(
        sql`with latest as (select distinct on (variant_id) * from catalog_spec_revision where status='approved' order by variant_id, revision desc, approved_at desc, id) select count(*)::integer total from latest r join catalog_model_variant v on v.id=r.variant_id join catalog_model_family f on f.id=v.family_id join catalog_manufacturer m on m.id=f.manufacturer_id ${filter}`,
      ),
    )[0];
    const offset = (input.page - 1) * input.pageSize;
    const result = rows(
      await this.connection.database.execute(sql`
      with latest as (select distinct on (variant_id) * from catalog_spec_revision where status='approved' order by variant_id, revision desc, approved_at desc, id)
      select m.id manufacturer_id, m.name manufacturer, v.id model_id, f.name family,
             v.model, v.equipment_class, r.id revision_id, r.revision
      from latest r join catalog_model_variant v on v.id=r.variant_id
      join catalog_model_family f on f.id=v.family_id join catalog_manufacturer m on m.id=f.manufacturer_id
      ${filter} order by m.name, f.name, v.model, r.revision desc limit ${input.pageSize} offset ${offset}
    `),
    );
    return {
      models: result.map((row) => ({
        manufacturerId: String(row.manufacturer_id),
        manufacturer: String(row.manufacturer),
        modelId: String(row.model_id),
        family: String(row.family),
        model: String(row.model),
        equipmentClass:
          row.equipment_class as CatalogModelDetail["equipmentClass"],
        revisionId: String(row.revision_id),
        revision: Number(row.revision),
      })),
      page: input.page,
      pageSize: input.pageSize,
      total: Number(count?.total ?? 0),
    };
  }

  async listIncompleteLatestApprovedRevisions(): Promise<
    CatalogSpecificationBackfillCandidate[]
  > {
    const result = rows(
      await this.connection.database.execute(sql`
        with latest as (
          select distinct on (variant_id) *
          from catalog_spec_revision
          where status='approved'
          order by variant_id, revision desc, approved_at desc, id
        )
        select v.id variant_id, r.id base_revision_id, r.revision,
               m.id manufacturer_id, m.name manufacturer, f.name family,
               v.model, v.equipment_class, r.specs,
               r.production_start_year, r.production_end_year
        from latest r
        join catalog_model_variant v on v.id=r.variant_id
        join catalog_model_family f on f.id=v.family_id
        join catalog_manufacturer m on m.id=f.manufacturer_id
        order by m.name, v.model, v.id
      `),
    );
    return result.flatMap((row) => {
      const candidate = {
        variantId: String(row.variant_id),
        baseRevisionId: String(row.base_revision_id),
        revision: Number(row.revision),
        manufacturerId: String(row.manufacturer_id),
        manufacturer: String(row.manufacturer),
        family: String(row.family),
        model: String(row.model),
        equipmentClass:
          row.equipment_class as CatalogModelDetail["equipmentClass"],
        specs: row.specs as CatalogSpecs,
        productionStartYear:
          row.production_start_year == null
            ? null
            : Number(row.production_start_year),
        productionEndYear:
          row.production_end_year == null
            ? null
            : Number(row.production_end_year),
      };
      const missingFields = missingCatalogSpecificationFields(candidate);
      return missingFields.length ? [{ ...candidate, missingFields }] : [];
    });
  }

  async specificationEnrichmentContext(variantId: string): Promise<
    | (CatalogSpecificationBackfillCandidate & {
        trustedHostnames: string[];
      })
    | undefined
  > {
    const candidate = (await this.listIncompleteLatestApprovedRevisions()).find(
      (item) => item.variantId === variantId,
    );
    if (!candidate) return undefined;
    const context = await this.discoveryContext(candidate.manufacturer);
    if (!context || context.manufacturerId !== candidate.manufacturerId)
      return undefined;
    return { ...candidate, trustedHostnames: context.trustedHostnames };
  }

  async detail(
    revisionId: string,
    includeSuperseded = false,
  ): Promise<CatalogModelDetail | undefined> {
    const base = rows(
      await this.connection.database.execute(sql`
      select m.id manufacturer_id, m.name manufacturer, v.id model_id, f.name family, v.model,
             v.equipment_class, r.id revision_id, r.revision, r.production_start_year,
             r.production_end_year, r.specs, r.publication_mode, r.discovery_run_id, r.dataset_id
      from catalog_spec_revision r join catalog_model_variant v on v.id=r.variant_id
      join catalog_model_family f on f.id=v.family_id join catalog_manufacturer m on m.id=f.manufacturer_id
      where r.id=${revisionId} and (r.status='approved' or (${includeSuperseded} and r.status='superseded'))
    `),
    )[0];
    if (!base) return undefined;
    const [aliasesResult, sourcesResult, evidenceResult] = await Promise.all([
      this.connection.database.execute(
        sql`select alias from catalog_model_alias where variant_id=${String(base.model_id)} order by normalized_alias, id`,
      ),
      this.connection.database.execute(
        sql`select s.id, s.url, s.title, s.retrieved_at, s.document_revision, s.checksum, s.checksum_unavailable_reason, s.source_class from catalog_source s where s.id in (select source_id from catalog_field_evidence where revision_id=${revisionId} union select source_id from catalog_serial_rule where variant_id=${String(base.model_id)}) order by s.id`,
      ),
      this.connection.database.execute(
        sql`select field, source_id, locator, official_value, official_unit from catalog_field_evidence where revision_id=${revisionId} order by field, id`,
      ),
    ]);
    const runRow = base.discovery_run_id
      ? rows(
          await this.connection.database.execute(
            sql`select * from catalog_discovery_run where id=${String(base.discovery_run_id)}`,
          ),
        )[0]
      : undefined;
    return {
      manufacturerId: String(base.manufacturer_id),
      manufacturer: String(base.manufacturer),
      modelId: String(base.model_id),
      family: String(base.family),
      model: String(base.model),
      equipmentClass:
        base.equipment_class as CatalogModelDetail["equipmentClass"],
      revisionId: String(base.revision_id),
      revision: Number(base.revision),
      aliases: rows(aliasesResult).map((row) => String(row.alias)),
      productionStartYear:
        base.production_start_year == null
          ? null
          : Number(base.production_start_year),
      productionEndYear:
        base.production_end_year == null
          ? null
          : Number(base.production_end_year),
      specs: base.specs as CatalogModelDetail["specs"],
      sources: rows(sourcesResult).map((row) => ({
        id: String(row.id),
        url: String(row.url),
        title: String(row.title),
        retrievedAt: new Date(row.retrieved_at as Date | string).toISOString(),
        documentRevision: nullableString(row.document_revision),
        checksum: nullableString(row.checksum),
        sourceClass: (row.source_class ??
          "official_manufacturer") as CatalogModelDetail["sources"][number]["sourceClass"],
        ...(row.checksum_unavailable_reason
          ? {
              checksumUnavailableReason: String(
                row.checksum_unavailable_reason,
              ),
            }
          : {}),
      })),
      evidence: rows(evidenceResult).map((row) => ({
        field: row.field as CatalogModelDetail["evidence"][number]["field"],
        sourceId: String(row.source_id),
        locator: String(row.locator),
        officialValue: nullableString(row.official_value),
        officialUnit: nullableString(row.official_unit),
      })),
      publicationMode: (base.publication_mode ??
        "reviewed_snapshot") as CatalogModelDetail["publicationMode"],
      discoveryRun: runRow
        ? discoveryRun(
            runRow,
            String(base.dataset_id).startsWith("catalog-enrichment:")
              ? "specification_enrichment"
              : "unsupported_model_discovery",
          )
        : null,
    };
  }

  async resolve(
    input: ResolveCatalogModelRequest,
  ): Promise<CatalogResolutionWithDetail> {
    const manufacturer = input.manufacturer?.trim();
    const model = input.model?.trim();
    if (!manufacturer || !model)
      return { result: { status: "insufficient_input" }, detail: null };
    const normalizedManufacturer = normalizeCatalogIdentity(manufacturer);
    const normalizedModel = normalizeCatalogIdentity(model);
    const matches = rows(
      await this.connection.database.execute(sql`
      with latest as (select distinct on (variant_id) * from catalog_spec_revision where status='approved' order by variant_id, revision desc, approved_at desc, id)
      select distinct r.id revision_id, v.id variant_id, m.name manufacturer, v.model,
        v.equipment_class,
        case when m.normalized_name=${normalizedManufacturer} and v.normalized_model=${normalizedModel} then 'canonical' else 'alias' end match_kind
      from latest r join catalog_model_variant v on v.id=r.variant_id
      join catalog_model_family f on f.id=v.family_id join catalog_manufacturer m on m.id=f.manufacturer_id
      left join catalog_manufacturer_alias ma on ma.manufacturer_id=m.id
      left join catalog_model_alias va on va.variant_id=v.id
      where r.status='approved'
        and (m.normalized_name=${normalizedManufacturer} or ma.normalized_alias=${normalizedManufacturer})
        and (v.normalized_model=${normalizedModel} or va.normalized_alias=${normalizedModel})
      order by r.id
    `),
    );
    if (!matches.length)
      return { result: { status: "unsupported" }, detail: null };
    if (matches.length > 1)
      return {
        result: {
          status: "ambiguous",
          candidateRevisionIds: matches.map((row) => String(row.revision_id)),
        },
        detail: null,
      };
    const match = matches[0]!;
    const ruleRows = rows(
      await this.connection.database.execute(
        sql`select rule from catalog_serial_rule where variant_id=${String(match.variant_id)} order by revision desc, id`,
      ),
    );
    const manufactureDate = evaluateSerialRules(
      ruleRows.map((row) => row.rule as CatalogSerialRule),
      input.serial,
    );
    const detail = await this.detail(String(match.revision_id));
    if (!detail) throw new Error("Approved Catalog revision disappeared");
    return {
      result: {
        status: "exact",
        matchKind: match.match_kind as "canonical" | "alias",
        revisionId: String(match.revision_id),
        manufacturer: String(match.manufacturer),
        model: String(match.model),
        equipmentClass:
          match.equipment_class as CatalogModelDetail["equipmentClass"],
        manufactureDate,
      },
      detail,
    };
  }

  async approvedDocumentedBase(
    manufacturerInput: string,
    acceptedModel: string,
  ): Promise<DocumentedBaseMatch> {
    const normalizedManufacturer = normalizeCatalogIdentity(manufacturerInput);
    const normalizedAccepted = normalizeCatalogIdentity(acceptedModel);
    const manufacturerRows = rows(
      await this.connection.database.execute(sql`
        select distinct m.id from catalog_manufacturer m
        left join catalog_manufacturer_alias a on a.manufacturer_id=m.id
        where m.normalized_name=${normalizedManufacturer}
          or a.normalized_alias=${normalizedManufacturer}
      `),
    );
    if (manufacturerRows.length !== 1) return { status: "unmatched" };
    const manufacturerId = String(manufacturerRows[0]!.id);
    const candidates = rows(
      await this.connection.database.execute(sql`
        with latest as (
          select distinct on (variant_id) id, variant_id
          from catalog_spec_revision where status='approved'
          order by variant_id, revision desc, approved_at desc, id
        )
        select r.id revision_id, v.model
        from latest r
        join catalog_model_variant v on v.id=r.variant_id
        join catalog_model_family f on f.id=v.family_id
        where f.manufacturer_id=${manufacturerId}
          and length(v.normalized_model) < length(${normalizedAccepted})
          and left(${normalizedAccepted}, length(v.normalized_model))=v.normalized_model
        order by length(v.normalized_model) desc, v.id
      `),
    );
    let longest = 0;
    const eligible: CatalogModelDetail[] = [];
    for (const candidate of candidates) {
      const documentedModel = String(candidate.model);
      const length = normalizeCatalogIdentity(documentedModel).length;
      if (longest && length < longest) break;
      if (!hasDocumentedModelRelationship(documentedModel, acceptedModel))
        continue;
      const detail = await this.detail(String(candidate.revision_id));
      if (!detail || !hasSubstantiveSpecifications(detail.specs)) continue;
      const officialSourceIds = new Set(
        detail.sources
          .filter((source) => source.sourceClass === "official_manufacturer")
          .map((source) => source.id),
      );
      if (
        !detail.evidence.some(
          (evidence) =>
            evidence.field === "model" &&
            officialSourceIds.has(evidence.sourceId) &&
            evidence.locator.trim().length > 0 &&
            evidence.officialValue !== null &&
            normalizeCatalogIdentity(evidence.officialValue) ===
              normalizeCatalogIdentity(documentedModel),
        )
      )
        continue;
      longest = length;
      eligible.push(detail);
    }
    if (eligible.length > 1) return { status: "ambiguous" };
    return eligible[0]
      ? { status: "matched", detail: eligible[0] }
      : { status: "unmatched" };
  }

  async replaceMachineResolution(
    database: DatabaseExecutor,
    machineId: string,
    resolution: CatalogResolutionWithDetail,
  ): Promise<string> {
    await database.execute(
      sql`update catalog_machine_resolution set current=false where machine_id=${machineId} and current=true`,
    );
    const id = randomUUID();
    const result = resolution.result;
    const manufactureDate = result.manufactureDate ?? {
      kind: "unknown",
      reason: "serial_rule_unavailable",
    };
    await database.execute(
      sql`insert into catalog_machine_resolution (id, machine_id, revision_id, status, match_kind, manufacture_date) values (${id}, ${machineId}, ${result.revisionId ?? null}, ${result.status}, ${result.matchKind ?? null}, ${JSON.stringify(manufactureDate)}::jsonb)`,
    );
    return id;
  }

  async currentMachineResolution(machineId: string): Promise<
    | {
        id: string;
        identityVersion: number;
        identityFingerprint: string;
        status: ResolveCatalogModelResponse["status"];
        matchKind: "canonical" | "alias" | null;
        revisionId: string | null;
        manufactureDate: ResolveCatalogModelResponse["manufactureDate"];
        resolvedAt: string;
      }
    | undefined
  > {
    const row = rows(
      await this.connection.database.execute(
        sql`select r.id, r.status, r.match_kind, r.revision_id, r.manufacture_date, r.resolved_at, s.identity_version, s.identity_fingerprint from catalog_machine_resolution r join catalog_machine_subject s on s.machine_id=r.machine_id where r.machine_id=${machineId} and r.current=true`,
      ),
    )[0];
    return row
      ? {
          id: String(row.id),
          identityVersion: Number(row.identity_version),
          identityFingerprint: String(row.identity_fingerprint),
          status: row.status as ResolveCatalogModelResponse["status"],
          matchKind: (row.match_kind ?? null) as "canonical" | "alias" | null,
          revisionId: nullableString(row.revision_id),
          manufactureDate:
            row.manufacture_date as ResolveCatalogModelResponse["manufactureDate"],
          resolvedAt: new Date(row.resolved_at as Date | string).toISOString(),
        }
      : undefined;
  }

  async listUnresolvedMachineIds(
    afterMachineId: string | undefined,
    limit = 500,
  ): Promise<string[]> {
    const result = rows(
      await this.connection.database.execute(
        afterMachineId
          ? sql`
              select machine_id
              from catalog_machine_resolution
              where current = true and status in ('unsupported', 'ambiguous')
                and machine_id > ${afterMachineId}
              order by machine_id
              limit ${limit}
            `
          : sql`
              select machine_id
              from catalog_machine_resolution
              where current = true and status in ('unsupported', 'ambiguous')
              order by machine_id
              limit ${limit}
            `,
      ),
    );
    return result.map((row) => String(row.machine_id));
  }

  async replaceUnresolvedMachineResolution(
    database: DatabaseExecutor,
    machineId: string,
    resolution: CatalogResolutionWithDetail,
    expectedIdentity: {
      version: number;
      fingerprint: string;
    },
  ): Promise<string | null> {
    const current = rows(
      await database.execute(sql`
        select r.status, s.identity_version, s.identity_fingerprint
        from catalog_machine_resolution r
        join catalog_machine_subject s on s.machine_id = r.machine_id
        where r.machine_id = ${machineId} and r.current = true
        for update
      `),
    )[0];
    if (
      !current ||
      !["unsupported", "ambiguous"].includes(String(current.status)) ||
      Number(current.identity_version) !== expectedIdentity.version ||
      String(current.identity_fingerprint) !== expectedIdentity.fingerprint
    )
      return null;
    return this.replaceMachineResolution(database, machineId, resolution);
  }

  async discoveryContext(
    manufacturerInput: string,
  ): Promise<CatalogDiscoveryContext | undefined> {
    const normalized = normalizeCatalogIdentity(manufacturerInput);
    const matches = rows(
      await this.connection.database.execute(sql`
        select distinct m.id, m.name
        from catalog_manufacturer m
        left join catalog_manufacturer_alias a on a.manufacturer_id=m.id
        where m.normalized_name=${normalized} or a.normalized_alias=${normalized}
        order by m.id
      `),
    );
    if (matches.length !== 1) return undefined;
    const manufacturer = matches[0]!;
    const sourceRows = rows(
      await this.connection.database.execute(sql`
        select url from catalog_source
        where manufacturer_id=${String(manufacturer.id)}
          and discovery_run_id is null
          and source_class='official_manufacturer'
        order by id
      `),
    );
    const trustedHostnames = [
      ...new Set(
        sourceRows.flatMap((row) => {
          try {
            const url = new URL(String(row.url));
            return url.protocol === "https:"
              ? [url.hostname.toLowerCase().replace(/\.$/, "")]
              : [];
          } catch {
            return [];
          }
        }),
      ),
    ].sort();
    if (!trustedHostnames.length) return undefined;
    return {
      manufacturerId: String(manufacturer.id),
      manufacturer: String(manufacturer.name),
      trustedHostnames,
    };
  }

  async latestDiscoveryRun(
    normalizedManufacturer: string,
    normalizedModel: string,
  ): Promise<CatalogDiscoveryRun | undefined> {
    const row = rows(
      await this.connection.database.execute(sql`
        select * from catalog_discovery_run
        where normalized_manufacturer=${normalizedManufacturer}
          and normalized_model=${normalizedModel}
        order by created_at desc, id desc limit 1
      `),
    )[0];
    return row ? discoveryRun(row) : undefined;
  }

  async discoveryRunStatesByDedupeKey(
    dedupeKeys: readonly string[],
  ): Promise<Map<string, CatalogDiscoveryRunState>> {
    if (!dedupeKeys.length) return new Map();
    const result = rows(
      await this.connection.database.execute(sql`
        select dedupe_key, status, lease_expires_at
        from catalog_discovery_run
        where dedupe_key in (${sql.join(
          dedupeKeys.map((key) => sql`${key}`),
          sql`, `,
        )})
      `),
    );
    return new Map(
      result.map((row) => [
        String(row.dedupe_key),
        {
          status: row.status as CatalogDiscoveryRun["status"],
          leaseExpiresAt: row.lease_expires_at
            ? new Date(row.lease_expires_at as Date | string)
            : null,
        },
      ]),
    );
  }

  async reserveDiscoveryRun(input: {
    dedupeKey: string;
    manufacturerId: string;
    normalizedManufacturer: string;
    normalizedModel: string;
    provider: string;
    model: string;
    promptVersion: string;
    schemaVersion: string;
    policyVersion: string;
    pricing: CatalogDiscoveryPricing;
    requestId: string;
    leaseMs: number;
    operation?: CatalogDiscoveryOperation;
  }): Promise<DiscoveryRunClaim> {
    return this.connection.transaction(async (database) => {
      const id = randomUUID();
      await database.execute(sql`
        insert into catalog_discovery_run
          (id, dedupe_key, manufacturer_id, normalized_manufacturer, normalized_model,
           provider, provider_model, prompt_version, schema_version, policy_version, pricing)
        values
          (${id}, ${input.dedupeKey}, ${input.manufacturerId}, ${input.normalizedManufacturer},
           ${input.normalizedModel}, ${input.provider}, ${input.model}, ${input.promptVersion},
           ${input.schemaVersion}, ${input.policyVersion}, ${JSON.stringify(input.pricing)}::jsonb)
        on conflict (dedupe_key) do nothing
      `);
      const current = rows(
        await database.execute(
          sql`select * from catalog_discovery_run where dedupe_key=${input.dedupeKey} for update`,
        ),
      )[0]!;
      const status = String(current.status);
      const leaseExpiresAt = current.lease_expires_at
        ? new Date(current.lease_expires_at as Date | string)
        : undefined;
      if (
        status === "published" ||
        status === "no_result" ||
        (status === "running" &&
          leaseExpiresAt &&
          leaseExpiresAt.getTime() > Date.now())
      )
        return {
          run: discoveryRun(current, input.operation),
          claimToken: null,
        };
      const claimToken = randomUUID();
      const lease = new Date(Date.now() + input.leaseMs);
      const claimed = rows(
        await database.execute(sql`
          update catalog_discovery_run
          set status='running', claim_token=${claimToken}, lease_expires_at=${lease.toISOString()},
              attempt_count=attempt_count+1, error_code=null, updated_at=now()
          where id=${String(current.id)} returning *
        `),
      )[0]!;
      await this.mutations.record(database, {
        actorKind: "system",
        action: "catalog.discovery.requested",
        targetType: "catalog_discovery_run",
        targetId: String(current.id),
        requestId: input.requestId,
        summary: {
          changedFields: ["status", "attempt_count"],
          outcome: "running",
        },
      });
      return {
        run: discoveryRun(claimed, input.operation),
        claimToken,
      };
    });
  }

  async failDiscoveryRun(
    runId: string,
    claimToken: string,
    errorCode: string,
    requestId: string,
  ): Promise<void> {
    await this.connection.transaction(async (database) => {
      const updated = rows(
        await database.execute(sql`
          update catalog_discovery_run
          set status='retryable_failure', claim_token=null, lease_expires_at=null,
              error_code=${errorCode}, updated_at=now()
          where id=${runId} and status='running' and claim_token=${claimToken}
          returning id
        `),
      );
      if (!updated.length) return;
      await this.mutations.record(database, {
        actorKind: "system",
        action: "catalog.discovery.completed",
        targetType: "catalog_discovery_run",
        targetId: runId,
        requestId,
        summary: {
          changedFields: ["status", "error_code"],
          outcome: "retryable_failure",
        },
      });
    });
  }

  async completeDiscoveryNoResult(input: {
    runId: string;
    claimToken: string;
    reason: string;
    usage: CatalogDiscoveryUsage;
    webSearchCallCount: number;
    estimatedCostUsd: number;
    responseFingerprint: string;
    providerRequestId: string | null;
    requestId: string;
    operation?: CatalogDiscoveryOperation;
  }): Promise<CatalogDiscoveryRun> {
    return this.connection.transaction(async (database) => {
      const updated = rows(
        await database.execute(sql`
          update catalog_discovery_run
          set status='no_result', claim_token=null, lease_expires_at=null,
              no_result_reason=${input.reason}, usage=${JSON.stringify(input.usage)}::jsonb,
              web_search_call_count=${input.webSearchCallCount}, estimated_cost_usd=${input.estimatedCostUsd},
              response_fingerprint=${input.responseFingerprint}, provider_request_id=${input.providerRequestId},
              completed_at=now(), updated_at=now()
          where id=${input.runId} and status='running' and claim_token=${input.claimToken}
          returning *
        `),
      )[0];
      if (!updated) {
        const current = rows(
          await database.execute(
            sql`select * from catalog_discovery_run where id=${input.runId}`,
          ),
        )[0];
        if (!current) throw new Error("Catalog discovery run disappeared");
        return discoveryRun(current, input.operation);
      }
      await this.mutations.record(database, {
        actorKind: "system",
        action: "catalog.discovery.completed",
        targetType: "catalog_discovery_run",
        targetId: input.runId,
        requestId: input.requestId,
        summary: {
          changedFields: ["status", "usage", "response_fingerprint"],
          outcome: "no_result",
        },
      });
      return discoveryRun(updated, input.operation);
    });
  }

  async publishDiscovery(input: {
    runId: string;
    claimToken: string;
    manufacturerId: string;
    normalizedModel: string;
    verified: Extract<VerifiedCatalogDiscovery, { outcome: "verified" }>;
    usage: CatalogDiscoveryUsage;
    webSearchCallCount: number;
    estimatedCostUsd: number;
    responseFingerprint: string;
    providerRequestId: string | null;
    requestId: string;
  }): Promise<CatalogDiscoveryRun> {
    return this.connection.transaction(async (database) => {
      const active = rows(
        await database.execute(
          sql`select * from catalog_discovery_run where id=${input.runId} and status='running' and claim_token=${input.claimToken} for update`,
        ),
      )[0];
      if (!active) {
        const current = rows(
          await database.execute(
            sql`select * from catalog_discovery_run where id=${input.runId}`,
          ),
        )[0];
        if (!current) throw new Error("Catalog discovery run disappeared");
        return discoveryRun(current, "unsupported_model_discovery");
      }
      const datasetId = `catalog-discovery:${input.runId}`;
      await database.execute(sql`
        insert into catalog_snapshot_import
          (dataset_id, snapshot_date, checksum, manufacturer_count, model_count)
        values
          (${datasetId}, ${new Date().toISOString().slice(0, 10)}, ${input.responseFingerprint}, 1, 1)
        on conflict (dataset_id) do nothing
      `);
      await database.execute(sql`
        insert into catalog_snapshot_manufacturer (dataset_id, manufacturer_id)
        values (${datasetId}, ${input.manufacturerId})
        on conflict do nothing
      `);
      const normalizedDocumentedModel = normalizeCatalogIdentity(
        input.verified.documentedModel,
      );
      const familyId = stableId(
        input.manufacturerId,
        "discovery-family",
        normalizedDocumentedModel,
      );
      const variantId = stableId(
        input.manufacturerId,
        "discovery-model",
        input.normalizedModel,
      );
      await database.execute(sql`
        insert into catalog_model_family (id, manufacturer_id, name)
        values (${familyId}, ${input.manufacturerId}, ${input.verified.documentedModel})
        on conflict (id) do nothing
      `);
      await database.execute(sql`
        insert into catalog_model_variant (id, family_id, model, normalized_model, equipment_class)
        values (${variantId}, ${familyId}, ${input.verified.model}, ${input.normalizedModel}, ${input.verified.equipmentClass})
        on conflict (id) do nothing
      `);
      const sourceIds = new Map<string, string>();
      for (const source of input.verified.sources) {
        const sourceId = stableId(input.runId, "source", source.url);
        sourceIds.set(source.url, sourceId);
        await database.execute(sql`
          insert into catalog_source
            (id, dataset_id, manufacturer_id, url, title, retrieved_at, document_revision,
             checksum, checksum_unavailable_reason, source_class, discovery_run_id)
          values
            (${sourceId}, ${datasetId}, ${input.manufacturerId}, ${source.url}, ${source.title}, now(), null,
             null, 'Provider web-search source; content body was not retained',
             'official_manufacturer', ${input.runId})
        `);
      }
      const revisionNumber =
        Number(
          rows(
            await database.execute(
              sql`select coalesce(max(revision), 0)::integer maximum from catalog_spec_revision where variant_id=${variantId}`,
            ),
          )[0]?.maximum ?? 0,
        ) + 1;
      const revisionId = stableId(input.runId, "revision");
      await database.execute(sql`
        insert into catalog_spec_revision
          (id, variant_id, dataset_id, revision, status, approved_at, production_start_year,
           production_end_year, specs, publication_mode, discovery_run_id)
        values
          (${revisionId}, ${variantId}, ${datasetId}, ${revisionNumber}, 'approved', now(),
           ${input.verified.productionStartYear}, ${input.verified.productionEndYear},
           ${JSON.stringify(input.verified.specs)}::jsonb,
           'automatic_official_source_policy', ${input.runId})
      `);
      for (const [index, evidence] of input.verified.evidence.entries()) {
        const sourceId = sourceIds.get(evidence.sourceUrl);
        if (!sourceId)
          throw new Error("Verified Catalog evidence lost its source");
        await database.execute(sql`
          insert into catalog_field_evidence
            (id, revision_id, field, source_id, locator, official_value, official_unit)
          values
            (${stableId(revisionId, "evidence", String(index), evidence.field)}, ${revisionId},
             ${evidence.field}, ${sourceId}, ${evidence.locator}, ${evidence.officialValue}, ${evidence.officialUnit})
        `);
      }
      for (const candidate of input.verified.serialRules) {
        const sourceId = sourceIds.get(candidate.sourceUrl);
        if (!sourceId)
          throw new Error("Verified Catalog serial rule lost its source");
        const rule = {
          ...candidate.rule,
          sourceId,
          locator: candidate.locator,
        };
        await database.execute(sql`
          insert into catalog_serial_rule (id, variant_id, source_id, revision, locator, rule)
          values (${stableId(input.runId, "serial-rule", candidate.rule.id)}, ${variantId}, ${sourceId},
                  ${candidate.rule.revision}, ${candidate.locator}, ${JSON.stringify(rule)}::jsonb)
        `);
      }
      const updated = rows(
        await database.execute(sql`
          update catalog_discovery_run
          set status='published', claim_token=null, lease_expires_at=null, revision_id=${revisionId},
              usage=${JSON.stringify(input.usage)}::jsonb, web_search_call_count=${input.webSearchCallCount},
              estimated_cost_usd=${input.estimatedCostUsd}, response_fingerprint=${input.responseFingerprint},
              provider_request_id=${input.providerRequestId}, completed_at=now(), updated_at=now()
          where id=${input.runId} returning *
        `),
      )[0]!;
      await this.mutations.record(database, {
        actorKind: "system",
        action: "catalog.discovery.completed",
        targetType: "catalog_discovery_run",
        targetId: input.runId,
        requestId: input.requestId,
        summary: {
          changedFields: [
            "status",
            "revision_id",
            "usage",
            "response_fingerprint",
          ],
          outcome: "published",
        },
      });
      return discoveryRun(updated, "unsupported_model_discovery");
    });
  }

  async publishSpecificationEnrichment(input: {
    runId: string;
    claimToken: string;
    baseRevisionId: string;
    variantId: string;
    manufacturerId: string;
    missingFields: readonly CatalogSpecificationEnrichmentField[];
    verified: Extract<VerifiedCatalogDiscovery, { outcome: "verified" }>;
    usage: CatalogDiscoveryUsage;
    webSearchCallCount: number;
    estimatedCostUsd: number;
    responseFingerprint: string;
    providerRequestId: string | null;
    requestId: string;
  }): Promise<CatalogDiscoveryRun> {
    return this.connection.transaction(async (database) => {
      const active = rows(
        await database.execute(
          sql`select * from catalog_discovery_run where id=${input.runId} and status='running' and claim_token=${input.claimToken} for update`,
        ),
      )[0];
      if (!active) {
        const current = rows(
          await database.execute(
            sql`select * from catalog_discovery_run where id=${input.runId}`,
          ),
        )[0];
        if (!current) throw new Error("Catalog discovery run disappeared");
        return discoveryRun(current, "specification_enrichment");
      }

      const finishNoResult = async (
        reason: CatalogDiscoveryNoResultReason,
      ): Promise<CatalogDiscoveryRun> => {
        const updated = rows(
          await database.execute(sql`
            update catalog_discovery_run
            set status='no_result', claim_token=null, lease_expires_at=null,
                no_result_reason=${reason}, usage=${JSON.stringify(input.usage)}::jsonb,
                web_search_call_count=${input.webSearchCallCount},
                estimated_cost_usd=${input.estimatedCostUsd},
                response_fingerprint=${input.responseFingerprint},
                provider_request_id=${input.providerRequestId}, completed_at=now(), updated_at=now()
            where id=${input.runId} and status='running' and claim_token=${input.claimToken}
            returning *
          `),
        )[0]!;
        await this.mutations.record(database, {
          actorKind: "system",
          action: "catalog.discovery.completed",
          targetType: "catalog_discovery_run",
          targetId: input.runId,
          requestId: input.requestId,
          summary: {
            changedFields: ["status", "usage", "response_fingerprint"],
            outcome: reason,
          },
        });
        return discoveryRun(updated, "specification_enrichment");
      };

      const base = rows(
        await database.execute(sql`
          select id, variant_id, dataset_id, revision, production_start_year,
                 production_end_year, specs
          from catalog_spec_revision
          where id=${input.baseRevisionId} and variant_id=${input.variantId}
          for update
        `),
      )[0];
      if (!base) return finishNoResult("superseded");
      const latest = rows(
        await database.execute(sql`
          select id
          from catalog_spec_revision
          where variant_id=${input.variantId} and status='approved'
          order by revision desc, approved_at desc, id
          limit 1
        `),
      )[0];
      if (!latest || String(latest.id) !== input.baseRevisionId)
        return finishNoResult("superseded");

      const baseSpecs = base.specs as CatalogSpecs;
      const mergedSpecs: CatalogSpecs = {
        widthIn: baseSpecs.widthIn,
        depthIn: baseSpecs.depthIn,
        heightIn: baseSpecs.heightIn,
        weightLb: baseSpecs.weightLb,
        capacityLb: baseSpecs.capacityLb,
        voltage: [...baseSpecs.voltage],
        phase: [...baseSpecs.phase],
        fuel: [...baseSpecs.fuel],
        configuration: [...baseSpecs.configuration],
      };
      const acceptedFields = new Set<CatalogSpecificationEnrichmentField>();
      for (const field of input.missingFields) {
        if (field === "productionStartYear" || field === "productionEndYear")
          continue;
        const baseValue = baseSpecs[field];
        const discoveredValue = input.verified.specs[field];
        const baseMissing = Array.isArray(baseValue)
          ? baseValue.length === 0
          : baseValue === null;
        const discoveredPresent = Array.isArray(discoveredValue)
          ? discoveredValue.length > 0
          : discoveredValue !== null;
        if (baseMissing && discoveredPresent) {
          (mergedSpecs as Record<string, unknown>)[field] = Array.isArray(
            discoveredValue,
          )
            ? [...discoveredValue]
            : discoveredValue;
          acceptedFields.add(field);
        }
      }
      let productionStartYear =
        base.production_start_year == null
          ? null
          : Number(base.production_start_year);
      let productionEndYear =
        base.production_end_year == null
          ? null
          : Number(base.production_end_year);
      if (
        productionStartYear === null &&
        input.missingFields.includes("productionStartYear") &&
        input.verified.productionStartYear !== null
      ) {
        productionStartYear = input.verified.productionStartYear;
        acceptedFields.add("productionStartYear");
      }
      if (
        productionEndYear === null &&
        input.missingFields.includes("productionEndYear") &&
        input.verified.productionEndYear !== null
      ) {
        productionEndYear = input.verified.productionEndYear;
        acceptedFields.add("productionEndYear");
      }
      const invertedProductionYears =
        productionStartYear !== null &&
        productionEndYear !== null &&
        productionStartYear > productionEndYear;
      if (invertedProductionYears) {
        if (base.production_start_year == null) {
          productionStartYear = null;
          acceptedFields.delete("productionStartYear");
        }
        if (base.production_end_year == null) {
          productionEndYear = null;
          acceptedFields.delete("productionEndYear");
        }
      }
      if (!acceptedFields.size)
        return finishNoResult(
          invertedProductionYears
            ? "inverted_production_years"
            : "no_newly_verified_fields",
        );

      const acceptedEvidence = input.verified.evidence.filter((item) =>
        acceptedFields.has(item.field as CatalogSpecificationEnrichmentField),
      );
      if (!acceptedEvidence.length)
        return finishNoResult("no_newly_verified_fields");

      const datasetId = `catalog-enrichment:${input.runId}`;
      await database.execute(sql`
        insert into catalog_snapshot_import
          (dataset_id, snapshot_date, checksum, manufacturer_count, model_count)
        values
          (${datasetId}, ${new Date().toISOString().slice(0, 10)}, ${input.responseFingerprint}, 1, 1)
        on conflict (dataset_id) do nothing
      `);
      await database.execute(sql`
        insert into catalog_snapshot_manufacturer (dataset_id, manufacturer_id)
        values (${datasetId}, ${input.manufacturerId})
        on conflict do nothing
      `);
      const sourceIds = new Map<string, string>();
      const acceptedUrls = new Set(
        acceptedEvidence.map((evidence) => evidence.sourceUrl),
      );
      for (const source of input.verified.sources) {
        if (!acceptedUrls.has(source.url)) continue;
        const sourceId = stableId(input.runId, "source", source.url);
        sourceIds.set(source.url, sourceId);
        await database.execute(sql`
          insert into catalog_source
            (id, dataset_id, manufacturer_id, url, title, retrieved_at, document_revision,
             checksum, checksum_unavailable_reason, source_class, discovery_run_id)
          values
            (${sourceId}, ${datasetId}, ${input.manufacturerId}, ${source.url}, ${source.title}, now(), null,
             null, 'Provider web-search source; content body was not retained',
             'official_manufacturer', ${input.runId})
        `);
      }
      const revisionNumber =
        Number(
          rows(
            await database.execute(sql`
              select coalesce(max(revision), 0)::integer maximum
              from catalog_spec_revision
              where variant_id=${input.variantId}
            `),
          )[0]?.maximum ?? 0,
        ) + 1;
      const revisionId = stableId(input.runId, "revision");
      await database.execute(sql`
        insert into catalog_spec_revision
          (id, variant_id, dataset_id, revision, status, approved_at, production_start_year,
           production_end_year, specs, publication_mode, discovery_run_id)
        values
          (${revisionId}, ${input.variantId}, ${datasetId}, ${revisionNumber}, 'approved', now(),
           ${productionStartYear}, ${productionEndYear}, ${JSON.stringify(mergedSpecs)}::jsonb,
           'automatic_official_source_policy', ${input.runId})
      `);
      const carriedEvidence = rows(
        await database.execute(sql`
          select id, field, source_id, locator, official_value, official_unit
          from catalog_field_evidence
          where revision_id=${input.baseRevisionId}
          order by id
        `),
      );
      for (const evidence of carriedEvidence) {
        await database.execute(sql`
          insert into catalog_field_evidence
            (id, revision_id, field, source_id, locator, official_value, official_unit)
          values
            (${stableId(revisionId, "carried-evidence", String(evidence.id))}, ${revisionId},
             ${String(evidence.field)}, ${String(evidence.source_id)}, ${String(evidence.locator)},
             ${nullableString(evidence.official_value)}, ${nullableString(evidence.official_unit)})
        `);
      }
      for (const [index, evidence] of acceptedEvidence.entries()) {
        const sourceId = sourceIds.get(evidence.sourceUrl);
        if (!sourceId)
          throw new Error("Verified Catalog evidence lost its source");
        await database.execute(sql`
          insert into catalog_field_evidence
            (id, revision_id, field, source_id, locator, official_value, official_unit)
          values
            (${stableId(revisionId, "evidence", String(index), evidence.field)}, ${revisionId},
             ${evidence.field}, ${sourceId}, ${evidence.locator}, ${evidence.officialValue}, ${evidence.officialUnit})
        `);
      }
      const updated = rows(
        await database.execute(sql`
          update catalog_discovery_run
          set status='published', claim_token=null, lease_expires_at=null, revision_id=${revisionId},
              usage=${JSON.stringify(input.usage)}::jsonb,
              web_search_call_count=${input.webSearchCallCount}, estimated_cost_usd=${input.estimatedCostUsd},
              response_fingerprint=${input.responseFingerprint}, provider_request_id=${input.providerRequestId},
              completed_at=now(), updated_at=now()
          where id=${input.runId} returning *
        `),
      )[0]!;
      await this.mutations.record(database, {
        actorKind: "system",
        action: "catalog.discovery.completed",
        targetType: "catalog_discovery_run",
        targetId: input.runId,
        requestId: input.requestId,
        summary: {
          changedFields: [
            "status",
            "revision_id",
            "usage",
            "response_fingerprint",
          ],
          outcome: "published",
        },
      });
      return discoveryRun(updated, "specification_enrichment");
    });
  }

  transaction<T>(
    callback: (database: DatabaseExecutor) => Promise<T>,
  ): Promise<T> {
    return this.connection.transaction(callback);
  }

  async claimMachineIdentity(
    database: DatabaseExecutor,
    machineId: string,
    version: number,
    fingerprint: string,
  ): Promise<boolean> {
    await database.execute(
      sql`insert into catalog_machine_subject (machine_id) values (${machineId}) on conflict (machine_id) do nothing`,
    );
    const current = rows(
      await database.execute(
        sql`select identity_version, identity_fingerprint from catalog_machine_subject where machine_id=${machineId} for update`,
      ),
    )[0]!;
    if (Number(current.identity_version) > version) return false;
    await database.execute(
      sql`update catalog_machine_subject set identity_version=${version}, identity_fingerprint=${fingerprint} where machine_id=${machineId}`,
    );
    return current.identity_fingerprint !== fingerprint;
  }
}
