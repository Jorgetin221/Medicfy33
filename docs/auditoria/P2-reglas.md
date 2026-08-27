# Auditoría P2 — Medicfy contra las ocho reglas permanentes

Fecha: 2026-08-26 · Alcance: árbol de trabajo tal como está.

## Notas previas sobre el alcance (leer antes que nada)

1. **El monorepo no está en `/home/claude/medicfy`.** Se encontró en `/root/medicfy`
   (`medicfy-backend/`, `medicfy-frontend/`). Todas las rutas de este documento son relativas
   a esa raíz.
2. **Ninguno de los dos repos es un repositorio git** (`git status` → `fatal: not a git
   repository` en ambos). No pude separar "lo commiteado" de "lo no commiteado", ni ver un
   diff del módulo `catalog`, las escalas por especialidad o las 3 migraciones nuevas. Audité
   el árbol completo como un solo estado, que es lo que se pidió.
3. **Cuidado con la numeración de reglas.** El `CLAUDE.md` del repo define *sus propias*
   R1–R7, que **no** coinciden con las ocho reglas de esta auditoría. Cuando un comentario del
   código dice "R3", casi siempre se refiere a la R3 del `CLAUDE.md` (bitácora), que es la
   **R6** de aquí; "R2" del código (nada clínico por canal externo) no es la R2 de aquí;
   "R5" del código (Grupos I/II bloqueados) no es la R5 de aquí. En este documento R1–R8 son
   siempre las de la auditoría.
4. No hay ninguna regla equivalente a la R7 (FHIR) en `CLAUDE.md`. Eso explica —no justifica—
   el hallazgo H5.

## Cuadro de estado

| Regla | Estado | Resumen en una línea |
|---|---|---|
| **R4** · Autorización por recurso | **NO CUMPLE** | `GET /patients/:id` responde a cualquier sesión válida y `reviewResult` escribe sobre el resultado de otro paciente |
| **R3** · Texto libre sólo donde hay razonamiento | **NO CUMPLE** | Alergia, fármaco habitual, estudio de laboratorio y tipo de sangre son `String` libre, sin referencia a catálogo |
| **R7** · Equivalencia HL7 FHIR declarada | **NO CUMPLE** | Cero ocurrencias de `fhir`/`hl7`/`snomed` en el código; sólo un diferimiento global en la especificación |
| **R1** · Nada se borra | **CUMPLE PARCIALMENTE** | Las 4 tablas nombradas son inmutables de verdad vía `GRANT`; las tablas clínicas vecinas conservan `UPDATE`/`DELETE` |
| **R6** · Bitácora de todo | **CUMPLE PARCIALMENTE** | El núcleo clínico audita bien; faltan `request_id`, la lectura de `/patients/:id` y `/appointments*`, y la cadena de hash |
| **R2** · Los catálogos son cerrados | **CUMPLE PARCIALMENTE** | Ningún endpoint de captura escribe en un catálogo; pero no existe rol curador ni flujo de alta |
| **R8** · Funciona en tableta | **CUMPLE PARCIALMENTE** | 44 px respetado casi en todo; un botón sub-44 px y texto clínico (dosis, alergias) a 14 px y 12 px |
| **R5** · Identificadores no adivinables | **CUMPLE** | UUID en los 41 modelos; ningún `autoincrement()`; los folios legibles nunca son clave de ruta |

---

# Hallazgos, ordenados por gravedad

## H1 · CRÍTICO — `GET /patients/:id` sin autorización por recurso ni bitácora
**Rompe R4. También rompe R6.**

`medicfy-backend/apps/api/src/modules/scheduling/patients.controller.ts:18-19,46-52`

```ts
@Controller("patients")
@UseGuards(JwtAuthGuard)              // ← línea 19: sólo sesión válida
...
@Get(":id")                            // ← línea 46
async findOne(@Param("id") id: string) {
  const patient = await this.patientService.findById(id);
  const guardians = await this.guardianService.listActiveForPatient(patient);
  return { ...patient, guardians };
}
```

`medicfy-backend/apps/api/src/modules/scheduling/services/patient.service.ts:77-83`

```ts
async findById(patientId: string): Promise<Patient> {
  const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
  ...
}
```

No hay filtro por `doctorId`, no hay `CareRelationshipGuard`, no hay comprobación de rol y no
hay entrada en `audit_log`. La respuesta incluye el expediente administrativo completo:
`firstName`, `lastNamePaternal`, `curp`, `birthDate`, `bloodType` (dato clínico),
domicilio completo, teléfono, correo, contacto de emergencia — y además los tutores, con
`guardianCurp`, `guardianPhoneE164` y `guardianEmail`
(`medicfy-backend/prisma/schema.prisma:461-504` y `:524-544`).

Cualquier usuario autenticado —un médico sin vínculo, un `ASSISTANT`, un usuario con rol
`PATIENT`— que conozca o adivine un UUID de paciente obtiene todo eso. La sesión válida basta,
que es exactamente lo que R4 prohíbe.

Contraste dentro del mismo repo: los endpoints hermanos sí lo hacen bien —
`medicfy-backend/apps/api/src/modules/records/patient-clinical.controller.ts:31`
(`@UseGuards(JwtAuthGuard, CareRelationshipGuard)`).

El endpoint está vivo y en uso: `medicfy-frontend/apps/web/src/lib/use-patient-clinical.ts:168`
lo llama en cada carga del expediente y de la pantalla de consulta.

**Qué haría falta.** Añadir `CareRelationshipGuard` a la ruta *y* auditar la lectura. Ojo con
el detalle que hace que no sea un cambio de una línea:
`medicfy-backend/apps/api/src/common/guards/care-relationship.guard.ts:96` resuelve el paciente
desde `req.params.patientId`, y aquí el parámetro se llama `id` — hay que renombrar el
parámetro de la ruta a `patientId` o extender `resolvePatientId()`. Sin eso, el guard
respondería `400 VALIDATION_ERROR` a todo. `GET /patients` (línea 27) sí filtra por vínculo
activo (`patient.service.ts:70-75`) pero tampoco audita.

## H2 · CRÍTICO — `POST /lab-results/.../:resultId/review` escribe sobre el resultado de otro paciente
**Rompe R4. También rompe R1 y degrada R6.**

`medicfy-backend/apps/api/src/modules/labs/services/lab-order.service.ts:169-178`

```ts
async reviewResult(resultId: string, doctorId: string, doctorComment: string) {
  const result = await this.prisma.labResult.findUnique({ where: { id: resultId } });
  if (!result) { throw new ApiException("LAB_RESULT_NOT_FOUND", ...); }
  return this.prisma.labResult.update({
    where: { id: resultId },
    data: { reviewedByDoctorId: doctorId, reviewedAt: new Date(), doctorComment },
  });
}
```

Nunca compara `result.patientId` con el `patientId` de la ruta. El `CareRelationshipGuard` de
`medicfy-backend/apps/api/src/modules/labs/lab-results.controller.ts:38` valida el vínculo con
el paciente **de la ruta**, no con el dueño del `resultId`. Un médico con vínculo legítimo con
el paciente A manda el `patientId` de A (pasa el guard) y el `resultId` de B: sobrescribe
`reviewedByDoctorId`, `reviewedAt` y `doctorComment` en el resultado de B.

La comprobación correcta existe justo arriba, en el mismo archivo, para la descarga —
`lab-order.service.ts:161-167`:

```ts
async getResultFile(resultId: string, patientId: string) {
  const result = await this.prisma.labResult.findUnique({ where: { id: resultId } });
  if (!result || result.patientId !== patientId) { throw ...; }
```

…y hay una prueba que la cubre (`lab-results.integration.spec.ts:126`: *"un resultId de otro
paciente da 404"*). `reviewResult` quedó sin ese guardia y sin esa prueba.

Efectos colaterales: la entrada de bitácora
(`lab-results.controller.ts:102` → `audit(req, patientId, "lab_results.review", resultId)`)
queda con el `patientId` **equivocado**, así que la bitácora del paciente B no registra la
escritura sobre su resultado (R6); y el `doctorComment` anterior se pierde sin dejar rastro
(R1).

**Qué haría falta.** Pasar `patientId` a `reviewResult()` y rechazar cuando
`result.patientId !== patientId`, igual que `getResultFile`. Añadir la prueba negativa
correspondiente.

## H3 · ALTO — Los `GRANT` permiten borrar físicamente datos clínicos
**Rompe R1.**

R1 dice "no existe eliminación física de datos clínicos", y el propio `CLAUDE.md:23` insiste en
que esto "se hace cumplir a nivel de permisos de PostgreSQL (`GRANT`), no sólo en el código de
aplicación". Se cumple para las cuatro tablas literalmente nombradas ahí, y está probado:
`medicfy-backend/apps/api/src/modules/records/append-only.integration.spec.ts:105-186` verifica
`permission denied` en `UPDATE`/`DELETE` sobre `clinical_notes`, `prescriptions` y `lab_orders`.

Pero las tablas clínicas vecinas conservan `DELETE`:

| Migración : línea | Tabla | Privilegios a `medicfy_app` |
|---|---|---|
| `20260823224811_m8_m9_m10_clinical_core/migration.sql:474` | `encounter_diagnoses` | `SELECT, INSERT, UPDATE, DELETE` |
| `20260823224811_m8_m9_m10_clinical_core/migration.sql:480` | `patient_allergies` | `SELECT, INSERT, UPDATE, DELETE` |
| `20260823224811_m8_m9_m10_clinical_core/migration.sql:483` | `patient_medications` | `SELECT, INSERT, UPDATE, DELETE` |
| `20260823224811_m8_m9_m10_clinical_core/migration.sql:498` | `lab_order_items` | `SELECT, INSERT, UPDATE, DELETE` |
| `20260824101500_m8_patient_history_antecedentes/migration.sql:53` | `patient_history_items` | `SELECT, INSERT, UPDATE, DELETE` |
| `20260814211044_m5a_pacientes_citas/migration.sql:213` | `patients` | `SELECT, INSERT, UPDATE, DELETE` |

Dos casos merecen énfasis:

- **`lab_order_items`** es `UPDATE`+`DELETE` mientras que su padre `lab_orders` es
  append-only. Los estudios de una orden **ya firmada** se pueden cambiar o quitar sin tocar la
  fila protegida. El `contentHashSha256` cubre los items
  (`medicfy-backend/apps/api/src/modules/labs/services/lab-order.service.ts:65`) pero **nada
  lo vuelve a verificar nunca**: `grep contentHashSha256` en `apps/api/src` sólo devuelve
  escrituras (`lab-order.service.ts:65,95`, `prescription.service.ts:145,176`,
  `clinical-encounter.service.ts:189`). No existe ninguna rutina que recompute el hash ni que
  recorra `previousHashSha256`. La evidencia de manipulación se guarda, pero nadie la lee.
- **`encounter_diagnoses`** es `UPDATE`+`DELETE`, así que los diagnósticos de un encuentro
  `SIGNED` se pueden modificar o borrar aunque la nota misma no.

Hoy ningún código de aplicación ejecuta esos `DELETE` (verificado por `grep` sobre
`.delete(`/`.deleteMany(`: los únicos borrados fuera de pruebas son `availabilityRule`,
`availabilityException`, `noteTemplate`, `practiceLocation` y `doctorService`, ninguno clínico).
El hallazgo es de defensa en profundidad, que es precisamente el mecanismo que el proyecto
eligió.

**Qué haría falta.** Una migración que haga `REVOKE DELETE` (y `UPDATE`, donde aplique) sobre
esas seis tablas, y extender `append-only.integration.spec.ts` con los mismos casos
`permission denied` que ya tienen las tres tablas probadas. Para `encounter_diagnoses` hay que
decidir antes cómo se corrige un diagnóstico (previsiblemente: fila nueva referenciando la
anterior, como `ClinicalNote.isCorrectionOfNoteId`).

## H4 · ALTO — Texto libre donde R3 exige catálogo
**Rompe R3.**

R3 permite texto libre sólo en subjetivo y análisis. En la nota eso se respeta
(`chiefComplaint`, `currentIllness`, `assessment`, `plan` son texto; los signos vitales son un
objeto tipado, `packages/contracts/src/schemas/clinical.schema.ts:8-19`). Fuera de la nota, no:

| Dato | Modelo | Contrato Zod | Forma real |
|---|---|---|---|
| Alérgeno | `prisma/schema.prisma:976` `substance String` | `clinical.schema.ts:105` `substance: z.string().min(1)` | texto libre |
| Tipo/gravedad/fuente de alergia | `schema.prisma:977,979,983` (`allergyType`, `severity`, `source`) | `clinical.schema.ts:106,108,112` | texto libre |
| Fármaco habitual | `schema.prisma:1007` `genericName String` | `clinical.schema.ts:122` | texto libre |
| Dosis/vía/frecuencia habitual | `schema.prisma:1009-1011` | `clinical.schema.ts:124-126` | texto libre |
| Estudio de laboratorio | `schema.prisma:1439` `studyName String`, `loincCode String?` | `lab-order.schema.ts:5-6` | texto libre, LOINC opcional |
| Tipo de sangre | `schema.prisma:472` `bloodType String?` | `patient.schema.ts:57` `z.string().max(10)` | texto libre |
| Fármaco en receta física externa | `schema.prisma:1341` `genericName String` | `prescription.schema.ts:87` `genericName: z.string().min(1)` | texto libre |
| Diagnóstico sin código | `schema.prisma:890-891` `icd10Code String?` | `clinical.schema.ts:62-74` | CIE-10 **o** `codeAbsentReason` |

Esto no es cosmético: el texto libre es la entrada de las comprobaciones de seguridad.
`medicfy-backend/apps/api/src/modules/prescriptions/services/prescription.service.ts:72` cruza
alergias contra el fármaco con `toLowerCase().includes()` en ambas direcciones — una
coincidencia de subcadena entre dos textos escritos a mano. `:87` y `:112-113` detectan
duplicidad terapéutica con `genericName.toLowerCase() === ...`. Con "Penicilina", "penicilinas"
y "alergia a penicilina" en la base, esa comparación falla en silencio.

En el frontend la orden de laboratorio nunca manda código:
`medicfy-frontend/apps/web/src/components/clinical/lab-order-panel.tsx:73-75`

```ts
function addStudy() {
  if (!studyName.trim()) return;
  setItems([...items, { studyName: studyName.trim() }]);   // sin loincCode, nunca
```

**Lo que sí cumple**, y conviene no romper: la receta electrónica exige catálogo obligatorio —
`packages/contracts/src/schemas/prescription.schema.ts:15` `medicationCatalogId: z.string().uuid()`
— y el servidor resuelve `genericName`/`presentation`/`controlGroup` desde el catálogo, nunca
desde el cliente (`prescription.service.ts:125-143`). Los antecedentes usan vocabulario cerrado
por Zod (`clinical.schema.ts:153-197`).

Lo irónico del estado actual: `ClinicalCatalogTerm`
(`medicfy-backend/prisma/schema.prisma:1494-1528`) existe exactamente para esto —su propio
comentario pone como ejemplo el dominio `"ALERGIA_AGENTE"`— y **nada del código lo referencia**
(`grep ClinicalCatalogService` sólo encuentra el módulo, su servicio y su prueba).

**Qué haría falta.** Migrar `PatientAllergy.substance`, `PatientMedication.genericName` y
`LabOrderItem.studyName` a una FK contra `ClinicalCatalogTerm` (o contra `MedicationCatalog` en
el caso del fármaco), con la columna de texto conservada sólo como snapshot de lo que el médico
vio. `bloodType` a enum. Y reescribir el cruce de alergias de
`prescription.service.ts:69-81` para comparar por identificador, no por subcadena.

## H5 · ALTO — R7 no tiene ninguna implementación
**Rompe R7. NO CUMPLE.**

`grep -ri "fhir\|hl7\|snomed"` sobre `medicfy-backend` y `medicfy-frontend` (código, esquema,
migraciones y contratos) devuelve **cero** ocurrencias en código. Las únicas menciones están en
la especificación, y son diferimientos:

- `medicfy-backend/docs/ESPECIFICACION_TECNICA_MEDICFY_MVP.md:186` — *"FHIR / DICOM / SNOMED CT
  completos | **Diferido** | FHIR importa cuando integras con un hospital o una aseguradora."*
- `medicfy-backend/docs/ESPECIFICACION_TECNICA_MEDICFY_MVP.md:99` — *"Microservicios,
  multi-región, blockchain, FHIR/DICOM | v3.0 o nunca"*

No hay ningún campo `fhir*` en `schema.prisma`, ningún comentario de mapeo por campo, ninguna
tabla de correspondencia, ningún documento en `docs/` que enumere campo por campo el recurso y
el elemento FHIR equivalente, ni la razón de no tenerlo. `CLAUDE.md` §2 —las siete reglas que el
proyecto de verdad hace cumplir— no menciona FHIR en absoluto.

Codificación externa que sí existe, y que es lo más cercano: `EncounterDiagnosis.icd10Code`
(CIE-10, `schema.prisma:890`), `LabOrderItem.loincCode` (opcional y nunca poblado por la
interfaz, `schema.prisma:1440`), `MedicationCatalog.atcCode` (`schema.prisma:1134`) y
`ClinicalCatalogTerm.codingSystem` (`schema.prisma:1513`, obligatorio pero admite el valor
`"PROPIETARIO"`). Nada de eso es una equivalencia FHIR declarada.

R7 pide una declaración **por campo** ("cada campo clínico nace con…") o una razón documentada
**por campo**. Un diferimiento global de proyecto no satisface ninguna de las dos ramas. No lo
califico de "NO APLICA TODAVÍA" precisamente porque la regla es sobre el nacimiento de cada
campo, y ya nacieron decenas de campos clínicos sin ella.

**Qué haría falta.** Lo mínimo verificable: una columna de documentación por campo (comentario
estructurado en `schema.prisma` o un `docs/FHIR-MAPPING.md` con una fila por campo clínico:
modelo, campo, recurso FHIR, elemento, o la razón de "sin equivalente"), más una prueba o un
lint que falle cuando un campo clínico nuevo no aparezca en esa tabla. Sin lo segundo, la regla
se vuelve a romper en el siguiente módulo.

## H6 · ALTO — `UPDATE` en sitio sobre alergias, medicamentos y comentario de resultado
**Rompe R1 ("toda corrección genera un registro nuevo que referencia al anterior").**

`medicfy-backend/apps/api/src/modules/records/services/patient-clinical.service.ts:35-38`

```ts
async updateAllergy(patientId: string, allergyId: string, patch: PatientAllergyUpdateInput) {
  await this.assertAllergyBelongsToPatient(patientId, allergyId);
  return this.prisma.patientAllergy.update({ where: { id: allergyId }, data: omitUndefined(patch) });
}
```

Igual en `:62-72` (`updateMedication`) y en
`medicfy-backend/apps/api/src/modules/labs/services/lab-order.service.ts:174-177`
(`doctorComment`). El valor anterior desaparece: no hay tabla de cambios para ninguno de los
tres.

El patrón correcto ya existe en el mismo archivo, para antecedentes —
`patient-clinical.service.ts:104-133` inserta una foto del valor viejo en
`PatientHistoryItemChange` (append-only real vía `GRANT`,
`20260824101500_m8_patient_history_antecedentes/migration.sql:56`) **antes** de sobrescribir.
Alergias y medicamentos no recibieron ese tratamiento.

Importa porque son datos de seguridad, no anotaciones: cambiar `severity`, o poner
`status: "INACTIVE"` en una alergia, altera el resultado del cruce automático de
`prescription.service.ts:69` sin dejar rastro de quién ni cuándo. La cabecera del servicio
(`patient-clinical.service.ts:16-19`) declara la decisión de forma explícita — *"CRUD simple,
siempre editable (a diferencia de clinical_notes, esto no es lo que NOM-004 exige inmutable)"*
— así que es una divergencia deliberada respecto de NOM-004, no un descuido; pero contra R1 tal
como está redactada, es un incumplimiento.

**Qué haría falta.** Replicar el patrón de `PatientHistoryItemChange` para `PatientAllergy` y
`PatientMedication` (`PatientAllergyChange` / `PatientMedicationChange`, `SELECT`+`INSERT` a
nivel `GRANT`), y modelar la revisión de un resultado como fila nueva en lugar de `UPDATE`,
igual que ya se hizo con `PrescriptionCancellation` y `PrescriptionHandwrittenDelivery`.

## H7 · MEDIO — Cualquier médico con vínculo puede editar y firmar el encuentro de otro médico
**Rompe R4 en su segunda mitad ("ESTE médico").**

`medicfy-backend/apps/api/src/modules/records/services/clinical-encounter.service.ts:112-128`
(`updateDraft`) y `:134-195` (`sign`) nunca comparan `encounter.doctorId` con el médico
actuante. `assertDraft()` (`:274-292`) sólo comprueba el estado y la antigüedad de 72 h. El
controlador (`records/encounters.controller.ts:62-82`) pasa únicamente el `encounterId`.

El `CareRelationshipGuard` sí resuelve y expone el médico actuante —
`common/guards/care-relationship.guard.ts:90` `req.actingDoctorId = doctor.id` — pero ningún
servicio del módulo `records` lo usa para comprobar la propiedad del encuentro.

Consecuencia: si el paciente tiene vínculo activo con dos médicos, el médico B puede sobrescribir
el borrador del médico A y firmarlo. La fila queda inconsistente: `signedByUserId` = B mientras
`ClinicalEncounter.doctorId` sigue siendo A (`schema.prisma:806,819`). La misma forma se repite
en `POST /prescriptions/encounters/:encounterId` (`prescriptions.controller.ts:31`) y en
`POST /lab-orders/encounters/:encounterId` (`lab-orders.controller.ts:29`): se verifica el
vínculo con el paciente, no la pertenencia del encuentro al emisor.

**Qué haría falta.** Comparar `encounter.doctorId === req.actingDoctorId` en `assertDraft()`,
`sign()`, `correctNote()` y en la creación de recetas/órdenes sobre un encuentro; con prueba
negativa (segundo médico con vínculo al mismo paciente).

## H8 · MEDIO — R2: el catálogo es cerrado, pero no existe el flujo de curación
**CUMPLE PARCIALMENTE.**

La primera mitad de R2 se cumple y está bien defendida:

- Ningún endpoint de captura escribe en una tabla de catálogo. Verificado por `grep` sobre
  `prisma.(icd10Code|medicationCatalog|specialty|specialtyFieldSchema).(create|update|upsert|delete)`
  en `apps/api/src`: **cero** resultados fuera de `prisma/seed.ts:198-235`.
- Y está reforzado a nivel de base de datos:
  `20260823224811_m8_m9_m10_clinical_core/migration.sql:486,489,492` y
  `20260814012436_m2_doctor_profile_verification/migration.sql:138` otorgan **sólo `SELECT`**
  sobre `icd10_codes`, `medications_catalog`, `specialty_field_schemas` y `specialties`.
- Los controladores de catálogo son de sólo lectura: `records/icd10.controller.ts`,
  `prescriptions/medications.controller.ts`, `records/specialty-field-schemas.controller.ts`.

La segunda mitad —"el alta de términos es un flujo aparte con rol curador"— no existe:

- **No hay rol curador.** `enum RoleName` (`prisma/schema.prisma:26-36`) tiene `PATIENT`,
  `DOCTOR`, `ASSISTANT`, `LAB`, `SUPPORT`, `ADMIN`, `SUPERADMIN`. La especificación sí lo prevé
  (`docs/especificacion-plataforma-clinica-con-ia.md:161`: *"Administrador clínico | Catálogos,
  plantillas, permisos y configuración"*).
- **`ClinicalCatalogService.create()` no comprueba nada.**
  `apps/api/src/modules/catalog/services/clinical-catalog.service.ts:27` no recibe un actor ni
  un rol; valida duplicados normalizados y nada más.
- **`curatedBy` es un `String?` suelto**, sin FK — `prisma/schema.prisma:1519`, con el
  comentario "se vuelve FK real a un usuario curador cuando exista ese rol".
- **El módulo no tiene controlador ni consumidores.** `apps/api/src/modules/catalog/catalog.module.ts`
  ("Sin controllers: … la API llega en un prompt posterior"); `grep ClinicalCatalogService` sólo
  encuentra el propio módulo, el servicio y su prueba.
- **El `GRANT` no separa curación de captura.**
  `20260826194547_catalog_clinical_catalog_term_grants/migration.sql:10` otorga
  `SELECT, INSERT, UPDATE` sobre `clinical_catalog_terms` a `medicfy_app` — el mismo rol de base
  de datos que usan todos los endpoints de captura. Los catálogos viejos son `SELECT` a secas; el
  nuevo no. Hoy no hay ruta que lo explote (no hay controlador), pero la barrera de base de
  datos que sí protege a `icd10_codes` aquí no está.

Lo que sí está bien resuelto en el módulo nuevo: un término nunca se borra —`obsolete()`
(`:115-118`) y `merge()` (`:125-141`) sólo cambian `status`, y `resolveCurrent()` (`:98-113`)
camina `mergedIntoId` con guardia anticiclos. Y `normalizedTerm` se calcula en el servidor,
nunca se recibe del cliente (`:28`).

**Qué haría falta.** Añadir el rol (`CURATOR` o `CLINICAL_ADMIN`) a `RoleName` y a
`user_roles`; un `CuratorGuard` equivalente a `AdminGuard`
(`apps/api/src/modules/identity/guards/admin.guard.ts`); un controlador de catálogo detrás de
ese guard; convertir `curatedBy` en FK a `users`; y, para cerrarlo también en la base de datos,
`REVOKE INSERT, UPDATE ON clinical_catalog_terms FROM medicfy_app` con un segundo rol para la
curación (o, si eso es demasiado, dejarlo documentado como excepción consciente).

## H9 · MEDIO — R6: la bitácora es sólida en el núcleo, con tres huecos concretos
**CUMPLE PARCIALMENTE.**

Lo que funciona, y funciona bien:

- `audit_log` es append-only de verdad:
  `20260813215013_init_identity_m1/migration.sql:248-249` (`GRANT SELECT, INSERT` +
  `REVOKE UPDATE, DELETE, TRUNCATE`).
- Los accesos **denegados** se registran antes de responder, con `patientId`, IP y motivo:
  `common/guards/care-relationship.guard.ts:51-59` y `:70-81`.
- Toda ruta de `records`, `prescriptions` y `labs` registra el `SUCCESS` con acción específica,
  actor, `patientId`, IP y user-agent: `records/patient-clinical.controller.ts:124-141`,
  `records/encounters.controller.ts:97-110`, `prescriptions/prescriptions.controller.ts:102-115`,
  `labs/lab-orders.controller.ts:68-81`, `labs/lab-results.controller.ts:106-119`. Las lecturas
  se auditan **antes** de responder (p. ej. `patient-clinical.controller.ts:41` precede al
  `return`).
- `patientId` es columna dedicada e indexada, no metadata (`prisma/schema.prisma:750,759`).

Los huecos:

1. **`request_id` nunca se llena.** `AuditEntry.requestId` existe
   (`identity/services/audit.service.ts:16,41`) pero ningún llamador lo pasa:
   `identity/request-meta.ts` devuelve sólo `{ ip, userAgent }`. Todas las filas de `audit_log`
   tienen `requestId = NULL`. Además, `common/api-exception.filter.ts:13` genera un
   `randomUUID()` propio por error, así que el `request_id` que ve el cliente no correlaciona
   con nada. `CLAUDE.md:27` lo exige explícitamente.
2. **Lecturas de datos de paciente sin auditar.** `GET /patients/:id` y `GET /patients`
   (`scheduling/patients.controller.ts:27,46`) — ver H1; y `GET /appointments` /
   `GET /appointments/:id` (`scheduling/appointments.controller.ts:42,63`), que devuelven nombre,
   `medicfyId`, fecha de nacimiento y sexo
   (`scheduling/services/appointment-state-machine.service.ts:161-195`).
3. **Sin cadena de hash y sin forma de leer la bitácora.** `apps/api/src/modules/audit/audit.module.ts`
   es literalmente `@Module({})`. Las columnas `prev_entry_hash`/`entry_hash` están diferidas por
   diseño (`prisma/schema.prisma:731-737`), y no hay ningún endpoint para que un médico consulte
   "accesos a mis pacientes", aunque el comentario de `schema.prisma:745-749` dice que la matriz
   de permisos lo exige.

**Qué haría falta.** Un middleware que genere el `request_id` una vez por petición, lo deje en
`req` y lo consuman tanto `getRequestMeta()` como `ApiExceptionFilter`; auditar las cuatro rutas
del punto 2; y, cuando llegue M15, la cadena de hash más el endpoint de consulta.

## H10 · BAJO — R8: un control por debajo de 44 px y texto clínico por debajo de 16 px
**CUMPLE PARCIALMENTE.**

La base está bien construida y es consistente: `Button`
(`medicfy-frontend/apps/web/src/components/ui/button.tsx:7`) y todos los controles de formulario
(`components/ui/field.tsx:9`) llevan `min-h-[44px]`; pestañas
(`components/ui/tabs.tsx:62`), navegación (`components/app-nav.tsx:48,61`), cierre de panel
(`components/ui/panel.tsx:72`), resultados de los buscadores de CIE-10 y medicamentos
(`components/clinical/icd10-picker.tsx:118`, `components/clinical/medication-picker.tsx:161`),
botones de horario (`app/(app)/citas/nueva/page.tsx:284`) y los `label` que envuelven radios y
casillas (`components/clinical/prescription-panel.tsx:322,339`) también. Los radios de 16 px van
dentro de un `label` con `min-h-11`, que es la forma correcta de resolverlo.

Excepciones verificadas:

- `medicfy-frontend/apps/web/src/components/ui/states.tsx:41`
  ```tsx
  <button type="button" onClick={onRetry} className="text-sm font-medium text-brand-700 underline">
    Reintentar
  </button>
  ```
  Sin `min-h`: unos 20 px de alto. Es el botón de reintento del `ErrorState` compartido, que
  aparece en toda la aplicación, incluida la pantalla de consulta
  (`app/(app)/consulta/[appointmentId]/consulta-screen.tsx:115`). Es justo el control que se
  necesita con el dedo cuando la red falla junto al paciente.
- **Texto clínico por debajo de 16 px en la barra lateral de la consulta**, que contradice
  `CLAUDE.md:100` ("Dosis, alergias y valores de resultado nunca en tamaño menor"):
  - `components/clinical/allergy-summary.tsx:27` — `compact ? "text-sm" : "text-base"`, y
    `app/(app)/consulta/[appointmentId]/consulta-sidebar.tsx:63` pasa `compact`: las alergias
    activas se dibujan a 14 px.
  - `app/(app)/consulta/[appointmentId]/consulta-sidebar.tsx:73` — medicamentos activos y su
    **dosis** a `text-sm` (14 px).
  - `components/clinical/medication-picker.tsx:168` — la insignia de seguridad
    "Grupo N — bloqueado" a `text-xs` (12 px).
- **No hay PWA.** No existe `manifest.json`, ni service worker, ni siquiera directorio
  `apps/web/public/`. El enunciado describe Medicfy como PWA; la instalación en tableta y el
  funcionamiento sin conexión a nivel de aplicación no están construidos (el borrador de nota sí
  tiene respaldo cifrado en IndexedDB, `lib/offline-draft-store.ts`). El `viewport` responsivo no
  es problema: Next.js App Router lo emite por defecto.

No pude verificar la usabilidad real en horizontal con el dedo sin ejecutar la aplicación; lo
que sí es verificable leyendo el código es que la barra inferior de firma es
`fixed inset-x-0 bottom-0` con `pb-24` de compensación en el formulario
(`app/(app)/consulta/[appointmentId]/consulta-form.tsx:275,430`), lo cual es correcto en papel
pero conviene probar con teclado en pantalla abierto.

**Qué haría falta.** Añadir `min-h-11` al botón de `states.tsx:41`; subir a `text-base` la
alergia compacta, la lista de medicamentos de la barra lateral y la insignia de grupo
controlado; y, si "PWA" es un requisito real, añadir manifiesto y service worker.

---

## R5 · CUMPLE — detalle de la verificación

- **Todas las claves primarias son UUID.** `grep "@id" prisma/schema.prisma` devuelve 41
  ocurrencias, 40 de ellas `String @id @default(uuid())`. **Cero** `autoincrement()` en todo el
  esquema. La única excepción es `Icd10Code.code String @id` (`prisma/schema.prisma:1106`), que
  es un código de un estándar público, no un identificador de paciente.
- **Ninguna ruta acepta un identificador secuencial.** Repasados los 20 controladores: todos los
  `@Param` son UUID (`:id`, `:patientId`, `:encounterId`, `:prescriptionId`, `:labOrderId`,
  `:resultId`, `:doctorId`). El frontend usa lo mismo (`/pacientes/[id]`,
  `/consulta/[appointmentId]`).
- **Los folios legibles existen y se quedan donde deben.** `MDF-000123`
  (`scheduling/services/patient.service.ts:89-96`), `MDF-2026-000001` y `MDF-LAB-2026-000001`
  (`common/folio.util.ts`) salen de secuencias de Postgres, o sea que son adivinables — y por eso
  mismo nunca son clave de búsqueda: no hay ningún `findUnique({ where: { folio } })` ni ningún
  `@Param("folio")`.
- **La ruta pública de verificación usa un token aleatorio, no el folio.**
  `prescriptions/verification.controller.ts:20` recibe `:token`, que es un `randomUUID()`
  (`prescription.service.ts:146`, `lab-order.service.ts:64`) con índice único
  (`prisma/schema.prisma:1285,1405`), y devuelve sólo folio, fecha, médico, nombre enmascarado y
  estado — nunca contenido clínico (`prescription.service.ts:285-292`).

**Único matiz, no un incumplimiento hoy.** El folio se usa como segmento de la ruta de
almacenamiento: `pdfFileKey = \`prescriptions/${folio}/receta.pdf\``
(`prescription.service.ts:164`) y `\`lab-orders/${folio}/orden.pdf\``
(`lab-order.service.ts:82`). Esa clave nunca viene del cliente y nunca se expone como URL —
`getPdf()` la resuelve desde la fila ya autorizada, y el adaptador de disco valida el camino
(`doctors/services/local-disk-file-storage.adapter.ts:44-51`). Pero mete un identificador
secuencial y adivinable en el espacio de nombres del almacén de objetos, lo cual sí importará
cuando `getSignedDownloadUrl()` (`local-disk-file-storage.adapter.ts:63`, hoy un stub de
desarrollo) se sustituya por una URL prefirmada real de S3/R2. Vale la pena cambiarlo a un UUID
antes de esa migración, no después.

---

## Lo que no pude verificar leyendo el código

- **Comportamiento real en tableta en horizontal** (R8): sin ejecutar la aplicación no puedo
  confirmar que nada quede fuera de pantalla a 1024×768 ni que la barra de firma fija no choque
  con el teclado en pantalla. Lo que sí verifiqué son las clases de tamaño en el código.
- **Que los `GRANT` estén realmente aplicados en la base de datos de trabajo**: leí las
  migraciones, no consulté `information_schema.role_table_grants`. Las pruebas de integración
  (`append-only.integration.spec.ts`) los verifican en tiempo de ejecución, pero no las ejecuté.
- **Qué parte del árbol es "nueva y sin commitear"**: sin git no hay diff posible (ver Nota 2).
- **El contenido de `prisma/data/cie10-dgis.json`** (catálogo CIE-10 sembrado): no lo abrí; sólo
  verifiqué la ruta de siembra en `prisma/seed.ts:225`.

## Observación fuera de las ocho reglas

`medicfy-backend/.env` contiene valores reales de `JWT_ACCESS_SECRET` y
`MFA_SECRET_ENCRYPTION_KEY` en texto plano en el árbol de trabajo. Está listado en
`medicfy-backend/.gitignore`, así que no debería llegar a un repositorio — pero como este árbol
no es un repositorio git, no pude confirmar que nunca se haya commiteado. No toca ninguna de las
ocho reglas; lo dejo anotado porque son secretos de firma de sesión y de cifrado de semillas MFA.
