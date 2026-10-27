-- Auditoría 2026-10-21 · A-08, A-09, A-10, M-13 — firma íntegra.
-- Solo agrega columnas e índices; no toca ningún dato existente.
--
-- A-09: el hash de la nota se calcula sobre los diagnósticos en el
-- orden en que el médico los capturó, pero todos se insertan con el
-- mismo createdAt y el verificador los releía por (createdAt, id) — un
-- uuid aleatorio. Con 2+ diagnósticos, una nota íntegra podía salir
-- "ALTERADA". "ordinal" guarda la posición original. NULL en filas
-- previas (el verificador las resuelve por separado).
ALTER TABLE "encounter_diagnoses" ADD COLUMN "ordinal" INTEGER;

-- A-10: una adenda (nota con isCorrectionOfNoteId) no registraba quién
-- la escribió ni tenía sello propio. authorUserId vale también para la
-- nota original; contentHashSha256 aquí es el sello de la ADENDA (el de
-- la nota original sigue viviendo en clinical_encounters).
ALTER TABLE "clinical_notes" ADD COLUMN "authorUserId" TEXT;
ALTER TABLE "clinical_notes" ADD COLUMN "contentHashSha256" TEXT;

-- M-13: control optimista del autoguardado — dos pestañas sobre el
-- mismo borrador ya no se pisan en silencio.
ALTER TABLE "clinical_encounters" ADD COLUMN "draftVersion" INTEGER NOT NULL DEFAULT 0;

-- A-08: defensa en profundidad contra la doble firma. La protección
-- principal es el compare-and-set del servicio (UPDATE ... WHERE
-- status = 'DRAFT'); este índice impide además, a nivel de base, dos
-- notas ORIGINALES para el mismo encuentro. Si producción ya tiene
-- duplicados (de antes de esta corrección), el índice no se puede
-- crear sin borrar notas — y eso jamás (R1): se deja aviso y se sigue.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "clinical_notes"
    WHERE "isCorrectionOfNoteId" IS NULL
    GROUP BY "encounterId" HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'A-08: hay encuentros con más de una nota original; no se creó clinical_notes_one_original_per_encounter. Revisar a mano.';
  ELSE
    CREATE UNIQUE INDEX "clinical_notes_one_original_per_encounter"
      ON "clinical_notes" ("encounterId") WHERE "isCorrectionOfNoteId" IS NULL;
  END IF;
END
$$;
