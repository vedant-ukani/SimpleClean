# Unmatched inventory model research — 2026-09-23

## Purpose

This follow-up investigates the 36 distinct manufacturer/model strings that the
`official-models.2026-09-23` snapshot leaves unsupported. The source workbook is
read-only. Counts below describe workbook rows, not unique physical identities.
No serial number or other private workbook value is included.

The research does not change runtime resolution. A model becomes resolvable only
after its evidence is reviewed and added through a new immutable Catalog dataset.

## Result

- The 36 strings affect 128 of the workbook's 227 rows.
- 2 strings now have exact official evidence and are safe candidates for a new
  approved Catalog revision: Maytag `MAH21PDDWW` and Huebsch
  `HFNKCASG115TW01`. Together they cover 7 workbook rows.
- 28 strings have official family/base-model evidence but not an official
  occurrence of the complete option-coded string.
- 6 strings still have no defensible official family or exact match.
- Several family-only strings have exact reseller, parts-index, or auction
  occurrences. These are discovery leads, not approval evidence.

## Evidence policy used

1. **Official exact** — the complete inventory string occurs in a manufacturer
   or manufacturer-owned document/index. It may become a canonical variant.
2. **Official family-only** — an official source proves the family/base model,
   but not every suffix. It remains unsupported by the exact resolver.
3. **Corroborating lead** — a reseller, parts index, or auction uses the exact
   string. It can guide document requests but cannot approve an alias or specs.
4. **Unresolved** — no defensible official family or exact occurrence was found.

No suffix is stripped, punctuation is repaired, or manufacturer is reassigned
without explicit official evidence or a separately reviewed nameplate decision.

## Inventory impact and disposition

| Manufacturer | Inventory model | Rows | Research disposition | Evidence / next action |
|---|---|---:|---|---|
| Continental | `DDAG30KCS-65` | 2 | Unresolved | Continental's [manual index](https://continental-laundry.com/services-support/technical-service/equipment-manuals/) does not identify `DDAG`; do not reassign it to Dexter because it resembles `DDAD`. Obtain a clear nameplate and distributor lookup. |
| Dexter | `DDAD30KCS-65EC` | 9 | Official family-only | Dexter names `DDAD30KCS-65` and the official [DDAD30 parts document](https://www.dexter.com/upl/downloads/parts-lookup/ddad30-vended-express-stack-dryer.pdf) uses the `DDAD30KC_-65` family pattern. The terminal `EC` is not established. |
| Dexter | `DDAD30KCW-65` | 4 | Official family-only | The same official `DDAD30KC_-65` document proves the family but not this complete option string. |
| Dexter | `DDAD50KCS-65` | 1 | Official family-only | Dexter's [T-50x2 / DDAD50 manual](https://www.dexter.com/upl/downloads/products/vended/documents/t-50x2-express-ddad-50x2-parts-service-manual.pdf) proves `DDAD50`, not the complete suffix. |
| Dexter | `DDAD50KCS-65EC` | 3 | Official family-only | Same `DDAD50` evidence; `EC` remains unverified. |
| Dexter | `DJ2X3AA` | 1 | Unresolved | Exact nonofficial listings exist, but no Dexter document was found. Verify the manufacturer and characters from the nameplate. |
| Dexter | `DJX3AA` | 1 | Unresolved | No official occurrence found. Obtain nameplate evidence; do not infer `DJ2X3AA`. |
| Dexter | `DL2X300` | 2 | Official family-only | Dexter's [historical technical index](https://www.dexter.com/support/technical-information/?file_type=6&industry=vended&product=dryer&style=historical) lists `DL2X30`; the final character remains unverified. |
| Dexter | `DL2X30Q` | 2 | Official family-only | Official [DL2X30 parts data](https://www.dexter.com/upl/downloads/products/documents/69a71b2e292ae41d50943.pdf) proves the family only. |
| Dexter | `DL2X30QA` | 2 | Official family-only | Official `DL2X30` family; exact reseller occurrences are discovery leads only. |
| Dexter | `DL2X30QSS` | 8 | Official family-only; exact secondary lead | Official `DL2X30` family plus exact reseller occurrences from [Kalco Laundry](https://kalcolaundry.com/product/dexter-30-pound-double-dryer-2/) and [Midwest Laundries](https://midwestlaundries.com/products/dexter-dl2x30qss-30lb-x-2). Request the manufacturer parts/build record or verify from nameplate plus an approved distributor record. |
| Dexter | `DLX30QSS` | 1 | Unresolved | Official documents use `DL2X30`; never silently insert `2`. Obtain a new nameplate image. |
| Dexter | `WC0300XA-10EC2X-SSBCS-USX` | 1 | Official family-only | Dexter's [C-Series washer manual](https://www.dexter.com/upl/downloads/products/documents/65bd4d6515569356876c4.pdf) identifies nearby `WC0300` variants, but not this complete string. |
| Dexter | `WCAD25KCS-12ECSZ` | 12 | Official family-only | Official WCAD documentation proves the A-Series washer family; no exact suffix occurrence was found. This is the highest-impact Dexter follow-up. |
| Dexter | `WCAD40KCB-12US` | 1 | Official family-only | Official WCAD family; `KCB-12US` is unverified. |
| Dexter | `WCAD45KCS-12ECSZ` | 5 | Official family-only | Official WCAD family; reseller records show nearby variants but do not prove this exact string. |
| Dexter | `WCAD75KCS-12EC` | 2 | Official family-only; exact secondary lead | Official WCAD family and exact used-equipment occurrences; request manufacturer/distributor confirmation before approval. |
| Electrolux | `SP135P2325SNANNUSA` | 1 | Unresolved | No Electrolux Professional exact or family occurrence found. Recheck which nameplate field supplied this value and obtain a clearer plate. |
| Huebsch | `HFNKCASG115TW01` | 3 | **Official exact** | Alliance's official [parts portal](https://parts.alliancelaundry.com/i-23905510-huebsch-803920-washer-dryer-lock-door.html) and [806117 parts manual](https://docs.alliancelaundry.com/tech_pdf/partsservice/806117.pdf) list the complete model. Safe candidate for an exact Huebsch washer variant. |
| Maytag | `MAH21PDDWW` | 4 | **Official exact** | Maytag's official [repair-parts list](https://www.maytag.com/content/dam/global/documents/201102/parts-list-MAH21PDDWW.pdf) identifies the complete model as a washer. Safe candidate for an exact Maytag variant. |
| Maytag | `MLG27PDBWW1` | 1 | Official family-only; exact secondary lead | Official Whirlpool/Maytag material proves `MLG27PDBWW` and the stacked gas-dryer family; [Whirlpool Parts](https://www.whirlpoolparts.com/Shop-For-Parts/a8b4d2330209/Model-MLG27PDBWW1-Maytag-Dryer-Parts) lists the terminal `1`. Do not strip it without official build/parts evidence. |
| Speed Queen | `SC20BC20U60001` | 4 | Official family-only; exact secondary lead | Alliance's [SC20/30/40/60 specification](https://docs.alliancelaundry.com/adv_pdf/ac06-202.pdf) proves SC20. An exact used-equipment occurrence is only a lead. |
| Speed Queen | `SC20BY20U60001` | 6 | Official family-only | Official SC20 family; complete option code not found. |
| Speed Queen | `SC30BY20U60001` | 3 | Official family-only | Official SC30 family; complete option code not found. |
| Speed Queen | `SC35MD20U40420` | 4 | Official family-only | Alliance [parts manual F232173](https://docs.alliancelaundry.com/tech_pdf/PartsService/F232173.pdf) explicitly covers SC35 models. This corrects the earlier family-level research, but the full string remains unverified. |
| Speed Queen | `SC40BY20U60001` | 3 | Official family-only | Official SC40 family; complete option code not found. |
| Speed Queen | `SC60BCFXU60001` | 1 | Official family-only; exact secondary lead | Official [SC60 specification](https://docs.alliancelaundry.com/adv_pdf/AO18-0014_SC060_OPL.pdf); exact nonofficial occurrence is a lead only. |
| Speed Queen | `SC60BY20U60001` | 1 | Official family-only | Official SC60 family; complete option code not found. |
| Speed Queen | `SCT020QCAFXU400000` | 2 | Official family-only | Official [SCT020 specification](https://speedqueencommercial.com/wp-content/uploads/2019/10/DL_AM19-0050_SpecSheet_SCT020_en-US.pdf); complete option code not found. |
| Speed Queen | `SCT030QCAFXU400000` | 7 | Official family-only | Official [SCT030 specification](https://speedqueencommercial.com/wp-content/uploads/2019/10/DL_AM19-0051_SpecSheet_SCT030_en-US.pdf); complete option code not found. |
| Speed Queen | `ST075NBCB1G1N05` | 4 | Official family-only; exact secondary lead | Official [ST075 specification](https://docs.alliancelaundry.com/adv_pdf/AO18-0030_ST075_OPL.pdf); exact auction occurrence is a lead only. |
| Speed Queen | `ST075NCDB1G1N04` | 2 | Official family-only | Official ST075 family; complete option code not found. |
| Speed Queen | `ST075NCDB1G1Q03` | 2 | Official family-only | Official ST075 family; complete option code not found. |
| Speed Queen | `STT30NBCB2G2N02` | 21 | Official family-only; exact secondary lead | Official [STT30 specification](https://speedqueencommercial.com/wp-content/uploads/2019/10/DL_AO19-0008_SpecSheet_OPL_Classic_STT30_en-US.pdf). Exact occurrences from [RepairClinic](https://www.repairclinic.com/ProductDetail/2260077) and [123Laundry](https://www.123laundry.com/out-of-stock.html) make this the highest-impact document-request candidate, not an approved alias. |
| Speed Queen | `STT30NBCB2GN02` | 1 | Official family-only | Official STT30 family; the shorter suffix is not proven equivalent to the preceding model. |
| Speedqueen | `SBCB2G1W01` | 1 | Unresolved | No defensible family match. The spelling alias `Speedqueen` does not repair a truncated or incorrect model. Obtain the nameplate. |

## Research conclusions

The first implementation increment can safely add two exact variants and move
coverage from 17 to 19 of 53 distinct workbook model strings. It will resolve 7
additional workbook rows. The other 34 strings must remain unresolved at
runtime until stronger evidence is approved.

The next evidence requests should be ordered by inventory impact:

1. `STT30NBCB2G2N02` — 21 rows.
2. `WCAD25KCS-12ECSZ` — 12 rows.
3. `DDAD30KCS-65EC` — 9 rows.
4. `DL2X30QSS` — 8 rows.
5. `SCT030QCAFXU400000` — 7 rows.
6. `SC20BY20U60001` — 6 rows.

For these six strings, request a clear full nameplate photo and either an
official archived manual/build sheet or written manufacturer/distributor model
confirmation. Secondary listings alone must not drive Catalog approval.
