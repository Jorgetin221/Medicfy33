-- Catálogo de especialidades del registro de médicos (documento
-- "Catálogo de especialidades y subespecialidades — Registro Medicfy",
-- 2026-11-02): 28 de entrada directa (incluida Medicina General) + 22 de
-- rama = 50 especialidades. Las de rama aparecen como especialidad
-- propia (un cardiólogo elige "Cardiología", no "Medicina Interna").
--
-- Solo agrega filas: ON CONFLICT (code) DO NOTHING deja intactas las que
-- ya existen (GENERAL, GINECOLOGIA_OBSTETRICIA, PEDIATRIA,
-- MEDICINA_INTERNA) y los médicos ya registrados con ellas. Va como
-- migración, no solo en el seed, porque el seed no se corre en
-- producción (crea una cuenta de administrador de demostración).
--
-- Las subespecialidades del documento NO están aquí: necesitan su propia
-- tabla y un campo nuevo en el registro.
INSERT INTO "specialties" ("id", "code", "nameEs", "requiresSpecialtyLicense") VALUES
  (gen_random_uuid()::text, 'GENERAL', 'Medicina General', false),
  (gen_random_uuid()::text, 'ANATOMIA_PATOLOGICA', 'Anatomía Patológica', true),
  (gen_random_uuid()::text, 'ANESTESIOLOGIA', 'Anestesiología', true),
  (gen_random_uuid()::text, 'ANGIOLOGIA_CIRUGIA_VASCULAR_Y_ENDOVASCULAR', 'Angiología, Cirugía Vascular y Endovascular', true),
  (gen_random_uuid()::text, 'AUDIOLOGIA_OTONEUROLOGIA_Y_FONIATRIA', 'Audiología, Otoneurología y Foniatría', true),
  (gen_random_uuid()::text, 'CALIDAD_DE_LA_ATENCION_CLINICA', 'Calidad de la Atención Clínica', true),
  (gen_random_uuid()::text, 'CIRUGIA_GENERAL', 'Cirugía General', true),
  (gen_random_uuid()::text, 'EPIDEMIOLOGIA', 'Epidemiología', true),
  (gen_random_uuid()::text, 'GENETICA_MEDICA', 'Genética Médica', true),
  (gen_random_uuid()::text, 'GERIATRIA', 'Geriatría', true),
  (gen_random_uuid()::text, 'GINECOLOGIA_OBSTETRICIA', 'Ginecología y Obstetricia', true),
  (gen_random_uuid()::text, 'IMAGENOLOGIA_DIAGNOSTICA_Y_TERAPEUTICA', 'Imagenología Diagnóstica y Terapéutica', true),
  (gen_random_uuid()::text, 'MEDICINA_DE_LA_ACTIVIDAD_FISICA_Y_DEPORTIVA', 'Medicina de la Actividad Física y Deportiva', true),
  (gen_random_uuid()::text, 'MEDICINA_DE_REHABILITACION', 'Medicina de Rehabilitación', true),
  (gen_random_uuid()::text, 'MEDICINA_DE_URGENCIAS', 'Medicina de Urgencias', true),
  (gen_random_uuid()::text, 'MEDICINA_DEL_TRABAJO_Y_AMBIENTAL', 'Medicina del Trabajo y Ambiental', true),
  (gen_random_uuid()::text, 'MEDICINA_FAMILIAR', 'Medicina Familiar', true),
  (gen_random_uuid()::text, 'MEDICINA_INTERNA', 'Medicina Interna', true),
  (gen_random_uuid()::text, 'MEDICINA_LEGAL', 'Medicina Legal', true),
  (gen_random_uuid()::text, 'MEDICINA_NUCLEAR_E_IMAGENOLOGIA_MOLECULAR', 'Medicina Nuclear e Imagenología Molecular', true),
  (gen_random_uuid()::text, 'MEDICINA_PREVENTIVA', 'Medicina Preventiva', true),
  (gen_random_uuid()::text, 'OFTALMOLOGIA', 'Oftalmología', true),
  (gen_random_uuid()::text, 'OTORRINOLARINGOLOGIA_Y_CIRUGIA_DE_CABEZA_Y_CUELLO', 'Otorrinolaringología y Cirugía de Cabeza y Cuello', true),
  (gen_random_uuid()::text, 'PATOLOGIA_CLINICA', 'Patología Clínica', true),
  (gen_random_uuid()::text, 'PEDIATRIA', 'Pediatría', true),
  (gen_random_uuid()::text, 'PSIQUIATRIA', 'Psiquiatría', true),
  (gen_random_uuid()::text, 'RADIO_ONCOLOGIA', 'Radio-oncología', true),
  (gen_random_uuid()::text, 'TRAUMATOLOGIA_Y_ORTOPEDIA', 'Traumatología y Ortopedia', true),
  (gen_random_uuid()::text, 'ALERGIA_E_INMUNOLOGIA_CLINICA', 'Alergia e Inmunología Clínica', true),
  (gen_random_uuid()::text, 'CARDIOLOGIA', 'Cardiología', true),
  (gen_random_uuid()::text, 'CIRUGIA_CARDIOTORACICA', 'Cirugía Cardiotorácica', true),
  (gen_random_uuid()::text, 'CIRUGIA_ONCOLOGICA', 'Cirugía Oncológica', true),
  (gen_random_uuid()::text, 'CIRUGIA_PEDIATRICA', 'Cirugía Pediátrica', true),
  (gen_random_uuid()::text, 'CIRUGIA_PLASTICA_Y_RECONSTRUCTIVA', 'Cirugía Plástica y Reconstructiva', true),
  (gen_random_uuid()::text, 'COLOPROCTOLOGIA', 'Coloproctología', true),
  (gen_random_uuid()::text, 'DERMATOLOGIA', 'Dermatología', true),
  (gen_random_uuid()::text, 'ENDOCRINOLOGIA', 'Endocrinología', true),
  (gen_random_uuid()::text, 'GASTROENTEROLOGIA', 'Gastroenterología', true),
  (gen_random_uuid()::text, 'HEMATOLOGIA', 'Hematología', true),
  (gen_random_uuid()::text, 'INFECTOLOGIA', 'Infectología', true),
  (gen_random_uuid()::text, 'MEDICINA_DEL_ENFERMO_EN_ESTADO_CRITICO', 'Medicina del Enfermo en Estado Crítico', true),
  (gen_random_uuid()::text, 'NEFROLOGIA', 'Nefrología', true),
  (gen_random_uuid()::text, 'NEUMOLOGIA', 'Neumología', true),
  (gen_random_uuid()::text, 'NEUROCIRUGIA', 'Neurocirugía', true),
  (gen_random_uuid()::text, 'NEUROLOGIA', 'Neurología', true),
  (gen_random_uuid()::text, 'NUTRIOLOGIA_CLINICA', 'Nutriología Clínica', true),
  (gen_random_uuid()::text, 'ONCOLOGIA_MEDICA', 'Oncología Médica', true),
  (gen_random_uuid()::text, 'REUMATOLOGIA', 'Reumatología', true),
  (gen_random_uuid()::text, 'UROLOGIA', 'Urología', true),
  (gen_random_uuid()::text, 'MEDICINA_PALIATIVA', 'Medicina Paliativa', true)
ON CONFLICT ("code") DO NOTHING;
