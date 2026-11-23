# Mapping and gap inventory

Inherited pure mapping from src/transform.ts:

- PortalID -> deterministic UUID and caPortalId; raw number/string retained.
- Title -> title; Description or fallback Purpose -> stripped description.
- Status -> standard status or custom label.
- GrantURL -> source if URL-valid.
- EstAvailFunds -> funding.totalAmountAvailable; EstAmounts -> min/max award amounts.
- OpenDate/ApplicationDeadline -> post/close date events. AwardPeriod and ExpAwardDate -> other dates.
- ApplicantType -> acceptedApplicantTypes; AgencyDept -> agency; AgencyURL -> additionalInfo.
- MatchingFunds/MatchingFundsNotes -> costSharing; ContactInfo -> contactInfo (fixtures remove it).
- FundingSource/Type -> fundingSource/fundingInstrument; categories and remaining CA-specific metadata -> ca-prefixed fields.

Values not naturally represented without loss: Purpose separate from Description, HTML, original list delimiters/casing, money/date/status formatting, null vs empty, malformed URLs, noncanonical LOI, N/A notes, unknown future columns and \_id. caSourceRecord preserves the complete sanitized source object, while standard fields remain useful to CG consumers. The raw preservation field is CA-specific, not a proposed universal catalog field.

Review shared fundingSource/fundingInstrument/lastSyncedAt against current catalog before proposing duplicates. The extracted plugin now declares agency, categories and applicantType stringArray filters on opportunities.search, supporting in/notIn through SDK validation and request classification. The sponsor wording requires declaration, not deployment of a search server. Existing source behavior/server support and exact naming should be checked by QA before catalog submission.

No runtime API, SQL storage, Cloudflare, deployment or credentials were extracted. Reverse conversion supports representable edits/source-less records and rejects unrepresentable changes with typed field-path errors. Maintenance documentation and weekly conversion/column check are supplied; no ongoing maintenance commitment is made.

## Reverse edits to mirrored source columns

The mapper carries forward both native and original views of award amounts,
award period and expected award date. With a source snapshot, one edited view
takes precedence over its unchanged counterpart. Two edited views are accepted
only if converting the raw value produces the requested native value. Otherwise
reverse conversion rejects the conflict. Unchanged source records retain the
original value, including nonnumeric award prose. Only complete, nonnegative
USD amounts with valid digit grouping and exact cent precision are converted.
Ambiguous values remain in the source and custom fields without numeric claims.
Contact descriptions are serialized as the original semicolon-delimited extra
pairs; a description that cannot be represented without change is rejected.

## Estimated award count distinction

The extracted mapper retains California EstAwards verbatim in caEstAwards and caSourceRecord rather than guessing a native estimatedAwardCount from free text (for example ranges or uncertainty). The original proposal suggested native count mapping; the accepted TypeScript extraction retains the upstream behavior. Native estimatedAwardCount is currently left null, even for simple counts. This is an explicit mapping gap for sponsor review, not lost source data. No claim of full native count support is made.
