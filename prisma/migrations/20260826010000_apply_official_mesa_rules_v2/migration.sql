-- Mesa Patrocinada pode ter entrada gratuita ou paga. O aporte continua
-- separado da arrecadacao das entradas nas colunas sponsorPrizePool e
-- grossCollected.
ALTER TABLE "rankings"
  DROP CONSTRAINT IF EXISTS "rankings_mesa_category_terms_check",
  ADD CONSTRAINT "rankings_mesa_category_terms_check"
  CHECK (
    "type" <> 'BOLAO'
    OR ("category" = 'PAID' AND COALESCE("accessCost", "entryFee") > 0 AND "sponsorPrizePool" = 0)
    OR ("category" = 'FREE' AND COALESCE("accessCost", "entryFee") = 0 AND "sponsorPrizePool" = 0)
    OR ("category" = 'SPONSORED_FREE' AND COALESCE("accessCost", "entryFee") >= 0 AND "sponsorPrizePool" > 0)
  ) NOT VALID;

ALTER TABLE "rankings"
  VALIDATE CONSTRAINT "rankings_mesa_category_terms_check";
