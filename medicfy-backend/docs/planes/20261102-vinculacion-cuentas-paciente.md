# Plan: vinculación entre pacientes creados por médicos y cuentas de paciente

**Fecha:** 2026-11-02
**Objetivo:** que nunca existan dos expedientes de la misma persona.
**Reglas involucradas:** M5-RN-009 (registro propio), M2-CA-009 (alta por médico), M1-RN-003/004/006 (consentimientos, bloqueo), R2, R3, R4.

## Análisis de impacto
- Backend: `identity` (AuthService: registro con detección por teléfono, login de cuentas activadas por enlace), `scheduling` (PatientService/PatientsController: advertencia de duplicado), módulo nuevo `patient-accounts` (enlace de activación y solicitudes de vinculación), `record-share` (el normalizador de teléfono ahora vive en contratos).
- Frontend: `/activar-cuenta/[token]` (nueva), ficha del paciente (panel de cuenta + aviso de solicitudes), `/pacientes` (listado de solicitudes), `/pacientes/nuevo` (advertencia de duplicado), `/registro-paciente` (mensaje neutro), `/mi-cuenta` (estado pendiente).
- Contratos: sí (ambas copias idénticas). Teléfonos normalizados a E.164 en el esquema.
- Migraciones: sí, `20261102010000_patient_account_linking` (solo agrega).
- Riesgo de regresión: medio — `registerPatient` cambia su respuesta (`identityReviewPending`) y los esquemas de teléfono ahora normalizan antes de validar.

## Decisiones tomadas
1. `patients.userId` ya era opcional y `@unique` desde M5a: no se migra.
2. El enlace usa `WEB_ORIGIN` (en este proyecto `APP_BASE_URL` es la URL del API). Sin variables de entorno nuevas.
3. Tutores: `PatientGuardian` no tiene cuenta ni acceso, así que **no se genera enlace para menores** y la ficha lo explica. Tampoco se proponen menores como coincidencia en el registro por teléfono.
4. Activación: crea la cuenta (o vincula una cuenta PATIENT existente sin expediente, verificando su contraseña con el mismo bloqueo del login), consume el token y deja la sesión iniciada. La cuenta queda `ACTIVE` sin código de correo: el enlace acredita la identidad. `AuthService.login` acepta `emailVerifiedAt` nulo solo si la cuenta usó un enlace de activación.
5. Generar enlace: médico o asistente. Aprobar/rechazar solicitudes: solo el médico tratante.
6. Rechazar deja la cuenta sin expediente (literal del requerimiento). No se crea uno nuevo en automático.

## Notas para el equipo
- PENDIENTE(jorge): una cuenta cuya solicitud se rechazó queda sin expediente propio y no puede agendar por el enlace público hasta que un médico le dé un enlace de activación. ¿Debe crearse un expediente nuevo SELF_SIGNUP al rechazar la última solicitud pendiente?
- PENDIENTE(jorge): la cuenta activada por enlace tiene un correo no verificado; la recuperación de contraseña irá a ese correo. Cuando haya proveedor de correo real, conviene pedir verificación posterior.
- Pruebas: por instrucción explícita de esta tarea no se escribieron ni ejecutaron pruebas. Quedan pendientes las de integración (enlace de un solo uso con envíos simultáneos, 404 sin vínculo, 403 del asistente al aprobar, auditoría) y la actualización de pruebas existentes que lean la respuesta de `POST /auth/register/patient`.
- El script `scripts/normalize-patient-phones.ts` escribe con el dueño del esquema y no deja rastro en `audit_log` (la cadena de hashes la mantiene AuditService); solo cambia el formato de números ya válidos.
