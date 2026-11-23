# California CommonGrants plugin

TypeScript adapter for the California Grants Portal, extracted from `agilesix/cg-api-ca` for CommonGrants issue #1369.

Node >=22. Tested on Node 24.22.3; SDK 0.9.1; Zod 4 (the old source used Zod 3 and SDK 0.5).

Local use: `npm ci --ignore-scripts`, `npm run build`, `npm test`, `npm run example`, `npm run drift`, `node scripts/package-smoke.mjs`.
A future registry installation would use `npm install @common-grants/cg-california @common-grants/sdk zod`; that name/version is provisional and NOT asserted to exist.

Import `{CaPlugin, CaGrantSchema}` from the built package. Parse a sanitized CKAN record using CaGrantSchema, then call `CaPlugin.schemas.Opportunity.toCommon(record)`. Check `errors`, then call `fromCommon(result)` and check its `errors`. Explicit callable errors can also throw; callers should catch them. The bundled account-free example converts eight real sanitized records and prints a redacted conversion summary.

Fidelity contract: exact source -> CG -> source for sanitized JSON source records, preserving null/empty distinctions, numeric/string PortalID, optional \_id and unknown JSON columns. Original values are retained in the namespaced caSourceRecord object. This is deliberate preservation rather than reverse-guessing normalized strings. No hidden storage is required. Representable CommonGrants edits update their source equivalents while retaining unrelated raw values. Source-less records are reconstructed canonically. Both paths are re-converted and compared against every CommonGrants top-level field; unrepresentable differences throw a typed TransformError with a field path, without raw data. This deliberately rejects values the California format cannot encode rather than losing them silently.

Privacy: only use public or anonymized records. Fixtures clear ContactInfo and redact email/phone patterns throughout string values. This is not a general PII detector; users must review free text and new columns before saving records. Raw preservation retains every input field, so never pass private records without sanitization. Weekly drift checks do not persist or log record bodies, credentials, or error payloads.

Weekly workflow runs a 20-row read-only source sample with column/schema/conversion checks. It checks both conversion directions and exact fidelity, and fails on drift. The draft workflow opens one deduplicated bot issue on failure without raw data. This is code only, not enabled; sponsor should review issues:write permission and workflow activation. No npm publish, deployment, or remote-write workflow is included.

See [MAPPING.md](MAPPING.md) for the full mapping and [NOTICE.md](NOTICE.md) for upstream attribution. The CommonGrants maintainers handle publication.

Custom filters: agency, categories and applicantType are declared as stringArray route filters (in/notIn), with SDK runtime validation and request classification tested. They describe CommonGrants API searches; this package does not invent a CKAN-to-CG HTTP server or translate every operator into native CKAN query syntax. Consumers need a server implementing these semantics.

Review evidence: run `npm run privacy` after building, before sharing the
source or packing. The default `npm pack` runs the build and privacy gate.
Validate the packed file list separately before publishing. Numeric award ranges
and award-date mirrors use the conflict policy in MAPPING.md. The example and
drift command log a bounded summary, not the raw or transformed record payload.

## Source fields and values without a native mapping

- California-only identity and metadata: `PortalID`'s original representation, `GrantID`, CKAN `_id`, `Categories`, `CategorySuggestion`, `ChangeNotes`, `LOI`, `ApplicantTypeNotes`, and `Geography`.
- Funding, submission, and links: `EstAwards` is retained as `caEstAwards`, not parsed into the native estimated count. `FundingSource`, `FundingSourceNotes`, `Type`, `FundingMethod`, `FundingMethodNotes`, `AwardStats`, `ElecSubmission`, `AgencySubscribeURL`, and `GrantEventsURL` use adapter-defined fields because they have no equivalent native or existing catalog field in this adapter. Unparseable or ambiguous funding text is preserved rather than guessed.
- Some values, such as separate `Purpose`, original description HTML, original date, status, and list formatting, malformed URLs, and unknown source columns, cannot be recovered from normalized fields alone. They are preserved in `caSourceRecord` together with distinctions such as null versus empty text.

## Development runtime

Use Node24 for development and CI; ESLint10 requires Node22.13+ on the Node22 line. Runtime package requirement remains Node>=22, matching SDK0.9.1. A genuine npm lockfile is included. The draft weekly failure issue step is not activated or remotely tested.
