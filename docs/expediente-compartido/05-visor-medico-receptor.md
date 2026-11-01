# PR-EXP-05 · Visor de sólo lectura del médico receptor

**Fecha:** 2026-10-31
**Reglas de especificación involucradas:** R4, R8, RE4, RE7; D-EXP-07.
**Input:** `SharedSummaryService` (PR-EXP-04), `RecordShareGrant` (PR-EXP-01).

## Decisiones (antes de escribir código)

1. **`SharedRecordGuard` NO extiende ni compone `CareRelationshipGuard`** — mismo motivo ya documentado en PR-EXP-01 §2 (ese guard da paridad completa con el médico tratante). Guard nuevo, independiente, que solo entiende `RecordShareGrant`.
2. **"Recurso fuera de alcance → 403" se modela con endpoints DEDICADOS por sección**, no con un solo endpoint que devuelva `null` en las secciones no otorgadas. `GET /record-share/grants/:grantId` (SUMMARY, siempre permitido si el grant es válido) + `GET .../notes` (exige `SIGNED_NOTES`), `.../results` (exige `RESULTS`), `.../prescriptions` (exige `PRESCRIPTIONS`), `.../study-orders` (exige `STUDY_ORDERS`) — cada uno responde 403 genérico si el grant no incluye ese alcance. El chequeo de alcance vive en el controlador (una línea por endpoint); no se introduce un decorador + `Reflector` nuevo (no hay precedente en el repo y son solo 4 rutas — la abstracción no se paga sola todavía).
3. **Expiración perezosa, mismo patrón que `CareRelationshipService`**: el guard revisa `expiresAt` en cada request y recién ahí marca `EXPIRED` si ya pasó — sin scheduler (00-DESCUBRIMIENTO.md Q10).
4. **El visor SÍ necesita mostrar la identidad del paciente** (nombre, fecha de nacimiento) — a diferencia de PR-EXP-02/03 (donde ocultarla es RE5), aquí el acceso YA fue autorizado por el paciente; ocultar su nombre al médico que ya tiene permiso no protegería nada y haría el visor inusable. Se incluye en la respuesta del grant, nunca en la URL (RE9 sigue aplicando a logs/URLs, no a la respuesta JSON autenticada).
5. **"Traer al propio expediente"/escribir desde el visor: fuera de alcance, confirmado ⚠️** — ningún endpoint de escritura de este track acepta un `grantId`; los endpoints existentes de escritura (recetas, notas, etc.) siguen exigiendo `CareRelationshipGuard` con una relación real, que un grant no otorga.
6. **Capturas de pantalla: no se pueden impedir técnicamente** — declarado aquí explícitamente, como exige la letra, no se intenta construir nada contra eso (DRM/watermarking forense queda fuera de alcance del MVP).

## Pasos de implementación

1. [x] `SharedRecordGuard` (+ `SharedRecordRequest` con `shareGrant` adjunto) — valida existencia/dueño/estado/vigencia, `SHARE_ACCESS_DENIED` en cualquier falla.
2. [x] `RecordShareViewerService` + `RecordShareViewerController`: `GET /record-share/grants/mine`, `GET /record-share/grants/:grantId` (+ secciones por alcance), todos `GET`, todos tras `SharedRecordGuard` salvo `mine`. `SHARE_VIEWED` en cada apertura, con la lista de secciones presentes.
3. [x] Contratos (`recordShareGrantSummarySchema`, `recordShareGrantMineSchema`) en ambos monorepos.
4. [x] Pruebas backend: integración (no ejecutable aquí, mismo bloqueador de Postgres) cubriendo el criterio de terminación completo.
5. [x] Frontend: "Compartidos conmigo" (bandeja) + visor de sólo lectura (estructura Zona 1, marca de agua, aviso de impresión, sin edición), nav, i18n, pruebas de componente — ejecutables aquí.
6. [x] Documentación + informe de 7 puntos.

## Criterios de aceptación (texto literal del prompt maestro)

- [x] IDOR: el médico B no puede abrir un grant del médico C.
- [x] Un grant vencido da 403 aunque la interfaz siga abierta (prueba que avanza el reloj).
- [x] Un grant revocado da 403.
- [x] Un recurso fuera de alcance da 403 (endpoints dedicados por sección, decisión §2).
- [x] Ningún método de escritura funciona (confirmado por diseño — ver decisión §5).
- [x] `SHARE_VIEWED` se registra.
- [ ] E2E en tableta 1280×800 — **no ejecutable en este entorno** (requiere Postgres real + servidores levantados, mismo límite que el resto del track); se deja la prueba de componente equivalente (alergias visibles sin scroll simulado vía layout, no vía Playwright real).

## Fix encontrado al correr la suite completa (no solo la del módulo)

`messages.spec.ts` (fuera de este track) escanea TODO el código en busca de `new ApiException(...)` y exige que cada mensaje literal tenga traducción en `messages.en.ts` — las 13 excepciones nuevas de PR-EXP-02/03/05 no la tenían, y esa prueba (ajena al track) empezó a fallar. **Fix:** se agregaron las 13 traducciones a `messages.en.ts`. Encontrado únicamente porque se corrió `pnpm test` completo después de esta fase, no solo las pruebas del módulo — recordatorio de por qué vale la pena correr la suite entera en cada cierre, aunque la mayoría de los archivos no tengan nada que ver con este track.

(Aparte: `business-hours.spec.ts` falló una vez por tiempo límite bajo carga de la máquina — en verde al correrlo aislado, 3.7s contra un límite de 10s; no relacionado con este track, ruido del entorno.)

## Plan de pruebas

- Backend: `record-share-viewer.integration.spec.ts` — no ejecutable aquí (sin Postgres); escrito, tipado.
- Frontend: pruebas de componente de la bandeja y el visor — ejecutables aquí.
