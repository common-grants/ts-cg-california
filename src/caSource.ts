// Derived from agilesix/cg-api-ca. Copyright (c) 2026 Agile Six Applications, Inc.
// MIT licensed upstream material; see LICENSE.upstream-MIT and NOTICE.md.
import { z } from "zod";

/**
 * Preserve null and empty-string distinctions for CKAN text fields. California's Grants Portal is
 * published through a CKAN DataStore resource (`datastore_search`); almost
 * every column is typed `text` and missing values arrive as `null`
 * (e.g. `GrantID`, `Geography`, `FundingSource`, `EstAvailFunds`). The
 * transform layer already treats `""` as absent via `nullIfEmpty()`, so
 * normalization happens only on the forward mapper copy, never the source snapshot.
 */
const caStr = z.string().nullable();

/**
 * Zod schema + TypeScript type for a raw California grant record as returned
 * by the CKAN DataStore.
 *
 * Observed shape from
 * `GET https://data.ca.gov/api/3/action/datastore_search?resource_id=111c8c88-…`
 * (probed 2026-06):
 *
 *   - `PortalID` is the stable business key — unique and non-null across all
 *     ~1,942 records. We use it as the source identifier (PA's `slug` analog).
 *   - `_id` is CKAN's internal row id (integer). It is NOT stable across a
 *     re-import of the resource, so we never key on it.
 *   - All other columns are free-form `text`; missing values are `null`.
 *   - Datetimes are space-separated, timezone-naive
 *     (`"2026-06-22 17:20:00"`) — NOT ISO 8601. The transform layer converts
 *     them (see `caDateToIso` / `splitCaDateTime`).
 *   - Several columns are `;`-delimited lists (`Categories`, `ApplicantType`).
 *   - `MatchingFunds` is a percentage string (`"35%"`) or `"Not Required"`.
 *   - `EstAmounts` is a free-form range (`"Between $5,000 and $375,000"`).
 *   - `ContactInfo` is a structured `key: value;` string
 *     (`"name: Example Contact; email: contact@example.invalid; tel: 202-555-0100;"`).
 *
 * `.passthrough()` lets unknown columns through — CKAN resources can gain
 * columns and we shouldn't fail validation on forward-compatible additions.
 */
export const CaGrantSchema = z
  .object({
    // Internal CKAN row id — present but never used as a key.
    _id: z.number().int().optional(),

    // --- identity / lifecycle -------------------------------------------
    PortalID: z.union([z.string().min(1), z.number().int().nonnegative()]),
    GrantID: caStr,
    Status: caStr,
    LastUpdated: z.string(),
    ChangeNotes: caStr,

    // --- descriptive ----------------------------------------------------
    AgencyDept: caStr,
    Title: caStr,
    Type: caStr,
    LOI: caStr,
    Categories: caStr,
    CategorySuggestion: caStr,
    Purpose: caStr,
    Description: caStr,

    // --- eligibility ----------------------------------------------------
    ApplicantType: caStr,
    ApplicantTypeNotes: caStr,
    Geography: caStr,

    // --- funding --------------------------------------------------------
    FundingSource: caStr,
    FundingSourceNotes: caStr,
    MatchingFunds: caStr,
    MatchingFundsNotes: caStr,
    EstAvailFunds: caStr,
    EstAwards: caStr,
    EstAmounts: caStr,
    FundingMethod: caStr,
    FundingMethodNotes: caStr,

    // --- dates ----------------------------------------------------------
    OpenDate: caStr,
    ApplicationDeadline: caStr,
    AwardPeriod: caStr,
    ExpAwardDate: caStr,

    // --- application / links / contact ----------------------------------
    ElecSubmission: caStr,
    GrantURL: caStr,
    AgencyURL: caStr,
    AgencySubscribeURL: caStr,
    GrantEventsURL: caStr,
    ContactInfo: caStr,
    AwardStats: caStr,
  })
  .passthrough();

export type CaSource = z.infer<typeof CaGrantSchema>;
export type CaGrant = { [K in keyof CaSource]: Exclude<CaSource[K], null> } & { PortalID: string };

/**
 * CKAN `datastore_search` response envelope. We only model the fields the
 * client reads; everything else (`fields`, `total_estimation_threshold`, …)
 * is ignored. The records array is parsed per-row by {@link CaGrantSchema}.
 */
export const CkanDatastoreResponseSchema = z.object({
  success: z.boolean(),
  result: z.object({
    records: z.array(CaGrantSchema),
    total: z.number().optional(),
    limit: z.number().optional(),
    _links: z
      .object({
        start: z.string().optional(),
        next: z.string().optional(),
      })
      .optional(),
  }),
});

export type CkanDatastoreResponse = z.infer<typeof CkanDatastoreResponseSchema>;
