import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { reviewTree } from "./privacy.mjs";
const dir = mkdtempSync(join(tmpdir(), "ca-package-test-"));
try {
  const info = JSON.parse(
    execFileSync("npm", ["pack", "--json", "--pack-destination", dir], { encoding: "utf8" })
  );
  const tarball = join(dir, info[0].filename);
  execFileSync("tar", ["-xzf", tarball, "-C", dir]);
  reviewTree(join(dir, "package"), { packed: true });
  const consumer = join(dir, "consumer");
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, "package.json"),
    '{"name":"ca-package-test","version":"0.0.0","private":true}'
  );
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", tarball, "@common-grants/sdk@0.9.1", "zod@4.6.7"],
    { cwd: consumer, stdio: "pipe" }
  );
  const example = execFileSync(process.execPath, ["scripts/example.mjs"], {
    cwd: join(consumer, "node_modules", "@common-grants", "cg-california"),
    encoding: "utf8",
  });
  const rows = example
    .trim()
    .split("\n")
    .map(line => JSON.parse(line));
  if (rows.length !== 8 || rows.some(row => !row.lossless || row.errors !== 0))
    throw Error("Packed example failed");
  console.log(
    JSON.stringify({
      packedFiles: info[0].files.length,
      packageSha256: createHash("sha256").update(readFileSync(tarball)).digest("hex"),
      exactExamples: rows.length,
    })
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
