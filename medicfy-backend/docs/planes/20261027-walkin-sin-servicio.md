# Plan: consulta sin cita (walk-in) sin bloquear por falta de servicios

**Fecha:** 2026-10-27
**Reglas de especificación involucradas:** M5a (walk-in como `Appointment` real en `IN_PROGRESS`, ver comentario en `appointment-state-machine.service.ts:232-241`)
**Estimación de pasos:** 1 commit (cambio acotado a un servicio + limpieza + tests)

## Análisis de impacto

- **Problema:** `startWalkIn` (`appointment-state-machine.service.ts:242-301`) exige un `DoctorService` activo del médico antes de crear la cita. No existe ninguna pantalla de frontend para gestionar servicios, así que en producción ningún médico puede usar walk-in salvo que alguien le cree un servicio manualmente contra la API.
- **Por qué no se puede simplemente quitar la validación:** `Appointment.serviceId` es `String` (sin `?`) en `prisma/schema.prisma:805` — es un campo obligatorio del esquema, y de él se derivan `locationId`, `modality`, `endsAt` y `priceMxnCents` de la cita. Quitar la validación sin más dejaría `service` indefinido y el `create` fallaría. Hacer `serviceId` opcional requeriría una migración, que el pedido explícitamente pide evitar.
- **Solución elegida:** cuando el médico no tenga ningún `DoctorService` activo, `startWalkIn` crea uno por defecto dentro de la misma transacción (`name: "Consulta general"`, `serviceType: "FOLLOW_UP"`, `durationMinutes: 30`, `priceMxnCents: 0`, `isActive: true`, `locationId: null`) y lo usa igual que un servicio real. Sin migración: `DoctorService` ya admite estos valores con los defaults de esquema (`currency: "MXN"`, `priceVisibility: "PRIVATE"`).
- **Módulos backend afectados:** `scheduling` (`appointment-state-machine.service.ts`, `appointments.controller.ts`), `common/i18n` (limpieza de traducción muerta).
- **Componentes frontend afectados:** ninguno — el frontend solo consume el error vía `ApiError`/`ErrorState`; al dejar de lanzarse, deja de aparecer, sin cambios de código necesarios.
- **Contratos (`packages/contracts`):** no se modifican.
- **Migraciones:** no.
- **Riesgo de regresión:** bajo. Cambio aislado a `startWalkIn`; el flujo normal de agendar desde la agenda (`create()`, que exige que el médico elija un `serviceId` existente) no se toca.

### Decisiones

- **`serviceType: "FOLLOW_UP"`** en vez de `FIRST_VISIT`: walk-in siempre exige un `care_relationship` previo (`ACTIVE`/`EXPIRED`), así que semánticamente es más cercano a un seguimiento que a una primera vez. No cambia `modality` (`modalityForServiceType` solo distingue `TELECONSULTATION`).
- **`priceMxnCents: 0`**: no se inventa un cobro que el médico no definió. Pendiente de que exista una pantalla de gestión de servicios en frontend para que el médico lo ajuste si quiere cobrar.
- **Creación dentro de la transacción** (no antes): evita dejar un `DoctorService` huérfano si la creación de la cita falla después.
- **Edge case aceptado sin resolver:** dos walk-in concurrentes del mismo médico sin servicios previos podrían, en teoría, crear dos `DoctorService` "Consulta general" (no hay unique constraint que lo impida y agregarla exige migración). No se agrega locking adicional para un caso tan raro.

## Pasos de implementación

1. [x] Backend: `startWalkIn` crea el servicio por defecto cuando no hay ninguno; limpieza de `NO_SERVICE_CONFIGURED` en `appointments.controller.ts` (doc OpenAPI) y `messages.en.ts` (traducción muerta); reemplazo del test que esperaba 422 por tests que verifican la creación automática y su reutilización. (commit: `fix(scheduling): crear servicio por defecto en walk-in si el médico no tiene ninguno` — pendiente de que el usuario lo haga, ver nota abajo)

## Criterios de aceptación

- [x] CA-1: un médico sin ningún `DoctorService` puede iniciar una consulta sin cita y la cita se crea en `IN_PROGRESS`.
- [x] CA-2: tras ese walk-in, el médico tiene un `DoctorService` "Consulta general" activo.
- [x] CA-3: un segundo walk-in del mismo médico reutiliza ese mismo servicio (no crea un duplicado).
- [x] CA-4: el flujo normal de agendar desde la agenda, con `serviceId` explícito, no cambia de comportamiento (no se tocó `create()`).

## Plan de pruebas

- Pruebas de integración (`m5a.integration.spec.ts`): reemplazado el caso `422 NO_SERVICE_CONFIGURED` por los CA-1/CA-2/CA-3 de arriba. **No se pudieron correr en este entorno** (sin Docker ni Postgres local disponibles para Testcontainers) — pendiente de correr `pnpm test` con la base de datos levantada.
- Verificado en este entorno: `nest build` del backend (incluye `tsc` de `packages/contracts`) y `next build` del frontend, ambos en verde; `tsc --noEmit` del backend (incluye el archivo de test) sin errores; suite `messages.spec.ts` (i18n, no requiere DB) en verde.
- Sin pruebas E2E nuevas: no hay cambio de UI.

## Resultado final

**Estado:** Completado en código; verificación de la suite de integración pendiente de que el usuario la corra con la base de datos arriba.
**Commits incluidos:** ninguno — el usuario hace los commits/push.
**Pruebas:** 0 backend-integración corridas aquí (sin DB disponible) / 0 frontend / 0 E2E — builds y typecheck en verde, pendiente correr `pnpm test` del backend con Postgres levantado para confirmar los 3 tests nuevos/modificados de `m5a.integration.spec.ts`.
**Notas para el equipo:** `priceMxnCents: 0` en el servicio por defecto es una decisión de producto confirmada con el usuario (no cobrar nada hasta que exista una pantalla de gestión de servicios); si se agrega esa pantalla, considerar si el médico debe poder editar este servicio generado automáticamente.
