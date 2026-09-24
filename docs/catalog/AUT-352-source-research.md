# AUT-352 official-source research

Research snapshot: 2026-09-23

This document is an implementation input for AUT-352, not the final Catalog seed. It records only facts that were publicly documented by the six manufacturers. It does not infer aliases, option-code meanings, production dates, or serial-number dates.

## Result summary

- Official model/product/manual sources recorded: **54**
- Distinct inventory manufacturer/model strings classified: **53**
- Exact official matches: **17**
- Official family match, full variant not verified: **28**
- Unsupported or ambiguous: **8**
- Public manufacturer serial-number-to-manufacture-year rules found: **0**
- Explicit model-generation year ranges found: Electrolux Professional only

An `exact` classification means the complete inventory model identifier, or an official base model identifier where the inventory value is itself only that base identifier, appears in an official source. `Family-only` means the official source supports the family or prefix, but not the complete option-coded inventory string. `Unsupported/ambiguous` means no defensible official match was found or a tempting correction would require inference.

## Field legend

The source registry uses these field markers:

- `C`: capacity
- `D`: dimensions
- `W`: weight
- `U`: utilities or electrical/gas configuration
- `Y`: explicit production/generation year range
- `S`: public serial-number-to-manufacture-year rule
- `yes`: explicitly documented in that source
- `varies`: source is an index whose linked documents vary
- `extract`: the official PDF/viewer must be extracted before recording the field
- `no`: not established by that source

Publication dates, revision dates, copyright dates, service-parts serial cutovers, and the existence of a serial-number search box are not production ranges or serial-year rules.

## Official source registry

### Dexter — 5 sources

| ID | Official document or page | Verified models/families and equipment | C | D | W | U | Y | S |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| D01 | [Model Identification](https://www.dexter.com/upl/downloads/library/dexter-model-identification.pdf) | Current washers: WC C-Series; WN V 6-Cycle, O O-Series, N 30-Cycle. Historical washers: WCND, WCAD, WCVD, WCN, WCA/WCB/WCE/WCK. Current dryers: DC C-Series; DN B/V/O; historical DDAD/DDBD, DL2X30, DLC/DRR/DRC/DTCK/DDH/DRH, DCBD/DCWD/DTCH/DCTD, DSTD. Current SWD: SC C and SN P; historical SCAD/SCVD. Size families: washer T-300/350/400/450/600/650/750/900/950/1200/1450/1800; dryer T-20x2/30/30x2/50/50x2/55/80/120/170; SWD T-350/450/750. | yes | no | no | no | no | no |
| D02 | [Technical Information — Vended](https://www.dexter.com/support/technical-information/?industry=vended) | Current and historical family index. Current vended washers T-300 through T-1800 as listed in D01; stack dryers T-20x2/T-30x2/T-50x2; single dryers T-30/T-50/T-80/T-120; SWD T-350/T-450/T-750. Historical A-Series WCAD/DDAD/DDBD/DCBD/DCWD/DCTD, V-Series WCVD, N-Series WCN/DL2X30, and pre-1990 families. | varies | varies | varies | varies | no | no |
| D03 | [Dexter Laundry — Vended Catalog](https://www.dexter.com/downloads/0995-134-001-Catalog-Vended-LR.pdf) | Current washer families T-300/T-400/T-600/T-900/T-1200 and Express T-350/T-450/T-650/T-750/T-950/T-1450; dryer tables are also included. | yes | yes | yes | yes | no | no |
| D04 | [T-600 WCVD Coin Washer Parts — No Stop Button](https://www.dexter.com/upl/downloads/products/vended/documents/t-600-wcvd-coin-washer-parts-no-stop-button.pdf) | Exact WCVD18KCS-12, WCVD25KCS-12, WCVD40KCS-12 and related WCVD variants; washer. | family | no | no | yes | no | no |
| D05 | [Common 30LB Stack Dryer Parts](https://www.dexter.com/upl/downloads/VENDED-30LB-STACK-DRYER-PARTS.pdf) | DDAD and DL2X30 30-pound stack-dryer families; contains service-parts serial cutovers only. | family | no | no | varies | no | no |

### Speed Queen — 19 sources

| ID | Official document or page | Verified models/families and equipment | C | D | W | U | Y | S |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| SQ01 | [Literature Archive](https://speedqueencommercial.com/en-us/manuals-brochures/) | Official index for current and historical washer, dryer, stack-dryer, and stacked washer/dryer literature. | varies | varies | varies | varies | no | no |
| SQ02 | [Hardmount Washer-Extractor — Commercial](https://speedqueencommercial.com/en-us/products/hardmount-washer-extractor-commercial/) | Current commercial hardmount washer-extractors, 20/30/40/60/80-pound capacities. | yes | linked | linked | linked | no | no |
| SQ03 | [Hardmount Washer-Extractor — Laundromats](https://speedqueencommercial.com/en-us/products/hardmount-washer-extractor-laundromats/) | Current laundromat hardmount washer-extractors, 20/30/40/60/80/100-pound capacities. | yes | linked | linked | linked | no | no |
| SQ04 | [Softmount Washer-Extractor — Commercial](https://speedqueencommercial.com/en-us/products/softmount-washer-extractor-commercial/) | Current commercial softmount washer-extractors, 20/25/30/40/55/70-pound capacities. | yes | linked | linked | linked | no | no |
| SQ05 | [Softmount Washer-Extractor — Laundromats](https://speedqueencommercial.com/en-us/products/softmount-washer-extractor-laundromats/) | Current laundromat softmount washer-extractors, 20/30/40/55/70-pound capacities. | yes | linked | linked | linked | no | no |
| SQ06 | [Stack Tumble Dryers — Commercial](https://speedqueencommercial.com/en-us/products/stack-tumble-dryers-commercial/) | Current 30- and 55-pound commercial stack tumble dryers. | yes | linked | linked | linked | no | no |
| SQ07 | [Stacked Washer-Extractor/Tumble Dryers — Laundromats](https://speedqueencommercial.com/en-us/products/stacked-washer-extractor-tumble-dryers-laundromats/) | Current 30- and 50-pound stacked washer-extractor/tumble dryers. | yes | linked | linked | linked | no | no |
| SQ08 | [Power On. Profit More.](https://go.speedqueencommercial.com/power-on-profit-more) | Public current-product promotion naming SCT020/SCT030/SCT040/SCT060/SCT080/SCT100, STT30/STT55, and ST075. | family | no | no | no | no | no |
| SQ09 | [On Premises Quantum Washer-Extractor Specifications](https://speedqueencommercial.com/SpeedQueenCommercial/media/SpeedQueen/Product20Brochures/AO18-0036_OPL_HardmountWX_Brochure.pdf?ext=.pdf) | SC20/SC30/SC40/SC60/SC80/SC100 hardmount washer-extractors. | yes | yes | yes | yes | no | no |
| SQ10 | [SCT020 Specification Sheet](https://speedqueencommercial.com/wp-content/uploads/2019/10/DL_AM19-0050_SpecSheet_SCT020_en-US.pdf) | SCT020 hardmount washer-extractor. | yes | yes | yes | yes | no | no |
| SQ11 | [SCT030 Specification Sheet](https://speedqueencommercial.com/wp-content/uploads/2019/10/DL_AM19-0051_SpecSheet_SCT030_en-US.pdf) | SCT030 hardmount washer-extractor. | yes | yes | yes | yes | no | no |
| SQ12 | [OPL Classic STT30 Specification Sheet](https://speedqueencommercial.com/wp-content/uploads/2019/10/DL_AO19-0008_SpecSheet_OPL_Classic_STT30_en-US.pdf) | STT30 stack tumble dryer. | yes | yes | yes | yes | no | no |
| SQ13 | [Vended Tumble Dryer — Stack 30/45 lb](https://speedqueencommercial.com/SpeedQueenCommercial/media/SpeedQueen/Product20Brochures/AC18-0007_SQ_Vend_TumbleDryer_Stack30-45lb_Brochure.pdf?ext=.pdf) | STT30 and STT45 stack tumble dryers. | yes | yes | yes | yes | no | no |
| SQ14 | [Vended Tumble Dryer — 25/55 lb](https://speedqueencommercial.com/SpeedQueenCommercial/media/SpeedQueen/Product20Brochures/AC18-0005_Vend_TumbleDryer_25-55lb_Brochure.pdf?ext=.pdf) | ST025/ST030/ST035/ST055 single tumble dryers. | yes | yes | yes | yes | no | no |
| SQ15 | [Vended Tumble Dryer — 50/75 lb](https://speedqueencommercial.com/SpeedQueenCommercial/media/SpeedQueen/Product20Brochures/AC18-0006_Vend_TumbleDryer_50-75lb_Brochure.pdf?ext=.pdf) | 50- and 75-pound single tumble-dryer variants. | yes | yes | yes | yes | no | no |
| SQ16 | [OPL Premium ST075 Specification Sheet](https://speedqueencommercial.com/wp-content/uploads/sites/37/2019/10/DL_AO19-0028_SpecSheet_OPL_Premium_ST075_en-US.pdf) | ST075 single tumble dryer. | yes | yes | yes | yes | no | no |
| SQ17 | [Quantum Stacked Washer-Extractor/Tumble Dryer Specification](https://speedqueencommercial.com/SpeedQueenCommercial/media/SpeedQueen/Product20Brochures/DL_AM19-0067_SpecSheet_QT-SWXTD_en-US.pdf) | SST30 and SST50 stacked washer-extractor/tumble dryers. | yes | yes | yes | yes | no | no |
| SQ18 | [OPL Small Chassis Brochure](https://speedqueencommercial.com/SpeedQueenCommercial/media/SpeedQueen/Product20Brochures/AO18-0003_OPL_SmallChassis_Brochure.pdf?ext=.pdf) | Front-load washer, top-load washer, single dryer, stack dryer, and stacked washer/dryer small-chassis families; exact SKU table requires PDF extraction. | yes | yes | yes | yes | no | no |
| SQ19 | [Vended Construction Drawing and Utility Schedule](https://speedqueencommercial.com/en-us/wp-content/uploads/2020/02/sq-vended-construction-drawing.pdf) | Exact SCN020WCF/SCN030WCF/SCN040WCF/SCN060WCF, SWNLN21, STT30N, and STT45N. | family | yes | no | yes | no | no |

### Electrolux Professional — 11 sources

| ID | Official document or page | Verified models/families and equipment | C | D | W | U | Y | S |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| EP01 | [Washer/Dryer/Wash-Dryer Error Code Search](https://www.electroluxprofessional.com/jp/download/errorsearch/) | Official G4000, Line5000, and Line6000 model/type lists and explicit generation year ranges; see the dedicated generation section below. | no | no | no | no | yes | no |
| EP02 | [Compact Washers and Dryers](https://www.electroluxprofessional.com/us/commercial-laundry-equipment/compact-washers-dryers/) | Current Compact Power WP7-6/WP7-7/WP7-8 washers and TD7-7/TD7-8 dryers. | yes | linked | linked | linked | current only | no |
| EP03 | [WH6-8 Front-Load Washer](https://www.electroluxprofessional.com/commercial-laundry-equipment/commercial-washers/front-load-washer-8-kg-wh6-8-WH6-8/) | WH6-8 washer. | yes | yes | linked | linked | no | no |
| EP04 | [TD6-20 Tumble Dryer](https://www.electroluxprofessional.com/commercial-laundry-equipment/tumble-dryers/tumble-dryer-20-kg-td6-20-TD6-20/) | TD6-20 single tumble dryer. | yes | yes | linked | linked | no | no |
| EP05 | [TD6-24S Stacked Tumble Dryer](https://www.electroluxprofessional.com/pd/tumble-dryers/stacked-dryers/stacked-tumble-dryer-24-kg-td6-24s/TD6-24S/) | TD6-24S stacked tumble dryer. | yes | yes | linked | linked | no | no |
| EP06 | [Facility Management Range Overview 2017](https://www.electroluxprofessional.com/gb/wp-content/uploads/2017/05/Facility-Management-Range-Overview-2017.pdf) | Line5000 W555H through W5300H and self-service W575S/W585S/W5105S/W5130S/W5180S/W5250S/W5330S washers. | yes | yes | yes | yes | no | no |
| EP07 | [Self-Service Laundry](https://www.electroluxprofessional.com/tr/wp-content/uploads/2017/11/Self-Service-Laundry_ENG_lo.pdf) | W575S/W5105S/W5130S/W5180S washers, WD5130 wash-dryer, T5300S/T5425S dryers. | varies | extract | extract | extract | no | no |
| EP08 | [W5130S Product Data Sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PS_438919504EN_W5130S_EN.pdf?version=1611895834) | Exact W5130S washer. | yes | yes | yes | yes | no | no |
| EP09 | [W5350X Product Data Sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PS_438919532ES_W5350X_ES.pdf?version=1615090024) | Exact W5350X washer; Spanish-language PDS. | yes | yes | yes | yes | no | no |
| EP10 | [W4330S Clarus Control Product Data Sheet](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/PDS/PS_438919525EN_W4330S_Clarus%20Control_EN.pdf) | Exact W4330S washer. | yes | yes | yes | yes | no | no |
| EP11 | [W465H/N/S–W4330H/N/S Compass Installation Manual](https://tools.electroluxprofessional.com/Mirror/Doc/ELS/IN/IN_438903721_W465H_N_S-W4330H_N_S_Compass_EN.pdf?version=1669838892) | W4250S and related W4 washer family variants. | yes | yes | yes | yes | no | no |

### Maytag Commercial — 6 sources

| ID | Official document or page | Verified models/families and equipment | C | D | W | U | Y | S |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| M01 | [Official Product Sitemap](https://www.maytagcommerciallaundry.com/mclstorefront/mcl/en_US/sitemap.xml) | Publicly indexed groups: MAT20/MAT23/MVW18/MHN33 washers; MYR20/25/30/40/55/65 rigid-mount and MYS20/30/40/55/65 soft-mount washers; MDE18/20/28 and MDG18/20/28 single dryers; MDG30/35/50/51/52/75/76/78/120/170 multi-load dryers; MLE26/27 and MLG26/27/30/31/35/45/52 stack dryers; MLE20/21/22 and MLG20/21/22 stacked washer/dryers. Sitemap presence does not establish current versus historical status. | no | no | no | no | no | no |
| M02 | [Maytag Vended Multi-Load Washer Brochure](https://www.maytagcommerciallaundry.com/mclstorefront/medias/MY180084-Maytag-MultiLoadWasher-Vended-12Page-Full-Brochure-Final-WCCL255-Rev.pdf) | MYR20PD/25PD/30PD/40PD/55PD/65PD rigid and MYS20PD/30PD/40PD/55PD/65PD soft-mount washers. | yes | yes | yes | yes | no | no |
| M03 | [MAT20 Commercial Top-Load Washer](https://www.maytagcommerciallaundry.com/mclstorefront/mat20) | Current MAT20 washer variants and linked specifications. | yes | linked | linked | linked | current only | no |
| M04 | [MHN33 Commercial Front-Load Washer](https://www.maytagcommerciallaundry.com/mclstorefront/mhn33) | Current MHN33 washer and linked MDE28/MDG28 dryer variants. | yes | linked | linked | linked | current only | no |
| M05 | [Stack Laundry Category](https://www.maytagcommerciallaundry.com/mclstorefront/mcl/en_US/category-landing-page/category/stack) | Commercial stack-dryer and stacked washer/dryer category evidence. | varies | linked | linked | linked | no | no |
| M06 | [Multi-Load Laundry](https://www.maytagcommerciallaundry.com/mclstorefront/multi-load) | Current multi-load washer category and linked models/specifications. | varies | linked | linked | linked | current only | no |

### Huebsch — 8 sources

| ID | Official document or page | Verified models/families and equipment | C | D | W | U | Y | S |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| H01 | [Products](https://huebsch.com/products/) | Current categories: vended hardmount and softmount washer-extractors, front/top-load washers, single/stack tumble dryers, stacked washer-extractor/tumble dryers; OPL hardmount/softmount washers and dryers; light-commercial front/top washers, dryers, and stacked washer/dryers. | varies | linked | linked | linked | current only | no |
| H02 | [Vended Front-Load Washers](https://huebsch.com/product/vended/front-load-washers/) | Current 21.5-pound vended front-load washer family, Galaxy 600 control. | yes | linked | linked | linked | current only | no |
| H03 | [Commercial Front-Load Washers](https://huebsch.com/product/commercial/commercial-front-load-washers/) | Current 21.5-pound commercial front-load washer family. | yes | linked | linked | linked | current only | no |
| H04 | [Commercial Stacked Washer/Dryers](https://huebsch.com/product/commercial/commercial-stacked-washer-dryers/) | Current 18- and 21.5-pound stacked washer/dryer families. | yes | linked | linked | linked | current only | no |
| H05 | [Vended Single Tumble Dryers](https://huebsch.com/product/vended/single-tumble-dryers/) | Current 30/55/75/120-pound single tumble dryers. | yes | linked | linked | linked | current only | no |
| H06 | [Vended Stack & Single Tumble Dryer Specifications](https://huebsch.com/wp-content/uploads/2021/10/DL_AH21-0137_SpecSheet_TumbleDryers_en-US.pdf) | HTT30/HTT45 stack tumble dryers and HT050/HT075 single tumble dryers. | yes | yes | yes | yes | no | no |
| H07 | [Vended Front-Load Washer Specification — Alliance viewer](https://alliancelaundrysystems.widen.net/s/vff7rgg8ks) | Official Alliance-hosted front-load washer specification. Exact SKU and fields require binary PDF extraction; search snippets are not evidence. | extract | extract | extract | extract | no | no |
| H08 | [OPL Stacked Washer/Dryer Specification — Alliance viewer](https://alliancelaundrysystems.widen.net/s/wnvdzgqdt2) | Official Alliance-hosted stacked washer/dryer specification. Exact SKU and fields require binary PDF extraction. | extract | extract | extract | extract | no | no |

### Continental Girbau — 5 sources

| ID | Official document or page | Verified models/families and equipment | C | D | W | U | Y | S |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| C01 | [Equipment Manuals](https://continental-laundry.com/services-support/technical-service/equipment-manuals/) | Washers GS023/030/045/060/070/080; EH020/030/040/060/070/080/090/130/190/255; REM025; RMG033/040/055/070; Econo KWN; LG GCWF/GCWL/GCWM/TCWM/CTD. Dryers KT055/075/120/170/200; KTS30/KTT30/KTT45; Econo KD/KSE/KSG; LG GDP/GDL/TLD. Current/historical status is not consistently explicit. | varies | varies | varies | varies | no | no |
| C02 | [GS Commercial Washers](https://continental-laundry.com/products/commercial-washers/gs-washers/) | Current GS023/030/045/060/070/080/090/130 washer-extractors. | yes | linked | linked | linked | current only | no |
| C03 | [Commercial Dryers](https://continental-laundry.com/products/commercial-dryers/) | Current ProDry2+ 30–205-pound and CA-Series 30–170-pound dryer ranges. | yes | linked | linked | linked | current only | no |
| C04 | [Continental Unveils CA-Series Dryer Line](https://continental-laundry.com/news/continental-unveils-new-competitively-positioned-ca-series-dryer-line-with-larger-capacities-and-flexible-configurations/) | CA-Series single dryers 30/50/75/80/115/120/170 and stack dryers 30/45; OPL configurations. | yes | no | no | yes | launch only | no |
| C05 | [Genius OPL Brochure](https://continental-laundry.com/wp-content/uploads/2023/10/GeniusOPLBrochure.pdf) | GS023/030/045/060/070/080 washer-extractors. | yes | yes | yes | yes | no | no |

## Electrolux Professional generation ranges

EP01 explicitly publishes these generation ranges. These ranges apply only to the models listed by that official page and must not be generalized to nearby model strings.

### G4000 — 2007–2013

- Washers: W455, W465, W475, W485, W4105, W4130, W4180, W4240, W4250, W4280, W4300, W4330, W4350, W4400, W4600, W4850, W41100, WE50
- Dryers: PD9, T4130, T4250, T4290, T4300, T4350, T4420, T4530, T4650, T4900, T41200
- Wash-dryers: WD4130, WD4240

### Line5000 — 2013–2019

- Washers: PW9C, Quick Wash, OBUTSU-mini, W555H, W575NSV, W5105H, W5105S, W5105NSV, W5130H, W5130S, W5130N, W5180H, W5180NSV, W5240H, W5250N, W5250S, W5300H, W5330N, W5330S
- Dryers: PD9C, Quick Dry, T5130, T5130 Lagoon, T5190, T5190LE, T5250, T5290, T5300S, T5350, T5350 Lagoon, T5420S, T5425S, T5550, T5675
- Wash-dryers: WD5130, WD5240

### Line6000 — 2019 onward

- Washers: WH6-6, WH6-8, WH6-11, WH6-14, WH6-20, WH6-27, WH6-33, WH6-6LAC, WH6-20LAC; WN6-8, WN6-11, WN6-20; WS6-11, WS6-14, WS6-20, WS6-28, WS6-35
- Dryers: TD6-6, TD6-7, TD6-7LAC, TD6-14, TD6-16, TD6-17S, TD6-20, TD6-20LAC, TD6-24S, TD6-30, TD6-37
- Wash-dryers: WD6-11, WD6-18, and WD6-25 in JC1, JC2, JC2SM, and JO2 variants as listed by EP01

## Inventory-string classification

The original manufacturer spelling and model string are retained. No string below authorizes a normalization or alias by itself.

### Continental — 1 string

| Inventory model string | Classification | Official evidence and constraint |
|---|---|---|
| DDAG30KCS-65 | unsupported/ambiguous | No occurrence in an official Continental source. Its resemblance to Dexter DDAD is not permission to reassign the manufacturer. |

### Dexter — 19 strings

| Inventory model string | Classification | Official evidence and constraint |
|---|---|---|
| DDAD30KCS-65EC | family-only | DDAD A-Series stack-dryer family is official; the full string was not found. A service page exposes DDAD30KCS-65 without `EC`, which does not establish an alias. |
| DDAD30KCW-65 | family-only | DDAD A-Series stack-dryer family is official; full option-coded string not found. |
| DDAD50KCS-65 | family-only | DDAD A-Series stack-dryer family is official; full option-coded string not found. |
| DDAD50KCS-65EC | family-only | DDAD A-Series stack-dryer family is official; full option-coded string not found. |
| DJ2X3AA | unsupported/ambiguous | Not present in the official model-identification document or reviewed technical index. |
| DJX3AA | unsupported/ambiguous | Not present in the official model-identification document or reviewed technical index. |
| DL2X300 | family-only | DL2X30 N-Series stack-dryer family is official; complete variant not found. |
| DL2X30Q | family-only | DL2X30 N-Series stack-dryer family is official; complete variant not found. |
| DL2X30QA | family-only | DL2X30 N-Series stack-dryer family is official; complete variant not found. |
| DL2X30QSS | family-only | DL2X30 N-Series stack-dryer family is official; complete variant not found. |
| DLX30QSS | unsupported/ambiguous | No official match; must not be silently changed to `DL2X30QSS`. |
| WC0300XA-10EC2X-SSBCS-USX | family-only | WC0300 C-Series family is official. A reviewed official document contains WC0300XA-10EC4X, not this full string. |
| WCAD25KCS-12ECSZ | family-only | WCAD A-Series washer family is official. An official inverter matrix contains WCAD25KCS-12 and WCAD25KCS-12SZ, not this full string. |
| WCAD40KCB-12US | family-only | WCAD A-Series washer family is official; complete variant not found. |
| WCAD45KCS-12ECSZ | family-only | WCAD A-Series washer family is official; complete variant not found. |
| WCAD75KCS-12EC | family-only | WCAD A-Series washer family is official; complete variant not found. |
| WCVD18KCS-12 | exact | Exact string in D04; WCVD washer. |
| WCVD25KCS-12 | exact | Exact string in D04; WCVD washer. |
| WCVD40KCS-12 | exact | Exact string in D04; WCVD washer. |

### Electrolux Professional — 11 strings

| Inventory model string | Classification | Official evidence and constraint |
|---|---|---|
| SP135P2325SNANNUSA | unsupported/ambiguous | No official occurrence found. |
| T5300S | exact | Exact dryer model in EP01 and EP07; Line5000, 2013–2019. |
| T5425S | exact | Exact dryer model in EP01 and EP07; Line5000, 2013–2019. |
| W4250S | exact | Exact washer model in the G4000 family documentation/EP11; G4000, 2007–2013. |
| W4330S | exact | Exact washer model in EP10 and G4000 documentation; G4000, 2007–2013. |
| W5130S | exact | Exact washer model in EP01/EP07/EP08; Line5000, 2013–2019. |
| W5180S | exact | Exact washer model in EP06/EP07. EP01 lists W5180H/NSV, so the S variant's evidence comes from the 2017 range/self-service literature rather than that generation list. |
| W5240H | exact | Exact washer model in EP01; Line5000, 2013–2019. |
| W5300H | exact | Exact washer model in EP01/EP06; Line5000, 2013–2019. |
| W5350X | exact | Exact washer model in EP09. No production range was established. |
| W585S | exact | Exact washer model in EP06. No serial-year rule was established. |

### Huebsch — 1 string

| Inventory model string | Classification | Official evidence and constraint |
|---|---|---|
| HFNKCASG115TW01 | family-only | Huebsch front-load washer family/category is official, but the complete SKU was not found in extracted official text. H07 requires direct binary PDF extraction before any stronger conclusion. |

### Maytag Commercial — 2 strings

| Inventory model string | Classification | Official evidence and constraint |
|---|---|---|
| MAH21PDDWW | unsupported/ambiguous | No occurrence in the current official sitemap or other reviewed official source. |
| MLG27PDBWW1 | family-only | Official sitemap/product evidence contains MLG27PDBWW stack dryer. The terminal `1` is undocumented and must not be stripped without manufacturer evidence. |

### Speed Queen — 19 strings

| Inventory model string | Classification | Official evidence and constraint |
|---|---|---|
| SC20BC20U60001 | family-only | Official SC20 hardmount washer family; complete option-coded string not found. |
| SC20BY20U60001 | family-only | Official SC20 hardmount washer family; complete option-coded string not found. |
| SC30BY20U60001 | family-only | Official SC30 hardmount washer family; complete option-coded string not found. |
| SC35MD20U40420 | unsupported/ambiguous | SC35 was not present in the reviewed official SC hardmount line; do not infer from nearby capacities. |
| SC40BY20U60001 | family-only | Official SC40 hardmount washer family; complete option-coded string not found. |
| SC60BCFXU60001 | family-only | Official SC60 hardmount washer family; complete option-coded string not found. |
| SC60BY20U60001 | family-only | Official SC60 hardmount washer family; complete option-coded string not found. |
| SCT020QCAFXU400000 | family-only | Official SCT020 washer model; complete option-coded string not found. |
| SCT030 | exact | Exact official base washer model in SQ08/SQ11. |
| SCT030QCAFXU400000 | family-only | Official SCT030 washer model; complete option-coded string not found. |
| SCT060 | exact | Exact official base washer model in SQ08. |
| SCT080 | exact | Exact official base washer model in SQ08. |
| ST075NBCB1G1N05 | family-only | Official ST075 single-dryer family; complete option-coded string not found. |
| ST075NCDB1G1N04 | family-only | Official ST075 single-dryer family; complete option-coded string not found. |
| ST075NCDB1G1Q03 | family-only | Official ST075 single-dryer family; complete option-coded string not found. |
| STT30NBCB2G2N02 | family-only | Official STT30 stack-dryer family; complete option-coded string not found. |
| STT30NBCB2GN02 | family-only | Official STT30 stack-dryer family; complete option-coded string not found. |
| SBCB2G1W01 | unsupported/ambiguous | Inventory manufacturer spelling is `Speedqueen`; no official exact or defensible family match found. |
| STT30N | exact | Inventory manufacturer spelling is `Speedqueen`; exact official model appears in SQ19. Manufacturer-name normalization is a separate explicit rule. |

### Classification check

| Manufacturer | Exact | Family-only | Unsupported/ambiguous | Total |
|---|---:|---:|---:|---:|
| Continental | 0 | 0 | 1 | 1 |
| Dexter | 3 | 13 | 3 | 19 |
| Electrolux Professional | 10 | 0 | 1 | 11 |
| Huebsch | 0 | 1 | 0 | 1 |
| Maytag Commercial | 0 | 1 | 1 | 2 |
| Speed Queen | 4 | 13 | 2 | 19 |
| **Total** | **17** | **28** | **8** | **53** |

## Public serial-year rules and unavailable facts

No verified public serial-number-to-manufacture-year rule was found for Dexter, Speed Queen, Electrolux Professional, Maytag Commercial, Huebsch, or Continental.

- Dexter exposes serial-number inputs and some parts documents use serial cutovers. Neither is a manufacture-year decoder.
- Electrolux Professional publishes the model-generation ranges above, but no reviewed official source turns an arbitrary serial number into a manufacture year.
- No defensible public serial-year decoder was found for the other four manufacturers.
- Facts missing from the source registry must be stored as unavailable or awaiting PDF extraction, not filled from convention, reseller pages, search snippets, or adjacent models.

## Public-site restrictions and crawl suitability

AUT-352 already forbids runtime crawling. The public-site controls below add manufacturer-specific reasons to use reviewed evidence records rather than automated bulk acquisition.

### Dexter

- [robots.txt](https://www.dexter.com/robots.txt) disallows `/upl/downloads/extranet/`.
- [Terms of Service](https://www.dexter.com/terms-of-service/) permit a limited personal, non-commercial copy and restrict commercial/public copying and reuse.
- Result: do not bulk crawl or copy source bodies into the Catalog. Retain reviewed field facts, URL, title, review date, and checksum where permitted.

### Speed Queen

- [robots.txt](https://speedqueencommercial.com/robots.txt) had no general disallow in the reviewed snapshot.
- [Terms of Use](https://speedqueencommercial.com/en-us/terms-of-use/) limit downloads to constructive marketing/sales of Alliance products and otherwise restrict copying or modification.
- Result: robots permission is not content-reuse permission. Avoid automated bulk copying; use manually reviewed citations and facts.

### Electrolux Professional

- [robots.txt](https://www.electroluxprofessional.com/robots.txt) blocks administrative, search, and query-oriented paths.
- The reviewed regional [Terms and Conditions](https://www.electroluxprofessional.com/au/terms-and-conditions/) restrict access/download to personal, non-commercial use and restrict public/commercial reproduction. Regional applicability must be reviewed before relying on it globally.
- Result: do not crawl restricted/query paths or bulk reproduce content. Treat the regional terms as a caution, not a universal legal conclusion.

### Maytag Commercial

- [robots.txt](https://www.maytagcommerciallaundry.com/robots.txt) includes account/cart/checkout exclusions, `Request-rate: 1/10`, `Crawl-delay: 10`, and `Visit-time: 0400-0845` UTC in the reviewed snapshot.
- [Terms of Use](https://www.maytagcommerciallaundry.com/mclstorefront/mcl/en_US/terms-of-use) expressly prohibit automated systems used to scrape, harvest, copy, or monitor Platform content and prohibit commercial copying.
- Result: automated crawling is inappropriate. Only manually reviewed, necessary official evidence should be recorded.

### Huebsch

- [robots.txt](https://huebsch.com/robots.txt) had no general disallow in the reviewed snapshot.
- [Terms of Use](https://huebsch.com/terms-of-use/) limit downloads to constructive marketing/sales and otherwise restrict copying or modification.
- Result: avoid automated bulk copying; use reviewed field facts and citations.

### Continental Girbau

- [robots.txt](https://continental-laundry.com/robots.txt) disallows `/wp-content/uploads/wpforms/`; no broader crawl restriction was found in the reviewed snapshot.
- [Terms & Conditions](https://continental-laundry.com/terms-conditions/) are sales terms; no site-automation clause was identified in the reviewed document.
- Result: absence of a discovered automation clause is not permission to crawl. Follow AUT-352's no-crawl requirement and ingest only reviewed evidence.

## Implementation guardrails

1. Store sources/evidence separately from catalog facts and inventory-match dispositions.
2. Preserve the raw inventory manufacturer and model strings exactly.
3. Do not convert `family-only` into an alias. An alias requires explicit manufacturer evidence or separately approved curation.
4. Do not silently repair `DLX30QSS` to `DL2X30QSS`, `DDAG` to `DDAD`, or strip option suffixes such as `EC` or terminal `1`.
5. Use explicit unavailable states for missing capacity, dimensions, weight, utilities, production range, and serial-year rules.
6. Keep PDF extraction provenance: official URL, document title, page/table location, retrieval date, and checksum.
7. Do not treat sitemap inclusion as current-product status, or document publication/revision dates as production ranges.
8. Any future source refresh should be supervised and reviewed; no production request path may crawl a manufacturer site.
