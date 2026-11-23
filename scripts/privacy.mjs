import { realpathSync, readdirSync, readFileSync, lstatSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CaGrantSchema } from "../dist/index.js";

const email = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const phone = /(?<!\d)(?:\+?1[ .-]?)?(?:\(\d{3}\)[ .-]?|\d{3}[ .-])\d{3}[ .-]\d{4}(?!\d)/g;
const privateKey = /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/;
const secret = /(?:github_pat_|gh[pousr]_|AKIA)[A-Za-z0-9_]{16,}/;
const sourceKeys = new Set(Object.keys(CaGrantSchema.shape));
export function identifiers(s, allowExamples = false) {
  const mails = [...s.matchAll(email)].some(
    ([x]) => !allowExamples || !x.toLowerCase().endsWith("@example.invalid")
  );
  const phones = [...s.matchAll(phone)].some(
    ([x]) => !allowExamples || x.replace(/\D/g, "") !== "2025550100"
  );
  return mails || phones || privateKey.test(s) || secret.test(s);
}
function verifyValue(v) {
  if (typeof v === "string" && identifiers(v)) throw Error("Potential personal data in fixture");
  if (v && typeof v === "object")
    for (const [key, item] of Object.entries(v)) {
      if (identifiers(key)) throw Error("Potential personal data in fixture key");
      verifyValue(item);
    }
}
export function verifyFixtures(rows) {
  if (!Array.isArray(rows) || !rows.length) throw Error("No saved fixtures");
  for (const row of rows) {
    if (!row || typeof row !== "object" || Object.keys(row).some(key => !sourceKeys.has(key)))
      throw Error("Unexpected fixture column; review and sanitize before including");
    if (row.ContactInfo !== "") throw Error("Fixture contact field must be empty");
    verifyValue(row);
    if (!CaGrantSchema.safeParse(row).success) throw Error("Fixture schema validation failed");
  }
}
const fixture = "fixtures/public-sanitized.json";
const rootFiles = new Set([
  "package.json",
  "package-lock.json",
  "LICENSE",
  "LICENSE.upstream-MIT",
  "NOTICE.md",
  "README.md",
  "MAPPING.md",
  "UPSTREAM-PROVENANCE.json",
  "tsconfig.json",
]);
export function reviewTree(root, { packed = false } = {}) {
  root = realpathSync(root);
  const fixtureFiles = readdirSync(join(root, "fixtures"));
  if (fixtureFiles.length !== 1 || fixtureFiles[0] !== "public-sanitized.json")
    throw Error("Unexpected fixture file");
  function visit(prefix) {
    for (const name of readdirSync(join(root, prefix))) {
      const path = join(prefix, name);
      if (
        !packed &&
        !prefix &&
        !rootFiles.has(name) &&
        !["src", "dist", "scripts", "fixtures", "tests", ".github"].includes(name)
      )
        continue;
      const full = join(root, path);
      const status = lstatSync(full);
      if (status.isSymbolicLink()) throw Error("Symlink in release review tree");
      if (packed && status.isDirectory() && !["dist", "fixtures", "scripts"].includes(path))
        throw Error("Unexpected file or directory in npm archive");
      if (status.isDirectory()) {
        visit(path);
        continue;
      }
      if (
        packed &&
        !rootFiles.has(path) &&
        path !== fixture &&
        path !== "scripts/example.mjs" &&
        !/^dist\/(?:index|caSource|fields|plugin|transform)\.(?:js(?:\.map)?|d\.ts(?:\.map)?)$/.test(
          path
        )
      )
        throw Error("Unexpected file in npm archive");
      const data = readFileSync(full, "utf8");
      if (path === fixture) verifyFixtures(JSON.parse(data));
      else if (path !== "package-lock.json" && identifiers(data, true))
        throw Error("Potential personal data in " + relative(root, full));
    }
  }
  visit("");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  reviewTree(process.argv[2] ?? ".", { packed: process.argv.includes("--packed") });
  console.error(
    "Release privacy check passed: scoped files, exact fixture names and no unexpected fixture columns or detected identifiers"
  );
}
