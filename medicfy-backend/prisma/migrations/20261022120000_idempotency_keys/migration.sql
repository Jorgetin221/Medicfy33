-- Auditoría 2026-10-21 · A-14 — idempotencia en creación de citas,
-- recetas y órdenes (CLAUDE.md §4: "Idempotencia obligatoria en
-- creación de citas, recetas y pagos"). Un reintento de red con la
-- misma Idempotency-Key devuelve el documento ya creado en vez de
-- emitir otro folio imborrable. Solo agrega columnas e índices.
--
-- La llave es única POR MÉDICO (dos médicos pueden, por azar, generar
-- la misma) y NULL no choca con NULL: los clientes que no mandan la
-- cabecera siguen funcionando como antes.
ALTER TABLE "appointments" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "prescriptions" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "lab_orders" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "appointments_doctorId_idempotencyKey_key" ON "appointments" ("doctorId", "idempotencyKey");
CREATE UNIQUE INDEX "prescriptions_doctorId_idempotencyKey_key" ON "prescriptions" ("doctorId", "idempotencyKey");
CREATE UNIQUE INDEX "lab_orders_doctorId_idempotencyKey_key" ON "lab_orders" ("doctorId", "idempotencyKey");
