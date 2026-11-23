import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyFixtures, reviewTree } from "../scripts/privacy.mjs";
const fixtures = JSON.parse(
  readFileSync(new URL("../fixtures/public-sanitized.json", import.meta.url), "utf8")
);
describe("publication privacy checks", () => {
  it("accepts only clean fixtures", () => expect(() => verifyFixtures(fixtures)).not.toThrow());
  it.each([
    { Description: "reply to " + ["demo", "example.com"].join("@") },
    { Description: "call " + ["202", "555", "0147"].join("-") },
    { ContactInfo: "name: Example Contact" },
    { Unexpected: { nested: "extra source column" } },
  ])("blocks a planted identifier or unexpected field", mutation =>
    expect(() => verifyFixtures([{ ...fixtures[0], ...mutation }])).toThrow()
  );
  it("rejects a second file in the fixture directory", () => {
    const d = mkdtempSync(join(tmpdir(), "fixture-check-"));
    try {
      mkdirSync(join(d, "fixtures"));
      writeFileSync(join(d, "fixtures/public-sanitized.json"), JSON.stringify(fixtures));
      writeFileSync(join(d, "fixtures/extra.json"), "[]");
      expect(() => reviewTree(d)).toThrow(/Unexpected fixture file/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

it("packed mode rejects unknown top-level files and directories", () => {
  for (const extra of ["unexpected.txt", "unexpected-dir"]) {
    const d = mkdtempSync(join(tmpdir(), "packed-check-"));
    try {
      mkdirSync(join(d, "fixtures"));
      writeFileSync(join(d, "fixtures/public-sanitized.json"), JSON.stringify(fixtures));
      if (extra.endsWith("-dir")) {
        mkdirSync(join(d, extra));
        writeFileSync(join(d, extra, "leak.txt"), "unexpected");
      } else writeFileSync(join(d, extra), "unexpected");
      expect(() => reviewTree(d, { packed: true })).toThrow(/Unexpected file/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  }
});
