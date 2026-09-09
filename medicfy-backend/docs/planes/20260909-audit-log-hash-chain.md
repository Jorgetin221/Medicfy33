# Plan: Encadenamiento de hashes en `audit_log` (M15-RN-002)

**Fecha:** 2026-09-09
**Reglas de especificación involucradas:** M15-RN-002, M15-CA-001 (referencia — verificación de integridad)
**Estimación de pasos:** 4 commits

## Análisis de impacto

- Módulos backend afectados: `identity` (esquema Prisma, `AuditService`, nuevo
  `AuditChainVerifierService`), `admin` (nuevo endpoint de solo-lectura para
  disparar la verificación).
- Componentes frontend afectados: ninguno en este plan — el resultado se
  expone como JSON de un endpoint de admin; una pantalla que lo muestre
  queda fuera de este alcance (no pedida, no es parte de M15-RN-002).
- Contratos modificados: no — el endpoint nuevo no forma parte de
  `packages/contracts` porque es interno de administración, sin cliente
  tipado compartido con el frontend (mismo patrón que `admin/metrics`).
- Migraciones necesarias: sí. Escritas a mano (mismo motivo documentado en
  `20260908191536_m12_notifications`: el CLI de Prisma no puede alcanzar
  `binaries.prisma.sh` desde este entorno — 403 confirmado).
- Riesgo de regresión: bajo. Las columnas nuevas son opcionales
  (`sequence`/`hashSha256`/`previousHashSha256` nullable) — las filas de
  `audit_log` ya existentes quedan sin cadena (no se puede recalcular su
  hash retroactivamente sin violar el GRANT de solo INSERT de R1), y el
  encadenamiento arranca desde la primera fila escrita después de esta
  migración. `AuditService.log()` sigue aceptando exactamente los mismos
  argumentos — ningún call site (hay ~15) cambia.

## Decisión de diseño: concurrencia

`audit_log` no es como `clinical_notes` (una nota por encuentro, firmada por
un solo médico a la vez) — se escribe en CADA lectura clínica desde
cualquier request concurrente. Encadenar leyendo "la última fila" antes de
insertar, sin más, produciría bifurcaciones de cadena bajo escritura
concurrente real (no ataque, solo dos requests al mismo tiempo) —
indistinguibles de una alteración para el verificador. Se agrega una tabla
puntero de una sola fila (`audit_log_chain_state`, sin datos clínicos ni de
auditoría, solo `lastSequence`/`lastHashSha256`) y se serializa
lectura+cálculo+inserción+avance de puntero con `SELECT ... FOR UPDATE`
dentro de una transacción Prisma. Esa tabla sí necesita `UPDATE` (no hereda
el GRANT append-only de R1 — R1 nombra `clinical_notes`, `prescriptions`,
`lab_orders`, `audit_log`; esta tabla no es ninguna de esas, es
bitácora interna de la propia bitácora).

## Pasos de implementación

1. [x] Paso 1 — Migración Prisma: columnas `sequence`/`hashSha256`/
   `previousHashSha256` en `audit_log`, tabla `audit_log_chain_state` +
   GRANT (commit: `migration(identity): agregar columnas de cadena de hash a audit_log (M15-RN-002)`)
2. [x] Paso 2 — `AuditService.log()` calcula y escribe la cadena bajo
   transacción con lock (commit: `feat(identity): encadenar hashes de audit_log al escribir (M15-RN-002)`)
3. [x] Paso 3 — `AuditChainVerifierService`: recorre la cadena, recalcula
   cada hash, reporta la primera ruptura (commit: `feat(identity): verificador de integridad de la cadena de audit_log (M15-RN-002)`)
4. [x] Paso 4 — Endpoint `GET /admin/audit/chain-verification` (solo
   ADMIN/SUPERADMIN) que expone el verificador + prueba negativa de
   autorización (commit: `feat(admin): endpoint de verificación de cadena de audit_log (M15-RN-002)`)

## Criterios de aceptación

- [x] CA-1: cada fila nueva de `audit_log` queda encadenada con la
  anterior mediante un hash SHA-256 verificable de forma independiente.
- [x] CA-2: alterar el contenido de una fila (o su lugar en la cadena)
  es detectable recalculando el hash y comparando el eslabón con la
  fila siguiente — mismo principio de doble comparación que
  `NoteIntegrityService`.
- [ ] CA-3 (PENDIENTE(jorge)): "verificador diario que alerta ante
  ruptura" — el verificador existe y puede ejecutarse bajo demanda
  (endpoint de admin), pero la ejecución programada diaria y el canal
  de alerta (¿correo al admin? ¿solo el propio log de la aplicación?
  ¿ambos?) no están definidos en la especificación ni se me indicó una
  preferencia. No se inventa: falta agregar `@nestjs/schedule` (o un
  cron externo que llame al endpoint) y decidir el canal antes de
  cerrar esto por completo.

## Plan de pruebas

- Pruebas unitarias: `AuditService` (cadena avanza correctamente bajo
  llamadas secuenciales; primera fila usa `previousHashSha256: null`),
  `AuditChainVerifierService` (cadena íntegra → OK; fila alterada en
  memoria/mock → detecta ruptura y reporta la secuencia exacta).
- Pruebas de integración: `GET /admin/audit/chain-verification` — 401
  sin token, 403 con rol no-admin (prueba negativa de autorización,
  DoD §4).
- Pruebas negativas: rol no-admin no puede leer el resultado de la
  verificación (podría filtrar `action`/`resourceType` de eventos que,
  aunque no son clínicos, son metadatos de acceso — mismo criterio que
  M13-CA-001).

## Resultado final

**Estado:** Completado (pasos 1–4); CA-3 queda explícitamente
`PENDIENTE(jorge)` — ver arriba.
**Commits incluidos:**
- `migration(identity): agregar columnas de cadena de hash a audit_log (M15-RN-002)`
- `feat(identity): encadenar hashes de audit_log al escribir (M15-RN-002)`
- `feat(identity): verificador de integridad de la cadena de audit_log (M15-RN-002)`
- `feat(admin): endpoint de verificación de cadena de audit_log (M15-RN-002)`
**Pruebas:** 5 unitarias de `AuditService.log()` + 4 de
`AuditChainVerifierService` (mockeando `PrismaService`, incluyendo el
caso de alteración sofisticada: fila tocada Y su propio hash
recalculado, detectada igual por el eslabón con la fila siguiente) — las
9 pasan. Integración negativa del endpoint nuevo agregada a
`m13-admin.integration.spec.ts`; falla en este entorno por el mismo
bloqueo de siempre (cliente de Prisma desactualizado por
`binaries.prisma.sh`) — no es una regresión, se confirmó que
`m2.integration.spec.ts` falla igual en aislado. Suite completa antes/
después: 108→117 pasando (+9, exactamente las nuevas), 16 skipped sin
cambio, mismos archivos de integración bloqueados que antes. `tsc
--noEmit`: 224→228 (+4: las mismas categorías conocidas de cliente de
Prisma desactualizado — `AuditLog`/`AuditResult`/`InputJsonValue` sin
exportar, `tx` implícitamente `any` en el nuevo `$transaction` — cero
errores nuevos en los archivos propios de esta migración).
Actualizado también `dev-server.mjs` con un mock de
`/admin/audit/chain-verification` (siempre "OK", no hay Postgres real
en el servidor de desarrollo).
**Notas para el equipo:** el diseño de concurrencia (tabla puntero +
`SELECT ... FOR UPDATE`) es nuevo en el proyecto — no había ningún otro
lugar con esta forma de contención de escritura concurrente. Se
documentó extensamente en el propio código (`audit.service.ts`) el
porqué, para que no se "simplifique" después quitando el lock (sería
volver a permitir bifurcaciones de cadena bajo carga real).
