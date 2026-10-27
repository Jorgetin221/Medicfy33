-- Auditoría 2026-10-21 · M-17 — índices de llaves foráneas que se leen
-- en cada petición clínica (CareRelationshipGuard consulta
-- care_relationships en TODA ruta de expediente) y en las listas por
-- paciente. Prisma no crea índices de FK en PostgreSQL.
--
-- CREATE INDEX normal (no CONCURRENTLY): Prisma ejecuta el archivo en
-- un solo bloque y CONCURRENTLY no se permite ahí. Con el volumen del
-- MVP el bloqueo de escritura dura segundos; en una tabla grande,
-- aplicar estos índices a mano con CONCURRENTLY antes de la migración
-- (IF NOT EXISTS los vuelve no-op aquí).
CREATE INDEX IF NOT EXISTS "appointment_status_history_appointmentId_idx" ON "appointment_status_history"("appointmentId");
CREATE INDEX IF NOT EXISTS "appointments_patientId_idx" ON "appointments"("patientId");
CREATE INDEX IF NOT EXISTS "availability_exceptions_doctorId_idx" ON "availability_exceptions"("doctorId");
CREATE INDEX IF NOT EXISTS "availability_rules_doctorId_idx" ON "availability_rules"("doctorId");
CREATE INDEX IF NOT EXISTS "care_relationships_patientId_doctorId_idx" ON "care_relationships"("patientId", "doctorId");
CREATE INDEX IF NOT EXISTS "clinical_attachments_patientId_idx" ON "clinical_attachments"("patientId");
CREATE INDEX IF NOT EXISTS "clinical_encounters_patientId_startedAt_idx" ON "clinical_encounters"("patientId", "startedAt");
CREATE INDEX IF NOT EXISTS "clinical_encounters_doctorId_idx" ON "clinical_encounters"("doctorId");
CREATE INDEX IF NOT EXISTS "consents_userId_idx" ON "consents"("userId");
CREATE INDEX IF NOT EXISTS "doctor_services_doctorId_idx" ON "doctor_services"("doctorId");
CREATE INDEX IF NOT EXISTS "encounter_diagnoses_encounterId_idx" ON "encounter_diagnoses"("encounterId");
CREATE INDEX IF NOT EXISTS "lab_order_items_labOrderId_idx" ON "lab_order_items"("labOrderId");
CREATE INDEX IF NOT EXISTS "lab_orders_patientId_idx" ON "lab_orders"("patientId");
CREATE INDEX IF NOT EXISTS "lab_orders_encounterId_idx" ON "lab_orders"("encounterId");
CREATE INDEX IF NOT EXISTS "lab_results_patientId_idx" ON "lab_results"("patientId");
CREATE INDEX IF NOT EXISTS "lab_results_labOrderId_idx" ON "lab_results"("labOrderId");
CREATE INDEX IF NOT EXISTS "patient_allergies_patientId_idx" ON "patient_allergies"("patientId");
CREATE INDEX IF NOT EXISTS "patient_guardians_patientId_idx" ON "patient_guardians"("patientId");
CREATE INDEX IF NOT EXISTS "patient_medications_patientId_idx" ON "patient_medications"("patientId");
CREATE INDEX IF NOT EXISTS "practice_locations_doctorId_idx" ON "practice_locations"("doctorId");
CREATE INDEX IF NOT EXISTS "prescription_items_prescriptionId_idx" ON "prescription_items"("prescriptionId");
CREATE INDEX IF NOT EXISTS "prescriptions_patientId_idx" ON "prescriptions"("patientId");
CREATE INDEX IF NOT EXISTS "prescriptions_encounterId_idx" ON "prescriptions"("encounterId");
CREATE INDEX IF NOT EXISTS "sessions_userId_idx" ON "sessions"("userId");
CREATE INDEX IF NOT EXISTS "verification_codes_userId_idx" ON "verification_codes"("userId");
