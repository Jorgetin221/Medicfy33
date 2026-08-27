-- Prompt 8 (medicfy-50-prompts.md): normalizador y detección de
-- duplicados. TRUNCATE primero — la tabla hoy solo contiene fixtures
-- de las pruebas de integración del Prompt 7 (acumuladas de correr la
-- suite varias veces), nada real la ha poblado todavía (Prompt 9 es
-- quien la puebla). Sin esto, ADD COLUMN ... NOT NULL fallaría, y el
-- índice único fallaría por colisiones entre filas de prueba con el
-- mismo preferredTerm repetido entre corridas.
TRUNCATE TABLE "clinical_catalog_terms";

-- AlterTable
ALTER TABLE "clinical_catalog_terms" ADD COLUMN     "normalizedTerm" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "clinical_catalog_terms_domain_normalizedTerm_key" ON "clinical_catalog_terms"("domain", "normalizedTerm");
