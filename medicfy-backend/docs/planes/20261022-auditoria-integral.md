# Plan: remediación de la auditoría integral del 21-oct-2026

**Fecha:** 2026-10-22
**Origen:** `docs/auditoria/AUDITORIA-INTEGRAL-2026-10-21.md` (83 hallazgos: 4 críticos, 27 altos, 33 medios, 19 bajos)
**Alcance:** `medicfy-backend` y `medicfy-frontend`, en el mismo árbol de trabajo. Sin commits, sin ramas nuevas y sin push (instrucción explícita del usuario).

## Análisis de impacto

- **Backend:** identity, records, prescriptions, labs, scheduling, doctors, notifications, assistant, audit, common.
- **Frontend:** DOC-06 (sidebar, formulario, Zona 3), expediente, agenda, citas, perfil, login, auditoría, componentes UI.
- **Contratos:** sí. Cambiaron `clinical`, `identity` y `scheduling`. Se copiaron al frontend y quedaron idénticos (`diff -r` limpio, salvo el spec que solo existe en backend).
- **Migraciones:** 5, todas aditivas. Ninguna toca datos clínicos existentes:
  - `20261022100000_immutability_in_depth`: triggers de inmutabilidad (C-02, A-07).
  - `20261022110000_sign_integrity`: `ordinal`, `authorUserId`, `contentHashSha256` de adenda, `draftVersion` e índice único de nota original (A-08, A-09, A-10, M-13).
  - `20261022120000_idempotency_keys` (A-14).
  - `20261022130000_hot_fk_indexes` (M-17).
  - `20261022140000_identity_hardening` (M-01, M-02, M-04).
- **Riesgo de regresión:** medio. Se mitigó corriendo la suite completa, incluida la integración, contra PostgreSQL 16 real.

## Estado por hallazgo

Leyenda: ✅ corregido y con prueba · 🟡 corregido parcialmente o con limitación anotada · ⏸ pendiente de decisión · ⛔ fuera del alcance del código (requiere producción).

### Críticos
| ID | Estado | Qué se hizo |
|---|---|---|
| C-01 | ✅ | Tokens con llave y `aud` propios por propósito (`common/purpose-token.util.ts`) y payload validado con Zod. `enroll` responde 409 si el MFA ya está activo. |
| C-02 | ✅ | Triggers: PK inmutable en toda tabla con `id`; append-only también para el dueño del esquema; `REVOKE DELETE` sobre `patients`. Verificado con SQL contra Postgres 16. |
| C-03 | 🟡 | Next 15.5.28, `overrides` para postcss, sharp y source-map-js, e `images.unoptimized`. `pnpm audit` del frontend: 0. **Falta desplegar.** |
| C-04 | ✅ | Estado de carga explícito (`loading`, `error`, `ready`); "Sin alergias" solo con una respuesta 200; error con reintento. |

### Altos
| ID | Estado | Qué se hizo |
|---|---|---|
| A-01 | ✅ | La llave del limitador usa un token VERIFICADO; si no es válido, solo la IP. |
| A-02 | ✅ | `appointmentId` se valida contra médico y paciente; un P2002 ajeno da 409. |
| A-03 | ✅ | `ResourceAuthorshipGuard` en editar, firmar, corregir y cancelar (nota, receta, orden). Los rechazos quedan en bitácora. |
| A-04 | ⏸ | Choca con la decisión del 2-sep ("sin aprobación de admin"). Ver Notas. |
| A-05 | ✅ | Suspendidos bloqueados en login, refresh y guard; un médico suspendido pierde el acceso clínico; suspender revoca las sesiones. |
| A-06 | ✅ | `labOrderId` y `encounterId` del cuerpo se validan contra el paciente antes de escribir. |
| A-07 | ✅ | Encuentro firmado sellado por trigger. El descarte de un diagnóstico solo estampa fecha y autor; ya no reescribe `certainty`. |
| A-08 | ✅ | Firma con candado por paciente y compare-and-set (`DRAFT`→`SIGNED`), más índice único de nota original. |
| A-09 | ✅ | Columna `ordinal`. El verificador prueba permutaciones en notas viejas (sin `ordinal`). |
| A-10 | ✅ | La adenda guarda autor y sello encadenado; no se corrige una nota cancelada; el verificador revisa adendas. |
| A-11 | ✅ | Cita del consultorio nace `SCHEDULED`; `POST /appointments/:id/confirm-payment`; barridos de no-show y reservas vencidas. |
| A-12 | ✅ | La reserva pública exige un espacio real; el consultorio valida pasado, antelación, ventana y bloqueos; buffer entre citas. |
| A-13 | ✅ | Sin domicilio completo no se emite (422). Nombre legal en receta, orden y firma. El snapshot se arma antes del folio. |
| A-14 | ✅ | `Idempotency-Key` de punta a punta (citas, recetas, órdenes, reserva pública). |
| A-15 | 🟡 | Los rangos se filtran por unidad. Los rangos e interacciones pendientes se SIGUEN usando (M10-RN-009), pero llegan marcados `rangePendingReview` / `pendingMedicalReview`. Falta mostrar esa marca en la UI. |
| A-16 | 🟡 | `trust proxy` = `TRUST_PROXY_HOPS` (1 en producción). nginx: ver `infra/nginx/medicfy-hardening.conf`. **Falta aplicarlo en el servidor.** |
| A-17 | ⏸ | No se tocó. Ver Notas. |
| A-18 | ✅ | Swagger desactivado en producción salvo `ENABLE_API_DOCS=true`. |
| A-19 | 🟡 | Cabeceras en el API y en Next (CSP completa en Report-Only); sin `X-Powered-By`. **Falta `server_tokens off` en nginx.** |
| A-20 | ✅ | El borrador local solo gana si es más nuevo que el del servidor. |
| A-21 | ✅ | `timeoutMs` de 10 s en el autoguardado, reintento cada 10 s y al volver la red. |
| A-22 | ✅ | Dosis, frecuencia, alergias, diagnósticos y estado de signos vitales a 16 px. |
| A-23 | ✅ | `--danger` pasa a ladrillo (distinto del rojo crítico); nueva variante `Aviso error` para fallos del sistema. |
| A-24 | 🟡 | `overrides` y multer 2.3: de 24 avisos a 3 moderados. Quedan `@nestjs/core` (requiere Nest 11) y file-type (`FileTypeValidator` no se usa). |
| A-25 | ✅ | Resuelto junto con C-03. |
| A-26 | ⛔ | Son datos de producción (no vienen del seed). El directorio ya oculta perfiles incompletos (O-12). |
| A-27 | ✅ | Desactivar MFA exige contraseña y código vigente; queda en bitácora. Pantalla de Perfil actualizada. |

### Medios
| ID | Estado | Nota |
|---|---|---|
| M-01 | ✅ | Bloqueo también en el paso TOTP, anti-repetición, códigos de respaldo aceptados en login y guardados con argon2 (compatibles con los SHA-256 viejos). |
| M-02 | ✅ | Máximo 5 intentos por código, más `@AuthThrottle`. |
| M-03 | 🟡 | Hash señuelo para usuarios inexistentes; tope de 24 h al bloqueo. El 409 del registro y el 423 por bloqueo se conservan (UX). |
| M-04 | ✅ | Detección de reúso (revoca la sesión fuera de una ventana de gracia de 30 s) y rotación condicional. |
| M-05 | 🟡 | Firmar la nota sigue SIN contraseña (decisión del usuario, 2026-10-22). Los fallos de contraseña al firmar recetas y órdenes ahora cuentan para el bloqueo. |
| M-06 | ✅ | Cookie `Secure` salvo cuando `APP_BASE_URL` es http://localhost. |
| M-07 | ✅ | Límites de multer, magic bytes, `Content-Disposition: attachment` fuera de PDF e imágenes, CSP `sandbox`. |
| M-08 | ✅ | Rango máximo de 60 días en disponibilidad. |
| M-09 | 🟡 | Un pase de IA en vuelo por encuentro (candado en proceso), contexto delimitado y regla anti-inyección (`p51-v4`). El resumen sigue sin contar para el tope; DPA y consentimiento del OCR quedan pendientes (no es código). |
| M-10 | ✅ | Receta y medicación en una transacción; el PDF huérfano se borra. |
| M-11 | ✅ | Revisión OCR atómica con compare-and-set. |
| M-12 | ✅ | El borrador abandonado queda bloqueado siempre. |
| M-13 | ✅ | `draftVersion` y 409 `DRAFT_CONFLICT`, con resolución en la UI. |
| M-14 | ✅ | Middleware de `request_id` (AsyncLocalStorage) hacia audit_log y el cuerpo de error; IP y user-agent de respaldo. |
| M-15 | ✅ | P2002, P2025 y P2034 mapeados; logs de Prisma sanitizados. |
| M-16 | 🟡 | Detecta huecos y truncado, lee por lotes y corre a diario (solo log). Falta el canal de alerta (PENDIENTE). |
| M-17 | ✅ | 25 índices de llaves foráneas usadas en cada petición. |
| M-18 | ⏸ | No se tocó (falta probar la carrera). |
| M-19 | 🟡 | Los trabajos fallidos se conservan 7 días y `/health` reporta los recordatorios. Los reintentos NO se agregaron (decisión del usuario, 2026-09-08). |
| M-20 | ⏸ | No se tocó (filtros de fecha y año del folio en UTC). |
| M-21 | ✅ | Al cerrar sesión se sincroniza y se borra; TTL de 7 días; la llave se regenera. |
| M-22 | ✅ | `safeInternalRedirect`. |
| M-23 | ✅ | La búsqueda de notas va por POST con cuerpo; la descripción del documento va como campo multipart. |
| M-24 | ✅ | Web Locks para el refresh entre pestañas; BroadcastChannel para el logout. |
| M-25 | ✅ | Estado de error y combobox ARIA con teclado. |
| M-26 | ✅ | `useConfirmDialog` reemplaza todos los `window.confirm` y `window.prompt`. |
| M-27 | ✅ | Tipo de encuentro y siguiente cita decididos por el servidor (`GET /appointments/:id/next`). |
| M-28 | ✅ | Pestañas APG (flechas, Inicio y Fin); la pestaña recordada monta su panel; el cajón es modal (Esc y foco). |
| M-29 | ✅ | Atrapado de foco en Modal y Panel; anillo `focus-within` en signos vitales. |
| M-30 | 🟡 | Textos fijos pasados a i18n. Los datos en inglés NO vienen del seed (son de producción). |
| M-31 | ✅ | `RoleGate` y aterrizaje por rol. |
| M-32 | ✅ | `pnpm lint` corre y pasa en ambos repos (se agregó `eslint` como devDependency). |
| M-33 | ✅ | Pantallas nuevas: reprogramar cita, olvidé y restablecer contraseña, aceptar invitación, corregir nota (adenda). Los enlaces de correo ahora usan `WEB_ORIGIN`. Edición de alergias, medicación y embarazo: pendiente. |

### Bajos
| ID | Estado | Nota |
|---|---|---|
| B-01 | ✅ | Token de invitación hasheado y verificación del correo. |
| B-02 | ✅ | Contraseña de máximo 128 caracteres. |
| B-03 | ⏸ | Paginación de `findMany` pendiente. |
| B-04 | ✅ | `z.nativeEnum` en el filtro de admin. |
| B-05 | ⛔ | Hay que confirmar en producción que no existan las cuentas `*@medicfy.dev`. |
| B-06 | 🟡 | Archivo borrado del árbol de trabajo. **Sigue en el historial de git del repo público.** |
| B-07 | ✅ | El simulador escucha solo en 127.0.0.1 y acepta solo orígenes locales. |
| B-08 | ✅ | `complete()` en una sola escritura. |
| B-09 | ⏸ | Enums y CHECK pendientes (hay que fijar los valores válidos). |
| B-10 | 🟡 | Las migraciones nuevas documentan su reversión; las 49 anteriores no. |
| B-11 | 🟡 | audit_log guarda IDs en vez de nombres de medicamento. El módulo `billing` vacío se conserva. |
| B-12 | ✅ | Error visible en la landing; objetivos táctiles de 44 px. |
| B-13 | ✅ | `sexAtBirthLabel` exhaustivo. |
| B-14 | ⏸ | Rendimiento pendiente. |
| B-15 | 🟡 | CI verifica que los contratos estén sincronizados. |
| B-16 | ✅ | `ButtonLink`. |
| B-17 | ⛔ | Hay que revisar el `error.log` de nginx en el servidor. |
| B-18 | ✅ | Acciones legibles y nombre del médico actor. |
| B-19 | ⏸ | `next/font/local` pendiente (necesita los archivos de fuentes). |

### Áreas de oportunidad atendidas
O-01, O-02, O-03, O-04 (parcial: nginx), O-05, O-06, O-07, O-08 (`.github/workflows/ci.yml`), O-09, O-10 (sin la regla de lint), O-11, O-12 y O-15.

## Pruebas

Corridas el 2026-10-22 contra PostgreSQL 16.14 local:

- **Backend:** 532 pruebas en verde (63 archivos, integración incluida); typecheck, lint y `nest build` limpios.
- **Frontend:** 57 pruebas Vitest en verde; typecheck, lint y `next build` limpios.
- **Playwright E2E:** no se corrió (requiere el API real y la web levantados).
- **Archivo nuevo:** `apps/api/src/modules/records/audit-2026-10-21.integration.spec.ts`, con una prueba negativa por hallazgo de records.

## Notas para el equipo

1. **Pruebas que estaban en rojo antes de esta remediación.** Al haber por fin un Postgres para correrlas, 44 pruebas de integración salieron en rojo. Las rompió el commit `3e0012e`: quitó la contraseña y el TOTP de la firma sin actualizar las pruebas, e incluyó antecedentes negados en el contexto de la IA. Se actualizaron las pruebas a ese comportamiento; no se cambió el comportamiento.
2. **PENDIENTE(jorge) · A-04.** Hoy el médico declara el grupo del medicamento que da de alta. Opciones:
   - (a) Las altas de autoservicio no se prescriben electrónicamente hasta que un curador las revise (contradice la decisión del 2-sep).
   - (b) Una lista cerrada de sustancias controladas, validada por médico y abogado.
3. **PENDIENTE(jorge) · A-17.** Quitar SUPERADMIN del CuratorGuard y anonimizar los reportes de calidad de catálogo. Cambia quién puede curar.
4. **PENDIENTE(jorge) · A-13.** ¿Número exterior y colonia son obligatorios en el domicilio del art. 33?
5. **Cambios de comportamiento a comunicar:**
   - Las citas que agenda el consultorio ya no quedan en "pago pendiente".
   - El paciente solo puede reservar horarios reales.
   - El directorio oculta los perfiles sin servicio activo o sin dónde atender.
   - Un médico ya no puede editar ni firmar el borrador de otro médico.
6. **Despliegue:**
   - Aplicar las 5 migraciones, con respaldo previo y autorización explícita.
   - En producción: `TRUST_PROXY_HOPS=1` y `WEB_ORIGIN` correcto (ahora se usa para los enlaces de correo).
   - Aplicar `infra/nginx/medicfy-hardening.conf`.
   - Desplegar el frontend con Next 15.5.28.
   - Al rotar la llave de los tokens de acceso, las sesiones activas se renuevan solas con su refresh token.
7. **Deuda conocida:**
   - NestJS 11 (cierra el aviso de `@nestjs/core`).
   - Candado de la IA y barrido de citas por proceso: si el API corre en varias instancias, moverlos a la base o a Redis.
   - Pruebas E2E en CI.

## Resultado final
**Estado:** Completado con pendientes. Los hallazgos ⏸ y ⛔ están arriba.
**Commits incluidos:** ninguno (instrucción explícita: no subir nada a git).
**Pruebas:** 532 backend / 57 frontend / 0 E2E (no ejecutadas). Todas las ejecutadas están en verde.
