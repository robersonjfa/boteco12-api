ALTER TABLE "rankings"
  DROP CONSTRAINT IF EXISTS "rankings_mesa_capacity_positive_check",
  DROP CONSTRAINT IF EXISTS "rankings_mesa_category_terms_check",
  ADD CONSTRAINT "rankings_mesa_registration_close_check"
  CHECK (
    "type" <> 'BOLAO'
    OR ("registrationCloseMode" = 'CAPACITY' AND "maxParticipants" IS NOT NULL AND "maxParticipants" > 0)
    OR ("registrationCloseMode" = 'DATE' AND "entryEndDate" IS NOT NULL)
  ) NOT VALID,
  ADD CONSTRAINT "rankings_mesa_duration_check"
  CHECK (
    "type" <> 'BOLAO'
    OR ("durationMode" = 'ROUNDS' AND "durationRounds" IS NOT NULL AND "durationRounds" > 0)
    OR ("durationMode" = 'DATE' AND "endDate" IS NOT NULL)
  ) NOT VALID,
  ADD CONSTRAINT "rankings_mesa_category_terms_check"
  CHECK (
    "type" <> 'BOLAO'
    OR ("category" = 'PAID' AND COALESCE("accessCost", "entryFee") > 0 AND "sponsorPrizePool" = 0)
    OR ("category" = 'FREE' AND COALESCE("accessCost", "entryFee") = 0 AND "sponsorPrizePool" = 0)
    OR ("category" = 'SPONSORED_FREE' AND COALESCE("accessCost", "entryFee") = 0 AND "sponsorPrizePool" > 0)
  ) NOT VALID;

ALTER TABLE "rankings"
  VALIDATE CONSTRAINT "rankings_mesa_registration_close_check";

ALTER TABLE "rankings"
  VALIDATE CONSTRAINT "rankings_mesa_duration_check";

ALTER TABLE "rankings"
  VALIDATE CONSTRAINT "rankings_mesa_category_terms_check";
