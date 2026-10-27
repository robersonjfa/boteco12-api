-- Mesa Patrocinada: identidade do patrocinador (nome obrigatorio na criacao,
-- logo opcional). Campos aditivos e nullable para nao quebrar Mesas existentes.

ALTER TABLE "rankings" ADD COLUMN "sponsorName" TEXT;
ALTER TABLE "rankings" ADD COLUMN "sponsorLogoUrl" TEXT;
