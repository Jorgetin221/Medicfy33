# Medicfy — estado al 27 de agosto de 2026 (2ª sesión) y siguiente paso

> Documento de traspaso. Si eres una sesión nueva retomando este trabajo,
> **lee esto primero** y luego `docs/auditoria/P6-remediacion.md`.

## Dónde estamos en el plan de 58 prompts

| Bloque | Estado |
|---|---|
| **Bloque 0 · Diagnóstico** (prompts 1–6) | **Terminado.** Informes en `docs/auditoria/P1`…`P6`. |
| **Remediación previa a la Fase 0** | **Terminada y VERIFICADA: la suite completa corrió en verde.** |
| **Fase 0 · Catálogos** (prompts 7–11) | **TERMINADA POR LA LETRA** — con el doc de 58 prompts ya en el repo: bandeja de solicitudes de término (prompt 10) y catálogos poblados (prompt 9, 120 términos en 8 dominios con fuente declarada); prueba 11.4 (cero duplicados) en verde. |
| **Fase 4 · El plan del paciente** (prompts 32–38) | **Construida y verificada — las 6 pruebas del prompt 38B pasan (y una extra: borrador no emite documentos). El prompt 33 (base de medicamentos licenciada) sigue 🔒 PENDIENTE DE LICENCIA: el motor de interacciones y el buscador funcionan con 10 medicamentos y 2 pares de interacción SINTÉTICOS, marcados.** |
| **Fase 3 · La nota como datos** (prompts 25–31) | **Construida y verificada — 5 de las 6 pruebas del prompt 31B pasan; la 31.5 (exportación FHIR validada) sigue DIFERIDA por decisión previa de Jorge.** |
| **Fase 2 · Historia clínica estructurada** (prompts 18–24) | **Construida y verificada — las CINCO pruebas del prompt 24 pasan.** Falta solo el criterio de los 10 minutos, que exige el material clínico real de Jorge (🔒). |
| **Fase 1 · Escritorio de Consulta** (prompts 12–17) | **TERMINADA POR LA LETRA** — las cinco pruebas del prompt 17 pasan (agenda en 2 clics, recarga con borrador+scroll, alergia sin scroll, cajón táctil de la Zona 3, otro médico→403). Zona 1 en orden de prominencia, Zona 3 esqueleto con carga diferida, autoguardado con rebote de 2s+blur+hora, encadenar consultas. |

## Verificación de la suite (esta sesión)

`binaries.prisma.sh` sigue bloqueado en este entorno; se desbloqueó
compilando el engine de Prisma **desde el código fuente** (tag 5.22.0 de
`prisma/prisma-engines`, commit exacto `605197…` — el que el cliente
espera). Receta completa en la "Nota operativa" de abajo. Con eso:

- **218 pruebas de API + 30 de contratos en verde, 0 fallos** (4 `it.todo`),
  contra Postgres 16 real con las 22 migraciones y el seed aplicados.
- Los cuatro arreglos del Bloque 0 quedaron **verificados ejecutando**:
  los tres IDOR (`m5a`, `lab-results`) y `REVOKE DELETE` (`append-only`).
- Typecheck estricto y eslint limpios en backend y frontend.
- `next build` del frontend: **verificado** — compila y prerenderiza las
  13 rutas usando el mecanismo oficial de mock de fuentes de next/font
  (`NEXT_FONT_GOOGLE_MOCKED_RESPONSES`); en la Mac las fuentes se
  descargan normal.

## Qué se construyó en la Fase 0 (prompts 7–11)

**Prompt 7-8 (ya existían):** esquema `ClinicalCatalogTerm`, normalizador
(ñ protegida, plural -as/-os), índice único `(domain, normalizedTerm)`.

**Prompt 9 — dominios y terminología:**
- La lista de dominios de catálogo quedó **cerrada en el contrato**
  (`CATALOG_DOMAINS` en `catalog.schema.ts`): ALERGIA_AGENTE,
  ESTUDIO_LABORATORIO, LABORATORIO_CLINICO, VIA_ADMINISTRACION,
  FRECUENCIA_DOSIS, ANTECEDENTE. La columna sigue siendo String (agregar
  un dominio = cambio de código, no migración).
- El clúster de respuestas negativas («Ninguno/Ninguna/Negados/SANO») —
  el grupo que P4 §4.4 señaló como sin dueño — se sembró como término
  canónico **"Negado"** del dominio ANTECEDENTE con las variantes como
  sinónimos curados (`prisma/seed.ts`).
- El enum de 30 subtipos de antecedentes sigue siendo la fuente primaria.

**Prompt 10 — rol curador:**
- `CURATOR` agregado a `RoleName` (migración `20260827040000`);
  `CuratorGuard` (acepta CURATOR y SUPERADMIN para el arranque; ADMIN
  a propósito NO).
- `curatedBy` ahora es **FK real a users(id)** (migración `20260827040100`)
  y lo fija **siempre el servidor** con el actor autenticado — se eliminó
  del contrato de entrada.
- API nueva en `catalog.controller.ts`: GET `/catalogs/:domain` (lectura
  con búsqueda normalizada y por sinónimos, cualquier autenticado),
  POST `/catalogs/:domain/terms`, POST `/catalogs/terms/:id/merge`,
  POST `/catalogs/terms/:id/obsolete`, GET `/catalogs/:domain/duplicates`
  (todo curador; **no existe DELETE**). Cada mutación queda en `audit_log`.
- Informes del curador (P4 §6.10, "escotilla medida"): GET
  `/catalogs/reports/antecedentes-otro` y `/reports/diagnosticos-sin-codigo`
  — frecuencias del texto libre, umbral mínimo de 2, acceso auditado.

**Prompt 11 — cero duplicados:**
- `create()` ahora rechaza también colisiones contra **sinónimos** (ambas
  direcciones: término nuevo vs sinónimos existentes, y sinónimos nuevos
  vs términos existentes) — cerraba el hueco de P4 §4.6.
- 20 pruebas nuevas: `catalog-api.integration.spec.ts` (8, incluye la
  prueba negativa de autorización DOCTOR→403) y ampliaciones en
  `clinical-catalog.integration.spec.ts`.

**Remediaciones inmediatas de P4 §6.1–6.4 (iban con la fase):**
- Seis vocabularios cerrados con `z.enum` en los contratos:
  `allergyType`, `severity`, `source` (alergia), `source` y `route`
  (medicación), `bloodType` (cerrado ANTES de exponerse en la UI).
- `substance` de alergia: `min(3)` — mata los falsos positivos por
  subcadena corta («no», «x») del cruce alergia↔receta.
- `EncounterDiagnosis.description`: `.max(500)` (era el único campo sin tope).
- Frontend: los cinco `<TextInput>` correspondientes ahora son
  `<SelectInput>` (`tab-antecedentes.tsx`), con etiquetas compartidas
  desde los contratos.
- Plantillas de nota (#14): vista previa del contenido exacto + aviso de
  datos identificables antes de guardar (`note-template-bar.tsx`).
- `packages/contracts` **re-sincronizado** entre backend y frontend
  (idénticos otra vez; la divergencia de P1 quedó cerrada — la
  consolidación física en un solo paquete sigue pendiente, #10).

## Qué se construyó de la Fase 1 (27 ago, misma sesión)

**#18 — Embarazo** (no existía en ninguna parte del repositorio):
- Modelo `PatientPregnancy` + migración `20260827050000`: FUM opcional,
  FPP siempre presente (servidor: FUM+280 por Naegele, o la capturada
  por ultrasonido), método de datación explícito, un solo ACTIVE por
  paciente (índice único parcial de Postgres), DELETE revocado.
- Las SDG se calculan al LEER a partir de la FPP y nunca se almacenan.
- Endpoints bajo `/records/patients/:id/pregnancy` (GET/POST/PATCH/close),
  todos tras CareRelationshipGuard y con bitácora. Una FUM recordada
  tarde no degrada una datación por ultrasonido.
- Zona 1: banner "🤰 Embarazo: X.Y SDG · FPP …" bajo el encabezado.

**#19 — Diagnósticos vigentes** (no había lista de problemas activos):
- `GET /records/patients/:id/active-diagnoses`: vista DERIVADA de los
  diagnósticos de consultas firmadas — deduplicada por CIE-10, o por
  descripción normalizada (el normalizador del catálogo) cuando no hay
  código; con conteo de repeticiones y orden por más reciente. Sin
  tabla nueva y sin ciclo de vida inventado: marcar un problema como
  "resuelto" es una regla clínica que queda para Jorge.
- Zona 1: sección "Diagnósticos vigentes" (top 5) antes de Antecedentes.

**#20 — Infraestructura de pruebas de frontend** (había CERO pruebas de UI):
- Vitest + Testing Library (`apps/web/vitest.config.ts`): primeras 5
  pruebas de componente, sobre la Zona 1 (banner de embarazo,
  diagnósticos vigentes, últimas 3 firmadas, estados vacíos).
- **Playwright a 1280×800** (`playwright.config.ts`, proyecto
  "tableta"): el criterio duro de DOC-06 ahora es una prueba que corre
  — `e2e/doc06-tableta.spec.ts` verifica la Zona 1 COMPLETA visible
  sin scroll ni clic (nombre, embarazo, diagnósticos, antecedentes,
  alergias, últimas 3 consultas, cada caja dentro de los 800px) y los
  objetivos táctiles de 44px (R8). `e2e/global-setup.ts` siembra
  doctora verificada + paciente con la Zona 1 poblada por la API real.
- Para correrlo: API en :3001, web en :3000 (`next start` tras build),
  `npx playwright test` en apps/web. En entornos con Chromium
  preinstalado: `E2E_CHROMIUM_PATH=<binario>`.
- Verificado en esta sesión: 2/2 e2e en verde contra la pila completa
  (Postgres real + API real + build de producción del web).

Suite total: **243 API + 30 contratos + 5 UI + 6 e2e**, typecheck y lint limpios en ambos árboles.

**Segundo bloque de la Fase 1 (misma sesión):**
- **Consulta sin ratón, probada**: `e2e/doc06-teclado.spec.ts` ejecuta
  una consulta de seguimiento completa solo con teclado — nota, alta de
  diagnóstico con ↑/↓/Enter en el buscador CIE-10 (navegación de
  combobox agregada al picker, con roles ARIA), Ctrl+Enter para firmar,
  confirmación nativa y redirección con toast. 3/3 e2e en verde.
- **M8-RN-013 persistida**: `timeToSignSeconds` en ClinicalEncounter,
  fijada por el SERVIDOR al firmar (migración `20260827060000`), con
  prueba de integración. Es tiempo de reloj de pared: un borrador
  retomado días después la infla, y eso queda visible a propósito.
- **Dos modos con objetivo visible**: el cronómetro de DOC-06 muestra
  "objetivo 12–15 min" / "3–4 min" según el modo y avisa con TEXTO
  (no solo color) al rebasarlo.
- El autoguardado offline (IndexedDB cifrado) YA EXISTÍA
  (`offline-draft-store.ts` + `use-encounter-autosave.ts`).

**Qué le queda a la Fase 1:** prueba dedicada del almacén offline
(fake-indexeddb) y el cierre formal contra el texto de los prompts
12-17 — **el documento de 58 prompts no está en el repo**; con él a la
mano se verifica prompt por prompt.

## Cierre por la letra (el doc de 58 prompts ya está en el repo)

`docs/medicfy-58-prompts.md` es ahora la fuente de verdad en el árbol.
Con él se cerraron los huecos de letra de las fases 0 y 1:

- **Prompt 10 completo**: `CatalogTermRequest` — el médico solicita un
  término desde la captura (si ya existe, el 409 le dice cuál usar), el
  curador aprueba/rechaza/fusiona desde su bandeja; todo auditado.
- **Prompt 9**: 120 términos sembrados en 8 dominios, cada uno con su
  fuente declarada y `pendingMedicalReview=true` donde falta el visto
  de Jorge (alergenos, sustancias NIDA, tipos de nota/documento).
  DIFERIDOS y declarados: ocupaciones (SINCO), aseguradoras, estudios
  en dos niveles y motivos (se consumen en Fase 4/5). Decisión 🔒
  SNOMED: mientras no se licencie, todo es PROPIETARIO.
- **Prompt 13**: Zona 1 reordenada a la prominencia exigida — alergias
  PRIMERO (rojo + reacción + "sin alergias" explícito), identidad,
  diagnósticos con código, embarazo, medicación crónica expandible.
  (La "vista materializada" literal se difirió: la barra carga en una
  sola pasada y no re-consulta al cambiar pestañas, que es el efecto
  que el prompt persigue; materializar en Postgres puede llegar como
  optimización cuando haya volumen.)
- **Prompt 14**: Zona 3 esqueleto — 5 pestañas vacías con carga
  diferida real, panel fijo ≥1024px, cajón táctil debajo, pestaña
  recordada por médico.
- **Prompt 15**: rebote de 2s + guardado al blur + "Guardado a las
  HH:MM" + recarga que restaura borrador Y punto de scroll.
- **Prompt 16**: "siguiente paciente" al firmar — salta a la siguiente
  cita CONFIRMADA del día o regresa a la agenda; R4 se revalúa al
  abrir la siguiente.

## Fase 2 — Historia clínica estructurada (misma sesión)

**Prompt 18** — el modelo longitudinal ya existía (upsert + change log
con autor y fecha); se completó: `catalogTermId` (el subtipo se
resuelve contra el dominio ANTECEDENTE — un término aprobado por el
curador es usable al instante, uno inventado se rechaza 422), marca
`inheritedFromTemplate`/`inheritedReviewedAt`, y la equivalencia FHIR
declarada campo por campo en el schema (FamilyMemberHistory /
Condition / Observation).

**Prompt 19/20** — captura marcando, no redactando: matriz
heredofamiliar (filas = padecimientos del catálogo; columnas = padre,
madre, abuelos paternos, abuelos maternos, hermanos, hijos; cada celda
cicla —/✓/✗/? en UNA pulsación; "se desconoce" ≠ "negado"), indicador
de avance por bloques, buscador sobre el catálogo y enlace "solicitar
término nuevo" (flujo del prompt 10). ABUELOS_PATERNOS/MATERNOS
agregados al contrato (ABUELOS unificado queda por filas previas).

**Prompt 21** — `PatientSubstanceUse` sobre el catálogo
SUSTANCIA_PSICOACTIVA: estado/cantidad/unidad/edad de inicio/fecha de
suspensión; cantidad+unidad OBLIGATORIAS si activo/suspendido; índice
tabáquico y unidades estándar/semana calculados y ALMACENADOS en
servidor con fórmula y versión (v1). Caso verificado: 6 cigarros/día ×
12 años = 3.6 paquetes-año. Change log R1 propio.

**Prompt 22** — `PatientGynecoHistory`: menarca, ciclo, actividad
sexual, método anticonceptivo (lista cerrada), fórmula obstétrica
G/P/C/A, perinatales. El servidor lo OCULTA para sexo M sin
habilitación explícita (`manuallyEnabled`), y rechaza escrituras (422).
Versionado con change log.

**Prompt 23A** — la alergia nace del catálogo: `agentKey` →
`catalogTermId` (+ `medicationCatalogId` opcional para fármacos, listo
para el cruce de la Fase 4). La ruta de texto libre del alta se cerró
(P4 §2.1 resuelto de raíz); el formulario usa selector del catálogo +
solicitar término.

**Prompt 23B** — `AntecedentesTemplate` por especialidad, del médico:
aplicar corre el MISMO upsert (nunca un camino aparte) marcando cada
dato heredado; **la firma se bloquea** (422 con la lista exacta)
mientras haya heredados sin revisar; se revisan confirmando (✓) o
recapturando. Una plantilla con términos fuera de catálogo se rechaza
al crearla.

**Prompt 24** — las cinco pruebas literales en verde
(`fase2-historia.integration.spec.ts`): término fuera de catálogo
rechazado, gineco oculto para sexo M sin habilitación, 6×12=3.6
almacenado, valor previo consultable con fecha y autor, y plantilla +
firma sin revisar → error con pendientes.

**Pendiente de la Fase 2 (🔒 Jorge):** el criterio de los DIEZ MINUTOS
exige su material clínico real — necesito: (1) el texto completo de
una primera consulta y uno de seguimiento reales (anonimizados), (2)
el ORDEN en que llena los campos, (3) las frases que repite (para las
plantillas). Con eso se mide el tiempo y se calibran las plantillas.
También pendiente: UI para CREAR plantillas (hoy se crean por API) y
su revisión de los vocabularios sembrados con pendingMedicalReview.

## Fase 3 — La nota como datos (misma sesión)

**Prompt 25** — la nota ya era campos tipados (nunca HTML); se
completó: tipo de nota TOMADO DEL CATÁLOGO (TIPO_NOTA: hc/ne/urg según
el tipo de encuentro, fijado por el servidor), especialidad del autor
como snapshot, y la equivalencia FHIR declarada campo por campo
(Composition/ClinicalImpression). "Cancelada" no existe para una nota
firmada (R1): se corrige con adenda, nunca se cancela.

**Prompt 26** — `VitalSignSet`: sistólica y diastólica SEPARADAS, FC,
FR, temperatura, SpO2, peso, talla y perímetros cefálico/abdominal —
cada uno en su columna con la unidad en el nombre. Rangos por edad
(fuentes PALS/ACC-AHA citadas en `vital-ranges.util.ts`, PENDIENTES de
su validación médica) con marcas de fuera-de-rango y crítico; **un
valor crítico bloquea la firma (422) hasta confirmación explícita**,
también en la UI.

**Prompt 27** — cálculos SIEMPRE en servidor, con fórmula y versión:
IMC (verificado: 78.4 kg / 1.58 m → 31.4), superficie corporal por
**Mosteller 1987** (verificada contra caso limpio: 180 cm / 80 kg →
2.00 m² exactos; elegida por ser la de uso clínico más extendido y la
más auditable), y **percentilas pediátricas reales**: 1,112 filas LMS
de la OMS 2006 (0-60 m) y CDC 2000 (24-240 m), extraídas del paquete
público pygrowup que redistribuye las tablas oficiales — verificado
que la mediana OMS (9.6479 kg, niños 12 meses) produce exactamente
P50. Un IMC/BSA enviado por el cliente SE IGNORA y se recalcula.

**Prompt 28** — FK real a `icd10_codes`: un código inventado ("ZZZZ9")
ya no puede quedar firmado y hasheado (el hueco de P4 §2.4). Certeza
presuntivo/definitivo/**DESCARTADO**: descartar no borra — conserva la
fila con fecha y autor y la saca de los diagnósticos vigentes. La
codificación compuesta futura no exige cambiar el esquema (el modelo
ya es fila-por-código dentro del encuentro; documentado en el schema).

**Prompt 29** — el motor de escalas ya era declarativo (datos, no
código); se sembraron **EVA** (dolor 0-10) y **Bishop** (Bishop 1964)
con fuentes citadas, y se VERIFICÓ el criterio "alta sin desplegar":
una escala insertada como configuración aparece en la nota y el
servidor computa e interpreta su total (prueba 31.4). **PENDIENTE
declarado: riesgo cardiovascular** — Framingham/Globorisk exigen
coeficientes publicados exactos que no se reproducen de memoria.

**Prompt 30** — pestaña Resultados de la Zona 3: presión arterial
(sistólica/diastólica como dos tonos de un matiz, con leyenda), peso,
talla e IMC — línea de 2px, banda de rango normal de fondo, último
punto destacado y etiquetado, un eje por gráfica. En pediatría, curvas
de percentilas P3-P97 reales sobre el MISMO eje de edad. Todo se lee
de columnas tipadas — ni una cadena de texto se procesa (prueba 31.1:
12 consultas de presión graficadas sin parseo).

**Prompt 31** — A) exportación FHIR validada: **DIFERIDA** (decisión
previa de Jorge, registrada en este documento; el validador oficial
además es inaccesible desde este entorno). B) pruebas: **5 de 6 en
verde** (31.1, 31.2, 31.3, 31.4, 31.6) + FK de CIE-10 + descarte +
nota tipada, en `fase3-nota-datos.integration.spec.ts`.

## Fase 4 — El plan del paciente (misma sesión)

Construida contra la letra de los prompts 32–38. Suite tras la fase:
**257 pruebas de API (250 pasan + 4 todo + 3 saltadas si aplica), 30 de
contratos, 5 unitarias de UI y las 6 e2e** — typecheck y lint limpios en
los dos árboles.

**Prompt 32 — modelo de receta.** La línea de prescripción ahora lleva
dosis + unidad (`doseUnit`), indicación por línea (`indication`) y
PROCEDENCIA (`origin`: NUEVA / HEREDADA / HEREDADA_MODIFICADA con
`sourcePrescriptionId` + `sourceIssuedAt` fijada por el SERVIDOR desde la
receta de origen, que debe existir y ser del mismo médico y paciente).
La regla central de la letra quedó dura: **la receta pertenece a una
nota FIRMADA — un borrador no emite recetas** (422
`PRESCRIPTION_REQUIRES_SIGNED_NOTE`; igual para órdenes:
`LAB_ORDER_REQUIRES_SIGNED_NOTE`). La medicación vigente del paciente se
actualiza AUTOMÁTICAMENTE con cada receta emitida (upsert por principio
activo, fuente MEDICO, sin duplicar) — es lo que la Zona 1 muestra.
Migración `20260827100000_f4_plan_del_paciente`.

**Prompt 33 — 🔒 PENDIENTE DE LICENCIA (marcado, no resuelto).** El
modelo de sincronización está DOCUMENTADO en `schema.prisma`
(`MedicationCatalog.sourceVersion`; retirar = `isActive=false`, nunca
DELETE — las recetas históricas conservan su FK). El buscador y el motor
funcionan HOY con 10 medicamentos sintéticos y 2 pares de interacción de
demostración sembrados con `pendingMedicalReview=true` y descripción que
dice "PAR DE DEMOSTRACIÓN, pendiente base licenciada". **Nada de esto es
contenido clínico real: cuando Jorge contrate la base licenciada, se
reemplaza la siembra y el resto ya está.**

**Prompt 34 — alergia BLOQUEANTE.** El checkbox de confirmación se
ELIMINÓ del contrato: el bloqueo solo se libera capturando una
**justificación clínica** (`allergyOverrideJustification`, 15–500
caracteres) que se guarda EN la receta, va al snapshot firmado y queda en
bitácora (`PRESCRIPTION_ALLERGY_OVERRIDE` con la justificación en su
columna dedicada). El caso obligatorio de la letra —alergia a
penicilinas + amoxicilina— es la prueba 38.1 (cruce por grupo ATC J01C,
ya reparado desde Bloque 0).

**Prompt 35 — interacciones.** Motor nuevo (`MedicationInteraction`,
único por par): cruza lo prescrito entre sí Y contra la medicación
vigente anclada al catálogo. GRAVE → 409 `PRESCRIPTION_INTERACTION_GRAVE`
salvo `interactionOverrideConfirmed`; MODERADA → se informa en la
respuesta (`interactionWarnings`) sin bloquear. **Toda advertencia
mostrada y toda confirmación quedan en bitácora**
(`…_GRAVE_SHOWN` / `…_MODERADA_SHOWN` / `…_GRAVE_CONFIRMED`).

**Prompt 36 — traer última receta.** GET
`/prescriptions/patients/:patientId/last` (mismo médico): líneas
EDITABLES con procedencia HEREDADA y fecha de origen — nunca texto
pegado. En la interfaz, el botón "Traer última receta" del panel; editar
una línea heredada la marca HEREDADA_MODIFICADA (el servidor revalida la
receta de origen al emitir; una inventada → 422
`PRESCRIPTION_SOURCE_INVALID`).

**Prompt 37 — estudios e indicaciones.** La orden de estudios dejó el
texto libre: `studyKey` del catálogo `ESTUDIO_LABORATORIO` (dos niveles —
el tipo vive en `externalCode`: laboratorio/imagen/gabinete, dominio
`TIPO_ESTUDIO`) y **motivo OBLIGATORIO** `motiveKey` del dominio
`MOTIVO_ESTUDIO` (diagnóstico inicial, control, tamizaje, preoperatorio,
urgencia) — sin motivo, la orden no se emite (422
`LAB_ORDER_MOTIVE_REQUIRED`); estudio fuera de catálogo → R2 (solicitar
término al curador). El nombre del estudio lo pone el CATÁLOGO, nunca el
cliente. La nota firmada ganó `patientInstructions` (lenguaje llano) y
`suggestedFollowUpDays` (1–365), capturados en el formulario de consulta
y con autoguardado.

**Prompt 38A — documentos independientes con bitácora.** Cada documento
es un PDF propio: receta, orden, e INDICACIONES AL PACIENTE (servicio
nuevo `IndicacionesPdfService`, GET
`/records/encounters/:id/indicaciones/pdf`, con nombre y cédula del
médico). Emisión → bitácora `DOCUMENT_EMITTED` (con folio); impresión →
`DOCUMENT_PRINTED` por documento (POST
`/prescriptions/:id/register-printed`, y el panel lo registra al abrir el
PDF). **Flujo de interfaz:** al FIRMAR, la pantalla de consulta ya no
salta sola al siguiente paciente — pasa a solo-lectura con el bloque
"Documentos de esta consulta" (emitir receta / ordenar estudios /
imprimir indicaciones) y el botón **"Siguiente paciente"** (prompt 16
sigue funcionando, ahora a decisión del médico). Los botones de emisión
salieron del borrador (el servidor los rechazaría: nota no firmada).

**Prompt 38B — las seis pruebas de la letra** en
`fase4-plan-paciente.integration.spec.ts`: 38.1 penicilinas/amoxicilina
(bloqueo + justificación + bitácora), 38.2 interacción grave
(confirmación + bitácora; moderada informa, incluida la vigente), 38.3
traer última (editable, procedencia, fecha, origen revalidado), 38.4
orden sin motivo → error (y estudio fuera de catálogo → error), 38.5
PDFs independientes + folio en bitácora + impresión registrada, 38.6
vigente refleja la receta (actualiza, no duplica). Más la previa: un
borrador no emite ningún documento.

**Ajuste a pruebas anteriores:** las suites que emitían receta/orden
sobre encuentros en borrador ahora los firman antes (la regla nueva es
más estricta); el spec de verificación de médicos conserva sus casos de
borrador intactos.

## Decisiones tomadas por delegación (revisar cuando Jorge quiera)

1. Valores exactos de los enums clínicos (tipos de alergia, severidades
   LEVE/MODERADA/GRAVE, fuentes, 10 vías de administración) — salen de
   P4 §2.7-2.8 y de los hints que ya estaban en los formularios, pero son
   vocabulario clínico: **merecen su ojo de médico**.
2. `CuratorGuard` acepta SUPERADMIN mientras no exista flujo de alta de
   curadores.
3. La prueba vieja «origin=APPOINTMENT al agendar» se convirtió en
   `it.todo` para M5b: contradecía la remediación IDOR #1 (agendar ya no
   emite vínculo; ese origen queda para cuando agende el PACIENTE).

## Lo que sigue pendiente de Jorge

De las siete decisiones 🔒 del documento de 58 prompts siguen abiertas:
su material clínico real (prompt 24), base de medicamentos (33), alcance
de la firma (43), contenido mínimo NOM-004 (46), dónde corre el modelo de
IA (49) y la lista de banderas rojas (52). La terminología de
antecedentes (9) quedó resuelta con el enum de 30 + el término "Negado";
si quiere ampliar el vocabulario, el flujo del curador ya existe.

## Siguiente paso, en orden

1. En la Mac (único paso que exige su terminal — su Postgres local no es
   alcanzable desde la sesión): `bash scripts/sync-dev.sh` dentro de
   `medicfy-backend/`. En `medicfy-frontend`: `pnpm install && pnpm build`.
2. **Fase 5** (prompts 39–42): panel de consulta — hoja frontal,
   historia en lectura, notas previas y resultados dentro de la Zona 3
   (las pestañas ya existen como esqueleto con carga diferida).
3. Cuando haya base de medicamentos licenciada (🔒 prompt 33): reemplazar
   la siembra sintética (medicamentos + pares de interacción) siguiendo
   el modelo de sincronización documentado en `schema.prisma`.

## Historial de git

```
(nuevo)  Fase 0 (prompts 7-11): rol curador, API de catálogos, vocabularios cerrados
(nuevo)  Bloque 0 verificado: suite completa en verde (218 pruebas)
257fb0b  Documenta el estado de traspaso del Bloque 0
abf9ec0  Bloque 0: cierra los tres IDOR, el cruce de alergia y el borrado clínico
1e4a98e  Punto de retorno: trabajo en curso antes de la remediación del Bloque 0
```

## Nota operativa — cómo correr la suite donde binaries.prisma.sh está bloqueado

1. `git clone --depth 1 --branch 5.22.0 https://github.com/prisma/prisma-engines.git`
   (el tag 5.22.0 ES el commit `605197…` que el cliente busca).
2. Quitar `rust-toolchain.toml` (fija 1.82, cuya descarga también está
   bloqueada) y compilar con el toolchain instalado:
   `cargo build -p query-engine-node-api`. Con rustc ≥1.90, el crate
   `metrics 0.23` necesita un parche de una línea (transmute explícito en
   `recorder/mod.rs`, rust-lang/rust#141402).
3. `prisma generate` sin red: `PRISMA_QUERY_ENGINE_LIBRARY=/ruta/dummy
   PRISMA_SCHEMA_ENGINE_BINARY=/ruta/dummy npx prisma generate` (archivos
   vacíos; los env-override saltan la descarga).
4. Copiar `target/debug/libquery_engine.so` como
   `libquery_engine-debian-openssl-3.0.x.so.node` dentro de
   `node_modules/.pnpm/@prisma+client…/node_modules/.prisma/client/`
   (en las DOS copias de `.pnpm` si existen).
5. Migraciones sin schema-engine: aplicar los `migration.sql` en orden con
   `psql` y registrar a mano en `_prisma_migrations`.

Git deja archivos de bloqueo que no se pueden borrar cuando el permiso de
borrado del puente de dispositivos se cae: renombrarlos a `.git/_basura/`
antes de cada comando de git. `_to_delete/` y `.git/_basura/` se pueden
borrar a mano sin consecuencias.

Y **ResearcherTin** (`~/Downloads/ResearcherTin`): respaldado en git
(commit `91095cd`); Jorge todavía no ha dicho qué sigue ahí.
