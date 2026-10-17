# Plan: ajustes de IA, firma, alta de paciente y documentos (receta / orden)

**Fecha:** 2026-10-16
**Reglas de especificación involucradas:** M8-RN-002, M9-RN-009, M9-CA-007, M10-CA-001, M2-CA-009, R2, R6
**Estimación de pasos:** 7

## Pedido (usuario, 2026-10-16)

1. La IA no responde en inglés cuando el sistema está en inglés.
2. Se pide token para cerrar la consulta.
3. La IA no toma todos los criterios (signos vitales, etc.). Lo único que no debe tener es el nombre del paciente.
4. Quitar el +52 al registrar un paciente.
5. No se emiten las recetas.
6. No se generan órdenes de laboratorio.
7. Recetas y órdenes con un formato presentable.

## Análisis de impacto

**1. Idioma de la IA.** `ClaudeModelAdapter` arma el prompt siempre en español y nunca recibe el idioma. El
cliente ya manda `Accept-Language` en cada petición (`acceptLanguageHeader()`), y el API ya lo interpreta
para los errores (`parseAcceptLanguage`). Falta llevarlo del controller → orquestador → adaptador y pedirle al
modelo que escriba el texto libre en ese idioma. Las claves/enums del contrato (`urgencia`,
`probabilidad_relativa`) siguen en español: son contrato, no texto, y el frontend ya las traduce.

**2 / 5 / 6. Token.** Firmar la nota, la receta electrónica, la orden electrónica y la cancelación de nota pasan
por `SignatureVerificationService.verify(password, totpCode)`, que **rechaza si el médico no tiene la
verificación en dos pasos activada**. Con un médico sin MFA (el caso normal) no se puede cerrar la consulta
ni emitir receta/orden electrónica. Además, en el servidor simulado (`dev-server.mjs`) no existen las rutas
de recetas ni órdenes, y los catálogos de estudios responden vacíos, así que el flujo era imposible.

> **Pendiente de decisión:** quitar el TOTP es una desviación de M9-RN-009 / M9-CA-007 y debilita la
> autenticación de la firma. El cambio se intentó y el control de seguridad del agente lo bloqueó; queda
> sin aplicar hasta que el responsable lo confirme. Mientras tanto, la ruta "Imprimir y firmar a mano" de
> receta y orden no pide código, y el panel de firma explica dónde se activa la verificación en dos pasos.

**3. Contexto de la IA.** `ContextAssemblerService` no manda: signos vitales capturados en la consulta (ni
IMC/SC calculados), escalas de especialidad, síntomas de bandera roja marcados, diagnósticos ya capturados
en el encuentro, indicaciones al paciente, recetas/órdenes emitidas en esta consulta, signos vitales de
consultas previas, tabaquismo/alcohol, antecedentes gineco-obstétricos, tipo de sangre, ni antecedentes
**negados**. Se agregan. La seudonimización se mantiene (no viaja nombre, CURP, contacto ni folio).
Además, en el frontend un pase de IA podía leer un borrador viejo si se disparaba antes del autoguardado
(rebote de 2 s): se fuerza el guardado antes de cada pase/resumen.

**4. Teléfono.** El alta de paciente del médico pide escribir `+52…` a mano (E.164 crudo). Se captura a 10
dígitos y el formulario antepone `+52` al enviar (mismo patrón que `registro-paciente`). El almacenamiento
sigue siendo E.164.

**7. Formato.** Los PDF de receta y orden se rediseñan (membrete, bloque de paciente, tabla de
medicamentos/estudios, pie de firma y verificación). El dibujo se extrae a un módulo sin decoradores para
que el servidor simulado use exactamente el mismo diseño.

- Módulos backend afectados: assistant, identity (signature-verification), records, prescriptions, labs.
- Componentes frontend afectados: consulta-form, prescription-panel, lab-order-panel, notas-timeline,
  asistente-tab, resumen-objetivo, pacientes/nuevo, use-encounter-autosave.
- Contratos modificados: sí — `diagnoses` opcional en `clinicalNoteDraftUpdateSchema` (ambos `packages/contracts`).
- Migraciones necesarias: no.
- Riesgo de regresión: bajo — el campo nuevo del borrador es opcional; el PDF conserva el contenido.

## Pasos de implementación

1. [x] Idioma de la IA: `Accept-Language` → orquestador → adaptador → prompt.
2. [x] Contexto completo de la IA (todo menos identidad) y guardado forzado antes de cada pase.
3. [ ] Firma sin TOTP — **bloqueado, pendiente de decisión** (ver arriba). Hecho: pista en el panel de firma.
4. [x] Alta de paciente: teléfono a 10 dígitos sin `+52` visible.
5. [x] Rediseño de PDF de receta y orden (módulo de dibujo compartido).
6. [x] Servidor simulado: rutas de receta, orden, catálogos de estudios y PDF.
7. [x] Boyscout: perímetros perdidos al rehidratar el borrador; texto sin traducir en el panel de orden.

## Criterios de aceptación

- [x] CA-1: con la interfaz en inglés, el prompt del modelo exige responder en inglés (prueba unitaria).
- [ ] CA-2: cerrar la consulta sin código TOTP — pendiente de decisión.
- [x] CA-3: el contexto que recibe la IA incluye signos vitales, escalas, diagnósticos del encuentro, etc., y
  nunca nombre/CURP/teléfono/correo/folio.
- [x] CA-4: el alta de paciente acepta `3312345678`.
- [x] CA-5/6: en el servidor simulado se emite receta y orden y se abre su PDF.
- [x] CA-7: PDF de receta y orden con formato profesional.

## Plan de pruebas

- Unitarias: `claude-model.adapter.spec.ts` (instrucción de idioma), `signature-verification` (sin MFA
  firma con contraseña; contraseña incorrecta rechaza).
- Integración (requieren PostgreSQL): se actualizan los cuerpos de firma para no mandar `totpCode`.
- Manual con el servidor simulado: emitir receta y orden, abrir PDF.

## Resultado final
**Estado:** Completado salvo el paso 3 (pendiente de decisión).
**Commits incluidos:** ninguno todavía (cambios en el árbol de trabajo, sin commitear).
**Pruebas:** 153 unitarias del API, 44 de contratos y 15 del frontend, todas en verde; `tsc --noEmit` limpio
en API y web. Las pruebas de integración (necesitan PostgreSQL) no se corrieron en esta máquina; se
actualizaron `context-assembler.integration.spec.ts` y `assistant-pass.integration.spec.ts`.
Flujo receta → PDF y orden → PDF probado de punta a punta contra `dev-server.mjs`.
**Notas para el equipo:**
- La lectura de la IA cambia a `p51-v2` (idioma de salida y contexto completo).
- La IA ahora recibe municipio/estado de residencia y tipo de sangre; nunca nombre, CURP, calle, teléfono,
  correo ni folio.
- `dev-server.mjs` importa `apps/api/src/common/pdf/clinical-document-layout.ts` con el type-stripping de
  Node (>= 22.18); Node imprime un aviso `MODULE_TYPELESS_PACKAGE_JSON` al arrancar, es inofensivo.
- Pendiente opcional: código QR real en receta/orden (hoy se imprime la ruta `/verificar/<token>`); requiere
  una dependencia nueva.

## Segunda ronda (2026-10-16, mismo día)

Pedido: (1) un solo botón "Iniciar IA" que abra la elección de lectura; (2) el pie de firma tapaba el
final de la lectura del asistente; (3) cerrar la consulta sin contraseña, solo con confirmación;
(4) mensaje "Consulta terminada"; (5) "Ordenar estudio" daba error y la orden debe verse completa,
con membrete y logo; (6) quitar "Nuevo paciente" del menú; (7) los PDF no se guardaban en
"Órdenes y resultados" y deben abrirse en un visor del sistema.

- [x] IA: botón "Iniciar IA" → ventana con los 4 pases; la lectura sigue en el panel derecho.
- [x] Paneles laterales de la consulta descuentan la altura de la barra de firma (`--consulta-footer-height`).
- [x] **Desviación explícita (decisión del usuario):** `clinicalNoteSignSchema` ya no lleva `password`;
  `ClinicalEncounterService.sign/correctNote` ya no reautentican. Confirmación en pantalla
  "¿Desea cerrar la consulta?". Cancelar una nota firmada sigue pidiendo contraseña.
- [x] Aviso "Consulta terminada" al firmar.
- [x] Causa del error de "Ordenar estudio": en el mock, `POST /records/patients/:id/encounters` no
  creaba la consulta (respondía la lista) → `/records/encounters/undefined`. Corregido.
- [x] Receta y orden emitidas se muestran completas en el panel (`DocumentPreview`); el PDF lleva
  membrete del médico (logo, frase, teléfono, correo — `loadDoctorLetterhead`).
- [x] "Nuevo paciente" fuera del rail (sigue en Pacientes).
- [x] Mock: resultados de laboratorio (subir/listar/ver/revisar), logo y firma de Perfil, `PATCH /doctors/me`,
  y persistencia en `.mock-data/` (fuera de git). Expediente: documentos como "mini carpetas"
  (`DocumentTile`) que abren en el visor del sistema (`DocumentViewer`, pdf.js).
- [x] Backend real: `req.on("close")` cancelaba/ no cancelaba mal las llamadas al modelo →
  `clientDisconnectSignal` (cierre de la respuesta). Llamada a Claude compartida con el mock
  (`claude-model-calls.ts`).

**Pendiente:** las pruebas de integración (requieren PostgreSQL) todavía mandan `password`/`totpCode`
al firmar la nota y `totpCode` en receta/orden electrónica; con los esquemas `.strict()` ahora responderían
400. Hay que actualizarlas donde exista base de datos.

## Cuarta ronda (2026-10-17)

- [x] IA: un solo botón "Iniciar IA", sin ventana; el pase lo elige la app según lo escrito (`passForDraft`:
  plan → CIERRE, análisis/diagnósticos → ANALISIS, exploración/signos vitales → OBJETIVO, si no SUBJETIVO).
- [x] IMC automático en signos vitales (misma fórmula que el servidor) + clasificación OMS en adultos.
  PENDIENTE(jorge): validar cortes (¿NOM-008-SSA3-2017 para talla baja?).
- [x] Latencia de la IA, medida con el mismo caso (pase OBJETIVO, claude-sonnet-5): 47.8 s → 24.1 s
  (sin razonamiento extendido, esfuerzo `low`, salida acotada). `ASSISTANT_EFFORT` lo ajusta.
- [x] **Desviación (decisión del usuario):** diagnóstico sin CIE-10 ya no exige justificación escrita
  (`encounterDiagnosisSchema`). Sigue prohibido mandar código y razón juntos.
- [x] "Emitir receta" / "Ordenar estudio" desde el expediente abren el panel ahí mismo. M9-RN-002/M10-RN-001
  se cumplen ligándolos a la consulta abierta sin cita del paciente (`ensureOpenEncounter`), creada en
  segundo plano si no existe.
- [x] Catálogo de estudios ampliado (9 → 82) en `packages/contracts/src/catalogs/lab-studies.ts`, compartido
  por `prisma/seed.ts` y el mock; buscador en el panel. **Desviación (decisión del usuario):** estudio escrito
  por el médico (`customStudyName`), el motivo sigue siendo de catálogo.
- [x] "Órdenes y resultados" en dos apartados separados; cada resultado indica de qué orden viene.
