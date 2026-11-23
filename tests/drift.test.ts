import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { checkDrift } from "../scripts/drift.js";
const items = JSON.parse(
  readFileSync(new URL("../fixtures/public-sanitized.json", import.meta.url), "utf8")
);
const envelope = (records: unknown[]) => ({ success: true, result: { records } });
it("validates exact reverse fidelity on saved source rows", () => {
  expect(checkDrift(envelope(items))).toEqual({
    records: items.length,
    forwardErrors: 0,
    exactReverse: items.length,
  });
});
it("detects changed columns without printing the injected value", () => {
  expect(() => checkDrift(envelope([{ ...items[0], Future: "do not emit" }]))).toThrow(
    /^Source columns changed$/
  );
});
it("detects invalid source shape or no data", () => {
  expect(() => checkDrift(envelope([{ ...items[0], Title: 123 }]))).toThrow(
    /^Source schema changed$/
  );
  expect(() => checkDrift(envelope([]))).toThrow(/^No source records$/);
});
