# Current Inventory Catalog coverage

Snapshot: 2026-09-24. Composite dataset: `catalog-official-models-2026-09-23-composite-f5247377b05987e4d05f8bdb277bcbca10c887059702fdff21f990300f83e096`.

This report composes individually validated, immutable Catalog datasets for a read-only Inventory benchmark. It does not establish undocumented historical completeness or option-code equivalence. Family support never resolves an unverified full variant. Runtime resolution performs no internet lookup.

Source-content checksums are unavailable where explicitly recorded below. These sources were reviewed through public document extraction; no source-byte checksum is fabricated. The dataset itself has a deterministic SHA-256 checksum.

| Dataset | Checksum | Models | Sources |
|---|---|---:|---:|
| `official-models.2026-09-23` | `7d571e94da57846e2c7ad7d35a04cadfaabed2c5ab4452916ac2cef0f2eeace6` | 297 | 54 |
| `inventory-variants-2026-09-23` | `cdb85936e31b4a877ef4b39177b92a72c6b799ecbe25609c1fc809c109dfdf34` | 2 | 2 |
| `spec-enrichment-dexter-continental.2026-09-23` | `0defbfcffbefbad10be38f4e1620ec476ffd405a08cfe1ee6319cdf0f6e697eb` | 16 | 20 |
| `spec-enrichment-speedqueen-maytag.2026-09-23` | `bf5299abcf0b74be8407032a7fe2a66971b704708a7380ffdf2350fb848fb97a` | 20 | 32 |
| `catalog-spec-enrichment-electrolux-huebsch-2026-09-23` | `c9babd0f56583e123e854c52d98b4c8274ab27c173cfb96f811130889ab5f1d4` | 17 | 5 |
| `catalog-reviewed-enrichment-2026-09-24` | `d038c0335688f487aa7b288fe2ce02d6a9d6e1332189333248c94eff758fb3a1` | 39 | 39 |
| `manufacturer-aliases.2026-09-24` | `f4c4cc7545bf99655b4c9e31b9f0b0839203313f29a623b3f400ce4e10294dcd` | 0 | 2 |

| Manufacturer | Models | Families | Sources | Content checksums unavailable |
|---|---:|---:|---:|---:|
| Dexter | 51 | 9 | 10 | 5 |
| Speed Queen | 30 | 8 | 25 | 14 |
| Electrolux Professional | 120 | 17 | 33 | 26 |
| Maytag Commercial | 47 | 6 | 15 | 15 |
| Huebsch | 8 | 3 | 10 | 8 |
| Continental Girbau | 43 | 10 | 15 | 6 |

Specification field coverage (a field is counted only when its value has approved source evidence):

| Field | Models with a recorded value |
|---|---:|
| widthIn | 156 |
| depthIn | 153 |
| heightIn | 154 |
| weightLb | 116 |
| capacityLb | 148 |
| voltage | 91 |
| phase | 91 |
| fuel | 56 |
| configuration | 125 |

140 models have no recorded numerical measurement or capacity. Missing facts remain unknown; model/type coverage is not specification completeness.

Totals: 6 manufacturers; 299 model variants; 108 sources; 0 serial-date rules.

No verified public serial-year rule was established for the production snapshot. Manufacture year is unknown; model production/generation ranges are a separate field.

Workbook benchmark: 53 distinct model strings; 53 manufacturer/model spellings. Original model strings are retained. Only manufacturer/model values are read into this report; serials and other workbook values are excluded.

Row-weighted coverage: 227 Inventory rows; 106 matched; 121 unsupported; 0 ambiguous.

## exact (7)

| Workbook manufacturer | Workbook model | Pinned revision |
|---|---|---|
| Dexter | WCVD18KCS-12 | dexter-wcvd18kcs-12-r2-reviewed-20260924 |
| Dexter | WCVD25KCS-12 | dexter-wcvd25kcs-12-r2-reviewed-20260924 |
| Dexter | WCVD40KCS-12 | dexter-wcvd40kcs-12-r1 |
| Huebsch | HFNKCASG115TW01 | huebsch-hfnkcasg115tw01-r2 |
| Speed Queen | SCT030 | speed-queen-sct030-r1 |
| Speed Queen | SCT060 | speed-queen-sct060-r2-speedqueen-maytag-20260923 |
| Speed Queen | SCT080 | speed-queen-sct080-r2-speedqueen-maytag-20260923 |

## alias (12)

| Workbook manufacturer | Workbook model | Pinned revision |
|---|---|---|
| Electrolux | T5300S | electrolux-professional-t5300s-r2 |
| Electrolux | T5425S | electrolux-professional-t5425s-r2 |
| Electrolux | W4250S | electrolux-professional-w4250s-r1 |
| Electrolux | W4330S | electrolux-professional-w4330s-r1 |
| Electrolux | W5130S | electrolux-professional-w5130s-r1 |
| Electrolux | W5180S | electrolux-professional-w5180s-r1 |
| Electrolux | W5240H | electrolux-professional-w5240h-r1 |
| Electrolux | W5300H | electrolux-professional-w5300h-r1 |
| Electrolux | W5350X | electrolux-professional-w5350x-r1 |
| Electrolux | W585S | electrolux-professional-w585s-r1 |
| Maytag | MAH21PDDWW | maytag-commercial-mah21pddww-r1 |
| Speedqueen | STT30N | speed-queen-stt30n-r1 |

## ambiguous (0)

| Workbook manufacturer | Workbook model | Pinned revision |
|---|---|---|

## unsupported (34)

| Workbook manufacturer | Workbook model | Pinned revision |
|---|---|---|
| Continental | DDAG30KCS-65 | — |
| Dexter | DDAD30KCS-65EC | — |
| Dexter | DDAD30KCW-65 | — |
| Dexter | DDAD50KCS-65 | — |
| Dexter | DDAD50KCS-65EC | — |
| Dexter | DJ2X3AA | — |
| Dexter | DJX3AA | — |
| Dexter | DL2X300 | — |
| Dexter | DL2X30Q | — |
| Dexter | DL2X30QA | — |
| Dexter | DL2X30QSS | — |
| Dexter | DLX30QSS | — |
| Dexter | WC0300XA-10EC2X-SSBCS-USX | — |
| Dexter | WCAD25KCS-12ECSZ | — |
| Dexter | WCAD40KCB-12US | — |
| Dexter | WCAD45KCS-12ECSZ | — |
| Dexter | WCAD75KCS-12EC | — |
| Electrolux | SP135P2325SNANNUSA | — |
| Maytag | MLG27PDBWW1 | — |
| Speed Queen | SC20BC20U60001 | — |
| Speed Queen | SC20BY20U60001 | — |
| Speed Queen | SC30BY20U60001 | — |
| Speed Queen | SC35MD20U40420 | — |
| Speed Queen | SC40BY20U60001 | — |
| Speed Queen | SC60BCFXU60001 | — |
| Speed Queen | SC60BY20U60001 | — |
| Speed Queen | SCT020QCAFXU400000 | — |
| Speed Queen | SCT030QCAFXU400000 | — |
| Speed Queen | ST075NBCB1G1N05 | — |
| Speed Queen | ST075NCDB1G1N04 | — |
| Speed Queen | ST075NCDB1G1Q03 | — |
| Speed Queen | STT30NBCB2G2N02 | — |
| Speed Queen | STT30NBCB2GN02 | — |
| Speedqueen | SBCB2G1W01 | — |

## Unresolved Inventory strings

These strings remain unsupported because family-only or secondary-source evidence does not authorize an exact variant or alias. See [current source research](unmatched-inventory-model-research-2026-09-23.md) for the reviewed disposition and next evidence request.

Reviewed dispositions: 28 Official family-only; 6 No defensible official match.

| Manufacturer | Inventory model | Rows | Runtime status | Evidence disposition |
|---|---|---:|---|---|
| Continental | DDAG30KCS-65 | 2 | unsupported | No defensible official match |
| Dexter | DDAD30KCS-65EC | 9 | unsupported | Official family-only |
| Dexter | DDAD30KCW-65 | 4 | unsupported | Official family-only |
| Dexter | DDAD50KCS-65 | 1 | unsupported | Official family-only |
| Dexter | DDAD50KCS-65EC | 3 | unsupported | Official family-only |
| Dexter | DJ2X3AA | 1 | unsupported | No defensible official match |
| Dexter | DJX3AA | 1 | unsupported | No defensible official match |
| Dexter | DL2X300 | 2 | unsupported | Official family-only |
| Dexter | DL2X30Q | 2 | unsupported | Official family-only |
| Dexter | DL2X30QA | 2 | unsupported | Official family-only |
| Dexter | DL2X30QSS | 8 | unsupported | Official family-only |
| Dexter | DLX30QSS | 1 | unsupported | No defensible official match |
| Dexter | WC0300XA-10EC2X-SSBCS-USX | 1 | unsupported | Official family-only |
| Dexter | WCAD25KCS-12ECSZ | 12 | unsupported | Official family-only |
| Dexter | WCAD40KCB-12US | 1 | unsupported | Official family-only |
| Dexter | WCAD45KCS-12ECSZ | 5 | unsupported | Official family-only |
| Dexter | WCAD75KCS-12EC | 2 | unsupported | Official family-only |
| Electrolux | SP135P2325SNANNUSA | 1 | unsupported | No defensible official match |
| Maytag | MLG27PDBWW1 | 1 | unsupported | Official family-only |
| Speed Queen | SC20BC20U60001 | 4 | unsupported | Official family-only |
| Speed Queen | SC20BY20U60001 | 6 | unsupported | Official family-only |
| Speed Queen | SC30BY20U60001 | 3 | unsupported | Official family-only |
| Speed Queen | SC35MD20U40420 | 4 | unsupported | Official family-only |
| Speed Queen | SC40BY20U60001 | 3 | unsupported | Official family-only |
| Speed Queen | SC60BCFXU60001 | 1 | unsupported | Official family-only |
| Speed Queen | SC60BY20U60001 | 1 | unsupported | Official family-only |
| Speed Queen | SCT020QCAFXU400000 | 2 | unsupported | Official family-only |
| Speed Queen | SCT030QCAFXU400000 | 7 | unsupported | Official family-only |
| Speed Queen | ST075NBCB1G1N05 | 4 | unsupported | Official family-only |
| Speed Queen | ST075NCDB1G1N04 | 2 | unsupported | Official family-only |
| Speed Queen | ST075NCDB1G1Q03 | 2 | unsupported | Official family-only |
| Speed Queen | STT30NBCB2G2N02 | 21 | unsupported | Official family-only |
| Speed Queen | STT30NBCB2GN02 | 1 | unsupported | Official family-only |
| Speedqueen | SBCB2G1W01 | 1 | unsupported | No defensible official match |

## Official source registry

### Dexter

- dexter-d01: [Model Identification](https://www.dexter.com/upl/downloads/library/dexter-model-identification.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: 945b7e850fe05aefd468e69b0ee3368d7ab7ad5b3522425a1ec54293b2d28bde.
- dexter-d02: [Technical Information — Vended](https://www.dexter.com/support/technical-information/?industry=vended). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- dexter-d03: [Dexter Laundry — Vended Catalog](https://www.dexter.com/downloads/0995-134-001-Catalog-Vended-LR.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: c0a01045359cc2a269c3a64d62ed83837eb28b1118198fea0133cd5b112baa40.
- dexter-d04: [T-600 WCVD Coin Washer Parts — No Stop Button](https://www.dexter.com/upl/downloads/products/vended/documents/t-600-wcvd-coin-washer-parts-no-stop-button.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: 8c0015193579e4324a265fab15d46a7dba7ecbabd47d78f7c71e2899cfb13e3f.
- dexter-d05: [Common 30LB Stack Dryer Parts](https://www.dexter.com/upl/downloads/VENDED-30LB-STACK-DRYER-PARTS.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- dexter-d06: [T-1800 Express O-Series Washer Specifications](https://www.dexter.com/upl/downloads/products/documents/69d66b1b5e087257812e0.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: Rev - 04/01/2026; content checksum: 28b96ef01ed1db0e0fe3d4a68796b895c322e5f922fb6070afb00948e1a7c288.
- dexter-d07: [T-170 Express 6-Cycle Dryer Specifications](https://www.dexter.com/upl/downloads/products/documents/68228e5157fc302778bf6.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: Rev - 05/01/2025; content checksum: 51165655a78ff158eb92dc71bc1142e35836f237a17e5b1b1456b2369215b53f.
- dexter-reviewed-segotw-wcvd-20260924: [Dexter WCVD specifications, distributor copy](https://www.segotw.com/laundry/dexterv.pdf). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- dexter-reviewed-123laundry-wcvd18-20260924: [Dexter WCVD18KCS-12 product overview](https://www.123laundryshop.com/dexter-t300-commercial-front-load-washing-machine-model-wcvd18kcs-12sz-serial-no-20405000470482/). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- dexter-reviewed-123laundry-wcvd25-20260924: [Dexter WCVD25KCS-12 product overview](https://www.123laundryshop.com/dexter-t-400-commercial-front-load-washer-model-wcvd25kcs-12-serial-no-20401000467048/). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).

### Speed Queen

- speed-queen-sq01: [Literature Archive](https://speedqueencommercial.com/en-us/manuals-brochures/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- speed-queen-sq02: [Hardmount Washer-Extractor — Commercial](https://speedqueencommercial.com/en-us/products/hardmount-washer-extractor-commercial/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- speed-queen-sq03: [Hardmount Washer-Extractor — Laundromats](https://speedqueencommercial.com/en-us/products/hardmount-washer-extractor-laundromats/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- speed-queen-sq04: [Softmount Washer-Extractor — Commercial](https://speedqueencommercial.com/en-us/products/softmount-washer-extractor-commercial/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- speed-queen-sq05: [Softmount Washer-Extractor — Laundromats](https://speedqueencommercial.com/en-us/products/softmount-washer-extractor-laundromats/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- speed-queen-sq06: [Stack Tumble Dryers — Commercial](https://speedqueencommercial.com/en-us/products/stack-tumble-dryers-commercial/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- speed-queen-sq07: [Stacked Washer-Extractor/Tumble Dryers — Laundromats](https://speedqueencommercial.com/en-us/products/stacked-washer-extractor-tumble-dryers-laundromats/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- speed-queen-sq08: [Power On. Profit More.](https://go.speedqueencommercial.com/power-on-profit-more). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- speed-queen-sq09: [On Premises Quantum Washer-Extractor Specifications](https://speedqueencommercial.com/SpeedQueenCommercial/media/SpeedQueen/Product20Brochures/AO18-0036_OPL_HardmountWX_Brochure.pdf?ext=.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: 5280cdc47735feef17c809ab48f6463dfee00dbda075a0c5bd09fba07ddd49df.
- speed-queen-sq10: [SCT020 Specification Sheet](https://speedqueencommercial.com/wp-content/uploads/2019/10/DL_AM19-0050_SpecSheet_SCT020_en-US.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: eebab7e4a2b844db5a8ad29cc7ec07ec57f4ea49a2046472ebf80353624a8adc.
- speed-queen-sq11: [SCT030 Specification Sheet](https://speedqueencommercial.com/wp-content/uploads/2019/10/DL_AM19-0051_SpecSheet_SCT030_en-US.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: 0478e866799a8a6244cb6bedf490250006029c95abc36a43e57df805481ab68e.
- speed-queen-sq12: [OPL Classic STT30 Specification Sheet](https://speedqueencommercial.com/wp-content/uploads/2019/10/DL_AO19-0008_SpecSheet_OPL_Classic_STT30_en-US.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: 703731933298430cbd77ab01d087740d1cedc99268890e688649b1444a812eb6.
- speed-queen-sq13: [Vended Tumble Dryer — Stack 30/45 lb](https://speedqueencommercial.com/SpeedQueenCommercial/media/SpeedQueen/Product20Brochures/AC18-0007_SQ_Vend_TumbleDryer_Stack30-45lb_Brochure.pdf?ext=.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: 1b5a6eded56a94b52a27293a194ce2da07213b57914e61434bba75cf54ef6f57.
- speed-queen-sq14: [Vended Tumble Dryer — 25/55 lb](https://speedqueencommercial.com/SpeedQueenCommercial/media/SpeedQueen/Product20Brochures/AC18-0005_Vend_TumbleDryer_25-55lb_Brochure.pdf?ext=.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: 484f7d1aeee86d26c92c8634f1f1b951d14f6f64cfe3340da3bc02ab76c5f0aa.
- speed-queen-sq15: [Vended Tumble Dryer — 50/75 lb](https://speedqueencommercial.com/SpeedQueenCommercial/media/SpeedQueen/Product20Brochures/AC18-0006_Vend_TumbleDryer_50-75lb_Brochure.pdf?ext=.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: b5cd285ba2cb10c52e42c9d20575ef3a326bb07c5872bb8bde6f226018c6287d.
- speed-queen-sq16: [OPL Premium ST075 Specification Sheet](https://speedqueencommercial.com/wp-content/uploads/sites/37/2019/10/DL_AO19-0028_SpecSheet_OPL_Premium_ST075_en-US.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: 36faa8925df65b6a378935118ede66ad0477232cfb0e54a0f3130a1a7d497ada.
- speed-queen-sq17: [Quantum Stacked Washer-Extractor/Tumble Dryer Specification](https://speedqueencommercial.com/SpeedQueenCommercial/media/SpeedQueen/Product20Brochures/DL_AM19-0067_SpecSheet_QT-SWXTD_en-US.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: c3a822ce3ac069ff0f13ee69c9b67372dc1f719c5f64c64942914f3184e3f082.
- speed-queen-sq18: [OPL Small Chassis Brochure](https://speedqueencommercial.com/SpeedQueenCommercial/media/SpeedQueen/Product20Brochures/AO18-0003_OPL_SmallChassis_Brochure.pdf?ext=.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: 9bd1d8ae23dce5a5a94542d7a892288bf78ffbf21a511ff5bd40603dc4fbfa5d.
- speed-queen-sq19: [Vended Construction Drawing and Utility Schedule](https://speedqueencommercial.com/en-us/wp-content/uploads/2020/02/sq-vended-construction-drawing.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: d16ca959f8633bed8de27b52ba622a6fff34ea7af1037b3c0fb9dafba6167b4d.
- speed-queen-enrichment-sct040: [Speed Queen SCT040 Hardmount Washer-Extractor Specification Sheet](https://distribution.alliancelaundry.com/wp-content/uploads/2023/08/DL_AO21-0042_SpecSheet_SCT040_en-US.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- speed-queen-enrichment-sct060: [Speed Queen SCT060 Hardmount Washer-Extractor Specification Sheet](https://distribution.alliancelaundry.com/wp-content/uploads/2023/08/DL_AO21-0043_SpecSheet_SCT060_en-US.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- speed-queen-enrichment-sct080: [Speed Queen SCT080 Hardmount Washer-Extractor Specification Sheet](https://distribution.alliancelaundry.com/wp-content/uploads/2023/08/DL_AO21-0044_SpecSheet_SCT080_en-US.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- speed-queen-enrichment-sct100: [Speed Queen SCT100 Hardmount Washer-Extractor Specification Sheet](https://distribution.alliancelaundry.com/wp-content/uploads/2023/08/DL_AO21-0045_SpecSheet_SCT100_en-US.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- speed-queen-enrichment-vended-construction: [Speed Queen Vended Construction Drawing](https://speedqueencommercial.com/en-us/wp-content/uploads/2020/02/sq-vended-construction-drawing.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- speedqueen-reviewed-stt55-20260924: [STT55 exact model specification sheet](https://alliancelaundrysystems.widen.net/s/ln6fl6gc7c/dl_am25-0052_specsheet_stt55_en-us). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).

### Electrolux Professional

- electrolux-ep01: [Washer/Dryer/Wash-Dryer Error Code Search](https://www.electroluxprofessional.com/jp/download/errorsearch/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-ep02: [Compact Washers and Dryers](https://www.electroluxprofessional.com/us/commercial-laundry-equipment/compact-washers-dryers/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-ep03: [WH6-8 Front-Load Washer](https://www.electroluxprofessional.com/commercial-laundry-equipment/commercial-washers/front-load-washer-8-kg-wh6-8-WH6-8/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-ep04: [TD6-20 Tumble Dryer](https://www.electroluxprofessional.com/commercial-laundry-equipment/tumble-dryers/tumble-dryer-20-kg-td6-20-TD6-20/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-ep05: [TD6-24S Stacked Tumble Dryer](https://www.electroluxprofessional.com/pd/tumble-dryers/stacked-dryers/stacked-tumble-dryer-24-kg-td6-24s/TD6-24S/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-ep06: [Facility Management Range Overview 2017](https://www.electroluxprofessional.com/gb/wp-content/uploads/2017/05/Facility-Management-Range-Overview-2017.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: ceed06fb3976c1804db9c71850a8efa45153abf989a34f650f7da597d3cabedc.
- electrolux-ep07: [Self-Service Laundry](https://www.electroluxprofessional.com/tr/wp-content/uploads/2017/11/Self-Service-Laundry_ENG_lo.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: 8783723ea46feae0032f3de7828435f8b1bc7d7dadbcde31f4fad3172fc4bbf3.
- electrolux-ep08: [W5130S Product Data Sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PS_438919504EN_W5130S_EN.pdf?version=1611895834). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: 99d6d758d3e427b845aef961aacc5e42cea9353fdd5c49d693e3fc01ab89f991.
- electrolux-ep09: [W5350X Product Data Sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PS_438919532ES_W5350X_ES.pdf?version=1615090024). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: ecbe743372fa977ec8f6562d54e741202c4f052439e007c0c0589548a47c14c5.
- electrolux-ep10: [W4330S Clarus Control Product Data Sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PS_438919525EN_W4330S_Clarus%20Control_EN.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: d4bbf52f16cdbbec3b167c4093a401e4e063504aee9bdc0ad94120470f2052df.
- electrolux-ep11: [W465H/N/S–W4330H/N/S Compass Installation Manual](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/IN/IN_438903721_W465H_N_S-W4330H_N_S_Compass_EN.pdf?version=1669838892). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: a429626b3046d83940c13293ef925e75ae25a507350682621be3ede53cf96093.
- electrolux-enrichment-ep06-2026-09-23: [Facility Management Range Overview 2017 — exact model specification tables](https://www.electroluxprofessional.com/gb/wp-content/uploads/2017/05/Facility-Management-Range-Overview-2017.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: ceed06fb3976c1804db9c71850a8efa45153abf989a34f650f7da597d3cabedc.
- electrolux-enrichment-t5300s-2026-09-23: [T5300S product datasheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PS_438919518EN_T5300S_EN.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official manufacturer datasheet reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-wh6-8-20260924: [WH6-8 product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PDS_WH6-8_438908681_EN.pdf?version=1731414469). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-wh6-11-20260924: [WH6-11 product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PDS_WH6-11_438908682_EN.pdf). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-wh6-14-20260924: [WH6-14 product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PDS_WH6-14_438908683_EN.pdf?version=1691501101). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-wh6-20-20260924: [WH6-20 product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PDS_WH6-20_438908684_EN.pdf). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-wh6-27-20260924: [WH6-27 product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PDS_WH6-27_438908685_EN.pdf?version=1703910787). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-wn6-8-20260924: [WN6-8 product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PS_438908941EN_WN6-8%20Compass%20Pro_EN.pdf?version=1614372242). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-wn6-11-20260924: [WN6-11 product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PS_438908943EN_WN6-11%20Compass%20Pro_EN.pdf). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-wn6-20-20260924: [WN6-20 product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PDS_WN6-20_438908945_EN.pdf?version=1728881324). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-ws6-11-20260924: [WS6-11 product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PDS_WS6-11_438918012_EN.pdf?version=1716679012). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-ws6-14-20260924: [WS6-14 product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PDS_WS6-14_438918013_EN.pdf?version=1753391523). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-ws6-20-20260924: [WS6-20 product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PS_438918014EN_WS6-20%20Compass%20Pro_EN.pdf). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-ws6-28-20260924: [WS6-28 product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PDS_WS6-28_438918015_EN.pdf?version=1765143039). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-ws6-35-20260924: [WS6-35 product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PS_438918016EN_WS6-35%20Compass%20Pro_EN.pdf?version=1612401841). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-wh6-33-20260924: [WH6 series Compass Pro installation manual](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/IN/IN_WH6-7%2C%20WH6-8%2C%20WH6-11%2C%20WH6-14%2C%20WH6-20%2C%20WH6-27%2C%20WH6-33_Compass%20Pro_438917550_EN.pdf?version=1778030406). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-td6-7lac-20260924: [TD6-7LAC product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PDS_438913911_Lagoon%20concept_Essential%20set%20TD6-7%20and%20WH6-6_ELS%20US_US.pdf?version=1774281954). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-td6-16-20260924: [TD6-16 product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PDS_TD6-16_438908654_EN.pdf). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-td6-17s-20260924: [TD6-17S product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PS_438908652EN_TD6-17S_EN.pdf). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-td6-20lac-20260924: [TD6-20LAC product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PDS_438913910_Lagoon%20concept_TD6-20%20and%20WH6-20_EN.pdf?version=1698743700). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-td6-24s-20260924: [TD6-24S product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PDS_TD6-24S_438908653_EN.pdf?version=1756292314). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- electrolux-reviewed-td6-30-20260924: [TD6-30 product data sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PDS_TD6-30_438908655_EN.pdf). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).

### Maytag Commercial

- maytag-m01: [Official Product Sitemap](https://www.maytagcommerciallaundry.com/mclstorefront/mcl/en_US/sitemap.xml). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- maytag-m02: [Maytag Vended Multi-Load Washer Brochure](https://www.maytagcommerciallaundry.com/mclstorefront/medias/MY180084-Maytag-MultiLoadWasher-Vended-12Page-Full-Brochure-Final-WCCL255-Rev.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- maytag-m03: [MAT20 Commercial Top-Load Washer](https://www.maytagcommerciallaundry.com/mclstorefront/mat20). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- maytag-m04: [MHN33 Commercial Front-Load Washer](https://www.maytagcommerciallaundry.com/mclstorefront/mhn33). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- maytag-m05: [Stack Laundry Category](https://www.maytagcommerciallaundry.com/mclstorefront/mcl/en_US/category-landing-page/category/stack). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- maytag-m06: [Multi-Load Laundry](https://www.maytagcommerciallaundry.com/mclstorefront/multi-load). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- inventory-maytag-mah21pddww: [Maytag MAH21PDDWW Repair Parts List](https://www.maytag.com/content/dam/global/documents/201102/parts-list-MAH21PDDWW.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- maytag-enrichment-wfr124390: [Maytag Commercial Washer-Extractor Installation Instructions WFR124390J](https://www.whirlpool.com/content/dam/global/documents/202304/installation-instruction-wfr124390-revJ.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- maytag-reviewed-md20-20260924: [MDE20 and MDG20 50 Hz specification sheet](https://www.maytag.com/content/dam/global/documents/202410/my240361_mdeg20mntgwkw_50hz_spec%20sheet_v03.pdf). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- maytag-reviewed-md28-distributor-20260924: [MDE28 and MDG28 distributor specification sheet](https://portalimages.blob.core.windows.net/products/pdfs/anghogsi_MDE28andMDG28-10.5kg-DLSSpecSheet.pdf). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- maytag-reviewed-mle26-mlg26-20260924: [MLE26 and MLG26 dimension guide](https://www.maytag.com/content/dam/global/documents/201505/dimension-guide-MY150073.pdf). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- maytag-reviewed-mle27-mlg27-archive-20260924: [MLE27 and MLG27 archived manufacturer manual](https://device.report/m/7dcabdae24d1b79989e21f0b890e9af4ba483d4aedc04bd64acd2e3c982d930f). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- maytag-reviewed-mdg30-20260924: [MDG30 traditional vended specification sheet](https://www.whirlpool.com/content/dam/global/documents/202105/dimension-guide-my200036-mcl-mdg30-mdg76-traditional-vend-spec-sheet.pdf). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- maytag-reviewed-mdg50-mdg75-20260924: [MDG50 and MDG75 traditional OPL specification sheet](https://www.maytag.com/content/dam/global/documents/202210/my200035-mcl-mdg50-mdg75-traditional-opl-spec-sheet_Revised10.10.22_MV.pdf). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- maytag-reviewed-mdg120-mdg170-20260924: [MDG120 and MDG170 OPL specification sheet](https://www.maytag.com/content/dam/global/documents/202212/dimension-guide-my200034-mdg120-mdg170-opl-spec-sheet-rev-12.22.pdf). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).

### Huebsch

- huebsch-h01: [Products](https://huebsch.com/products/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- huebsch-h02: [Vended Front-Load Washers](https://huebsch.com/product/vended/front-load-washers/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- huebsch-h03: [Commercial Front-Load Washers](https://huebsch.com/product/commercial/commercial-front-load-washers/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- huebsch-h04: [Commercial Stacked Washer/Dryers](https://huebsch.com/product/commercial/commercial-stacked-washer-dryers/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- huebsch-h05: [Vended Single Tumble Dryers](https://huebsch.com/product/vended/single-tumble-dryers/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- huebsch-h06: [Vended Stack & Single Tumble Dryer Specifications](https://huebsch.com/wp-content/uploads/2021/10/DL_AH21-0137_SpecSheet_TumbleDryers_en-US.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: e6f133bebc9ebc27280d547edf41e8f0a2698923ae1dce19e683c283a88bdaa2.
- huebsch-h07: [Vended Front-Load Washer Specification — Alliance viewer](https://alliancelaundrysystems.widen.net/s/vff7rgg8ks). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- huebsch-h08: [OPL Stacked Washer/Dryer Specification — Alliance viewer](https://alliancelaundrysystems.widen.net/s/wnvdzgqdt2). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- inventory-huebsch-806117: [Huebsch 806117 Parts Manual](https://docs.alliancelaundry.com/tech_pdf/partsservice/806117.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: 806117R14; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- huebsch-enrichment-ah18-0025-2026-09-23: [Vended Front Load Washer — Galaxy 600 specifications](https://docs.alliancelaundry.com/adv_pdf/AH18-0025_Vended%20Front%20Load%20Washer.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: AH18-0025; content checksum: 6da218e3a534a05386f5253b58c409ae4cde0e6d490eef2355da97ec6fee31b8.

### Continental Girbau

- continental-c01: [Equipment Manuals](https://continental-laundry.com/services-support/technical-service/equipment-manuals/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- continental-c02: [GS Commercial Washers](https://continental-laundry.com/products/commercial-washers/gs-washers/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- continental-c03: [Commercial Dryers](https://continental-laundry.com/products/commercial-dryers/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- continental-c04: [Continental Unveils CA-Series Dryer Line](https://continental-laundry.com/news/continental-unveils-new-competitively-positioned-ca-series-dryer-line-with-larger-capacities-and-flexible-configurations/). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: unavailable (Official source reviewed through public document extraction; source bytes were not retained for a content checksum.).
- continental-c05: [Genius OPL Brochure](https://continental-laundry.com/wp-content/uploads/2023/10/GeniusOPLBrochure.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: not stated; content checksum: 79b663abe52051a22873034b7a968d5647d4167baa393b26b1518aca3ecd5952.
- continental-c06: [ExpressWash E-Series Washer-Extractors Product Specifications](https://continental-laundry.com/wp-content/uploads/2023/10/ExpressWashBrochure.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: Form No. B-CW-EH020-130 04/26; content checksum: 4f3488f3e079f31b07edbcff605734641695bd9e402e94e56ad903219e6ba0ec.
- continental-c07: [EH070 E-Series Soft-Mount Washer-Extractor Product Specifications](https://continental-laundry.com/wp-content/uploads/2024/04/EH070A-OPL.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: COMMERCIAL 08/25; content checksum: b83c93d9350def1328efc4766d179afdbf158432aa598683a8f8519ab1b72709.
- continental-c08: [GS023 Genius Series Soft-Mount Washer-Extractor Product Specifications](https://continental-laundry.com/wp-content/uploads/2023/10/GS023A.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: COMMERCIAL 08/25; content checksum: f7874b8961e1742f929765b45a5e957b764c25e6489c6055d95fc0a8a3f104ef.
- continental-c09: [REM025 On-Premise Hard-Mount Washer-Extractor Product Specifications](https://continental-laundry.com/wp-content/uploads/2024/01/REM025A-SLS.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: r1 03/16; content checksum: 412e356e35717b473da7e8b187e7e629624d1defa4aef2d7eb8493de5fc5ac03.
- continental-c10: [RMG033 G-Flex Hard-Mount Washer-Extractor Product Specifications](https://continental-laundry.com/wp-content/uploads/2025/05/RMG033A-PTC.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: 08/25; content checksum: 1ae09706db80ebbd311210796b084bd6150985b9ba507e26a2c56cfb9ff1825c.
- continental-c11: [RMG040 G-Flex Hard-Mount Washer-Extractor Product Specifications](https://continental-laundry.com/wp-content/uploads/2025/05/RMG040A-PTC.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: 08/25; content checksum: 00ca191bba06ec6e3c13f51856be4ea0d8a6232fe3ed979291b40c9726be121e.
- continental-c12: [RMG055 G-Flex Hard-Mount Washer-Extractor Product Specifications](https://continental-laundry.com/wp-content/uploads/2025/05/RMG055A-PTC.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: 08/25; content checksum: addfd6f50fa532c5dd3333cda24b8cfb64a37cd0197329d09d254553377248cc.
- continental-c13: [RMG070 G-Flex Hard-Mount Washer-Extractor Product Specifications](https://continental-laundry.com/wp-content/uploads/2023/10/RMG070A-OPL.pdf). Retrieved 2026-09-23T00:00:00.000Z; document revision: COMMERCIAL 08/25; content checksum: 170f0a99f036a5dcc6bb7ed827f1ceddf86a489ffc394c7ec4e1e3ad5ede5241.
- continental-reviewed-kwn-20260924: [EconoWash A Vended, KWN product specifications](https://continental-laundry.com/wp-content/uploads/2024/01/EconoWashA-Vended.pdf). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).
- continental-reviewed-eh190-eh255-20260924: [OPL E Series large washer brochure, EH190 and EH255](https://continental-laundry.com/wp-content/uploads/2023/10/OPL-E-SeriesLgWashBro.pdf). Retrieved 2026-09-24T07:00:00.000Z; document revision: not stated; content checksum: unavailable (Reviewed through public document extraction; source bytes were not retained for a content checksum.).

See [source research](AUT-352-source-research.md) for family-only evidence and unresolved variants. Family-only strings remain unsupported in the resolver until exact official evidence is approved.
