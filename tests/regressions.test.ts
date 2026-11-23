import { describe, it, expect } from "vitest";
import { parseFinancial, parseAmountRange, parseMatchingFunds } from "../src/transform.js";
import { CaPlugin } from "../src/index.js";
import { readFileSync } from "node:fs";
const rows = JSON.parse(
  readFileSync(new URL("../fixtures/public-sanitized.json", import.meta.url), "utf8")
);
describe("conservative currency parsing", () => {
  it("rejects negatives", () => {
    expect(parseFinancial("-500")).toBeNull();
    expect(parseAmountRange("-$500").max).toBeNull();
  });
  it("does not invent a number from prose", () =>
    expect(parseFinancial("2026 funding TBD")).toBeNull());
  it("handles billions", () => {
    expect(parseFinancial("$5 billion")?.amount).toBe("5000000000.00");
    expect(parseAmountRange("Up to $5 billion").max?.amount).toBe("5000000000.00");
  });
  it("rejects unknown units", () => expect(parseFinancial("$5 trillion")).toBeNull());
  it("keeps ordinary values", () => {
    expect(parseFinancial("$1,500,000.00")?.amount).toBe("1500000.00");
    expect(parseFinancial("$2 million")?.amount).toBe("2000000.00");
  });
});
describe("cost sharing", () => {
  it("parses 12.5%", () =>
    expect(parseMatchingFunds("12.5%")).toEqual({ isRequired: true, percentage: 12.5 }));
  it("round trips 12.5% without rounding", () => {
    const row = { ...rows[0], MatchingFunds: "12.5%" };
    const out = CaPlugin.schemas.Opportunity.toCommon(row);
    const back = CaPlugin.schemas.Opportunity.fromCommon(out.result!);
    expect(back.result.MatchingFunds).toBe("12.5%");
  });
});

describe("award range grammar", () => {
  it.each([
    "$5 trillion",
    "-  $500",
    "$1,2,3",
    "$0.001",
    "$500 to $1",
    "$1k and -$5",
    "2026 grant: $500",
  ])("preserves undecidable %s without a fabricated amount", raw => {
    expect(parseAmountRange(raw)).toEqual({ min: null, max: null });
  });
  it.each(["$1,2,3", "$1.001", "$1e9"])("rejects malformed single amount %s", raw =>
    expect(parseFinancial(raw)).toBeNull()
  );
  it("parses complete inclusive bounds and exact money", () => {
    expect(parseAmountRange("Between $5,000 and $375,000")).toMatchObject({
      min: { amount: "5000.00" },
      max: { amount: "375000.00" },
    });
    expect(parseAmountRange("At least $1.125k")).toMatchObject({
      min: { amount: "1125.00" },
      max: null,
    });
    expect(parseFinancial("$5.000000001 billion")?.amount).toBe("5000000001.00");
  });
});

describe("editable CommonGrants mirrors", () => {
  const round = (raw: Record<string, unknown>) =>
    CaPlugin.schemas.Opportunity.toCommon({ ...rows[0], ...raw }).result!;
  const from = (cg: ReturnType<typeof round>) => CaPlugin.schemas.Opportunity.fromCommon(cg).result;
  it("applies award bound edits while keeping original unrelated source fields", () => {
    const cg = round({ EstAmounts: "Between $50 and $75" });
    cg.funding!.minAwardAmount = { amount: "55.00", currency: "USD" };
    expect(from(cg)).toEqual({ ...rows[0], EstAmounts: "$55.00 to $75.00" });
  });
  it("accepts an edited raw range and refreshes its unedited native mirror", () => {
    const cg = round({ EstAmounts: "Between $50 and $75" });
    cg.customFields!.caEstAmountsRaw!.value = "Up to $500";
    expect(from(cg).EstAmounts).toBe("Up to $500");
  });
  it("rejects contradictory native and raw award ranges", () => {
    const cg = round({ EstAmounts: "Between $50 and $75" });
    cg.funding!.minAwardAmount = { amount: "55.00", currency: "USD" };
    cg.customFields!.caEstAmountsRaw!.value = "Up to $500";
    expect(() => from(cg)).toThrow(/lossless/);
  });
  it("round-trips native award date and period details", () => {
    const cg = round({ AwardPeriod: "Six months", ExpAwardDate: "October 2027" });
    const other = cg.keyDates!.otherDates!;
    Object.assign(other.awardPeriod!, { details: "Eight months" });
    Object.assign(other.expectedAwardDate!, { details: "November 2027" });
    expect(from(cg)).toEqual({
      ...rows[0],
      AwardPeriod: "Eight months",
      ExpAwardDate: "November 2027",
    });
  });
  it("preserves and edits a contact description without silently dropping it", () => {
    const cg = round({ ContactInfo: "team: Grants Office; hours: weekdays;" });
    cg.customFields!.contactInfo!.value.description = "team: Grants Office; hours: weekends";
    expect(from(cg).ContactInfo).toBe("team: Grants Office; hours: weekends;");
  });
});

it("accepts compatible changes to both amount views", () => {
  const cg = CaPlugin.schemas.Opportunity.toCommon({
    ...rows[0],
    EstAmounts: "Between $50 and $75",
  }).result!;
  cg.funding!.minAwardAmount = { amount: "55.00", currency: "USD" };
  cg.customFields!.caEstAmountsRaw!.value = "Between $55 and $75";
  expect(CaPlugin.schemas.Opportunity.fromCommon(cg).result.EstAmounts).toBe("Between $55 and $75");
});

describe("cost sharing bounds", () => {
  it("only accepts 0-100%", () => {
    expect(parseMatchingFunds("100%")).toEqual({ isRequired: true, percentage: 100 });
    expect(parseMatchingFunds("150%")).toBeNull();
  });
  it("rejects an edited cost share outside 0-100 instead of writing it back", () => {
    const out = CaPlugin.schemas.Opportunity.toCommon({ ...rows[0], MatchingFunds: "10%" });
    const common = out.result!;
    common.customFields!.costSharing!.value.percentage = 150;
    expect(() => CaPlugin.schemas.Opportunity.fromCommon(common)).toThrow();
  });
});

describe("native open and close date edits", () => {
  it("writes an edited close date back to ApplicationDeadline and keeps the time", () => {
    const out = CaPlugin.schemas.Opportunity.toCommon(rows[0]);
    const common = out.result!;
    common.keyDates!.closeDate!.date = new Date("2027-02-03");
    const back = CaPlugin.schemas.Opportunity.fromCommon(common);
    expect(back.result.ApplicationDeadline).toBe("2027-02-03 15:00:00");
    expect(back.result.OpenDate).toBe(rows[0].OpenDate);
  });
  it("accepts an edited open date delivered as a serialized string", () => {
    const out = CaPlugin.schemas.Opportunity.toCommon(rows[0]);
    const wire = JSON.parse(JSON.stringify(out.result));
    wire.keyDates.postDate.date = "2026-11-20";
    const common = CaPlugin.schemas.Opportunity.commonSchema.parse(wire);
    const back = CaPlugin.schemas.Opportunity.fromCommon(common);
    expect(back.result.OpenDate).toBe("2026-11-20 23:00:00");
  });
});
