CREATE TYPE "TeamGender" AS ENUM ('MEN', 'WOMEN', 'MIXED');
CREATE TYPE "TeamAgeCategory" AS ENUM ('SENIOR', 'U23', 'U20', 'U17', 'U15', 'OTHER');

ALTER TABLE "teams"
  ADD COLUMN "officialName" TEXT,
  ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';

CREATE TABLE "team_variants" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "gender" "TeamGender" NOT NULL DEFAULT 'MEN',
  "ageCategory" "TeamAgeCategory" NOT NULL DEFAULT 'SENIOR',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "team_variants_pkey" PRIMARY KEY ("id")
);

-- O ID da variante principal preserva os FKs históricos das partidas.
INSERT INTO "team_variants" (
  "id", "teamId", "gender", "ageCategory", "active", "createdAt", "updatedAt"
)
SELECT "id", "id", 'MEN', 'SENIOR', "active", "createdAt", CURRENT_TIMESTAMP
FROM "teams";

ALTER TABLE "round_matches" DROP CONSTRAINT "round_matches_homeTeamId_fkey";
ALTER TABLE "round_matches" DROP CONSTRAINT "round_matches_awayTeamId_fkey";

ALTER TABLE "team_variants"
  ADD CONSTRAINT "team_variants_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "round_matches"
  ADD CONSTRAINT "round_matches_homeTeamId_fkey"
  FOREIGN KEY ("homeTeamId") REFERENCES "team_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "round_matches"
  ADD CONSTRAINT "round_matches_awayTeamId_fkey"
  FOREIGN KEY ("awayTeamId") REFERENCES "team_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "team_variants_teamId_gender_ageCategory_key"
  ON "team_variants"("teamId", "gender", "ageCategory");
CREATE INDEX "team_variants_teamId_active_idx" ON "team_variants"("teamId", "active");
CREATE INDEX "teams_searchText_idx" ON "teams"("searchText");

-- Nome principal é o nome popular. Nome oficial e aliases continuam pesquisáveis.
UPDATE "teams" AS team
SET
  "name" = names.popular_name,
  "officialName" = names.official_name,
  "aliases" = names.aliases
FROM (
  VALUES
    ('seed:club:br:palmeiras', 'Palmeiras', 'Sociedade Esportiva Palmeiras', ARRAY['Verdão', 'Palestra']::TEXT[]),
    ('seed:club:br:flamengo', 'Flamengo', 'Clube de Regatas do Flamengo', ARRAY['Mengão', 'Fla']::TEXT[]),
    ('seed:club:br:fluminense', 'Fluminense', 'Fluminense Football Club', ARRAY['Flu', 'Tricolor Carioca']::TEXT[]),
    ('seed:club:br:red-bull-bragantino', 'Bragantino', 'Red Bull Bragantino', ARRAY['RB Bragantino', 'Red Bull Bragantino']::TEXT[]),
    ('seed:club:br:athletico-paranaense', 'Athletico-PR', 'Club Athletico Paranaense', ARRAY['Athletico Paranaense', 'CAP']::TEXT[]),
    ('seed:club:br:bahia', 'Bahia', 'Esporte Clube Bahia', ARRAY['Esquadrão de Aço']::TEXT[]),
    ('seed:club:br:sao-paulo', 'São Paulo', 'São Paulo Futebol Clube', ARRAY['São Paulo FC', 'Tricolor Paulista']::TEXT[]),
    ('seed:club:br:botafogo', 'Botafogo', 'Botafogo de Futebol e Regatas', ARRAY['Fogão', 'Glorioso']::TEXT[]),
    ('seed:club:br:vitoria', 'Vitória', 'Esporte Clube Vitória', ARRAY['Leão da Barra']::TEXT[]),
    ('seed:club:br:atletico-mineiro', 'Atlético-MG', 'Clube Atlético Mineiro', ARRAY['Atlético Mineiro', 'Galo']::TEXT[]),
    ('seed:club:br:corinthians', 'Corinthians', 'Sport Club Corinthians Paulista', ARRAY['Timão']::TEXT[]),
    ('seed:club:br:cruzeiro', 'Cruzeiro', 'Cruzeiro Esporte Clube', ARRAY['Raposa']::TEXT[]),
    ('seed:club:br:internacional', 'Internacional', 'Sport Club Internacional', ARRAY['Inter', 'Colorado']::TEXT[]),
    ('seed:club:br:santos', 'Santos', 'Santos Futebol Clube', ARRAY['Santos FC', 'Peixe']::TEXT[]),
    ('seed:club:br:gremio', 'Grêmio', 'Grêmio Foot-Ball Porto Alegrense', ARRAY['Imortal']::TEXT[]),
    ('seed:club:br:vasco-da-gama', 'Vasco', 'Club de Regatas Vasco da Gama', ARRAY['Vasco da Gama']::TEXT[]),
    ('seed:club:br:sport-recife', 'Sport', 'Sport Club do Recife', ARRAY['Sport Recife']::TEXT[]),
    ('seed:club:br:america-mineiro', 'América-MG', 'América Futebol Clube', ARRAY['América Mineiro', 'Coelho']::TEXT[]),
    ('seed:club:br:atletico-goianiense', 'Atlético-GO', 'Atlético Clube Goianiense', ARRAY['Atlético Goianiense', 'Dragão']::TEXT[]),
    ('seed:club:eng:tottenham-hotspur', 'Tottenham', 'Tottenham Hotspur Football Club', ARRAY['Tottenham Hotspur', 'Spurs']::TEXT[]),
    ('seed:club:eng:newcastle-united', 'Newcastle', 'Newcastle United Football Club', ARRAY['Newcastle United']::TEXT[]),
    ('seed:club:de:bayern-munchen', 'Bayern de Munique', 'Fußball-Club Bayern München', ARRAY['Bayern München', 'Bayern Munich']::TEXT[]),
    ('seed:club:de:borussia-dortmund', 'Dortmund', 'Ballspielverein Borussia 09 Dortmund', ARRAY['Borussia Dortmund', 'BVB']::TEXT[]),
    ('seed:club:fr:paris-saint-germain', 'PSG', 'Paris Saint-Germain Football Club', ARRAY['Paris Saint-Germain', 'Paris Saint Germain']::TEXT[]),
    ('seed:club:fr:olympique-de-marseille', 'Marseille', 'Olympique de Marseille', ARRAY['Olympique de Marseille', 'Marselha']::TEXT[]),
    ('seed:club:fr:olympique-lyon', 'Lyon', 'Olympique Lyonnais', ARRAY['Olympique Lyon', 'Olympique Lyonnais']::TEXT[]),
    ('seed:national:ned', 'Holanda', 'Seleção Neerlandesa de Futebol', ARRAY['Países Baixos', 'Netherlands']::TEXT[]),
    ('seed:national:usa', 'EUA', 'Seleção de Futebol dos Estados Unidos', ARRAY['Estados Unidos', 'USA']::TEXT[])
) AS names(external_id, popular_name, official_name, aliases)
WHERE team."externalId" = names.external_id;

UPDATE "teams"
SET "searchText" = trim(regexp_replace(lower(translate(
  concat_ws(' ', "name", "officialName", "shortName", "country", array_to_string("aliases", ' ')),
  'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
  'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
)), '[^a-z0-9]+', ' ', 'g'));
