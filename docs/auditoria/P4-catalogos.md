# P4 · Auditoría de R2 — «Los catálogos son cerrados»

**Regla auditada.** Ningún endpoint de captura puede insertar en una tabla de catálogo. El alta de términos es un flujo aparte con rol curador.

**Alcance.** Monorepo Medicfy tal como está en disco, con los cambios sin commitear incluidos: el módulo `catalog` nuevo (`medicfy-backend/apps/api/src/modules/catalog/`) y las 3 migraciones de catálogo (`20260826190911_catalog_clinical_catalog_term`, `20260826194547_..._grants`, `20260826200932_catalog_normalized_term`).

**Nota de ubicación.** El árbol auditado vive en `/root/medicfy`, no en `/home/claude/medicfy`. Es el mismo árbol (`medicfy-backend/` + `medicfy-frontend/`) y todas las rutas de este informe son relativas a la raíz del monorepo, así que sirven igual en cualquiera de las dos ubicaciones.

**Escenario de proyección** (declarado, no medido): 1,000 médicos × ~15 consultas/día × ~230 días hábiles/año × 2 años ≈ **6.9 millones de consultas**. Todas las proyecciones de «qué pasaría» se calculan sobre ese orden de magnitud y se marcan como estimación cuando lo son.

---

## 0. Resumen ejecutivo

| Categoría del encargo | Hallazgos |
|---|---|
| Endpoints que hacen `create`/`upsert`/`createMany` sobre un modelo de catálogo | **0** |
| Altas implícitas (`upsert` / `connectOrCreate` dentro de un endpoint de captura) | **0** |
| Formularios de texto libre que después se guardan como opción seleccionable | **1** (plantillas de nota) |
| Patrones «otro / especifique / no listado / agregar nuevo» | **3** |
| Campos `String` que funcionan como **catálogo de facto** | **24 campos**, en **13 vocabularios clínicos distintos** |
| **Total de puertas abiertas** | **24** |

**Titular.** R2 se cumple **al pie de la letra** y se incumple **en sustancia**. No existe un solo endpoint que inserte en `clinical_catalog_terms`, `icd10_codes`, `medications_catalog`, `specialties` ni `specialty_field_schemas` — verificado exhaustivamente contra los 61 endpoints mutantes del backend. Pero el sistema no necesita ese endpoint para producir el desastre que R2 quiere evitar: **13 vocabularios clínicos se construyen hoy tecleando en un `<input type="text">`**, y tres de ellos (estudios de laboratorio, agentes alérgenos, medicamentos habituales) **no tienen ni siquiera una tabla de catálogo detrás**. No hay nada que cerrar en ellos porque nunca se abrió nada: el texto que el médico escribe *es* el vocabulario.

**Veredicto sobre el módulo `catalog` nuevo.** Cierra la puerta por **construcción, no por diseño**, y no cubre ninguno de los 13 vocabularios reales. Detalle en §4.

---

## 1. Categorías donde NO se encontraron puertas abiertas

Se declaran explícitamente para que la ausencia sea un hallazgo verificado, no un hueco del informe.

### 1.1 Endpoints que insertan en una tabla de catálogo — **ninguno**

Se inventariaron los 61 endpoints mutantes (`@Post`/`@Patch`/`@Put`/`@Delete`) de `medicfy-backend/apps/api/src/modules/`. Ninguno escribe sobre un modelo de catálogo. Los cinco catálogos reales del esquema son de **solo lectura** desde la API:

| Catálogo | Controlador | Verbo |
|---|---|---|
| `Icd10Code` | `medicfy-backend/apps/api/src/modules/records/icd10.controller.ts:21` | solo `@Get` |
| `MedicationCatalog` | `medicfy-backend/apps/api/src/modules/prescriptions/medications.controller.ts:24` | solo `@Get` |
| `Specialty` | `medicfy-backend/apps/api/src/modules/doctors/specialties.controller.ts:15` | solo `@Get` |
| `SpecialtyFieldSchema` | `medicfy-backend/apps/api/src/modules/records/specialty-field-schemas.controller.ts:28` | solo `@Get` |
| `ClinicalCatalogTerm` | — | **sin controlador** |

La única ruta de escritura a estos cinco es `medicfy-backend/prisma/seed.ts` (líneas 208, 225, 231-235, 180-200), un proceso offline. Correcto.

También se verificó que `Doctor.primarySpecialtyCode` y `secondarySpecialtyCodes`, que llegan como `String` desde el cliente, **sí** se validan contra la tabla `Specialty` antes de guardarse:
- `medicfy-backend/apps/api/src/modules/identity/services/auth.service.ts:141-142` (alta de médico)
- `medicfy-backend/apps/api/src/modules/doctors/services/doctor-profile.service.ts:74-78` y `:136-141` (edición de perfil)

Eso es exactamente lo que R2 pide y está bien hecho.

### 1.2 `upsert` / `connectOrCreate` implícitos — **ninguno**

`grep` de `connectOrCreate` y `.upsert(` sobre `apps/` y `packages/` del backend devuelve **cero resultados** en código de aplicación.

Hay un endpoint llamado «upsert» — `POST /records/patients/:patientId/history` (`medicfy-backend/apps/api/src/modules/records/patient-clinical.controller.ts:103-112`) — pero **no es un alta de catálogo**: es un find-then-create/update manual sobre `patient_history_items` (`.../services/patient-clinical.service.ts:104-133`), una tabla de datos del paciente. Su `subtype` está cerrado por un `z.enum` de 30 valores transcritos de la especificación (`medicfy-backend/packages/contracts/src/schemas/clinical.schema.ts:153-197`), y el frontend sólo pinta esas 30 filas fijas (`medicfy-frontend/apps/web/src/components/clinical/antecedentes-editor.tsx:37-74`).

**Esto merece subrayarse: el vocabulario de antecedentes — el que en el sistema de referencia produjo los 140 duplicados — es en Medicfy un enum cerrado, tanto en el contrato como en la UI.** Es el acierto más importante del expediente y la prueba de que el equipo sabe hacerlo bien cuando decide hacerlo.

### 1.3 Categorías sin hallazgos adicionales

- No hay `datalist`, autocompletado desde datos capturados, ni endpoint que devuelva `distinct` de un campo de captura para ofrecerlo como sugerencia. Nada de lo que un médico teclea se le ofrece a otro médico como opción **excepto** las plantillas de nota (§2.11).
- No existe rol curador (§4.2), así que no hay «flujo de curación» que auditar por permisos indebidos: no hay flujo en absoluto.

---

## 2. Las 24 puertas abiertas — catálogos de facto

Todas comparten la misma forma: un campo `String` en el esquema, un `z.string()` sin `enum` en el contrato, un `<TextInput>` en el formulario. El médico teclea y ese texto **es** el término. No hay tabla, no hay normalización, no hay detección de duplicados, no hay curador.

---

### 2.1 · `PatientAllergy.substance` — catálogo de agentes alérgenos ⚠️ **CRÍTICO**

**Dónde está**
- Esquema: `medicfy-backend/prisma/schema.prisma:976` — `substance String`
- Contrato: `medicfy-backend/packages/contracts/src/schemas/clinical.schema.ts:105` — `substance: z.string().min(1)`
- Endpoint: `medicfy-backend/apps/api/src/modules/records/patient-clinical.controller.ts:45-54` (`POST /records/patients/:patientId/allergies`)
- Servicio: `medicfy-backend/apps/api/src/modules/records/services/patient-clinical.service.ts:28-33`
- Frontend: `medicfy-frontend/apps/web/src/app/(app)/pacientes/[id]/tab-antecedentes.tsx:119-120` — campo «Sustancia», `<TextInput>` puro
- **Consumidor de seguridad**: `medicfy-backend/apps/api/src/modules/prescriptions/services/prescription.service.ts:72`

**Qué catálogo afecta.** El catálogo de agentes alérgenos. Nótese que el propio esquema del módulo nuevo nombra este dominio como ejemplo canónico — `schema.prisma:1497`, `// Discriminador del catálogo (ej. "ALERGIA_AGENTE")` — pero **nada conecta `PatientAllergy.substance` con `ClinicalCatalogTerm`**.

**Qué pasaría con mil médicos durante dos años.** Esto no es sólo un problema de higiene de datos; es un problema de seguridad del paciente, porque este texto libre alimenta el cruce automático alergia↔receta (M8-RN-008 / M9-RN-008a). El cruce es:

```ts
catalog.genericName.toLowerCase().includes(a.substance.toLowerCase()) ||
a.substance.toLowerCase().includes(catalog.genericName.toLowerCase())
```

Dos modos de falla, ambos garantizados a esta escala:

1. **Falsos negativos silenciosos.** «Penicilinas», «PNC», «betalactámicos», «alergia a la penicilina según la mamá» — ninguno coincide por subcadena con `genericName = "Amoxicilina"`. La alerta no salta. El médico ve una receta limpia y asume que el sistema la revisó. A 6.9 millones de consultas, el subconjunto de pacientes con alergia documentada de forma no literal se cuenta en decenas de miles, y para cada uno el sistema promete una verificación que no está haciendo.
2. **Falsos positivos por subcadena corta.** `substance` acepta `min(1)`. Un médico que escribe `«no»`, `«-»`, `«x»` o `«ninguna»` para cerrar el campo obligatorio convierte la comparación en `"naproxeno".includes("no") === true`. Cada receta de ese paciente lanza un bloqueo 409 `PRESCRIPTION_ALLERGY_CONFLICT` que sólo se pasa marcando `allergyOverrideConfirmed`. El resultado predecible: los médicos aprenden a marcar «confirmo» por reflejo, y la alerta que sí importa deja de leerse. Es el mecanismo clásico de fatiga de alerta, y aquí lo fabrica el propio diseño del campo.

Y encima: dos años de «Penicilina», «penicilina», «Penicilinas», «PENICILINA», «Penicilina.», «Alergia a penicilina» conviviendo como entradas distintas hacen imposible responder «¿cuántos de mis pacientes son alérgicos a la penicilina?» — la pregunta epidemiológica más básica del expediente.

---

### 2.2 · `LabOrderItem.studyName` — catálogo de estudios de laboratorio ⚠️ **CRÍTICO**

**Dónde está**
- Esquema: `medicfy-backend/prisma/schema.prisma:1439` — `studyName String`
- Contrato: `medicfy-backend/packages/contracts/src/schemas/lab-order.schema.ts:5` — `studyName: z.string().min(1)`
- Endpoint: `medicfy-backend/apps/api/src/modules/labs/lab-orders.controller.ts:29` (`POST /lab-orders/encounters/:encounterId`)
- Servicio: `medicfy-backend/apps/api/src/modules/labs/services/lab-order.service.ts:50-53` y `:102` (`items: { create: items }`)
- Frontend: `medicfy-frontend/apps/web/src/components/clinical/lab-order-panel.tsx:179-182` (campo «Estudio», `hint="p. ej. Biometría hemática completa"`) y `:72-75` (`addStudy()` — `setItems([...items, { studyName: studyName.trim() }])`)

**Qué catálogo afecta.** El catálogo de estudios de laboratorio. **No existe.** No hay tabla, no hay modelo Prisma, no hay endpoint de búsqueda, no hay `<select>`. El campo `loincCode` existe en el contrato (`lab-order.schema.ts:6`) y en el esquema (`schema.prisma:1440`) pero es `.optional()`, no se valida contra nada, y **el frontend nunca lo llena** — `addStudy()` sólo construye `{ studyName }`. LOINC está declarado como intención y desconectado en la práctica.

**Qué pasaría con mil médicos durante dos años.** Es la peor de las 24 porque combina tres agravantes:
- **Volumen alto.** Los estudios de laboratorio son de las órdenes más frecuentes en consulta privada. A escala de 6.9 millones de consultas hablando de millones de `lab_order_items`.
- **Vocabulario naturalmente disperso.** «Biometría hemática», «BH», «Biometria hematica completa», «BHC», «Citometría hemática», «biometria», «BH completa» son la misma prueba escrita de siete formas que un humano reconoce al instante y `GROUP BY` no. Con 1,000 médicos formados en escuelas distintas, la cola larga no tiene fin: se puede esperar del orden de **decenas de miles de cadenas distintas** para un par de centenares de estudios reales.
- **Sale impreso en un documento firmado.** `studyName` entra al PDF y al `contentHashSha256` (`lab-order.service.ts:65`, `:70-81`). Una errata queda congelada en un documento legal, y el laboratorio receptor tiene que interpretar la cadena a mano.

Consecuencia acumulada: cero interoperabilidad (ningún portal de laboratorio podrá consumir esto sin un mapeo manual construido a posteriori), cero analítica («¿qué estudios pido más?» no tiene respuesta), y una migración futura a LOINC que exigirá desambiguar decenas de miles de cadenas históricas una por una.

---

### 2.3 · `PatientMedication.genericName` — catálogo de medicamentos habituales ⚠️ **CRÍTICO**

**Dónde está**
- Esquema: `medicfy-backend/prisma/schema.prisma:1007` — `genericName String`
- Contrato: `medicfy-backend/packages/contracts/src/schemas/clinical.schema.ts:122`
- Endpoint: `medicfy-backend/apps/api/src/modules/records/patient-clinical.controller.ts:74-82` (`POST /records/patients/:patientId/medications`)
- Servicio: `medicfy-backend/apps/api/src/modules/records/services/patient-clinical.service.ts:44-60`
- Frontend: `medicfy-frontend/apps/web/src/app/(app)/pacientes/[id]/tab-antecedentes.tsx:183-184` — campo «Nombre genérico», `<TextInput>` puro
- **Consumidores de seguridad**: `prescription.service.ts:87` y `:104-106, 112-113`

**Qué catálogo afecta.** El catálogo de medicamentos. Existe uno bueno (`MedicationCatalog`, con `atcCode` y `controlGroup`) y la receta electrónica lo respeta correctamente — `prescriptionItemCreateSchema` exige `medicationCatalogId: z.string().uuid()` (`prescription.schema.ts:15`), y el servicio resuelve `genericName`/`controlGroup` **siempre** del catálogo (`prescription.service.ts:125-143`). **La conciliación de medicamentos habituales no lo usa.** Misma entidad clínica, dos rutas: una cerrada, una abierta.

**Qué pasaría con mil médicos durante dos años.** El daño es directo y mecánico, porque los dos chequeos de duplicidad terapéutica hacen **igualdad exacta de cadenas** contra este texto libre:

```ts
// prescription.service.ts:87  — duplicidad por nombre
activeMedications.some(m => m.genericName.toLowerCase() === catalog.genericName.toLowerCase())

// prescription.service.ts:104-106, 113 — duplicidad por clase ATC
atcPrefixByActiveName.get(active.genericName.toLowerCase()) === prefix
```

Cualquier desviación —«Metformina 850», «metformina clorhidrato», «Metformina.», «metformina 850mg c/12h»— hace que **ambos** chequeos fallen en silencio. El segundo es especialmente frágil: el mapa `atcPrefixByActiveName` se construye indexando por `genericName` del catálogo, así que un `PatientMedication.genericName` que no coincida carácter por carácter con una entrada del catálogo **no tiene código ATC**, y la detección de «dos AINEs» o «dos opioides» simplemente no ocurre. No lanza error, no registra nada: devuelve un arreglo vacío de advertencias.

A dos años y millones de recetas, el sistema habrá reportado «sin duplicidad terapéutica» un número indeterminado de veces sobre pacientes que sí la tenían, y no habrá forma retroactiva de saber cuáles, porque el fallo no deja rastro.

---

### 2.4 · `EncounterDiagnosis.description` + `codeAbsentReason` — diagnósticos sin código ⚠️ **CRÍTICO** · patrón «no listado»

**Dónde está**
- Esquema: `medicfy-backend/prisma/schema.prisma:887-900` — `icd10Code String?`, `codeAbsentReason String?`, `description String`
- Contrato: `medicfy-backend/packages/contracts/src/schemas/clinical.schema.ts:62-74`
- Servicio: `medicfy-backend/apps/api/src/modules/records/services/clinical-encounter.service.ts:164-170` (al firmar) y `:259-265` (al corregir)
- Frontend: `medicfy-frontend/apps/web/src/components/clinical/icd10-picker.tsx:129-132` — botón **«No tengo un código CIE-10 para este diagnóstico»**; formulario en `:139-151`; escritura en `:76-83`

**Qué catálogo afecta.** El CIE-10 y, por debajo, el vocabulario diagnóstico. Dos problemas encadenados:

1. **La escotilla explícita.** El botón es literalmente el patrón «no listado» del encargo. Está documentado y auditado (`codeAbsentReason` obligatorio, ≥10 caracteres, comentario en `clinical.schema.ts:54-61` diciendo que el usuario se apartó de M8-RN-006 a sabiendas) — es decir, es una decisión tomada, no un descuido. Pero sigue siendo una puerta.
2. **`icd10Code` no es una clave foránea.** En `schema.prisma:887-900`, `EncounterDiagnosis` sólo declara `@relation` hacia `ClinicalEncounter`. **No hay relación con `Icd10Code`.** El contrato acepta `z.string().min(1).max(10)` (`clinical.schema.ts:64`) y `clinical-encounter.service.ts:164-170` lo inserta sin verificar que exista. La UI sólo permite elegir del buscador, pero cualquier cliente de la API puede mandar `icd10Code: "ZZZZ9"` y quedará firmado y hasheado en el expediente.
3. **`description` no tiene tope de longitud.** `z.string().min(1)` sin `.max()`. Es el único campo de la aplicación donde una descripción diagnóstica arbitrariamente larga entra sin límite.

**Qué pasaría con mil médicos durante dos años.** La escotilla es un tobogán: cuesta dos clics y el buscador CIE-10 devuelve como mucho 20 resultados (`icd10.controller.ts:9`, `MAX_RESULTS = 20`) con `contains` simple, sin tolerancia a errores de tecleo ni sinónimos. Cuando la búsqueda de «lumbalgia mecánica» no da lo que el médico espera y la consulta va con retraso, el camino de menor resistencia está a la vista, subrayado, en la misma pantalla. Es previsible que el uso de la escotilla **crezca** con el tiempo en vez de reducirse.

El resultado a dos años: una proporción creciente de diagnósticos sin código, cada uno con una `description` libre, y un CIE-10 que ya no es el índice del expediente sino una de dos formas de decir lo mismo. Toda consulta epidemiológica, todo reporte a la autoridad sanitaria y toda búsqueda por diagnóstico cubrirá sólo la mitad codificada, sin que nada en la interfaz indique qué mitad falta. Y como `description` no tiene tope, el campo es el sitio natural donde acabará pegado el párrafo narrativo del padecimiento de un paciente concreto.

---

### 2.5 · `NoteTemplate.label` + `.content` — texto clínico libre convertido en opción seleccionable ⚠️ **CRÍTICO**

**Dónde está**
- Esquema: `medicfy-backend/prisma/schema.prisma:940-952`
- Contrato: `medicfy-backend/packages/contracts/src/schemas/clinical.schema.ts:246-253`
- Endpoint: `medicfy-backend/apps/api/src/modules/records/note-templates.controller.ts:33-51` (`POST /note-templates`)
- Frontend: `medicfy-frontend/apps/web/src/components/clinical/note-template-bar.tsx:118-119` — botón **«+ Guardar campo actual como plantilla»**; guardado en `:56-61`
- Origen del contenido: `medicfy-frontend/apps/web/src/app/(app)/consulta/[appointmentId]/consulta-form.tsx:292` — `pendingContent={form.getValues(activeField) ?? ""}`

**Qué catálogo afecta.** El catálogo de plantillas de nota del médico — el único caso en todo el sistema donde **texto libre capturado durante una consulta se guarda literalmente como una opción reseleccionable**, con atajo de teclado Alt+1..9.

**Qué pasaría con mil médicos durante dos años.** Este es el mecanismo exacto que en el sistema de referencia produjo *«una entrada de catálogo que contenía la descripción clínica de un paciente concreto»*.

El flujo: el médico está escribiendo el `plan` o el `assessment` de la paciente que tiene enfrente. El texto es específico de ella —nombre, edad, hallazgos, a veces el teléfono de su hija. Piensa «esto me sirve para otras» y pulsa «+ Guardar campo actual como plantilla». `pendingContent` es **el valor crudo del campo activo**. Se envía tal cual (`note-template-bar.tsx:60`), se guarda tal cual (`note-templates.controller.ts:50`). No hay aviso, no hay vista previa de lo que se va a guardar, no hay detección de identificadores, no hay confirmación de que el contenido sea genérico.

Dos años después, un porcentaje no trivial de las plantillas del sistema contiene datos identificables de pacientes reales, congelados y reinsertables con un atajo de teclado. Peor: cada vez que esa plantilla se inserta en la nota de **otro** paciente, los datos de la primera se copian a un expediente que no es el suyo, y esa nota se firma y se vuelve inmutable (`clinical_notes` es append-only real por GRANT). El error no se puede deshacer.

**Mitigante real:** el alcance es por médico, no institucional. `list()` filtra siempre por `doctorId` (`note-templates.controller.ts:30`) y `remove()` verifica propiedad (`:58-62`). Ningún otro médico ve estas plantillas. Eso convierte «visible para toda la institución» en «visible para un médico», lo cual reduce el radio de exposición pero **no evita la contaminación cruzada entre pacientes del mismo médico**, que es el daño clínico.

---

### 2.6 · `ExternalPhysicalPrescription.genericName` + `controlGroup` — fármacos controlados fuera del catálogo

**Dónde está**
- Contrato: `medicfy-backend/packages/contracts/src/schemas/prescription.schema.ts:84-95` — `genericName: z.string().min(1)`, `controlGroup: z.enum(["I","II"])`
- Endpoint: `medicfy-backend/apps/api/src/modules/prescriptions/prescriptions.controller.ts:50-66`
- Servicio: `medicfy-backend/apps/api/src/modules/prescriptions/services/prescription.service.ts:232-269`, en particular `:257` — `genericName: input.genericName` insertado sin consultar `MedicationCatalog`
- Esquema: `medicfy-backend/prisma/schema.prisma:1341` (`PrescriptionItem.genericName`), con `medicationCatalogId String?` **nullable** en `:1350`
- Frontend: `medicfy-frontend/apps/web/src/components/clinical/prescription-panel.tsx:185-186`

**Qué catálogo afecta.** El catálogo de medicamentos, por la ruta de registro de receta física (Grupos I/II).

**Qué pasaría con mil médicos durante dos años.** El frontend se comporta bien: pasa `blockedMedication.genericName` y `blockedMedication.controlGroup` tomados del catálogo (`prescription-panel.tsx:185-186`), así que por la UI el dato sale limpio. **La API no valida nada de eso.** Acepta cualquier `genericName` y deja que el cliente **declare** el `controlGroup` — precisamente lo que el comentario de `prescription.schema.ts:3-12` argumenta que no se debe hacer («R5 es un bloqueo duro que no puede depender de que alguien lo escriba bien»). El razonamiento es correcto y la ruta `external-physical` es la excepción que lo contradice.

A dos años: los registros de estupefacientes y psicotrópicos —justo los que una inspección de COFEPRIS querría cuadrar— quedan con nombres de fármaco en texto libre y un grupo de control autodeclarado, sin `medicationCatalogId` que los ancle. Cualquier cliente distinto del navegador oficial (una app móvil futura, una integración, un script) puede escribir lo que quiera. Y como `PrescriptionItem.medicationCatalogId` es nullable, no hay forma de distinguir por esquema una fila anclada de una inventada.

---

### 2.7 · `PatientAllergy.allergyType`, `.severity`, `.source` — tres vocabularios que deberían ser enums

**Dónde está**

| Campo | Esquema | Contrato | Frontend |
|---|---|---|---|
| `allergyType` | `schema.prisma:977` | `clinical.schema.ts:106` | `tab-antecedentes.tsx:122-123` |
| `severity` | `schema.prisma:979` | `clinical.schema.ts:108` | `tab-antecedentes.tsx:125-126` |
| `source` | `schema.prisma:982` | `clinical.schema.ts:112` | `tab-antecedentes.tsx:138-139` |

**Qué catálogo afecta.** Tres vocabularios cerrados por naturaleza, dejados abiertos. La evidencia de que se sabía cuáles son los valores válidos está en el propio código: el `hint` del formulario dice `"p. ej. medicamento, alimento"` para el tipo (`tab-antecedentes.tsx:122`) y `"p. ej. referida por paciente"` para la fuente (`:138`). Se conocía la lista y se puso como sugerencia en lugar de como restricción. Contraste directo: en la misma pantalla, `certainty` **sí** es un `<SelectInput>` con tres opciones (`tab-antecedentes.tsx:128-134`) porque el contrato lo declara `z.enum` (`clinical.schema.ts:111`).

**Qué pasaría con mil médicos durante dos años.** `severity` es el caso más dañino de los tres: es el campo por el que se ordena y se prioriza clínicamente, y sobre texto libre no se puede ordenar. «Grave», «grave», «severa», «Severa», «alta», «Alta», «anafilaxia», «Anafiláctica», «+++», «3/3», «mortal» son todos «lo mismo» para un humano y diez cubetas distintas para el sistema. No se puede pintar la alergia grave en rojo, no se puede filtrar «muéstrame los pacientes con alergia grave», no se puede ordenar la lista por gravedad.

`allergyType` a esta escala derivará en cientos de variantes de una lista que en la práctica tiene seis o siete miembros (medicamento, alimento, ambiental, picadura, látex, contraste, otro). `source` correrá la misma suerte con una lista de tres o cuatro.

---

### 2.8 · Posología: `dose`, `route`, `frequency`, `duration` — en dos modelos

**Dónde está**
- `PatientMedication`: `clinical.schema.ts:124-126` (`dose`, `route`, `frequency`); esquema `schema.prisma:1009-1011`; frontend `tab-antecedentes.tsx:189-196`
- `PrescriptionItem`: `prescription.schema.ts:16-19` (`dose`, `route`, `frequency`, `duration`); esquema `schema.prisma:1342-1346`; frontend `medication-picker.tsx:31, 92-100`
- `ExternalPhysicalPrescription`: `prescription.schema.ts:89-92`

**Qué catálogo afecta.** El vocabulario de vía de administración y de frecuencia. `route` en particular es un catálogo cerrado en cualquier estándar del mundo (oral, IV, IM, SC, tópica, oftálmica, ótica, rectal, inhalada, sublingual) y aquí es `z.string().min(1)`.

**Qué pasaría con mil médicos durante dos años.** `dose` y `duration` tienen defensa razonable como texto libre: son decisiones clínicas para un paciente concreto y no un vocabulario. `route` y `frequency` no la tienen. A dos años se habrán acumulado «VO», «vo», «V.O.», «oral», «Oral», «por vía oral», «PO», «p.o.» para una sola vía, y «c/8h», «cada 8 horas», «c/8 hrs», «TID», «3 veces al día», «8h» para una sola frecuencia. Cada una de esas cadenas se imprime en una receta legal y se congela en el hash del documento (`prescription.service.ts:145`).

El coste real llega después: cualquier futuro chequeo de dosis máxima diaria, de interacciones, o de adherencia necesita parsear la frecuencia, y parsear ese conjunto de cadenas históricas no es un problema tratable.

---

### 2.9 · `LabResult.labName` — catálogo de laboratorios

**Dónde está**
- Esquema: `medicfy-backend/prisma/schema.prisma:1464` — `labName String?`
- Contrato: `medicfy-backend/packages/contracts/src/schemas/lab-order.schema.ts:55` — `labName: z.string().optional()`
- Servicio: `medicfy-backend/apps/api/src/modules/labs/services/lab-order.service.ts:146`
- Endpoint: `medicfy-backend/apps/api/src/modules/labs/lab-results.controller.ts:65-91`

**Qué catálogo afecta.** El catálogo de laboratorios clínicos. No existe tabla (`assignedLabId` existe en `LabOrder` pero está inactivo en el MVP — `schema.prisma:1393`).

**Qué pasaría con mil médicos durante dos años.** «Chopo», «Laboratorios Chopo», «LABORATORIO CHOPO», «chopo sucursal roma», «Lab. Chopo» como entidades distintas. El día que Medicfy quiera integrarse con una cadena de laboratorios —que es el siguiente paso natural de este producto— no habrá forma de saber cuántos resultados vienen de cada una sin una desambiguación manual del histórico completo.

---

### 2.10 · `PatientHistoryItem.freeText` bajo subtipo `otro` — patrón «otro / especifique»

**Dónde está**
- Vocabulario: `medicfy-backend/packages/contracts/src/schemas/clinical.schema.ts:163` — `"otro"` cierra `HEREDOFAMILIAR_SUBTYPES`; `:192` — `"OTRO"` cierra `FAMILY_RELATIONSHIPS`
- Campos libres: `clinical.schema.ts:199` (`familyRelationshipDetail: z.string().max(200)`), `:202` (`freeText: z.string().max(1000)`)
- Frontend: `medicfy-frontend/apps/web/src/components/clinical/antecedentes-editor.tsx:47` (`otro: "Otro antecedente"`), `:82` (`{ value: "OTRO", label: "Otro familiar" }`), `:162-171` (input «Detalle (opcional)» en **cada** fila, no sólo en «otro»)
- Renderizado: `antecedentes-editor.tsx:355` — el `freeText` se muestra en el resumen de la consulta

**Qué catálogo afecta.** El vocabulario de antecedentes heredofamiliares, por la vía del cajón «otro».

**Qué pasaría con mil médicos durante dos años.** Es la puerta **menos grave** de la lista y hay que decirlo con claridad: el `freeText` es un dato del paciente, **nunca se convierte en una opción seleccionable para nadie**, y las otras 29 filas del vocabulario están cerradas. El diseño es correcto.

Lo que sí ocurre a escala es que el bucket `otro` se convierte en el vertedero del vocabulario. Todo antecedente heredofamiliar que no sea uno de los nueve nombrados —tiroideopatías, epilepsia, EPOC, glaucoma, malformaciones, trombofilias— acaba ahí, indistinguible del resto salvo por un `freeText` sin normalizar. A dos años, `otro` será probablemente la fila con más registros de la categoría y la única sin significado agregable. Y el `freeText` reproduce dentro de ese bucket exactamente los duplicados del sistema de referencia: «tiroideas», «Tiroideas.», «problemas de tiroides», «HIPOTIROIDISMO».

**Recomendación proporcionada:** no cerrar el campo, sino instrumentarlo — un informe periódico de los `freeText` más frecuentes bajo `otro` le dice al curador qué subtipo nuevo hace falta. La escotilla deja de ser un vertedero y se vuelve la entrada del flujo de curación.

---

### 2.11 · `Patient.bloodType`, `.genderIdentity`, `.emergencyContactRelation`

**Dónde está**
- Contrato: `medicfy-backend/packages/contracts/src/schemas/patient.schema.ts:57` (`bloodType: z.string().max(10).optional()`), `:55` (`genderIdentity: z.string().max(60).optional()`), `:69` (`emergencyContactRelation: z.string().max(60).optional()`)
- Esquema: `medicfy-backend/prisma/schema.prisma:461-505` (modelo `Patient`)
- Endpoint: `medicfy-backend/apps/api/src/modules/scheduling/patients.controller.ts:34`
- Frontend: **no expuestos**. `medicfy-frontend/apps/web/src/app/(app)/pacientes/nuevo/page.tsx` no pinta ninguno de los tres (verificado; el comentario de `:16` los menciona como pendientes).

**Qué catálogo afecta.** `bloodType` es el caso más claro de toda la auditoría: un catálogo de **ocho** valores (A+, A−, B+, B−, AB+, AB−, O+, O−) modelado como `String(10)` libre.

**Qué pasaría con mil médicos durante dos años.** Hoy la exposición es sólo por API porque el formulario no los pinta, así que el daño acumulado es cero **mientras eso siga así**. Pero el comentario del formulario dice que están pendientes de agregar: el día que se pinten como `<TextInput>` —el patrón por defecto en este código base— entrarán «O+», «O positivo», «0+», «ORH+», «O RH POSITIVO», «o+». En un campo cuyo propósito es que alguien lo lea en una urgencia. Es la puerta más barata de cerrar de las 24 y la que más conviene cerrar **antes** de exponerla.

Contraste: `sexAtBirth` sí es enum en el contrato (`patient.schema.ts:54`) y `<SelectInput>` en la UI (`pacientes/nuevo/page.tsx:101-105`), y `guardianRelation` también (`patient.schema.ts:30`, UI `:145-155`). La distinción entre lo cerrado y lo abierto en este archivo no sigue ningún criterio visible.

---

### 2.12 · Catálogos de facto administrativos (fuera del núcleo de R2)

Se listan por completitud; no son catálogos clínicos y su daño es menor.

| Campo | Ubicación | Vocabulario de facto |
|---|---|---|
| `Doctor.languages` | `doctor.schema.ts:35`; UI `perfil/page.tsx:523-527` (campo de texto separado por comas, `:459-463`) | idiomas |
| `Doctor.university` | `doctor.schema.ts:36`; UI `perfil/page.tsx:517-518` | universidades |
| `DoctorService.name` | `doctor.schema.ts:100` | servicios ofrecidos |
| `PracticeLocation.addressColonia` / `Municipality` / `State` | `doctor.schema.ts:76-78` | geografía (colonias, municipios, estados de México) |

A dos años, el filtro público «médicos que hablan inglés» no funcionará porque hay «Inglés», «ingles», «English», «Inglés (avanzado)»; y `addressState` tendrá «CDMX», «Ciudad de México», «Distrito Federal», «D.F.», «Cdmx» para la misma entidad federativa — un catálogo oficial de 32 valores que INEGI publica.

---

## 3. Tabla consolidada de las 24 puertas

| # | Campo | Catálogo de facto | Backend (contrato) | Frontend | Sev. |
|---|---|---|---|---|---|
| 1 | `PatientAllergy.substance` | agentes alérgenos | `clinical.schema.ts:105` | `tab-antecedentes.tsx:120` | 🔴 |
| 2 | `LabOrderItem.studyName` | estudios de laboratorio | `lab-order.schema.ts:5` | `lab-order-panel.tsx:180` | 🔴 |
| 3 | `PatientMedication.genericName` | medicamentos | `clinical.schema.ts:122` | `tab-antecedentes.tsx:184` | 🔴 |
| 4 | `EncounterDiagnosis.description` | diagnósticos sin código | `clinical.schema.ts:66` | `icd10-picker.tsx:139-144` | 🔴 |
| 5 | `EncounterDiagnosis.codeAbsentReason` | escotilla «no listado» | `clinical.schema.ts:65` | `icd10-picker.tsx:129-132` | 🔴 |
| 6 | `NoteTemplate.content` | plantillas de nota | `clinical.schema.ts:249` | `note-template-bar.tsx:118-119` | 🔴 |
| 7 | `NoteTemplate.label` | plantillas de nota | `clinical.schema.ts:248` | `note-template-bar.tsx:106-108` | 🟠 |
| 8 | `ExternalPhysical.genericName` | medicamentos controlados | `prescription.schema.ts:87` | `prescription-panel.tsx:185` | 🔴 |
| 9 | `PatientAllergy.severity` | severidad | `clinical.schema.ts:108` | `tab-antecedentes.tsx:126` | 🟠 |
| 10 | `PatientAllergy.allergyType` | tipo de alergia | `clinical.schema.ts:106` | `tab-antecedentes.tsx:123` | 🟠 |
| 11 | `PatientAllergy.source` | fuente del dato | `clinical.schema.ts:112` | `tab-antecedentes.tsx:139` | 🟡 |
| 12 | `PatientMedication.source` | fuente del dato | `clinical.schema.ts:132` | `tab-antecedentes.tsx:199` | 🟡 |
| 13 | `PatientMedication.route` | vía de administración | `clinical.schema.ts:125` | `tab-antecedentes.tsx:193` | 🟠 |
| 14 | `PatientMedication.frequency` | frecuencia | `clinical.schema.ts:126` | `tab-antecedentes.tsx:196` | 🟠 |
| 15 | `PatientMedication.dose` | dosis | `clinical.schema.ts:124` | `tab-antecedentes.tsx:190` | 🟡 |
| 16 | `PrescriptionItem.route` | vía de administración | `prescription.schema.ts:17` | `medication-picker.tsx:31` | 🟠 |
| 17 | `PrescriptionItem.frequency` | frecuencia | `prescription.schema.ts:18` | `medication-picker.tsx:31` | 🟠 |
| 18 | `PrescriptionItem.dose` | dosis | `prescription.schema.ts:16` | `medication-picker.tsx:31` | 🟡 |
| 19 | `PrescriptionItem.duration` | duración | `prescription.schema.ts:19` | `medication-picker.tsx:31` | 🟡 |
| 20 | `LabOrderItem.loincCode` | LOINC (nunca poblado) | `lab-order.schema.ts:6` | — | 🟡 |
| 21 | `LabResult.labName` | laboratorios | `lab-order.schema.ts:55` | `tab-ordenes.tsx` | 🟠 |
| 22 | `PatientHistoryItem.freeText` (`otro`) | antecedentes «otro» | `clinical.schema.ts:202` | `antecedentes-editor.tsx:162-171` | 🟡 |
| 23 | `Patient.bloodType` | tipo de sangre | `patient.schema.ts:57` | no expuesto | 🟠 |
| 24 | `Patient.genderIdentity` + `emergencyContactRelation` | identidad / parentesco | `patient.schema.ts:55, 69` | no expuesto | 🟡 |

🔴 crítico · 🟠 alto · 🟡 medio

---

## 4. Evaluación del módulo `catalog` nuevo

**Archivos** (4, 418 líneas):
- `medicfy-backend/apps/api/src/modules/catalog/catalog.module.ts` (12)
- `medicfy-backend/apps/api/src/modules/catalog/services/clinical-catalog.service.ts` (150)
- `medicfy-backend/apps/api/src/modules/catalog/term-normalizer.util.ts` (19)
- `medicfy-backend/apps/api/src/modules/catalog/clinical-catalog.integration.spec.ts` (237)
- Contrato: `medicfy-backend/packages/contracts/src/schemas/catalog.schema.ts`
- Modelo: `medicfy-backend/prisma/schema.prisma:1486-1531`

### 4.1 ¿Cierra la puerta por diseño o sólo por disciplina?

**Por disciplina. Más exactamente: por ausencia.** Y hay que ser justo con lo que sí hace bien.

**Lo que está bien hecho — y es bastante:**

| Mecanismo | Dónde | Por qué cuenta |
|---|---|---|
| Índice único `(domain, normalizedTerm)` | `20260826200932_catalog_normalized_term/migration.sql` | Barrera **de base de datos**, no de aplicación. Sobrevive a condiciones de carrera y a código futuro descuidado. Es garantía real. |
| Índice único `(domain, key)` | `20260826190911_.../migration.sql` | Idem. |
| `normalizedTerm` calculado en servidor | `clinical-catalog.service.ts:28` | Nunca viaja del cliente. Correcto. |
| Sin `DELETE` en el GRANT | `20260826194547_..._grants/migration.sql` | `GRANT SELECT, INSERT, UPDATE` — un término no se puede borrar ni por error de código. |
| Nada de borrado lógico destructivo | `.service.ts:115-141` | `obsolete()`/`merge()` sólo cambian `status`; la fila y su `id` sobreviven. Un registro que ya apunta a un término fusionado lo sigue resolviendo. |
| Guardia anti-ciclo en `resolveCurrent()` | `.service.ts:98-113` | Defensivo y correcto; el razonamiento de por qué `merge()` no puede crear ciclos (`:120-124`) es sólido. |
| `codingSystem` obligatorio | `catalog.schema.ts:15` | Fuerza declarar «PROPIETARIO» explícitamente en vez de dejar el campo vacío. |
| Auditoría de duplicados | `.service.ts:68-85` | `findPotentialDuplicates()` para detectar lo que haya entrado por otra vía. |

Esa columna es trabajo serio. El problema no es la calidad, es el alcance.

**Lo que hace que sea disciplina y no diseño:**

1. **No hay controlador.** `catalog.module.ts:8-11` declara `providers` y `exports`, cero `controllers`. El comentario lo dice: *«el prompt pide "esquema, migraciones y repositorio de acceso", no una API»*. Es una decisión consciente y correcta para el alcance del prompt, pero significa que **hoy no hay nada que cerrar**: la puerta no está cerrada, está sin construir.

2. **`ClinicalCatalogService` no tiene ningún consumidor.** Verificado por `grep` en `apps/`, `packages/` y `prisma/`: la única referencia fuera del propio módulo es `app.module.ts:30` (`CatalogModule`) y el `.spec`. Ninguno de los 13 vocabularios de la §2 lo usa. El módulo es una isla.

3. **El GRANT no distingue captura de curación.** `GRANT SELECT, INSERT, UPDATE ON "clinical_catalog_terms" TO medicfy_app` — y toda la aplicación corre como `medicfy_app`. Compárese con `clinical_notes`, donde el proyecto **sí** usa el GRANT como barrera semántica (append-only real, sin UPDATE) y el servicio se reorganizó para respetarlo (`clinical-encounter.service.ts:19-31`). Aquí no hay separación equivalente: en el momento en que cualquier servicio de captura inyecte `ClinicalCatalogService` y llame a `create()`, la base de datos lo permitirá sin objeción. Lo único que lo impide hoy es que nadie lo haya escrito.

4. **`create()` no comprueba quién llama.** No recibe actor, no consulta rol, no registra en `AuditLog`. `curatedBy` es `String?`, `.optional()` en el contrato (`catalog.schema.ts:16`) y descriptivo — el propio esquema lo admite: *«Referencia descriptiva simple — se vuelve FK real a un usuario curador cuando exista ese rol (Prompt 10, fuera de este pase)»* (`schema.prisma:1517-1518`). Un término puede nacer sin curador declarado.

**Veredicto.** El módulo es una **buena base para un catálogo cerrado**, con la garantía más importante (el índice único de Postgres) ya puesta en la capa correcta. Pero R2 tiene dos mitades: «ningún endpoint de captura puede insertar» y «el alta de términos es un flujo aparte con rol curador». La primera se cumple hoy por vacío. La segunda **no está construida**. Y ninguna de las dos toca los 13 vocabularios que en la práctica ya funcionan como catálogos abiertos.

### 4.2 ¿Existe ya un rol curador?

**No.** `RoleName` (`medicfy-backend/prisma/schema.prisma:26-36`) contiene `PATIENT`, `DOCTOR`, `ASSISTANT`, `LAB`, `SUPPORT`, `ADMIN`, `SUPERADMIN`. No hay `CURATOR` ni equivalente.

El único guardia de rol del sistema es `AdminGuard` (`medicfy-backend/apps/api/src/modules/identity/guards/admin.guard.ts:10-17`), que acepta `ADMIN`/`SUPERADMIN` y está declarado como *«Minimal role check»* provisional. `AdminModule` está vacío (`modules/admin/admin.module.ts` — `@Module({})`).

`grep -i "curador|curator"` en todo el árbol devuelve **5 resultados**, todos referidos al campo `curatedBy` o a su comentario. Ninguno es un rol, un guardia ni una comprobación de permiso.

### 4.3 ¿Existe normalización y detección de duplicados?

**Sí, ambas.** El normalizador es `medicfy-backend/apps/api/src/modules/catalog/term-normalizer.util.ts:15-19`:

```ts
export function normalizeTerm(text: string): string {
  const withoutAccents = text.normalize("NFD").replace(COMBINING_DIACRITICAL_MARKS, "");
  const withoutTrailingPunctuation = withoutAccents.toLowerCase().trim().replace(TRAILING_PUNCTUATION, "");
  return withoutTrailingPunctuation.replace(/\s+/g, " ").trim();
}
```

Hace exactamente las cuatro cosas prometidas: minúsculas, sin acentos, sin puntuación final, colapso de espacios. La detección de duplicados tiene dos capas: comprobación previa con mensaje explicativo que nombra el término existente (`clinical-catalog.service.ts:29-39`) y el índice único de Postgres como red real contra carreras (`:53-59`).

### 4.4 Prueba del normalizador contra los casos del encargo

Ejecutado con Node sobre el código real de `term-normalizer.util.ts`:

| Caso | Formas normalizadas | ¿Detecta duplicado? |
|---|---|---|
| «Dislipidemias» / «Dislipidemia» | `dislipidemias` / `dislipidemia` | ❌ **No** |
| «hipotiroidismo» / «HIPOTIROIDISMO» | `hipotiroidismo` / `hipotiroidismo` | ✅ **Sí** |
| «hipotiroidismo» / «Tiroideas.» | `hipotiroidismo` / `tiroideas` | ❌ **No** |
| «HIPOTIROIDISMO» / «Tiroideas.» | `hipotiroidismo` / `tiroideas` | ❌ **No** |
| «Ninguno» / «Ninguna» | `ninguno` / `ninguna` | ❌ **No** |
| «Ninguno» / «Negados» | `ninguno` / `negados` | ❌ **No** |
| «Ninguno» / «SANO» | `ninguno` / `sano` | ❌ **No** |
| «Ninguna» / «Negados» / «SANO» | 3 formas distintas | ❌ **No** |

**Resultado: 1 de 8 pares.** Los tres grupos del encargo se resuelven así:
- Grupo «Dislipidemias/Dislipidemia» (singular/plural): **0 de 1**. No detectado.
- Grupo «hipotiroidismo/HIPOTIROIDISMO/Tiroideas.»: **1 de 3**. Sólo el par de mayúsculas.
- Grupo «Ninguno/Ninguna/Negados/SANO»: **0 de 6**. Ninguno detectado — quedan como **cuatro términos de catálogo distintos**.

**Esto está documentado y asumido.** Las pruebas del módulo lo afirman caso por caso (`clinical-catalog.integration.spec.ts:15-38`), incluyendo `it('"Dislipidemias" y "Dislipidemia" NO normalizan igual — singular/plural, fuera de alcance a propósito')`. El comentario del util (`term-normalizer.util.ts:3-5`) dice que se confirmó con el usuario y que esos casos van al campo `synonyms`, curado a mano. Es una decisión tomada, no un descuido — y la decisión es defendible: singular/plural y sinónimos sin raíz común no son problemas de formato.

**Pero el encargo pregunta si los detectaría, y la respuesta honesta es que el grupo más peligroso de los tres no lo cubre nadie.** «Ninguno/Ninguna/Negados/SANO» no es un problema de formato **ni** de sinónimos: es el clúster de **respuestas negativas**, la forma en que cuatro médicos distintos dicen «no hay nada que reportar». Es también el grupo más frecuente en la práctica (la mayoría de los antecedentes son negativos) y el que más ensucia cualquier agregado. No hay ninguna prueba que lo cubra en el `.spec`, ni mención en los comentarios. La estrategia de `synonyms` curados a mano depende de que un curador —que no existe— note el patrón y lo agrupe. Con 1,000 médicos, para cuando alguien lo note ya habrá decenas de variantes.

### 4.5 Defecto encontrado en el normalizador: la `ñ` se colapsa en `n`

**No documentado, no cubierto por pruebas, y genera falsos positivos.**

`"ñ"` (U+00F1) se descompone en NFD como `n` + U+0303 (tilde combinante), que cae dentro del rango `[̀-ͯ]` que la línea 16 elimina. Verificado ejecutando el código real:

```
"Niño"    -> "nino"      "Nino"    -> "nino"     ← colisión
"Año"     -> "ano"       "Ano"     -> "ano"      ← colisión
"muñeca"  -> "muneca"    "muneca"  -> "muneca"   ← colisión
"peña"    -> "pena"      "pena"    -> "pena"     ← colisión
```

En vocabulario clínico español esto importa: **«Año»** (unidad de edad de inicio) y **«Ano»** (región anatómica) son términos clínicos reales y distintos que normalizan igual. Lo mismo **«muñeca»** (articulación) y **«muneca»**. Con el índice único `(domain, normalizedTerm)` en su sitio, el efecto no es una fusión silenciosa sino un **rechazo**: el segundo término legítimo recibe un 409 `CATALOG_TERM_DUPLICATE_NORMALIZED_FORM` con un mensaje que le dice al curador que «Ano» es equivalente a «Año» — y no habrá forma de darlo de alta sin cambiar la clave o el dominio.

El comentario de las líneas 7-11 explica cuidadosamente por qué el rango se escribe como `new RegExp("\\u0300-...")` en vez de literal. El razonamiento es bueno; la consecuencia sobre la `ñ` no se consideró.

**Corrección sugerida** (mínima, sin tocar el resto del comportamiento): preservar `ñ`/`Ñ` antes de descomponer y restaurarla después, o excluir U+0303 cuando va precedida de `n`.

### 4.6 Otras limitaciones del normalizador

- **La puntuación inicial no se toca.** `"¿Diabetes?"` → `"¿diabetes"`, que no colisiona con `"diabetes"`. Documentado a propósito en `clinical-catalog.integration.spec.ts:33-36`, pero sigue siendo una vía de duplicado.
- **La puntuación interior no se toca.** `"Diabetes-Mellitus"` ≠ `"Diabetes Mellitus"`.
- **`findPotentialDuplicates()` sólo agrupa por `normalizedTerm` exacto** (`clinical-catalog.service.ts:69-73`). No hace distancia de edición ni comparación de raíces, así que no encontrará ninguno de los casos que el normalizador ya no detectó. Su valor es de auditoría del índice, no de descubrimiento — el propio comentario (`:64-67`) lo dice.
- **`synonyms` es un `String[]` sin normalizar** (`schema.prisma:1513`, `catalog.schema.ts:13`) y **no participa en el índice único ni en la comprobación de duplicados** de `create()`. Un `preferredTerm` nuevo que ya exista como sinónimo de otro término **no será detectado**.

---

## 5. Conclusiones

1. **R2 se cumple literalmente. 0 endpoints insertan en una tabla de catálogo, 0 `upsert`/`connectOrCreate` implícitos.** Verificado contra los 61 endpoints mutantes del backend. Los cinco catálogos reales son de solo lectura desde la API y sólo se pueblan por `seed.ts`. Los códigos de especialidad, que llegan como `String`, sí se validan contra la tabla `Specialty`.

2. **R2 se incumple en sustancia por 24 campos de texto libre que forman 13 vocabularios clínicos de facto.** El desastre de 140 antecedentes duplicados no necesita un endpoint de catálogo: le basta un `<TextInput>`. Medicfy tiene 24.

3. **Tres de esos vocabularios ni siquiera tienen tabla:** estudios de laboratorio, agentes alérgenos y laboratorios clínicos. No hay puerta que cerrar porque nunca se construyó una habitación.

4. **Dos de las puertas degradan comprobaciones de seguridad activas**, no sólo la calidad de los datos: el cruce alergia↔receta compara por subcadena contra texto libre (`prescription.service.ts:72`) y la duplicidad terapéutica compara por igualdad exacta (`:87`, `:112-113`). Ambas fallan en silencio y sin dejar rastro.

5. **Una puerta reproduce exactamente el peor incidente del sistema de referencia:** «+ Guardar campo actual como plantilla» (`note-template-bar.tsx:118-119`) toma el texto clínico crudo del paciente que está en pantalla y lo persiste como opción reutilizable, sin aviso ni depuración. Mitigado por estar acotado a un solo médico, no eliminado.

6. **El módulo `catalog` es una buena base con dos garantías reales** (el índice único de Postgres y el GRANT sin DELETE) **pero está desconectado de todo.** Sin controlador, sin consumidores, sin rol curador, y sin cubrir ninguno de los 13 vocabularios reales. Cierra la puerta por ausencia de puerta.

7. **El normalizador detecta 1 de los 8 pares del encargo.** Cubre el caso de formato (mayúsculas, acentos, puntuación final, espacios) exactamente como promete y como sus pruebas documentan. No cubre singular/plural ni sinónimos —decisión consciente y defendible— pero tampoco cubre el clúster de respuestas negativas («Ninguno/Ninguna/Negados/SANO»), que es el más frecuente y el que nadie ha asignado a ninguna estrategia.

8. **Defecto nuevo: la `ñ` se colapsa en `n`**, generando falsos positivos entre términos clínicos legítimos («Año»/«Ano», «muñeca»/«muneca») que el índice único convertirá en rechazos irresolubles.

9. **El equipo sabe hacerlo bien.** `PatientHistoryItem.subtype` es un enum cerrado de 30 valores con UI fija; `sexAtBirth`, `guardianRelation`, `certainty`, `status` y `diagnosisType` son enums; `prescriptionItemCreateSchema` exige `medicationCatalogId` y resuelve todo lo demás del catálogo; los códigos de especialidad se validan contra la tabla. **La diferencia entre lo cerrado y lo abierto no sigue ningún criterio visible** — parece depender de qué prompt construyó cada pieza. Esa inconsistencia, y no la falta de capacidad, es lo que hay que corregir.

---

## 6. Recomendaciones, en orden de coste/beneficio

**Inmediatas (baratas, alto impacto):**
1. Convertir en `z.enum` los seis vocabularios que ya se sabe que son cerrados: `PatientAllergy.allergyType`, `.severity`, `.source`; `PatientMedication.source`, `.route`; `Patient.bloodType`. Los `hint` de los formularios ya contienen las listas. Cerrar `bloodType` **antes** de exponerlo en la UI.
2. Poner `.max()` en `EncounterDiagnosis.description`.
3. Corregir la `ñ` en `normalizeTerm()` y añadir el caso a las pruebas.
4. En `PatientAllergy.substance`, elevar el mínimo de `min(1)` a algo que impida que una cadena de 1-2 caracteres dispare el cruce por subcadena.

**Siguientes (el núcleo de R2):**
5. Crear el rol `CURATOR` en `RoleName` y un `CuratorGuard`; convertir `curatedBy` en FK a `User`; auditar cada `create()`/`merge()`/`obsolete()` en `AuditLog`.
6. Construir el catálogo de estudios de laboratorio como primer dominio de `ClinicalCatalogTerm` (`domain = "ESTUDIO_LABORATORIO"`, `codingSystem = "LOINC"` o `"PROPIETARIO"`), y cambiar `LabOrderItem.studyName` por una FK. Es el de mayor volumen y el que más se beneficia.
7. Migrar `PatientAllergy.substance` a `domain = "ALERGIA_AGENTE"` — el dominio que el propio esquema ya nombra como ejemplo.
8. Anclar `PatientMedication.genericName` a `MedicationCatalog` (FK nullable + campo libre sólo como excepción marcada), para que los chequeos de duplicidad terapéutica dejen de depender de igualdad de cadenas.

**Estructurales:**
9. Añadir a `create()` una comprobación contra `synonyms`, no sólo contra `preferredTerm`.
10. Instrumentar las escotillas en lugar de cerrarlas: informe periódico de los `codeAbsentReason` y de los `freeText` bajo `otro` más frecuentes, como cola de entrada del curador. Una escotilla medida es una fuente de vocabulario; una escotilla no medida es un vertedero.
11. Añadir a las plantillas de nota una vista previa del contenido a guardar y un aviso sobre datos identificables.
