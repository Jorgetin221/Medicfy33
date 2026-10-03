# Plan: devolver la suite del backend a verde (throttler global + BigInt en audit_log)

**Fecha:** 2026-10-03
**Reglas de especificación involucradas:** M15-RN-010 (rate limiting), M15-RN-002 (encadenamiento de hashes en audit_log), R3 (toda lectura de dato clínico se audita)
**Estimación de pasos:** 2 commits de código + 1 de cierre

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

## Pasos de implementación

1. [ ] Paso 1 — `audit.service.ts`: proyectar `sequence` (BigInt) a `string`
   antes de devolver las filas, en los dos métodos de listado. Se conserva el
   campo (no se omite) para no perder información que el verificador de cadena
   pueda necesitar; `string` es la representación JSON habitual de un entero de
   64 bits. Prueba primero: extender `note-integrity.integration.spec.ts` para
   exigir 200 y `typeof sequence === "string"`.
   (commit: `fix(identity): serializar sequence de audit_log como string`)
2. [ ] Paso 2 — `app.module.ts`: añadir `skipIf` al `ThrottlerModule` para
   desactivar el limitador cuando `NODE_ENV === "test"`. Verificado que vitest
   fija `NODE_ENV=test` y que `.env` deja `development` fuera de pruebas, así
   que producción y desarrollo quedan intactos. La cobertura del mecanismo la
   sigue dando `rate-limit.spec.ts`, que levanta su propio módulo con su propio
   guard y por tanto **no** se ve afectado por `skipIf`.
   (commit: `fix(security): no aplicar el rate limiting en entorno de pruebas`)

## Criterios de aceptación

- [ ] CA-1: `GET /doctors/me/patient-access-log` responde 200 con filas que
      tienen `sequence` no nulo, y `sequence` llega como `string`.
- [ ] CA-2: Los 8 archivos de integración que fallaban dejan de recibir 429.
- [ ] CA-3: `rate-limit.spec.ts` sigue en verde — el mecanismo de 429 se sigue
      verificando pese al `skipIf`.
- [ ] CA-4: La suite completa del backend queda en verde (0 fallidas).
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
