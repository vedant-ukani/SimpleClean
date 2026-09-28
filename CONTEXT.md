# Laundrorama Domain Language

This glossary defines the terms used in [ARCHITECTURE.md](./ARCHITECTURE.md), specifications, code, tests, and operational interfaces.

## Party

A person or organization that may act as a seller, distributor, prospect, buyer, carrier, parts supplier, or other business contact. A Party can hold several roles without creating duplicate CRM identities.

## Acquisition Inquiry

A seller or distributor submission describing equipment that Laundrorama may purchase, including contact, location, access, equipment facts, photos, timing, and requested terms.

## Acquisition Offer

A versioned proposal to buy equipment. It records the expected-retail inputs, modifiers, freight and packing assumptions, recommended amount, owner approval, and seller response.

## Acquisition Load

A group of equipment purchased and transported together from one seller under one commercial arrangement. It carries the purchase amount, inbound freight cost, seller, pickup and receipt facts, and source documents used to understand the load's profitability.

## Machine

One uniquely identifiable physical washer, dryer, or related piece of equipment. A Machine has its own internal identifier and may also have a manufacturer serial number.

Its human-confirmed Equipment Class records the physical configuration. The separate operational Machine type remains Washer, Dryer, or Other for Production routing. Legacy Machines may have no recorded Equipment Class until a person reviews them.

## Equipment Class

The physical kind of a Machine: Washer, Dryer, Stack Dryer, Stacked Washer/Dryer, Washer/Dryer Combo, or Other. A Stack Dryer has two dryer pockets; a Stacked Washer/Dryer has a washer and dryer; a Washer/Dryer Combo combines both functions in one unit. A worker confirms this class. A verified exact Catalog model or an OCR-supported image reading may suggest it, but suggestions never finalize it.

## Model Specification

The shared, verified characteristics of a manufacturer model, such as dimensions, weight, capacity, utilities, and configuration options. A Machine can override a characteristic when its actual configuration differs.

## Intake

The process of receiving a Machine, identifying it, documenting its arrival condition, assigning its identity, and associating it with an Acquisition Load.

## Intake Batch

A bounded, Load-level receiving session that collects private Intake Evidence and Machine Intake Items, records human review, and remains open until one final Batch Commit creates every ready unmapped Machine and closes the session. Historical sessions may contain individually committed mappings.

## Machine Intake Item

One independently progressing unit inside an Intake Batch: one nameplate photo, one Candidate Machine, and targeted recognition state. The worker may prepare the next item while earlier items process, then confirms its Equipment Class after recognition succeeds. Historical items may have recorded a coarse Machine type during preparation or carry recapture state.

## Intake Evidence

A private arrival or nameplate image associated with an Acquisition Load and an Intake Batch. The original file remains immutable evidence; review previews and links do not replace it.

Failed Intake Evidence may be excluded from active receiving without being deleted. Exclusion preserves the photo, Recognition Run, Candidate history, and audit trail, while a Candidate with no currently assigned evidence is not an active Machine Intake Item and does not enter Batch Commit.

## Candidate Machine

A reviewed proposal inside an open Intake Batch. In the active workflow it is bound to one nameplate photo, holds automatically assigned visible facts, and gains an attributable worker-confirmed Equipment Class after recognition. It is not authoritative Inventory until the final Batch Commit succeeds.

## Candidate Confirmation

The attributable decision that a Candidate Machine's evidence and visible facts satisfy the recognition policy. Historical INT-01 batches may contain manual confirmation; the active workflow uses the versioned Confidence Policy to accept supported field suggestions, then separately requires a person's Equipment Class choice and final Batch Commit authorization.

## Recognition Run

One idempotent, versioned attempt to analyze an Intake Batch or a targeted Machine Intake Item. It records the provider, model, prompt/schema version, Confidence Policy version, source checksums, target Candidate revision, status, and privacy-safe failure information. A Recognition Run produces evidence and proposals, not authoritative Machines.

## Grouping Proposal

A recognition-produced suggestion that specific Intake Evidence images show the same physical Machine. It records its supporting signals and confidence-policy result. An accepted proposal may populate a Candidate Machine, but ambiguity creates a Recapture Request or returns to manual grouping.

## Field Suggestion

A proposed visible nameplate fact, such as manufacturer, model, serial, voltage, or phase, linked to exact Intake Evidence and a bounded evidence location. It preserves the raw provider read separately from the normalized value evaluated by Inventory rules.

## Nameplate Assignment

The semantic proposal that maps bounded Google OCR evidence to specific visible fields such as manufacturer, model, serial, voltage, phase, fuel, capacity, or Equipment Class. In the active path the semantic provider receives a bounded metadata-stripped JPEG with its same-photo OCR and may use visual layout, adjacency, and labels only to assign field meaning. It must copy exact identity characters from and cite the supplied OCR, return unknown facts as null, and cannot create or verify a Machine. Any proposed Equipment Class remains advisory; the worker confirms or corrects it after recognition.

## Character Resolution

A versioned, evidence-backed decision about an OCR-confusable character such as `O/0` or `I/1`. It preserves the original symbol and records the position, proposed character, supporting evidence, and validation result. A global substitution or unsupported guess is not a Character Resolution.

## Independent Verification

A second reading or deterministic check that does not merely repeat the semantic extractor's confidence. Historical recognition may include cross-photo or second-reader checks. The active single-nameplate path requires valid same-photo Google OCR citations and verifies OpenAI's normalized field value against all bounded OCR for that photo. Required identity values must occur as complete contiguous token sequences, and field formats remain deterministic. A duplicate identity match does not change readiness.

## Confidence Policy

The versioned platform rule that validates semantic assignments against bounded Google OCR evidence and deterministic Inventory checks before accepting a proposal. Every non-null value must retain valid same-photo citations, while support may be found anywhere in that photo's bounded OCR. Manufacturer, model, and serial must occur as complete contiguous normalized token sequences. Provider confidence and image-quality warnings are retained as provenance but do not independently block a supported assignment.

## Recapture Request

A historical targeted request for new Intake Evidence when an image was blurred, reflective, cropped, too small, conflicting, or ambiguously grouped. Existing requests remain readable, but the active single-nameplate path does not create new Recapture Requests; unsupported or failed recognition remains retryable against the retained photo.

## Intake Exception

A recognition or receiving problem that prevents exception-free Batch Commit, such as unresolved grouping, unreadable critical fields, conflicting reads, or a failed required recapture. A duplicate identity match is not an Intake Exception. It remains distinct from a later cross-workflow Exception Case unless explicitly promoted.

## Individual Intake Commit

The historical and compatibility transaction that revalidates one confirmed Candidate Machine and creates exactly one provisional Machine, its identity evidence, and provenance mapping while leaving the Intake Batch open. A matching manufacturer and serial never causes an automatic merge or blocks this photo-Intake transition. The active UI does not expose this action.

## Finish Receiving

The historical and compatibility transition that closes an Intake Batch after every Candidate Machine already has a durable Machine mapping. It does not approve or create unreviewed Machines; the active UI uses one final Batch Commit instead.

## Batch Commit

The active final receiving transition. It validates that every selected item is accounted for, recognition-ready and confirmed, and has a human-confirmed Equipment Class; then it creates all unmapped provisional Machines, identity evidence, and provenance mappings and closes the Intake Batch in one audited, idempotent database transaction. Compatible historical mappings are preserved and skipped.

## Photo Provenance

The immutable relationship from a committed Machine back to the Intake Batch, Candidate Machine, and private Intake Evidence used during confirmation.

## Preliminary Inspection

The short assessment performed after Intake to identify fatal or uneconomic conditions and determine whether a Machine may be offered for sale before full refurbishment.

## Preliminary Disposition

The attributable decision recorded from a Preliminary Inspection. Repairable moves Production to Preliminary Passed; Hold and Owner Review block Production while the Machine remains On Hand. Parts-only and Scrap block Production and move Inventory to Scrapped only with Owner Admin approval. A Preliminary Disposition is not a full test, repair, clean, QA Release, listing approval, or shipment release.

## Cost Entry

A purchase, freight, packing, part, labor, warranty, refund, or other cost recorded with its source evidence. A shared Cost Entry may be allocated across several Machines using a documented basis.

## Sales Listing

An offer presented to buyers. It may represent one Machine, a group of interchangeable Machines, or a package containing different Machines.

## Listing Group

A pool of sufficiently equivalent Machines offered through one Sales Listing. Exact Machines are assigned when a buyer makes a Reservation.

## Publication

The representation of a Sales Listing on an external sales channel. One Sales Listing may have several Publications.

## Lead

A potential sales opportunity involving a person or company with an expressed equipment need.

## Customer

A person or company that has entered a commercial relationship through a Quote, Reservation, Sales Order, or completed purchase.

## Customer Need

A recorded requirement for equipment that is not yet fulfilled. It may specify models, equipment types, quantities, capacity, utilities, budget, location, or timing.

## Consent

Evidence that a Party allowed communication through a specific marketing channel, including status, time, source, and later withdrawal. Transactional communication does not create marketing Consent.

## Conversation

The ordered history of calls, text messages, emails, social messages, notes, and follow-up commitments associated with a Lead or Customer.

## Quote

A time-limited commercial proposal covering equipment, discounts, estimated freight, taxes, deposits, and relevant terms.

## Reservation

A temporary allocation of specific Machines or quantities to a buyer. A Reservation prevents the same inventory from being promised elsewhere.

## Sales Order

The accepted commercial commitment describing what the Customer is buying, the agreed price, payments, fulfillment requirements, and shipping destination.

## Production Work Order

The authorized work required to make reserved or planned equipment ready for release. It normally moves through Test, Repair, Retest, Clean, and QA.

## Checklist Template

The controlled set of required steps and evidence for a category or model of equipment.

## Checklist Run

The completed or in-progress application of a Checklist Template to a specific Machine and Production Work Order.

## Test Session

One Technician's server-timed group of 1–20 same-specialty Test Work Orders. Each Machine remains an independent Work Order and Checklist Run while its session item is Working, Running Cycle, Waiting, Completed, or Removed. Waiting time is not allocated to that Machine; finishing the session detaches unfinished work without erasing its claim or checklist progress.

## Defect

A documented condition that prevents a Machine from meeting its release standard or that must be disclosed to a buyer.

## Repair

Work performed to resolve a Defect, including labor, Parts, evidence, and outcome.

## QA Release

The explicit approval that a Machine has satisfied its required checks and may proceed to shipment.

## Part

A stocked component that may be consumed by a Repair or sold independently.

## Parts Request

A technician-recorded need for a Part that is not available for immediate reservation. It moves through review, ordering, receipt, allocation, or cancellation.

## Packing Task

The warehouse work required after sale to verify exact Machines, apply protection, build Pallets, capture final dimensions and weight, and prepare a Shipment.

## Pallet

A physical Shipment Unit containing one or more approved Machines or Parts with final packaged dimensions, weight, protection, and evidence.

## Shipment

The planned and tracked movement of one or more Sales Orders from Laundrorama to a destination.

## Load Plan

The approved placement, orientation, protection, and unloading sequence for Machines within a vehicle or palletized Shipment.

## Delivery Alert

A message sent because a Shipment crossed a meaningful ETA or proximity threshold and the recipient needs to prepare for unloading or receipt.

## Warranty Claim

A post-delivery request for assistance evaluated against the Sales Order's warranty terms.

## Exception Case

A tracked problem that crosses or blocks a normal workflow, such as damage, mismatch, failed test, oversell risk, lost shipment, refund dispute, or integration failure. It records evidence, owner, exposure, decision, and resolution.

## User

A person authenticated to use the platform. A User may be an employee, contractor, driver, administrator, or Customer contact.

## Technician

An employee or contractor responsible for testing, repairing, cleaning, or inspecting equipment.

## Sales Channel

A place where Sales Listings are promoted or sold, such as Shopify, Facebook Shop, Facebook Marketplace, or eBay.
