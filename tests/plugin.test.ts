import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CaPlugin, CaGrantSchema } from "../src/index.js";
const rows = JSON.parse(
  readFileSync(new URL("../fixtures/public-sanitized.json", import.meta.url), "utf8")
);
function check(row: unknown) {
  const source = CaGrantSchema.parse(row);
  const out = CaPlugin.schemas.Opportunity.toCommon(source);
  expect(out.errors).toEqual([]);
  expect(out.result).toBeDefined();
  const back = CaPlugin.schemas.Opportunity.fromCommon(out.result!);
  expect(back.errors).toEqual([]);
  expect(back.result).toEqual(source);
  expect(source).toEqual(row);
}
describe("real sanitized CKAN rows", () => {
  for (const row of rows) it(`round trip ${row.PortalID}`, () => check(row));
});
describe("fidelity variants", () => {
  for (const [field, values] of Object.entries({
    Purpose: ["<p>Original purpose</p>", "  whitespace  "],
    Description: ["<b>HTML</b>", ""],
    Status: ["ACTIVE", "Unexpected status"],
    ChangeNotes: ["N/A", null],
    EstAvailFunds: ["$001,000.00", "Not specified", null],
    LOI: ["YES", "Maybe", null],
    GrantURL: ["not a URL", ""],
    Categories: ["A;B;  A", ""],
    ApplicantType: ["Other; Unknown", ""],
    OpenDate: ["not a date", ""],
    ContactInfo: ["", null],
  }))
    for (const value of values)
      it(`${field}=${String(value)}`, () => check({ ...rows[0], [field]: value }));
  it("retains unknown JSON fields", () =>
    check({ ...rows[0], FutureColumn: { nested: ["a", null, 1] } }));
  it("retains null vs empty", () => check({ ...rows[0], GrantID: null, Geography: "" }));
  it("requires a lossless source record", () => {
    const out = CaPlugin.schemas.Opportunity.toCommon(rows[0]);
    delete out.result!.customFields!.caSourceRecord;
    expect(CaPlugin.schemas.Opportunity.fromCommon(out.result!).result.PortalID).toBe(
      String(rows[0].PortalID)
    );
  });
  it("does not mutate source", () => {
    const row = structuredClone(rows[0]);
    const out = CaPlugin.schemas.Opportunity.toCommon(row);
    out.result!.customFields!.caSourceRecord.value.Title = "changed";
    expect(row).toEqual(rows[0]);
  });
});

it("preserves CG title edits", () => {
  const out = CaPlugin.schemas.Opportunity.toCommon(rows[0]);
  out.result.title = "Edited";
  expect(CaPlugin.schemas.Opportunity.fromCommon(out.result).result.Title).toBe("Edited");
});
it("round trips serialized CommonGrants output", () => {
  const out = CaPlugin.schemas.Opportunity.toCommon(rows[0]);
  const common = CaPlugin.schemas.Opportunity.commonSchema.parse(
    JSON.parse(JSON.stringify(out.result))
  );
  expect(CaPlugin.schemas.Opportunity.fromCommon(common).result).toEqual(rows[0]);
});
it("retains string PortalID", () => check({ ...rows[0], PortalID: String(rows[0].PortalID) }));
it("retains omitted optional CKAN id", () => {
  const row = { ...rows[0] };
  delete row._id;
  check(row);
});
it("rejects malformed required identity", () =>
  expect(() => CaGrantSchema.parse({ ...rows[0], PortalID: "" })).toThrow());
