-- Auditoría 2026-10-21 · C-02 y A-07 — inmutabilidad en profundidad (R1).
--
-- Problema: el append-only dependía solo de GRANT por tabla. Las FK que
-- genera Prisma son ON UPDATE CASCADE y las acciones referenciales se
-- ejecutan con privilegios del dueño de la tabla, así que un
-- `UPDATE clinical_encounters SET id = ...` (que medicfy_app sí puede
-- hacer) reescribía por cascada filas de clinical_notes, prescriptions,
-- lab_orders... Además medicfy_app podía reescribir contentHashSha256 y
-- signedAt de un encuentro ya firmado.
--
-- Solución, en tres capas, sin tocar un solo dato existente:
--   1. Ninguna llave primaria puede cambiar (trigger en TODA tabla con
--      columna "id"). Sin cambio de PK no hay cascada posible, y no hace
--      falta reescribir las ~100 FK ni desalinear schema.prisma.
--   2. Las tablas append-only rechazan UPDATE, DELETE y TRUNCATE por
--      trigger. A diferencia del GRANT, el trigger se aplica también al
--      dueño del esquema y a las acciones referenciales (ON DELETE SET
--      NULL incluido).
--   3. Un encuentro firmado queda sellado, y sus diagnósticos solo
--      admiten el sello de descarte (discardedAt/discardedByUserId,
--      una sola vez); certainty y el resto no cambian (A-07).
-- Más: REVOKE de UPDATE/DELETE en lab_order_items y de DELETE en
-- patients (NOM-004: el expediente se conserva; la app nunca borra
-- pacientes).
--
-- Tablas nuevas: si guardan expediente, agregar el trigger
-- medicfy_forbid_mutation en su migración; el trigger de PK hay que
-- agregarlo en toda tabla nueva con "id". append-only.integration.spec
-- falla si alguna tabla con "id" queda sin él.
--
-- Reversión (solo con autorización explícita y respaldo previo):
--   DROP FUNCTION medicfy_forbid_mutation() CASCADE;
--   DROP FUNCTION medicfy_forbid_pk_change() CASCADE;
--   DROP FUNCTION medicfy_seal_signed_encounter() CASCADE;
--   DROP FUNCTION medicfy_seal_signed_diagnosis() CASCADE;
--   GRANT UPDATE, DELETE ON TABLE "lab_order_items" TO medicfy_app;
--   GRANT DELETE ON TABLE "patients" TO medicfy_app;

-- ── 1. Llaves primarias inmutables ───────────────────────────────────
CREATE OR REPLACE FUNCTION medicfy_forbid_pk_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'R1: la llave primaria de % es inmutable', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'id'
      AND tb.table_type = 'BASE TABLE'
      AND c.table_name <> '_prisma_migrations'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER medicfy_pk_immutable BEFORE UPDATE OF "id" ON %I '
      'FOR EACH ROW WHEN (OLD."id" IS DISTINCT FROM NEW."id") '
      'EXECUTE FUNCTION medicfy_forbid_pk_change()',
      t.table_name
    );
  END LOOP;
END
$$;

-- encounter_diagnoses referencia icd10_codes por "code", no por "id".
CREATE TRIGGER medicfy_pk_immutable_code BEFORE UPDATE OF "code" ON "icd10_codes"
  FOR EACH ROW WHEN (OLD."code" IS DISTINCT FROM NEW."code")
  EXECUTE FUNCTION medicfy_forbid_pk_change();

-- ── 2. Tablas append-only: ni UPDATE, ni DELETE, ni TRUNCATE ─────────
CREATE OR REPLACE FUNCTION medicfy_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'R1: % es append-only (% no permitido)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'clinical_notes',
    'clinical_note_cancellations',
    'prescriptions',
    'prescription_items',
    'prescription_cancellations',
    'prescription_handwritten_deliveries',
    'lab_orders',
    'lab_order_items',
    'lab_order_cancellations',
    'audit_log',
    'consents',
    'vital_sign_sets',
    'note_lab_results',
    'assistant_readings',
    'red_flag_events',
    'appointment_status_history',
    'clinical_attachments',
    'encounter_specialty_data',
    'patient_history_item_changes',
    'patient_substance_use_changes',
    'patient_gyneco_history_changes'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER medicfy_append_only BEFORE UPDATE OR DELETE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION medicfy_forbid_mutation()',
      tbl
    );
    EXECUTE format(
      'CREATE TRIGGER medicfy_append_only_truncate BEFORE TRUNCATE ON %I '
      'FOR EACH STATEMENT EXECUTE FUNCTION medicfy_forbid_mutation()',
      tbl
    );
  END LOOP;
END
$$;

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "lab_order_items" FROM medicfy_app;
REVOKE DELETE, TRUNCATE ON TABLE "patients" FROM medicfy_app;

-- ── 3. Encuentro firmado sellado (A-07) ──────────────────────────────
CREATE OR REPLACE FUNCTION medicfy_seal_signed_encounter() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'SIGNED' THEN
    RAISE EXCEPTION 'R1: el encuentro % ya está firmado y sellado', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER medicfy_signed_encounter_sealed BEFORE UPDATE OR DELETE ON "clinical_encounters"
  FOR EACH ROW EXECUTE FUNCTION medicfy_seal_signed_encounter();

-- Un diagnóstico de un encuentro firmado solo admite el sello de
-- descarte, una vez: discardedAt y discardedByUserId pasan de NULL a un
-- valor y todo lo demás (certainty incluido) queda igual.
CREATE OR REPLACE FUNCTION medicfy_seal_signed_diagnosis() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  encounter_status text;
BEGIN
  SELECT e."status"::text INTO encounter_status
  FROM "clinical_encounters" e
  WHERE e."id" = OLD."encounterId";

  IF encounter_status = 'SIGNED' THEN
    IF TG_OP = 'UPDATE'
       AND OLD."discardedAt" IS NULL
       AND NEW."discardedAt" IS NOT NULL
       AND NEW."discardedByUserId" IS NOT NULL
       AND (to_jsonb(NEW) - 'discardedAt' - 'discardedByUserId')
           = (to_jsonb(OLD) - 'discardedAt' - 'discardedByUserId') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'R1: el diagnóstico % pertenece a un encuentro firmado', OLD."id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER medicfy_signed_diagnosis_sealed BEFORE UPDATE OR DELETE ON "encounter_diagnoses"
  FOR EACH ROW EXECUTE FUNCTION medicfy_seal_signed_diagnosis();
