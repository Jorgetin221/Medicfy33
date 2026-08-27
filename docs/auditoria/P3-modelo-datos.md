# P3 · Auditoría del modelo de datos clínicos — Medicfy

**Fecha:** 2026-08-26
**Alcance:** `medicfy-backend/prisma/schema.prisma` (1528 líneas, 19 migraciones aplicadas + 3 sin commitear), `medicfy-backend/packages/contracts/src/schemas/`, `medicfy-backend/apps/api/src/modules/`, `medicfy-frontend/apps/web/src/app`.
**Reglas auditadas:** R3 (texto libre sólo en razonamiento) y R7 (equivalencia HL7 FHIR declarada por campo).
**Estado del árbol:** auditado tal como está, con los cambios sin commitear (módulo `catalog`, escalas por especialidad, `vitals-calculations.util.ts`, migraciones `20260826190911`, `20260826194547`, `20260826200932`).

> Todas las rutas son relativas a la raíz del monorepo `medicfy/`.

---

## 0 · Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Campos que hoy guardan información clínica | **118** |
| Campos en texto libre que R3 exige estructurados (🔴) | **42** |
| Campos con equivalencia FHIR **declarada en el código** | **0 de 118** |
| Entidades clínicas sin catálogo cerrado detrás | 6 (`PatientAllergy`, `PatientMedication`, `LabOrderItem`, `EncounterDiagnosis` parcial, `PatientHistoryItem`, `Patient.bloodType`) |
| Catálogos que existen pero **nadie referencia por FK** | 3 (`icd10_codes`, `medications_catalog` parcialmente, `clinical_catalog_terms` completamente) |

### Respuestas directas a las seis preguntas del encargo

1. **Presión arterial:** ✅ **separada** en `bpSystolic` / `bpDiastolic` — pero **sólo en el contrato Zod** (`packages/contracts/src/schemas/clinical.schema.ts:10-11`) y en el formulario (`medicfy-frontend/apps/web/src/components/clinical/vitals-fields.tsx:14-15`). En la base de datos no existen esas columnas: viven dentro del blob `vitals Json` de `clinical_notes` (`prisma/schema.prisma:848`). La base de datos no sabe que ahí hay una sistólica.
2. **Signos vitales:** ❌ **no son entidad propia**. Son un único `Json` en `ClinicalNote.vitals` (`prisma/schema.prisma:848`) y otro dentro de `ClinicalEncounter.draftContent` (`:814`). No hay tabla de observaciones, ni una fila por medición, ni unidad declarada, ni marca de tiempo/autor por medición, ni código LOINC. No se puede graficar una tendencia ni disparar una alarma sin recorrer JSON.
3. **Diagnósticos:** ⚠️ **parcialmente**. Existe `icd10_codes` con ~12,500 códigos oficiales DGIS/CEMECE (`prisma/schema.prisma:1105-1111`, `prisma/data/cie10-dgis.json`), pero `EncounterDiagnosis.icd10Code` es **`String?` sin llave foránea** (`:890`) y además **nullable a propósito**: la ruta alterna `codeAbsentReason` (`:891`) permite firmar un diagnóstico sin ningún código, dejando `description` (texto libre, `:892`) como único contenido. El comentario del propio modelo (`:877-886`) documenta que es un apartamiento consciente de la regla.
4. **Nota clínica:** ✅ **no es HTML ni rich text**. Son campos `String` tipados y `<textarea>` planos (`medicfy-frontend/apps/web/src/app/(app)/consulta/[appointmentId]/consulta-form.tsx:172-184`). No hay Tiptap/Quill/Slate/ProseMirror ni `dangerouslySetInnerHTML` en todo el frontend. Este punto está bien resuelto.
5. **Antecedentes longitudinales:** ⚠️ **uno de tres sí, dos no**.
   - `PatientHistoryItem` ✅ **sí** es longitudinal: cada UPDATE inserta el valor anterior en `PatientHistoryItemChange` (`prisma/schema.prisma:1085-1097`), con `changedByUserId` y `changedAt`, en una tabla append-only real por GRANT (`migrations/20260824101500_.../migration.sql:55-56`).
   - `PatientAllergy` ❌ **no**: `updateAllergy()` hace UPDATE en su lugar (`apps/api/src/modules/records/services/patient-clinical.service.ts:35-38`) y el GRANT incluso concede `DELETE` (`migrations/20260823224811_.../migration.sql:480`). El valor anterior se pierde.
   - `PatientMedication` ❌ **no**: mismo patrón (`patient-clinical.service.ts:62-72`, GRANT con `DELETE` en `:483`).
6. **Cálculos derivados:** ⚠️ **sólo el IMC, y bien hecho**.
   - IMC ✅ se calcula **siempre en servidor** y se guarda con `bmiFormula` + `bmiFormulaVersion` (`apps/api/src/common/vitals-calculations.util.ts:5-17`); `vitalsSchema` es `.strict()`, así que un cliente no puede ni enviarlo (verificado en `apps/api/src/modules/records/clinical-note-correction.integration.spec.ts:120-141`).
   - Escalas (Glasgow, Apgar) ✅ se recalculan en servidor y la versión del esquema queda fija en `EncounterSpecialtyData.specialtySchemaVersion` (`apps/api/src/modules/records/services/specialty-scale.service.ts:35-65`).
   - **Superficie corporal ❌ no existe. Percentilas pediátricas ❌ no existen. Índice tabáquico (paquetes-año) ❌ no existe** — `tabaquismo` es un subtipo de antecedente cuyo contenido cae en `freeText` (ej. real en las pruebas: `"10 cigarros/día desde los 20 años"`, `apps/api/src/modules/records/patient-history.integration.spec.ts:133`).
   - `computedFormula` **no es una fórmula**: es una lista de `fieldKey` separados por espacio que se **suman** (`specialty-scale.service.ts:13-17`). Sirve para Glasgow y Apgar; no expresa un percentil, un IMC ni una escala ponderada.

### Hallazgo transversal sobre R7

**Cero campos declaran su equivalencia FHIR.** La única terminología presente en el modelo es:
- `EncounterDiagnosis.icd10Code` (CIE-10, sin FK),
- `MedicationCatalog.atcCode` (ATC, opcional),
- `LabOrderItem.loincCode` (LOINC, opcional y **nunca capturado** — el panel de orden no tiene ese campo, `medicfy-frontend/apps/web/src/components/clinical/lab-order-panel.tsx:180`),
- `ClinicalCatalogTerm.codingSystem` (obligatorio, admite `"PROPIETARIO"` — `prisma/schema.prisma:1510-1513`). **Es lo único en todo el repositorio que cumple el espíritu de R7**, y aún así declara el sistema de codificación, no la equivalencia FHIR.

La documentación existente difiere FHIR explícitamente a v3.0 (`medicfy-backend/docs/ESPECIFICACION_TECNICA_MEDICFY_MVP.md:99` y `:186`). Es decir: **R7 no está incumplida por descuido, está incumplida por una decisión de alcance previa que contradice la regla permanente vigente.** Esto hay que resolverlo a nivel de gobierno del proyecto antes de tocar código.

### Colisión de numeración de reglas (bloqueante para la trazabilidad)

`medicfy-backend/CLAUDE.md` define su propio juego R1–R7 con significados **distintos** a las reglas permanentes que se auditan aquí:

| Regla | `CLAUDE.md:23-35` | Reglas permanentes (documento de gobierno) |
|---|---|---|
| R1 | Expediente append-only | Nada se borra |
| R2 | Ningún dato clínico por canal externo | Los catálogos son cerrados |
| **R3** | **Toda lectura se registra en `audit_log`** | **Texto libre sólo en razonamiento** |
| **R7** | **Datos sintéticos fuera de producción** | **Equivalencia HL7 FHIR declarada** |

Los comentarios del esquema citan la numeración de `CLAUDE.md`. Cualquier verificación automática de "R3" o "R7" contra este repositorio hoy verifica la regla equivocada. **Recomendación: renumerar o prefijar (`GOV-R3` vs `ENG-R3`) antes de la siguiente fase.**

---

## 1 · Tabla completa de campos clínicos

**Leyenda:**
🔴 = campo de diagnóstico, medicamento, signo vital, estudio o antecedente que **hoy es texto libre** (violación directa de R3).
🟡 = estructurado, pero el vocabulario cerrado vive en código Zod, no en una tabla de catálogo (tensión con R2/R3).
⚠️ = texto libre en una sección que R3 no autoriza explícitamente (objetivo/plan), pero que no es una de las cinco categorías nombradas.
✅ = cumple R3.
`?` = no me consta la equivalencia FHIR; no la invento.

> Los códigos LOINC citados provienen del perfil `vitalsigns` de FHIR. **Deben verificarse contra la publicación oficial de LOINC/HL7 antes de implementarse**; se incluyen como punto de partida, no como fuente.

### 1.1 `Patient` — `prisma/schema.prisma:461-504`

| Campo | Entidad | Tipo actual | ¿Debería ser estructurado? | Catálogo / terminología | Equivalencia FHIR |
|---|---|---|---|---|---|
| `birthDate` | Patient | `DateTime @db.Date` | ✅ ya lo es | — | `Patient.birthDate` |
| `sexAtBirth` | Patient | `enum SexAtBirth (F/M)` | ✅ ya lo es | — | `Patient.gender` (parcial: FHIR modela género administrativo, no sexo al nacer) |
| `genderIdentity` | Patient | `String?` (máx 60) | Sí — vocabulario cerrado | Catálogo propietario o value set nacional | `?` (no es elemento núcleo de `Patient`; existe como extensión) |
| 🔴 `bloodType` | Patient | `String?` (máx 10, sin validación) | **Sí** — es un resultado de laboratorio | LOINC (grupo ABO / factor Rh) | `Observation` (categoría `laboratory`), `Observation.valueCodeableConcept` |

### 1.2 `ClinicalEncounter` — `prisma/schema.prisma:803-838`

| Campo | Entidad | Tipo actual | ¿Debería ser estructurado? | Catálogo / terminología | Equivalencia FHIR |
|---|---|---|---|---|---|
| `encounterType` | ClinicalEncounter | `enum EncounterType` | ✅ ya lo es | — | `Encounter.class` / `Encounter.type` |
| 🔴 `draftContent` | ClinicalEncounter | `Json` (sin esquema en BD) | **Sí** — contiene motivo, padecimiento, **signos vitales**, exploración, análisis, plan y escalas sin tipar | ver §1.3 y §1.4 | `Composition` en estado `preliminary` |
| `signatureMethod` | ClinicalEncounter | `enum SignatureMethod?` | ✅ ya lo es | — | `Provenance.signature.type` |
| `contentHashSha256` / `previousHashSha256` | ClinicalEncounter | `String?` | ✅ ya lo es | — | `Provenance.signature.data` (`?` en cuanto al encadenamiento, que no es un patrón FHIR núcleo) |

### 1.3 `ClinicalNote` — `prisma/schema.prisma:843-861` (núcleo NOM-004)

| Campo | Entidad | Tipo actual | ¿Debería ser estructurado? | Catálogo / terminología | Equivalencia FHIR |
|---|---|---|---|---|---|
| ✅ `chiefComplaint` | ClinicalNote | `String` (3-500) | **No** — es subjetivo, R3 lo permite | — | `Encounter.reasonCode` / sección de `Composition` |
| ✅ `currentIllness` | ClinicalNote | `String` | **No** — subjetivo, R3 lo permite | — | `Composition.section` (narrativa de padecimiento actual) |
| 🔴 `vitals` | ClinicalNote | **`Json`** | **Sí** — debe ser una entidad `Observation`, una fila por medición | LOINC + UCUM | `Observation` (perfil `vitalsigns`) — hoy no hay recurso al que mapear |
| ⚠️ `physicalExam` | ClinicalNote | `String?` | Parcial — los hallazgos deberían codificarse; la narrativa es defendible | SNOMED CT para hallazgos | `Observation` (categoría `exam`) / `Composition.section` |
| ✅ `assessment` | ClinicalNote | `String` | **No** — es el análisis, R3 lo permite | — | `Composition.section` (razonamiento clínico) |
| ⚠️ `plan` | ClinicalNote | `String` | Parcial — R3 no lista "plan" como zona de texto libre; los fármacos y estudios ya viven estructurados en `Prescription`/`LabOrder` | — | `CarePlan` / `Composition.section` |
| ⚠️ `prognosis` | ClinicalNote | `String?` | Parcial — es juicio clínico | — | `?` |
| `isCorrectionOfNoteId` | ClinicalNote | `String?` (FK) | ✅ ya lo es | — | `Composition.relatesTo` (`code = replaces`) |

### 1.4 Subcampos de `vitals` (definidos sólo en Zod: `packages/contracts/src/schemas/clinical.schema.ts:8-19`)

Todos son 🔴: **numéricamente tipados en el contrato, pero sin código LOINC, sin unidad persistida, sin identidad propia en la base de datos.**

| Campo | Entidad | Tipo actual | ¿Debería ser estructurado? | Catálogo / terminología | Equivalencia FHIR |
|---|---|---|---|---|---|
| 🔴 `bpSystolic` | `vitals` (Json) | `number` 40-300 | Sí — columna/fila propia | LOINC 8480-6 (verificar) · UCUM `mm[Hg]` | `Observation.component.code` dentro del panel de TA (LOINC 85354-9) |
| 🔴 `bpDiastolic` | `vitals` (Json) | `number` 20-200 | Sí | LOINC 8462-4 (verificar) · UCUM `mm[Hg]` | `Observation.component.code` (mismo panel) |
| 🔴 `heartRate` | `vitals` (Json) | `number` 20-250 | Sí | LOINC 8867-4 (verificar) · UCUM `/min` | `Observation.code` + `valueQuantity` |
| 🔴 `respiratoryRate` | `vitals` (Json) | `number` 5-60 | Sí | LOINC 9279-1 (verificar) · UCUM `/min` | `Observation.code` + `valueQuantity` |
| 🔴 `tempC` | `vitals` (Json) | `number` 30-43 | Sí | LOINC 8310-5 (verificar) · UCUM `Cel` | `Observation.code` + `valueQuantity` |
| 🔴 `spo2` | `vitals` (Json) | `number` 50-100 | Sí | LOINC (SpO2 — verificar cuál del perfil) · UCUM `%` | `Observation.code` + `valueQuantity` |
| 🔴 `weightKg` | `vitals` (Json) | `number` 0.5-400 | Sí | LOINC 29463-7 (verificar) · UCUM `kg` | `Observation.code` + `valueQuantity` |
| 🔴 `heightCm` | `vitals` (Json) | `number` 20-250 | Sí | LOINC 8302-2 (verificar) · UCUM `cm` | `Observation.code` + `valueQuantity` |
| `bmi` | `vitals` (Json) | `number` derivado | ✅ calculado en servidor | LOINC 39156-5 (verificar) · UCUM `kg/m2` | `Observation.code` + `valueQuantity` (derivado) |
| `bmiFormula` | `vitals` (Json) | `String` constante | ✅ buena práctica (procedencia) | — | `Observation.method` / `Provenance` (`?`) |
| `bmiFormulaVersion` | `vitals` (Json) | `number` | ✅ buena práctica | — | `?` |

**Ausentes y esperables para el piloto:** superficie corporal (Mosteller/DuBois), percentilas OMS/CDC de peso, talla, perímetro cefálico e IMC (pediatría), índice tabáquico (paquetes-año), edad gestacional y fecha probable de parto (ginecología), TFG/CKD-EPI (medicina interna). **Ninguno existe hoy.**

### 1.5 `EncounterDiagnosis` — `prisma/schema.prisma:887-900`

| Campo | Entidad | Tipo actual | ¿Debería ser estructurado? | Catálogo / terminología | Equivalencia FHIR |
|---|---|---|---|---|---|
| 🔴 `icd10Code` | EncounterDiagnosis | `String?` **sin FK a `icd10_codes`** | **Sí** — FK obligatoria | CIE-10 (DGIS/CEMECE, ya sembrado) | `Condition.code.coding.code` |
| 🔴 `codeAbsentReason` | EncounterDiagnosis | `String?` (10-500, texto libre) | **Sí** — debe ser un motivo de un vocabulario cerrado, o eliminarse | Value set de `dataAbsentReason` | `Condition.code.extension[data-absent-reason]` (`?` en cuanto a la modelización exacta) |
| 🔴 `description` | EncounterDiagnosis | `String` obligatorio | **Sí** — hoy es el único contenido cuando no hay código | Debe derivarse del catálogo, no capturarse | `Condition.code.text` (complemento, nunca sustituto) |
| `diagnosisType` | EncounterDiagnosis | `enum PRINCIPAL/SECONDARY` | ✅ ya lo es | — | `Encounter.diagnosis.use` (`?` en cuanto al value set exacto) |
| `certainty` | EncounterDiagnosis | `enum SUSPECTED/CONFIRMED` | ✅ ya lo es | — | `Condition.verificationStatus` (`provisional` / `confirmed`) |

> **Defecto estructural adicional:** `EncounterDiagnosis` sólo referencia `encounterId`, no `noteId`. Al corregir una nota firmada, los diagnósticos de la corrección **se suman** a los del encuentro en vez de reemplazar a los de la nota original — documentado por el propio código en `apps/api/src/modules/records/services/clinical-encounter.service.ts:218-223`. Además el GRANT concede `UPDATE, DELETE` sobre `encounter_diagnoses` (`migrations/20260823224811_.../migration.sql:474`), de modo que un diagnóstico de una nota **ya firmada** puede alterarse o borrarse aunque `clinical_notes` esté protegida. Esto rompe R1.

### 1.6 `PatientAllergy` — `prisma/schema.prisma:973-991` (la peor entidad del modelo)

| Campo | Entidad | Tipo actual | ¿Debería ser estructurado? | Catálogo / terminología | Equivalencia FHIR |
|---|---|---|---|---|---|
| 🔴 `substance` | PatientAllergy | `String` libre | **Sí** — crítico para seguridad | Catálogo de agentes (dominio `ALERGIA_AGENTE` de `ClinicalCatalogTerm`) / SNOMED CT / ATC | `AllergyIntolerance.code` |
| 🔴 `allergyType` | PatientAllergy | `String` libre (pista de UI: "p. ej. medicamento, alimento") | **Sí** — FHIR ya define el value set cerrado | `food` \| `medication` \| `environment` \| `biologic` | `AllergyIntolerance.category` |
| 🔴 `reaction` | PatientAllergy | `String?` libre | **Sí** | SNOMED CT (manifestaciones) | `AllergyIntolerance.reaction.manifestation` |
| 🔴 `severity` | PatientAllergy | `String` libre — el propio frontend lo documenta como "texto libre del médico, no un enum" (`medicfy-frontend/apps/web/src/components/clinical/allergy-summary.tsx:6`) | **Sí** — FHIR ya define el value set cerrado | `mild` \| `moderate` \| `severe` | `AllergyIntolerance.reaction.severity` (y `AllergyIntolerance.criticality` para el riesgo vital) |
| 🔴 `ageOfOnset` | PatientAllergy | `String?` libre | **Sí** — edad o fecha tipada | UCUM (`a`) | `AllergyIntolerance.onsetAge` / `onsetDateTime` |
| `status` | PatientAllergy | `enum ACTIVE/INACTIVE/RULED_OUT` | ✅ ya lo es | — | `AllergyIntolerance.clinicalStatus` (+ `verificationStatus = refuted` para `RULED_OUT`) |
| `certainty` | PatientAllergy | `enum CONFIRMED/LIKELY/UNCERTAIN` | ✅ ya lo es | — | `AllergyIntolerance.verificationStatus` |
| 🔴 `source` | PatientAllergy | `String` libre ("p. ej. referida por paciente") | **Sí** — vocabulario cerrado de informante | Value set propietario | `AllergyIntolerance.asserter` / `Provenance.agent` |
| `lastReviewedAt` | PatientAllergy | `DateTime` | ✅ ya lo es | — | `?` (no hay elemento núcleo de "última revisión" en `AllergyIntolerance`) |

> **Riesgo clínico concreto:** el cruce automático receta↔alergia (M8-RN-008 / M9-RN-008a) se ejecuta contra estas cadenas. "Penicilina", "penicilinas", "PNC" y "alergia a la penicilina" son cuatro alergias distintas para el sistema.

### 1.7 `PatientMedication` — `prisma/schema.prisma:1004-1024`

| Campo | Entidad | Tipo actual | ¿Debería ser estructurado? | Catálogo / terminología | Equivalencia FHIR |
|---|---|---|---|---|---|
| 🔴 `genericName` | PatientMedication | `String` libre, **sin FK a `medications_catalog`** | **Sí** | Catálogo de medicamentos / ATC | `MedicationStatement.medication[x]` → `Medication.code` |
| 🔴 `brandName` | PatientMedication | `String?` libre | **Sí** | Catálogo (`brandNames[]`) | `Medication.code.coding` (denominación distintiva) |
| 🔴 `dose` | PatientMedication | `String` libre | **Sí** — valor + unidad | UCUM | `Dosage.doseAndRate.doseQuantity` |
| 🔴 `route` | PatientMedication | `String` libre | **Sí** | Value set de vías (SNOMED CT / EDQM) | `Dosage.route` |
| 🔴 `frequency` | PatientMedication | `String` libre | **Sí** | Timing estructurado | `Dosage.timing` |
| `startedAt` / `suspendedAt` | PatientMedication | `DateTime? @db.Date` | ✅ ya lo es | — | `MedicationStatement.effectivePeriod` |
| ⚠️ `reason` | PatientMedication | `String?` libre | Parcial — motivo de inicio/suspensión | CIE-10 / SNOMED CT | `MedicationStatement.reasonCode` |
| `status` | PatientMedication | `enum ACTIVE/SUSPENDED/COMPLETED` | ✅ ya lo es | — | `MedicationStatement.status` |
| 🔴 `prescriber` | PatientMedication | `String?` libre | **Sí** — referencia, no cadena | — | `MedicationStatement.informationSource` → `Practitioner` |
| 🔴 `source` | PatientMedication | `String` libre | **Sí** — vocabulario cerrado | Value set propietario | `MedicationStatement.informationSource` |

> El chequeo de duplicidad terapéutica (M9-RN-008c) corre sobre estas cadenas libres.

### 1.8 `PatientHistoryItem` + `PatientHistoryItemChange` — `prisma/schema.prisma:1052-1097`

| Campo | Entidad | Tipo actual | ¿Debería ser estructurado? | Catálogo / terminología | Equivalencia FHIR |
|---|---|---|---|---|---|
| `category` | PatientHistoryItem | `enum` (AHF/APNP/APP) | ✅ ya lo es | — | `FamilyMemberHistory` (AHF) · `Condition`/`Procedure`/`Observation` (APP/APNP) |
| 🟡 `subtype` | PatientHistoryItem | `String` — vocabulario cerrado **en Zod**, no en catálogo (`clinical.schema.ts:153-190`) | Sí — debe vivir en `ClinicalCatalogTerm` | Catálogo propietario + SNOMED CT | `FamilyMemberHistory.condition.code` / `Condition.code` |
| 🟡 `familyRelationship` | PatientHistoryItem | `String` default `"NONE"` — vocabulario en Zod | Sí — value set FHIR ya existe | `v3-RoleCode` (MTH, FTH, …) | `FamilyMemberHistory.relationship` |
| ⚠️ `familyRelationshipDetail` | PatientHistoryItem | `String?` libre | Aceptable como precisión | — | `FamilyMemberHistory.name` (`?`) |
| `status` | PatientHistoryItem | `enum PRESENTE/NEGADO/DESCONOCIDO/NO_INVESTIGADO` | ✅ **excelente** — distingue negado de no investigado | — | `Condition.verificationStatus` (`refuted`) + `FamilyMemberHistory.dataAbsentReason` |
| 🔴 `structuredValue` | PatientHistoryItem | `Json?` — **declarado y nunca escrito**: el frontend sólo envía `freeText` (`medicfy-frontend/apps/web/src/components/clinical/antecedentes-editor.tsx:118-139`) | **Sí** — es el campo correcto, está muerto | Por subtipo | `Observation.value[x]` / `FamilyMemberHistory.condition` |
| 🔴 `freeText` | PatientHistoryItem | `String?` (máx 1000) — **contiene todo el contenido real del antecedente** | **Sí** | Por subtipo: tabaquismo → LOINC + paquetes-año; vacunación → `Immunization`; cirugías → `Procedure`; transfusiones → `Procedure` | según subtipo (ver arriba) |
| 🔴 `previousFreeText` | PatientHistoryItemChange | `String?` | Espejo del anterior | — | `Provenance` sobre el recurso versionado |
| `previousStatus` / `previousStructuredValue` | PatientHistoryItemChange | `enum?` / `Json?` | ✅ mecanismo correcto | — | `Provenance` / historial de versiones del recurso |
| `changedByUserId` / `changedAt` | PatientHistoryItemChange | `String` / `DateTime` | ✅ ya lo es | — | `Provenance.agent` / `Provenance.recorded` |

### 1.9 Escalas por especialidad — `prisma/schema.prisma:1175-1212`

| Campo | Entidad | Tipo actual | ¿Debería ser estructurado? | Catálogo / terminología | Equivalencia FHIR |
|---|---|---|---|---|---|
| `fieldKey` | SpecialtyFieldSchema | `String` | ✅ ya lo es (clave de esquema) | — | `Questionnaire.item.linkId` |
| `label` | SpecialtyFieldSchema | `String` | ✅ etiqueta de presentación | — | `Questionnaire.item.text` |
| ⚠️ `unit` | SpecialtyFieldSchema | `String?` libre | **Sí** — debe ser UCUM | UCUM | `Questionnaire.item.extension[questionnaire-unit]` (`?`) |
| `minValue` / `maxValue` | SpecialtyFieldSchema | `Float?` | ✅ ya lo es | — | `Questionnaire.item.extension[minValue/maxValue]` (`?`) |
| `options` | SpecialtyFieldSchema | `Json` | ✅ es un value set embebido; mejor como `ValueSet` | — | `Questionnaire.item.answerOption` / `ValueSet` |
| ⚠️ `computedFormula` | SpecialtyFieldSchema | `String?` — lista de claves separadas por espacio que se **suman**, no una fórmula (`specialty-scale.service.ts:13-17`) | Sí — expresión versionada y tipada | — | `Questionnaire.item.extension[calculatedExpression]` (`?`) |
| `data` | EncounterSpecialtyData | `Json` `{value, interpretation}` | Parcial — calculado en servidor ✅, pero sin código por escala | LOINC por escala (Glasgow, Apgar) — `?` en cuanto a los códigos exactos | `Observation` con `component` por reactivo + total |
| `specialtySchemaVersion` | EncounterSpecialtyData | `Int` | ✅ **buena práctica** (fija la versión de cálculo) | — | `Observation.method` / `Provenance` (`?`) |

> **Fragilidad detectada:** la versión que se persiste es `fields[0]?.version ?? 1` — la versión del *primer* campo devuelto por la consulta (`apps/api/src/modules/records/services/clinical-encounter.service.ts:55`). Si dos escalas conviven con versiones distintas, la versión guardada es incorrecta.
> **Cobertura:** sólo hay filas sembradas para Glasgow y Apgar, con `specialtyId = null` (`prisma/seed.ts:146-176`). **Ginecología, pediatría y medicina interna tienen cero filas** — el propio esquema lo documenta (`prisma/schema.prisma:1170-1174`). Tres de las cuatro especialidades del piloto no tienen ni un campo propio.

### 1.10 `Prescription` / `PrescriptionItem` — `prisma/schema.prisma:1248-1357`

| Campo | Entidad | Tipo actual | ¿Debería ser estructurado? | Catálogo / terminología | Equivalencia FHIR |
|---|---|---|---|---|---|
| 🔴 `diagnosisSnapshot` | Prescription | `String` libre — **desligado a propósito** de `EncounterDiagnosis` (`packages/contracts/src/schemas/prescription.schema.ts:33-38`) | **Sí** — debe referenciar el diagnóstico codificado | CIE-10 | `MedicationRequest.reasonCode` / `reasonReference` |
| ⚠️ `generalInstructions` | Prescription | `String?` libre | Aceptable (instrucción al paciente) | — | `Dosage.patientInstruction` / `MedicationRequest.note` |
| `patientAgeSnapshot` / `patientSexSnapshot` | Prescription | `Int` / `String` | Snapshot legal ✅ | — | `Patient` (snapshot, art. 33 RIS) |
| ⚠️ `deliveredVia` | Prescription | `String[]` libre | Sí — vocabulario cerrado | Value set propietario | `?` |
| 🔴 `medicationCatalogId` | PrescriptionItem | `String?` **nullable** — obligatorio en la ruta electrónica (`prescription.schema.ts:14`) pero **la ruta `EXTERNAL_PHYSICAL` acepta `genericName` libre** (`prescription.schema.ts:86`) | **Sí** — no nullable | `medications_catalog` | `MedicationRequest.medicationReference` |
| 🔴 `genericName` | PrescriptionItem | `String` — copiado del catálogo en la ruta electrónica, **libre** en la física | Sí | ATC / catálogo | `Medication.code` |
| ⚠️ `brandName` / `presentation` | PrescriptionItem | `String?` / `String` | Snapshot del catálogo ✅ | — | `Medication.code` / `Medication.form` |
| 🔴 `dose` | PrescriptionItem | `String` libre | **Sí** | UCUM | `Dosage.doseAndRate.doseQuantity` |
| 🔴 `route` | PrescriptionItem | `String` libre | **Sí** | SNOMED CT / EDQM | `Dosage.route` |
| 🔴 `frequency` | PrescriptionItem | `String` libre | **Sí** | Timing | `Dosage.timing` |
| 🔴 `duration` | PrescriptionItem | `String` libre | **Sí** | UCUM (`d`, `wk`) | `Dosage.timing.repeat.bounds[x]` |
| 🔴 `quantity` | PrescriptionItem | `String?` — **una cantidad guardada como cadena** | **Sí** | UCUM | `MedicationRequest.dispenseRequest.quantity` |
| ⚠️ `specialInstructions` | PrescriptionItem | `String?` libre | Aceptable | — | `Dosage.patientInstruction` |
| `controlGroup` | PrescriptionItem | `enum ControlGroup` (I-VI) | ✅ snapshot del catálogo | COFEPRIS | `?` (clasificación nacional, sin equivalente FHIR núcleo — documentar como extensión nacional) |
| `reason` | PrescriptionCancellation | `String` libre | Aceptable (razonamiento) | — | `MedicationRequest.statusReason` |

### 1.11 `MedicationCatalog` — `prisma/schema.prisma:1129-1145`

| Campo | Entidad | Tipo actual | ¿Debería ser estructurado? | Catálogo / terminología | Equivalencia FHIR |
|---|---|---|---|---|---|
| `genericName` | MedicationCatalog | `String` — es el término del catálogo | Parcial — sin código propio más allá de ATC | ATC / denominación genérica | `Medication.code` |
| `brandNames` | MedicationCatalog | `String[]` | Aceptable como sinónimos | — | `Medication.code.coding` (designaciones) |
| 🔴 `presentations` | MedicationCatalog | `Json` con etiquetas libres (`[{label: "Tableta 500 mg"}]`) | **Sí** — forma + concentración + unidad tipadas | UCUM + value set de formas farmacéuticas | `Medication.form` + `Medication.ingredient.strength` |
| `atcCode` | MedicationCatalog | `String?` | ✅ declara terminología (aunque opcional) | ATC (OMS) | `Medication.code.coding.system = ATC` |
| `controlGroup` | MedicationCatalog | `enum` | ✅ ya lo es | COFEPRIS | `?` (extensión nacional) |
| ⚠️ `commonDoses` | MedicationCatalog | `Json?` sin esquema | Sí | UCUM | `?` |
| 🔴 `contraindications` | MedicationCatalog | `String[]` libre | **Sí** | SNOMED CT | `?` (`Medication` no tiene elemento de contraindicación; existe `ClinicalUseDefinition` en R5) |

> El catálogo está sembrado con **medicamentos sintéticos de ejemplo**, no con un vademécum real — así lo documenta el propio esquema (`prisma/schema.prisma:1124-1128`).

### 1.12 `Icd10Code` — `prisma/schema.prisma:1105-1111`

| Campo | Entidad | Tipo actual | ¿Debería ser estructurado? | Catálogo / terminología | Equivalencia FHIR |
|---|---|---|---|---|---|
| `code` | Icd10Code | `String @id` | ✅ ya lo es | CIE-10 (DGIS/CEMECE, CC-BY-4.0) | `CodeSystem.concept.code` |
| `description` | Icd10Code | `String` | ✅ es el término oficial | CIE-10 | `CodeSystem.concept.display` |

> **Nadie lo referencia por llave foránea.** Es un catálogo correcto, cerrado y oficial, usado sólo como buscador de solo lectura (`apps/api/src/modules/records/icd10.controller.ts`).

### 1.13 `LabOrder` / `LabOrderItem` / `LabResult` — `prisma/schema.prisma:1385-1475`

| Campo | Entidad | Tipo actual | ¿Debería ser estructurado? | Catálogo / terminología | Equivalencia FHIR |
|---|---|---|---|---|---|
| 🔴 `clinicalIndication` | LabOrder | `String` libre obligatorio | **Sí** — es el diagnóstico que motiva el estudio | CIE-10 | `ServiceRequest.reasonCode` |
| `fastingRequired` | LabOrder | `Boolean` | ✅ ya lo es | — | `?` (sin elemento núcleo; `ServiceRequest.patientInstruction` como texto) |
| 🔴 `studyName` | LabOrderItem | `String` libre — **no existe ninguna tabla de catálogo de estudios en todo el esquema** | **Sí** | LOINC (el propio MVP lo prevé: `docs/ESPECIFICACION_TECNICA_MEDICFY_MVP.md:983`, ~150 estudios) | `ServiceRequest.code` |
| 🔴 `loincCode` | LabOrderItem | `String?` — opcional, sin FK, **nunca capturado en la interfaz** (`lab-order-panel.tsx:180` sólo pide `studyName`) | **Sí** — obligatorio y validado | LOINC | `ServiceRequest.code.coding` |
| ⚠️ `notes` | LabOrderItem | `String?` libre | Aceptable | — | `ServiceRequest.note` |
| 🔴 `fileKey` (contenido del resultado) | LabResult | `String` → PDF cifrado | **Sí** — los resultados deberían ser observaciones discretas con valor, unidad y rango de referencia | LOINC + UCUM | hoy `DiagnosticReport.presentedForm`; debería ser `Observation` por analito |
| ⚠️ `labName` | LabResult | `String?` libre | Sí — referencia a organización | Registro de laboratorios | `DiagnosticReport.performer` → `Organization` |
| `resultDate` | LabResult | `DateTime? @db.Date` | ✅ ya lo es | — | `DiagnosticReport.effectiveDateTime` |
| ✅ `doctorComment` | LabResult | `String?` libre | **No** — es interpretación, R3 lo permite | — | `DiagnosticReport.conclusion` |
| `reason` | LabOrderCancellation | `String` libre | Aceptable (razonamiento) | — | `ServiceRequest.statusReason` (`?`) |

### 1.14 `ClinicalAttachment` — `prisma/schema.prisma:915-933`

| Campo | Entidad | Tipo actual | ¿Debería ser estructurado? | Catálogo / terminología | Equivalencia FHIR |
|---|---|---|---|---|---|
| `category` | ClinicalAttachment | `enum` (LAB_RESULT, IMAGING, …) | ✅ ya lo es | — | `DocumentReference.category` |
| ⚠️ `description` | ClinicalAttachment | `String?` libre | Aceptable | — | `DocumentReference.description` |
| `fileHashSha256` / `mimeType` / `sizeBytes` / `fileName` | ClinicalAttachment | `String` / `Int` | ✅ ya lo es | — | `DocumentReference.content.attachment.{hash, contentType, size, title}` |

### 1.15 Contexto clínico en otras entidades

| Campo | Entidad | Tipo actual | ¿Debería ser estructurado? | Catálogo / terminología | Equivalencia FHIR |
|---|---|---|---|---|---|
| `modality` | Appointment | `enum IN_PERSON/ONLINE` | ✅ ya lo es | — | `Encounter.class` (`virtual` / `ambulatory`) |
| ⚠️ `completedWithoutNoteReason` | Appointment | `String?` libre | Sí — motivo de un vocabulario cerrado | Value set propietario | `?` |
| ⚠️ `content` | NoteTemplate | `String` libre (texto del médico, insertado en la nota) | No es dato del paciente, pero **inyecta texto libre en la nota** | — | `?` (no es un recurso clínico) |

### 1.16 `ClinicalCatalogTerm` — `prisma/schema.prisma:1494-1528` (sin commitear)

Es la **infraestructura correcta**, y hoy está **desconectada de todo**: sin controlador, sin rol curador, sin una sola llave foránea desde ninguna entidad clínica, y con la tabla vaciada por la migración `20260826200932` (`TRUNCATE`). El servicio lo documenta: *"sin controller todavía"* (`apps/api/src/modules/catalog/services/clinical-catalog.service.ts:11-15`).

| Campo | Entidad | Tipo actual | ¿Debería ser estructurado? | Catálogo / terminología | Equivalencia FHIR |
|---|---|---|---|---|---|
| `domain` | ClinicalCatalogTerm | `String` (no enum, a propósito) | Aceptable por ahora | — | `CodeSystem.url` |
| `key` | ClinicalCatalogTerm | `String` | ✅ ya lo es | — | `CodeSystem.concept.code` |
| `preferredTerm` | ClinicalCatalogTerm | `String` | ✅ ya lo es | — | `CodeSystem.concept.display` |
| `normalizedTerm` | ClinicalCatalogTerm | `String` calculado en servidor | ✅ **buena práctica** (antiduplicados) | — | `?` |
| `synonyms` | ClinicalCatalogTerm | `String[]` | ✅ ya lo es | — | `CodeSystem.concept.designation` |
| `externalCode` | ClinicalCatalogTerm | `String?` | ✅ ya lo es | según `codingSystem` | `Coding.code` |
| `codingSystem` | ClinicalCatalogTerm | `String` **nunca nulo** (admite `"PROPIETARIO"`) | ✅ **es lo único del repo alineado con el espíritu de R7** | — | `Coding.system` |
| `status` / `mergedIntoId` | ClinicalCatalogTerm | `enum` / `String?` | ✅ ya lo es | — | `CodeSystem.concept.property` / `ConceptMap` |

---

## 2 · Los cinco peores casos

| # | Entidad · Campo | Ubicación | Por qué es el peor |
|---|---|---|---|
| **1** | `ClinicalNote.vitals` (y los 8 signos vitales dentro) | `prisma/schema.prisma:848` | Todos los signos vitales del expediente viven en **un `Json` sin esquema**. No hay entidad de observación, ni unidad persistida, ni LOINC, ni marca de tiempo o autor por medición. La separación sistólica/diastólica —bien hecha— existe sólo en Zod y en el formulario; la base de datos no la conoce. Imposible graficar tendencias, disparar alertas o exportar. Es el campo con más consecuencias aguas abajo. |
| **2** | `PatientAllergy.substance` + `.severity` + `.allergyType` + `.reaction` | `prisma/schema.prisma:976-979` | El cruce de seguridad receta↔alergia corre contra **cadenas libres**. `severity` y `allergyType` tienen value sets **cerrados y ya definidos por FHIR** que aquí son texto. Peor: la fila se sobrescribe con `UPDATE` (`patient-clinical.service.ts:35-38`) y el GRANT concede `DELETE` (`migrations/20260823224811_.../migration.sql:480`) — **no es longitudinal y viola R1**. |
| **3** | `EncounterDiagnosis.icd10Code` (nullable, sin FK) + `.codeAbsentReason` + `.description` | `prisma/schema.prisma:890-892` | Una nota **firmada** puede quedar con un diagnóstico sin ningún código, cuyo único contenido es texto libre. Y aun cuando el código está, es un `String` suelto sin FK a `icd10_codes`, un catálogo que existe con 12,500 códigos oficiales. Además `encounter_diagnoses` admite `UPDATE`/`DELETE` por GRANT (`:474`), así que los diagnósticos de una nota firmada son mutables. |
| **4** | `PatientMedication.genericName` + `.dose` + `.route` + `.frequency` | `prisma/schema.prisma:1007-1011` | La conciliación de medicamentos habituales —base del chequeo de duplicidad terapéutica M9-RN-008c— es texto libre sin FK a `medications_catalog`. Misma pérdida de historial que las alergias. |
| **5** | `LabOrderItem.studyName` + `.loincCode` | `prisma/schema.prisma:1439-1440` | **No existe ninguna tabla de catálogo de estudios en el esquema.** El nombre del estudio se teclea libre y `loincCode` —el único gancho a terminología— es opcional, sin FK y **jamás se captura**: el panel de orden no tiene ese campo (`lab-order-panel.tsx:180`). Y los resultados vuelven como PDF, no como observaciones con valor y rango de referencia. |

**Menciones deshonrosas:** `Prescription.diagnosisSnapshot` (diagnóstico libre en un documento legal), `PatientHistoryItem.freeText` (todo el contenido de antecedentes, con `structuredValue` declarado y muerto al lado), `Patient.bloodType` (`String?` sin validar), `MedicationCatalog.presentations` (`Json` con etiquetas libres).

---

## 3 · Cambios que **exigen migración de datos existentes**

> Marcados `[A]` los que además chocan con una tabla append-only por GRANT: la migración no puede ejecutarla `medicfy_app`, requiere el rol propietario y es en sí misma un evento de gobierno que hay que documentar.

1. **`ClinicalNote.vitals` `Json` → entidad de observaciones** (una fila por medición, con LOINC y unidad UCUM). Hay que leer cada nota existente y explotar su JSON. `[A]` — `clinical_notes` sólo tiene `SELECT, INSERT` (`migrations/20260813205117_.../migration.sql:37-38`).
2. **`ClinicalEncounter.draftContent`** — los borradores en curso contienen vitales y escalas con la forma vieja; hay que transformarlos o invalidarlos en el corte.
3. **`PatientAllergy.substance` → FK a catálogo.** Las filas existentes traen texto libre que **requiere curación humana** (R2: el alta de términos es un flujo con rol curador). No es un `UPDATE` mecánico.
4. **`PatientAllergy.allergyType` → enum FHIR** (`food|medication|environment|biologic`) y **`.severity` → enum** (`mild|moderate|severe`): mapeo de cadenas libres, con filas que no encajarán.
5. **`PatientAllergy.ageOfOnset` `String` → edad/fecha tipada**: parseo de texto libre.
6. **`PatientMedication.genericName`/`brandName` → `medicationCatalogId` NOT NULL**: mapeo contra catálogo; habrá filas sin correspondencia.
7. **`PatientMedication.dose`/`route`/`frequency` → dosificación estructurada** (valor+unidad+timing): parseo de texto libre.
8. **`EncounterDiagnosis.icd10Code` → `NOT NULL` + FK a `icd10_codes`**: las filas con `codeAbsentReason` **no pueden** satisfacer `NOT NULL` sin una decisión de producto previa; además el `ADD CONSTRAINT` fallará con cualquier código huérfano que no exista en el catálogo. Requiere validación previa de todas las filas.
9. **`PrescriptionItem.dose`/`route`/`frequency`/`duration`/`quantity` → estructurados.** `[A]` — `prescriptions` es `SELECT, INSERT` (`:512-513`) **y** son snapshots legales inmutables (R6). No se pueden reescribir: sólo cabe **agregar columnas nuevas con fecha de corte** y dejar las filas viejas con la cadena. Es una migración de esquema con convivencia, no un backfill.
10. **`LabOrderItem.studyName` → FK a un catálogo de estudios nuevo** + `loincCode` obligatorio. Las órdenes ya emitidas necesitan mapeo o convivencia. `[A]` — `lab_orders` es `SELECT, INSERT` (`:525-526`).
11. **`Patient.bloodType` `String?` → codificado**: normalizar los valores existentes.
12. **`PatientHistoryItem.freeText` → `structuredValue` por subtipo**: hoy todo el contenido está en `freeText`; moverlo exige parseo por subtipo (tabaquismo, alcohol, cirugías…).
13. **`MedicationCatalog.presentations` `Json` → forma + concentración + unidad tipadas**: reescritura del catálogo sembrado.
14. **Historial longitudinal de `PatientAllergy` y `PatientMedication`** (tablas `*_changes` espejo de `PatientHistoryItemChange`): la tabla nueva es aditiva, **pero los valores anteriores ya destruidos por los `UPDATE` en su lugar son irrecuperables**. La migración no puede reconstruirlos; hay que declararlo como pérdida asumida y fechar el inicio del historial.
15. **Revocar `DELETE` sobre `patient_allergies`, `patient_medications`, `encounter_diagnoses`, `lab_order_items`** (`migrations/20260823224811_.../migration.sql:474, 480, 483, 498`) para cumplir R1: es una migración de permisos que puede romper código existente que hoy borra filas.

## 4 · Cambios que **no exigen migración de datos**

1. **Registro de equivalencias FHIR (R7)** — tabla de mapeo o anotaciones en el esquema/contratos declarando recurso y elemento por campo, más la razón documentada donde no haya equivalente (COFEPRIS `controlGroup`, encadenamiento de hashes, `codeAbsentReason`). Puramente aditivo. **Es el primer paso y no toca un solo dato.**
2. **Resolver la colisión de numeración R1–R8** entre `medicfy-backend/CLAUDE.md:23-35` y las reglas permanentes de gobierno. Documental.
3. **Conectar `ClinicalCatalogTerm`**: controlador, rol curador, endpoints de alta. La tabla está **vacía** (la migración `20260826200932` la truncó), así que sembrarla y exponerla es alta de datos, no migración.
4. **Sembrar dominios de catálogo** (`ALERGIA_AGENTE`, `VIA_ADMINISTRACION`, `SEVERIDAD_ALERGIA`, `FUENTE_INFORMACION`, `FORMA_FARMACEUTICA`, estudios de laboratorio) — filas nuevas.
5. **Crear la tabla de catálogo de estudios vacía** — aditivo; sólo la FK en `lab_order_items` cae en §3.
6. **Sembrar `SpecialtyFieldSchema` para ginecología, pediatría y medicina interna** — el propio esquema declara que son datos, no migración (`prisma/schema.prisma:1170-1174`).
7. **Añadir calculadoras derivadas junto a `withComputedVitals`**: superficie corporal, percentilas OMS/CDC, índice tabáquico, edad gestacional, TFG — con su fórmula y versión, igual que `bmiFormula`/`bmiFormulaVersion` (`vitals-calculations.util.ts:5-6`). Aplican a notas nuevas; las viejas conservan su cálculo, que es exactamente lo que M8-RN-014 pide.
8. **Endurecer los contratos Zod primero** (convertir `severity`, `allergyType`, `source`, `route` en enums) para que **las escrituras nuevas** ya nazcan limpias mientras se cura el histórico. Sin cambio de base de datos.
9. **Añadir `noteId` nullable a `EncounterDiagnosis`** para cerrar el defecto de las correcciones (`clinical-encounter.service.ts:218-223`): columna nueva, filas existentes en `null`.
10. **Capturar `loincCode` en el panel de orden de laboratorio** (`lab-order-panel.tsx`) — sólo frontend.
11. **Corregir `fields[0]?.version ?? 1`** por la versión real de los campos usados (`clinical-encounter.service.ts:55`) — sólo código.
12. **Escribir `structuredValue` desde el editor de antecedentes** (`antecedentes-editor.tsx:118-139`): la columna ya existe y admite `null`; empezar a poblarla no migra nada.

---

## 5 · Orden recomendado

1. Declarar las equivalencias FHIR de los 118 campos (§4.1) y resolver la contradicción de alcance con `docs/ESPECIFICACION_TECNICA_MEDICFY_MVP.md:186`. **No toca datos y desbloquea todo lo demás.**
2. Conectar `ClinicalCatalogTerm` y sembrar dominios (§4.3-4.4).
3. Endurecer contratos Zod para que lo nuevo nazca limpio (§4.8).
4. Sacar los signos vitales del `Json` a entidad propia (§3.1) — el cambio de mayor rendimiento clínico.
5. Alergias y medicamentos: catálogo + historial longitudinal (§3.3-3.7, §3.14).
6. Diagnósticos: FK obligatoria y decisión sobre `codeAbsentReason` (§3.8).
7. Catálogo de estudios y resultados discretos (§3.10).
