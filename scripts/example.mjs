import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { CaPlugin, CaGrantSchema } from "../dist/index.js";
const rows = JSON.parse(
  readFileSync(new URL("../fixtures/public-sanitized.json", import.meta.url), "utf8")
);
for (const row of rows) {
  const source = CaGrantSchema.parse(row);
  const forward = CaPlugin.schemas.Opportunity.toCommon(source);
  if (forward.errors.length) throw Error("Forward conversion failed");
  const reverse = CaPlugin.schemas.Opportunity.fromCommon(forward.result);
  if (reverse.errors.length || !isDeepStrictEqual(reverse.result, source))
    throw Error("Round trip mismatch");
  console.log(
    JSON.stringify({
      portalId: source.PortalID,
      status: forward.result.status.value,
      errors: 0,
      lossless: true,
    })
  );
}
