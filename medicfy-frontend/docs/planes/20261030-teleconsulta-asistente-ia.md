# Plan: agregar el módulo de IA (Asistente / "El Segundo Lector") al modal de teleconsulta

**Fecha:** 2026-10-30
**Reglas de especificación involucradas:** M7 (Teleconsulta MVP); `especificacion-plataforma-clinica-con-ia.md` §21 Fase 3 (columna de IA, explícitamente dejada fuera de alcance en `20261027-teleconsulta-modal-con-nota.md` por pedido del usuario); Fase 8 · Prompt 53 (pestaña "Asistente" / `AsistenteTab`, ya existente fuera del modal en `ConsultaZona3`).
**Estimación de pasos:** 1 (cambio de UI acotado al frontend, sin tocar backend ni contratos)

## Análisis de impacto

- **Problema reportado:** el médico pidió explícitamente, en `20261027-teleconsulta-modal-con-nota.md`, que la videollamada abriera en modal con la nota clínica real al lado, pero **sin la columna de IA** ("no hay columna de IA, no hay layout de 3 columnas") — eso quedó diferido. Ahora el usuario pide agregarlo: al dar clic en "Iniciar teleconsulta", el módulo de IA (la pestaña "Asistente", ya construido y en uso fuera del modal) no está disponible dentro de la llamada.
- **Decisión de alcance (confirmada con el usuario):** agregar **solo el Asistente** (`AsistenteTab`: banderas rojas, resumen, qué falta, diferenciales, estudios/plan sugerido), no la Zona 3 completa (Hoja frontal/Historia/Notas/Estudios/Resultados). Agregar los 6 tabs completos competiría demasiado por espacio con el video dentro del modal y no es lo que se pidió.
- **Por qué no es "sugerir diagnósticos desde código" (CLAUDE.md §7):** `AsistenteTab` ya existe y está en producción fuera del modal (`consulta-zona3.tsx`); las lecturas las genera el modelo (`claude-model-calls.ts` en el backend), no una regla clínica inventada en este cambio. Este plan solo cambia dónde se puede abrir ese componente ya existente, con disparo manual (el médico presiona "Iniciar IA"), igual que hoy.
- **Módulos backend afectados:** ninguno. Reutiliza `GET/POST /records/encounters/:id/assistant/passes`, ya implementado y ya mockeado en `dev-server.mjs`.
- **Componentes frontend afectados:**
  - `consulta-screen.tsx`: dentro del `Modal` de teleconsulta, agrega un botón para mostrar/ocultar un tercer panel con `AsistenteTab`, montado solo cuando el médico lo abre (carga diferida, mismo patrón que `ConsultaZona3`). No toca el layout normal (fuera del modal, `ConsultaZona3` sigue igual).
  - `teleconsulta.ts` (dictionaries es/en): nuevas claves para el botón de mostrar/ocultar el panel.
- **Contratos (`packages/contracts`):** no se modifican.
- **Migraciones:** no.
- **Riesgo de regresión:** bajo — el panel de IA es un tercer elemento `flex` opcional (se monta solo si el médico lo abre); no cambia el árbol existente de `TeleconsultaVideoPane` + nota cuando está cerrado, que es el caso por omisión.

### Decisiones

- **Panel colapsable, no siempre visible:** por omisión, cerrado — el video y la nota siguen siendo la prioridad dentro de la llamada; el Asistente ya es de disparo manual (Fase 8 · Prompt 53: "v1 — disparo manual únicamente"), así que no hace falta montarlo antes de que el médico lo pida.
- **Mismo componente `AsistenteTab`, sin duplicar lógica:** no se reconstruye el fetch/estado del asistente dentro del modal; se reutiliza el componente tal cual, con `encounterId`/`accessToken` que `ConsultaScreen` ya tiene en alcance.
- **Sin persistencia de la preferencia (abierto/cerrado):** a diferencia de `ConsultaZona3` (que recuerda la pestaña por médico en `localStorage`), este toggle es estado efímero del modal — es una superficie nueva y angosta, no vale la pena la complejidad de persistirla todavía.

## Pasos de implementación

1. [x] Frontend: agregar botón de mostrar/ocultar y tercer panel con `AsistenteTab` dentro del `Modal` de teleconsulta en `consulta-screen.tsx`; nuevas claves i18n (es/en) en `teleconsulta.ts`; prueba E2E que cubre abrir el panel dentro del modal. (commit: `feat(frontend): agregar el asistente de IA al modal de teleconsulta`)

## Criterios de aceptación

- [x] CA-1: dentro del modal de teleconsulta hay un botón visible para mostrar el Asistente (IA).
- [x] CA-2: al mostrarlo, aparece el mismo componente `AsistenteTab` que ya existe fuera del modal (mismo botón "Iniciar IA", misma explicación, mismas lecturas).
- [x] CA-3: ocultarlo desmonta el panel (no queda compitiendo por espacio cuando no se usa); el video y la nota no cambian de comportamiento.
- [x] CA-4: fuera del modal (layout normal), `ConsultaZona3` sigue mostrando sus 6 pestañas igual que antes — sin cambios.

## Plan de pruebas

- Prueba E2E (Playwright, `e2e/teleconsulta.spec.ts`): dentro del modal, abrir el panel del Asistente y verificar que el botón "Iniciar IA" (texto ya existente de `AsistenteTab`) se vuelve visible, y que ocultarlo lo desmonta. **No se pudo ejecutar en este entorno** (igual que el resto de la suite E2E de este módulo: `global-setup.ts` siembra datos vía `psql` contra Postgres real, no disponible aquí).
- Sin pruebas de integración de backend: no se tocó el backend.
- Verificado en este entorno: `tsc --noEmit` limpio, suite completa de Vitest en verde (14/14 archivos, 62/62 pruebas — sin regresiones), `next build` en verde.

## Resultado final

**Estado:** Completado en código; spec E2E nuevo pendiente de correrse con el entorno completo (Docker/Postgres) que no está disponible aquí — mismo límite que el plan del 2026-10-27.
**Commits incluidos:** pendiente (el usuario decide si commitea, misma sesión).
**Pruebas:** 0 de componente nuevas (se reutiliza `AsistenteTab`, ya cubierto donde se usa fuera del modal) / 1 E2E nueva escrita, no corrida aquí — `tsc`, Vitest (62/62) y `next build` en verde.
**Notas para el equipo:** se agregó el panel del Asistente (IA) dentro del modal de teleconsulta, colapsable y de carga diferida, reutilizando `AsistenteTab` sin duplicar su lógica. Queda fuera de alcance (no se pidió) la Zona 3 completa (Hoja frontal/Historia/Notas/Estudios/Resultados) dentro del modal — el usuario confirmó explícitamente que solo quería el Asistente.
