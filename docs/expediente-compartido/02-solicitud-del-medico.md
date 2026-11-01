# PR-EXP-02 · Solicitud del médico — Expediente compartido autorizado por el paciente

**Fecha:** 2026-10-31
**Reglas de especificación involucradas:** RE1, RE3, RE5, RE6, RE7, RE9; D-EXP-01, D-EXP-03, D-EXP-04, D-EXP-05, D-EXP-10; sección B (límites operativos); R8.
**Input:** PR-EXP-01 (modelo), `docs/expediente-compartido/00-DESCUBRIMIENTO.md` (Q1, Q9, Q10).

## Análisis de impacto y decisiones (ANTES de escribir código, como exige CLAUDE.md FASE 1)

### 1. Contradicción encontrada entre RE5 y el texto de "límites" de PR-EXP-02 — resuelta a favor de RE5

El prompt maestro dice, en la misma fase: (a) RE5 — "el médico solicitante no aprende NADA del paciente... antes de la autorización"; y (b) "7 días de espera tras un rechazo... al exceder, el error es genérico". El error de "espera tras rechazo" es **específico de la pareja (médico, paciente)** — si ese error fuera visible y distinto del mensaje genérico de "sin coincidencia", el solicitante aprendería que ESE paciente en particular existe y que ya lo rechazó antes. Eso es exactamente lo que RE5 prohíbe.

**Decisión (no es una duda clínica/legal — es una contradicción interna de seguridad, resuelta aplicando la regla más estricta y más específica):** el límite de 20/día es **independiente del paciente** (no leakea nada) y SÍ puede devolver un error visible y genérico ("alcanzaste el límite de solicitudes de hoy"). El límite de "7 días tras rechazo" **SÍ depende del paciente** — se aplica en silencio, dentro del mismo trabajo asíncrono que decide si hay coincidencia, y el médico recibe el mismo mensaje genérico de siempre. El criterio de terminación del prompt maestro ("se aplica la espera tras rechazo") se verifica revisando que NO se creó una `RecordShareRequest` nueva — nunca por un código de error distinto.

### 2. Reparto del `NotificationPort` entre PR-EXP-02 y PR-EXP-03

El prompt maestro asigna la construcción de `NotificationPort` a PR-EXP-03 ("Envío: Crea un puerto de notificación..."), pero el propio PR-EXP-02 necesita enviar el mensaje inicial ("la búsqueda y el envío corren en un trabajo asíncrono"). Se crea aquí un puerto **mínimo**, `RecordShareNotificationPort`, con el único método que PR-EXP-02 necesita (`sendAuthorizationRequest`) y su adaptador de consola (mismo patrón de "truena en producción" que `ConsoleEmailChannelAdapter`/`ConsoleNotificationAdapter`, confirmado en `00-DESCUBRIMIENTO.md` Q4). PR-EXP-03 EXTIENDE este mismo puerto con lo que le toca (OTP, confirmación, revocación) en vez de crear uno paralelo.

### 3. Canal de envío cuando el paciente tiene ambos contactos (siempre los tiene — `Patient.phoneE164`/`email` son obligatorios)

El prompt maestro no dice cuál canal usar cuando existen los dos. **⚠️ Decisión por defecto, reportada como "por confirmar":** `EMAIL`. Motivo: es el único canal con algo más que un adaptador de consola en el horizonte cercano (M1/M12 ya tienen flujos de email reales fuera de este track); WhatsApp no tiene adaptador implementado (Q4) y SMS no existe en absoluto en el repo.

### 4. D-EXP-10 (menor de edad) — la excepción nunca se cumple hoy, documentado y no inventado

Q11 de `00-DESCUBRIMIENTO.md` confirmó que NO existe ningún campo de "contacto verificado" en `PatientGuardian`. Por tanto, con el código actual, un paciente menor de edad **siempre** queda bloqueado — la cláusula "salvo que ya tenga un tutor con contacto verificado" no tiene cómo cumplirse todavía. Se implementa el bloqueo incondicional para menores, con un `PENDIENTE(jorge)` explícito en el código señalando exactamente esto (no se construye aquí un sistema de verificación de contacto de tutor — eso es una función nueva, fuera del alcance de "la solicitud del médico").

### 5. Normalización de identificadores (D-EXP-04)

- Nombre/apellidos: minúsculas, sin acentos (incluye ñ→n para este propósito — a diferencia del normalizador de catálogo, aquí NO hace falta proteger la ñ porque no se usa como llave de un índice único, solo para comparar dos cadenas), espacios colapsados. Función nueva y dedicada (`normalizePersonName`) — **no se reutiliza** `catalog/term-normalizer.util.ts`: ese normalizador reduce plurales en español ("Carlos" → "Carlo" con su regla de "-os"), que es correcto para términos clínicos pero destruiría nombres de personas.
- Teléfono: se admite con espacios/guiones/con o sin "+52"/con "52" sin "+"; se normaliza a E.164 mexicano y se valida contra `isValidMxPhoneE164` (ya existe en `packages/contracts`, reutilizado tal cual). Si no se puede normalizar a un E.164 mexicano válido, se trata como "sin coincidencia" (nunca se intenta adivinar).
- Correo: minúsculas + recorte de espacios.
- La comparación contra `Patient` es: `birthDate` exacto + nombre normalizado exacto + (teléfono normalizado exacto O correo normalizado exacto, case-insensitive). Si más de una fila sobrevive el filtro completo (no debería ocurrir — `Patient` es global, Q1), se trata de forma conservadora como "sin coincidencia" en vez de adivinar cuál es la correcta.

### 6. "Varias coincidencias" reinterpretado con Q1 (Patient global)

No hay "varios pacientes que coinciden" — hay **un** `Patient`, y potencialmente **varios médicos con `CareRelationship` ACTIVA** a ese paciente (los custodios). Se usa `CareRelationshipService.listActiveDoctorsForPatient(patientId)` (ya existente, sin cambios) para obtener esa lista. Si el propio solicitante aparece en ella (ya tiene relación directa), **no se crea ninguna solicitud** — ni para él ni para los demás custodios — tal como pide la letra ("No se crea solicitud si el solicitante ya tiene relación de cuidado directa con ese paciente").

### 7. Alcance mínimo (RE3/D-EXP-05)

El contrato (`shareRequestCreateSchema`, nuevo) exige que `scope` incluya siempre `"SUMMARY"` — rechazado con 422 si no. El frontend lo refuerza (checkbox bloqueado), pero la regla real vive en el servidor, nunca solo en la UI.

## Pasos de implementación

1. [x] Backend: normalizador de identidad (`patient-identity-normalizer.util.ts` + spec), puerto de notificación mínimo + adaptador de consola, contrato Zod (`shareRequestCreateSchema`, `shareRequestSummarySchema`), servicio (`RecordShareRequestService`), controller + guards + rate limit, módulo nuevo registrado en `app.module.ts`, endpoints en `dev-server.mjs` (mock).
2. [x] Backend: prueba de integración (`record-share-request.integration.spec.ts`) cubriendo el criterio de terminación completo.
3. [x] Frontend: pantalla "Solicitar expediente", bandeja "Mis solicitudes", entrada de menú, i18n es/en, pruebas de componente.
4. [x] Documentación: este archivo + informe de 7 puntos.

## Criterios de aceptación (texto literal del prompt maestro)

- [x] CA-1: médico no verificado → 403.
- [x] CA-2: respuesta idéntica con/sin coincidencia, incluida una prueba de tiempo con tolerancia razonable.
- [x] CA-3: se aplica el límite de 20/día (visible, genérico, no depende del paciente).
- [x] CA-4: se aplica la espera de 7 días tras un rechazo (en silencio — ver decisión §1).
- [x] CA-5: se crean N solicitudes con N custodios.
- [x] CA-6: un menor queda bloqueado (incondicional — ver decisión §4).
- [x] CA-7: todo evento queda en `audit_log`.

## Fixes encontrados al implementar (no estaban en el plan original)

1. **`patientIdentifierSchema` rechazaba campos opcionales vacíos.** `lastNameMaternal`/`phone`/`email` tenían `.min(1).optional()` — un campo HTML dejado en blanco llega como `""`, no como `undefined`, y `.min(1)` lo rechazaba aunque el campo fuera opcional. Se quitó `.min(1)` de los tres (mismo criterio que ya usa `patient.schema.ts` para su propio `lastNameMaternal`); el refine de "al menos teléfono o correo" ya trataba `""` como ausente porque usa `Boolean(...)`.
2. **El checkbox bloqueado de "Resumen clínico" rompía el envío del formulario.** Registrarlo en react-hook-form como `disabled` hacía que la librería excluyera el campo `scope` completo de la validación (mismo comportamiento que un `<input disabled>` en un `<form>` HTML nativo) — el formulario nunca llegaba a `onSubmit`, ni siquiera sin tocar ninguna otra casilla. Encontrado por la prueba de componente, no por inspección visual. **Fix:** el grupo de casillas se maneja con `Controller` (control explícito del arreglo en memoria) en vez de `form.register()` por casilla — "SUMMARY" se agrega siempre en el `onChange`, nunca depende de qué casillas registró el DOM.

Ambos quedaron cubiertos por las pruebas de componente nuevas (ver Plan de pruebas) — ninguno se habría detectado solo con `tsc`/`next build`.

## Plan de pruebas

- Backend: `record-share-request.integration.spec.ts` (9 casos, cubren CA-1 a CA-7 del prompt maestro) — no verificable en este entorno de ejecución (sin Postgres, mismo bloqueador (d) de PR-EXP-00/01); escrita, tipada (`tsc --noEmit` limpio) y verificada hasta el punto exacto donde necesita la base de datos (falla en `beforeAll`/`app.init()` con `Can't reach database server`, nunca con un error de código). También se verificó, con un script de arranque desechable (borrado tras usarlo), que el grafo de inyección de dependencias de Nest resuelve `RecordShareModule` sin errores junto con todos los demás módulos — la única falla real es la conexión a Postgres, no el cableado.
- Backend: `patient-identity-normalizer.spec.ts` (8 casos, lógica pura) — **SÍ ejecutable aquí, 8/8 en verde.**
- Mock server (`dev-server.mjs`): los 3 endpoints nuevos se probaron de punta a punta con `curl` contra el servidor real corriendo (login → crear solicitud → listar → cancelar) — los 3 funcionaron correctamente.
- Frontend: pruebas de componente (Vitest + Testing Library) para las dos pantallas nuevas — **SÍ ejecutables aquí, 8/8 en verde** (no dependen de Postgres). Encontraron 2 bugs reales antes de que llegaran a ejecutarse en un navegador real (ver sección de fixes arriba).
- Verificación de navegador real: **no fue posible.** El navegador integrado de Claude no puede abrir servidores `localhost` que Claude mismo levanta (limitación documentada de la herramienta, no del código). Se compensó con: `next build` en verde (compila las 3 rutas nuevas), las 8 pruebas de componente (ejercitan la lógica real de renderizado/formulario/envío, no solo tipos), y la prueba manual con `curl` contra el mock server.
- Sin E2E nuevo en esta fase — no hay todavía flujo completo de punta a punta (falta PR-EXP-03 para que el paciente autorice).
