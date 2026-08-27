-- Prompt 10: curatedBy deja de ser texto descriptivo y se vuelve FK
-- real a users(id). El esquema lo anticipaba: "se vuelve FK real a un
-- usuario curador cuando exista ese rol".
-- Cualquier valor previo que no sea un id de usuario válido se anula
-- (era descriptivo, no una referencia).
UPDATE "clinical_catalog_terms" t
SET "curatedBy" = NULL
WHERE t."curatedBy" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = t."curatedBy");

ALTER TABLE "clinical_catalog_terms"
  ADD CONSTRAINT "clinical_catalog_terms_curatedBy_fkey"
  FOREIGN KEY ("curatedBy") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
