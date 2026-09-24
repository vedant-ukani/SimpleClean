# Speed Queen and Maytag Commercial specification enrichment (2026-09-23)

Dataset: `spec-enrichment-speedqueen-maytag.2026-09-23`
Checksum: `bf5299abcf0b74be8407032a7fe2a66971b704708a7380ffdf2350fb848fb97a`

This reviewed immutable delta contains only models for which official manufacturer documentation added one or more previously missing specification fields. Existing identity, family, aliases, equipment class, serial rules, facts, and evidence are retained; each enriched model has revision 2 and new evidence/source IDs.

## Counts

- Examined: 77 existing Speed Queen/Maytag Commercial models (30 Speed Queen and 47 Maytag Commercial, including inventory-variant MAH21PDDWW).
- Enriched: 20 models (9 Speed Queen; 11 Maytag Commercial).
- New fields: 135 newly supported model-field values (47 Speed Queen; 88 Maytag Commercial).
- New-field breakdown: SCT040/SCT060/SCT080/SCT100 received 8 each; SCN020WCF/SCN030WCF/SCN040WCF/SCN060WCF/SWNLN21 received 3 each; each MYR/MYS model in this delta received 8.
- Still incomplete: 77 models remain incomplete against the full requested field set because production start/end years remain unknown for every examined model; additional specification gaps are listed in the limitations below.

## Official sources

- [Speed Queen SCT040 specification sheet](https://distribution.alliancelaundry.com/wp-content/uploads/2023/08/DL_AO21-0042_SpecSheet_SCT040_en-US.pdf)
- [Speed Queen SCT060 specification sheet](https://distribution.alliancelaundry.com/wp-content/uploads/2023/08/DL_AO21-0043_SpecSheet_SCT060_en-US.pdf)
- [Speed Queen SCT080 specification sheet](https://distribution.alliancelaundry.com/wp-content/uploads/2023/08/DL_AO21-0044_SpecSheet_SCT080_en-US.pdf)
- [Speed Queen SCT100 specification sheet](https://distribution.alliancelaundry.com/wp-content/uploads/2023/08/DL_AO21-0045_SpecSheet_SCT100_en-US.pdf)
- [Speed Queen vended construction drawing](https://speedqueencommercial.com/en-us/wp-content/uploads/2020/02/sq-vended-construction-drawing.pdf)
- [Maytag Commercial washer-extractor installation instructions WFR124390J](https://www.whirlpool.com/content/dam/global/documents/202304/installation-instruction-wfr124390-revJ.pdf)

## Limitations

Only exact model rows or exact model schedules were used. No production-year range was published in the reviewed official sources. Maytag MAH21PDDWW remains identity-only because the official parts list did not provide the requested specifications. Speed Queen ST025/ST030/ST035/ST050/ST055/ST075 weights remain unknown because official documentation gives different net weights by fuel/electrical configuration; no scalar weight was invented. Speed Queen STT55, SCN models' dimensions/capacity, and other unlisted model fields remain unknown where no exact official table supplied them. Source document byte checksums are explicitly unavailable because the retrieved bytes were not retained.
