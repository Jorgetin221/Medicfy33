# Plan: teleconsulta en modal, con la nota clínica visible junto al video

**Fecha:** 2026-10-27
**Reglas de especificación involucradas:** M7 (Teleconsulta MVP — "no construimos WebRTC propio"); layout video+consulta de `especificacion-plataforma-clinica-con-ia.md` §21, marcado como Fase 3 (futuro) — **esta tarea adelanta explícitamente, por pedido directo del usuario, solo la parte "nota visible junto al video" de esa Fase 3, no el resto (no hay columna de IA, no hay layout de 3 columnas)**; DOC-06 (CLAUDE.md §6 — la nota nunca debe quedar inaccesible; autoguardado, "perder texto clínico por un fallo de red es el peor bug posible").
**Estimación de pasos:** 1 (cambio de UI acotado al frontend, sin tocar backend ni contratos)

## Análisis de impacto

- **Problema reportado:** al dar clic en "Iniciar teleconsulta", el panel (`teleconsulta-panel.tsx`) se expandía inline arriba de `<main>`, empujando la nota clínica fuera de vista ("se hace la pantalla para arriba"). El usuario pide que sea un modal, con un "entorno de videollamada completo" (permisos de cámara/micrófono, controles de llamada) y con notas.
- **Por qué no se construye un WebRTC propio:** la especificación del MVP (citada en `medicfy-backend/docs/planes/20261026-teleconsulta-mvp.md`) dice literalmente "no construimos WebRTC propio" — la videollamada vive en un iframe de proveedor externo (Daily.co) que ya pide permisos de cámara/micrófono (`allow="camera; microphone; fullscreen; display-capture"`) y ya dibuja sus propios controles (mute, cámara, colgar). Eso ya es "el entorno de llamada"; no se duplica.
- **Por qué sí se construye la nota junto al video:** confirmado explícitamente con el usuario que las "notas" deben ser la nota clínica real de DOC-06 (no un bloc efímero), visible mientras dura la llamada. Esto es, literalmente, el elemento central del layout marcado como Fase 3 — se adelanta solo esa pieza, por pedido explícito, no el resto de Fase 3 (sin columna de IA).
- **Módulos backend afectados:** ninguno. El endpoint `POST /appointments/:id/video-room` no cambia.
- **Componentes frontend afectados:**
  - `teleconsulta-panel.tsx` + su spec se eliminan, reemplazados por:
    - `teleconsulta-button.tsx` (barra delgada con el botón "Iniciar teleconsulta", sin estado propio — lo controla `ConsultaScreen`).
    - `teleconsulta-video-pane.tsx` (la lógica de pedir el enlace y mostrar loading/error/no-disponible/iframe, ya sin el toggle de abrir/cerrar que antes tenía).
  - `consulta-screen.tsx`: sube el estado `callOpen`; cuando está en `true`, usa el componente `Modal` (`size="full"`, el mismo que ya usa `AtlasModal`) con dos paneles: `TeleconsultaVideoPane` + la nota (la misma `ConsultaForm`/vista de solo lectura que ya se mostraba en `<main>`, extraída a una variable `centerContent` para no duplicar JSX). Cuando está en `false`, el layout normal de 3 columnas se queda igual que hoy.
  - `use-encounter-autosave.ts` no cambia — se reutiliza `flushEncounterDraft(encounterId)`, ya exportado, para forzar el guardado antes de alternar entre los dos layouts (el toggle re-monta `ConsultaForm`, y sin este flush se podría perder hasta 2s de texto sin guardar — exactamente lo que CLAUDE.md §5 prohíbe).
  - Comentario desactualizado en `es/teleconsulta.ts` (mencionaba una pantalla `/teleconsulta/[appointmentId]` que nunca se construyó) se corrige.
- **Contratos (`packages/contracts`):** no se modifican.
- **Migraciones:** no.
- **Riesgo de regresión:** medio — se reestructura cómo se monta `ConsultaForm` (antes: siempre en `<main>`; ahora: en `<main>` o dentro del `Modal`, nunca ambos a la vez). El riesgo real es pérdida de texto no guardado al alternar; se mitiga con el flush explícito antes de cada toggle. `ConsultaForm` ya está diseñado para sobrevivir un remount (recupera de `encounter.draftContent`/IndexedDB), así que remount en sí no es el problema — el problema sería solo el debounce de 2s sin flush, que es justo lo que se añade.

### Decisiones

- **Modal reutilizado, no uno nuevo:** mismo componente (`components/ui/modal.tsx`, `size="full"`) que ya usa `AtlasModal` para el visor 3D/PDF — consistencia visual y de accesibilidad (foco, Escape, scroll bloqueado) ya resuelta, sin reinventarla.
- **Sin pantalla nueva de permisos de cámara/micrófono:** el iframe del proveedor ya los pide. Añadir una capa propia sería trabajo duplicado y, además, contradice la decisión explícita del MVP de no construir WebRTC propio.
- **Proveedor de videollamada:** sigue siendo Daily.co. La pregunta del usuario sobre Teams/proveedor propio queda explícitamente pendiente para una decisión posterior, por su propio pedido ("luego vemos").
- **El trigger bar (`TeleconsultaButton`) se oculta mientras el modal está abierto** — ya no tiene función (el modal tiene su propio cierre vía ✕/Escape/clic fuera).

## Pasos de implementación

1. [x] Frontend: `teleconsulta-button.tsx`, `teleconsulta-video-pane.tsx` (+ specs), eliminar `teleconsulta-panel.tsx`/spec, reestructurar `consulta-screen.tsx` para usar `Modal` con el video y la nota real como paneles, flush de autoguardado antes de alternar, corregir comentario desactualizado y quitar clave muerta (`ocultar`) en `es/en teleconsulta.ts`. Agregar spec E2E de Playwright para el flujo (no ejecutable en este entorno — sin Docker/Postgres). (commit: `feat(frontend): teleconsulta en modal con la nota clínica visible junto al video` — pendiente de que el usuario lo haga, no se hizo ningún commit aquí)

## Criterios de aceptación

- [x] CA-1: clic en "Iniciar teleconsulta" abre un modal (no empuja la página) con el video a un lado y la nota clínica real (editable, con autoguardado) al otro.
- [x] CA-2: cerrar el modal (✕, Escape, o clic fuera) regresa al layout de 3 columnas de siempre, sin perder el contenido de la nota (verificado en el spec E2E nuevo, no ejecutado en este entorno).
- [x] CA-3: el iframe del proveedor sigue pidiendo cámara/micrófono (`allow` intacto) y los estados de carga/error/no-disponible/sin-conexión se conservan igual que antes (cubierto por `teleconsulta-video-pane.spec.tsx`).
- [x] CA-4: alternar entre modal y layout normal no pierde texto no guardado (flush antes de cada toggle vía `flushEncounterDraft`).

## Plan de pruebas

- Pruebas de componente (Vitest + Testing Library): `teleconsulta-video-pane.spec.tsx` (loading/ready/error/no-disponible/sin-conexión, migradas de `teleconsulta-panel.spec.tsx`), `teleconsulta-button.spec.tsx` (render + onClick). **Corridas en este entorno: en verde** (suite completa del frontend: 14 archivos / 62 pruebas, incluidas las 5 nuevas).
- Prueba E2E (Playwright, `e2e/teleconsulta.spec.ts`): abrir el modal desde DOC-06, escribir en la nota dentro del modal, verificar autoguardado, cerrar y verificar que el contenido sobrevive en el layout normal. **No se pudo ejecutar en este entorno** (sin Docker/Postgres) — pendiente de correrla con el entorno completo levantado.
- Sin migraciones ni cambios de contrato: no aplica prueba de integración de backend.
- Verificado en este entorno: `next build` (`@medicfy/web`, incluye `tsc` de `packages/contracts`) en verde.

## Resultado final

**Estado:** Completado en código; spec E2E nuevo pendiente de correrse con el entorno completo (Docker/Postgres) que no está disponible aquí.
**Commits incluidos:** ninguno — el usuario hace los commits/push (pedido explícito, misma sesión).
**Pruebas:** 5 de componente nuevas/adaptadas (en verde) / 0 E2E corridas aquí (spec nuevo escrito, sin Docker/Postgres para ejecutarlo) — build y typecheck del frontend en verde.
**Notas para el equipo:** se adelantó, por pedido explícito del usuario, la pieza "nota visible junto al video" del layout que `especificacion-plataforma-clinica-con-ia.md` §21 marca como Fase 3 — el resto de esa Fase 3 (columna de IA, layout de 3 columnas) sigue fuera de alcance. El proveedor de videollamada sigue siendo Daily.co; la pregunta del usuario sobre Teams/proveedor propio queda pendiente de una decisión posterior.

## Fix post-implementación (mismo día): barra de firma rota dentro del modal

Al probarlo, la barra de "Guardado / Cerrar sin nota clínica / Firmar y cerrar consulta" aparecía flotando fuera de la caja del modal, superpuesta con el dock del sistema. Causa: esa barra es `position: fixed` al viewport real (`consulta-form.tsx`), con un offset `md:left-[var(--app-rail-width,0px)]` pensado para esquivar el rail de navegación de la pantalla normal. `position: fixed` no respeta el contenedor del modal (la variable CSS del rail, además, se publica en `document.documentElement`, así que seguía aplicando el offset del rail incluso sin rail visible).

**Fix:** nuevo prop `insideModal` en `ConsultaForm` (`consulta-form.tsx`), pasado como `insideModal={callOpen}` desde `consulta-screen.tsx`. Cuando es `true`, la barra usa `sticky bottom-0` (se ancla al contenedor con scroll que ya la envuelve dentro del modal) en vez de `fixed` + offset de rail. Sin cambios al componente `Modal` compartido (evita efectos secundarios en `AtlasModal`/`ConfirmDialog`, que también lo usan). Verificado: `tsc --noEmit` limpio, suite completa de Vitest en verde (14/14 archivos, 62/62 pruebas).

**Nota aparte, no es un bug:** "Teleconsulta no disponible" es la respuesta `NOT_CONFIGURED` esperada — no hay `DAILY_API_KEY` en el `.env` local (ver `dev-server.mjs`, `dailyConfigured()`). Pendiente de que el usuario decida si configura una cuenta de Daily.co de prueba para ver video real en desarrollo.

## Fix post-implementación #2 (mismo día): espacio muerto bajo la barra de firma

Con la nota corta (pocos campos llenos), la barra de firma quedaba a la mitad del panel con un hueco en blanco debajo hasta el borde del modal — `sticky` solo ancla cuando el contenido alcanza a desbordar su contenedor; con contenido corto no hace nada, se queda donde cae en el flujo normal.

**Fix:** se separó el scroll del footer. `ConsultaForm` (`consulta-form.tsx`), cuando `insideModal`, envuelve el contenido de la nota (tarjeta de encabezado, aviso de conflicto, barra de plantillas, `<form>`) en su propio contenedor `flex-1 overflow-y-auto` — ese div es el único que hace scroll — y dejó el footer como hermano `shrink-0` fuera de él, así que siempre queda pegado al fondo del panel sin importar cuánto mida la nota. En la pantalla normal ese mismo div envolvente usa `display: contents` (no cambia nada del layout existente). `consulta-screen.tsx` dejó de ponerle scroll al contenedor exterior cuando la fase es `"ready"` (ConsultaForm ya lo maneja); lo sigue haciendo en fase `"readonly"`, donde `EmisionDocumentos`/`ConsultaReadonly` no manejan scroll propio. Verificado: `tsc --noEmit` limpio, 14/14 archivos y 62/62 pruebas de Vitest en verde.

## Fix post-implementación #3 (mismo día): Daily.co pide tarjeta — fallback gratuito a Jitsi Meet

El usuario creó una cuenta de Daily.co, pero el dashboard le pidió tarjeta de crédito para seguir, aunque el uso entraba en el tier gratuito. Pidió una alternativa 100% gratis sin tarjeta.

**Fix (en `medicfy-backend`, no en el frontend):** nuevo `JitsiVideoProviderAdapter` (`apps/api/src/modules/scheduling/services/jitsi-video-provider.adapter.ts` + spec) que implementa el mismo `VideoProviderPort` que ya usaba `DailyVideoProviderAdapter` — Jitsi Meet público (`meet.jit.si`, operado por 8x8) no necesita API key ni llamada HTTP para crear la sala: el cuarto nace solo cuando alguien entra a la URL determinista `https://meet.jit.si/medicfy-{appointmentId}`. `scheduling.module.ts` ahora elige el adaptador según si `DAILY_API_KEY` está presente; `dev-server.mjs` (mock) tiene el mismo fallback en `openJitsiRoom()`. La clave de Daily.co que el usuario pegó se dejó **comentada** en `.env` (esa cuenta no sirve para llamadas reales sin tarjeta) — descomentar cuando/si agrega una tarjeta.

**Advertencia explícita dejada en el código (`PENDIENTE(jorge)`):** `meet.jit.si` es el servidor público de la comunidad — no es HIPAA-ready, no hay BAA con 8x8, a diferencia de Daily.co/LiveKit Cloud que pide la especificación (§4). Sirve para desarrollo/pruebas; para producción con pacientes reales hace falta Daily.co con tarjeta o un Jitsi autoalojado con el acuerdo correspondiente.

Verificado: `nest build` en verde, specs nuevos (`jitsi-video-provider.adapter.spec.ts`) y existentes (`daily-video-provider.adapter.spec.ts`, `teleconsultation.service.spec.ts`) en verde — estos últimos no se vieron afectados porque inyectan su propio doble del puerto, no pasan por `scheduling.module.ts`. La integración (`m7-teleconsultation.integration.spec.ts`) tampoco se ve afectada: hace `overrideProvider(VIDEO_PROVIDER_PORT)`.
