-- Expand-only schema for the subscriber Mesa builder.
ALTER TYPE "MesaCategory" ADD VALUE IF NOT EXISTS 'FREE';

CREATE TYPE "MesaEligibility" AS ENUM (
  'ALL',
  'SUBSCRIBERS_ONLY',
  'FREE_ONLY'
);

CREATE TYPE "MesaRegistrationCloseMode" AS ENUM (
  'CAPACITY',
  'DATE'
);

CREATE TYPE "MesaDurationMode" AS ENUM (
  'ROUNDS',
  'DATE'
);

CREATE TYPE "UserAddressPreference" AS ENUM (
  'UNSPECIFIED',
  'CUSTOMER_MASCULINE',
  'CUSTOMER_FEMININE'
);

ALTER TABLE "users"
  ADD COLUMN "addressPreference" "UserAddressPreference" NOT NULL DEFAULT 'UNSPECIFIED';

ALTER TABLE "rankings"
  ADD COLUMN "eligibility" "MesaEligibility" NOT NULL DEFAULT 'SUBSCRIBERS_ONLY',
  ADD COLUMN "registrationCloseMode" "MesaRegistrationCloseMode" NOT NULL DEFAULT 'CAPACITY',
  ADD COLUMN "durationMode" "MesaDurationMode" NOT NULL DEFAULT 'DATE',
  ADD COLUMN "durationRounds" INTEGER,
  ADD COLUMN "registrationClosedAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3);
