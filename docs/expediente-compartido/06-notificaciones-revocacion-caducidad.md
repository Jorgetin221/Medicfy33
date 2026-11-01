# PR-EXP-06 · Notificaciones, revocación, caducidad y vista del custodio

**Fecha:** 2026-11-01
**Reglas de especificación involucradas:** R1, R6, RE4, RE5, RE7, RE9; D-EXP-02, D-EXP-13.
**Input:** `RecordShareNotificationPort` (PR-EXP-02/03), modelos de PR-EXP-01, `00-DESCUBRIMIENTO.md` Q4/Q10.

## Hallazgos de grounding (verificados en el código antes de escribir nada)

1. **No existe una "cola de administración" genérica en el M2.** Lo que el prompt maestro llama "la cola de administración existente" es `GET /admin/doctors?verification_status=…` (`doctors/admin-doctors.controller.ts`): una **vista filtrada sobre la tabla `doctors`**, no una tabla de pendientes donde se pueda "crear un elemento". No hay ningún modelo `AdminQueue`/`Report`/`Incident` en `schema.prisma`.
2. **No existe bandeja de notificaciones dentro de la app.** `Notification` (M12) persiste cada mensaje, pero solo se entrega por EMAIL/WHATSAPP (`notifications.service.ts`) y el frontend no tiene ninguna pantalla que las lea. "Al custodio, en la app" no tiene canal propio que reutilizar.
3. **RE9 contradice la plantilla literal del aviso al custodio.** RE9: "ningún dato personal o clínico en... mensajes de notificación". La plantilla de la letra: "Tu paciente **[nombre]** autorizó...". El nombre del paciente es dato personal.
4. **La revocación necesita dos cosas que el modelo no tiene**: un token de enlace propio por grant (el enlace de autorización de PR-EXP-03 muere al decidir) y una forma de que un OTP de revocación no se confunda con uno de autorización sobre la misma solicitud.

## Decisiones

| # | Decisión | Por qué |
|---|---|---|
| 1 | **"Cola" de abuso = vista administrativa sobre `audit_log`** (`SHARE_ABUSE_REPORTED`), sin tabla nueva. `GET /admin/record-share/abuse-reports` + pantalla dentro de `/admin`. | Mismo criterio que la "cola" del M2 (una vista filtrada, no una tabla), respeta "no crees una nueva", y `audit_log` ya es append-only con cadena de hash — el reporte queda inalterable por construcción. El motivo escrito por el custodio va en `audit_log.justification` (columna que ya existe para eso), nunca en `metadata`. |
| 2 | **Médicos (solicitante y custodio) se notifican por `NotificationsService` (M12)** con 5 plantillas nuevas. La visibilidad "en la app" del custodio es la pestaña **Compartido** del expediente. | Reutiliza la persistencia, idempotencia `(usuario, plantilla, entidad)` y la garantía "sin campos clínicos por construcción" de `notification-templates.ts`. No se construye una bandeja nueva (fuera de alcance). |
| 3 | **RE9 gana sobre la plantilla literal**: el aviso al custodio NO lleva el nombre del paciente; lleva el nombre del médico solicitante, el alcance (etiquetas, no contenido) y la vigencia, más un enlace al expediente (id opaco, detrás de sesión). | RE9 es una regla numerada de seguridad; la plantilla es un ejemplo de redacción. El nombre se ve dentro de la app, no en un correo. |
| 4 | **Fix de esquema (retroactivo a PR-EXP-01, migración nunca aplicada):** `RecordShareGrant.revokeTokenHash` (`@unique`) y `RecordShareChallenge.purpose` (`AUTHORIZE`/`REVOKE`, default `AUTHORIZE`). **Migración nueva aparte** solo para los 5 valores agregados al enum EXISTENTE `notification_template_code`. | Mismo patrón que `linkTokenHash`/`pregnancyExcluded`. El enum de notificaciones no es de este track — tocarlo va en su propia migración, separado del modelo de expediente compartido. |
| 5 | **Caducidad: barrido cada 5 min** (`RecordShareSweepService`, mismo patrón exacto que `AppointmentSweepService`: `setInterval`, compare-and-set, apagado en `NODE_ENV=test`) **más** la expiración perezosa del guard, que ya existía. Ambos caminos registran `SHARE_GRANT_EXPIRED`. | Sin dependencia nueva (Q10: no hay `@nestjs/schedule`). El guard sigue siendo la barrera real — el barrido solo pone el estado al día y dispara avisos. |
| 6 | **"Rechazada" y "vencida sin respuesta" usan la MISMA plantilla** (`RECORD_SHARE_NOT_AUTHORIZED`) para el solicitante. | Letra explícita + RE5. |
| 7 | **El custodio no revoca** (D-EXP-02): su pestaña solo lee y reporta. **El administrador suspende** (`SUSPENDED_BY_ADMIN`, motivo obligatorio 15-500, `SHARE_SUSPENDED_BY_ADMIN`). | Letra. |

## Criterios de aceptación (texto literal)

- [x] Caducidad por trabajo y por guard.
- [x] La revocación bloquea de inmediato.
- [x] El solicitante no distingue "rechazada" de "vencida".
- [x] El custodio ve el historial.
- [x] El reporte crea un elemento en la cola.
- [x] La suspensión de administración bloquea.
- [x] Los mensajes no contienen datos clínicos (prueba que inspecciona la carga útil del adaptador).

## Implementación (archivos)

**Backend** (`medicfy-backend/apps/api/src/modules/record-share/`):
- `services/record-share-doctor-notifier.service.ts` — avisos a médicos vía M12 (5 plantillas); un fallo de envío se registra (solo código de plantilla) y nunca deshace la acción.
- `services/record-share-authorization.service.ts` — al aprobar genera el token de revocación (solo su hash en la base), lo manda en la confirmación al paciente, avisa al solicitante y al custodio; al rechazar avisa con `RECORD_SHARE_NOT_AUTHORIZED`. Los OTP se filtran por `purpose: AUTHORIZE`.
- `services/record-share-revocation.service.ts` + `record-share-revocation.controller.ts` — `GET/POST /record-share/revoke/:token[/otp|/otp/verify|/revoke]`, público, `@AuthThrottle` en OTP, OTP `purpose: REVOKE`, compare-and-set `ACTIVE → REVOKED_BY_PATIENT`, solo grants del mismo paciente.
- `services/record-share-sweep.service.ts` — barrido de 5 min (solicitudes → `EXPIRED_UNANSWERED`, grants → `EXPIRED`, aviso "por vencer" 48 h, idempotente por la unicidad de `notifications`).
- `shared-record.guard.ts` — la expiración perezosa ahora es compare-and-set y audita `SHARE_GRANT_EXPIRED` (`metadata.via = lazy_guard`).
- `services/record-share-oversight.service.ts` + `record-share-custodian.controller.ts` (`JwtAuthGuard + CareRelationshipGuard`, además filtrado por `custodianDoctorId`) + `record-share-admin.controller.ts` (`JwtAuthGuard + AdminGuard`).
- Eventos de audit_log nuevos: `SHARE_REVOKE_OTP_SENT/FAILED/LOCKED`, `SHARE_REVOKED`, `SHARE_REQUEST_EXPIRED`, `SHARE_GRANT_EXPIRED`, `SHARE_CUSTODIAN_LISTED`, `SHARE_ABUSE_REPORTED` (motivo en `justification`), `SHARE_SUSPENDED_BY_ADMIN` (motivo en `justification`).

**Frontend:** `/expediente-compartido/revocar/[token]` (pública, noindex), pestaña **Compartido** en `/pacientes/[id]`, `/admin/expediente-compartido` (+ tarjeta en `/admin`).

## Resultado de pruebas (este entorno, sin Postgres)

- Unitarias nuevas en verde: `record-share-sweep.service.spec.ts` (4), `record-share-doctor-notifier.service.spec.ts` (3 — inspección de payload: sin nombre del paciente ni términos clínicos), `notification-templates.spec.ts` (9).
- `record-share-revocation.integration.spec.ts` (9 casos) escrito; **no ejecutable aquí** (no hay Postgres) — falla solo al conectar, igual que todas las demás `*.integration.spec.ts`.
- Arranque de DI de `AppModule` verificado: las 3 rutas nuevas se mapean; falla solo al conectar a la base.
- Frontend: 22 archivos / 92 pruebas en verde (incluye 10 nuevas).

## Pendientes

- ⚠️ El enlace de revocación muestra **todos** los accesos vigentes del paciente (no solo el del enlace): el token prueba control del mismo correo que autorizó. Por confirmar.
- ⚠️ La suspensión del admin avisa al solicitante con la misma plantilla neutra de "revocado" (sin motivo administrativo). Por confirmar.
- ⚠️ El paciente no recibe aviso cuando su acceso **vence** ni cuando el admin lo **suspende** (la letra solo pide confirmación de revocación). Por confirmar.
- 🔒 Proveedor real de correo/SMS para el paciente (D-EXP-13): el adaptador de consola truena en producción.
