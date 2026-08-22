-- Preserve the effective date window and access rules of existing Mesas.
UPDATE "rankings"
SET
  "eligibility" = 'SUBSCRIBERS_ONLY',
  "registrationCloseMode" = 'DATE',
  "durationMode" = 'DATE',
  "entryEndDate" = COALESCE("entryEndDate", "endDate"),
  "publishedAt" = COALESCE("publishedAt", "createdAt")
WHERE "type" = 'BOLAO';
