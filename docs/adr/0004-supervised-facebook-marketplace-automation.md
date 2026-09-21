# ADR 0004 Supervised Facebook Marketplace Automation

## Status

Accepted

## Context

Facebook Marketplace currently produces valuable leads, but ordinary Marketplace listing and personal-message access do not provide the same dependable integration surface as Shopify catalogs or Facebook Page messaging. Unattended browser automation is vulnerable to interface changes, authentication challenges, platform restrictions, and account suspension.

## Decision

Automate listing preparation completely, including content, photos, pricing, and quantity. Permit Computer Use only through a dedicated, observable local business browser with explicit human approval before publication or external replies. Do not operate an unattended VPS browser against a personal Facebook account.

Use supported Meta interfaces for Facebook Page and Instagram Professional conversations. Direct Marketplace prospects toward the business Page, website, or business number so subsequent communication can enter the CRM reliably.

## Consequences

- Marketplace remains usable without placing the primary sales account at unnecessary risk.
- Some posting and personal Marketplace conversations remain manual.
- Shopify and supported Meta surfaces become the long-term automated channel.
