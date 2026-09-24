# Reviewed manufacturer nameplate aliases — 2026-09-24

The 92 reviewed nameplates contained these manufacturer labels. The Catalog
delta maps each label to an existing canonical manufacturer; counts represent
nameplates, not additional alias records.

| Nameplate label | Count | Canonical manufacturer |
| --- | ---: | --- |
| `THE DEXTER COMPANY` | 36 | Dexter |
| `DEXTER LAUNDRY, INC.` | 10 | Dexter |
| `THE DEXTER CO` | 2 | Dexter |
| `Continental Girbau, Inc.` | 44 | Continental Girbau |
| **Total** | **92** | |

The approved alias records also include the reviewed punctuation forms
`THE DEXTER COMPANY.`, `DEXTER LAUNDRY, INC`, `DEXTER LAUNDRY INC.`,
`THE DEXTER CO.`, `Continental Girbau, Inc`, and
`Continental Girbau Inc.`. Case and whitespace normalization follows the
existing exact Catalog rule. Punctuation is represented by explicit aliases.

Ambiguous corporate-parent identities, similar spellings, other legal names,
and model strings remain excluded. The delta contains no model revision and
reuses the approved official source identities from the original snapshot.

Verify with `npm test -w @simply-clean/api -- --run test/catalog.coverage.test.ts test/catalog.test.ts`.
