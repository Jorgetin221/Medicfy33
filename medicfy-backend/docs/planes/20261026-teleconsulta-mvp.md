# Plan: botón "Iniciar teleconsulta" y pantalla de videollamada (M7, MVP)

**Fecha:** 2026-10-26
**Reglas de especificación involucradas:** M7 (Teleconsulta, v1.1 parcial en MVP — "la cita de modalidad en línea genera un enlace de videollamada de proveedor externo... No construimos WebRTC... En MVP solo enlace generado"), M5-RN-005 (recordatorio de 2h incluye enlace de video — ya existe, no se toca), R2 (nada clínico por canal externo), R7 (sin credenciales reales en el repo)
**Estimación de pasos:** 6

## Análisis de impacto

- **Alcance MVP confirmado contra la especificación:** `ESPECIFICACION_TECNICA_MEDICFY_MVP.md` línea 99 y §7 M7: en MVP la teleconsulta es **un enlace de proveedor externo** (Daily.co o LiveKit Cloud, HIPAA-ready, §4 tabla de stack), nunca WebRTC propio. El layout "video + consulta + IA" en 3 columnas adaptable de `especificacion-plataforma-clinica-con-ia.md` §21 está marcado explícitamente como **Fase 3** (futuro), no MVP — no se construye aquí. Lo que sí se construye: una pantalla nueva y dedicada (`/teleconsulta/[appointmentId]`) que incrusta el enlace del proveedor en un `<iframe>` — el proveedor resuelve el WebRTC, Medicfy no.
- **Backend:** módulo `scheduling` (ya dueño de `Appointment`, que ya tiene `videoRoomUrl`/`videoProviderRef` sin usar). Mismo patrón puerto/adaptador que `ATLAS_API_PORT`/`AtlasHttpAdapter`:
  - `VIDEO_PROVIDER_PORT` (interfaz `isConfigured()` + `createRoom()`), adaptador real contra la API REST de Daily.co.
  - `TeleconsultationService.openRoom(appointment)`: valida modalidad `ONLINE` y estado `IN_PROGRESS`, reutiliza `videoRoomUrl` si ya existe (idempotente), si no existe pide uno al proveedor y lo persiste. "Degradación honesta" si no hay credenciales o el proveedor falla.
  - Nuevo endpoint `POST /appointments/:id/video-room` en `AppointmentsController` (mismo guard/ownership que el resto de la ruta).
  - Variables de entorno nuevas, **opcionales** (mismo criterio que `ANTHROPIC_API_KEY`/`ATLAS_*`): `DAILY_API_KEY`, `DAILY_API_BASE_URL` (default `https://api.daily.co/v1`, solo para inyectar un doble en pruebas).
  - **No hay migración:** `videoRoomUrl`/`videoProviderRef` ya existen en `appointments` desde el esquema actual, sin usar.
- **Contratos (`packages/contracts`):** `schemas/teleconsultation.schema.ts` nuevo — `teleconsultationRoomOutcomeSchema` (unión discriminada `ok`/`unavailable`, mismo patrón que `atlasSessionOutcomeSchema`).
- **Frontend:**
  - Botón "Iniciar teleconsulta" en `consulta-screen.tsx` (DOC-06), visible solo cuando `appointment.modality === "ONLINE"` y la consulta ya está en curso (fase `ready`/`readonly`) — abre `/teleconsulta/[appointmentId]` en una pestaña nueva, para no perder la nota clínica que ya está abierta.
  - Pantalla nueva `/teleconsulta/[appointmentId]` (`teleconsulta-screen.tsx`): pide el enlace al backend al montar, muestra los 4 estados obligatorios (cargando/error/sin conexión/listo) + "no disponible" (sin credenciales o proveedor caído), monta el `<iframe>` del proveedor cuando está listo, aviso fijo de que la llamada no se grba sin consentimiento expreso (M7).
  - `AppointmentDetail` (tipo del cliente) gana el campo `modality`, que el backend ya devuelve (no hay cambio de forma del backend, solo se declara en el tipo del frontend).
  - i18n es/en: namespace nuevo `teleconsulta` + una entrada en `consulta` para el texto del botón.
  - `dev-server.mjs`: mismo endpoint, hablando con la API real de Daily.co si `DAILY_API_KEY` está en `.env`, si no responde "no disponible" — mismo criterio que el mock de atlas.
- **Migraciones:** no.
- **Riesgo de regresión:** bajo. Todo es aditivo: un endpoint nuevo, un botón condicional nuevo, una pantalla nueva. No se toca la máquina de estados de la cita ni la lógica de firma de nota.

### Decisiones

- **Interfaz del puerto deliberadamente más chica que "createRoom/getJoinToken/endRoom" del texto de la especificación.** La especificación nombra esos tres métodos para la versión "v1.1 completo" (tokens de unión por participante, cierre explícito de sala); el MVP es "solo enlace generado" — un único enlace que médico y paciente usan (consistente con M5-RN-005, que habla de "el enlace", singular). Implementar `getJoinToken`/`endRoom` ahora violaría Interface Segregation sin que nada los llame. Queda documentado en el puerto con `PENDIENTE(jorge)` para cuando v1.1 completo (Fase 3) sea real alcance.
- **Nombre de sala determinista** (`medicfy-{appointmentId}`) en vez de guardar un lock: si dos pestañas piden el enlace a la vez, Daily.co decide (409/400 "ya existe") y el adaptador recupera la sala existente — mismo criterio que "la restricción EXCLUDE de la base de datos decide" (M4-CA-001), aplicado aquí al proveedor externo.
- **Sin grabación por defecto** (`enable_recording: false` explícito al crear la sala) — M7: "Nunca grabar la consulta sin consentimiento expreso de ambas partes." Medicfy no implementa consentimiento de grabación en este MVP, así que grabar queda bloqueado, no "apagado por defecto pero disponible".
- **Botón solo visible tras `start()`** (fase `ready`/`readonly` de `consulta-screen.tsx`, que ya transicionó la cita a `IN_PROGRESS`): "al momento de que el doctor inicie la consulta", tal como lo pidió el usuario — no antes (`SCHEDULED`/`CONFIRMED`).
- **Pestaña nueva, no panel integrado:** el layout de 3 columnas (video+consulta+IA) es Fase 3 explícita de la otra especificación (`especificacion-plataforma-clinica-con-ia.md` §21/Fase 3) — fuera de alcance aquí. Abrir en pestaña nueva deja ambas pantallas usables sin inventar ese layout.

## Pasos de implementación

1. [x] Contrato `teleconsultation.schema.ts` (backend y frontend, `packages/contracts`).
2. [x] Backend: puerto + adaptador Daily.co + `TeleconsultationService` + endpoint + wiring en `scheduling.module.ts` + env + pruebas unitarias (adaptador con `fetch` falso, servicio con puerto falso).
3. [x] Backend: prueba de integración del endpoint (`POST /appointments/:id/video-room`) — caso ONLINE+IN_PROGRESS, caso IN_PERSON (422), caso no iniciada (409).
4. [x] Mock (`dev-server.mjs`): endpoint equivalente + `modality` en las citas semilla.
5. [x] Frontend: botón en `consulta-screen.tsx` (extraído a `teleconsulta-button.tsx`), pantalla nueva `/teleconsulta/[appointmentId]`, i18n es/en, pruebas.
6. [x] Documentación: `.env.example` con `DAILY_API_KEY`/`DAILY_API_BASE_URL` comentadas.

## Criterios de aceptación

- [x] CA-1: una cita `ONLINE` en curso (`IN_PROGRESS`) muestra el botón "Iniciar teleconsulta" en DOC-06; una cita `IN_PERSON` no lo muestra.
- [x] CA-2: `POST /appointments/:id/video-room` sin `DAILY_API_KEY` configurada responde `{ kind: "unavailable", reason: "NOT_CONFIGURED" }`, nunca un error 500.
- [x] CA-3: `POST /appointments/:id/video-room` sobre una cita `IN_PERSON` responde 422; sobre una cita que no está `IN_PROGRESS` responde 409.
- [x] CA-4: dos llamadas sucesivas al mismo `appointmentId` devuelven el mismo enlace (idempotente).
- [x] CA-5: la pantalla `/teleconsulta/[id]` muestra sus 4 estados (cargando, error, sin conexión, listo) más "no disponible".

## Plan de pruebas

- **Unitarias (backend):** `daily-video-provider.adapter.spec.ts` (fetch falso: crea sala, recupera existente en conflicto, no configurado). `teleconsultation.service.spec.ts` (puerto falso: modalidad incorrecta, estado incorrecto, enlace ya existente, proveedor no configurado, proveedor falla).
- **Integración (backend):** extiende el patrón de `m5a.integration.spec.ts` — requiere Postgres real (Testcontainers), **no ejecutable en este entorno de trabajo** (sin Docker/Postgres disponible aquí); queda escrita para CI/local del equipo.
- **Frontend (Vitest):** render condicional del botón según `modality`; estados de `teleconsulta-screen.tsx`.
- **E2E:** fuera de este alcance — el flujo real requiere credenciales de Daily.co que no existen en este entorno (R7); se documenta como pendiente.

## Notas para el equipo

- `PENDIENTE(jorge)`: elegir Daily.co vs. LiveKit Cloud en definitivo y dar de alta las credenciales reales (§12.5 del documento de especificación ya lo deja como insumo abierto de costos). Este plan implementa contra Daily.co (API REST más simple para "solo enlace generado"), detrás de un puerto — cambiar de proveedor es una sola clase nueva.
- `PENDIENTE(jorge)`: consentimiento explícito de grabación (M7) no se modela todavía — la grabación queda bloqueada por completo en vez de "apagada por defecto", hasta que exista ese flujo de consentimiento.

## Resultado final

**Estado:** Completado.
**Commits incluidos:**
- `docs(planes): plan de implementación para teleconsulta-mvp`
- `feat(contracts): agregar esquema de resultado de sala de teleconsulta` (backend y frontend)
- `feat(scheduling): generar enlace de teleconsulta de proveedor externo`
- `test(scheduling): integración de POST /appointments/:id/video-room`
- `feat(mock): agregar POST /appointments/:id/video-room al mock server`
- `fix(i18n): traducir los mensajes de error nuevos de teleconsultación`
- `feat(frontend): botón "Iniciar teleconsulta" y pantalla de videollamada`

**Pruebas:**
- Backend unitarias: 10 nuevas (`daily-video-provider.adapter.spec.ts`, `teleconsultation.service.spec.ts`) — en verde. Suite completa de unitarias del backend (excluyendo integración, que requiere Postgres): 185/185 en verde, sin regresiones.
- Backend integración: `m7-teleconsultation.integration.spec.ts` escrita (4 casos) — **no ejecutable en este entorno de trabajo** (sin Docker/Postgres disponible aquí, igual que el resto de `*.integration.spec.ts` de este repo); typecheck y lint en verde.
- Frontend: 8 nuevas (`teleconsulta-button.spec.tsx`, `teleconsulta-screen.spec.tsx`) — en verde. Suite completa de Vitest del frontend: 65/65 en verde, sin regresiones. Typecheck y lint en verde en ambos monorepos.
- Verificación manual: mock server + `next dev` levantados en este entorno; `POST /appointments/apt-3/video-room` devuelve 409 antes de `/start`, `unavailable/NOT_CONFIGURED` después de `/start` (sin `DAILY_API_KEY` local), y `apt-1` (IN_PERSON) devuelve 422. Ambas rutas (`/consulta/apt-3`, `/teleconsulta/apt-3`) compilan y responden 200 en Next dev. **No se hizo clic-a-clic en un navegador real** (no hay herramienta de navegador habilitada en esta sesión) — la verificación visual fina (posicionamiento del botón, aspecto del iframe) queda pendiente de una pasada manual del equipo.
- E2E (Playwright): no se escribió — requeriría credenciales reales de Daily.co (R7), fuera de este alcance.

**Notas para el equipo:**
- Las dos `PENDIENTE(jorge)` de la sección anterior siguen abiertas: proveedor definitivo (Daily.co vs. LiveKit) y flujo de consentimiento de grabación.
- La prueba de integración nueva no corrió en este entorno por falta de Postgres — correrla en CI/local antes de confiar en que pasa.
