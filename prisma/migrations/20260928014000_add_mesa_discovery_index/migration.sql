CREATE INDEX CONCURRENTLY "rankings_type_status_registrationClosedAt_entryEndDate_createdAt_idx"
ON "rankings"("type", "status", "registrationClosedAt", "entryEndDate", "createdAt");
