# PR-EXP-03 · Autorización del paciente — Expediente compartido autorizado por el paciente

**Fecha:** 2026-10-31
**Reglas de especificación involucradas:** RE1, RE4, RE5, RE7, RE9; D-EXP-05, D-EXP-06, D-EXP-08, D-EXP-09, D-EXP-12, D-EXP-13; sección B (límites de OTP/enlace).
**Input:** PR-EXP-01 (modelo), PR-EXP-02 (`RecordShareNotificationPort` mínimo, patrón de solicitud), `00-DESCUBRIMIENTO.md` Q4/Q5/Q13.

## Decisiones (ANTES de escribir código)

### 1. Falta un campo para "excluir embarazo activo" (D-EXP-09) — fix retroactivo a PR-EXP-01

D-EXP-09 es un **opt-out** (incluido por defecto) sobre un dato que el propio PR-EXP-04 deja **explícitamente fuera** de `SensitiveCategory.REPRODUCTIVE_HEALTH` ("CIE-10 O00-O08, Z30... EXCEPTO embarazo activo, D-EXP-09"). Mezclarlo en `excludedCategories` (que es un **opt-in** sobre categorías excluidas por defecto) confundiría dos semánticas opuestas en el mismo arreglo. **Fix:** `pregnancyExcluded Boolean @default(false)` nuevo en `RecordShareConsent` y `RecordShareGrant` — mismo patrón de fix retroactivo que `linkTokenHash` en PR-EXP-02.

### 2. Puerto de notificación: se EXTIENDE el de PR-EXP-02, no se crea uno nuevo

Ya documentado en `02-solicitud-del-medico.md` §2. Aquí se agregan `sendOtpCode` y `sendApprovalConfirmation` a `RecordShareNotificationPort`/`ConsoleRecordShareNotificationAdapter` — el guardia de "truena en producción sin proveedor real" (D-EXP-13) ya existe y cubre los métodos nuevos automáticamente (es el mismo adaptador).

### 3. "Enlace de revocación" en la confirmación de aprobación: diferido explícitamente a PR-EXP-06

El paso 6 de la letra ("mensaje con un enlace para revocar en cualquier momento") necesita un mecanismo de revocación que **todavía no existe** — PR-EXP-06 es quien construye esa ruta. Enviar un enlace que no lleva a nada sería peor que no enviarlo. **Decisión:** el mensaje de confirmación de aprobación se envía (nombre del médico, alcance, vigencia) **sin** el enlace de revocación, con un comentario explícito en el código señalando que PR-EXP-06 debe agregarlo aquí mismo cuando exista la ruta. No se inventa un enlace falso.

### 4. Texto de consentimiento: constante en código + archivo markdown para revisión legal, ambos a mano

`RecordShareConsent.consentTextSha256` debe ser el hash del texto REAL mostrado al paciente. Para que ese hash sea reproducible sin depender de resolución de rutas entre `src`/`dist`, el texto vive como constante de TypeScript (`record-share-consent-text.ts`, mismo criterio que `legal-document-versions.ts`) — el backend hashea esa constante, nunca lee un archivo en tiempo de ejecución. `docs/expediente-compartido/consentimiento-v0.md` existe igual (lo pide la letra, y es el artefacto que un abogado revisaría) con el **mismo texto**, y cada archivo señala al otro para no desincronizarse en silencio. 🔒 PENDIENTE REVISIÓN LEGAL en ambos — igual que `legal-document-versions.ts` ya marca sus dos constantes como "draft".

### 5. Verificación de OTP y decisión son dos llamadas separadas — sin token puente nuevo

En vez de inventar un tipo de JWT nuevo para "ya verificado, puedes decidir", el endpoint de decisión revisa directamente si existe un `RecordShareChallenge` de esta solicitud con `consumedAt` no nulo y dentro de una ventana razonable (30 min) — reutiliza el dato que ya existe, sin estado nuevo que sincronizar.

### 6. Reglas de "nunca ampliar" (criterio de terminación explícito)

- `approvedScope` ⊆ `request.requestedScope`, y además debe seguir incluyendo `"SUMMARY"` (D-EXP-05: el mínimo nunca se negocia a la baja tampoco).
- `durationDays` elegido ≤ `request.requestedDurationDays`, y debe ser uno de los 3 valores cerrados (7/30/90).
- Todo esto se valida en el **servidor**, nunca solo en la UI — hay una prueba que lo ataca directo contra la API con un cliente que manda un scope/duración mayores.

### 7. Categorías sensibles: las 5 casillas se ofrecen SIEMPRE, no solo si el alcance pide notas/resultados

Un diagnóstico F32 puede aparecer en "Diagnósticos activos", que es parte del Resumen — mínimo garantizado. Limitar el opt-in de sensibles a cuando se pide `SIGNED_NOTES`/`RESULTS` dejaría una fuga en el camino más común (solo Resumen). Se ofrecen las 5, siempre, desmarcadas.

### 8. Comparación de OTP en tiempo constante

`VerificationCodeService` (M1) no la usa (confirmado en `00-DESCUBRIMIENTO.md` Q5) — aquí sí, porque la RESTRICCIÓN de PR-EXP-03 lo exige explícitamente. `crypto.timingSafeEqual` sobre los hashes SHA-256 (buffers de igual longitud siempre, por ser la salida fija de SHA-256 en hex).

## Pasos de implementación

1. [x] Fix de esquema: `pregnancyExcluded` en `RecordShareConsent`/`RecordShareGrant` + migración.
2. [x] `record-share-consent-text.ts` + `docs/expediente-compartido/consentimiento-v0.md`.
3. [x] Extender `RecordShareNotificationPort`/adaptador de consola.
4. [x] `RecordShareAuthorizationService` + `RecordShareAuthorizationController` (público, sin `JwtAuthGuard`, con rate limit) + mock en `dev-server.mjs`.
5. [x] Pruebas: unitaria de comparación en tiempo constante/normalización reutilizada, integración del flujo completo (no ejecutable aquí, mismo bloqueador de Postgres).
6. [x] Frontend: página pública `/expediente-compartido/autorizar/[token]` (sin sesión, `noindex` — primera vez que se usa en el proyecto, ver Q13), i18n, prueba de componente.
7. [x] Documentación + informe de 7 puntos.

## Criterios de aceptación (texto literal del prompt maestro)

- [x] OTP correcto aprueba.
- [x] 5 intentos fallidos bloquean 1h.
- [x] OTP usado no se reutiliza.
- [x] OTP vencido falla.
- [x] Enlace vencido falla.
- [x] El alcance no se puede ampliar por manipulación de la API (prueba directa, sin pasar por la UI).
- [x] Sensibles excluidas por defecto.
- [x] Consentimiento con versión y hash.
- [x] Arranque de producción falla con el adaptador de desarrollo (ya cubierto desde PR-EXP-02, reverificado aquí).
- [x] Eventos en `audit_log` (`SHARE_OTP_SENT`, `SHARE_OTP_FAILED`, `SHARE_OTP_LOCKED`, `SHARE_APPROVED`, `SHARE_DENIED`).

## Fix encontrado al implementar: el texto de consentimiento no llegaba al paciente

`recordShareAuthorizationInfoSchema` (lo que `GET /record-share/authorize/:token` devuelve) no incluía el texto de consentimiento — el paso 5 de la letra ("ve un texto de consentimiento versionado") no tenía cómo cumplirse sin inventar una copia del texto en el frontend (con el riesgo real de que se desincronice del que el backend hashea). **Fix:** se agregaron `consentTextVersion`/`consentText` a la respuesta — el paciente lee EXACTAMENTE el texto cuyo hash se guarda al decidir, nunca una copia aparte.

## Plan de pruebas

- Backend: `record-share-authorization.integration.spec.ts` (8 casos: info sin dato del paciente, enlace vencido, OTP correcto aprueba con versión+hash, rechazo sin grant, alcance/duración no se amplían por API directa, decide sin OTP verificado falla, OTP usado no se reutiliza, OTP vencido falla, 5 fallos bloquean 1h) — no ejecutable en este entorno (sin Postgres); escrito, tipado, recolectado correctamente (verificado: falla solo en la conexión a la base, nunca por un error de código).
- Backend: comparación en tiempo constante — implementación con `timingSafeEqual` (`record-share-crypto.util.ts`), verificable por lectura de código; no hay una unidad de tiempo confiable de medir en una suite de integración.
- Verificado también: el grafo de inyección de dependencias de Nest resuelve `RecordShareAuthorizationController`/`Service` sin errores (script de arranque desechable, borrado tras usarlo) — esta vez incluso completó el arranque entero sin que la ausencia de Postgres lo bloqueara.
- Mock server: los 4 endpoints nuevos probados de punta a punta con `curl` real (info → reenviar OTP → verificar código incorrecto → decide sin verificar [falla] → verificar código correcto → decide aprobado).
- Frontend: `autorizar-view.spec.tsx` (6 casos) — **SÍ ejecutable aquí, 6/6 en verde.** Cubre: enlace inválido, info sin dato del paciente, llegar al formulario de decisión, que aprobar NUNCA manda un alcance/duración mayor a lo solicitado (ataque simulado del lado del cliente — nunca llega a probarlo porque la UI ya lo impide, reforzado además por el servidor), que excluir embarazo muestra la advertencia y se manda correctamente, y que rechazar no manda alcance ni duración.
- Verificado con `curl` contra `next build`/`next start` real: la página sirve `<meta name="robots" content="noindex">` — primera vez que el proyecto usa esta mecánica (Q13), confirmado funcionando de verdad, no solo por lectura de código.
- Suite completa del frontend: 76/76 ✓ (70 previas + 6 nuevas, sin regresiones). Contratos backend 56/56, frontend 42/42.
