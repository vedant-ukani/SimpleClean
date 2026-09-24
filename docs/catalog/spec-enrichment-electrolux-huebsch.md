# Electrolux Professional and Huebsch specification enrichment

Reviewed 2026-09-23. This is a static, immutable Catalog delta; it was not imported into the database.

## Review counts

| Manufacturer            | Existing models examined | Models enriched | New supported field instances | Still incomplete after review                                                                                                 |
| ----------------------- | -----------------------: | --------------: | ----------------------------: | ----------------------------------------------------------------------------------------------------------------------------- |
| Electrolux Professional |                      120 |              16 |                            84 | 15 enriched models still lack exact weight, voltage, phase, and/or fuel evidence; 104 models received no defensible new field |
| Huebsch                 |                        8 |               1 |                             8 | 8 lack production-year evidence; HFNKCASG115TW01 has no defensible fuel field                                                 |

Electrolux additions are limited to exact rows in the official range table and the exact T5300S datasheet. New fields are width, depth, height, capacity, and configuration for all 16 models; the T5300S datasheet additionally supports weight, voltage, phase, and fuel. Metric source values are retained in evidence and converted to the Catalog's inch/pound fields. Existing model identity, family, aliases, equipment class, serial rules, production years, and existing evidence are carried forward unchanged; each revision is incremented to `r2`.

Enriched Electrolux models:

- Line6000 dryers: `TD6-6`, `TD6-7`, `TD6-14`, `TD6-20`
- Line5000 washers: `W5130N`, `W5250N`, `W5330N`
- Line5000 dryers: `T5190`, `T5190LE`, `T5290`, `T5300S`, `T5425S`, `T5550`, `T5675`
- G4000 dryers: `T4900`, `T41200`
- Huebsch front-load washer: `HFNKCASG115TW01`

## Official sources

The delta includes the carried model/year source plus new source IDs for every new field:

- Electrolux Professional error-code/model list (carried model and production-year evidence): <https://www.electroluxprofessional.com/jp/download/errorsearch/>
- Electrolux Professional, _Facility Management Range Overview 2017_, exact model tables on PDF pages 8, 12, and 13: <https://www.electroluxprofessional.com/gb/wp-content/uploads/2017/05/Facility-Management-Range-Overview-2017.pdf>
- Electrolux Professional, _T5300S product datasheet_, exact model specifications on PDF pages 1–2: <https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PS_438919518EN_T5300S_EN.pdf>
- Huebsch, _Vended Stack & Single Tumble Dryer Specifications_ (reviewed for the seven existing models): <https://huebsch.com/wp-content/uploads/2021/10/DL_AH21-0137_SpecSheet_TumbleDryers_en-US.pdf>
- Huebsch by Alliance Laundry Systems, _Vended Front Load Washer_, exact HFNKCASG115TW01 model group and front-control specifications on PDF page 2: <https://docs.alliancelaundry.com/adv_pdf/AH18-0025_Vended%20Front%20Load%20Washer.pdf>

The range PDF and Huebsch washer brochure have retained checksums in the delta. The T5300S datasheet was reviewed through official document extraction, but its source bytes were not retained; the delta records that limitation rather than inventing a checksum. No family-only value, alias, or inferred production date was added. The 806117 parts manual establishes HFNKCASG115TW01 as an exact Huebsch model but contains parts diagrams rather than product specifications; the AH18-0025 brochure supplies the exact model-group dimensions, capacity, electrical requirement, weight, and configuration. Huebsch production years remain null because the reviewed official material did not provide defensible exact-model year evidence, and the washer brochure does not establish a fuel classification.

Delta file: `apps/api/catalog-data/spec-enrichment-electrolux-huebsch.2026-09-23.json`.
