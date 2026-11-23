import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { CaGrantSchema, CaPlugin } from "../src/index.js";

const reference = JSON.parse(
  readFileSync(new URL("../fixtures/public-sanitized.json", import.meta.url), "utf8")
)[0];
const url =
  "https://data.ca.gov/api/3/action/datastore_search?resource_id=111c8c88-21f6-453c-ae2c-b4785a0624f5&limit=20";
export function checkDrift(payload: unknown) {
  const data = payload as { success?: boolean; result?: { records?: unknown[] } } | null;
  const rows = data?.result?.records;
  if (data?.success !== true || !Array.isArray(rows) || !rows.length)
    throw Error("No source records");
  const columns = Object.keys(reference).sort();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object" || !isDeepStrictEqual(Object.keys(raw).sort(), columns))
      throw Error("Source columns changed");
    const source = CaGrantSchema.safeParse({ ...raw, ContactInfo: "" });
    if (!source.success) throw Error("Source schema changed");
    try {
      const out = CaPlugin.schemas.Opportunity.toCommon(source.data);
      if (out.errors.length || !out.result) throw Error("Forward conversion failed");
      const reverse = CaPlugin.schemas.Opportunity.fromCommon(out.result);
      if (reverse.errors.length || !isDeepStrictEqual(reverse.result, source.data))
        throw Error("Reverse fidelity failed");
    } catch {
      throw Error("Source conversion or reverse fidelity check failed");
    }
  }
  return { records: rows.length, forwardErrors: 0, exactReverse: rows.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error("California source returned HTTP " + response.status);
    console.log(
      JSON.stringify({
        observedAt: new Date().toISOString(),
        ...checkDrift(await response.json()),
      })
    );
  } catch (error) {
    // Only our bounded diagnostics may reach logs; upstream bodies never do.
    const diagnostic =
      error instanceof Error &&
      /^(?:California source returned HTTP \d{3}|No source records|Source columns changed|Source schema changed|Source conversion or reverse fidelity check failed)$/.test(
        error.message
      )
        ? error.message
        : "California source could not be read";
    console.error(diagnostic);
    process.exitCode = 1;
  }
}
