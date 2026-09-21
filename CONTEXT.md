# Simply Clean Domain Language

This glossary defines the terms used in [ARCHITECTURE.md](./ARCHITECTURE.md), specifications, code, tests, and operational interfaces.

## Party

A person or organization that may act as a seller, distributor, prospect, buyer, carrier, parts supplier, or other business contact. A Party can hold several roles without creating duplicate CRM identities.

## Acquisition Inquiry

A seller or distributor submission describing equipment that Simply Clean may purchase, including contact, location, access, equipment facts, photos, timing, and requested terms.

## Acquisition Offer

A versioned proposal to buy equipment. It records the expected-retail inputs, modifiers, freight and packing assumptions, recommended amount, owner approval, and seller response.

## Acquisition Load

A group of equipment purchased and transported together from one seller under one commercial arrangement. It carries the purchase amount, inbound freight cost, seller, pickup and receipt facts, and source documents used to understand the load's profitability.

## Machine

One uniquely identifiable physical washer, dryer, or related piece of equipment. A Machine has its own internal identifier and may also have a manufacturer serial number.

## Model Specification

The shared, verified characteristics of a manufacturer model, such as dimensions, weight, capacity, utilities, and configuration options. A Machine can override a characteristic when its actual configuration differs.

## Intake

The process of receiving a Machine, identifying it, documenting its arrival condition, assigning its identity and location, and associating it with an Acquisition Load.

## Preliminary Inspection

The short assessment performed after Intake to identify fatal or uneconomic conditions and determine whether a Machine may be offered for sale before full refurbishment.

## Inventory Location

The named physical position where a Machine or Part can be found.

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

The planned and tracked movement of one or more Sales Orders from Simply Clean to a destination.

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
