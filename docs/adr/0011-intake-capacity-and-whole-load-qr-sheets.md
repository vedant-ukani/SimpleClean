# ADR 0011 — Intake capacity and whole-Load QR sheets

## Status

Accepted

## Context

Warehouse workers receive several serialized Machines in one Load. They need to
confirm pound capacity while reviewing each nameplate and, after receiving is
complete, print labels for the whole Intake without opening every Machine. The
existing QR token is intentionally opaque, but workers also need enough visible
text to match each printed label to the physical Machine.

## Decision

Store an optional bounded integer `capacityLb` on the Intake Candidate, Machine,
and immutable identity evidence. Recognition may propose capacity only from
explicit unit-bearing OCR evidence. A worker can confirm a common pound value,
enter a bounded custom value, or leave it unknown. Capacity is not part of
serialized identity and never blocks individual Machine creation.

After Finish Receiving, Owner Admin and Warehouse users may generate one private
US Letter PDF for all Machines mapped by that Intake. Printing requires every
mapped Machine to have capacity. The service reuses each active QR label or
creates one when absent, records print activity, and renders up to nine labels
per page. Each label shows Laundrorama, manufacturer, pound capacity, Machine
type, full serial, fallback code, and the existing opaque signed QR token.

## Consequences

- Intake remains fast and individual: workers can capture the next nameplate
  while earlier recognition runs, then approve each Machine separately.
- Unknown capacity does not delay Inventory intake, but it must be resolved
  before whole-Intake label printing.
- QR payloads remain non-authorizing opaque references; readable facts are
  printed outside the token and the PDF remains authenticated and `no-store`.
- Reprints reuse active labels and add print history rather than issuing new QR
  identities.
- The visible serial/manufacturer text is a deliberate, narrow revision to the
  earlier minimal-label privacy choice; price, customer, location, cost, and
  internal Machine IDs remain excluded.
