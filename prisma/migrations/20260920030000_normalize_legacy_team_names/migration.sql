-- Normaliza o catálogo legado de produção, que usa nomes oficiais/abreviados
-- e identificadores externos diferentes dos registros do seed atual.
UPDATE "teams" AS team
SET
  "name" = names.popular_name,
  "officialName" = names.official_name,
  "aliases" = names.aliases
FROM (
  VALUES
    ('SE Palmeiras', 'Palmeiras', 'Sociedade Esportiva Palmeiras', ARRAY['SE Palmeiras', 'Verdão', 'Palestra']::TEXT[]),
    ('CR Flamengo', 'Flamengo', 'Clube de Regatas do Flamengo', ARRAY['CR Flamengo', 'Mengão', 'Fla']::TEXT[]),
    ('Fluminense FC', 'Fluminense', 'Fluminense Football Club', ARRAY['Fluminense FC', 'Flu', 'Tricolor Carioca']::TEXT[]),
    ('Red Bull Bragantino', 'Bragantino', 'Red Bull Bragantino', ARRAY['Red Bull Bragantino', 'RB Bragantino']::TEXT[]),
    ('Athletico Paranaense', 'Athletico-PR', 'Club Athletico Paranaense', ARRAY['Athletico Paranaense', 'CAP']::TEXT[]),
    ('EC Bahia', 'Bahia', 'Esporte Clube Bahia', ARRAY['EC Bahia', 'Esquadrão de Aço']::TEXT[]),
    ('Coritiba FC', 'Coritiba', 'Coritiba Foot Ball Club', ARRAY['Coritiba FC', 'Coxa']::TEXT[]),
    ('São Paulo FC', 'São Paulo', 'São Paulo Futebol Clube', ARRAY['São Paulo FC', 'Tricolor Paulista']::TEXT[]),
    ('Botafogo-RJ', 'Botafogo', 'Botafogo de Futebol e Regatas', ARRAY['Botafogo-RJ', 'Fogão', 'Glorioso']::TEXT[]),
    ('EC Vitória', 'Vitória', 'Esporte Clube Vitória', ARRAY['EC Vitória', 'Leão da Barra']::TEXT[]),
    ('Atlético Mineiro', 'Atlético-MG', 'Clube Atlético Mineiro', ARRAY['Atlético Mineiro', 'Galo']::TEXT[]),
    ('SC Corinthians', 'Corinthians', 'Sport Club Corinthians Paulista', ARRAY['SC Corinthians', 'Timão']::TEXT[]),
    ('Cruzeiro EC', 'Cruzeiro', 'Cruzeiro Esporte Clube', ARRAY['Cruzeiro EC', 'Raposa']::TEXT[]),
    ('SC Internacional', 'Internacional', 'Sport Club Internacional', ARRAY['SC Internacional', 'Inter', 'Colorado']::TEXT[]),
    ('Santos FC', 'Santos', 'Santos Futebol Clube', ARRAY['Santos FC', 'Peixe']::TEXT[]),
    ('Grêmio FBPA', 'Grêmio', 'Grêmio Foot-Ball Porto Alegrense', ARRAY['Grêmio FBPA', 'Imortal']::TEXT[]),
    ('CR Vasco da Gama', 'Vasco', 'Club de Regatas Vasco da Gama', ARRAY['CR Vasco da Gama', 'Vasco da Gama']::TEXT[]),
    ('Mirassol FC', 'Mirassol', 'Mirassol Futebol Clube', ARRAY['Mirassol FC']::TEXT[]),
    ('Remo', 'Remo', 'Clube do Remo', ARRAY['Clube do Remo', 'Leão Azul']::TEXT[]),
    ('Chapecoense', 'Chapecoense', 'Associação Chapecoense de Futebol', ARRAY['ACF', 'Chape']::TEXT[])
) AS names(legacy_name, popular_name, official_name, aliases)
WHERE team."country" = 'Brasil'
  AND team."name" = names.legacy_name
  AND NOT EXISTS (
    SELECT 1
    FROM "teams" AS duplicate
    WHERE duplicate."name" = names.popular_name
      AND duplicate."id" <> team."id"
  );

UPDATE "teams"
SET "searchText" = trim(regexp_replace(lower(translate(
  concat_ws(' ', "name", "officialName", "shortName", "country", array_to_string("aliases", ' ')),
  'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÏÓÒÔÕÖÚÙÛÜÇÑ',
  'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
)), '[^a-z0-9]+', ' ', 'g'));
