# PR-EXP-01 · Modelo de datos y migración — Expediente compartido autorizado por el paciente

**Fecha:** 2026-10-31
**Reglas de especificación involucradas:** R1, R2, R4, R5, R7 (CLAUDE.md §2); RE1, RE2, RE3, RE4, RE6, RE9 del track; D-EXP-01, D-EXP-04, D-EXP-05, D-EXP-06, D-EXP-12.
**Input:** `docs/expediente-compartido/00-DESCUBRIMIENTO.md` (Q1, Q2, Q6, Q8).
**Estimación de pasos:** 1 (modelo + migración + contratos + prueba de modelo, sin servicio ni controlador — eso es PR-EXP-02 en adelante).

## Análisis de impacto

- **Módulos backend afectados:** ninguno de los existentes se modifica en su comportamiento. Se agregan 4 tablas nuevas (`record_share_requests`, `record_share_challenges`, `record_share_consents`, `record_share_grants`) y 6 enums cerrados. `Doctor` y `Patient` en `schema.prisma` ganan arreglos de relación inversa (metadata de Prisma únicamente — no generan `ALTER TABLE` sobre `doctors`/`patients`, la FK vive del lado de las tablas nuevas).
- **`CareRelationship`/`CareRelationshipGuard`: deliberadamente NO tocados.** Ver Q2 del descubrimiento: ese guard da paridad de lectura+escritura con el médico tratante, sin alcance parcial — reutilizarlo violaría RE3 (mínimo necesario) y RE4 (solo lectura). El valor de enum `PATIENT_GRANTED` de `CareRelationshipOrigin` queda sin usar, a propósito, para no mezclar dos significados.
- **Componentes frontend afectados:** ninguno todavía (no hay pantallas en PR-EXP-01). Se sincronizó `packages/contracts` en AMBOS monorepos (deuda técnica #10 ya conocida — el paquete sigue duplicado) con los enums cerrados (`ShareScope`, `SensitiveCategory`, `RecordShareRequestStatus`, `RecordShareConsentDecision`, `RecordShareGrantStatus`, duración cerrada 7/30/90 y el mínimo de 15-500 caracteres del motivo).
- **Contratos modificados:** sí — archivo nuevo `packages/contracts/src/schemas/record-share.schema.ts`, idéntico en los dos monorepos, registrado en ambos `src/index.ts`.
- **Migraciones necesarias:** sí — `prisma/migrations/20261031010000_exp01_record_share/migration.sql`.
- **Riesgo de regresión:** bajo. No se altera ninguna tabla ni endpoint existente; el único cambio sobre modelos existentes es la metadata de relación inversa en `Doctor`/`Patient` (sin efecto en columnas reales).

## Adaptaciones respecto al prompt maestro (declaradas, no silenciadas)

1. **`RecordShareChallenge.destinationRef`** no referencia "el contacto del custodio" (ese concepto no existe — Q1): registra solo qué canal (`EMAIL`/`PHONE`) del `Patient` único se usó. El campo se conserva con el mismo nombre para trazabilidad con el prompt maestro, pero su significado está adaptado y documentado en el propio `schema.prisma`.
2. **`channel` reutiliza `VerificationChannel`** (ya existe, `EMAIL`/`PHONE`) en vez de crear un enum nuevo — mismo catálogo que ya usa `VerificationCode`.
3. **`requestedDurationDays`/`durationDays` son `Int`, no un enum de Postgres.** D-EXP-06 limita a 7/30/90, pero cerrado en el contrato Zod (`shareDurationDaysSchema`), igual que los dominios de `ClinicalCatalogTerm` — así, ampliar las opciones de duración en el futuro es un cambio de código, no una migración.
4. **`ShareScope[]`/`SensitiveCategory[]` son arreglos NATIVOS de enum de Postgres** — primera vez que se usa este patrón en el esquema (lo existente usa `String[]` para arreglos, p. ej. `secondarySpecialtyIds`). Se preferyó así porque R2 exige catálogo cerrado para lo que un paciente puede autorizar, y un arreglo de enum lo cierra a nivel de Postgres, no solo en Zod. Confirmado con `prisma generate`: el cliente tipa correctamente estos campos.
5. **Ningún evento nuevo de `audit_log`** se agrega al esquema — `AuditLog.action` ya es texto libre (Q8 del descubrimiento), así que los eventos de PR-EXP-01 §6 (`SHARE_REQUESTED`, `SHARE_APPROVED`, etc.) son simplemente strings que el servicio de PR-EXP-02 en adelante pasará a `AuditService.log()` ya existente — no requieren cambio de esquema.

## Permisos aplicados (R1, desde el día uno)

| Tabla | GRANT a `medicfy_app` | Motivo |
|---|---|---|
| `record_share_requests` | `SELECT, INSERT, UPDATE` (nunca `DELETE`) | estado vigente: transiciones `PENDING_PATIENT→APPROVED/DENIED/EXPIRED_UNANSWERED/CANCELLED_BY_REQUESTER` |
| `record_share_challenges` | `SELECT, INSERT, UPDATE` (nunca `DELETE`) | acumula `attempts`/`resends`, marca `consumedAt`/`lockedUntil` |
| `record_share_grants` | `SELECT, INSERT, UPDATE` (nunca `DELETE`) | transiciones `ACTIVE→EXPIRED/REVOKED_BY_PATIENT/SUSPENDED_BY_ADMIN` |
| `record_share_consents` | `SELECT, INSERT` únicamente — `REVOKE UPDATE, DELETE, TRUNCATE` explícito | evidencia append-only; mandato explícito del prompt maestro: "un consentimiento nunca se edita" (mismo tratamiento que `clinical_notes`) |

Índice único parcial agregado a mano en la migración (Prisma no expresa `WHERE` en `@@unique`): un `record_share_grant` `ACTIVE` por tripleta `(requesterDoctorId, custodianDoctorId, patientId)` — mismo patrón que `patient_pregnancies_one_active_per_patient`.

## Pasos de implementación

1. [x] `prisma/schema.prisma`: 4 modelos + 6 enums + relaciones inversas en `Doctor`/`Patient`. `prisma validate` y `prisma generate` en verde.
2. [x] `prisma/migrations/20261031010000_exp01_record_share/migration.sql`: escrita a mano (sin shadow database disponible en este entorno — ver "Problemas encontrados" abajo), mirando exactamente la sintaxis de migraciones ya aplicadas (`20260827050000_f1_patient_pregnancy` para el índice parcial, `20260823224811_m8_m9_m10_clinical_core` y `20260827030000_r1_revoke_delete_on_clinical_tables` para el patrón GRANT/REVOKE).
3. [x] `packages/contracts/src/schemas/record-share.schema.ts` en ambos monorepos + registro en `src/index.ts` de ambos.
4. [x] Prueba de modelo `apps/api/src/modules/record-share/record-share-model.integration.spec.ts` (sin servicio/controlador — eso es PR-EXP-02): UPDATE permitido en las 3 tablas de estado vigente, DELETE rechazado en las 4, UPDATE rechazado en `record_share_consents`, índice parcial de grant único probado.

(commit: pendiente — regla de git de la sección 2 del prompt maestro: no se hace ningún commit en este track).

## Criterios de aceptación

- [x] CA-1: la migración existe y su SQL es consistente con el esquema (`prisma generate` la usa sin error de tipos).
- [⚠️] CA-2: "la migración aplica limpia sobre la base de desarrollo" — **no verificable en este entorno** (ver Problemas encontrados).
- [⚠️] CA-3: "una prueba demuestra que DELETE falla en las tablas nuevas y que UPDATE falla en RecordShareConsent" — la prueba **existe, compila y se recolecta correctamente** (9/9 casos), pero no pudo **ejecutarse** contra una base real aquí.
- [x] CA-4: la suite completa (lo que sí depende solo de TypeScript/Zod, no de Postgres) sigue en verde: contratos backend 56/56, contratos frontend 42/42, typecheck backend limpio, lint backend limpio.

## Plan de pruebas

- Prueba de integración de modelo (sin servicio): `record-share-model.integration.spec.ts`, mismo patrón que `records/append-only.integration.spec.ts` (conecta como `medicfy_app` y como dueño del esquema). Cubre: INSERT/UPDATE permitidos en las 3 tablas de estado vigente, DELETE rechazado en las 4 tablas, UPDATE rechazado en `record_share_consents`, y el índice único parcial de "un grant ACTIVE por tripleta".
- Sin pruebas E2E en esta fase (no hay UI ni endpoint todavía).
- Sin pruebas de contratos nuevas dedicadas (los enums son tipos cerrados sin lógica de validación compleja propia más allá de `z.enum`/`z.union`; se verificó por compilación, no se escribió un `.spec.ts` nuevo para evitar una prueba que solo repetiría la definición del enum — se añadirá cuando exista lógica real que probar, p. ej. el DTO de la solicitud en PR-EXP-02).

## Problemas encontrados

- **Sin Postgres/Docker alcanzable en este entorno de ejecución** (mismo bloqueador (d) ya reportado en PR-EXP-00): `prisma migrate dev`, `prisma migrate diff` (que necesita una shadow database real) y la ejecución real de la prueba de modelo no se pudieron correr. Se mitigó al máximo posible:
  - El esquema se validó con `prisma validate` (sintaxis/semántica) y con `prisma generate` (el cliente se generó sin error, probando que los tipos y relaciones son correctos).
  - La migración se escribió a mano, replicando literalmente la sintaxis de 4 migraciones ya aplicadas y en producción en este mismo repo (no una sintaxis inventada).
  - La prueba de modelo se verificó con `tsc --noEmit` contra los tipos reales del Prisma Client generado (detecta cualquier nombre de campo o valor de enum incorrecto) y se ejecutó hasta el punto exacto donde necesita la base de datos — el único error que arroja es `Can't reach database server at 127.0.0.1:5432`, nunca un error de código.
- Ningún otro problema — no se tocó ninguna tabla ni endpoint existente.

## Pendientes reales (🔒 y ⚠️)

- 🔒 **Confirmación de Jorge pendiente** (bloqueador 1 de `00-DESCUBRIMIENTO.md`): la adaptación de `destinationRef`/RE6 al modelo de `Patient` global. Implementado con la interpretación documentada; reversible si Jorge decide algo distinto.
- 🔒 D-EXP-12 (texto legal de `ipAddress`/`userAgent` como evidencia) — señalado en el propio `schema.prisma`, sin resolver, como pide el prompt maestro.
- ⚠️ CA-2/CA-3 (arriba): pendientes de ejecutarse de verdad en un entorno con Postgres real antes de considerarlos cerrados — no es una duda de diseño, es una limitación de ESTE entorno de ejecución.
- Los demás pendientes 🔒 del track (proveedor de envío, acceso de emergencia, lista de sensibles, etc.) no aplican a PR-EXP-01 — quedan para las fases que les corresponden.

## Fix post-implementación (al construir PR-EXP-02): faltaba el token del enlace

Al diseñar PR-EXP-02 se descubrió que PR-EXP-03 pide explícitamente "un token opaco de un solo propósito" para el enlace de autorización que recibe el paciente, y PR-EXP-01 no le había dado dónde vivir — ni tabla nueva ni campo. **Fix:** `RecordShareRequest.linkTokenHash` (`String @unique`), mismo patrón que `PasswordResetToken`/`AssistantInvitation.token`: solo el hash vive en la base, el token en claro viaja únicamente en el enlace enviado al paciente. Su vigencia es la misma que `expiresAt` (72h) — no hizo falta un campo de expiración propio. Migración y prueba de modelo actualizadas en el mismo paso; `prisma validate`/`generate`/`tsc --noEmit` en verde.

## Resultado final

**Estado:** Completado en código, pendiente de verificación contra Postgres real (CA-2/CA-3).
**Archivos nuevos/modificados** (sin commits, regla de git de la sección 2):
- `medicfy-backend/prisma/schema.prisma` (modificado)
- `medicfy-backend/prisma/migrations/20261031010000_exp01_record_share/migration.sql` (nuevo)
- `medicfy-backend/packages/contracts/src/schemas/record-share.schema.ts` (nuevo)
- `medicfy-backend/packages/contracts/src/index.ts` (modificado)
- `medicfy-frontend/packages/contracts/src/schemas/record-share.schema.ts` (nuevo)
- `medicfy-frontend/packages/contracts/src/index.ts` (modificado)
- `medicfy-backend/apps/api/src/modules/record-share/record-share-model.integration.spec.ts` (nuevo)
- `docs/expediente-compartido/01-modelo-de-datos.md` (este archivo)

**Pruebas:** contratos backend 56/56 ✓, contratos frontend 42/42 ✓, typecheck backend limpio, lint backend limpio, `prisma generate` ✓. Prueba de modelo nueva (9 casos) escrita y verificada por tipos; no ejecutable contra base de datos real en este entorno.
**Notas para el equipo:** nombres finales — `RecordShareRequest`, `RecordShareChallenge`, `RecordShareConsent`, `RecordShareGrant`; enums `ShareScope`, `SensitiveCategory`, `RecordShareRequestStatus`, `RecordShareConsentDecision`, `RecordShareConsentMethod`, `RecordShareGrantStatus`. Contratos en `packages/contracts/src/schemas/record-share.schema.ts` (ambos monorepos). Listo para PR-EXP-02 (solicitud del médico), que es quien primero va a usar `DoctorVerifiedGuard` (ya existente, sin cambios) y el patrón de `ThrottlerGuard`/`rate-limit.ts` para el límite diario.
