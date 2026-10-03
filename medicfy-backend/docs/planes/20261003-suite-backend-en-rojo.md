# Plan: devolver la suite del backend a verde (throttler global + BigInt en audit_log)

**Fecha:** 2026-10-03
**Reglas de especificación involucradas:** M15-RN-010 (rate limiting), M15-RN-002 (encadenamiento de hashes en audit_log), M13-CA-003 / M13-RN-005 (antigüedad de la cola de verificación), R3 (toda lectura de dato clínico se audita)
**Estimación de pasos:** 3 commits de código + 1 de cierre

## Contexto

Al preparar el push de 37 commits acumulados en `main`, la suite del backend
quedó en rojo: **71 pruebas fallidas de 446, en 8 archivos de integración**.
Ninguno de los dos fallos es ruido de entorno — ambos vienen de código ya
commiteado pero todavía sin subir.

Nota de entorno (no es parte del cambio, pero explica por qué esto no se
detectó antes): `medicfy-backend/node_modules` tenía binarios de **Linux**
en una máquina **darwin-arm64**, efecto de instalar con `--ignore-scripts`
como indica CLAUDE.md §9. Con ese árbol, `vitest` ni siquiera arranca
(`@esbuild/darwin-arm64` ausente), así que la suite llevaba tiempo sin poder
ejecutarse localmente. Se corrigió con un `pnpm install` normal.

## Análisis de impacto

- **Módulos backend afectados:** `app.module.ts` (configuración del
  ThrottlerModule), `modules/identity/services/audit.service.ts` (proyección
  de filas de `audit_log`).
- **Componentes frontend afectados:** ninguno. `/auditoria` ya lee los campos
  que se conservan (`id`, `occurredAt`, `actorRole`, `action`, `patientId`,
  `ipAddress`, `result`) y nunca usa `sequence`.
- **Contratos modificados:** no. El endpoint no tiene esquema Zod en
  `packages/contracts`; el frontend valida la forma en runtime.
- **Migraciones necesarias:** no.
- **Riesgo de regresión:** bajo — ambos cambios son acotados y quedan
  cubiertos por pruebas. El del throttler toca solo la rama de entorno de
  prueba; producción y desarrollo no cambian de comportamiento.

### Fallo 1 — el ThrottlerGuard global estrangula la suite de integración

66 de los 71 fallos son `expected 429 to be 201`. El commit `5753b42` registró
`ThrottlerGuard` como `APP_GUARD` global con `AuthThrottle` de 10/min, pero solo
añadió un spec unitario del mecanismo (`rate-limit.spec.ts`): no adaptó ninguno
de los 8 archivos de integración. Esos tests registran y autentican usuarios
muchas veces seguidas contra la misma IP, agotan el cupo y reciben 429 donde
esperan 201/200.

El límite se comparte entre pruebas porque `getTracker` agrupa por IP cuando la
ruta todavía no está autenticada — exactamente lo que hacen `/auth/register` y
`/auth/login`, que es por donde entra casi toda prueba de integración.

### Fallo 2 — `sequence BigInt?` rompe la serialización JSON de `audit_log`

`TypeError: Do not know how to serialize a BigInt`, capturado por
`ApiExceptionFilter` y convertido en **500**.

La migración de M15-RN-002 añadió `sequence BigInt?` al modelo `AuditLog`.
`AuditService.listForDoctorPatients()` y `AuditService.listForPatient()`
devuelven las filas de Prisma tal cual, y `res.json()` no sabe serializar un
`BigInt`. Afecta a dos endpoints reales:

- `GET /doctors/me/patient-access-log` — el panel "quién ha visto a mis
  pacientes" (pantalla `/auditoria`).
- `GET` de bitácora por paciente en `patient-clinical.controller.ts`.

**Esto no es un artefacto de pruebas: es un 500 en producción.** Cualquier
médico que abra `/auditoria` con filas ya encadenadas recibe un error en vez de
su bitácora. Como R3 obliga a registrar toda lectura clínica, las filas con
`sequence` no nulo son la norma, no la excepción.

### Fallo 3 — `businessHoursSince` construye un `Intl.DateTimeFormat` por hora

Descubierto al ejecutar la suite ya con los pasos 1 y 2 aplicados: el último
fallo no era un 429 sino un **timeout de 5 s** en `GET /admin/metrics`. No lo
causaba la base —las seis agregaciones del endpoint tardan ~10 ms medidas
directamente en psql— sino `businessHoursSince` (commit `504779c`, M13-CA-003).

La función avanza **hora por hora** desde la fecha de alta y construye un
`Intl.DateTimeFormat` **nuevo en cada iteración** para saber si ese instante
cae en sábado o domingo. Construir un formateador de `Intl` es caro; hacerlo
por hora transcurrida lo es mucho más.

`AdminMetricsService.getMetrics()` la llama **una vez por médico en cola**.
Medido en esta máquina, con la cola real de la base de desarrollo (7,642
médicos, el más antiguo del 2026-08-13):

| | un médico (51 días) | extrapolado a 7,642 |
|---|---|---|
| formateador por hora (actual) | 31 ms | **237 s** |
| formateador compartido | ~0 ms | ~0 s |

Ambas variantes devuelven el mismo número (875 horas hábiles), así que izar el
formateador a nivel de módulo es un cambio sin efecto sobre el resultado.

**Esto también es un bug de producción, no residuo de pruebas.** El costo crece
con el tamaño de la cola multiplicado por la antigüedad de cada solicitud:
justo las dos cosas que aumentan cuando la verificación se retrasa, que es
precisamente cuando el admin necesita el panel. Un médico esperando un año son
~8,760 iteraciones solo para él.

## Pasos de implementación

1. [x] Paso 1 — `audit.service.ts`: proyectar `sequence` (BigInt) a `string`
   antes de devolver las filas, en los dos métodos de listado. Se conserva el
   campo (no se omite) para no perder información que el verificador de cadena
   pueda necesitar; `string` es la representación JSON habitual de un entero de
   64 bits. Prueba primero: extender `note-integrity.integration.spec.ts` para
   exigir 200 y `typeof sequence === "string"`.
   (commit: `fix(identity): serializar sequence de audit_log como string`)
2. [x] Paso 2 — `app.module.ts`: añadir `skipIf` al `ThrottlerModule` para
   desactivar el limitador cuando `NODE_ENV === "test"`. Verificado que vitest
   fija `NODE_ENV=test` y que `.env` deja `development` fuera de pruebas, así
   que producción y desarrollo quedan intactos. La cobertura del mecanismo la
   sigue dando `rate-limit.spec.ts`, que levanta su propio módulo con su propio
   guard y por tanto **no** se ve afectado por `skipIf`.
   (commit: `fix(security): no aplicar el rate limiting en entorno de pruebas`)

3. [ ] Paso 3 — `business-hours.util.ts`: izar el `Intl.DateTimeFormat` a una
   constante de módulo y reutilizarlo, en vez de construir uno por iteración.
   Prueba primero: un test que fija la equivalencia con la implementación
   anterior sobre rangos variados y acota el tiempo de una cola grande.
   (commit: `fix(admin): reutilizar el formateador de Intl en businessHoursSince`)

## Criterios de aceptación

- [ ] CA-1: `GET /doctors/me/patient-access-log` responde 200 con filas que
      tienen `sequence` no nulo, y `sequence` llega como `string`.
- [ ] CA-2: Los 8 archivos de integración que fallaban dejan de recibir 429.
- [ ] CA-3: `rate-limit.spec.ts` sigue en verde — el mecanismo de 429 se sigue
      verificando pese al `skipIf`.
- [ ] CA-4: La suite completa del backend queda en verde (0 fallidas).
- [ ] CA-7: `GET /admin/metrics` responde dentro del timeout por defecto de
      vitest (5 s) con la cola real de la base de desarrollo, y
      `businessHoursSince` devuelve exactamente los mismos valores que antes.
- [ ] CA-5: La suite del frontend sigue en verde.
- [ ] CA-6: `/auditoria` carga la bitácora en la app real sin 500.

## Plan de pruebas

- **Pruebas de integración:** `note-integrity.integration.spec.ts` amplía la
  prueba del panel para fijar el tipo serializado de `sequence`. Los otros 7
  archivos sirven de verificación de regresión del `skipIf`.
- **Pruebas unitarias:** `rate-limit.spec.ts` queda como está, y su permanencia
  en verde es justamente la prueba de que `skipIf` no apagó el mecanismo.
- **Pruebas negativas:** `rate-limit.spec.ts` sigue exigiendo 429 tras superar
  el límite — es la prueba de que el limitador no quedó desactivado de más.
- **Verificación manual:** levantar la app y abrir `/auditoria` contra el
  backend real (no el mock) para confirmar CA-6 de punta a punta.
