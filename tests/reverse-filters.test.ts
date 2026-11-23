import { it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { F, FilterError, TransformError } from "@common-grants/sdk/extensions";
import { CaPlugin } from "../src/index.js";
const rows = JSON.parse(
  readFileSync(new URL("../fixtures/public-sanitized.json", import.meta.url), "utf8")
);
const fresh = () => CaPlugin.schemas.Opportunity.toCommon(rows[0]).result;
afterEach(() => vi.unstubAllGlobals());
it("preserves untouched raw data while applying title edits", () => {
  const cg = fresh();
  cg.title = "Changed";
  const raw = CaPlugin.schemas.Opportunity.fromCommon(cg).result;
  expect(raw).toEqual({ ...rows[0], Title: "Changed" });
});
it("applies description edits without discarding separate Purpose", () => {
  const cg = fresh();
  cg.description = "Changed prose";
  const raw = CaPlugin.schemas.Opportunity.fromCommon(cg).result;
  expect(raw.Description).toBe("Changed prose");
  expect(raw.Purpose).toBe(rows[0].Purpose);
});
it("source-less supported record remains semantically equivalent", () => {
  const cg = fresh();
  delete cg.customFields!.caSourceRecord;
  const out = CaPlugin.schemas.Opportunity.fromCommon(cg);
  expect(out.errors).toEqual([]);
  const again = CaPlugin.schemas.Opportunity.toCommon(out.result);
  expect(again.errors).toEqual([]);
  expect(again.result.title).toEqual(cg.title);
});
it("unrepresentable id edit produces typed redacted error", () => {
  const cg = fresh();
  cg.id = "00000000-0000-4000-8000-000000000000";
  try {
    CaPlugin.schemas.Opportunity.fromCommon(cg);
    throw Error("expected failure");
  } catch (e) {
    expect(e).toBeInstanceOf(TransformError);
    expect((e as TransformError).path).toBe("id");
    expect((e as TransformError).sourceValue).toBeUndefined();
  }
});
it("unrepresentable extra top-level field is rejected rather than lost", () => {
  const cg = { ...fresh(), extraTopLevel: "do not discard" };
  expect(() => CaPlugin.schemas.Opportunity.fromCommon(cg)).toThrow(TransformError);
});
it("registered filters reject wrong operator before network", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const client = CaPlugin.getClient({ baseUrl: "https://example.invalid" });
  await expect(
    client.opportunities.search({ filters: { agency: F.eq("Agency") } } as never)
  ).rejects.toBeInstanceOf(FilterError);
  expect(fetch).not.toHaveBeenCalled();
});
it("registered array filters are placed in the customFilters request bucket", async () => {
  let body: { filters: Record<string, unknown> } = { filters: {} };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      body = JSON.parse(init.body);
      return new Response("{}", { status: 500 });
    })
  );
  const client = CaPlugin.getClient({ baseUrl: "https://example.invalid" });
  await client.opportunities
    .search({
      filters: {
        status: F.in(["open"]),
        agency: F.in(["Agency"]),
        categories: F.in(["Education"]),
        applicantType: F.notIn(["Individual"]),
      },
    })
    .catch(() => {});
  expect(body.filters.status).toEqual(F.in(["open"]));
  expect(body.filters.customFilters).toEqual({
    agency: F.in(["Agency"]),
    categories: F.in(["Education"]),
    applicantType: F.notIn(["Individual"]),
  });
});
it("source validation failures use typed field-path errors", () => {
  try {
    CaPlugin.schemas.Opportunity.toCommon({ ...rows[0], PortalID: "" });
    throw Error("expected failure");
  } catch (e) {
    expect(e).toBeInstanceOf(TransformError);
    expect((e as TransformError).path).toBe("PortalID");
  }
});
it("unknown raw source field remains intact across title edit", () => {
  const raw = { ...rows[0], Future: { x: [null, 3] } };
  const cg = CaPlugin.schemas.Opportunity.toCommon(raw).result;
  cg.title = "Edited again";
  const out = CaPlugin.schemas.Opportunity.fromCommon(cg);
  expect(out.result.Future).toEqual(raw.Future);
});
it("source-less missing identity is rejected explicitly", () => {
  const cg = fresh();
  delete cg.customFields!.caSourceRecord;
  delete cg.customFields!.caPortalId;
  expect(() => CaPlugin.schemas.Opportunity.fromCommon(cg)).toThrow(TransformError);
});
