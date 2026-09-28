# ADR 0021 — Human-confirmed Equipment Class at Intake

## Status

Accepted on 2026-09-28.

## Context

William named Washer, Dryer, Stacked Washer/Dryer, and Washer/Dryer Combo as physical kinds of equipment in the [September 25 warehouse testing transcript](../2026-09-25-inventory-testing-transcript.md) at 35:14. Catalog already distinguishes Stack Dryer. The existing three-value Machine type loses those differences, while Production uses Washer/Dryer as work specialties.

## Decision

Record the physical Equipment Class as `washer`, `dryer`, `stack_dryer`, `stacked_washer_dryer`, `washer_dryer_combo`, or `other` on the Intake Candidate and committed Machine. Keep the separate operational Machine type for Production: Washer maps to Washer; Dryer and Stack Dryer map to Dryer; Stacked Washer/Dryer, Washer/Dryer Combo, and Other map to Other.

An exact verified Catalog model may suggest Equipment Class when already available. Otherwise, OpenAI may propose one from the bounded Intake photo only when explicit same-photo OCR and visual layout support the class. The deterministic policy checks the OCR phrase. Catalog is advisory and never blocks Intake. Neither source may set or overwrite the Candidate's selected class.

After recognition, the worker confirms or corrects Equipment Class. Record the worker and time. Final Batch Commit requires that attributable selection, then writes Equipment Class to Machine identity and evidence in the same transaction. Existing legacy Machines retain a null class until reviewed; the migration does not infer that all historical Washer or Dryer rows are single units.

## Consequences

- The Inventory list, Machine detail, and QR sheet show the physical class when known.
- Production continues to route by the derived operational Machine type; mixed-function classes remain Other until a distinct production workflow is designed.
- Catalog's strict official-source and evidence policy remains intact and now permits Washer/Dryer Combo.
- This supersedes ADR 0015 and ADR 0018 only where they say recognition cannot propose equipment type or constrain the worker's Intake choice to Washer, Dryer, or Other. Their human approval, OCR evidence, privacy, and atomic Batch Commit decisions remain in force.
