# Plan: integrar el Atlas Anatómico 3D en el expediente del paciente (ventana emergente)

**Fecha:** 2026-10-14
**Reglas de especificación involucradas:** R2 (nada clínico por canal externo), R3 (auditoría de acceso), R4 / AUTH-RN-001 / M8-RN-004 (sin `care_relationship` no hay acceso)
**Fuente de la integración:** `~/Desktop/3d-Anatamics/docs/INTEGRATION_GUIDE.md` (§2 flujo, §3 backend, §4 página, §6 seguridad, §7 pendientes en Medicfy)
**Estimación de pasos:** 4

## Análisis de impacto

- **Backend:** módulo nuevo `modules/atlas` (puerto + adaptador HTTP contra la API del atlas, servicio de sesiones, controller detrás de `JwtAuthGuard` + `CareRelationshipGuard`). Variables de entorno nuevas, todas opcionales: `ATLAS_API_URL`, `ATLAS_VIEWER_URL`, `ATLAS_CLIENT_ID`, `ATLAS_CLIENT_SECRET`. Sin ellas el módulo se degrada a "no disponible" (mismo patrón que `ANTHROPIC_API_KEY`).
- **Mock (`dev-server.mjs`):** mismos dos endpoints, hablando con la API real del atlas si hay credenciales en el entorno.
- **Frontend:** botón "Atlas anatómico 3D" en el encabezado del expediente (`/pacientes/[id]`) que abre una **ventana emergente centrada** (no panel lateral, pedido explícito del usuario). Copia local del `@atlas/viewer-sdk` (mismo criterio que `packages/contracts`: duplicado a mano, sin workspace compartido).
- **Contratos:** sí, `schemas/atlas.schema.ts` en ambos repos.
- **Migraciones:** no. El atlas guarda sus propias sesiones; Medicfy no persiste nada nuevo.
- **Riesgo de regresión:** bajo. Todo es aditivo y opcional.

### Decisiones

- **Paso 0 (guía §2) = `CareRelationshipGuard`.** Ninguna sesión se pide al atlas sin vínculo activo.
- **Al atlas solo viaja el UUID del paciente** (`patient.id`), nunca folio `MDF-…`, nombre, CURP ni fecha de nacimiento (guía §3, R2). `practitionerRef` = `doctor.id`, nunca el nombre.
- **El `launchCode` solo viaja de vuelta al navegador** y de ahí al iframe por `postMessage` (lo hace el SDK). El secreto del cliente nunca sale del servidor.
- **Revocar al cerrar** la ventana (guía §6). Solo puede revocar el mismo médico que creó la sesión, para el mismo paciente.
- **Modal y §3.5 de UX:** la prohibición de modales es para *formularios clínicos*. El atlas es un visor, sin captura de texto clínico en Medicfy, así que aplica la ventana emergente que pidió el usuario.

### Fuera de alcance (PENDIENTE)

- **Envío de diagnósticos como hallazgos (guía §2 paso 2 y §7.4–7.5).** Exige elegir estructura anatómica y lateralidad por diagnóstico, y Medicfy hoy no captura ninguna de las dos. La guía lo deja explícitamente como decisión abierta y CLAUDE.md §7 prohíbe inventarla. El visor se abre por paciente sin hallazgos precargados; el médico puede anotar en él.
  `PENDIENTE(jorge): ¿la estructura y el lado se capturan como campo nuevo del diagnóstico o se confirman en el visor? Ref: INTEGRATION_GUIDE §5/§7.4`
- Política CSP de Medicfy: hoy no hay; si se añade, permitir `frame-src` hacia el visor (guía §7.6).
- Alta del cliente real de Medicfy en el atlas (hoy se usa el cliente de demostración del seed en local).

## Pasos de implementación

1. [x] Contrato `atlas.schema.ts` (backend y frontend).
2. [x] Backend: módulo `atlas` + env + pruebas unitarias del servicio y del adaptador.
3. [x] Mock: endpoints equivalentes en `dev-server.mjs`.
4. [x] Frontend: SDK del visor, ventana emergente, botón en el expediente, i18n es/en, pruebas.

## Criterios de aceptación

- [ ] CA-1: sin `care_relationship` → 403 y nunca se llama al atlas (cubierto por `CareRelationshipGuard`, ya probado en otros módulos; la prueba de integración propia queda pendiente de PostgreSQL local).
- [x] CA-2: sin credenciales del atlas → `{ kind: "unavailable" }`, la ventana lo explica y el resto del expediente sigue funcionando.
- [x] CA-3: con credenciales → la ventana carga el visor 3D del paciente.
- [x] CA-4: cerrar la ventana revoca la sesión en el atlas.
- [x] CA-5: la ventana tiene sus cuatro estados (cargando, error, no disponible, sin conexión), se cierra con Esc y devuelve el foco.

## Plan de pruebas

- Unitarias backend: `AtlasSessionService` (no configurado, error del atlas, éxito, revocación ajena rechazada) y `AtlasHttpAdapter` (token, cuerpo de las llamadas, nada de datos de identidad).
- Frontend (Vitest + Testing Library): estados de la ventana y cierre.
- Integración del endpoint con PostgreSQL: pendiente, no hay PostgreSQL en este equipo.

## Resultado final
**Estado:** Implementado y commiteado (2026-10-14). Botón y título visibles como "Atlas Anatómico 3D BETA" / "3D Anatomy Atlas BETA".
**Pruebas:** 10 backend unitarias (atlas) / 10 frontend (5 nuevas) en verde. Verificación de punta a punta en Chrome contra el atlas local (mock :3001 → API del atlas :4000 → visor :3300 incrustado en :3000): la ventana abre, el canje del launchCode funciona, el visor llega a `atlas:ready`, Esc cierra y la sesión se revoca.
**No ejecutado:** `*.integration.spec.ts` del endpoint (no hay PostgreSQL en este equipo) ni E2E de Playwright del repo.
**Notas para el equipo:**
- El visor del atlas debe arrancar con `EMBED_PARENT_ORIGINS` que incluya el origen de Medicfy (`http://localhost:3000` en local); si no, su `frame-ancestors` bloquea el iframe.
- El atlas local no tiene archivos `.glb` (están en su `.gitignore` y se regeneran con `tools/model-pipeline`): el visor abre pero sin mallas ("No se pudo conectar con el servicio del atlas" en cada sistema). No es un fallo de la integración.
- Esc no cierra la ventana mientras el foco está dentro del iframe (el navegador no propaga el teclado del iframe a la página); el botón ✕ siempre funciona.
- En desarrollo, StrictMode monta la ventana dos veces: se crea una sesión extra que se revoca de inmediato.
- PENDIENTE(jorge): envío de diagnósticos como hallazgos (estructura + lateralidad), ver "Fuera de alcance".
