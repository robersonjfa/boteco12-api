-- Prisma 7 can represent the single-open-round rule as a partial unique index.
-- Build the replacement before removing the legacy expression index so the
-- invariant remains enforced throughout the migration.
CREATE UNIQUE INDEX "rounds_single_open_status_prisma7_idx"
ON "rounds"("status")
WHERE ("status" = 'OPEN');

DROP INDEX "rounds_single_open_idx";

ALTER INDEX "rounds_single_open_status_prisma7_idx"
RENAME TO "rounds_single_open_idx";

-- Financial package references must never be detached by package deletion.
-- The conditional blocks make this a no-op where RESTRICT is already active
-- while aligning databases originally created with SET NULL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_packageId_fkey'
      AND conrelid = 'payments'::regclass
      AND confdeltype <> 'r'
  ) THEN
    ALTER TABLE "payments"
      DROP CONSTRAINT "payments_packageId_fkey";

    ALTER TABLE "payments"
      ADD CONSTRAINT "payments_packageId_fkey"
      FOREIGN KEY ("packageId") REFERENCES "PaymentPackage"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscriptions_packageId_fkey'
      AND conrelid = 'subscriptions'::regclass
      AND confdeltype <> 'r'
  ) THEN
    ALTER TABLE "subscriptions"
      DROP CONSTRAINT "subscriptions_packageId_fkey";

    ALTER TABLE "subscriptions"
      ADD CONSTRAINT "subscriptions_packageId_fkey"
      FOREIGN KEY ("packageId") REFERENCES "PaymentPackage"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
