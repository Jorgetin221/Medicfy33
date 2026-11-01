# Mapeo FHIR — International Patient Summary (R7)

**PR-EXP-04.** Declaración de equivalencia, campo por campo, entre el Resumen clínico compartible (`SharedSummaryService`/`sharedRecordSummarySchema`) y los recursos del [International Patient Summary (IPS) de HL7 FHIR](http://hl7.org/fhir/uv/ips/). **No se implementa exportación FHIR real aquí** — la prueba 31.5 (exportación validada) sigue diferida por la misma decisión previa de Jorge que ya aplicó en la Fase 3 del track de los 58 prompts (`docs/auditoria/ESTADO-Y-SIGUIENTE-PASO.md`); esto es solo la declaración de correspondencia, R7 (CLAUDE.md §4).

## Alergias → `AllergyIntolerance`

| Campo del resumen (`sharedRecordAllergySchema`) | Elemento FHIR IPS |
|---|---|
| `substance` | `AllergyIntolerance.code` (vía `catalogTermId` del dominio `ALERGIA_AGENTE`, no codificado aquí a SNOMED — 🔒 pendiente de licencia, ver `00-DESCUBRIMIENTO.md` Q12) |
| `allergyType` | `AllergyIntolerance.category` |
| `severity` | `AllergyIntolerance.reaction.severity` |
| `reaction` | `AllergyIntolerance.reaction.manifestation` (texto, sin codificar) |
| `certainty` | `AllergyIntolerance.verificationStatus` |
| `status` | `AllergyIntolerance.clinicalStatus` |

## Medicación vigente → `MedicationStatement`

| Campo | Elemento FHIR IPS |
|---|---|
| `genericName`/`brandName` | `MedicationStatement.medicationCodeableConcept` (texto; sin `atcCode` resuelto — `PatientMedication` no tiene FK al catálogo, ver `04-resumen-clinico-compartible.md` hallazgo 4) |
| `dose`/`route`/`frequency` | `MedicationStatement.dosage` |
| `status` | `MedicationStatement.status` |

## Diagnósticos activos → `Condition`

| Campo | Elemento FHIR IPS |
|---|---|
| `icd10Code` | `Condition.code` (ICD-10) |
| `description` | `Condition.code.text` (cuando no hay código — caso `codeAbsentReason`) |
| `certainty` | `Condition.verificationStatus` (`SUSPECTED`→`provisional`, `CONFIRMED`→`confirmed`) |
| `diagnosisType` | `Condition.category` (`PRINCIPAL`/`SECONDARY`) |
| `firstRecordedAt` | `Condition.recordedDate` |

Mismo mapeo que ya declaró el prompt 28 (Fase 3) para `EncounterDiagnosis` — aquí solo se hereda, filtrado por el servidor (RE3/D-EXP-08) antes de llegar a este resumen.

## Últimos signos vitales → `Observation`

| Campo | Elemento FHIR IPS (LOINC) |
|---|---|
| `bpSystolicMmHg` | `Observation` 8480-6 |
| `bpDiastolicMmHg` | `Observation` 8462-4 |
| `heartRateBpm` | `Observation` 8867-4 |
| `respiratoryRateBpm` | `Observation` 9279-1 |
| `temperatureC` | `Observation` 8310-5 |
| `spo2Percent` | `Observation` 59408-5 |
| `weightKg` | `Observation` 29463-7 |
| `heightCm` | `Observation` 8302-2 |

Códigos LOINC heredados tal cual del comentario de `VitalSignSet` en `schema.prisma` (prompt 26, Fase 3) — no redeclarados aquí. `bmi` no tiene código LOINC declarado en ese comentario original; **39156-5** (LOINC estándar para "Body mass index (BMI) [Ratio]") se agrega aquí por primera vez para este mapeo — declaración nueva de esta fase, no heredada.

## Embarazo activo → `Pregnancy status` (perfil IPS)

| Campo | Elemento FHIR IPS |
|---|---|
| `eddDate` | `Observation` (perfil "Pregnancy Edd") |
| `eddMethod` | `Observation.method` |
| `gestationalAge` | `Observation` (perfil "Pregnancy Gestational Age") |

Exclusión por `pregnancyExcluded` (D-EXP-09): no tiene equivalente FHIR — es un control de acceso de esta función, no un dato clínico.

## Resultados recientes → `DiagnosticReport` / `Observation`

| Campo | Elemento FHIR IPS |
|---|---|
| `analyteName`/`loincCode` (no expuesto en el resumen — ver nota) | `Observation.code` |
| `value`/`unit` | `Observation.valueQuantity` |
| `referenceMin`/`referenceMax` | `Observation.referenceRange` |
| `measuredAt` | `Observation.effectiveDateTime` |

Nota: `loincCode` existe en `LabResultAnalyte` pero no se expone todavía en `sharedRecordResultSchema` — se agrega cuando haga falta para una exportación real (no antes, REGLA CERO).

## Notas firmadas → `DiagnosticReport`/`Composition` (fuera del IPS estricto, pero equivalente usado por M8)

Mismo mapeo que declaró el prompt 25 (Fase 3) para `ClinicalNote` (`Composition`/`ClinicalImpression`) — heredado sin cambios; aquí solo se filtra por encuentro sensible antes de servirse (ver `shared-summary.service.ts`).

## Antecedentes relevantes, recetas, órdenes

Sin mapeo FHIR declarado en esta fase — **⚠️ pendiente**: "Antecedentes relevantes" no tiene filtro de sensibles cerrado todavía (hallazgo 6 del plan), y recetas/órdenes de estudio usan los mapeos ya declarados para `Prescription`/`LabOrder` en sus propios módulos (Fase 4), sin necesidad de redeclararlos aquí.
