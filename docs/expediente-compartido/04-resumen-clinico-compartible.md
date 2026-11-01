# PR-EXP-04 · Resumen clínico compartible y filtro de sensibles

**Fecha:** 2026-10-31
**Reglas de especificación involucradas:** RE2, RE3, R2, R7; D-EXP-05, D-EXP-08, D-EXP-09.
**Input:** PR-EXP-01 (`RecordShareGrant`), `00-DESCUBRIMIENTO.md` Q7/Q12.
**Alcance de esta fase:** solo el SERVICIO (`SharedSummaryService`) + el mapeo FHIR + las semillas de sensibles. **Sin controlador ni endpoint nuevo** — el guard y los endpoints de lectura son PR-EXP-05, que consume este servicio.

## Hallazgos de esta fase (grounding, antes de escribir código)

Verificado directo en el esquema/código real — ninguno de estos campos existía en los documentos de descubrimiento previos con este nivel de detalle:

1. **`PatientClinicalService` ya es 100% reutilizable sin cambios**: `listAllergies`/`listMedications`/`listHistoryItems`/`vitalsHistory`/`getActivePregnancy`/`activeDiagnoses`/`notesTimeline` son métodos planos (sin chequeo de autorización embebido) — mismo patrón que ya usa `ContextAssemblerService`. `activeDiagnoses` YA filtra `encounter.status="SIGNED"` y expone `icd10Code` como string plano. `notesTimeline` YA filtra `status="SIGNED"` e incluye `doctor.primarySpecialty.nameEs`.
2. **`Icd10Code` no tiene campo de capítulo** (confirmado en PR-EXP-00) — el filtro por rango se hace comparando el código mismo (`code.slice(0,3)` o el primer carácter), no hay migración que agregar.
3. **🔒 No existe ninguna especialidad "Psiquiatría" ni "Psicología" en el catálogo de especialidades** (`prisma/seed.ts`, `SPECIALTIES`: solo `GENERAL`, `GINECOLOGIA_OBSTETRICIA`, `PEDIATRIA`, `MEDICINA_INTERNA`). La sub-regla de MENTAL_HEALTH "notas de custodios con especialidad Psiquiatría o Psicología" **no tiene cómo activarse hoy** — se implementa el mecanismo (compara contra una lista de códigos), pero hasta que el catálogo tenga esas especialidades, es un no-op. No se inventa la especialidad aquí — eso es gobierno de catálogo, no de esta función.
4. **🔒 `PatientMedication` no tiene FK al catálogo de medicamentos** (`medicationCatalogId` no existe en ese modelo — solo `genericName` de texto libre). El filtro de "medicamentos sensibles por clase ATC" que pide la letra **no se puede aplicar a "Medicación vigente"** sin inventar un emparejamiento por nombre (frágil: typos, sinónimos, marca vs. genérico — un falso negativo aquí filtraría peor que no filtrar nada). Se construye la función de clasificación por ATC (reutilizable el día que exista el vínculo), pero no se aplica a esta sección — documentado, no silenciado.
5. **🔒 Ningún estudio de laboratorio está marcado como "genético" en ningún catálogo** (confirmado: cero ocurrencias de "genetic"/"genético" fuera del propio enum que este track ya agregó en PR-EXP-01). GENETIC no tiene ningún dato real que filtrar todavía — mecanismo construido, vacío.
6. **`PatientHistoryItem.category` es solo `HEREDOFAMILIAR`/`PERSONAL_NO_PATOLOGICO`/`PERSONAL_PATOLOGICO`** — no hay un valor cerrado para "gineco-obstétrico" ni "toxicomanías"; el subtipo real vive como texto libre resuelto contra el catálogo. **⚠️ Revisión médica pendiente (Jorge):** sin una lista cerrada de qué subtipos de antecedente cuentan como sensibles, "Antecedentes relevantes" se incluye SIN filtrar por categoría en esta fase — inventar el mapeo subtipo→categoría sería exactamente la "lógica clínica nueva" que la RESTRICCIÓN prohíbe.
7. **`Prescription`/`LabOrder` ya son inherentemente "solo firmadas"**: ambas solo se pueden crear sobre un encuentro `SIGNED` (regla ya construida en Fase 4) — "solo firmadas" para estas dos secciones ya está garantizado por el modelo, no hace falta un filtro adicional.
8. **`LabResultAnalyte` NO filtra por revisión** (riesgo ya señalado en `00-DESCUBRIMIENTO.md`, bloqueador 3) — aquí se cierra: la sección "Resultados" exige `reviewedAt: { not: null }`.

## Diseño del filtro de sensibles

- `sensitiveCategoriesForIcd10Code(code)`: compara contra los rangos literales de la letra §2 del prompt maestro (MENTAL_HEALTH = todo el capítulo F; HIV_STI = B20-B24 ∪ {Z21} ∪ A50-A64; REPRODUCTIVE_HEALTH = O00-O08 ∪ {Z30}; SUBSTANCE_USE = F10-F19 — subconjunto de MENTAL_HEALTH a propósito, un código puede matchear ambas). Un diagnóstico se OCULTA si CUALQUIERA de sus categorías coincidentes está en `excludedCategories` del grant — nunca al revés (fail-closed: si matchea una categoría excluida Y una incluida, se oculta).
- Diagnósticos sin código (`icd10Code: null`, caso `codeAbsentReason`) no tienen categoría — pasan sin filtrar (no hay señal, y clasificar por texto libre sería inventar).
- Notas/recetas/órdenes: se ocultan COMPLETAS si el encuentro de origen tiene al menos un diagnóstico sensible excluido, o si la especialidad del médico autor está en la lista de "siempre sensible" (hoy vacía en la práctica, ver hallazgo 3) — nunca se intenta redactar texto libre parcialmente.
- Embarazo activo: sección propia, filtrada por `grant.pregnancyExcluded`, no por `excludedCategories` (ver PR-EXP-03 §1, ya documentado).

## Pasos de implementación

1. [x] `record-share-sensitive-filter.util.ts` (+spec): rangos CIE-10, clasificador, lista ATC (construida, no aplicada — hallazgo 4), lista de especialidades (construida, no aplicada — hallazgo 3).
2. [x] `services/shared-summary.service.ts` (+spec unitaria con mocks de Prisma, dado que es una pieza de lógica pura sobre datos ya obtenidos).
3. [x] Contrato de respuesta (`sharedRecordSummarySchema`) en `packages/contracts` (ambos monorepos) — "INFO PARA EL SIGUIENTE" que pide la letra.
4. [x] `docs/expediente-compartido/fhir-ips-mapeo.md`.
5. [x] Registrar `SharedSummaryService` en `RecordShareModule` (importa `LabsModule`) — SIN controlador nuevo.
6. [x] Documentación + informe de 7 puntos.

## Criterios de aceptación (texto literal del prompt maestro)

- [x] Un borrador nunca aparece (ver hallazgo 1 y 7: ya garantizado por los métodos reutilizados y por el modelo de `Prescription`/`LabOrder`).
- [x] Un diagnóstico F32 no aparece en el resumen ni en las notas si `MENTAL_HEALTH` está excluido, y sí aparece si el paciente lo incluyó.
- [x] No queda rastro de lo excluido (prueba unitaria que compara la respuesta con y sin el dato sensible: mismas claves, mismo largo de arreglo, sin "hueco").
- [x] Embarazo activo incluido por defecto y excluible.
- [x] Un alcance sin `RESULTS` no devuelve resultados.
- [x] Alergias siempre en primer lugar.

## Plan de pruebas

- `record-share-sensitive-filter.spec.ts`: rangos CIE-10 (dentro/fuera, casos límite de cada rango), código nulo pasa sin filtrar, F10.2 matchea ambas categorías.
- `shared-summary.service.spec.ts`: mockea `PatientClinicalService`/`LabResultAnalyteService`/Prisma y prueba el criterio de terminación completo — **ejecutable en este entorno** (no depende de Postgres real, es una prueba unitaria sobre un servicio con sus dependencias mockeadas, a diferencia de las `*.integration.spec.ts` de PR-EXP-02/03).
