# P5 — Auditoría de autorización por recurso (R4 / R5 / R6)

**Alcance:** `medicfy-backend/apps/api/src/**` (28 controladores) + `prisma/schema.prisma`.
**Fecha:** 2026-08-26. Árbol sin commitear, auditado tal cual está en disco.

> **Nota de ubicación:** el monorepo no está en `/home/claude/medicfy` sino en **`/root/medicfy`**.
> Todas las rutas de este documento son relativas a la raíz del monorepo (`medicfy-backend/...`),
> válidas desde cualquiera de las dos ubicaciones.

---

## 0. Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Endpoints HTTP totales | **93** |
| Endpoints que tocan datos de un paciente identificable | **40** |
| **Fallan R4** (autorización por recurso) | **3** |
| **Fallan R5** (identificador adivinable en ruta/query) | **0** |
| **Fallan R6** (sin bitácora de lectura/escritura) | **13** de esos 40 (+2 lecturas admin de PII de médico) |
| Endpoints sin ningún guard | **14** (10 de `/auth`, `/health`, `/specialties`, `/verificar/:token`, `GET /doctors/:id/availability`; ver §4) |
| IDOR explotables encontrados | **3** |

Existe un guard real de relación médico–paciente
(`medicfy-backend/apps/api/src/common/guards/care-relationship.guard.ts`) y está bien construido.
El problema no es que falte el mecanismo: es que **tres endpoints quedaron fuera de él**, y uno de
esos tres (`POST /appointments`) permite **auto-otorgarse el vínculo** que el guard exige, con lo
que todo el perímetro clínico se abre para cualquier paciente cuyo UUID conozca el atacante.

---

## 1. 🔴 IDOR EXPLOTABLES (primero, por severidad)

### 🔴 IDOR-1 — `GET /patients/:id` no verifica NINGUNA relación con el paciente

**Archivo:** `medicfy-backend/apps/api/src/modules/scheduling/patients.controller.ts` **líneas 46-52**

```ts
@Get(":id")
async findOne(@Param("id") id: string) {          // ← no recibe siquiera @Req()
  const patient = await this.patientService.findById(id);
  const guardians = await this.guardianService.listActiveForPatient(patient);
  return { ...patient, guardians };
}
```

El controlador lleva `@UseGuards(JwtAuthGuard)` a nivel de clase (línea 19) y **nada más**.
`PatientService.findById()`
(`medicfy-backend/apps/api/src/modules/scheduling/services/patient.service.ts` líneas 77-83) hace
un `findUnique({ where: { id: patientId } })` sin ningún filtro por `careRelationships`, a
diferencia de `list()` (líneas 70-75), que sí lo filtra correctamente.

**Quién puede explotarlo:** cualquier usuario autenticado. No hay comprobación de rol.
Una cuenta de PACIENTE auto-registrada por `POST /auth/register/patient` sirve.

**Qué devuelve:** la fila `Patient` completa (`curp`, `genderIdentity`, `bloodType`, domicilio
completo, contacto de emergencia, `userId`, `createdByUserId`) **más** las filas
`PatientGuardian` completas, que incluyen `guardianCurp`, `guardianEmail` y
`guardianIdDocumentKey` (la llave de almacenamiento de la identificación oficial del tutor).

**Petición que lo explota:**

```http
GET /patients/9c1f0a3e-77b4-4c62-9d10-2f8a5b6e4411 HTTP/1.1
Host: localhost:3001
Authorization: Bearer <access token de CUALQUIER cuenta activa>
```

→ `200 OK` con el expediente demográfico completo del paciente `9c1f0a3e-…`, sin vínculo, sin
rol de médico, y **sin una sola fila en `audit_log`**.

**Vector de obtención del UUID (no requiere fuerza bruta):** el UUID del paciente viaja en la URL
del navegador — `medicfy-frontend/apps/web/src/app/(app)/pacientes/[id]/page.tsx` y
`.../consulta/paciente/[patientId]/page.tsx` — y el frontend llama exactamente a este endpoint
(`medicfy-frontend/apps/web/src/lib/use-patient-clinical.ts` línea 168). Un médico que trató al
paciente hace 19 meses tiene el UUID en su historial de navegación; su `care_relationship` ya
caducó (`EXPIRY_MONTHS = 18`, `care-relationship.service.ts` línea 5) y **todos los endpoints
clínicos le responden 403 correctamente… menos éste**, que sigue respondiendo 200. Lo mismo
aplica a un vínculo `REVOKED`.

---

### 🔴 IDOR-2 — `POST /appointments` acepta cualquier `patientId` y **fabrica el vínculo** que el guard exige

**Archivos:**
- `medicfy-backend/apps/api/src/modules/scheduling/appointments.controller.ts` **líneas 51-61**
- `medicfy-backend/apps/api/src/modules/scheduling/services/appointment-state-machine.service.ts` **líneas 73-76 y 137**

El controlador resuelve el médico actuante (`SchedulingAuthService.resolveActingDoctor`) pero
**no comprueba en ningún momento que ese médico tenga relación con `body.patientId`**:

```ts
// appointment-state-machine.service.ts:73-76
const patient = await this.prisma.patient.findUnique({ where: { id: input.patientId } });
if (!patient) {
  throw new ApiException("PATIENT_NOT_FOUND", ...);
}
```

y, dentro de la misma transacción:

```ts
// appointment-state-machine.service.ts:137
await this.careRelationshipService.createOrRenew(input.patientId, actingDoctorId, "APPOINTMENT", tx);
```

`createOrRenew()` (`care-relationship.service.ts` líneas 28-46) busca una fila `ACTIVE`; si no
existe — porque nunca existió, porque caducó o porque fue **revocada** — **crea una nueva con 18
meses de vigencia**. El paciente no interviene. No hay pago de por medio: la cita nace en
`PENDING_PAYMENT` pero el `care_relationship` se escribe igual.

Resultado: `CareRelationshipGuard` deja de ser una barrera. Cualquier médico (o su ASSISTANT, que
`resolveActingDoctor` también acepta) se auto-emite el vínculo y a partir de ahí **todo** el
perímetro clínico responde 200: notas, diagnósticos, alergias, antecedentes, línea de tiempo,
recetas, órdenes y resultados de laboratorio.

**Cadena de explotación completa:**

```http
POST /appointments HTTP/1.1
Host: localhost:3001
Authorization: Bearer <token del médico atacante>
Content-Type: application/json

{
  "patientId": "9c1f0a3e-77b4-4c62-9d10-2f8a5b6e4411",
  "serviceId": "<uuid de un servicio PROPIO del atacante>",
  "startsAt":  "2026-09-15T17:00:00.000Z"
}
```

→ `201 Created`. En `care_relationships` ya hay una fila `ACTIVE`, `origin=APPOINTMENT`,
`expiresAt = hoy + 18 meses`. Acto seguido:

```http
GET /records/patients/9c1f0a3e-77b4-4c62-9d10-2f8a5b6e4411/timeline HTTP/1.1
Host: localhost:3001
Authorization: Bearer <token del médico atacante>
```

→ `200 OK` con encuentros, recetas (con `items`, `diagnosisSnapshot`, snapshots legales,
`qrVerificationToken`, `pdfFileKey`), órdenes de laboratorio y resultados. Y:

```http
GET /records/patients/9c1f0a3e-.../encounters HTTP/1.1
Authorization: Bearer <token del médico atacante>
```

→ `200 OK` con `include: { notes: true, diagnoses: true }` — el **texto completo** de todas las
notas clínicas firmadas.

**Agravante R6:** ni `POST /appointments` ni el `createOrRenew` que dispara escriben en
`audit_log`. Sólo se escribe `AppointmentStatusHistory`, que es historial de dominio, no bitácora
de acceso. La creación del vínculo — el evento de autorización más sensible del sistema — es
invisible para la bitácora.

**Restricciones que NO frenan el ataque:** `minBookingNoticeMinutes`, `maxBookingWindowDays`,
`acceptsTeleconsultation`/consultorio activo y la restricción `EXCLUDE` de solapamiento son todas
propiedades **del médico atacante**, bajo su control total.

---

### 🔴 IDOR-3 — `POST /lab-results/patients/:patientId/:resultId/review` no acota `resultId` al paciente

**Archivos:**
- `medicfy-backend/apps/api/src/modules/labs/lab-results.controller.ts` **líneas 93-104**
- `medicfy-backend/apps/api/src/modules/labs/services/lab-order.service.ts` **líneas 169-178**

`CareRelationshipGuard` resuelve el paciente por `req.params.patientId`
(`care-relationship.guard.ts` líneas 96-99) y valida el vínculo contra **el paciente de la ruta**.
Pero el handler pasa `resultId` crudo:

```ts
// lab-results.controller.ts:101
const result = await this.labOrders.reviewResult(resultId, req.actingDoctorId as string, body.doctorComment);
```

```ts
// lab-order.service.ts:169-178
async reviewResult(resultId: string, doctorId: string, doctorComment: string) {
  const result = await this.prisma.labResult.findUnique({ where: { id: resultId } });
  if (!result) { throw ... }                       // ← nunca compara result.patientId
  return this.prisma.labResult.update({ where: { id: resultId }, data: { ... } });
}
```

El endpoint hermano `getResultFile()` **sí** hace la comprobación (`lab-order.service.ts`
líneas 161-167: `if (!result || result.patientId !== patientId)`), y el suite de pruebas la
verifica explícitamente (`lab-results.integration.spec.ts` líneas 126-146). `reviewResult()` es
exactamente el caso que se olvidó — y su prueba (líneas 148-172) sólo cubre el camino feliz.

**Petición que lo explota:**

```http
POST /lab-results/patients/<uuid de un paciente PROPIO del atacante>/<uuid del resultado de OTRO paciente>/review HTTP/1.1
Host: localhost:3001
Authorization: Bearer <token del médico atacante>
Content-Type: application/json

{ "doctorComment": "x" }
```

→ `201 Created` con la fila `LabResult` **completa del otro paciente**: `patientId` real,
`labOrderId`, `labName`, `resultDate`, `fileKey`, `fileHashSha256`, `uploadedByUserId`.
Además **escribe** en el expediente ajeno: `reviewedByDoctorId`, `reviewedAt` y `doctorComment`
quedan persistidos y aparecerán en la línea de tiempo del paciente víctima como si su médico los
hubiera firmado.

**Agravante R6:** la fila de `audit_log` que se escribe (línea 102) registra
`patientId: <el de la ruta>` — o sea, el paciente **equivocado**. La bitácora queda contaminada:
apunta al paciente del atacante, no al paciente cuyo dato se leyó y modificó.

---

## 2. Tabla completa de endpoints

Leyenda — **R4**: ✅ verifica relación con el paciente del recurso · ⚠️ sólo verifica propiedad del
médico (no `care_relationship`) · ❌ sólo sesión válida · n/a no es dato de un paciente.
**R5**: ✅ identificador uuid no adivinable · n/a sin identificador en ruta.
**R6**: ✅ escribe `audit_log` · ❌ no escribe · n/a.
**Sobreexp.**: ✅ `select` acotado · ⚠️ entidad completa / `include` amplio.

### 2.1 🔴 Casos IDOR (primero)

| Método | Ruta | R4 | R5 | R6 | Sobreexposición | Nota |
|---|---|---|---|---|---|---|
| 🔴 GET | `/patients/:id` | ❌ | ✅ | ❌ | ⚠️ | `patients.controller.ts:46-52`. Sin comprobación alguna; cualquier usuario autenticado. Devuelve `Patient` completo + `PatientGuardian` completo (`guardianCurp`, `guardianIdDocumentKey`). **IDOR-1** |
| 🔴 POST | `/appointments` | ❌ | ✅ | ❌ | ✅ | `appointments.controller.ts:51-61` + `appointment-state-machine.service.ts:73,137`. `patientId` libre en el body y **auto-emite `care_relationship`**. **IDOR-2** |
| 🔴 POST | `/lab-results/patients/:patientId/:resultId/review` | ❌ | ✅ | ❌ | ⚠️ | `lab-results.controller.ts:93-104` + `lab-order.service.ts:169-178`. `resultId` sin acotar al paciente; audita con el `patientId` equivocado. **IDOR-3** |

### 2.2 Expediente clínico — `records` (M8)

| Método | Ruta | R4 | R5 | R6 | Sobreexp. | Nota |
|---|---|---|---|---|---|---|
| POST | `/records/patients/:patientId/encounters` | ✅ | ✅ | ✅ | ✅ | Guard por `params.patientId`; `clinical-encounter.service.ts:68` además exige `body.patientId === param` |
| GET | `/records/patients/:patientId/encounters` | ✅ | ✅ | ✅ | ⚠️ | `include: { notes, diagnoses }` (`clinical-encounter.service.ts:90-96`): una pantalla de lista recibe el texto íntegro de todas las notas |
| GET | `/records/encounters/:encounterId` | ✅ | ✅ | ✅ | ⚠️ | Guard resuelve paciente vía `encounterId` (`care-relationship.guard.ts:100-107`). `include` amplio, justificable en un detalle |
| PATCH | `/records/encounters/:encounterId/note` | ✅ | ✅ | ✅ | ✅ | Autoguardado; sólo DRAFT |
| POST | `/records/encounters/:encounterId/sign` | ✅ | ✅ | ✅ | ✅ | + `DoctorVerifiedGuard` |
| POST | `/records/encounters/:encounterId/correct-note` | ✅ | ✅ | ✅ | ✅ | + `DoctorVerifiedGuard`; valida que la nota original pertenezca al encuentro (`:236-243`) |
| GET | `/records/patients/:patientId/allergies` | ✅ | ✅ | ✅ | ✅ | |
| POST | `/records/patients/:patientId/allergies` | ✅ | ✅ | ✅ | ✅ | |
| PATCH | `/records/patients/:patientId/allergies/:allergyId` | ✅ | ✅ | ✅ | ✅ | `assertAllergyBelongsToPatient` (`patient-clinical.service.ts:185-190`) |
| GET | `/records/patients/:patientId/medications` | ✅ | ✅ | ✅ | ✅ | |
| POST | `/records/patients/:patientId/medications` | ✅ | ✅ | ✅ | ✅ | |
| PATCH | `/records/patients/:patientId/medications/:medicationId` | ✅ | ✅ | ✅ | ✅ | `assertMedicationBelongsToPatient` (`:192-197`) |
| GET | `/records/patients/:patientId/history` | ✅ | ✅ | ✅ | ✅ | |
| POST | `/records/patients/:patientId/history` | ✅ | ✅ | ✅ | ✅ | Versiona el valor previo |
| GET | `/records/patients/:patientId/timeline` | ✅ | ✅ | ✅ | ⚠️ | `patient-clinical.service.ts:138-183`: `include` amplio en recetas y órdenes → expone `qrVerificationToken` (token de la página **pública** `/verificar/:token`), `contentHashSha256`, `pdfFileKey` y snapshots legales completos |
| GET | `/icd10` | n/a | n/a | n/a | ⚠️ | `icd10.controller.ts:26-40`: catálogo público entre autenticados; sin `select` (filas completas) |
| GET | `/note-templates` | n/a | n/a | n/a | ⚠️ | Filtrado por `doctorId` propio (`note-templates.controller.ts:30`) |
| POST | `/note-templates` | n/a | n/a | n/a | ✅ | |
| DELETE | `/note-templates/:id` | n/a | ✅ | n/a | ✅ | Comprueba propiedad (`:58-61`) |
| GET | `/specialty-field-schemas` | n/a | n/a | n/a | ⚠️ | **Funcionalidad nueva sin commitear (escalas).** `specialty-field-schemas.controller.ts:31-38`: sólo `JwtAuthGuard`; no es dato de paciente, criterio correcto. Devuelve filas `SpecialtyFieldSchema` completas |

### 2.3 Recetas — `prescriptions` (M9)

| Método | Ruta | R4 | R5 | R6 | Sobreexp. | Nota |
|---|---|---|---|---|---|---|
| POST | `/prescriptions/encounters/:encounterId` | ✅ | ✅ | ✅ | ✅ | + `DoctorVerifiedGuard`; firma con contraseña+TOTP en ruta ELECTRONIC |
| POST | `/prescriptions/encounters/:encounterId/external-physical` | ✅ | ✅ | ✅ | ✅ | + `DoctorVerifiedGuard` |
| POST | `/prescriptions/:prescriptionId/cancel` | ✅ | ✅ | ✅ | ✅ | Guard resuelve paciente vía `prescriptionId` (`care-relationship.guard.ts:108-115`) |
| GET | `/prescriptions/:prescriptionId/pdf` | ✅ | ✅ | ✅ | ✅ | |
| POST | `/prescriptions/:prescriptionId/confirm-handwritten-delivery` | ✅ | ✅ | ✅ | ✅ | |
| GET | `/medications` | n/a | n/a | n/a | ✅ | `select` explícito (`medications.controller.ts:40-47`) |
| GET | `/verificar/:token` | n/a | ✅ | ❌ | ✅ | **Público, sin guard.** Token = `randomUUID()` por documento (capability). Devuelve folio, fecha, médico, cédula y nombre de paciente enmascarado; nunca contenido clínico (`prescription.service.ts:271-293`). Sin bitácora ni límite de tasa |

### 2.4 Laboratorio — `labs` (M10)

| Método | Ruta | R4 | R5 | R6 | Sobreexp. | Nota |
|---|---|---|---|---|---|---|
| POST | `/lab-orders/encounters/:encounterId` | ✅ | ✅ | ✅ | ✅ | + `DoctorVerifiedGuard` |
| GET | `/lab-orders/:labOrderId/pdf` | ✅ | ✅ | ✅ | ✅ | Guard resuelve paciente vía `labOrderId` (`care-relationship.guard.ts:116-123`) |
| POST | `/lab-orders/:labOrderId/cancel` | ✅ | ✅ | ✅ | ✅ | |
| GET | `/lab-results/patients/:patientId` | ✅ | ✅ | ✅ | ⚠️ | **Nueva sin commitear.** Filas `LabResult` completas, incluido `fileKey` (`lab-order.service.ts:157-159`) |
| GET | `/lab-results/patients/:patientId/:resultId/file` | ✅ | ✅ | ✅ | ✅ | **Nueva sin commitear.** Doble comprobación correcta: `result.patientId !== patientId` → 404 |
| POST | `/lab-results/patients/:patientId` | ✅ | ✅ | ✅ | ✅ | **Nueva sin commitear.** |
| POST | `/lab-results/patients/:patientId/:resultId/review` | ❌ | ✅ | ❌ | ⚠️ | **🔴 IDOR-3** — ver §1 |

### 2.5 Agenda y pacientes — `scheduling` (M4/M5a)

| Método | Ruta | R4 | R5 | R6 | Sobreexp. | Nota |
|---|---|---|---|---|---|---|
| GET | `/patients` | ✅ | n/a | ❌ | ⚠️ | Filtrado por `careRelationships` activo y no vencido (`patient.service.ts:70-75`). Devuelve `Patient` completo por fila |
| POST | `/patients` | n/a | n/a | ❌ | ⚠️ | Crea paciente + `care_relationship` en transacción; sin bitácora |
| GET | `/patients/:id` | ❌ | ✅ | ❌ | ⚠️ | **🔴 IDOR-1** — ver §1 |
| GET | `/appointments` | ⚠️ | n/a | ❌ | ✅ | Acotado a `doctorId` del actuante; `select` de paciente acotado (`appointment-state-machine.service.ts:191`) |
| POST | `/appointments` | ❌ | ✅ | ❌ | ✅ | **🔴 IDOR-2** — ver §1 |
| GET | `/appointments/:id` | ⚠️ | ✅ | ❌ | ✅ | `assertOwnedByCaller` (`appointments.controller.ts:143-150`) compara `appointment.doctorId`, no `care_relationship`. Devuelve nombre, `medicfyId`, `birthDate`, `sexAtBirth` del paciente. Sin bitácora |
| POST | `/appointments/:id/confirm` | ⚠️ | ✅ | ❌ | ✅ | idem |
| POST | `/appointments/:id/start` | ⚠️ | ✅ | ❌ | ✅ | idem |
| POST | `/appointments/:id/complete` | ⚠️ | ✅ | ❌ | ✅ | idem |
| POST | `/appointments/:id/no-show` | ⚠️ | ✅ | ❌ | ✅ | idem |
| POST | `/appointments/:id/cancel` | ⚠️ | ✅ | ❌ | ✅ | idem |
| POST | `/appointments/:id/reschedule` | ⚠️ | ✅ | ❌ | ✅ | idem; crea cita nueva ligada |
| GET | `/doctors/:id/availability` | n/a | ✅ | ❌ | ✅ | **Sin guard, público.** `availability.controller.ts:19` no tiene `@UseGuards`. Revela huecos ocupados de la agenda de cualquier médico |
| GET | `/doctors/me/availability-rules` | n/a | n/a | n/a | ⚠️ | Acotado por `doctorId` actuante |
| POST | `/doctors/me/availability-rules` | n/a | n/a | n/a | ✅ | |
| PATCH | `/doctors/me/availability-rules/:id` | n/a | ✅ | n/a | ✅ | `findFirst({ id, doctorId })` (`availability-rule.service.ts:74`) |
| DELETE | `/doctors/me/availability-rules/:id` | n/a | ✅ | n/a | ✅ | idem (`:110`) |
| GET | `/doctors/me/availability-exceptions` | n/a | n/a | n/a | ⚠️ | Acotado |
| POST | `/doctors/me/availability-exceptions` | n/a | n/a | n/a | ⚠️ | En conflicto devuelve `affectedAppointments` con `patientId` (`availability-exception.service.ts:37-46`) — propios, aceptable |
| DELETE | `/doctors/me/availability-exceptions/:id` | n/a | ✅ | n/a | ✅ | `findFirst({ id, doctorId })` (`:61`) |

### 2.6 Médicos — `doctors` (M2)

| Método | Ruta | R4 | R5 | R6 | Sobreexp. | Nota |
|---|---|---|---|---|---|---|
| GET | `/doctors/me` | n/a | n/a | n/a | ⚠️ | Fila `Doctor` completa; es su propio perfil |
| PATCH | `/doctors/me` | n/a | n/a | ✅ (parcial) | ✅ | Sólo audita el intento **DENIED** de cambiar campo legal (`doctor-profile.service.ts:54-64`); la edición exitosa se audita en `:119` |
| GET | `/doctors/me/documents` | n/a | n/a | ❌ | ⚠️ | Propios |
| POST | `/doctors/me/documents` | n/a | n/a | ❌ | ✅ | |
| POST | `/doctors/me/branding-assets` | n/a | n/a | ❌ | ✅ | |
| GET | `/doctors/me/branding-assets/:kind` | n/a | n/a | ❌ | ✅ | `kind` validado contra lista blanca (`branding-assets.controller.ts:60`) |
| GET | `/doctors/me/services` | n/a | n/a | n/a | ⚠️ | Propios (incluye precios, correcto) |
| POST | `/doctors/me/services` | n/a | n/a | n/a | ✅ | |
| PATCH | `/doctors/me/services/:id` | n/a | ✅ | n/a | ✅ | `assertOwnership` (`service-offering.service.ts:59-64`) |
| DELETE | `/doctors/me/services/:id` | n/a | ✅ | n/a | ✅ | idem |
| GET | `/doctors/me/locations` | n/a | n/a | n/a | ⚠️ | Propios |
| POST | `/doctors/me/locations` | n/a | n/a | n/a | ✅ | |
| PATCH | `/doctors/me/locations/:id` | n/a | ✅ | n/a | ✅ | Comprueba propiedad |
| DELETE | `/doctors/me/locations/:id` | n/a | ✅ | n/a | ✅ | idem |
| GET | `/specialties` | n/a | n/a | n/a | ✅ | **Sin guard, público.** `select` explícito (`specialties.controller.ts:22`) |
| GET | `/admin/doctors` | n/a | n/a | ❌ | ⚠️ | `AdminGuard`. `include: { documents: true }` sobre **todos** los médicos (`doctor-verification.service.ts:20-26`); lectura no auditada |
| GET | `/admin/doctors/:id` | n/a | ✅ | ❌ | ⚠️ | `AdminGuard`. Fila `Doctor` completa + documentos; lectura no auditada |
| POST | `/admin/doctors/:id/verify` | n/a | ✅ | ✅ | ✅ | |
| POST | `/admin/doctors/:id/reject` | n/a | ✅ | ✅ | ✅ | |
| POST | `/admin/doctors/:id/suspend` | n/a | ✅ | ✅ | ✅ | |

### 2.7 Identidad — `identity` (M1)

| Método | Ruta | R4 | R5 | R6 | Sobreexp. | Nota |
|---|---|---|---|---|---|---|
| POST | `/auth/register/patient` | n/a | n/a | ❌ | ✅ | Sin guard (correcto) |
| POST | `/auth/register/doctor` | n/a | n/a | ✅ (parcial) | ✅ | Sólo audita cédula duplicada (`auth.service.ts:126`) |
| POST | `/auth/email/verify` | n/a | n/a | ❌ | ✅ | `userId` + código en el body, sin sesión |
| POST | `/auth/phone/verify` | n/a | n/a | ❌ | ✅ | idem |
| POST | `/auth/login` | n/a | n/a | ✅ | ✅ | SUCCESS y DENIED (`auth.service.ts:214,375,419`) |
| POST | `/auth/mfa/verify` | n/a | n/a | ✅ | ✅ | |
| POST | `/auth/refresh` | n/a | n/a | ❌ | ✅ | Cookie httpOnly |
| POST | `/auth/logout` | n/a | n/a | ❌ | ✅ | |
| POST | `/auth/password/forgot` | n/a | n/a | ❌ | ✅ | Respuesta uniforme |
| POST | `/auth/password/reset` | n/a | n/a | ❌ | ✅ | Revoca sesiones |
| POST | `/auth/mfa/enroll` | n/a | n/a | ❌ | ✅ | |
| POST | `/auth/mfa/disable` | n/a | n/a | ❌ | ✅ | Sin re-autenticación ni TOTP previo |
| GET | `/me` | n/a | n/a | n/a | ✅ | Proyección manual explícita (`me.controller.ts:25-34`) |
| GET | `/consents` | n/a | n/a | n/a | ✅ | Propios |
| POST | `/consents` | n/a | n/a | n/a | ✅ | Append-only |
| GET | `/doctors/me/assistants` | n/a | n/a | n/a | ⚠️ | Rol comprobado inline (`assistant-invitations.controller.ts:31`) |
| POST | `/doctors/me/assistants/invite` | n/a | n/a | ❌ | ✅ | idem |
| POST | `/doctors/me/assistants/accept` | n/a | n/a | ❌ | ✅ | Otorga `UserRole(ASSISTANT)`; **sin bitácora** pese a ser un evento de autorización |
| GET | `/health` | n/a | n/a | n/a | ✅ | Sin guard (correcto) |

---

## 3. R5 — Identificadores en rutas y APIs

**Ningún endpoint falla R5.** Verificado en `medicfy-backend/prisma/schema.prisma`: los 33 modelos
usan `@id @default(uuid())`. No hay un solo `autoincrement()` en el esquema.

Todos los parámetros de ruta y query son UUID: `patientId`, `encounterId`, `prescriptionId`,
`labOrderId`, `resultId`, `allergyId`, `medicationId`, `appointmentId`, `doctorId`, `serviceId`,
`locationId`, `ruleId`, `exceptionId`, el `id` de plantilla y el `token` de verificación
(`randomUUID()`, `prescription.service.ts:146` y `lab-order.service.ts:64`). Los esquemas Zod
además fuerzan `.uuid()` en los bodies (`patient.schema.ts:87-90`).

**Los folios legibles y secuenciales existen pero NO viajan en ninguna ruta** — exactamente lo que
pide R5:

| Campo | Formato | Generación | ¿En ruta? |
|---|---|---|---|
| `Patient.medicfyId` | `MDF-000123` | `nextval('patients_medicfy_id_seq')` — `patient.service.ts:89-96` | **No** |
| `Prescription.folio` | `MDF-2026-000042` | `nextval('prescriptions_folio_seq')` — `common/folio.util.ts:8-15` | **No** |
| `LabOrder.folio` | `MDF-LAB-2026-000001` | `nextval('lab_orders_folio_seq')` — `common/folio.util.ts:17-24` | **No** |

**Dos observaciones (riesgo, no falla actual):**

1. Los folios secuenciales **sí se devuelven en las respuestas** y llegan al frontend. Revelan el
   volumen de pacientes y de recetas emitidas por la plataforma (fuga de inteligencia de negocio).
2. El folio se usa como **ruta de archivo**: `prescriptions/${folio}/receta.pdf`
   (`prescription.service.ts:164`) y `lab-orders/${folio}/orden.pdf` (`lab-order.service.ts:82`).
   Se comprueba en disco: `apps/api/.local-file-storage/prescriptions/MDF-2026-000042/…`.
   Hoy no es explotable — ninguna ruta acepta un `fileKey` del cliente y
   `LocalDiskFileStorageAdapter.resolveSafePath()` (`local-disk-file-storage.adapter.ts:41-50`)
   bloquea el escape del directorio raíz — pero deja un espacio de nombres enumerable en el
   almacenamiento. Al migrar a S3/R2, un bucket mal configurado convierte esto en enumeración
   directa de recetas. Además `lab-results/${patientId}/…` (`lab-results.controller.ts:85`) mete
   el UUID del paciente en la ruta del objeto.

---

## 4. Guards: qué verifican realmente

| Guard | Archivo | Qué verifica | Qué NO verifica |
|---|---|---|---|
| `JwtAuthGuard` | `identity/guards/jwt-auth.guard.ts` | Firma y vigencia del `Bearer`; pone `req.user` | Rol, relación con recurso alguno. **No revisa la revocación de sesión** — el access token sigue siendo válido tras `logout` hasta que expire |
| `AdminGuard` | `identity/guards/admin.guard.ts:12` | `primaryRole ∈ {ADMIN, SUPERADMIN}` del **JWT** | Nada en base de datos: si se degrada a un admin, su token vigente sigue pasando |
| `DoctorVerifiedGuard` | `identity/guards/doctor-verified.guard.ts` | `verification_status === VERIFIED` contra BD | Relación con el paciente |
| **`CareRelationshipGuard`** | `common/guards/care-relationship.guard.ts` | Que el usuario sea médico **y** tenga `care_relationship` ACTIVE y no vencido con el paciente del recurso | — |
| `SchedulingAuthService` | `scheduling/services/scheduling-auth.service.ts` | Qué `Doctor` puede representar el llamante (propio o vía `UserRole(ASSISTANT)` con scope) | Relación con paciente alguno |

**Sí existe un guard de relación médico–paciente** y está bien hecho:

- Resuelve el paciente por `params.patientId`, o vía `encounterId` / `prescriptionId` /
  `labOrderId` con una consulta puntual (`:95-125`).
- Falla cerrado: si no puede resolver paciente, lanza `400` (`:64-66`).
- Trata `expiresAt` vencido como inactivo y marca `EXPIRED` en el momento del acceso
  (`care-relationship.service.ts:60-76`).
- Audita el caso `DENIED` antes de rechazar (`:51-59` y `:70-81`).
- No hay fallback de ASSISTANT — deliberado y correcto para el perímetro clínico.

**Dónde se aplica:** `EncountersController`, `PatientClinicalController`, `PrescriptionsController`,
`LabOrdersController`, `LabResultsController`. **Dónde falta:** `PatientsController.findOne`
(IDOR-1) y `AppointmentsController.create` (IDOR-2). En `LabResultsController.review` el guard
está pero se le escapa el `resultId` (IDOR-3).

**Endpoints sin ningún guard (14 rutas):** las 10 de `/auth`, `GET /health`, `GET /specialties`,
`GET /verificar/:token` y **`GET /doctors/:id/availability`**
(`scheduling/availability.controller.ts:19` — el `@Controller` no lleva `@UseGuards`). Las tres
primeras categorías son correctas por diseño. La última expone públicamente, sin autenticación ni
límite de tasa, qué huecos de la agenda de cualquier médico están ocupados — inferencia indirecta
de actividad clínica.

**No hay `APP_GUARD` global ni interceptor de auditoría global** (verificado: `main.ts` sólo
registra `ApiExceptionFilter`; el único `@Global()` del proyecto es `PrismaModule`). Toda la
autorización y toda la bitácora son opt-in por controlador — por eso los tres olvidos de §1 pasan
silenciosamente.

---

## 5. R6 — Bitácora

El módulo `modules/audit/audit.module.ts` está **vacío** (`@Module({})`). La bitácora real vive en
`modules/identity/services/audit.service.ts` y escribe en `AuditLog`
(`schema.prisma:738-762`), que sí tiene columna dedicada `patientId` e índice `@@index([patientId])`.

**Cobertura correcta (27/27):** los 27 endpoints estrictamente clínicos —
`records/patient-clinical` (9), `records/encounters` (6), `prescriptions` (5), `lab-orders` (3),
`lab-results` (4) — auditan lectura **y** escritura con actor, rol, `patientId`, recurso, IP y
user-agent. Es un trabajo sólido.

**Huecos (13 endpoints que leen o escriben datos identificables del paciente, sin una sola fila
en `audit_log`):**

| # | Endpoint | Qué queda sin registrar |
|---|---|---|
| 1 | `GET /patients` | Lectura del padrón completo de pacientes del médico |
| 2 | `POST /patients` | Alta de paciente **y creación del `care_relationship`** |
| 3 | `GET /patients/:id` | Lectura del expediente demográfico completo (**IDOR-1**) |
| 4 | `GET /appointments` | Lectura de agenda con nombres y `medicfyId` |
| 5 | `POST /appointments` | **Creación/renovación del `care_relationship`** (**IDOR-2**) |
| 6 | `GET /appointments/:id` | Lectura de nombre, `medicfyId`, fecha de nacimiento y sexo |
| 7-12 | `POST /appointments/:id/{confirm,start,complete,no-show,cancel,reschedule}` | Cambios de estado de la atención |
| 13 | `GET /verificar/:token` | Consulta pública de existencia de receta/orden |

Secundarios (PII de médico, no del paciente): `GET /admin/doctors` y `GET /admin/doctors/:id` leen
el expediente de verificación completo con documentos y no dejan rastro; sólo se auditan
`verify` / `reject` / `suspend`. `POST /doctors/me/assistants/accept` otorga
`UserRole(ASSISTANT)` sin bitácora.

**Calidad de la bitácora:**
- `getRequestMeta` (`identity/request-meta.ts:5`) usa `req.ip`. Sin `app.set('trust proxy', …)`
  en `main.ts`, detrás de un balanceador todas las filas quedarán con la IP del proxy.
- La escritura de auditoría no es transaccional con la operación auditada: si el `audit_log`
  falla, la operación clínica ya se hizo (o, en los `auditRead` que van *antes* de la consulta,
  se registra un acceso que quizá terminó en error).
- En **IDOR-3** la fila se escribe con el `patientId` equivocado (§1).

---

## 6. Sobreexposición de campos — resumen

| Endpoint | Problema | Archivo:línea |
|---|---|---|
| `GET /patients/:id` | Entidad `Patient` completa + `PatientGuardian` completo. El frontend (`use-patient-clinical.ts:10-24`) usa ~15 de ~30 campos; sobran `curp`, `genderIdentity`, domicilio completo, `userId`, `createdByUserId`, `source`, y del tutor `guardianCurp`, `guardianEmail`, `guardianIdDocumentKey` | `patients.controller.ts:48-51` |
| `GET /patients` | Igual, multiplicado por todo el padrón. Sin `select` | `patient.service.ts:71-74` |
| `GET /records/patients/:patientId/timeline` | `include` amplio: expone `qrVerificationToken` (capability del endpoint **público** `/verificar/:token`), `contentHashSha256`, `pdfFileKey` y snapshots legales completos | `patient-clinical.service.ts:145-154` |
| `GET /records/patients/:patientId/encounters` | `include: { notes, diagnoses }` en una **lista**: texto íntegro de todas las notas para pintar un índice | `clinical-encounter.service.ts:91-95` |
| `GET /lab-results/patients/:patientId` | Filas completas con `fileKey` y `fileHashSha256` | `lab-order.service.ts:158` |
| `POST /lab-results/.../review` | Devuelve la fila completa del resultado **de otro paciente** | `lab-order.service.ts:174-177` |
| `GET /admin/doctors`, `/admin/doctors/:id` | `Doctor` completo + `DoctorDocument` completos para toda la cola | `doctor-verification.service.ts:21-25, 29-32` |
| `GET /icd10` | Filas de catálogo completas, sin `select` | `icd10.controller.ts:26-40` |

Contraejemplos bien hechos, que muestran que el patrón correcto ya existe en el código:
`GET /medications` (`medications.controller.ts:40-47`), `GET /me` (`me.controller.ts:25-34`),
`GET /specialties` (`specialties.controller.ts:22`), `listForDoctor` y `findByIdWithDetails`
(`appointment-state-machine.service.ts:166,191`).

---

## 7. Correcciones propuestas (por orden de urgencia)

1. **IDOR-2 primero.** `AppointmentStateMachineService.create()` debe exigir vínculo previo
   (`hasActiveRelationship`) **o** una autorización explícita del paciente antes de invocar
   `createOrRenew`. Mientras un médico pueda emitirse su propio vínculo, `CareRelationshipGuard` es
   decorativo. Añadir bitácora a la creación/renovación de `care_relationship`, dentro del servicio.
2. **IDOR-1.** Aplicar `CareRelationshipGuard` a `PatientsController.findOne` renombrando el
   parámetro a `:patientId` (el guard ya lo resuelve solo), y devolver una proyección `select`
   acotada a lo que la pantalla usa.
3. **IDOR-3.** En `LabOrderService.reviewResult()` recibir `patientId` y comprobar
   `result.patientId !== patientId → 404`, copiando literalmente `getResultFile()` (líneas
   161-167). Añadir la prueba cruzada que ya existe para `file` (`lab-results.integration.spec.ts:126`).
4. **Regla estructural:** que `resolvePatientId` del guard cubra también `resultId`,
   `allergyId` y `medicationId`, y que ningún handler acepte un id de sub-recurso que el guard no
   haya resuelto. Alternativa más fuerte: `APP_GUARD` global con lista blanca explícita de rutas
   públicas, para que un endpoint nuevo nazca cerrado por omisión.
5. **R6:** interceptor global de bitácora, o al menos cubrir los 13 endpoints de §5.
6. **Sobreexposición:** `select` explícito en `Patient`, `LabResult` y en los `include` de
   `timeline`; sacar `qrVerificationToken` y `pdfFileKey` de toda respuesta.
7. **Menores:** límite de tasa en `/auth/*` y `/verificar/:token` (no hay `@nestjs/throttler` ni
   `helmet` en el proyecto); `trust proxy` para que la bitácora registre la IP real;
   re-autenticación en `POST /auth/mfa/disable`; revocación de access tokens en `logout`.

---

## 8. Funcionalidad nueva sin commitear — veredicto

| Módulo | Endpoints | Veredicto |
|---|---|---|
| `catalog` (`ClinicalCatalogTerm`) | **0** | `catalog.module.ts` declara `providers`/`exports` y **ningún controller** — sin superficie HTTP, nada que auditar. El servicio nunca se inyecta fuera de su propio spec |
| `lab-results` | 4 | 3 correctos. **`POST …/:resultId/review` es IDOR-3.** Es la única regresión de autorización introducida por el trabajo sin commitear |
| `specialty-field-schemas` (escalas) | 1 | Correcto. Sólo `JwtAuthGuard`; no expone dato de paciente (criterio consistente con `/icd10`). El cálculo de Glasgow/Apgar es **autoritativo en servidor** (`specialty-scale.service.ts:35-65`) y nunca confía en un total del cliente — bien hecho |
| Escalas en encuentro (`EncounterSpecialtyData`) | vía `/records/encounters/:encounterId/{note,sign}` | Correcto. Ambas rutas pasan por `CareRelationshipGuard` y auditan |
