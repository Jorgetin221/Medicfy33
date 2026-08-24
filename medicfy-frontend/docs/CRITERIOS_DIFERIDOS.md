# CRITERIOS_DIFERIDOS.md

> **Nota de procedencia.** Este archivo no existía en ningún lugar accesible al agente de código — se buscó en el repositorio y en `~/Downloads`, `~/Documents` y `~/Desktop` del fundador antes de escribir esto, y no apareció. El fundador pidió expresamente, el 14 de agosto de 2026, que el agente lo creara, limitado a los dos ítems que `ESPECIFICACION_TECNICA_MEDICFY_MVP.md` §17 ya referenciaba por nombre sin que el archivo existiera. No introduce ninguna regla de negocio nueva: documenta la mitad ya escrita de dos criterios de aceptación que ya existen (M2-CA-007, M2-CA-008) — la mitad que no se puede verificar todavía porque depende de un módulo o columna que aún no está construido. Actualizado el mismo día para M4-CA-001/002/003 y para la tabla de deuda técnica, ambos también a pedido directo del fundador. Actualizado de nuevo el mismo día al cerrar M5a (patients/appointments — v. "M5a hay que partirlo en dos").

## M2-CA-007 — persistencia tras suspensión

**Texto del criterio (spec, módulo M2):** "Tras suspender a un médico, su perfil, sus documentos y los expedientes de sus pacientes siguen existiendo y siendo accesibles para esos pacientes. Nada se borra ni se oculta."

| Mitad | Estado |
|---|---|
| El perfil del médico y sus filas en `doctor_documents` no se borran ni se ocultan al suspender | **Verificable hoy.** No depende de ningún módulo pendiente — es una aserción directa sobre el efecto de `POST /admin/doctors/:id/suspend` en la base de datos. |
| Los expedientes de sus pacientes siguen **accesibles para esos pacientes** | **Parcialmente desbloqueado por M5a.** `care_relationship` ya existe y es real (AUTH-RN-001, `apps/api/src/modules/scheduling/services/care-relationship.service.ts`). Sigue diferido: el acceso al *expediente clínico* en sí (M8) todavía no existe, así que "siguen accesibles" no es verificable de punta a punta hasta entonces. |

## M2-CA-008 — sello de verificado y vencimiento de cédula de especialidad

**Texto del criterio (spec, módulo M2):** "El sello de verificado es `false` en cualquier estado distinto de `verified`. Una cédula de especialidad con vencimiento registrado dispara recordatorio a 60 días y degrada el sello al vencer."

| Mitad | Estado |
|---|---|
| `verified` es `false` en cualquier estado distinto de `VERIFIED` | **Verificable hoy.** Ya implementado en `apps/api/src/modules/doctors/doctor-public-view.ts` (`verified: doctor.verificationStatus === "VERIFIED"`). |
| Recordatorio a 60 días antes del vencimiento, y degradación del sello al vencer | **Diferido.** Depende de una columna de vencimiento en `doctor_documents` que hoy no existe en `prisma/schema.prisma` (ver `ESPECIFICACION_TECNICA_MEDICFY_MVP.md` §17, entrada v2.1.1, "Pendiente, no resuelto"), y de un job programado (Redis + BullMQ, §3 del `CLAUDE.md`) que tampoco está construido. |

## M2-CA-009 — paciente creado por médico — RESUELTO

**Texto del criterio (spec, módulo M2, reasignado a M5):** "Un médico crea un paciente sin cuenta de usuario, queda con `medicfy_id` legible y `source = created_by_doctor`, y se genera automáticamente el `care_relationship` correspondiente. Se verifica al cerrar M5."

**Resuelto al cerrar M5a, 14 agosto 2026.** `PatientService.createByDoctor()` crea el paciente (con `medicfyId` desde `patients_medicfy_id_seq`, `source = CREATED_BY_DOCTOR`) y el `care_relationship` (`origin = CREATED_BY_DOCTOR`) en una sola transacción — no es una consecuencia eventual. Cubierto en `m5a.integration.spec.ts`.

## M4-CA-001 — concurrencia de reserva (50 solicitudes → 1 éxito, 49 SLOT_TAKEN) — RESUELTO

**Texto del criterio (spec, módulo M4):** "Prueba de concurrencia: 50 solicitudes paralelas por el mismo espacio → exactamente 1 éxito, 49 `SLOT_TAKEN`."

**Historia:** el prompt del Sprint 3 había ubicado esta prueba en M4; el fundador confirmó (14 agosto 2026) que estaba mal ubicada — la restricción vive en `appointments`, que M4 no construye — y que dejarla `it.todo` en `m4.integration.spec.ts` fue la decisión correcta. Quedó como puerta dura para el cierre de M5a, no negociable: sin la salida real de k6, el sprint no cierra.

**Resuelto al cerrar M5a, 14 agosto 2026.** Prueba de carga real ejecutada contra el servidor corriendo de verdad (no la suite de Vitest): `apps/api/test/k6/seed-concurrency-fixture.mjs` siembra un médico verificado + servicio + paciente reales por Prisma y firma un access token real; `apps/api/test/k6/double-booking.k6.js` dispara 50 `POST /appointments` en paralelo (executor `shared-iterations`, 50 VUs) por el mismo médico y el mismo horario exacto.

Salida completa de k6:

```
  █ THRESHOLDS

    booking_slot_taken
    ✓ 'count==49' count=49

    booking_success
    ✓ 'count==1' count=1

    booking_unexpected
    ✓ 'count==0' count=0

  █ TOTAL RESULTS

    checks_total.......: 50      679.089477/s
    checks_succeeded...: 100.00% 50 out of 50
    checks_failed......: 0.00%   0 out of 50

    ✓ status is 201 (booked) or 409 (SLOT_TAKEN)

    CUSTOM
    booking_slot_taken.............: 49     665.507687/s
    booking_success................: 1      13.58179/s
    booking_unexpected.............: 0      0/s
```

Verificado también directo en la base de datos tras la corrida: exactamente una fila en `appointments` para ese médico y ese horario, pese a las 50 solicitudes concurrentes. Los umbrales de k6 (`count==1`/`count==49`/`count==0`) hacen que la propia herramienta falle la corrida (código de salida distinto de cero) si los números no coinciden exactamente — no es una lectura visual, es una aserción real.

## M4-CA-002 — el médico configura una semana típica en ≤3 minutos

**Texto del criterio (spec, módulo M4):** "El médico configura una semana típica en ≤3 minutos."

| Mitad | Estado |
|---|---|
| — | **No es un criterio de backend.** Es una medición de eficiencia de UX en `apps/web` (aún no construido) — no hay nada que una prueba de integración de API pueda afirmar o negar aquí. Se verificará cuando exista la pantalla de configuración de agenda, con la misma disciplina que `DOC-06`'s requisitos de tiempo (`CLAUDE.md` §6). No se fabricó una prueba falsa para simular cobertura. |

## M4-CA-003 — una excepción nunca cancela citas en silencio — RESUELTO

**Texto del criterio (spec, módulo M4):** "Un bloqueo por vacaciones nunca cancela citas sin decisión explícita del médico." (M4-RN-006: "lista las citas afectadas y exige que el médico decida cancelar-con-reembolso o reagendar, una por una".)

**Resuelto al cerrar M5a, 14 agosto 2026.** `AvailabilityExceptionService.create()` ahora verifica citas activas que se traslapen con el bloqueo propuesto; si encuentra alguna, rechaza la creación (409 `AVAILABILITY_EXCEPTION_HAS_AFFECTED_APPOINTMENTS`) y devuelve la lista de citas afectadas, sin tocar ninguna. El médico debe cancelarlas o reagendarlas primero (ambos endpoints ya reales, M5a) y solo entonces el bloqueo se puede crear. Cubierto en `apps/api/src/modules/scheduling/m5a.integration.spec.ts`: rechazo con la cita listada y sin modificar, y creación exitosa una vez resuelta la cita en conflicto.

## Deuda técnica (DT)

**Regla, a partir de esta entrada:** todo workaround usado en una prueba para sortear un endpoint o mecanismo que aún no existe se registra aquí como deuda técnica, con su propio ID, en el momento en que se introduce el workaround — no cuando alguien lo nota después. Un atajo de prueba no documentado es exactamente el tipo de defecto silencioso que este archivo existe para prevenir.

| ID | Severidad | Descripción | Origen | Estado |
|---|---|---|---|---|
| DT-01 | — | Todo el esquema usaba `TIMESTAMP` sin zona horaria, no `TIMESTAMPTZ` (`CLAUDE.md` §4 lo exige). Riesgo real y verificado: la sesión de Postgres de este entorno está en `America/Mexico_City`, no UTC — una migración ingenua habría corrido cada hora 6 horas en silencio. | Encontrado al construir M4 (todas las columnas nuevas de M4 sí usaban `TIMESTAMPTZ`; se notó la inconsistencia contra M1/M2). | **Resuelto**, commit `c41194e`. Migración con `USING ... AT TIME ZONE 'UTC'` explícito en cada columna, verificada empíricamente antes de escribirse (ver el commit y el encabezado de la migración) y verificada como preservadora de valor después de aplicarse (filas reales de `audit_log`/`consents`/`users` comparadas bit a bit antes/después). |
| DT-02 | — | `PATCH /doctors/me/locations/:id` y `PATCH /doctors/me/services/:id` no tenían validación Zod en tiempo de ejecución — el cuerpo se tipaba `Partial<X>`, solo TypeScript, sin pipe alguno. | Encontrado al construir M4 (comparando el patrón de sus propios controllers PATCH contra los de M2). | **Resuelto**, commit `6b8fd8d`. `practiceLocationUpdateSchema`/`doctorServiceUpdateSchema` (`.partial().strict()`), enlazados vía `@Body(pipe)` directo (no `@UsePipes` a nivel de método, por el mismo bug ya conocido con `@Param`). Pruebas nuevas para ambos PATCH — no existía ninguna antes. |
| DT-03 | — | `POST /doctors/me/assistants/accept` nunca se conectó a un controller — el servicio existía y funcionaba, pero el rol ASSISTANT era inalcanzable por la API real. Las pruebas de M4 lo sorteaban creando el `UserRole` directamente por Prisma. | Encontrado al construir M4; el atajo de prueba se introdujo en el mismo commit de M4 (`61fd33e`) sin quedar registrado aquí en ese momento — la omisión queda corregida con esta entrada. | **Resuelto**, commit `2b728f0`. Endpoint real conectado; `m4.integration.spec.ts` reescrito para pasar por invitar→capturar token→aceptar por HTTP, no por el atajo. Cobertura directa del endpoint (éxito, token inválido, reintento de token ya usado) añadida a `m1.integration.spec.ts`, que no tenía ninguna. |
| DT-04 | **ALTA — escalada 14 ago 2026** | `patient_guardians.guardianIdDocumentKey` (INE del tutor) se acepta como referencia de archivo suelta, sin endpoint de subida. **Por qué es alta, no una simplificación de alcance cualquiera (corrección de Jorge):** el INE de un tutor es documento sensible de un **tercero** — ni siquiera del paciente titular del expediente. Como referencia suelta, hoy **no pasa por el pipeline de `FileStoragePort`**: no se cifra al guardarse (mismo tratamiento que `DoctorDocument.fileHashSha256`/cifrado en reposo) y no se sirve por URL prefirmada de vida corta — cualquier código con el valor de `guardianIdDocumentKey` podría potencialmente referenciarlo sin ese control de acceso. Es el mismo tipo de exposición que R2 prohíbe para datos clínicos, aplicado aquí a un documento de identidad de un tercero. | Decisión de alcance tomada al construir M5a (`packages/contracts/src/schemas/patient.schema.ts`), documentada ahí mismo con un comentario — registrada aquí también por la nueva regla de esta tabla. Severidad escalada a petición explícita de Jorge el mismo día, tras construir M5a. | **Abierto, prioridad alta.** No usar este campo con datos reales de un tutor hasta resolverlo. Construir el endpoint de subida reusando `FileStoragePort` (mismo mecanismo que `DoctorDocumentService`: cifrado en reposo + hash + URL prefirmada ≤5 min, igual que documentos de médico) antes de que el flujo de menores/tutores se use fuera de pruebas. |
| DT-05 | Baja | `doctors.cancellationPolicy` (M5-RN-002, "configurable por médico") existe en el esquema y el snapshot que se guarda en cada cita lo usa correctamente, pero no hay endpoint para que el médico lo edite — `PATCH /doctors/me` no lo incluye todavía. Se probó cambiándolo directo por Prisma. | Decisión de alcance tomada al construir M5a — el mecanismo del snapshot era lo pedido, no necesariamente la UI/endpoint de configuración. | **Abierto.** Agregar `cancellationPolicy` a `doctorProfileUpdateSchema` y `DoctorProfileService.updateProfile()`, mismo patrón que `minBookingNoticeMinutes`/`maxBookingWindowDays` (M4-RN-005). Sin implicación de datos de terceros — no urgente. |
| DT-06 | — | `@UsePipes` a nivel de método reapareció una segunda vez en el mismo commit de M5a (`complete`/`cancel`/`reschedule` de `appointments.controller.ts`), tras ya haber costado un bug real en M2. Un comentario recordándolo no alcanza — la tercera aparición, en un controller de recetas, costaría más que pruebas rojas (Jorge). | Encontrado por la propia suite de M5a (10 pruebas en rojo) antes del commit; el arreglo puntual quedó hecho, pero sin mecanismo que impidiera una cuarta aparición. | **Resuelto de raíz, mismo día.** Regla ESLint `no-restricted-syntax` en `eslint.config.mjs` (raíz del monorepo) prohíbe `@UsePipes` a nivel de método en cualquier archivo — falla el lint, y por tanto CI, si alguien vuelve a escribirlo. Al activarla se encontraron **18 ocurrencias preexistentes más** en 10 controllers (la mayoría sin bug activo porque no tenían `@Param`, pero igual prohibidas por la regla, sin excepciones) — todas movidas a `@Body(new ZodValidationPipe(schema))`. Verificado: la regla dispara sobre el patrón incorrecto y no dispara sobre el correcto antes de aplicarse al código real. |

## Cómo se resuelve este archivo

Cada fila "Diferido" se elimina de aquí y se mueve a la especificación principal (con su propio criterio de aceptación) el día que el módulo o columna del que depende se construya — nunca antes, para no dejar un criterio a medio verificar contando como cumplido. Cada fila de la tabla DT se elimina el día que su workaround deja de existir en el código (no cuando se abre un ticket para eliminarlo).
