import type {
  IntakeGroupDecision,
  IntakeRecognitionField,
  IntakeRecognitionReason,
  IntakeSemanticResult,
  IntakeOcrResult,
  IntakeFieldDecision,
} from "@laundrorama/contracts";
import { normalizeIdentityMatchValue } from "../normalization.js";
import type {
  IntakeAnalysisImage,
  IntakeConfidencePolicy,
  IntakeConfidencePolicyConfig,
} from "./recognition.ports.js";

const LEGACY_CRITICAL_FIELDS: IntakeRecognitionField[] = [
  "machineType",
  "manufacturer",
  "model",
  "serial",
];
const NAMEPLATE_CRITICAL_FIELDS: IntakeRecognitionField[] = [
  "manufacturer",
  "model",
  "serial",
];
/** Accept capacity only when the evidence contains an explicit unit. */
export function parseExplicitCapacityLb(value: string | null): number | null {
  if (value === null) return null;
  const withoutLabel = value
    .trim()
    .replace(/^(?:capacity|cap(?:acity)?\s*(?:rating|size)?)\s*[:#-]?\s*/i, "");
  const pairPattern =
    /(\d{1,4}(?:\.\d+)?)\s*(pounds?|lbs?|kilograms?|kgs?|#)/gi;
  const pairs: Array<{ amount: number; unit: string }> = [];
  let cursor = 0;
  for (const match of withoutLabel.matchAll(pairPattern)) {
    const between = withoutLabel.slice(cursor, match.index);
    if (between && !/^(?:\s|[/,;|&()]|\bor\b)+$/i.test(between)) return null;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    pairs.push({ amount, unit: match[2]!.toLowerCase() });
    cursor = (match.index ?? 0) + match[0].length;
  }
  if (!pairs.length || !/^\s*$/.test(withoutLabel.slice(cursor))) return null;
  const isKg = (unit: string) => /^(?:kg|kgs|kilogram|kilograms)$/.test(unit);
  const poundsFor = (pair: { amount: number; unit: string }) =>
    isKg(pair.unit) ? pair.amount * 2.2046226218 : pair.amount;
  const explicitLb = pairs.find((pair) => !isKg(pair.unit));
  const reference = poundsFor(explicitLb ?? pairs[0]!);
  // Printed kilogram equivalents can round to a neighbouring pound. Reject
  // conflicting measures while allowing that one-pound nameplate tolerance.
  if (pairs.some((pair) => Math.abs(poundsFor(pair) - reference) > 1))
    return null;
  const rounded = Math.round(reference);
  return rounded >= 1 && rounded <= 2_000 ? rounded : null;
}

function normalized(value: string | null): string | null {
  const result = normalizeIdentityMatchValue(value);
  return result ? result.replace(/[^a-z0-9]/g, "") : null;
}

function normalizedVoltage(value: string | null): string | null {
  if (!value?.trim()) return null;
  const lower = value
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\b(?:voltage|volts?|v)\b/g, " ");
  const numbers = [...lower.matchAll(/\d+(?:\.\d+)?/g)].map(
    (match) => match[0],
  );
  const uniqueNumbers = [...new Set(numbers)].sort(
    (left, right) => Number(left) - Number(right),
  );
  const type = /\b(?:a\s*\.?\s*c\.?|ac)\b/.test(lower)
    ? "ac"
    : /\b(?:d\s*\.?\s*c\.?|dc)\b/.test(lower)
      ? "dc"
      : "";
  return `${type}:${uniqueNumbers.join(",")}`;
}

function normalizedFieldValue(
  field: IntakeRecognitionField,
  value: string | null,
): string | null {
  const normalizedValue = normalizeRecognitionValue(field, value).value;
  return field === "voltage"
    ? normalizedVoltage(normalizedValue)
    : normalized(normalizedValue);
}

type NormalizedRecognitionValue = {
  value: string | null;
  recognized: boolean;
};

function normalizeRecognitionValue(
  field: IntakeRecognitionField,
  value: string | null,
): NormalizedRecognitionValue {
  if (value === null || value.trim() === "")
    return { value: null, recognized: true };
  let cleaned = value.trim();
  const fieldLabel =
    /^(?:manufacturer|maker|model(?:\s+number)?|m\/n|serial(?:\s+number)?|s\/n)(?:\s*[:#-]\s*|\s+)/i;
  const numberLabel = /^(?:no|number)(?:\s*[.:#-]\s*|\s+)/i;
  // Labels may be compound (for example, `MODEL NO. 123`). Strip each
  // explicit component, but require punctuation or whitespace after a bare
  // `NO` so values such as `NO123` remain data.
  for (let index = 0; index < 2; index += 1) {
    const before = cleaned;
    cleaned = cleaned.replace(fieldLabel, "").trim();
    if (field === "model" || field === "serial")
      cleaned = cleaned.replace(numberLabel, "").trim();
    if (cleaned === before) break;
  }
  if (field === "equipmentClass")
    cleaned = cleaned
      .replace(
        /^(?:equipment|machine)\s*(?:type|class|configuration)\s*[:#-]?\s*/i,
        "",
      )
      .trim();
  if (field === "capacityLb") {
    const pounds = parseExplicitCapacityLb(cleaned);
    return pounds === null
      ? { value: cleaned, recognized: false }
      : { value: String(pounds), recognized: true };
  }
  const token = cleaned
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const aliases: Partial<
    Record<IntakeRecognitionField, Record<string, string>>
  > = {
    machineType: {
      washer: "washer",
      washers: "washer",
      washing_machine: "washer",
      washingmachine: "washer",
      dryer: "dryer",
      dryers: "dryer",
      tumble_dryer: "dryer",
      tumbledryer: "dryer",
      other: "other",
    },
    equipmentClass: {
      washer: "washer",
      washing_machine: "washer",
      dryer: "dryer",
      tumble_dryer: "dryer",
      stack_dryer: "stack_dryer",
      stacked_dryer: "stack_dryer",
      stacked_washer_dryer: "stacked_washer_dryer",
      stack_washer_dryer: "stacked_washer_dryer",
      washer_dryer_stack: "stacked_washer_dryer",
      washer_dryer_combo: "washer_dryer_combo",
      washer_dryer_combination: "washer_dryer_combo",
      combination_washer_dryer: "washer_dryer_combo",
      combo_washer_dryer: "washer_dryer_combo",
      other: "other",
    },
    phase: {
      single_phase: "single_phase",
      singlephase: "single_phase",
      single: "single_phase",
      one_phase: "single_phase",
      onephase: "single_phase",
      one: "single_phase",
      "1": "single_phase",
      phase_1: "single_phase",
      "1_phase": "single_phase",
      one_ph: "single_phase",
      oneph: "single_phase",
      three_phase: "three_phase",
      threephase: "three_phase",
      three: "three_phase",
      phase_3: "three_phase",
      "3": "three_phase",
      "3_phase": "three_phase",
      three_ph: "three_phase",
      threeph: "three_phase",
    },
    fuel: {
      gas: "gas",
      natural_gas: "gas",
      naturalgas: "gas",
      propane: "gas",
      lp: "gas",
      lpg: "gas",
      electric: "electric",
      electricity: "electric",
      electrical: "electric",
      steam: "steam",
      steam_heat: "steam",
      steamheated: "steam",
      other: "other",
    },
  };
  const fieldAliases = aliases[field];
  if (!fieldAliases) return { value: cleaned, recognized: true };
  const canonical = fieldAliases[token];
  return canonical
    ? { value: canonical, recognized: true }
    : { value: cleaned, recognized: false };
}

function identityNoise(value: string, field: IntakeRecognitionField): boolean {
  const token = value.trim().toLowerCase();
  if (
    [
      "model",
      "model no",
      "model number",
      "serial",
      "serial no",
      "manufacturer",
    ].includes(token)
  )
    return true;
  if (
    ["manufacturer", "model", "serial"].includes(field) &&
    /^\d+(?:\.\d+)?\s*(?:v|volt|volts|hz|a|amp|amps)$/.test(token)
  )
    return true;
  return /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(token);
}

function lineId(line: IntakeOcrResult["lines"][number], index: number): string {
  return line.lineId ?? `${line.photoId}:line-${index + 1}`;
}

function normalizedIdentityTokens(
  field: IntakeRecognitionField,
  value: string,
): string[] {
  const cleaned = normalizeRecognitionValue(field, value).value;
  if (!cleaned) return [];
  return cleaned
    .split(/\s+/)
    .map((token) => normalized(token))
    .filter((token): token is string => token !== null);
}

function containsTokenSequence(
  tokens: readonly string[],
  sequence: readonly string[],
): boolean {
  if (sequence.length === 0 || sequence.length > tokens.length) return false;
  return tokens.some(
    (_, start) =>
      start + sequence.length <= tokens.length &&
      sequence.every((token, offset) => tokens[start + offset] === token),
  );
}

function hasSamePhotoOcrSupport(
  field: IntakeRecognitionField,
  value: string,
  imageLines: ReadonlyArray<{ line: IntakeOcrResult["lines"][number] }>,
): boolean {
  const semanticValue = normalizedFieldValue(field, value);
  if (!semanticValue || imageLines.length === 0) return false;
  const texts = imageLines.map(({ line }) => line.text);
  if (NAMEPLATE_CRITICAL_FIELDS.includes(field)) {
    const semanticTokens = normalizedIdentityTokens(field, value);
    const ocrTokens = texts.flatMap((text) =>
      normalizedIdentityTokens(field, text),
    );
    return containsTokenSequence(ocrTokens, semanticTokens);
  }
  const candidates = [...texts];
  const maximumSpan = Math.min(8, texts.length);
  for (let span = 2; span <= maximumSpan; span += 1) {
    for (let start = 0; start + span <= texts.length; start += 1)
      candidates.push(texts.slice(start, start + span).join(" "));
  }
  candidates.push(texts.join(" "));
  if (field === "equipmentClass") {
    return candidates.some(
      (candidate) =>
        normalizeRecognitionValue("equipmentClass", candidate).value ===
          value &&
        normalizeRecognitionValue("equipmentClass", candidate).recognized,
    );
  }
  return candidates.some((candidate) => {
    if (
      field === "capacityLb" &&
      !normalizeRecognitionValue(field, candidate).recognized
    )
      return false;
    const ocrValue = normalizedFieldValue(field, candidate);
    return Boolean(ocrValue?.includes(semanticValue));
  });
}

export function hasIndependentOcrAgreement(
  field: IntakeRecognitionField,
  value: string,
  photoId: string,
  ocr: IntakeOcrResult,
  floor: number,
): boolean {
  const semantic = normalizedFieldValue(field, value);
  if (!semantic) return false;
  return ocr.lines.some(
    (line) =>
      line.photoId === photoId &&
      line.confidence >= floor &&
      (field === "serial"
        ? normalizedFieldValue(field, line.text) === semantic
        : normalizedFieldValue(field, line.text)?.includes(semantic)),
  );
}

export class DeterministicIntakeConfidencePolicy implements IntakeConfidencePolicy {
  evaluate(input: {
    images: readonly IntakeAnalysisImage[];
    semantic: IntakeSemanticResult;
    ocr: IntakeOcrResult;
    config: IntakeConfidencePolicyConfig;
  }): IntakeGroupDecision[] {
    if (
      input.semantic.schemaVersion === "intake-nameplate-v2" ||
      input.semantic.schemaVersion === "intake-nameplate-v3"
    )
      return this.evaluateNameplates(input);
    const { semantic, ocr, config } = input;
    const ocrFloor = config.ocrFloor;
    const groupFloor = config.groupFloor;
    const fieldFloor = config.fieldFloor;
    const seen = new Set<string>();
    const inputPhotoIds = new Set(input.images.map((image) => image.photoId));
    const photoMembership = new Map<string, number>();
    for (const group of semantic.groups)
      for (const photoId of group.photoIds)
        photoMembership.set(photoId, (photoMembership.get(photoId) ?? 0) + 1);
    const decisions = semantic.groups.map((group) => {
      const reasons: IntakeRecognitionReason[] = [];
      if (
        groupFloor === undefined ||
        fieldFloor === undefined ||
        ocrFloor === undefined
      )
        reasons.push("policy_unconfigured");
      if (groupFloor !== undefined && group.confidence < groupFloor)
        reasons.push("low_confidence");
      const overlapping = group.photoIds.some(
        (photoId) => (photoMembership.get(photoId) ?? 0) > 1,
      );
      if (overlapping) reasons.push("ambiguous_grouping");
      if (new Set(group.photoIds).size !== group.photoIds.length)
        reasons.push("ambiguous_grouping");
      if (group.photoIds.some((photoId) => !inputPhotoIds.has(photoId)))
        reasons.push("unsupported_evidence");
      group.photoIds.forEach((photoId) => seen.add(photoId));
      const quality = (group.quality ?? []).map(({ photoId, reason }) => ({
        photoId,
        reason,
      }));
      for (const finding of quality) reasons.push(finding.reason);
      const fieldValues = new Map<string, Set<string>>();
      for (const field of group.fields) {
        const value = normalizedFieldValue(field.field, field.value);
        if (value)
          fieldValues.set(
            field.field,
            (fieldValues.get(field.field) ?? new Set()).add(value),
          );
      }
      if ([...fieldValues.values()].some((values) => values.size > 1))
        reasons.push("conflicting_evidence");
      const fields = group.fields.map((field) => {
        let accepted = true;
        let reason: IntakeRecognitionReason = "accepted";
        const normalizedField = normalizeRecognitionValue(
          field.field,
          field.value,
        );
        const value = normalizedField.value;
        const supported =
          group.photoIds.includes(field.photoId) &&
          input.images.some((image) => image.photoId === field.photoId);
        if (!supported) {
          accepted = false;
          reason = "unsupported_evidence";
        } else if ((fieldValues.get(field.field)?.size ?? 0) > 1) {
          accepted = false;
          reason = "conflicting_evidence";
        } else if (!value && LEGACY_CRITICAL_FIELDS.includes(field.field)) {
          accepted = false;
          reason = "missing_critical_fact";
        } else if (!normalizedField.recognized) {
          accepted = false;
          reason = "unsupported_evidence";
        } else if (fieldFloor === undefined || ocrFloor === undefined) {
          accepted = false;
          reason = "policy_unconfigured";
        } else if (field.confidence < fieldFloor) {
          accepted = false;
          reason = "low_confidence";
        } else if (
          quality.some(
            (qualityFinding) => qualityFinding.photoId === field.photoId,
          )
        ) {
          accepted = false;
          reason = quality.find(
            (qualityFinding) => qualityFinding.photoId === field.photoId,
          )!.reason;
        }
        const agreement = Boolean(
          value &&
          hasIndependentOcrAgreement(
            field.field,
            value,
            field.photoId,
            ocr,
            ocrFloor ?? 0,
          ),
        );
        if (accepted && !agreement) {
          accepted = false;
          reason =
            field.field === "serial" ? "ocr_disagreement" : "ocr_disagreement";
        }
        return {
          field: field.field,
          value: accepted ? value : value,
          accepted,
          reason,
          photoId: field.photoId,
          box: field.box,
          verifierAgreement: agreement,
        };
      });
      for (const field of fields)
        if (!field.accepted && !reasons.includes(field.reason))
          reasons.push(field.reason);
      const accepted =
        reasons.length === 0 &&
        fields.length > 0 &&
        LEGACY_CRITICAL_FIELDS.every((name) =>
          fields.some((field) => field.field === name && field.accepted),
        );
      if (!accepted && reasons.length === 0)
        reasons.push("missing_critical_fact");
      return {
        key: group.key,
        photoIds: group.photoIds,
        accepted,
        reasons,
        fields,
        quality,
      };
    });
    for (const image of input.images) {
      if (!seen.has(image.photoId)) {
        decisions.push({
          key: `ungrouped-${image.photoId}`,
          photoIds: [image.photoId],
          accepted: false,
          reasons: ["ambiguous_grouping"],
          fields: [],
          quality: [],
        });
      }
    }
    return decisions;
  }

  private evaluateNameplates(input: {
    images: readonly IntakeAnalysisImage[];
    semantic: IntakeSemanticResult;
    ocr: IntakeOcrResult;
    config: IntakeConfidencePolicyConfig;
  }): IntakeGroupDecision[] {
    const { semantic, ocr } = input;
    const inputPhotoIds = new Set(input.images.map((image) => image.photoId));
    const mappedGroupCounts = new Map<string, number>();
    for (const group of semantic.groups) {
      for (const photoId of new Set(group.photoIds)) {
        if (inputPhotoIds.has(photoId))
          mappedGroupCounts.set(
            photoId,
            (mappedGroupCounts.get(photoId) ?? 0) + 1,
          );
      }
    }
    const hasMalformedSemanticOutput =
      semantic.groups.some((group) => {
        const knownPhotoIds = new Set(
          group.photoIds.filter((photoId) => inputPhotoIds.has(photoId)),
        );
        return group.photoIds.length !== 1 || knownPhotoIds.size !== 1;
      }) || [...mappedGroupCounts.values()].some((count) => count > 1);
    const decisions: IntakeGroupDecision[] = [];
    for (const image of input.images) {
      const matching = semantic.groups.filter((group) =>
        group.photoIds.includes(image.photoId),
      );
      const group = matching.length === 1 ? matching[0] : undefined;
      const reasons: IntakeRecognitionReason[] = [];
      if (hasMalformedSemanticOutput) reasons.push("unsupported_evidence");
      if (!group) reasons.push("missing_critical_fact");
      if (matching.length > 1) reasons.push("ambiguous_grouping");
      if (group && new Set(group.photoIds).size !== group.photoIds.length)
        reasons.push("ambiguous_grouping");
      if (
        group &&
        group.photoIds.some(
          (photoId) => photoId !== image.photoId || !inputPhotoIds.has(photoId),
        )
      )
        reasons.push("unsupported_evidence");
      if (group && group.photoIds.some((photoId) => photoId !== image.photoId))
        reasons.push("ambiguous_grouping");
      const quality = (group?.quality ?? [])
        .filter((finding) => finding.photoId === image.photoId)
        .map(({ photoId, reason }) => ({ photoId, reason }));
      if (
        group?.quality.some(
          (finding) =>
            !inputPhotoIds.has(finding.photoId) ||
            !group.photoIds.includes(finding.photoId),
        )
      )
        reasons.push("unsupported_evidence");
      // Image-quality findings are retained as provenance and review context.
      // Valid findings do not block active nameplate acceptance; malformed
      // evidence references remain blocking.
      const imageLines = ocr.lines
        .map((line, index) => ({ line, id: lineId(line, index) }))
        .filter(({ line }) => line.photoId === image.photoId);
      const fieldsByName = new Map<
        string,
        typeof group extends undefined
          ? never
          : NonNullable<typeof group>["fields"][number]
      >();
      const fieldCounts = new Map<IntakeRecognitionField, number>();
      for (const field of group?.fields ?? []) {
        fieldCounts.set(field.field, (fieldCounts.get(field.field) ?? 0) + 1);
        if (!fieldsByName.has(field.field))
          fieldsByName.set(field.field, field);
      }
      const duplicateFields = new Set(
        [...fieldCounts.entries()]
          .filter(([, count]) => count > 1)
          .map(([field]) => field),
      );
      if (duplicateFields.size) reasons.push("conflicting_evidence");
      const fields: IntakeFieldDecision[] = (group?.fields ?? []).map(
        (field) => {
          const normalizedField = normalizeRecognitionValue(
            field.field,
            field.value,
          );
          const value = normalizedField.value;
          const evidenceIds = field.ocrLineIds ?? [];
          const evidence = imageLines.filter(({ id }) =>
            evidenceIds.includes(id),
          );
          let accepted = true;
          let reason: IntakeRecognitionReason = "accepted";
          if (duplicateFields.has(field.field)) {
            accepted = false;
            reason = "conflicting_evidence";
          } else if (field.photoId !== image.photoId) {
            accepted = false;
            reason = "unsupported_evidence";
          } else if (
            value === null &&
            NAMEPLATE_CRITICAL_FIELDS.includes(field.field)
          ) {
            accepted = false;
            reason = "missing_critical_fact";
          } else if (value === null) {
            // Optional fields may be explicitly null without OCR evidence.
            accepted = true;
            reason = "accepted";
          } else if (!normalizedField.recognized) {
            accepted = false;
            reason = "unsupported_evidence";
          } else if (evidenceIds.length === 0) {
            accepted = false;
            reason = "missing_evidence";
          } else if (evidence.length !== evidenceIds.length) {
            accepted = false;
            reason = "unsupported_evidence";
          } else if (value !== null && identityNoise(value, field.field)) {
            accepted = false;
            reason = "invalid_identity_value";
          } else if (
            !hasSamePhotoOcrSupport(
              field.field,
              value,
              field.field === "equipmentClass" ? evidence : imageLines,
            )
          ) {
            accepted = false;
            reason = "unsupported_evidence";
          }
          const originalValue = field.value;
          const combinedOcrValue = evidence.length
            ? evidence
                .map(({ line }) => line.text)
                .join(" ")
                .slice(0, 240)
            : null;
          const correction =
            originalValue &&
            normalizedField.value &&
            originalValue !== normalizedField.value
              ? {
                  from: originalValue,
                  to: normalizedField.value,
                  reason: "deterministic normalization",
                }
              : undefined;
          const verification = {
            field: field.field,
            semanticValue: value,
            ocrValue: combinedOcrValue,
            normalizedSemantic: normalizedFieldValue(field.field, value),
            normalizedOcr: normalizedFieldValue(field.field, combinedOcrValue),
            agrees: accepted,
            verifier: ocr.provider,
            verifierModel: ocr.model,
            ocrLineIds: evidenceIds,
            ...(correction ? { correction } : {}),
          };
          return {
            field: field.field,
            value: accepted ? value : null,
            accepted,
            reason,
            photoId: field.photoId,
            box: field.box,
            verifierAgreement: accepted,
            ocrLineIds: evidenceIds,
            verification,
            ...(correction ? { correction } : {}),
          };
        },
      );
      for (const critical of NAMEPLATE_CRITICAL_FIELDS) {
        if (!fieldsByName.has(critical)) {
          fields.push({
            field: critical,
            value: null,
            accepted: false,
            reason: "missing_critical_fact",
            photoId: image.photoId,
            box: null,
            verifierAgreement: false,
            ocrLineIds: [],
          });
        }
      }
      const identityValues = new Map(
        fields
          .filter((field) => field.accepted && field.value)
          .map((field) => [field.field, normalized(field.value)]),
      );
      if (
        identityValues.get("model") &&
        identityValues.get("model") === identityValues.get("serial")
      ) {
        reasons.push("conflicting_evidence");
        for (const field of fields) {
          if (field.field === "model" || field.field === "serial") {
            field.accepted = false;
            field.value = null;
            field.reason = "conflicting_evidence";
          }
        }
      }
      for (const field of fields) {
        // Optional nameplate facts are warnings/evidence only. Only
        // manufacturer, model, and serial failures block readiness.
        if (
          !field.accepted &&
          NAMEPLATE_CRITICAL_FIELDS.includes(field.field) &&
          !reasons.includes(field.reason)
        )
          reasons.push(field.reason);
      }
      const criticalIdentityReady = NAMEPLATE_CRITICAL_FIELDS.every((name) =>
        fields.some((field) => field.field === name && field.accepted),
      );
      if (
        !criticalIdentityReady &&
        quality.some(({ reason }) => reason === "blur")
      )
        reasons.push("blur");
      const accepted =
        reasons.length === 0 &&
        NAMEPLATE_CRITICAL_FIELDS.every((name) =>
          fields.some((field) => field.field === name && field.accepted),
        );
      if (!accepted && reasons.length === 0)
        reasons.push("missing_critical_fact");
      decisions.push({
        key: `photo-${image.photoId}`,
        photoIds: [image.photoId],
        accepted,
        reasons: [...new Set(reasons)],
        fields,
        quality,
      });
    }
    return decisions;
  }
}
