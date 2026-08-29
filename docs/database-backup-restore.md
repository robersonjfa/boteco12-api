# Backup e Restore do Postgres

Ultima atualizacao:

- 2026-06-07

## Objetivo

Garantir que o banco do Boteco12 possa ser recuperado a partir de backup validado, sem depender de acesso manual improvisado ao container.

## Politica inicial

- Formato: `pg_dump --format=custom`
- Compatibilidade: a imagem da API inclui `pg_dump` e `pg_restore` 16, alinhados
  ao PostgreSQL 16 usado pela plataforma
- Escopo: schema `public` extraido da `DATABASE_URL`
- Arquivos gerados:
  - `boteco12-<label>-<timestamp>.dump`
  - `boteco12-<label>-<timestamp>.manifest.json`
- Manifest inclui:
  - data de criacao
  - schema
  - tamanho do arquivo
  - SHA-256
  - politica de retencao declarada
- Retencao minima:
  - diarios: 7
  - semanais: 4
  - mensais: 3
- Local padrao:
  - `backups/postgres`
- Armazenamento externo:
  - usar `BACKUP_UPLOAD_COMMAND` para copiar dump e manifest para S3, R2, Backblaze, rclone ou outro destino externo

## Variaveis

```bash
DATABASE_URL=postgresql://...
BACKUP_DIR=backups/postgres
BACKUP_RETENTION="daily-7 weekly-4 monthly-3"
BACKUP_UPLOAD_COMMAND='rclone copy "{file}" remote:boteco12-backups/postgres && rclone copy "{manifest}" remote:boteco12-backups/postgres'
RESTORE_DATABASE_URL=postgresql://...
```

O script remove o parametro `schema` da URL antes de chamar ferramentas Postgres e usa esse valor em `--schema`.

## Gerar backup

```bash
npm run db:backup -- --label pre-deploy
```

Saida esperada:

- caminho do `.dump`
- caminho do `.manifest.json`
- SHA-256

## Verificar backup

```bash
npm run db:backup:verify -- \
  --file backups/postgres/boteco12-pre-deploy-YYYY-MM-DDTHH-MM-SS.dump \
  --manifest backups/postgres/boteco12-pre-deploy-YYYY-MM-DDTHH-MM-SS.manifest.json
```

Essa verificacao confirma:

- arquivo existe
- checksum bate com o manifest
- `pg_restore --list` consegue ler o dump custom

## Restore em banco descartavel

1. Criar um banco descartavel fora de producao.
2. Definir `RESTORE_DATABASE_URL`.
3. Rodar dry-run:

```bash
npm run db:restore -- \
  --file backups/postgres/boteco12-pre-deploy-YYYY-MM-DDTHH-MM-SS.dump \
  --target-url "$RESTORE_DATABASE_URL" \
  --dry-run
```

4. Rodar restore real:

```bash
npm run db:restore -- \
  --file backups/postgres/boteco12-pre-deploy-YYYY-MM-DDTHH-MM-SS.dump \
  --target-url "$RESTORE_DATABASE_URL" \
  --yes-i-know-this-drops-data
```

5. Validar:

```bash
DATABASE_URL="$RESTORE_DATABASE_URL" npm run prisma:migrate:status
DATABASE_URL="$RESTORE_DATABASE_URL" npm run build
```

## Protecoes do restore

- O restore nunca usa `DATABASE_URL` como alvo implicito.
- Restore real exige `--yes-i-know-this-drops-data`.
- Se o alvo for exatamente igual a `DATABASE_URL`, o script bloqueia por padrao.
- Para uma emergencia real, o desbloqueio exige:

```bash
ALLOW_RESTORE_OVER_DATABASE_URL=true
```

Essa excecao deve ser usada apenas com janela de manutencao, backup novo validado e aprovacao operacional.

## Agendamento recomendado

No provedor ou cron externo:

```cron
15 3 * * * cd /app && npm run db:backup -- --label daily >> /var/log/boteco12-backup.log 2>&1
```

Se usar armazenamento externo, configurar `BACKUP_UPLOAD_COMMAND` no ambiente do job.

## Checklist pos-backup

1. Confirmar que o `.dump` foi criado.
2. Confirmar que o manifest foi criado.
3. Rodar `db:backup:verify` no arquivo novo.
4. Confirmar envio para destino externo, quando configurado.
5. Registrar data e resultado no canal operacional.

## Checklist trimestral de restore

1. Escolher um backup recente.
2. Restaurar em banco descartavel.
3. Rodar `prisma:migrate:status`.
4. Conferir tabelas principais:
   - `users`
   - `rounds`
   - `tickets`
   - `payments`
   - `payment_webhook_events`
   - `subscriptions`
5. Registrar tempo de restore e pendencias encontradas.

## Evidência local de 2026-08-29

O ciclo completo foi executado em dois bancos locais descartáveis PostgreSQL
16.15:

- bootstrap aplicou as 14 migrations ativas;
- dump custom foi gerado com `pg_dump 16.15`;
- manifest e SHA-256 foram validados;
- dry-run e restore real concluíram sem erros com `pg_restore 16.15`;
- `prisma migrate status` confirmou o schema atualizado no banco restaurado;
- origem e restauração mantiveram 14 migrations, 1 usuário, 153 times e 3
  pacotes de pagamento.

Essa evidência valida as ferramentas e o procedimento, mas não substitui o
teste periódico com uma cópia recente do backup de produção.
