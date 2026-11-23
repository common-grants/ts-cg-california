// Derived from agilesix/cg-api-ca. Copyright (c) 2026 Agile Six Applications, Inc.
// MIT licensed upstream material; see LICENSE.upstream-MIT and NOTICE.md.
import { z } from "zod";
import {
  definePlugin,
  TransformError,
  type ToCommon,
  type FromCommon,
} from "@common-grants/sdk/extensions";
import {
  AdditionalInfoValueSchema,
  AgencyValueSchema,
  CaStringListSchema,
  ContactInfoValueSchema,
  CostSharingValueSchema,
} from "./fields.js";
import { CaGrantSchema, type CaSource, type CaGrant } from "./caSource.js";
import { caGrantToOpportunity, caOpportunityToGrant, parseFinancial } from "./transform.js";

/**
 * CA custom-field specifications, hoisted to a `const` so the same object can
 * be passed to `definePlugin()` **and** referenced by the `ToCommon` /
 * `FromCommon` helper types below. `as const` keeps the `fieldType` literals
 * narrow (per the SDK extensions guide).
 *
 * Extends the base CG `Opportunity` schema with:
 *
 *   - Ecosystem-shared fields (`agency`, `contactInfo`, `additionalInfo`,
 *     `costSharing`) whose value schemas are identical to the grants.gov / PA
 *     plugins — values under these keys are interoperable across plugins per
 *     https://commongrants.org/custom-fields/.
 *   - CA-specific fields (`caPortalId`, `caCategories`, `caFundingSource`,
 *     etc.) for data that has no ecosystem equivalent. The `ca` prefix marks
 *     the namespace; migrate to a shared key if/when one lands upstream.
 */
const caCustomFields = {
  caSourceRecord: {
    fieldType: "object",
    value: CaGrantSchema,
    description:
      "Original sanitized source record for exact lossless round trips; absent means reverse conversion cannot promise fidelity.",
  },
  // --- shared with grants.gov / PA -------------------------------------
  agency: {
    fieldType: "object",
    value: AgencyValueSchema,
    description: "Information about the agency offering this opportunity",
  },
  contactInfo: {
    fieldType: "object",
    value: ContactInfoValueSchema,
    description: "Contact information (name, email, phone, description) for this resource",
  },
  additionalInfo: {
    fieldType: "object",
    value: AdditionalInfoValueSchema,
    description: "URL and description for additional information about the opportunity",
  },
  costSharing: {
    fieldType: "object",
    value: CostSharingValueSchema,
    description: "Cost sharing or matching requirement for the opportunity",
  },

  // --- cross-source shared (unprefixed; defined identically in the PA plugin)
  // Open-ended labels whose meaning is equivalent across state sources, so the
  // key is shared rather than `pa*`/`ca*`-prefixed. Candidates to upstream into
  // the commongrants.org custom-field catalog.
  fundingSource: {
    fieldType: "string",
    description:
      'Where the funding originates (e.g. "State", "Federal", "Federal and State", "Other")',
  },
  fundingInstrument: {
    fieldType: "string",
    description: 'The funding instrument type (e.g. "Grant", "Loan")',
  },
  lastSyncedAt: {
    fieldType: "string",
    value: z.string().datetime(),
    description: "ISO 8601 datetime when this record was last ingested from its source system",
  },

  // --- CA-specific -----------------------------------------------------
  caPortalId: {
    fieldType: "string",
    description: "California's Grants Portal identifier (the stable source key)",
  },
  caGrantId: {
    fieldType: "string",
    description: "California's internal grant identifier, when assigned (often absent)",
  },
  caCategories: {
    fieldType: "array",
    value: CaStringListSchema,
    description: "California's category taxonomy (the source `Categories` list, split)",
  },
  caLoi: {
    fieldType: "boolean",
    description: "Whether a Letter of Intent (LOI) is required before applying",
  },
  caApplicantTypeNotes: {
    fieldType: "string",
    description:
      "Free-text notes clarifying applicant eligibility (the standard applicant types are on the native `acceptedApplicantTypes` field)",
  },
  caGeography: {
    fieldType: "string",
    description: "Geographic scope or restrictions for the opportunity",
  },
  caFundingSourceNotes: {
    fieldType: "string",
    description: "Free-text notes about the funding source",
  },
  caFundingMethod: {
    fieldType: "string",
    description: 'How funds are disbursed (e.g. "Reimbursement(s)", "Advance(s)")',
  },
  caFundingMethodNotes: {
    fieldType: "string",
    description: "Free-text notes about the funding method",
  },
  caEstAwards: {
    fieldType: "string",
    description: "CA estimate of the number of awards (free-form text)",
  },
  caEstAmountsRaw: {
    fieldType: "string",
    description:
      "Original `EstAmounts` range string preserved verbatim (the numeric range is also exposed via `funding.min/maxAwardAmount` when parseable)",
  },
  caRawEstAvailFunds: {
    fieldType: "string",
    description:
      "Original `EstAvailFunds` string preserved when the value could not be parsed into a numeric amount",
  },
  caAwardPeriod: {
    fieldType: "string",
    description: 'CA award/performance period (free-form, e.g. "Expires 3/31/29")',
  },
  caExpAwardDate: {
    fieldType: "string",
    description: 'CA expected award date (free-form, e.g. "November 2026")',
  },
  caElecSubmission: {
    fieldType: "string",
    description: "Electronic submission instructions / address",
  },
  caAwardStats: {
    fieldType: "string",
    description: "CA statistics about prior awards, when published",
  },
  caCategorySuggestion: {
    fieldType: "string",
    description: "Suggested category provided by the source, when present",
  },
  caChangeNotes: {
    fieldType: "string",
    description: "CA-provided notes describing the latest change to the record",
  },
  caSubscribeUrl: {
    fieldType: "string",
    description: "URL to subscribe to updates from the issuing agency",
  },
  caGrantEventsUrl: {
    fieldType: "string",
    description: "URL for grant-related events (webinars, info sessions)",
  },
} as const;

/**
 * Type parameters shared by the `toCommon` / `fromCommon` helper annotations.
 * Type-level inputs only; no runtime schema is referenced here, which keeps
 * this module free of a `plugin ⇄ transform` import cycle.
 */
type CaTransform = {
  model: "Opportunity";
  sourceSchema: typeof CaGrantSchema;
  customFields: typeof caCustomFields;
};

/**
 * Source → CommonGrants. A thin wrapper over the pure `caGrantToOpportunity`
 * mapper. **No validation here on purpose:** `definePlugin()` wraps this
 * callable with `commonSchema` validation, folding any Zod issues into
 * `TransformResult.errors`.
 */
const toCommon: ToCommon<CaTransform> = source => {
  const checked = CaGrantSchema.safeParse(source);
  if (!checked.success)
    throw new TransformError("Invalid California source record", {
      path: checked.error.issues[0]?.path.join(".") ?? "source",
    });
  source = checked.data;
  const normalized = Object.fromEntries(
    Object.entries(source).map(([k, v]) => [k, v === null ? "" : v])
  ) as CaGrant;
  normalized.PortalID = String(source.PortalID);
  const result = caGrantToOpportunity(normalized, new Date().toISOString());
  result.customFields = {
    ...result.customFields,
    caSourceRecord: { name: "caSourceRecord", fieldType: "object", value: structuredClone(source) },
  };
  return { result: result as unknown as CaOpportunity, errors: [] };
};

function stable(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ":" + stable(v))
      .join(",")}}`;
  return JSON.stringify(value);
}

function mapSource(raw: CaSource, timestamp: string) {
  const normalized = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v === null ? "" : v])
  ) as CaGrant;
  normalized.PortalID = String(raw.PortalID);
  return CaOpportunitySchema.parse(caGrantToOpportunity(normalized, timestamp));
}
function semantic(value: CaOpportunity) {
  const copy = structuredClone(value);
  if (copy.customFields) {
    delete (copy.customFields as Record<string, unknown>).caSourceRecord;
    delete (copy.customFields as Record<string, unknown>).lastSyncedAt;
  }
  return copy;
}
// These source columns also have a native CommonGrants view. A single edited
// view is authoritative; two conflicting edits fail rather than losing either.
const mirrored = [
  { column: "EstAmounts", field: "caEstAmountsRaw" },
  { column: "AwardPeriod", field: "caAwardPeriod" },
  { column: "ExpAwardDate", field: "caExpAwardDate" },
] as const;
type MirroredColumn = (typeof mirrored)[number]["column"];
type NativeView = { min?: unknown; max?: unknown } | object | null;

function cfValueOf(opp: CaOpportunity, field: (typeof mirrored)[number]["field"]) {
  return opp.customFields?.[field]?.value;
}

function nativeView(opp: CaOpportunity, column: MirroredColumn): NativeView {
  if (column === "EstAmounts")
    return {
      min: opp.funding?.minAwardAmount ?? null,
      max: opp.funding?.maxAwardAmount ?? null,
    };
  return (
    opp.keyDates?.otherDates?.[column === "AwardPeriod" ? "awardPeriod" : "expectedAwardDate"] ??
    null
  );
}

function nativeText(view: NativeView, column: MirroredColumn): string {
  const fail = () => {
    throw new TransformError("CommonGrants value has no lossless California representation", {
      path: column === "EstAmounts" ? "funding" : "keyDates",
    });
  };
  if (!view) return "";
  if (column === "EstAmounts") {
    const { min, max } = view as {
      min?: { amount?: unknown; currency?: unknown };
      max?: { amount?: unknown; currency?: unknown };
    };
    function cash(amount: typeof min) {
      if (amount == null) return null;
      if (
        typeof amount.amount !== "string" ||
        amount.currency !== "USD" ||
        !parseFinancial(amount.amount)
      )
        return fail();
      return "$" + amount.amount;
    }
    const low = cash(min),
      high = cash(max);
    return low && high ? `${low} to ${high}` : low ? `At least ${low}` : (high ?? "");
  }
  const event = view as { eventType?: unknown; details?: unknown };
  if (event.eventType !== "other" || typeof event.details !== "string" || !event.details.trim())
    return fail();
  return event.details;
}

function copyNative(opp: CaOpportunity, rebuilt: CaOpportunity, column: MirroredColumn) {
  if (column === "EstAmounts") {
    if (opp.funding && rebuilt.funding) {
      opp.funding.minAwardAmount = rebuilt.funding.minAwardAmount;
      opp.funding.maxAwardAmount = rebuilt.funding.maxAwardAmount;
    } else if (!opp.funding) opp.funding = rebuilt.funding;
    else if (!rebuilt.funding) {
      opp.funding.minAwardAmount = null;
      opp.funding.maxAwardAmount = null;
      if (
        opp.funding.totalAmountAvailable == null &&
        opp.funding.minAwardCount == null &&
        opp.funding.maxAwardCount == null &&
        opp.funding.estimatedAwardCount == null
      )
        opp.funding = null;
    }
    return;
  }
  const key = column === "AwardPeriod" ? "awardPeriod" : "expectedAwardDate";
  const next = rebuilt.keyDates?.otherDates?.[key];
  if (!opp.keyDates) opp.keyDates = rebuilt.keyDates;
  else {
    const dates = { ...opp.keyDates.otherDates };
    if (next) dates[key] = next;
    else delete dates[key];
    opp.keyDates.otherDates = Object.keys(dates).length ? dates : null;
    if (
      !opp.keyDates.otherDates &&
      !opp.keyDates.postDate &&
      !opp.keyDates.closeDate &&
      !rebuilt.keyDates
    )
      opp.keyDates = null;
  }
}

const fromCommon: FromCommon<CaTransform> = common => {
  const raw = common.customFields?.caSourceRecord?.value;
  const timestamp = String(common.customFields?.lastSyncedAt?.value ?? new Date().toISOString());
  const canonical = caOpportunityToGrant(common as unknown as CaOpportunityInput);
  let result: CaSource = canonical;
  let baseline: CaOpportunity | undefined;
  const reconcile: {
    pair: (typeof mirrored)[number];
    nativeChanged: boolean;
    rawChanged: boolean;
  }[] = [];
  if (raw) {
    baseline = mapSource(raw, timestamp);
    if (stable(semantic(baseline)) === stable(semantic(common)))
      return { result: structuredClone(raw), errors: [] };
    const before = caOpportunityToGrant(baseline as unknown as CaOpportunityInput);
    result = structuredClone(raw);
    for (const key of Object.keys(canonical))
      if (stable(canonical[key]) !== stable(before[key])) result[key] = canonical[key];
  }
  for (const pair of mirrored) {
    const next = nativeView(common, pair.column);
    const previous = baseline ? nativeView(baseline, pair.column) : null;
    const nativeChanged = baseline
      ? stable(next) !== stable(previous)
      : pair.column === "EstAmounts"
        ? !!(common.funding?.minAwardAmount || common.funding?.maxAwardAmount)
        : next !== null;
    const rawChanged = baseline
      ? stable(cfValueOf(common, pair.field)) !== stable(cfValueOf(baseline, pair.field))
      : cfValueOf(common, pair.field) !== undefined;
    if (nativeChanged && !rawChanged) result[pair.column] = nativeText(next, pair.column);
    if (nativeChanged || rawChanged) reconcile.push({ pair, nativeChanged, rawChanged });
  }
  const parsed = CaGrantSchema.safeParse(result);
  if (!parsed.success)
    throw new TransformError("CommonGrants cannot be represented as a California source record", {
      path: "source",
    });
  const rebuilt = mapSource(parsed.data, timestamp);
  const expected = semantic(common),
    actual = semantic(rebuilt);
  for (const { pair, nativeChanged, rawChanged } of reconcile) {
    if (!rawChanged) {
      const fields = (expected.customFields ??= {}) as Record<string, unknown>;
      const mirror = rebuilt.customFields?.[pair.field];
      if (mirror) fields[pair.field] = mirror;
      else delete fields[pair.field];
    }
    if (!nativeChanged) copyNative(expected, rebuilt, pair.column);
  }
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    if (
      stable((expected as unknown as Record<string, unknown>)[key]) !==
      stable((actual as unknown as Record<string, unknown>)[key])
    )
      throw new TransformError("CommonGrants value has no lossless California representation", {
        path: key,
      });
  }
  return { result: parsed.data, errors: [] };
};

/**
 * The California CommonGrants plugin. SDK v0.9 `definePlugin()` owns the schema
 * extension **and** the bidirectional transforms + source schema (see ADR 005).
 */
export const CaPlugin = definePlugin({
  meta: {
    name: "ca-grants",
    version: "0.1.0",
    sourceSystem: "ca-grants-portal",
    capabilities: ["customFields", "transforms", "customFilters"],
  },
  routes: {
    opportunities: {
      search: {
        filters: {
          agency: { filterType: "stringArray", description: "Issuing agency department names" },
          categories: { filterType: "stringArray", description: "California category labels" },
          applicantType: {
            filterType: "stringArray",
            description: "California source applicant type labels",
          },
        },
      },
    },
  },
  schemas: {
    Opportunity: {
      customFields: caCustomFields,
      sourceSchema: CaGrantSchema,
      toCommon,
      fromCommon,
    },
  },
} as const);

/** The CG Opportunity Zod schema extended with CA custom fields. */
export const CaOpportunitySchema = CaPlugin.schemas.Opportunity.commonSchema;

/** Inferred TypeScript type for a CA-flavored Opportunity (output shape — dates as `Date`). */
export type CaOpportunity = z.infer<typeof CaOpportunitySchema>;

/**
 * The **input** type of the CA-extended Opportunity schema — the plain JSON
 * shape before Zod applies its `.transform()` steps (dates as strings). The
 * pure mappers in `./transform` produce and consume this shape.
 */
export type CaOpportunityInput = Omit<z.input<typeof CaOpportunitySchema>, "customFields"> & {
  customFields?: Record<
    string,
    {
      name: string;
      fieldType: "string" | "object" | "array" | "boolean" | "integer" | "number";
      value: unknown;
    }
  > | null;
};
