# PR-EXP-00 · Descubrimiento (solo lectura) — Expediente compartido autorizado por el paciente

**Fecha:** 2026-10-31
**Alcance de esta fase:** ninguna línea de código, esquema o configuración se modificó. Todo lo de abajo es lectura directa del repositorio (`medicfy-backend`, `medicfy-frontend`, `docs/`), citada archivo:línea. Donde algo no existe, se dice explícitamente — no se inventó nada.

> Nota sobre el documento de traspaso viejo (`docs/auditoria/ESTADO-Y-SIGUIENTE-PASO.md`, 27-ago-2026): está desactualizado y en varios puntos **contradice el estado real del código**, verificado en esta fase. Ejemplos concretos: dice "30 pruebas de contratos" y hoy son 56 (backend) + 42 (frontend, paquete duplicado); no menciona la Fase 6 (firma e inmutabilidad) en su tabla de estado, pero en el código la Fase 6 **ya está construida y con triggers de base de datos**, con migraciones tan recientes como el 2026-10-22. No se usó como fuente de verdad para nada de lo que sigue — solo como punto de partida, luego verificado contra el código.

---

## Q1 — Modelo del paciente: ¿global o por médico? ¿Dónde vive el contacto?

**Es un registro GLOBAL, compartido entre médicos — no hay un `Patient` duplicado por consultorio.**

- `model Patient` (`medicfy-backend/prisma/schema.prisma:639-680`): un único registro por `medicfyId String @unique` (línea 642). Campos de contacto **en el propio Patient**, no en una tabla por médico: `phoneE164` (línea 651), `email` (línea 652).
- `createdByUserId` (línea 663) solo registra QUIÉN lo creó originalmente; no limita quién puede tener relación con él después.
- El acceso de cada médico se modela aparte, con `CareRelationship` (ver Q2) — varios médicos distintos pueden tener relación ACTIVA con el **mismo** registro de paciente al mismo tiempo.
- `PatientGuardian` (tutor) también es **global al paciente**, no por médico — confirmado en Q11 con evidencia de esquema y de uso real en `patients.controller.ts`.

**Consecuencia directa para el track (IMPORTANTE, afecta RE6 y D-EXP-04):**
El prompt maestro asume en varios lugares (D-EXP-04, RE6, PR-EXP-02 "Varias coincidencias") un modelo donde el paciente podría tener **un registro distinto por cada médico/custodio**, con **un contacto distinto capturado por cada uno**. Eso no es así: hay **un solo** `phoneE164`/`email` por paciente, period. Entonces:
- D-EXP-04 ("comparación exacta normalizada... busca coincidencia en los registros de pacientes de otros médicos") se simplifica: no hay "registros de otros médicos" que buscar — hay **una sola tabla global** `Patient`. El solicitante compara contra esa única tabla.
- RE6 ("el mensaje se envía al contacto registrado por el médico custodio, NUNCA a un contacto capturado por el solicitante") necesita reinterpretarse: no existe "el contacto registrado por ESTE custodio en particular" — existe **el contacto único del paciente**, que pudo haber sido capturado por cualquier médico en el pasado (o por el propio paciente, si se autorregistró). La regla de fondo (nunca usar el contacto que acaba de escribir el SOLICITANTE) sigue siendo 100% válida y 100% necesaria — solo cambia de dónde sale el contacto correcto: de `Patient.phoneE164`/`Patient.email`, no de "el expediente de este custodio".
- "Varias coincidencias... se crea una solicitud por custodio" (PR-EXP-02) sigue siendo correcto en espíritu (cada médico con `CareRelationship` ACTIVA recibe su propio aviso/solicitud), pero el OTP/mensaje de autorización al PACIENTE es **uno solo**, al contacto único del `Patient` — no "uno por custodio con el contacto que ese custodio tiene capturado", porque ese concepto no existe en el esquema.

**🔒 BLOQUEADOR para decisión antes de PR-EXP-01/02:** confirmar con Jorge que la reinterpretación de RE6/D-EXP-04 arriba es la correcta, porque cambia el diseño del modelo de datos de PR-EXP-01 (ya no hace falta modelar "contacto por custodio", y la búsqueda de coincidencia es contra una sola tabla, no una búsqueda federada).

---

## Q2 — `CareRelationshipGuard`: relaciones existentes y si se puede extender para acceso compartido de solo lectura

**Modelo actual** (`medicfy-backend/prisma/schema.prisma:752-770`, `apps/api/src/modules/scheduling/services/care-relationship.service.ts`, `apps/api/src/common/guards/care-relationship.guard.ts`):

- `CareRelationship`: `patientId`, `doctorId`, `status` (`ACTIVE`/`EXPIRED`/`REVOKED`, líneas 733-739), `origin` (`APPOINTMENT`/`PATIENT_GRANTED`/`CREATED_BY_DOCTOR`, líneas 741-747), `startedAt`, `lastInteractionAt`, `expiresAt`, `revokedAt`, `revokedBy`.
- Caduca a los 18 meses sin interacción (`EXPIRY_MONTHS = 18`, `care-relationship.service.ts:5`), **revisado al momento del acceso** (`hasActiveRelationship()`, líneas 73-89), sin ningún job/scheduler — el mismo patrón que luego se confirmó (Q10) que es el idioma establecido del repo para expiraciones.
- `CareRelationshipGuard` (`care-relationship.guard.ts:36-143`) es el guard que protege **prácticamente todos** los endpoints clínicos (`patientId`/`encounterId`/`prescriptionId`/`labOrderId` en la ruta). Si hay relación activa, el médico tiene acceso **completo y simétrico** — lectura Y escritura — exactamente como el médico tratante. No existe ningún concepto de alcance parcial, ni de "solo lectura", ni de exclusión de secciones.

**Hallazgo crítico — `PATIENT_GRANTED` ya existe como valor de enum, pero NUNCA se conectó a un flujo real.** Confirmado con grep en todo el backend y frontend: el único lugar donde se usa es en fixtures de prueba (`audit-2026-10-21.integration.spec.ts:105`, `m5a.integration.spec.ts:416`, ambos crean la fila directo por Prisma, no por un endpoint) y un comentario de diseño en `appointment-state-machine.service.ts:189` que solo documenta la intención ("el paciente autoriza"). **No existe ningún endpoint, servicio ni UI que cree hoy un `CareRelationship` con `origin: PATIENT_GRANTED`.** Es un valor reservado para una función futura — exactamente esta — que nunca se construyó.

**¿Se puede extender `CareRelationship`/`CareRelationshipGuard` tal cual para esta función? NO, y es importante decirlo explícitamente (caso (c) de la Fase 0: evitar una contradicción con RE3/RE4 antes de que alguien la escriba en código):**
- RE4 exige acceso de **SOLO LECTURA**. `CareRelationshipGuard` no distingue lectura de escritura — da acceso completo a los mismos endpoints que usa el médico tratante (emitir receta, firmar nota, etc.).
- RE3 exige **mínimo necesario** (por defecto solo Resumen; notas/resultados/recetas opcionales). `CareRelationship` es binario: existe o no existe: no tiene concepto de "alcance" (`scope`).
- PR-EXP-05 exige explícitamente que el médico receptor NO pueda prescribir ni escribir notas. Si se reutilizara `CareRelationship` con `origin: PATIENT_GRANTED` tal cual, el médico receptor pasaría a tener paridad total con el médico tratante — viola RE3, RE4 y la restricción explícita de PR-EXP-05.
- **Recomendación para PR-EXP-01 (no se implementa aquí, solo se deja escrito):** NO tocar `CareRelationship` ni el valor `PATIENT_GRANTED` (dejarlo como está, sin usarlo, para no generar confusión con la función nueva). Construir el modelo nuevo que el prompt maestro ya propone (`RecordShareGrant` + guard propio `SharedRecordGuard`), pero **copiando el patrón arquitectónico que ya probó funcionar** en `CareRelationship`: enum de estado (`ACTIVE`/`EXPIRED`/`REVOKED`), `expiresAt` revisado perezosamente en el momento del acceso (sin scheduler), método `revoke()` explícito. Ese patrón ya está probado en producción (tests, uso real) — es el "cómo" correcto; lo que cambia es el "qué" (alcance, solo lectura, modelo nuevo).

---

## Q3 — Módulo de consentimientos (M1): ¿reutilizable para "autorizo compartir mi expediente"?

**No tal cual — el patrón sí, el modelo no.**

- `Consent` (`schema.prisma:210-226`): `id, userId, consentType, documentVersion, granted, ipAddress, userAgent, evidenceHash, createdAt`. Append-only reforzado por `GRANT` de Postgres (comentario explícito en `schema.prisma:205-209`).
- `evidenceHash` (`consent.service.ts:23-29`) es SHA-256 del EVENTO (`userId|consentType|documentVersion|granted|ipAddress|occurredAt`), no del contenido del documento legal.
- `ConsentType` es un enum **cerrado** (`schema.prisma:43-51`): `PRIVACY_NOTICE, SENSITIVE_DATA, TELEMEDICINE, DIGITAL_PRESCRIPTION_CHANNEL, MARKETING`. No hay ningún tipo parametrizable por destinatario/alcance, y no hay campo `doctorId`/`scope`/`recipientContact` en el modelo.
- `userId` es obligatorio (línea 212, FK a `User`) y el controlador exige `JwtAuthGuard` (`consents.controller.ts:30`) — **100% del módulo (modelo, servicio, controller, tests) asume una cuenta ya autenticada.** No hay ningún camino de consentimiento sin cuenta hoy.

**Conclusión de reutilización:** se reutiliza el patrón (append-only + hash de evidencia + ip/user-agent + `GRANT` de Postgres) — es sólido y debe copiarse tal cual para `RecordShareConsent`. El modelo en sí (`Consent`) no sirve para este caso porque está atado estructuralmente a un `userId` con cuenta y a un enum cerrado de 5 valores sin alcance. `RecordShareConsent` debe ser un modelo nuevo, como ya propone el prompt maestro.

---

## Q4 — Infraestructura de envío (correo/SMS/WhatsApp)

**Existe infraestructura, pero solo con adaptadores de desarrollo — ningún proveedor real conectado.**

- Dos puertos independientes y deliberadamente separados (comentario en `notification-channel-adapter.port.ts:1-11` explica por qué no se unificaron): `NOTIFICATION_PORT` (M1, método por propósito: `sendEmailVerificationCode`, `sendPasswordResetLink`, `sendAssistantInvitation`, etc. — `identity/services/notification.port.ts:6-21`) y `NotificationChannelAdapter` (M12, genérico por canal: `sendEmail`/`sendWhatsApp` — `notifications/services/notification-channel-adapter.port.ts:12-20`).
- Ambos solo tienen adaptador de consola (`ConsoleNotificationAdapter`, `ConsoleEmailChannelAdapter`) que **truena a propósito si `NODE_ENV=production`** — así que el arranque de producción con solo el adaptador de desarrollo YA falla hoy, para los dos puertos existentes (criterio equivalente al que pide D-EXP-13/PR-EXP-03 ya está probado en el repo, solo falta aplicarlo al puerto nuevo).
- Ningún SDK de proveedor real (SendGrid/Twilio/etc.) está en `package.json` — proveedor real sigue 🔒 D-EXP-13, confirmado.
- **Precedente MÁS relevante para "mensaje a alguien SIN cuenta, con enlace de un solo uso, sin datos clínicos":** `AssistantInvitationService` (`identity/services/assistant-invitation.service.ts`) — invita por **email de texto libre** (no requiere `userId` previo), token aleatorio de 24 bytes, solo se guarda el **hash** SHA-256 en BD, máx. 3 invitaciones pendientes, expira en 72h. Es casi exactamente el patrón que necesita el enlace de autorización al paciente.
- `NotificationLinkService` (M12) tiene el patrón de token correcto (32 bytes, hash SHA-256, TTL 15 min, un solo uso) pero exige `userId` — tendría que generalizarse o duplicarse para un contacto sin cuenta.

**Conclusión:** construir el puerto de notificación nuevo (`NotificationPort` del track) siguiendo el patrón ya probado de `AssistantInvitationService` (destinatario por texto libre, token hasheado, TTL, límite de pendientes) en vez de inventar uno. El guard de "producción falla sin proveedor real" ya tiene precedente directo que copiar línea por línea.

---

## Q5 — OTP/MFA: ¿se puede reutilizar para alguien sin cuenta?

**No tal cual — el MFA de hoy es TOTP (no es lo que se necesita), y el OTP enviado sí existe pero está atado a `User`.**

- El "MFA" del sistema es **TOTP** (RFC 6238, `totp.service.ts`), secreto guardado cifrado en el propio `User` — es otra cosa, no un código enviado por SMS/correo.
- El mecanismo real de "código enviado" es `VerificationCodeService` (`identity/services/verification-code.service.ts`): 6 dígitos, **hash SHA-256** (nunca texto plano), TTL 10 min, máx. 5 intentos (tras agotarlos el código muere, sin bloqueo de cuenta/IP más amplio), un código nuevo invalida el anterior. **Estructuralmente atado a `userId` no-nulo** (`VerificationCode.userId`, FK obligatoria a `User`) — no hay forma de emitir/validar uno de estos códigos sin que exista primero una fila `User`.
- No hay comparación en tiempo constante (comparación de strings normal sobre los hashes) — riesgo teórico bajo, no crítico.
- **Páginas públicas sin sesión que ya existen** (precedente de UX/arquitectura, no de lógica de OTP): `/verificar/[token]` (solo resuelve un token por URL, sin pedir código — `prescriptions/verification.controller.ts`, sin guard, documentado como público a propósito), `/olvide-contrasena` + `/restablecer-contrasena` (token de un solo uso + **respuesta idéntica exista o no la cuenta**, el patrón anti-enumeración exacto que pide RE5), `dr/[slug]` (perfil público de médico). **No existe ningún lugar del código que combine "token por URL + además pide un código OTP para confirmar identidad"** — las dos piezas existen por separado, nunca juntas.
- **Corrección a una premisa del encargo original:** `public-booking.controller.ts` (el que suena "público" en su nombre) en realidad **sí exige `JwtAuthGuard`** (línea 25) — no es un ejemplo de endpoint anónimo, pese al nombre.

**Conclusión:** se reutiliza el patrón de `VerificationCodeService` (hash SHA-256 + TTL + contador de intentos) y el patrón anti-enumeración de `forgotPassword`/`resetPassword`, pero el modelo (`RecordShareChallenge` del track) tiene que ser nuevo — no puede colgarse de `VerificationCode` porque esa tabla exige `userId`. El flujo completo "token por enlace + OTP de confirmación" es nuevo, no existe combinado en ningún lugar hoy.

---

## Q6 — Estado real de la firma (Fase 6): ¿inmutable en base de datos o solo en código?

**Es INMUTABLE a nivel de MOTOR DE BASE DE DATOS, no solo de aplicación — y esto es una garantía que la función nueva puede dar por hecha, no algo que tenga que reconstruir.**

- `EncounterStatus`: `DRAFT`/`SIGNED` (`schema.prisma:1056-1061`). `ClinicalNote` se inserta **una sola vez**, al firmar — su existencia como fila ES el estado "firmada" (no tiene columna de estado propia).
- Desde el origen (migración M8/M9/M10, `20260823224811.../migration.sql:505-526`): `REVOKE UPDATE, DELETE, TRUNCATE` sobre `clinical_notes`, `prescriptions`, `prescription_items`, `lab_orders`, etc., para el rol `medicfy_app` (el mismo que usa la API en producción).
- **El 2026-10-22** se encontró y cerró un vector de bypass real: las FK con `ON UPDATE CASCADE` de Prisma corren con privilegios del DUEÑO del esquema, así que un `UPDATE ... SET id = ...` (permitido en tablas que sí admiten UPDATE) podía reescribir por cascada contenido de tablas "protegidas". Fix en tres capas (`20261022100000_immutability_in_depth/migration.sql`): (a) trigger que prohíbe cambiar cualquier PK, (b) trigger `medicfy_forbid_mutation` en ~20 tablas append-only que bloquea UPDATE/DELETE/TRUNCATE **incluso para el dueño del esquema** (el `REVOKE` por sí solo no cubre al owner), (c) trigger `medicfy_seal_signed_encounter` que sella `contentHashSha256` en cuanto `status='SIGNED'`.
- **Prueba real que lo confirma a nivel SQL, no solo HTTP:** `append-only.integration.spec.ts` se conecta como `medicfy_app` Y como dueño del esquema, y en ambos casos un `UPDATE`/`DELETE` directo contra `clinical_notes`/`prescriptions`/`lab_orders` falla con "permission denied" (líneas 112-122, 150-160, 182-192, 288-293). Y específicamente para el caso de reescribir el hash de un encuentro ya firmado (línea 314-322, caso "A-07"): el trigger lo bloquea con mensaje `/firmado/i`.
- Cadena de hash real (no solo un flag): `content-hash.util.ts` — SHA-256 sobre JSON canonicalizado, encadenado (`previousHashSha256`) al encuentro firmado anterior del mismo paciente.
- **"Alcance de la firma" (prompt 43, pendiente en el doc viejo):** sigue abierto, y se confirma en el propio esquema — `enum SignatureMethod { INTERNAL_SYSTEM, ADVANCED_EFIRMA }` (`schema.prisma:1063-1071`): solo `INTERNAL_SYSTEM` (reautenticación simple) está implementado; `ADVANCED_EFIRMA` (firma con certificado) es un valor de enum sin ninguna implementación detrás — la decisión legal de Jorge sigue abierta. **No bloquea esta función**, porque PR-EXP-04/05 solo necesitan leer notas YA firmadas con el mecanismo que exista, cualquiera que sea.

**Conclusión:** la función de expediente compartido puede asumir "nota firmada = inmutable, garantizado por Postgres" como un hecho dado, sin tener que validarlo ni reforzarlo — ya está más que cubierto, con pruebas que lo demuestran incluso contra el dueño del esquema.

---

## Q7 — Endpoints de la Zona 1: origen de los datos y filtro por firmado

**Hay un servicio inyectable reutilizable, con un precedente DIRECTO de reutilización exitosa desde otro módulo — exactamente el patrón a copiar.**

`PatientClinicalService` (`records/services/patient-clinical.service.ts`), exportado del módulo (`records.module.ts:71`), **ya es inyectado desde `apps/api/src/modules/assistant/services/context-assembler.service.ts`** sin pasar por HTTP — comentario explícito en `records.module.ts:67-70`: "Fase 8 · Prompt 50 (`context-assembler.service.ts`) reutiliza `listAllergies`/`listMedications`/`activeDiagnoses`/`listHistoryItems`/`getActivePregnancy`/`notesTimeline` en vez de duplicar sus consultas." Esto es literalmente el mismo problema que `SharedSummaryService` (PR-EXP-04) necesita resolver — ya hay un ejemplo construido y probado de cómo hacerlo.

También existe un endpoint agregador ya hecho: `GET .../hoja-frontal` (`patient-clinical.controller.ts:298-303`, comentario "Zona 1 de DOC-06"), que compone exactamente lo que la Zona 1 necesita.

**Filtro por firmado, sección por sección (CRÍTICO para RE2):**
| Sección | ¿Filtra por `SIGNED`? | Evidencia |
|---|---|---|
| Diagnósticos activos | **SÍ, explícito** | `where: { encounter: { patientId, status: "SIGNED" } }` (`service.ts:585-586`) |
| Signos vitales | Protegido por construcción (no por query) | Solo se insertan DENTRO de la transacción de firma (`clinical-encounter.service.ts:430-496`); nunca hay fila de un borrador |
| Alergias / Medicación / Antecedentes | No filtran por firmado — **y está bien así** | Son datos del PACIENTE, no derivados de notas (comentario `service.ts:23-26`: "a diferencia de clinical_notes, esto no es lo que NOM-004 exige inmutable") |
| Embarazo activo | Entidad independiente, no ligada a notas | `PatientPregnancy.status: "ACTIVE"` |
| **Resultados de laboratorio** | **NO filtra — riesgo real** | `LabResultAnalyte.listForPatient` (`labs/services/lab-result-analyte.service.ts:52-57`) solo filtra por `patientId`; el modelo tiene `reviewedByDoctorId`/`reviewedAt` que puede ser `null` — **puede haber analitos sin revisión médica en este listado hoy** |

**🔒 BLOQUEADOR / nota para PR-EXP-04:** si el alcance `RESULTS` se habilita, hay que decidir y agregar un filtro nuevo (candidato: `reviewedAt: { not: null }`) antes de exponer resultados en el expediente compartido — hoy ese filtro no existe en ningún lugar del código.

Gating por sexo sí existe (gineco-obstétrico oculto para sexo M sin habilitación manual, embarazo rechaza sexo≠F) — gating por **especialidad del médico** receptor **no existe en ningún punto** de esta cadena (ni en `CareRelationshipGuard` ni en `PatientClinicalService`) — sería 100% nuevo si llegara a necesitarse (el prompt maestro no lo pide para esta función, solo lo menciono como ausencia confirmada).

---

## Q8 — Estructura de `audit_log`

**Campos de `AuditLog`** (`schema.prisma:987-1021`): `id, actorUserId?, actorRole?, action (String, texto libre — NO enum), resourceType, resourceId?, patientId?, ipAddress?, userAgent?, requestId?, justification?, result (enum SUCCESS|DENIED), metadata (Json?), occurredAt, sequence (BigInt, único), hashSha256, previousHashSha256`. Tiene su **propia cadena de hash** (separada de la de las notas firmadas), con lock `SELECT ... FOR UPDATE` sobre `AuditLogChainState` para encadenar sin bifurcación bajo escritura concurrente (`audit.service.ts:81-136`).

**Método principal:** `AuditService.log(entry: AuditEntry): Promise<void>` (`identity/services/audit.service.ts:60`), donde `AuditEntry` acepta exactamente los campos de arriba (más completado automático de `ipAddress`/`userAgent`/`requestId` desde el contexto de la request si no se pasan explícitos).

**`action` es texto libre, sin catálogo cerrado** — confirmado por grep y por convenciones inconsistentes convivientes en el código real (`"auth.login"`, `"clinical.access"` vs. `"DOCUMENT_EMITTED"`, `"PRESCRIPTION_ALLERGY_OVERRIDE"`). Para esta función: los nombres de evento que propone PR-EXP-01 §6 (`SHARE_REQUESTED`, `SHARE_APPROVED`, etc.) son perfectamente usables tal cual, sin necesidad de registrar un enum nuevo en ningún lado — solo hay que ser consistente con el patrón MAYÚSCULAS_CON_GUION_BAJO que ya usan los eventos más recientes.

**Se escribe ANTES de responder**, confirmado literalmente en `CareRelationshipGuard` (líneas 51-61, 67-78, 87-99): `await auditService.log(...)` seguido de `throw new ApiException(...)`.

**Sanitización de `metadata`: es disciplina de código revisada caso por caso, NO un sanitizador automático.** No existe ninguna función `sanitizeMetadata`/`redact`/`scrub` para `audit_log`. Lo que existe es un comentario explícito (`audit.service.ts:39-42`, cita R2) y evidencia empírica (>25 sitios revisados) de que en la práctica solo se pasan IDs/razones codificadas/contadores, nunca texto clínico literal. **Para esta función: cada evento nuevo que se agregue debe seguir la misma disciplina manual — no hay ninguna barrera automática que lo fuerce por el desarrollador.** Esto es relevante directamente para RE9 del track.

---

## Q9 — Verificación de cédula (M2) y suscripción

- `DoctorVerificationStatus`: `DRAFT, SUBMITTED, IN_REVIEW, VERIFIED, VERIFIED_SPECIALTY_UNCONFIRMED, REJECTED, SUSPENDED` (`schema.prisma:56-69`).
- `DoctorVerifiedGuard` (`identity/guards/doctor-verified.guard.ts`) ya existe, exige exactamente `verificationStatus === "VERIFIED"` (vía `AuthService.assertDoctorVerified`, `auth.service.ts:608-617`), con 403 `DOCTOR_NOT_VERIFIED` — hoy aplicado solo en endpoints que EMITEN (recetas, órdenes, firmar nota), probado con HTTP real en `doctor-verification-enforcement.integration.spec.ts`. **Este guard sirve tal cual, sin cambios, para el endpoint de "solicitar expediente"** — es exactamente D-EXP-03.
- **No existe ningún guard ni check de suscripción activa en todo el repo.** `BillingModule` está literalmente vacío (`@Module({})`), `Doctor.subscriptionPlan`/`subscriptionStatus` son columnas placeholder siempre `null` (comentario explícito en el código: "M6 (facturación) todavía no existe"). D-EXP-03 ("no necesita suscripción activa para recibir") queda automáticamente satisfecho — no hay riesgo de que un guard de suscripción inexistente bloquee nada, porque no existe.

---

## Q10 — Rate limiting y trabajos programados

- **Rate limiting SÍ existe, genérico y global:** `ThrottlerModule`/`ThrottlerGuard` registrado como `APP_GUARD` (`app.module.ts:25-41,59`), tracker por IP + usuario con JWT **verificado** (no solo decodificado), con `skipIf` en `NODE_ENV=test`. Decoradores ya hechos a medida en `common/rate-limit.ts`: `AuthThrottle()` (10/min), `SearchThrottle()` (30/min), `DownloadThrottle()` (20/min) — mismo patrón a copiar para un límite de solicitudes de expediente compartido.
- Patrón complementario (límite de negocio persistente, no de ventana HTTP): `AssistantInvitationService.invite()` cuenta filas `PENDING` no vencidas por médico y rechaza con 409 al llegar al máximo — útil si "20 solicitudes por día" debe sobrevivir reinicios/múltiples instancias, cosa que un Throttler en memoria por request no garantiza.
- **NO existe ningún scheduler/cron genérico.** `@nestjs/schedule` no está instalado. BullMQ SÍ está instalado pero usado en un solo lugar (`AppointmentReminderSchedulerService`), y **solo se activa si `process.env.REDIS_URL` existe** — si no, es no-op documentado. Un verificador de integridad de `audit_log` (`AuditChainVerifierService`) tiene la lógica lista pero su ejecución programada está EXPLÍCITAMENTE sin resolver (comentario `PENDIENTE(jorge)` literal en el código) — confirma que ni siquiera para una necesidad ya especificada hay scheduler.
- **El patrón real y ya probado para "expirar algo sin job":** exactamente lo que ya hace `CareRelationshipService.hasActiveRelationship()` — revisar `expiresAt` en el momento del acceso y recién ahí marcar el estado, "en vez de esperar a un job que no existe" (cita literal del comentario del código). Además hay dos `setInterval` manuales de 5 min (sin librería, sin Redis) para los "sweeps" de citas y encuentros, que sí corren proactivamente.

**Conclusión para PR-EXP-06:** para expirar solicitudes/grants, el patrón más barato y consistente con el repo es el perezoso de `CareRelationship` (cero dependencias nuevas). Si se necesita notificación proactiva de "por vencer en 48h", el patrón de `setInterval` de los sweeps es el candidato siguiente, también sin dependencias nuevas.

---

## Q11 — Datos de tutor/representante de menores

- `PatientGuardian` (`schema.prisma:709-731`): `id, patientId, guardianName, guardianRelation (enum), guardianCurp?, guardianPhoneE164, guardianEmail, guardianIdDocumentKey (INE cifrado, solo referencia), consentGrantedAt, isPrimary, revokedAt, revokedReason, createdAt`. **Sin `doctorId` ni ninguna FK a `Doctor`/`CareRelationship`.**
- `patient-guardian.service.ts`: `create()` solo CAPTURA el dato del formulario (sin OTP, sin verificación real del contacto). `listActiveForPatient()` revoca automáticamente, al momento de leer (mismo patrón perezoso, sin cron), a los tutores de un paciente que ya cumplió 18 años.
- Condición exacta de "menor": `age < 18` calculada en el esquema Zod (`packages/contracts/.../patient.schema.ts`, `superRefine`), evaluada **solo al crear el `Patient`** — no se re-evalúa en cada encuentro clínico después.
- **CONFIRMADO: el tutor es GLOBAL al paciente, no al médico que lo registró** — `PatientGuardian.patientId` apunta al `Patient` único; `patients.controller.ts` llama `listActiveForPatient(patient)` sin filtrar por el médico que hace la petición. Un tutor registrado por CUALQUIER médico sirve para cualquier otro médico que consulte después a ese paciente.
- **🔒 BLOQUEADOR / vacío real para D-EXP-10:** D-EXP-10 exige "tutor registrado **con contacto verificado**" — ese campo de verificación **no existe en absoluto**. `PatientGuardian` no tiene ningún `guardianPhoneVerified`/`guardianEmailVerified`; el contacto se captura y nunca se valida. Habría que construirlo desde cero (posible reutilización del patrón de `VerificationCode`, pero apuntando a `PatientGuardian` en vez de a `User` — mismo tipo de extensión que ya hace falta para el OTP del paciente, Q5).

---

## Q12 — Catálogo CIE-10 y clase terapéutica de medicamentos

- `Icd10Code` (`schema.prisma:1832-1840`): solo `code` (PK), `description`, `isActive`. **Sin campo de capítulo/categoría.** Único endpoint existente es búsqueda de texto (`contains` sobre código o descripción, `icd10.controller.ts:26-43`) — **no hay query por rango** hoy. El formato de los códigos (con relleno de ceros, p. ej. `"F00.0"`) hace viable agregar un filtro `startsWith`/rango sin migración — pero hay que construirlo, no existe.
- `MedicationCatalog.atcCode` (`schema.prisma:1871`) **SÍ existe**, nullable, y está poblado en **los 63 medicamentos sembrados** hoy (el comentario del esquema dice "10 filas", desactualizado — son 63, confirmado por conteo real en `seed.ts`). Es una buena noticia parcial para D-EXP-08: hay un campo real sobre el que filtrar por prefijo ATC, aunque sobre datos sintéticos (🔒 Prompt 33, base licenciada pendiente, sin cambios respecto a lo ya documentado).
- `MedicationCatalog` **no tiene** `pendingMedicalReview` — pero el patrón SÍ existe, ya construido y en uso, en otros tres catálogos (`ClinicalCatalogTerm`, `MedicationInteraction`, `LabReferenceRange`): boolean `default(true)` en filas sembradas/sintéticas + método de aprobación que lo pasa a `false` con `curatedBy`. Reutilizable como patrón; habría que decidir si se agrega a `MedicationCatalog` o si el filtro de "clase de medicamento sensible" vive como lista separada de prefijos ATC a excluir.
- **La pieza que de verdad falta, y que NINGÚN catálogo resuelve, es la médica:** qué prefijos CIE-10/ATC concretos cuentan como "salud mental"/"VIH-ITS"/"sustancias"/etc. Eso es 100% una decisión clínica (CLAUDE.md §7: "no inventes una regla clínica... si no está en la especificación, pregunta") — el mecanismo de filtrado puede construirse, pero la lista de valores debe venir de Jorge o quedar marcada ⚠️ para revisión médica, tal como el propio PR-EXP-04 ya anticipa.

---

## Q13 — Páginas públicas sin sesión y `noindex`

- No hay `middleware.ts` en todo `apps/web` — el control de acceso es por grupo de rutas (`(app)` = requiere sesión), no por middleware de Next.
- Dos páginas verdaderamente públicas hoy, documentadas en el propio código como las únicas: `dr/[slug]` (perfil público de médico, con `generateMetadata` usando `title`/`description`/`openGraph`) y `verificar/[token]` (verificación pública de receta, componente cliente, sin autenticación, sin contenido clínico).
- **`noindex`/meta robots NO EXISTE en absoluto en el frontend** — cero ocurrencias de "robots" en todo `apps/web/src`, sin `robots.ts`/`sitemap.ts` de convención de Next.js, y la única página con metadata real (`dr/[slug]`) no usa la clave `robots` del tipo `Metadata`. **No hay ningún precedente que copiar para esta pieza específica** — habría que introducirla por primera vez (mecánicamente simple: `export const metadata: Metadata = { robots: { index: false, follow: false } }` o vía `generateMetadata`, siguiendo la misma mecánica que ya usa `dr/[slug]` para otras claves de metadata).

---

## Q14 — Pruebas: comandos y conteo actual

Ejecutado en esta fase, en esta máquina (sin Postgres ni Docker disponibles — confirmado: `psql`/`pg_ctl`/`docker` no están en `PATH`, puerto 5432 cerrado):

| Suite | Comando | Resultado |
|---|---|---|
| Backend API (`medicfy-backend`) | `pnpm test` (turbo→vitest) | **67 archivos (24 ✓ / 43 ✗), 558 pruebas (187 ✓ / 12 ✗ / 359 skip).** Las 43 fallas de archivo son 100% `PrismaClientInitializationError: Can't reach database server at 127.0.0.1:5432` — no hay ninguna falla de lógica, es exclusivamente la ausencia de Postgres en este entorno. |
| Backend `packages/contracts` | `vitest run` | **10/10 archivos, 56/56 pruebas ✓** |
| Frontend `packages/contracts` (paquete duplicado, deuda técnica #10 ya conocida) | `vitest run` | **9/9 archivos, 42/42 pruebas ✓** |
| Frontend `apps/web` | `vitest run` | **14/14 archivos, 62/62 pruebas ✓** |
| Backend typecheck (`apps/api`) | `tsc --noEmit` | **Limpio, sin errores** |
| E2E (Playwright, ambos repos) | `npx playwright test` | **No se corrió** — `e2e/global-setup.ts` exige Postgres real accesible por `psql` y la API/web levantados; no disponible en este entorno (mismo límite ya documentado en el track de teleconsulta de esta misma sesión). |

**Caso (d) de la Fase 0 ("la suite actual no está en verde"): se activa literalmente, pero por un motivo de ENTORNO, no de código** — no hay Postgres/Docker alcanzable desde esta sesión. Se reporta como bloqueador abajo, pero no hay evidencia de ninguna regresión real: todo lo que no depende de una base de datos viva (contratos, frontend, typecheck) está en verde.

---

## Mapa de reutilización (resumen ejecutivo)

| Pieza | Se reutiliza TAL CUAL | Se EXTIENDE | Es NUEVO |
|---|---|---|---|
| Guard de "solicitar" (médico verificado) | `DoctorVerifiedGuard` | — | — |
| Patrón de expiración sin scheduler | `CareRelationshipService` (perezoso, sin job) | — | modelo nuevo (`RecordShareGrant`) con el mismo patrón |
| Rate limit de solicitudes/día | `ThrottlerGuard`+decoradores de `rate-limit.ts` | posible combinación con conteo-en-BD de `AssistantInvitationService` si debe persistir entre instancias | — |
| Resumen clínico (Zona 1) | `PatientClinicalService` inyectado (mismo patrón que `ContextAssemblerService`) | filtro nuevo para `LabResultAnalyte` (sin revisión hoy) | `SharedSummaryService` que lo compone |
| Notificación a alguien sin cuenta | patrón de `AssistantInvitationService` (email libre + token hasheado + TTL + límite de pendientes) | `NotificationLinkService` (generalizar para contacto sin `userId`) | puerto `NotificationPort` del track + adaptador(es) |
| Consentimiento del paciente | patrón append-only + hash de evidencia + GRANT de Postgres de `Consent` | — | modelo `RecordShareConsent` (el actual no admite alcance/destinatario) |
| OTP al contacto del paciente | patrón hash+TTL+intentos de `VerificationCodeService` | — | modelo `RecordShareChallenge` (el actual exige `userId`) |
| Inmutabilidad de lo compartido | Garantía YA existente (triggers+GRANT de Fase 6) | — | — (no hay nada que construir, solo consumir notas ya firmadas) |
| Verificación de contacto del tutor | — | patrón de `VerificationCode` aplicado a `PatientGuardian` | el campo/flujo de verificación en sí (no existe hoy) |
| Filtro CIE-10 por rango | formato de código permite `startsWith`/rango sin migración | — | la query en sí (no existe) |
| Filtro ATC sensible | campo `atcCode` ya poblado | patrón `pendingMedicalReview` de otros 3 catálogos | la lista de prefijos sensibles (decisión médica, no de código) |
| `noindex` en página pública | mecánica de `generateMetadata` ya usada en `dr/[slug]` | — | la clave `robots` en sí (nunca se usó) |

---

## Plan de adaptación de PR-EXP-01 a PR-EXP-07 al código real

- **PR-EXP-01 (modelo de datos):** construir los 4 modelos nuevos tal como los propone el track, SIN tocar `CareRelationship` (dejar `PATIENT_GRANTED` sin usar, para no generar dos significados del mismo valor). Replicar en los nuevos modelos el patrón de expiración perezosa de `CareRelationshipService` y el patrón append-only con `GRANT`/trigger que ya usan `clinical_notes`/`Consent`.
- **PR-EXP-02 (solicitud):** usar `DoctorVerifiedGuard` tal cual para la verificación de cédula del solicitante. La búsqueda de coincidencia es contra la ÚNICA tabla `Patient` (no una búsqueda "entre médicos" — ver Q1). El límite de 20/día puede empezar como decorador de `Throttler` (`rate-limit.ts`) y, si debe sobrevivir reinicios, sumar el patrón de conteo-en-BD de `AssistantInvitationService`.
- **PR-EXP-03 (autorización del paciente):** el mensaje va al contacto ÚNICO de `Patient` (no "del custodio" — ver Q1, pendiente de confirmación de Jorge). El OTP y el token del enlace necesitan modelos nuevos (no `VerificationCode`/`NotificationAccessToken`, ambos atados a `User`), copiando sus patrones de hash+TTL. La página pública necesita introducir `noindex` por primera vez (sin precedente que copiar) pero sí tiene dos precedentes de "página sin sesión" que seguir en estructura.
- **PR-EXP-04 (resumen compartible):** inyectar `PatientClinicalService` igual que ya hace `ContextAssemblerService` — no duplicar sus queries. Agregar el filtro de revisión pendiente en `LabResultAnalyte` antes de exponer `RESULTS`. El filtro CIE-10 por rango y el de ATC sensible son construcción nueva; la LISTA de qué es sensible sigue siendo ⚠️ revisión médica, tal como el propio track ya anticipa.
- **PR-EXP-05 (visor):** nuevo guard `SharedRecordGuard`, independiente de `CareRelationshipGuard` (no componerlo ni extenderlo, por las razones de Q2) — valida existencia/pertenencia/estado ACTIVE/expiración/alcance en cada request.
- **PR-EXP-06 (notificaciones/revocación/caducidad):** usar el patrón perezoso de `CareRelationship` para expirar; si se necesita el aviso "por vencer en 48h" de forma proactiva, replicar el `setInterval` de 5 min de los sweeps de citas/encuentros (sin dependencias nuevas). El "Reportar uso indebido" reutiliza la cola de administración existente, como ya pide el track.
- **PR-EXP-07 (batería y cierre):** todas las pruebas de la batería son ejecutables tal cual en un entorno con Postgres real; en ESTE entorno, la suite de integración no corre por ausencia de base de datos (ver Q14) — no es un bloqueador del diseño, sí lo es de la ejecución aquí.

---

## Lista de BLOQUEADORES (para decisión antes de PR-EXP-01)

1. **🔒 Q1/RE6/D-EXP-04 — el modelo de contacto es global al paciente, no por custodio.** Necesita confirmación explícita de Jorge sobre la reinterpretación propuesta (el mensaje/OTP va al único `Patient.phoneE164`/`email`, no a "el contacto que capturó este médico en particular") antes de diseñar `RecordShareRequest`/`RecordShareConsent` en PR-EXP-01.
2. **🔒 Q11/D-EXP-10 — "tutor con contacto verificado" no existe hoy.** `PatientGuardian` captura contacto pero nunca lo verifica. Si D-EXP-10 se mantiene como está escrito, hace falta construir ese flujo de verificación desde cero (no es solo "leer un campo que ya existe").
3. **🔒 Q7/PR-EXP-04 — `LabResultAnalyte` no filtra por revisión médica.** Si el alcance `RESULTS` se habilita, falta decidir y construir el filtro (candidato `reviewedAt: { not: null }`) antes de poder exponerlo sin riesgo de filtrar un resultado sin revisar.
4. **🔒 Q12/D-EXP-08 — la lista de qué CIE-10/ATC cuenta como "sensible" sigue siendo decisión médica**, no resoluble en código (ya anticipado por el propio track, confirmado aquí que ningún catálogo trae esa clasificación lista).
5. **(d) Q14 — la suite de integración del backend no corre en verde EN ESTE ENTORNO**, por ausencia de Postgres/Docker alcanzable, no por una regresión de código (contratos, frontend y typecheck sí están en verde). Si PR-EXP-01 en adelante requiere migraciones aplicadas y pruebas de integración corriendo, hace falta un entorno con Postgres real — no se puede validar aquí.

Ningún otro caso de PARADA OBLIGATORIA ((a) modelo de paciente imposible de respetar por custodia, (b) notas firmadas modificables en BD) se presentó: (a) el modelo global de `Patient` + `CareRelationship` por médico SÍ permite modelar la custodia (múltiples médicos con relación activa al mismo paciente), solo exige la reinterpretación del punto 1; (b) la Fase 6 está confirmada como genuinamente inmutable a nivel de motor de base de datos (Q6).
