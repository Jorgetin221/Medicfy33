# P1 — Inventario del monorepo Medicfy

> **Auditoría de solo lectura.** No se escribió ni modificó una sola línea de código del producto. Todo lo que sigue sale de leer el árbol de trabajo tal como está hoy (26 de agosto de 2026), incluyendo los cambios sin commitear (módulo `catalog`, escalas por especialidad, cálculo de signos vitales, 3 migraciones nuevas).

## 0. Nota de procedencia y método

| Punto | Hallazgo |
|---|---|
| Ubicación real del repo | El monorepo **no** está en `/home/claude/medicfy`; está en **`/root/medicfy`**. Todas las rutas de este documento son relativas a esa raíz (`medicfy-backend/...`, `medicfy-frontend/...`), tal como se pidió. |
| Control de versiones | **No hay repositorio Git.** Ni `/root/medicfy`, ni `medicfy-backend/`, ni `medicfy-frontend/` contienen `.git`. `git status` falla con *"not a git repository"* en los tres. Por lo tanto **no se puede distinguir "lo commiteado" de "lo sin commitear"**: la nota del encargo sobre los cambios pendientes se toma como dato externo, no verificable desde el árbol. |
| Dos repos, no uno | `medicfy-backend/` y `medicfy-frontend/` son dos monorepos pnpm+turbo **independientes**, cada uno con su propio `pnpm-workspace.yaml`, `turbo.json`, `package.json`, `CLAUDE.md`, `.env` y `docs/`. No hay workspace raíz que los una. |
| `packages/contracts` está **duplicado** | El paquete `@medicfy/contracts` existe físicamente dos veces (`medicfy-backend/packages/contracts/` y `medicfy-frontend/packages/contracts/`), sincronizado a mano. Hoy ya **divergen**: el backend tiene `schemas/catalog.schema.ts` y su `export` en `index.ts`; el frontend no. Es la única diferencia. |
| Archivos fuente inventariados | 321 archivos fuera de `node_modules`/`.next`/`dist` (excluyendo el almacén local de archivos `apps/api/.local-file-storage/`, que contiene ~20 PNG de firmas de prueba). |

**Cifras de cabecera**

| Métrica | Valor |
|---|---|
| Módulos NestJS registrados en `AppModule` | 13 (11 de dominio + `PrismaModule` + `HealthModule`) |
| Endpoints HTTP | **93** (incluye `GET /health`) |
| Entidades Prisma (`model`) | **42** |
| Enums Prisma | **38** |
| Migraciones SQL | 20 |
| Rutas del frontend (App Router) | 15 (4 públicas + 11 autenticadas) |
| Archivos de prueba | 23 en el backend (16 de integración + 7 de validadores) · 7 en el frontend (copia de los mismos validadores) |
| Casos `it()` | 155 (`apps/api`) + 30 (contratos backend) = **185**; el frontend re-ejecuta los mismos 30. 3 `it.todo` pendientes. |
| Pruebas de UI (React/Playwright) | **0** |

---

## 1. Módulos existentes y su estado aparente

### 1.1 Backend — módulos NestJS (`medicfy-backend/apps/api/src/modules/*`)

Leyenda: **Terminado** = controllers + servicios + pruebas de integración que cubren sus reglas · **A medias** = funciona pero con superficie o reglas declaradas y no construidas · **Esqueleto** = clase `@Module({})` vacía o sin API.

| Módulo | Estado | Evidencia |
|---|---|---|
| `identity` (M1) | **Terminado** | 5 controllers (`auth`, `me`, `mfa`, `consents`, `assistant-invitations`), 14 servicios, 3 guards (`JwtAuthGuard`, `DoctorVerifiedGuard`, `AdminGuard`). Cubre registro paciente/médico, verificación email/teléfono, login con MFA TOTP, bloqueo exponencial por fuerza bruta, rotación de refresh en cookie httpOnly, reset de contraseña, consentimientos append-only, invitación de asistentes. Pruebas: `m1.integration.spec.ts` (13 casos, M1-CA-001…006 + M1-RN-008) y `doctor-verification-enforcement.integration.spec.ts` (5). **Hueco declarado en el propio código**: `me.controller.ts` documenta que `PATCH /me` está diferido a propósito. |
| `doctors` (M2) | **Terminado** | 7 controllers (`doctors`, `doctor-documents`, `branding-assets`, `practice-locations`, `doctor-services`, `admin-doctors`, `specialties`), 6 servicios + 2 puertos con adaptador (`FILE_STORAGE_PORT` → `LocalDiskFileStorageAdapter`, `DOCTOR_SUSPENSION_EFFECTS` → `AppointmentCancellationSuspensionAdapter`). Perfil, documentos con hash SHA-256, logo/firma visual, consultorios, servicios con precio privado, cola de verificación admin (verificar/rechazar/suspender). Pruebas: `m2.integration.spec.ts`, 20 casos, M2-CA-001…009. **A medias en un punto**: el almacenamiento de archivos es disco local (`.local-file-storage/`), no S3/R2 con SSE-KMS ni URLs prefirmadas como pide `CLAUDE.md` §3. |
| `scheduling` (M4 + M5a) | **Terminado** | 5 controllers (`availability`, `availability-rules`, `availability-exceptions`, `patients`, `appointments`), 8 servicios incluyendo `AppointmentStateMachineService` (419 líneas). Reglas de disponibilidad semanales, excepciones, cálculo de espacios en servidor, alta de pacientes con `medicfyId` por secuencia Postgres, tutores de menores, `care_relationship`, máquina de estados completa de citas con snapshot inmutable de política de cancelación. Pruebas: `m4.integration.spec.ts` (20) + `m5a.integration.spec.ts` (27) + prueba de carga k6 real para doble agendamiento. **A medias**: M5b (pantallas públicas de agendamiento, recordatorios, portal del paciente) no existe; `AppointmentsController` documenta que solo construye la superficie DOCTOR/ASSISTANT. Los barridos automáticos (`releaseExpired*`, `markExpiredAsNoShow`) existen pero **no hay scheduler** que los invoque — son métodos llamados solo desde las pruebas. |
| `records` (M8) | **A medias** | 5 controllers (`patient-clinical`, `encounters`, `icd10`, `note-templates`, `specialty-field-schemas`), 3 servicios. Encuentro con borrador autoguardado en `draftContent`, firma con hash encadenado, corrección de nota firmada, alergias/medicamentos/antecedentes, línea de tiempo, catálogo CIE-10 (~12,500 códigos oficiales DGIS), plantillas de nota, motor de escalas. Pruebas: 6 archivos, 39 casos. **Huecos concretos**: (a) `ClinicalAttachment` está en el esquema y **ningún archivo TypeScript lo referencia** — tabla muerta, sin endpoint de adjuntos; (b) `SpecialtyFieldSchema` solo tiene sembrada la sección `ESCALAS` con `specialtyId = null` (Glasgow + Apgar, 16 campos): las secciones `ANTECEDENTES`, `INTERROGATORIO`, `EXPLORACION`, `SEGUIMIENTO` y las cuatro especialidades del piloto no tienen ni una fila; (c) no existe `PATCH /patients/:id` (el propio `tab-datos-generales.tsx` lo dice: "todavía no existe en el backend"). |
| `prescriptions` (M9) | **Terminado** | 3 controllers (`prescriptions`, `verification`, `medications`), 2 servicios. Receta electrónica con folio por secuencia, snapshots legales inmutables, dos rutas de firma (`HANDWRITTEN_AFTER_PRINT` / `ELECTRONIC` con contraseña+TOTP), bloqueo duro de Grupos I/II, registro de receta física externa, cancelación por fila satélite, PDF con PDFKit, QR y verificación pública. Cruce automático contra alergias activas y duplicidad terapéutica por prefijo ATC. Pruebas: 2 archivos, 7 casos + cobertura en `append-only`. **A medias**: el catálogo de medicamentos son **10 filas sintéticas** sembradas a mano (`seed.ts` lo declara: "Poblar el Cuadro Básico completo queda pendiente"). |
| `labs` (M10) | **A medias — por diseño declarado** | 2 controllers (`lab-orders`, `lab-results`), 2 servicios. Orden con folio, PDF, QR, dos rutas de firma, cancelación, subida y revisión de resultados. Pruebas: 2 archivos, 7 casos. El encabezado del módulo dice literal *"M10 — ÓRDENES DE LABORATORIO (parcial en MVP)"*: no hay portal de laboratorio, `assignedLabId` existe en el esquema y nunca se usa, y la subida como paciente no está construida (`lab-results.controller.ts` lo documenta). |
| `catalog` (Prompt 7-8, **cambio nuevo**) | **A medias — repositorio sin API** | `catalog.module.ts` declara `providers: [ClinicalCatalogService]` y **`controllers: []` a propósito**: el comentario dice *"Sin controllers: el prompt pide esquema, migraciones y repositorio de acceso — la API llega en un prompt posterior"*. El servicio (150 líneas) implementa `create`/`findActive`/`resolveCurrent`/`obsolete`/`merge`/`findPotentialDuplicates` con normalización de términos (`term-normalizer.util.ts`). Bien probado: `clinical-catalog.integration.spec.ts`, **17 casos**. Nada del resto de la aplicación lo consume todavía. 3 migraciones nuevas lo respaldan. |
| `admin` | **Esqueleto** | `admin.module.ts` = `@Module({}) export class AdminModule {}`. Cero providers, cero controllers. La funcionalidad de administración real vive en `doctors/admin-doctors.controller.ts`. |
| `audit` | **Esqueleto** | `audit.module.ts` vacío. `AuditService` vive en `identity/services/audit.service.ts` y es **solo de escritura**: no hay ningún `auditLog.findMany` en el código, así que la bitácora que R3/§7.15 exige poder consultar no tiene endpoint de lectura. Falta también el encadenamiento de hash (`prev_entry_hash`/`entry_hash`, diferido a M15 según el comentario del modelo). |
| `billing` (M6) | **Esqueleto** | `billing.module.ts` vacío. Hay columnas reservadas en el esquema (`Doctor.subscriptionPlan`, `subscriptionStatus`, `Appointment.paymentReference`, `paymentDeadlineAt`) marcadas como *"placeholder columns"*. `CRITERIOS_DIFERIDOS.md` confirma: *"No hay pasarela de pago — `confirmPayment()` solo cambia un `status`, nunca ha cobrado nada real"*. |
| `notifications` | **Esqueleto** | `notifications.module.ts` vacío. El único mecanismo real es `NOTIFICATION_PORT` → `ConsoleNotificationAdapter` (48 líneas) en `identity`, que imprime a consola. Sin Redis, sin BullMQ, sin correo, sin SMS. |

**Infraestructura transversal del backend**

| Pieza | Estado | Evidencia |
|---|---|---|
| `PrismaModule` / `PrismaService` | Terminado | `apps/api/src/prisma/` |
| `HealthModule` | Terminado | `GET /health` → `{status:"ok"}` |
| `common/` | Terminado | `ApiException` + filtro global, `ZodValidationPipe`, `CareRelationshipGuard`, `content-hash.util`, `folio.util`, `legal-snapshot.util`, `omit-undefined`, **`vitals-calculations.util.ts`** (IMC calculado en servidor con fórmula y versión guardadas — cambio nuevo). |
| `config/env.schema.ts` | Terminado | Variables tipadas y validadas al arranque (`main.ts` llama `validateEnv`). |
| OpenAPI | Terminado (con salvedad documentada) | `SwaggerModule` en `/api/docs`; el comentario aclara que es OpenAPI 3.0, no 3.1 como pide la spec. |
| `infra/` (Terraform) | **Esqueleto** | 4 archivos, **34 líneas en total**; `main.tf` son 3 líneas de comentario: *"Resources are added as each module needs them, not speculatively"*. Cero recursos declarados. |

### 1.2 Frontend — áreas funcionales (`medicfy-frontend/apps/web/src`)

| Área | Estado | Evidencia |
|---|---|---|
| Escritorio de consulta (`app/(app)/consulta/**`) | **A medias** | 6 archivos, ~950 líneas: `consulta-screen.tsx` (orquestación + arranque del encounter), `consulta-form.tsx` (450 líneas, SOAP + atajos + autoguardado), `consulta-sidebar.tsx`, `consulta-readonly.tsx`, `types.ts`, más la variante sin cita `consulta/paciente/[patientId]/`. Ver §7 para el desglose contra las cuatro zonas. |
| Expediente del paciente (`app/(app)/pacientes/[id]/**`) | **A medias** | `expediente-screen.tsx` + 5 pestañas (Datos generales, Antecedentes, Notas, Recetas, Órdenes y resultados). El propio archivo declara el hueco: *"«Documentos» (adjuntos genéricos) no tiene backend en este pase — se omite en vez de mostrar una pestaña vacía"*. Datos generales es **solo lectura** por falta de `PATCH /patients/:id`. |
| Agenda (`app/(app)/agenda`) | **Terminado** | 217 líneas; lista del día, confirmar/iniciar/cancelar/no-show/cerrar sin nota con justificación ≥10 caracteres. |
| Alta de cita y de paciente | Terminado | `citas/nueva` (302 líneas, selector de espacios agrupados por día) y `pacientes/nuevo` (215 líneas; declara que deja fuera dirección, contacto de emergencia, tipo de sangre y CURP). |
| Perfil del médico (`app/(app)/perfil`) | **Terminado** | 951 líneas — la pantalla más grande del proyecto: datos legales, contacto profesional, logo/frase de encabezado, firma visual, consultorios, servicios, documentos, MFA con QR (`qrcode`), invitación de asistentes. |
| Disponibilidad (`app/(app)/disponibilidad`) | Terminado | 625 líneas: reglas semanales, excepciones, consultorios y servicios. |
| Admin de verificación (`app/(app)/admin/verificacion`) | Terminado | Lista con filtro por estado + detalle con documentos, hash, aprobar/rechazar/suspender. |
| Componentes clínicos (`components/clinical/`) | Terminado | 9 componentes: `allergy-summary`, `antecedentes-editor`, **`escalas-section`** (nuevo), `icd10-picker`, `lab-order-panel`, `medication-picker`, `note-template-bar`, `prescription-panel`, **`vitals-fields`**. |
| Design system (`components/ui/`) | **A medias** | 11 primitivos propios (`alert`, `button`, `field`, `file-upload`, `landing-icons`, `panel`, `save-indicator`, `states`, `status-badge`, `tabs`, `timeline`). `components.json` sugiere shadcn/ui, pero **no hay `node_modules` de Radix ni dependencias shadcn en `package.json`**: los primitivos están escritos a mano. |
| `packages/ui` | **Esqueleto** | `packages/ui/src/index.ts` contiene exactamente `export {};`. El paquete existe, está vacío, y `apps/web` **no lo importa** (usa `@/components/ui/*`). |
| PWA | **No existe** | El producto se describe como PWA. No hay `manifest.json`, ni service worker, ni `next-pwa`/Workbox en ningún lado. `next.config.ts` son 5 líneas (`reactStrictMode: true`). Lo único "offline" real es `offline-draft-store.ts` (IndexedDB + AES-GCM). |
| Portal del paciente | **No existe** | Hay endpoints `POST /auth/register/patient` y roles `PATIENT`, pero **ninguna pantalla** de registro ni de sesión de paciente. |

---

## 2. Rutas del frontend

Next.js 15 App Router. Todas las pantallas son `"use client"`. El grupo `(app)` añade `AppNav` (barra persistente) y cada página aplica su propio guard: si `!accessToken` → `router.replace("/login")`.

### 2.1 Públicas (fuera de `(app)`, sin `AppNav`, sin guard)

| Ruta | Archivo | Qué renderiza |
|---|---|---|
| `/` | `medicfy-frontend/apps/web/src/app/page.tsx` | Landing de venta al médico (PUB-01): 6 tarjetas de características + CTA a `/registro-medico`. 232 líneas. |
| `/login` | `.../app/login/page.tsx` | PUB-04. Formulario email+contraseña; si la respuesta trae `mfaRequired`, cambia a un segundo paso con código TOTP. Al entrar, `router.push("/agenda")`. |
| `/registro-medico` | `.../app/registro-medico/page.tsx` | PUB-03. Máquina de 3 pasos en una sola pantalla: `form` (datos + selector de especialidad desde `GET /specialties`) → `verify` (código de 6 dígitos) → `done`. |
| `/verificar/[token]` | `.../app/verificar/[token]/page.tsx` | Verificación pública de receta u orden de laboratorio: folio, fecha, estado, médico y nombre de paciente enmascarado. Nunca contenido clínico (M9-RN-010). |

### 2.2 Autenticadas (grupo `(app)`, con `AppNav`)

| Ruta | Archivo | Qué renderiza |
|---|---|---|
| `/agenda` | `.../app/(app)/agenda/page.tsx` | DOC-01. Citas del día (resueltas por el servidor en `America/Mexico_City`), con acciones por renglón: Confirmar · Iniciar · Cancelar · No se presentó · Continuar consulta · Cerrar sin nota clínica (con justificación). "Iniciar" solo navega a `/consulta/{id}`. |
| `/citas/nueva` | `.../app/(app)/citas/nueva/page.tsx` | Alta de cita: selector de paciente + servicio, espacios disponibles agrupados por día desde `GET /doctors/:id/availability`. Envuelta en `Suspense` (usa `useSearchParams`). |
| `/pacientes` | `.../app/(app)/pacientes/page.tsx` | DOC-04. Lista de pacientes con `care_relationship` activo, con filtro de texto en cliente. |
| `/pacientes/nuevo` | `.../app/(app)/pacientes/nuevo/page.tsx` | Alta mínima de paciente; si `isMinor(birthDate)` despliega los campos de tutor. |
| `/pacientes/[id]` | `.../app/(app)/pacientes/[id]/page.tsx` → `expediente-screen.tsx` | Expediente: encabezado con nombre/ID/edad/sexo, alergias activas destacadas, botón "Iniciar consulta sin cita", y 5 pestañas → `tab-datos-generales` (solo lectura), `tab-antecedentes`, `tab-notas` (acordeón que carga el detalle de cada encuentro), `tab-recetas` (PDF, cancelar, confirmar entrega autógrafa), `tab-ordenes` (PDF, cancelar, subir/ver resultados). |
| `/consulta/[appointmentId]` | `.../app/(app)/consulta/[appointmentId]/page.tsx` → `consulta-screen.tsx` | **DOC-06, el Escritorio de Consulta.** Arranca la cita (`POST /appointments/:id/start`), crea o recupera el encounter, decide `FIRST_VISIT` vs `FOLLOW_UP` según haya encuentros firmados previos, y renderiza `ConsultaSidebar` + (`ConsultaForm` \| `ConsultaReadonly`). Estados especiales: `blocked` (cita no iniciable), `abandoned` (borrador >72 h), `error`. |
| `/consulta/paciente/[patientId]` | `.../app/(app)/consulta/paciente/[patientId]/page.tsx` → `paciente-consulta-screen.tsx` | Consulta **sin cita**. Reutiliza tal cual `ConsultaSidebar`/`ConsultaForm`/`ConsultaReadonly`; busca un DRAFT sin `appointmentId` o crea uno nuevo. |
| `/disponibilidad` | `.../app/(app)/disponibilidad/page.tsx` | Reglas de disponibilidad semanales, excepciones/bloqueos, consultorios y servicios con precio. |
| `/perfil` | `.../app/(app)/perfil/page.tsx` | Perfil completo del médico + MFA (QR) + documentos + marca (logo/frase/firma) + asistentes. |
| `/admin/verificacion` | `.../app/(app)/admin/verificacion/page.tsx` | Cola de verificación de médicos filtrable por `verification_status`. |
| `/admin/verificacion/[doctorId]` | `.../app/(app)/admin/verificacion/[doctorId]/page.tsx` | Detalle: documentos con hash SHA-256, aprobar (con o sin especialidad confirmada), rechazar con motivo, suspender. |

**Rutas que la especificación implica y no existen:** registro/portal de paciente, agendamiento público, `/documentos` del expediente, consulta de bitácora de accesos, cualquier pantalla de facturación/suscripción.

---

## 3. Entidades del modelo de datos

Fuente única: `medicfy-backend/prisma/schema.prisma` (1,528 líneas). **42 `model` · 38 `enum`.** En las tablas siguientes, `TIMESTAMPTZ` = `@db.Timestamptz(3)` y `DATE` = `@db.Date`. Los campos marcados "relación →" son relaciones de Prisma, no columnas.

### 3.1 Enums

| Enum | Valores |
|---|---|
| `UserStatus` | PENDING_EMAIL, ACTIVE, SUSPENDED, DEACTIVATED |
| `RoleName` | PATIENT, DOCTOR, ASSISTANT, LAB, SUPPORT, ADMIN, SUPERADMIN |
| `ConsentType` | PRIVACY_NOTICE, SENSITIVE_DATA, TELEMEDICINE, DIGITAL_PRESCRIPTION_CHANNEL, MARKETING |
| `DoctorVerificationStatus` | DRAFT, SUBMITTED, IN_REVIEW, VERIFIED, VERIFIED_SPECIALTY_UNCONFIRMED, REJECTED, SUSPENDED |
| `VerificationChannel` | EMAIL, PHONE |
| `AssistantInvitationStatus` | PENDING, ACCEPTED, EXPIRED, REVOKED |
| `AuditResult` | SUCCESS, DENIED |
| `DoctorDocumentType` | CEDULA_PROFESIONAL, CEDULA_ESPECIALIDAD, INE, CV, CERTIFICADO_CONSEJO, COMPROBANTE_DOMICILIO |
| `DoctorDocumentReviewStatus` | PENDING, APPROVED, REJECTED |
| `ServiceType` | FIRST_VISIT, FOLLOW_UP, TELECONSULTATION, PROCEDURE |
| `PriceVisibility` | PRIVATE, SHARED_ON_BOOKING |
| `AppointmentModality` | IN_PERSON, ONLINE |
| `PatientSource` | SELF_SIGNUP, CREATED_BY_DOCTOR |
| `SexAtBirth` | F, M |
| `GuardianRelation` | MADRE, PADRE, TUTOR_LEGAL, OTRO |
| `CareRelationshipStatus` | ACTIVE, EXPIRED, REVOKED |
| `CareRelationshipOrigin` | APPOINTMENT, PATIENT_GRANTED, CREATED_BY_DOCTOR |
| `AppointmentStatus` | PENDING_PAYMENT, SCHEDULED, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED_BY_PATIENT, CANCELLED_BY_DOCTOR, NO_SHOW |
| `AppointmentCreatedVia` | DOCTOR_PANEL, ASSISTANT, PATIENT_LINK, PUBLIC_DIRECTORY |
| `EncounterType` | FIRST_VISIT, FOLLOW_UP, TELECONSULTATION, URGENT |
| `EncounterStatus` | DRAFT, SIGNED |
| `SignatureMethod` | INTERNAL_SYSTEM, ADVANCED_EFIRMA *(la segunda sin implementación detrás)* |
| `DiagnosisType` | PRINCIPAL, SECONDARY |
| `DiagnosisCertainty` | SUSPECTED, CONFIRMED |
| `ClinicalAttachmentCategory` | LAB_RESULT, IMAGING, EXTERNAL_DOCUMENT, PHOTO, OTHER |
| `AllergyStatus` | ACTIVE, INACTIVE, RULED_OUT |
| `AllergyCertainty` | CONFIRMED, LIKELY, UNCERTAIN |
| `PatientMedicationStatus` | ACTIVE, SUSPENDED, COMPLETED |
| `PatientHistoryCategory` | HEREDOFAMILIAR, PERSONAL_NO_PATOLOGICO, PERSONAL_PATOLOGICO |
| `PatientHistoryStatus` | PRESENTE, NEGADO, DESCONOCIDO, NO_INVESTIGADO |
| `ControlGroup` | I, II, III, IV, V, VI |
| `SpecialtyFieldSection` | ANTECEDENTES, INTERROGATORIO, EXPLORACION, ESCALAS, SEGUIMIENTO |
| `SpecialtyFieldInputType` | NUMBER, TEXT, TEXTAREA, SELECT, MULTISELECT, BOOLEAN, DATE, COMPUTED |
| `PrescriptionType` | ELECTRONIC, EXTERNAL_PHYSICAL |
| `PrescriptionSignatureRoute` | HANDWRITTEN_AFTER_PRINT, ELECTRONIC |
| `LabOrderSignatureRoute` | HANDWRITTEN_AFTER_PRINT, ELECTRONIC |
| `LabResultUploaderRole` | DOCTOR, PATIENT |
| `ClinicalCatalogTermStatus` | ACTIVE, OBSOLETE, MERGED |

### 3.2 Tablas *append-only* reales (a nivel de `GRANT` de PostgreSQL)

`clinical_notes`, `prescriptions`, `lab_orders`, `audit_log`, `consents`, `appointment_status_history`, `prescription_cancellations`, `prescription_handwritten_deliveries`, `lab_order_cancellations`, `patient_history_item_changes`. El rol `medicfy_app` tiene solo `SELECT`+`INSERT`; el `UPDATE`/`DELETE` está revocado en la migración, no solo evitado en el código. `append-only.integration.spec.ts` lo prueba contra la base real.

### 3.3 Entidades, campo por campo

**`User`** — tabla `users`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `email` | `String` | @unique |
| `phoneE164` | `String?` |  |
| `passwordHash` | `String` |  |
| `primaryRole` | `RoleName` |  |
| `status` | `UserStatus` | @default(PENDING_EMAIL) |
| `emailVerifiedAt` | `DateTime?` | TIMESTAMPTZ |
| `phoneVerifiedAt` | `DateTime?` | TIMESTAMPTZ |
| `mfaEnabled` | `Boolean` | @default(false) |
| `mfaSecretEncrypted` | `String?` |  |
| `mfaBackupCodesHashed` | `String[]` | @default([]) |
| `loginsWithoutMfa` | `Int` | @default(0) |
| `failedLoginAttempts` | `Int` | @default(0) |
| `lockedUntil` | `DateTime?` | TIMESTAMPTZ |
| `lockoutCount` | `Int` | @default(0) |
| `lastLoginAt` | `DateTime?` | TIMESTAMPTZ |
| `lastLoginIp` | `String?` |  |
| `acceptedTermsVersion` | `String?` |  |
| `acceptedPrivacyVersion` | `String?` |  |
| `acceptedAt` | `DateTime?` | TIMESTAMPTZ |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `updatedAt` | `DateTime` | @updatedAt TIMESTAMPTZ |
| `roles` | `UserRole[]` | relación → `UserRole` |
| `consents` | `Consent[]` | relación → `Consent` |
| `sessions` | `Session[]` | relación → `Session` |
| `doctor` | `Doctor?` | relación → `Doctor` |
| `patient` | `Patient?` | relación → `Patient` |
| `invitations` | `AssistantInvitation[]` | relación → `AssistantInvitation` @relation("InvitingDoctor") |
| `verificationCodes` | `VerificationCode[]` | relación → `VerificationCode` |
| `passwordResets` | `PasswordResetToken[]` | relación → `PasswordResetToken` |

**`UserRole`** — tabla `user_roles`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `userId` | `String` |  |
| `role` | `RoleName` |  |
| `scopeId` | `String?` |  |
| `grantedBy` | `String?` |  |
| `grantedAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `user` | `User` | relación → `User` @relation(fields: [userId], references: [id]) |

Índices/restricciones: `@@unique([userId, role, scopeId])`

**`Consent`** — tabla `consents`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `userId` | `String` |  |
| `consentType` | `ConsentType` |  |
| `documentVersion` | `String` |  |
| `granted` | `Boolean` |  |
| `ipAddress` | `String` |  |
| `userAgent` | `String` |  |
| `evidenceHash` | `String` |  |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `user` | `User` | relación → `User` @relation(fields: [userId], references: [id]) |

**`Session`** — tabla `sessions`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `userId` | `String` |  |
| `refreshTokenHash` | `String` | @unique |
| `deviceFingerprint` | `String?` |  |
| `ip` | `String?` |  |
| `userAgent` | `String?` |  |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `lastUsedAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `expiresAt` | `DateTime` | TIMESTAMPTZ |
| `revokedAt` | `DateTime?` | TIMESTAMPTZ |
| `user` | `User` | relación → `User` @relation(fields: [userId], references: [id]) |

**`Doctor`** — tabla `doctors`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `userId` | `String` | @unique |
| `legalFirstName` | `String` |  |
| `legalLastName` | `String` |  |
| `professionalLicense` | `String` | @unique |
| `specialtyLicense` | `String?` |  |
| `primarySpecialtyId` | `String?` |  |
| `displayName` | `String?` |  |
| `photoUrl` | `String?` |  |
| `biography` | `String?` |  |
| `professionalPhone` | `String?` |  |
| `professionalEmail` | `String?` |  |
| `letterheadPhrase` | `String?` |  |
| `logoUrl` | `String?` |  |
| `signatureImageUrl` | `String?` |  |
| `secondarySpecialtyIds` | `String[]` | @default([]) |
| `yearsExperience` | `Int?` |  |
| `languages` | `String[]` | @default([]) |
| `university` | `String?` |  |
| `verificationStatus` | `DoctorVerificationStatus` | @default(SUBMITTED) |
| `verificationNotes` | `String?` |  |
| `verifiedByUserId` | `String?` |  |
| `verifiedAt` | `DateTime?` | TIMESTAMPTZ |
| `acceptsTeleconsultation` | `Boolean` | @default(false) |
| `acceptsNewPatients` | `Boolean` | @default(true) |
| `minBookingNoticeMinutes` | `Int` | @default(120) |
| `maxBookingWindowDays` | `Int` | @default(90) |
| `cancellationPolicy` | `Json?` |  |
| `subscriptionPlan` | `String?` |  |
| `subscriptionStatus` | `String?` |  |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `updatedAt` | `DateTime` | @updatedAt TIMESTAMPTZ |
| `user` | `User` | relación → `User` @relation(fields: [userId], references: [id]) |
| `primarySpecialty` | `Specialty?` | relación → `Specialty` @relation(fields: [primarySpecialtyId], references: [id]) |
| `documents` | `DoctorDocument[]` | relación → `DoctorDocument` |
| `locations` | `PracticeLocation[]` | relación → `PracticeLocation` |
| `services` | `DoctorService[]` | relación → `DoctorService` |
| `availabilityRules` | `AvailabilityRule[]` | relación → `AvailabilityRule` |
| `availabilityExceptions` | `AvailabilityException[]` | relación → `AvailabilityException` |
| `careRelationships` | `CareRelationship[]` | relación → `CareRelationship` |
| `appointments` | `Appointment[]` | relación → `Appointment` |
| `encounters` | `ClinicalEncounter[]` | relación → `ClinicalEncounter` |
| `prescriptions` | `Prescription[]` | relación → `Prescription` |
| `labOrders` | `LabOrder[]` | relación → `LabOrder` |
| `noteTemplates` | `NoteTemplate[]` | relación → `NoteTemplate` |

**`Specialty`** — tabla `specialties`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `code` | `String` | @unique |
| `nameEs` | `String` |  |
| `cieGroup` | `String?` |  |
| `isActive` | `Boolean` | @default(true) |
| `requiresSpecialtyLicense` | `Boolean` | @default(true) |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `doctors` | `Doctor[]` | relación → `Doctor` |
| `fieldSchemas` | `SpecialtyFieldSchema[]` | relación → `SpecialtyFieldSchema` |

**`DoctorDocument`** — tabla `doctor_documents`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `doctorId` | `String` |  |
| `docType` | `DoctorDocumentType` |  |
| `fileKey` | `String` |  |
| `fileHashSha256` | `String` |  |
| `uploadedAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `reviewStatus` | `DoctorDocumentReviewStatus` | @default(PENDING) |
| `reviewedBy` | `String?` |  |
| `reviewedAt` | `DateTime?` | TIMESTAMPTZ |
| `rejectionReason` | `String?` |  |
| `doctor` | `Doctor` | relación → `Doctor` @relation(fields: [doctorId], references: [id]) |

**`PracticeLocation`** — tabla `practice_locations`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `doctorId` | `String` |  |
| `name` | `String` |  |
| `addressStreet` | `String?` |  |
| `addressExt` | `String?` |  |
| `addressInt` | `String?` |  |
| `addressColonia` | `String?` |  |
| `addressMunicipality` | `String?` |  |
| `addressState` | `String?` |  |
| `addressPostalCode` | `String?` |  |
| `latitude` | `Float?` |  |
| `longitude` | `Float?` |  |
| `phone` | `String?` |  |
| `isPrimary` | `Boolean` | @default(false) |
| `isActive` | `Boolean` | @default(true) |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `updatedAt` | `DateTime` | @updatedAt TIMESTAMPTZ |
| `doctor` | `Doctor` | relación → `Doctor` @relation(fields: [doctorId], references: [id]) |
| `services` | `DoctorService[]` | relación → `DoctorService` |
| `availabilityRules` | `AvailabilityRule[]` | relación → `AvailabilityRule` |
| `appointments` | `Appointment[]` | relación → `Appointment` |

**`DoctorService`** — tabla `doctor_services`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `doctorId` | `String` |  |
| `locationId` | `String?` |  |
| `serviceType` | `ServiceType` |  |
| `name` | `String` |  |
| `durationMinutes` | `Int` |  |
| `priceMxnCents` | `Int` |  |
| `currency` | `String` | @default("MXN") |
| `priceVisibility` | `PriceVisibility` | @default(PRIVATE) |
| `isActive` | `Boolean` | @default(true) |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `updatedAt` | `DateTime` | @updatedAt TIMESTAMPTZ |
| `doctor` | `Doctor` | relación → `Doctor` @relation(fields: [doctorId], references: [id]) |
| `location` | `PracticeLocation?` | relación → `PracticeLocation` @relation(fields: [locationId], references: [id]) |
| `appointments` | `Appointment[]` | relación → `Appointment` |

**`AvailabilityRule`** — tabla `availability_rules`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `doctorId` | `String` |  |
| `locationId` | `String?` |  |
| `modality` | `AppointmentModality` |  |
| `weekday` | `Int` |  |
| `startMinute` | `Int` |  |
| `endMinute` | `Int` |  |
| `slotDurationMinutes` | `Int` |  |
| `bufferMinutes` | `Int` | @default(0) |
| `validFrom` | `DateTime` | DATE |
| `validUntil` | `DateTime?` | DATE |
| `isActive` | `Boolean` | @default(true) |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `updatedAt` | `DateTime` | @updatedAt TIMESTAMPTZ |
| `doctor` | `Doctor` | relación → `Doctor` @relation(fields: [doctorId], references: [id]) |
| `location` | `PracticeLocation?` | relación → `PracticeLocation` @relation(fields: [locationId], references: [id]) |

**`AvailabilityException`** — tabla `availability_exceptions`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `doctorId` | `String` |  |
| `startAt` | `DateTime` | TIMESTAMPTZ |
| `endAt` | `DateTime` | TIMESTAMPTZ |
| `reason` | `String?` |  |
| `blocksAllDay` | `Boolean` | @default(false) |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `doctor` | `Doctor` | relación → `Doctor` @relation(fields: [doctorId], references: [id]) |

**`Patient`** — tabla `patients`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `userId` | `String?` | @unique |
| `medicfyId` | `String` | @unique |
| `firstName` | `String` |  |
| `lastNamePaternal` | `String` |  |
| `lastNameMaternal` | `String?` |  |
| `birthDate` | `DateTime` | DATE |
| `sexAtBirth` | `SexAtBirth` |  |
| `genderIdentity` | `String?` |  |
| `curp` | `String?` |  |
| `bloodType` | `String?` |  |
| `phoneE164` | `String` |  |
| `email` | `String` |  |
| `addressStreet` | `String?` |  |
| `addressExt` | `String?` |  |
| `addressInt` | `String?` |  |
| `addressColonia` | `String?` |  |
| `addressMunicipality` | `String?` |  |
| `addressState` | `String?` |  |
| `addressPostalCode` | `String?` |  |
| `emergencyContactName` | `String?` |  |
| `emergencyContactPhone` | `String?` |  |
| `emergencyContactRelation` | `String?` |  |
| `createdByUserId` | `String?` |  |
| `source` | `PatientSource` |  |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `updatedAt` | `DateTime` | @updatedAt TIMESTAMPTZ |
| `user` | `User?` | relación → `User` @relation(fields: [userId], references: [id]) |
| `guardians` | `PatientGuardian[]` | relación → `PatientGuardian` |
| `careRelationships` | `CareRelationship[]` | relación → `CareRelationship` |
| `appointments` | `Appointment[]` | relación → `Appointment` |
| `allergies` | `PatientAllergy[]` | relación → `PatientAllergy` |
| `medications` | `PatientMedication[]` | relación → `PatientMedication` |
| `historyItems` | `PatientHistoryItem[]` | relación → `PatientHistoryItem` |
| `encounters` | `ClinicalEncounter[]` | relación → `ClinicalEncounter` |
| `attachments` | `ClinicalAttachment[]` | relación → `ClinicalAttachment` |
| `prescriptions` | `Prescription[]` | relación → `Prescription` |
| `labOrders` | `LabOrder[]` | relación → `LabOrder` |
| `labResults` | `LabResult[]` | relación → `LabResult` |

**`PatientGuardian`** — tabla `patient_guardians`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `patientId` | `String` |  |
| `guardianName` | `String` |  |
| `guardianRelation` | `GuardianRelation` |  |
| `guardianCurp` | `String?` |  |
| `guardianPhoneE164` | `String` |  |
| `guardianEmail` | `String` |  |
| `guardianIdDocumentKey` | `String` |  |
| `consentGrantedAt` | `DateTime` | TIMESTAMPTZ |
| `isPrimary` | `Boolean` | @default(false) |
| `revokedAt` | `DateTime?` | TIMESTAMPTZ |
| `revokedReason` | `String?` |  |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `patient` | `Patient` | relación → `Patient` @relation(fields: [patientId], references: [id]) |

**`CareRelationship`** — tabla `care_relationships`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `patientId` | `String` |  |
| `doctorId` | `String` |  |
| `status` | `CareRelationshipStatus` | @default(ACTIVE) |
| `origin` | `CareRelationshipOrigin` |  |
| `startedAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `lastInteractionAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `expiresAt` | `DateTime` | TIMESTAMPTZ |
| `revokedAt` | `DateTime?` | TIMESTAMPTZ |
| `revokedBy` | `String?` |  |
| `patient` | `Patient` | relación → `Patient` @relation(fields: [patientId], references: [id]) |
| `doctor` | `Doctor` | relación → `Doctor` @relation(fields: [doctorId], references: [id]) |

**`Appointment`** — tabla `appointments`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `patientId` | `String` |  |
| `doctorId` | `String` |  |
| `locationId` | `String?` |  |
| `serviceId` | `String` |  |
| `modality` | `AppointmentModality` |  |
| `startsAt` | `DateTime` | TIMESTAMPTZ |
| `endsAt` | `DateTime` | TIMESTAMPTZ |
| `timezone` | `String` | @default("America/Mexico_City") |
| `status` | `AppointmentStatus` | @default(PENDING_PAYMENT) |
| `createdByUserId` | `String` |  |
| `createdVia` | `AppointmentCreatedVia` |  |
| `priceMxnCents` | `Int` |  |
| `paymentReference` | `String?` |  |
| `paymentDeadlineAt` | `DateTime?` | TIMESTAMPTZ |
| `videoRoomUrl` | `String?` |  |
| `videoProviderRef` | `String?` |  |
| `cancellationReason` | `String?` |  |
| `cancelledAt` | `DateTime?` | TIMESTAMPTZ |
| `cancelledByUserId` | `String?` |  |
| `reminder24hSentAt` | `DateTime?` | TIMESTAMPTZ |
| `reminder2hSentAt` | `DateTime?` | TIMESTAMPTZ |
| `rescheduledFromId` | `String?` | @unique |
| `rescheduleCount` | `Int` | @default(0) |
| `cancellationPolicySnapshot` | `Json` |  |
| `completedWithoutNoteReason` | `String?` |  |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `updatedAt` | `DateTime` | @updatedAt TIMESTAMPTZ |
| `patient` | `Patient` | relación → `Patient` @relation(fields: [patientId], references: [id]) |
| `doctor` | `Doctor` | relación → `Doctor` @relation(fields: [doctorId], references: [id]) |
| `location` | `PracticeLocation?` | relación → `PracticeLocation` @relation(fields: [locationId], references: [id]) |
| `service` | `DoctorService` | relación → `DoctorService` @relation(fields: [serviceId], references: [id]) |
| `rescheduledFrom` | `Appointment?` | relación → `Appointment` @relation("AppointmentReschedule", fields: [rescheduledFromId], references: [id]) |
| `rescheduledTo` | `Appointment?` | relación → `Appointment` @relation("AppointmentReschedule") |
| `statusHistory` | `AppointmentStatusHistory[]` | relación → `AppointmentStatusHistory` |
| `encounter` | `ClinicalEncounter?` | relación → `ClinicalEncounter` |

**`AppointmentStatusHistory`** — tabla `appointment_status_history`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `appointmentId` | `String` |  |
| `fromStatus` | `AppointmentStatus?` |  |
| `toStatus` | `AppointmentStatus` |  |
| `changedByUserId` | `String?` |  |
| `reason` | `String?` |  |
| `changedAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `appointment` | `Appointment` | relación → `Appointment` @relation(fields: [appointmentId], references: [id]) |

**`AssistantInvitation`** — tabla `assistant_invitations`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `doctorUserId` | `String` |  |
| `email` | `String` |  |
| `token` | `String` | @unique |
| `status` | `AssistantInvitationStatus` | @default(PENDING) |
| `expiresAt` | `DateTime` | TIMESTAMPTZ |
| `acceptedAt` | `DateTime?` | TIMESTAMPTZ |
| `acceptedByUserId` | `String?` |  |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `doctorUser` | `User` | relación → `User` @relation("InvitingDoctor", fields: [doctorUserId], references: [id]) |

**`VerificationCode`** — tabla `verification_codes`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `userId` | `String` |  |
| `channel` | `VerificationChannel` |  |
| `codeHash` | `String` |  |
| `expiresAt` | `DateTime` | TIMESTAMPTZ |
| `consumedAt` | `DateTime?` | TIMESTAMPTZ |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `user` | `User` | relación → `User` @relation(fields: [userId], references: [id]) |

**`PasswordResetToken`** — tabla `password_reset_tokens`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `userId` | `String` |  |
| `tokenHash` | `String` | @unique |
| `expiresAt` | `DateTime` | TIMESTAMPTZ |
| `usedAt` | `DateTime?` | TIMESTAMPTZ |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `user` | `User` | relación → `User` @relation(fields: [userId], references: [id]) |

**`AuditLog`** — tabla `audit_log`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `actorUserId` | `String?` |  |
| `actorRole` | `String?` |  |
| `action` | `String` |  |
| `resourceType` | `String` |  |
| `resourceId` | `String?` |  |
| `patientId` | `String?` |  |
| `ipAddress` | `String?` |  |
| `userAgent` | `String?` |  |
| `requestId` | `String?` |  |
| `justification` | `String?` |  |
| `result` | `AuditResult` |  |
| `metadata` | `Json?` |  |
| `occurredAt` | `DateTime` | @default(now()) TIMESTAMPTZ |

Índices/restricciones: `@@index([patientId])`

**`ClinicalEncounter`** — tabla `clinical_encounters`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `patientId` | `String` |  |
| `doctorId` | `String` |  |
| `appointmentId` | `String?` | @unique |
| `encounterType` | `EncounterType` |  |
| `draftContent` | `Json` | @default("{}") |
| `status` | `EncounterStatus` | @default(DRAFT) |
| `startedAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `endedAt` | `DateTime?` | TIMESTAMPTZ |
| `signedAt` | `DateTime?` | TIMESTAMPTZ |
| `signedByUserId` | `String?` |  |
| `signatureMethod` | `SignatureMethod?` |  |
| `contentHashSha256` | `String?` |  |
| `previousHashSha256` | `String?` |  |
| `abandonedAt` | `DateTime?` | TIMESTAMPTZ |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `updatedAt` | `DateTime` | @updatedAt TIMESTAMPTZ |
| `patient` | `Patient` | relación → `Patient` @relation(fields: [patientId], references: [id]) |
| `doctor` | `Doctor` | relación → `Doctor` @relation(fields: [doctorId], references: [id]) |
| `appointment` | `Appointment?` | relación → `Appointment` @relation(fields: [appointmentId], references: [id]) |
| `notes` | `ClinicalNote[]` | relación → `ClinicalNote` |
| `diagnoses` | `EncounterDiagnosis[]` | relación → `EncounterDiagnosis` |
| `attachments` | `ClinicalAttachment[]` | relación → `ClinicalAttachment` |
| `prescriptions` | `Prescription[]` | relación → `Prescription` |
| `labOrders` | `LabOrder[]` | relación → `LabOrder` |
| `specialtyData` | `EncounterSpecialtyData?` | relación → `EncounterSpecialtyData` |

**`ClinicalNote`** — tabla `clinical_notes`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `encounterId` | `String` |  |
| `chiefComplaint` | `String` |  |
| `currentIllness` | `String` |  |
| `vitals` | `Json` |  |
| `physicalExam` | `String?` |  |
| `assessment` | `String` |  |
| `plan` | `String` |  |
| `prognosis` | `String?` |  |
| `isCorrectionOfNoteId` | `String?` |  |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `encounter` | `ClinicalEncounter` | relación → `ClinicalEncounter` @relation(fields: [encounterId], references: [id]) |
| `isCorrectionOfNote` | `ClinicalNote?` | relación → `ClinicalNote` @relation("NoteCorrection", fields: [isCorrectionOfNoteId], references: [id]) |
| `corrections` | `ClinicalNote[]` | relación → `ClinicalNote` @relation("NoteCorrection") |

**`EncounterDiagnosis`** — tabla `encounter_diagnoses`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `encounterId` | `String` |  |
| `icd10Code` | `String?` |  |
| `codeAbsentReason` | `String?` |  |
| `description` | `String` |  |
| `diagnosisType` | `DiagnosisType` |  |
| `certainty` | `DiagnosisCertainty` |  |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `encounter` | `ClinicalEncounter` | relación → `ClinicalEncounter` @relation(fields: [encounterId], references: [id]) |

**`ClinicalAttachment`** — tabla `clinical_attachments`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `patientId` | `String` |  |
| `encounterId` | `String?` |  |
| `fileKey` | `String` |  |
| `fileName` | `String` |  |
| `fileHashSha256` | `String` |  |
| `mimeType` | `String` |  |
| `sizeBytes` | `Int` |  |
| `category` | `ClinicalAttachmentCategory` |  |
| `uploadedByUserId` | `String` |  |
| `description` | `String?` |  |
| `uploadedAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `patient` | `Patient` | relación → `Patient` @relation(fields: [patientId], references: [id]) |
| `encounter` | `ClinicalEncounter?` | relación → `ClinicalEncounter` @relation(fields: [encounterId], references: [id]) |

**`NoteTemplate`** — tabla `note_templates`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `doctorId` | `String` |  |
| `label` | `String` |  |
| `content` | `String` |  |
| `shortcutKey` | `String?` |  |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `doctor` | `Doctor` | relación → `Doctor` @relation(fields: [doctorId], references: [id]) |

Índices/restricciones: `@@unique([doctorId, shortcutKey])`

**`PatientAllergy`** — tabla `patient_allergies`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `patientId` | `String` |  |
| `substance` | `String` |  |
| `allergyType` | `String` |  |
| `reaction` | `String?` |  |
| `severity` | `String` |  |
| `ageOfOnset` | `String?` |  |
| `status` | `AllergyStatus` | @default(ACTIVE) |
| `certainty` | `AllergyCertainty` |  |
| `source` | `String` |  |
| `lastReviewedAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `updatedAt` | `DateTime` | @updatedAt TIMESTAMPTZ |
| `patient` | `Patient` | relación → `Patient` @relation(fields: [patientId], references: [id]) |

**`PatientMedication`** — tabla `patient_medications`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `patientId` | `String` |  |
| `genericName` | `String` |  |
| `brandName` | `String?` |  |
| `dose` | `String` |  |
| `route` | `String` |  |
| `frequency` | `String` |  |
| `startedAt` | `DateTime?` | DATE |
| `suspendedAt` | `DateTime?` | DATE |
| `reason` | `String?` |  |
| `status` | `PatientMedicationStatus` | @default(ACTIVE) |
| `prescriber` | `String?` |  |
| `source` | `String` |  |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `updatedAt` | `DateTime` | @updatedAt TIMESTAMPTZ |
| `patient` | `Patient` | relación → `Patient` @relation(fields: [patientId], references: [id]) |

**`PatientHistoryItem`** — tabla `patient_history_items`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `patientId` | `String` |  |
| `category` | `PatientHistoryCategory` |  |
| `subtype` | `String` |  |
| `familyRelationship` | `String` | @default("NONE") |
| `familyRelationshipDetail` | `String?` |  |
| `status` | `PatientHistoryStatus` | @default(NO_INVESTIGADO) |
| `structuredValue` | `Json?` |  |
| `freeText` | `String?` |  |
| `updatedByUserId` | `String` |  |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `updatedAt` | `DateTime` | @updatedAt TIMESTAMPTZ |
| `patient` | `Patient` | relación → `Patient` @relation(fields: [patientId], references: [id]) |
| `changeLog` | `PatientHistoryItemChange[]` | relación → `PatientHistoryItemChange` |

Índices/restricciones: `@@unique([patientId, category, subtype, familyRelationship])`

**`PatientHistoryItemChange`** — tabla `patient_history_item_changes`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `historyItemId` | `String` |  |
| `previousStatus` | `PatientHistoryStatus?` |  |
| `previousStructuredValue` | `Json?` |  |
| `previousFreeText` | `String?` |  |
| `changedByUserId` | `String` |  |
| `changedAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `historyItem` | `PatientHistoryItem` | relación → `PatientHistoryItem` @relation(fields: [historyItemId], references: [id]) |

**`Icd10Code`** — tabla `icd10_codes`

| Campo | Tipo | Notas |
|---|---|---|
| `code` | `String` | @id |
| `description` | `String` |  |
| `isActive` | `Boolean` | @default(true) |

**`MedicationCatalog`** — tabla `medications_catalog`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `genericName` | `String` |  |
| `brandNames` | `String[]` | @default([]) |
| `presentations` | `Json` |  |
| `atcCode` | `String?` |  |
| `controlGroup` | `ControlGroup` |  |
| `isElectronicallyPrescribable` | `Boolean` | @default(true) |
| `commonDoses` | `Json?` |  |
| `contraindications` | `String[]` | @default([]) |
| `isActive` | `Boolean` | @default(true) |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `prescriptionItems` | `PrescriptionItem[]` | relación → `PrescriptionItem` |

**`SpecialtyFieldSchema`** — tabla `specialty_field_schemas`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `specialtyId` | `String?` |  |
| `version` | `Int` |  |
| `section` | `SpecialtyFieldSection` |  |
| `fieldKey` | `String` |  |
| `label` | `String` |  |
| `inputType` | `SpecialtyFieldInputType` |  |
| `unit` | `String?` |  |
| `minValue` | `Float?` |  |
| `maxValue` | `Float?` |  |
| `options` | `Json?` |  |
| `isRequired` | `Boolean` | @default(false) |
| `displayOrder` | `Int` | @default(0) |
| `helpText` | `String?` |  |
| `computedFormula` | `String?` |  |
| `publishedAt` | `DateTime?` | TIMESTAMPTZ |
| `publishedBy` | `String?` |  |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `specialty` | `Specialty?` | relación → `Specialty` @relation(fields: [specialtyId], references: [id]) |

**`EncounterSpecialtyData`** — tabla `encounter_specialty_data`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `encounterId` | `String` | @unique |
| `specialtySchemaVersion` | `Int` |  |
| `data` | `Json` |  |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `encounter` | `ClinicalEncounter` | relación → `ClinicalEncounter` @relation(fields: [encounterId], references: [id]) |

**`Prescription`** — tabla `prescriptions`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `encounterId` | `String` |  |
| `patientId` | `String` |  |
| `doctorId` | `String` |  |
| `folio` | `String` | @unique |
| `prescriptionType` | `PrescriptionType` | @default(ELECTRONIC) |
| `issuedAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `doctorNameSnapshot` | `String` |  |
| `doctorLicenseSnapshot` | `String` |  |
| `doctorSpecialtySnapshot` | `String?` |  |
| `doctorInstitutionSnapshot` | `String?` |  |
| `practiceAddressSnapshot` | `String` |  |
| `patientNameSnapshot` | `String` |  |
| `patientAgeSnapshot` | `Int` |  |
| `patientSexSnapshot` | `String` |  |
| `diagnosisSnapshot` | `String` |  |
| `generalInstructions` | `String?` |  |
| `replacesPrescriptionId` | `String?` | @unique |
| `physicalRecipeFolio` | `String?` |  |
| `signatureRoute` | `PrescriptionSignatureRoute?` |  |
| `signatureMethod` | `SignatureMethod?` |  |
| `signatureTimestamp` | `DateTime?` | TIMESTAMPTZ |
| `contentHashSha256` | `String?` |  |
| `pdfFileKey` | `String?` |  |
| `qrVerificationToken` | `String?` | @unique |
| `deliveredVia` | `String[]` | @default([]) |
| `deliveredAt` | `DateTime?` | TIMESTAMPTZ |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `encounter` | `ClinicalEncounter` | relación → `ClinicalEncounter` @relation(fields: [encounterId], references: [id]) |
| `patient` | `Patient` | relación → `Patient` @relation(fields: [patientId], references: [id]) |
| `doctor` | `Doctor` | relación → `Doctor` @relation(fields: [doctorId], references: [id]) |
| `replacesPrescription` | `Prescription?` | relación → `Prescription` @relation("PrescriptionReplacement", fields: [replacesPrescriptionId], references: [id]) |
| `replacedByPrescription` | `Prescription?` | relación → `Prescription` @relation("PrescriptionReplacement") |
| `items` | `PrescriptionItem[]` | relación → `PrescriptionItem` |
| `cancellation` | `PrescriptionCancellation?` | relación → `PrescriptionCancellation` |
| `handwrittenDelivery` | `PrescriptionHandwrittenDelivery?` | relación → `PrescriptionHandwrittenDelivery` |

**`PrescriptionCancellation`** — tabla `prescription_cancellations`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `prescriptionId` | `String` | @unique |
| `reason` | `String` |  |
| `cancelledByUserId` | `String` |  |
| `cancelledAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `prescription` | `Prescription` | relación → `Prescription` @relation(fields: [prescriptionId], references: [id]) |

**`PrescriptionHandwrittenDelivery`** — tabla `prescription_handwritten_deliveries`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `prescriptionId` | `String` | @unique |
| `confirmedByUserId` | `String` |  |
| `confirmedAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `prescription` | `Prescription` | relación → `Prescription` @relation(fields: [prescriptionId], references: [id]) |

**`PrescriptionItem`** — tabla `prescription_items`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `prescriptionId` | `String` |  |
| `genericName` | `String` |  |
| `brandName` | `String?` |  |
| `presentation` | `String` |  |
| `dose` | `String` |  |
| `route` | `String` |  |
| `frequency` | `String` |  |
| `duration` | `String` |  |
| `quantity` | `String?` |  |
| `specialInstructions` | `String?` |  |
| `medicationCatalogId` | `String?` |  |
| `controlGroup` | `ControlGroup` |  |
| `prescription` | `Prescription` | relación → `Prescription` @relation(fields: [prescriptionId], references: [id]) |
| `medicationCatalog` | `MedicationCatalog?` | relación → `MedicationCatalog` @relation(fields: [medicationCatalogId], references: [id]) |

**`LabOrder`** — tabla `lab_orders`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `encounterId` | `String` |  |
| `patientId` | `String` |  |
| `doctorId` | `String` |  |
| `folio` | `String` | @unique |
| `issuedAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `clinicalIndication` | `String` |  |
| `fastingRequired` | `Boolean` | @default(false) |
| `assignedLabId` | `String?` |  |
| `doctorNameSnapshot` | `String?` |  |
| `doctorLicenseSnapshot` | `String?` |  |
| `doctorSpecialtySnapshot` | `String?` |  |
| `doctorInstitutionSnapshot` | `String?` |  |
| `practiceAddressSnapshot` | `String?` |  |
| `patientNameSnapshot` | `String?` |  |
| `patientAgeSnapshot` | `Int?` |  |
| `patientSexSnapshot` | `String?` |  |
| `signatureRoute` | `LabOrderSignatureRoute?` |  |
| `pdfFileKey` | `String?` |  |
| `qrVerificationToken` | `String` | @unique |
| `contentHashSha256` | `String` |  |
| `signatureMethod` | `SignatureMethod?` |  |
| `signedAt` | `DateTime?` | TIMESTAMPTZ |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `encounter` | `ClinicalEncounter` | relación → `ClinicalEncounter` @relation(fields: [encounterId], references: [id]) |
| `patient` | `Patient` | relación → `Patient` @relation(fields: [patientId], references: [id]) |
| `doctor` | `Doctor` | relación → `Doctor` @relation(fields: [doctorId], references: [id]) |
| `items` | `LabOrderItem[]` | relación → `LabOrderItem` |
| `results` | `LabResult[]` | relación → `LabResult` |
| `cancellation` | `LabOrderCancellation?` | relación → `LabOrderCancellation` |

**`LabOrderCancellation`** — tabla `lab_order_cancellations`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `labOrderId` | `String` | @unique |
| `reason` | `String` |  |
| `cancelledByUserId` | `String` |  |
| `cancelledAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `labOrder` | `LabOrder` | relación → `LabOrder` @relation(fields: [labOrderId], references: [id]) |

**`LabOrderItem`** — tabla `lab_order_items`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `labOrderId` | `String` |  |
| `studyName` | `String` |  |
| `loincCode` | `String?` |  |
| `notes` | `String?` |  |
| `labOrder` | `LabOrder` | relación → `LabOrder` @relation(fields: [labOrderId], references: [id]) |

**`LabResult`** — tabla `lab_results`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `labOrderId` | `String?` |  |
| `patientId` | `String` |  |
| `uploadedByUserId` | `String` |  |
| `uploadedByRole` | `LabResultUploaderRole` |  |
| `fileKey` | `String` |  |
| `fileHashSha256` | `String` |  |
| `labName` | `String?` |  |
| `resultDate` | `DateTime?` | DATE |
| `reviewedByDoctorId` | `String?` |  |
| `reviewedAt` | `DateTime?` | TIMESTAMPTZ |
| `doctorComment` | `String?` |  |
| `uploadedAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `labOrder` | `LabOrder?` | relación → `LabOrder` @relation(fields: [labOrderId], references: [id]) |
| `patient` | `Patient` | relación → `Patient` @relation(fields: [patientId], references: [id]) |

**`ClinicalCatalogTerm`** — tabla `clinical_catalog_terms`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` | @id @default(uuid()) |
| `domain` | `String` |  |
| `key` | `String` |  |
| `preferredTerm` | `String` |  |
| `normalizedTerm` | `String` |  |
| `synonyms` | `String[]` | @default([]) |
| `externalCode` | `String?` |  |
| `codingSystem` | `String` |  |
| `version` | `Int` | @default(1) |
| `status` | `ClinicalCatalogTermStatus` | @default(ACTIVE) |
| `mergedIntoId` | `String?` |  |
| `curatedBy` | `String?` |  |
| `createdAt` | `DateTime` | @default(now()) TIMESTAMPTZ |
| `mergedInto` | `ClinicalCatalogTerm?` | relación → `ClinicalCatalogTerm` @relation("CatalogTermMerge", fields: [mergedIntoId], references: [id]) |
| `mergedFrom` | `ClinicalCatalogTerm[]` | relación → `ClinicalCatalogTerm` @relation("CatalogTermMerge") |

Índices/restricciones: `@@unique([domain, key])` · `@@unique([domain, normalizedTerm])`

---

## 4. Endpoints del backend

**93 rutas HTTP** en 21 controllers. Sin prefijo global (`main.ts` no llama `setGlobalPrefix`), así que las rutas son las de abajo tal cual. Documentación OpenAPI en `/api/docs`. CORS restringido a `env.WEB_ORIGIN` con `credentials: true`.

**Guards, en tres capas:**
- `JwtAuthGuard` — Bearer token de 15 min; el refresh viaja como cookie httpOnly.
- `DoctorVerifiedGuard` — exige `verificationStatus` verificado; se aplica solo a las acciones clínicas que emiten documento legal (firmar nota, corregir nota, emitir receta, emitir orden).
- `CareRelationshipGuard` (`apps/api/src/common/guards/care-relationship.guard.ts`) — AUTH-RN-001: resuelve el paciente desde `patientId`, `encounterId`, `prescriptionId` o `labOrderId` y exige vínculo activo. **No admite ASSISTANT**, a diferencia de `SchedulingAuthService`. Registra el caso `DENIED` en `audit_log` antes de responder.

### 4.1 Salud

| Método | Ruta | Qué hace | Guard |
|---|---|---|---|
| GET | `/health` | `{ status: "ok" }` | ninguno |

### 4.2 Autenticación e identidad (M1) — `modules/identity/`

| Método | Ruta | Qué hace | Guard |
|---|---|---|---|
| POST | `/auth/register/patient` | Registro de paciente con 3 casillas de consentimiento explícitas (M1-RN-003); crea filas en `consents` con versión, IP y hash de evidencia | — |
| POST | `/auth/register/doctor` | Registro de médico; queda en `verificationStatus = SUBMITTED` (M1-RN-002) | — |
| POST | `/auth/email/verify` | Consume código de 6 dígitos (10 min); pasa la cuenta a `ACTIVE` | — |
| POST | `/auth/phone/verify` | Igual, para teléfono | — |
| POST | `/auth/login` | Valida consentimiento vigente, MFA y bloqueo por fuerza bruta. Devuelve `accessToken` en el cuerpo + refresh en cookie, o `{mfaRequired, mfaSessionToken}`. Códigos: 401/403/423/428/451 | — |
| POST | `/auth/mfa/verify` | Completa un login pendiente de MFA con el token parcial | — |
| POST | `/auth/refresh` | Rota el refresh token; aplica idle-timeout por rol (30 min clínico / 7 días paciente) | cookie |
| POST | `/auth/logout` | Revoca la sesión y limpia la cookie | cookie |
| POST | `/auth/password/forgot` | Respuesta idéntica exista o no la cuenta | — |
| POST | `/auth/password/reset` | Token de un solo uso; revoca todas las sesiones activas | — |
| POST | `/auth/mfa/enroll` | Sin `code` inicia el enrolamiento TOTP (devuelve secreto + códigos de respaldo); con `code` lo confirma | JWT |
| POST | `/auth/mfa/disable` | Desactiva MFA | JWT |
| GET | `/me` | Perfil del usuario autenticado (id, email, rol, estado, MFA). **No existe `PATCH /me`** — diferido a propósito según el comentario del controller | JWT |
| GET | `/consents` | Estado vigente de los 5 tipos de consentimiento | JWT |
| POST | `/consents` | Registra una decisión como fila nueva (append-only, nunca UPDATE) | JWT |

### 4.3 Médico — perfil y configuración (M2) — `modules/doctors/`

| Método | Ruta | Qué hace | Guard |
|---|---|---|---|
| GET | `/doctors/me` | Perfil completo, incluye precios (nunca expuestos públicamente) | JWT |
| PATCH | `/doctors/me` | Separa el cuerpo en campos legales y editables: los legales solo se aceptan en DRAFT/SUBMITTED/REJECTED (y revierten a DRAFT), 403 `DOCTOR_FIELD_IMMUTABLE` fuera de eso (M2-CA-002) | JWT |
| POST | `/doctors/me/documents` | Sube documento de verificación (multipart, memoria); calcula SHA-256 | JWT |
| GET | `/doctors/me/documents` | Lista documentos propios con su estado de revisión | JWT |
| POST | `/doctors/me/branding-assets` | Sube logo o firma visual (`?kind=`) | JWT |
| GET | `/doctors/me/branding-assets/:kind` | Sirve el archivo como `StreamableFile` | JWT |
| GET | `/doctors/me/locations` | Consultorios | JWT |
| POST | `/doctors/me/locations` | Crea consultorio (M2-RN-004: ≥1 activo o teleconsulta para recibir citas) | JWT |
| PATCH | `/doctors/me/locations/:id` | Actualización parcial validada con Zod `.strict()` | JWT |
| DELETE | `/doctors/me/locations/:id` | Elimina consultorio | JWT |
| GET | `/doctors/me/services` | Servicios con precio (M2-RN-003, privado por defecto) | JWT |
| POST | `/doctors/me/services` | Crea servicio (1–99,999 MXN, en centavos) | JWT |
| PATCH | `/doctors/me/services/:id` | Actualiza servicio | JWT |
| DELETE | `/doctors/me/services/:id` | Elimina servicio | JWT |
| GET | `/doctors/me/assistants` | DOC-16: invitaciones pendientes y asistentes aceptados. Solo `DOCTOR` (chequeo de rol en línea, no hay `RolesGuard` general) | JWT |
| POST | `/doctors/me/assistants/invite` | Invita asistente (máx. 3 pendientes, 72 h) | JWT |
| POST | `/doctors/me/assistants/accept` | Acepta invitación; otorga `UserRole(ASSISTANT)` con `scopeId` al médico | JWT |
| GET | `/specialties` | Catálogo público de especialidades activas | **ninguno** |

### 4.4 Administración de verificación (M2) — `modules/doctors/admin-doctors.controller.ts`

| Método | Ruta | Qué hace | Guard |
|---|---|---|---|
| GET | `/admin/doctors` | Cola de verificación, filtrable por `?verification_status=` | JWT + Admin |
| GET | `/admin/doctors/:id` | Detalle con documentos y hash | JWT + Admin |
| POST | `/admin/doctors/:id/verify` | Aprueba; `specialtyConfirmed=false` → `VERIFIED_SPECIALTY_UNCONFIRMED` | JWT + Admin |
| POST | `/admin/doctors/:id/reject` | Rechaza con motivo obligatorio | JWT + Admin |
| POST | `/admin/doctors/:id/suspend` | Suspende, cancela citas futuras pagadas y notifica reembolso 100% (el cobro real espera a M6) | JWT + Admin |

### 4.5 Agenda y disponibilidad (M4) — `modules/scheduling/`

| Método | Ruta | Qué hace | Guard |
|---|---|---|---|
| GET | `/doctors/me/availability-rules` | Reglas semanales del médico (o de su asistente) | JWT |
| POST | `/doctors/me/availability-rules` | Crea regla; 409 si se solapa con otra activa del mismo médico/modalidad (M4-RN-004) | JWT |
| PATCH | `/doctors/me/availability-rules/:id` | Actualiza y revalida el traslape | JWT |
| DELETE | `/doctors/me/availability-rules/:id` | Elimina regla | JWT |
| GET | `/doctors/me/availability-exceptions` | Bloqueos y vacaciones | JWT |
| POST | `/doctors/me/availability-exceptions` | Crea bloqueo (máx. 365 días); 409 si afecta citas activas, listándolas (M4-RN-006/M4-CA-003) | JWT |
| DELETE | `/doctors/me/availability-exceptions/:id` | Elimina bloqueo | JWT |
| GET | `/doctors/:id/availability` | **Público.** Espacios disponibles `?from&to&service_id`; sin fechas asume hoy + 14 días. Respeta antelación mínima, buffers, excepciones y ventana máxima | **ninguno** |

### 4.6 Pacientes y citas (M5a) — `modules/scheduling/`

| Método | Ruta | Qué hace | Guard |
|---|---|---|---|
| GET | `/patients` | Pacientes con `care_relationship` activo con el médico actuante | JWT |
| POST | `/patients` | Alta por médico/asistente: genera `medicfyId` (secuencia Postgres) y el `care_relationship` en la misma transacción (M2-CA-009) | JWT |
| GET | `/patients/:id` | Perfil del paciente + tutores vigentes (revoca automáticamente al cumplir 18, evaluado al leer). **No hay `PATCH`** | JWT |
| GET | `/appointments` | DOC-01: agenda de un día (`?date=YYYY-MM-DD`), resuelta en servidor en `America/Mexico_City` | JWT |
| POST | `/appointments` | Crea cita; la restricción `EXCLUDE USING gist` de Postgres decide, no un chequeo previo. 409 `SLOT_TAKEN`, 422 `SLOT_TOO_SOON`/`OUTSIDE_BOOKING_WINDOW` | JWT |
| GET | `/appointments/:id` | Detalle con paciente, servicio y encounter — lo consume `/consulta/[appointmentId]` | JWT |
| POST | `/appointments/:id/confirm` | `scheduled → confirmed` | JWT |
| POST | `/appointments/:id/start` | `scheduled\|confirmed → in_progress` | JWT |
| POST | `/appointments/:id/complete` | `in_progress → completed` **por la vía de excepción** (M5-RN-006, "consulta sin nota" con justificación) | JWT |
| POST | `/appointments/:id/no-show` | Marcado manual de no presentado | JWT |
| POST | `/appointments/:id/cancel` | Reembolso 100 % si cancela el médico; según el snapshot de política si cancela el paciente | JWT |
| POST | `/appointments/:id/reschedule` | Cancela + crea cita nueva ligada por `rescheduledFromId`; máx. 2 (422 `MAX_RESCHEDULES_REACHED`) | JWT |

### 4.7 Expediente clínico (M8) — `modules/records/`

| Método | Ruta | Qué hace | Guard |
|---|---|---|---|
| POST | `/records/patients/:patientId/encounters` | Inicia encuentro en `DRAFT`; idempotente por `appointmentId` (P2002 → devuelve el existente) | JWT + CareRel |
| GET | `/records/patients/:patientId/encounters` | Historial de encuentros con notas y diagnósticos | JWT + CareRel |
| GET | `/records/encounters/:encounterId` | Detalle de un encuentro | JWT + CareRel |
| PATCH | `/records/encounters/:encounterId/note` | **Autoguardado cada 10 s.** Fusiona el parche en `draftContent`; recalcula IMC y escalas en servidor. 409 si ya está firmado o si el borrador lleva >72 h (`ENCOUNTER_ABANDONED`) | JWT + CareRel |
| POST | `/records/encounters/:encounterId/sign` | Congela la nota: inserta la fila única en `clinical_notes`, crea diagnósticos y `encounter_specialty_data`, calcula `contentHashSha256` encadenado con el encuentro firmado anterior del mismo paciente, y **completa la cita ligada** | JWT + CareRel + DoctorVerified |
| POST | `/records/encounters/:encounterId/correct-note` | Corrección: nota nueva con `isCorrectionOfNoteId`, nunca UPDATE (M8-RN-001) | JWT + CareRel + DoctorVerified |
| GET | `/records/patients/:patientId/allergies` | Alergias del paciente | JWT + CareRel |
| POST | `/records/patients/:patientId/allergies` | Registra alergia | JWT + CareRel |
| PATCH | `/records/patients/:patientId/allergies/:allergyId` | Actualiza alergia | JWT + CareRel |
| GET | `/records/patients/:patientId/medications` | Conciliación de medicamentos habituales | JWT + CareRel |
| POST | `/records/patients/:patientId/medications` | Registra medicamento | JWT + CareRel |
| PATCH | `/records/patients/:patientId/medications/:medicationId` | Actualiza medicamento | JWT + CareRel |
| GET | `/records/patients/:patientId/history` | Antecedentes AHF/APNP/APP, filtrables por `?category=` | JWT + CareRel |
| POST | `/records/patients/:patientId/history` | Upsert de antecedente; **versiona el valor anterior** en `patient_history_item_changes` antes de sobrescribir | JWT + CareRel |
| GET | `/records/patients/:patientId/timeline` | Expediente cronológico: encuentros + recetas + órdenes + resultados sueltos, cada uno con su estado derivado | JWT + CareRel |
| GET | `/icd10` | Busca CIE-10 por código o descripción, máx. 20 resultados | JWT |
| GET | `/note-templates` | Plantillas de nota del médico | JWT |
| POST | `/note-templates` | Crea plantilla; 409 si el atajo `Alt+n` ya está tomado | JWT |
| DELETE | `/note-templates/:id` | Elimina plantilla propia (204) | JWT |
| GET | `/specialty-field-schemas` | Campos activos de `?section=` para la especialidad del médico actuante. **Hoy solo `ESCALAS` tiene filas** (Glasgow + Apgar) | JWT |

### 4.8 Recetas (M9) — `modules/prescriptions/`

| Método | Ruta | Qué hace | Guard |
|---|---|---|---|
| GET | `/medications` | Busca en el catálogo de medicamentos; devuelve `controlGroup` e `isElectronicallyPrescribable` para avisar antes de prescribir | JWT |
| POST | `/prescriptions/encounters/:encounterId` | Emite receta: bloqueo duro de Grupos I/II, cruce contra alergias activas (requiere `allergyOverrideConfirmed`), advertencia de duplicidad terapéutica (nombre y prefijo ATC de 4 caracteres), snapshots legales, hash, QR y PDF generados **antes** del insert. Ruta `ELECTRONIC` exige contraseña+TOTP | JWT + CareRel + DoctorVerified |
| POST | `/prescriptions/encounters/:encounterId/external-physical` | Registra receta ya emitida en recetario físico (M9-RN-014): sin PDF, sin QR | JWT + CareRel + DoctorVerified |
| POST | `/prescriptions/:prescriptionId/cancel` | Inserta `PrescriptionCancellation` — nunca UPDATE | JWT + CareRel |
| GET | `/prescriptions/:prescriptionId/pdf` | Descarga el PDF | JWT + CareRel |
| POST | `/prescriptions/:prescriptionId/confirm-handwritten-delivery` | Declaración manual "firmada y entregada" (solo ruta autógrafa) | JWT + CareRel |
| GET | `/verificar/:token` | **Público.** Prueba el token primero como receta y luego como orden. Devuelve folio, fecha, estado, médico y paciente enmascarado — nunca contenido clínico | **ninguno** |

### 4.9 Laboratorio (M10) — `modules/labs/`

| Método | Ruta | Qué hace | Guard |
|---|---|---|---|
| POST | `/lab-orders/encounters/:encounterId` | Emite orden con folio, estudios, indicación clínica, ayuno, hash, QR y PDF. Firma electrónica opcional (no exige TOTP, a diferencia de recetas) | JWT + CareRel + DoctorVerified |
| GET | `/lab-orders/:labOrderId/pdf` | Descarga el PDF | JWT + CareRel |
| POST | `/lab-orders/:labOrderId/cancel` | Inserta `LabOrderCancellation` | JWT + CareRel |
| GET | `/lab-results/patients/:patientId` | Resultados del paciente | JWT + CareRel |
| POST | `/lab-results/patients/:patientId` | Sube resultado (multipart, `?labOrderId=` opcional); hashea y guarda por `FileStoragePort` | JWT + CareRel |
| GET | `/lab-results/patients/:patientId/:resultId/file` | Descarga los bytes del resultado | JWT + CareRel |
| POST | `/lab-results/patients/:patientId/:resultId/review` | El médico revisa y comenta el resultado | JWT + CareRel |

### 4.10 Catálogo clínico (Prompt 7-8) — `modules/catalog/`

| Método | Ruta | Qué hace |
|---|---|---|
| — | — | **Cero endpoints, a propósito.** `CatalogModule` declara solo `providers`/`exports`; `ClinicalCatalogService` es accesible únicamente desde código y desde las pruebas. |

---

## 5. Pruebas existentes

### 5.1 Qué hay

| Archivo | Casos | Qué cubre |
|---|---|---|
| `medicfy-backend/apps/api/src/modules/identity/m1.integration.spec.ts` | 13 (+1 `it.todo`) | Consentimiento explícito sin default implícito, una fila por casilla con versión e IP, `DOCTOR_NOT_VERIFIED`, bloqueo a los 5 intentos con registro en `audit_log`, MFA obligatoria a la 4ª sesión, cierre por inactividad a 30 min, invitación/aceptación de asistente (token inválido y reutilizado incluidos), DOC-16 |
| `.../identity/doctor-verification-enforcement.integration.spec.ts` | 5 | `DoctorVerifiedGuard` sobre las acciones clínicas |
| `.../doctors/m2.integration.spec.ts` | 20 | Precio nunca en respuesta pública, cédula inmutable tras verificación (con las 4 rutas de corrección permitidas y el duplicado de cédula), cola admin con hash, suspensión y sus efectos sobre citas futuras, persistencia tras suspensión, sello de verificado, validación en tiempo de ejecución de los PATCH |
| `.../scheduling/m4.integration.spec.ts` | 20 (+2 `it.todo`) | Reglas solapadas, validaciones de rango, autorización DOCTOR/ASSISTANT/extraño/anónimo, antelación mínima y buffers, encaje exacto de ventana, excepciones, round-trip TIMESTAMPTZ, emparejamiento modalidad↔tipo de servicio |
| `.../scheduling/m5a.integration.spec.ts` | 27 | `medicfyId` + `care_relationship` automáticos, menores y tutores con revocación a los 18, tres orígenes y caducidad a 18 meses del vínculo, cadena completa de estados y transiciones inválidas, política de cancelación como snapshot inmutable (4 escenarios), reagenda con tope de 2, filtro por día en `America/Mexico_City`, barridos de expiración y no-show, validaciones de creación, M4-CA-003 |
| `.../records/append-only.integration.spec.ts` | 10 | **Prueba contra PostgreSQL real** que el rol `medicfy_app` puede INSERT/SELECT pero recibe error de permisos en UPDATE/DELETE sobre `clinical_notes`, `prescriptions` y `lab_orders` (R1) |
| `.../records/clinical-note-correction.integration.spec.ts` | 6 | Corrección de nota firmada |
| `.../records/diagnosis-without-icd10.integration.spec.ts` | 5 | Segunda ruta de M8-RN-006 (`codeAbsentReason` en lugar de `icd10Code`) |
| `.../records/patient-history.integration.spec.ts` | 5 | Upsert de antecedentes y versionado del valor anterior |
| `.../records/m8-frontend-support.integration.spec.ts` | 7 | `GET /icd10`, `GET /medications` (Morfina Grupo I bloqueada), CRUD de plantillas con atajo duplicado, y que firmar completa la cita ligada (incluidos los casos "sin cita" y "cita no `IN_PROGRESS`") |
| `.../records/specialty-scale.integration.spec.ts` | 6 | **Nuevo.** 16 campos sembrados, sección inválida (400), Glasgow 4+5+6 = 15 con interpretación "Leve" protegida por el hash de la nota, Apgar bajo, valor fuera de rango (400, no firma), escala incompleta sin total parcial |
| `.../prescriptions/prescription-signature-route.integration.spec.ts` | 4 | Las dos rutas de firma de receta |
| `.../prescriptions/prescription-therapeutic-duplicates.integration.spec.ts` | 3 | Duplicidad terapéutica por nombre y por clase ATC |
| `.../labs/lab-order-signature-route.integration.spec.ts` | 4 | Las dos rutas de firma de orden |
| `.../labs/lab-results.integration.spec.ts` | 3 | Subida y revisión de resultados |
| `.../catalog/clinical-catalog.integration.spec.ts` | 17 | **Nuevo.** Los 3 casos del normalizador del Prompt 8 (incluidos los dos que a propósito NO normalizan igual), `codingSystem` obligatorio, fusión que nunca borra, destino que debe estar ACTIVE, fusión entre dominios y consigo mismo, `resolveCurrent` con cadena A→B→C y con ciclo, `findActive`, duplicado por clave y por forma normalizada, término obsoleto que sigue bloqueando |
| `packages/contracts/src/validators/*.spec.ts` (7 archivos) | 30 | CURP, teléfono E.164, cédula, contraseña (con `zxcvbn`), fecha de nacimiento, biografía (detección de datos de contacto), precio |
| `apps/api/test/k6/double-booking.k6.js` + `seed-concurrency-fixture.mjs` | 1 escenario | Prueba de carga real: 50 `POST /appointments` en paralelo por el mismo espacio → exactamente 1 éxito y 49 `SLOT_TAKEN`. Salida transcrita en `docs/CRITERIOS_DIFERIDOS.md` |

**Cómo corren:** Vitest con `unplugin-swc` (necesario para los metadatos de decorador de NestJS). `test/setup.ts` carga el `.env` real: **las pruebas de integración golpean una base de datos PostgreSQL de verdad**, no Testcontainers ni mocks, pese a que `CLAUDE.md` §3 nombra Testcontainers en el stack.

### 5.2 Qué NO cubren

| Hueco | Evidencia |
|---|---|
| **Cero pruebas de interfaz** | No existe ningún `.spec.tsx`/`.test.tsx` en `medicfy-frontend/apps/web`. `apps/web/package.json` declara `"test": "vitest run"` y `"test:e2e": "playwright test"`, pero **no hay `vitest.config.ts` ni `playwright.config.ts`** en `apps/web`. Ambos scripts fallarían o correrían en vacío. |
| **`test:e2e` del backend apunta a un archivo inexistente** | `apps/api/package.json` → `"test:e2e": "vitest run --config ./vitest.e2e.config.ts"`; ese archivo no existe. |
| Escritorio de Consulta | Autoguardado, atajos de teclado, hidratación del borrador, respaldo cifrado en IndexedDB, paneles de receta/laboratorio: **nada de esto está probado**. Es el 80 % del tiempo del médico y es la superficie sin cobertura. |
| Reglas M8 declaradas y no probadas | M8-RN-007 (confirmación de signos vitales fuera de rango de plausibilidad) — el contrato solo rechaza lo fisiológicamente imposible y el comentario dice que la confirmación "se hace en el servicio"; no encontré ni la implementación ni la prueba. M8-CA-006 (alergias conciliadas antes de firmar) — el comentario del contrato dice "verificado en el servicio", sin prueba que lo demuestre. |
| Adjuntos clínicos | `ClinicalAttachment` no tiene código ni pruebas. |
| Auditoría | No hay prueba de lectura de `audit_log`, ni del encadenamiento de hash (no implementado). |
| MFA de extremo a extremo | Se prueba el conteo de logins sin MFA; no hay prueba del ciclo completo enrolar→confirmar→login con TOTP→códigos de respaldo. |
| Pendientes explícitos (`it.todo`) | 3: el aviso a los 28 minutos (DOC-06, marcado como asunto de frontend), y M4-CA-001/M4-CA-003 en `m4.integration.spec.ts` (ya resueltos en M5a y en k6, pero el `it.todo` sigue ahí). |
| Accesibilidad y contraste | `CLAUDE.md` §5 exige WCAG 2.2 AA/AAA, 16 px mínimo en texto clínico y área táctil de 44 px. No hay ninguna prueba automatizada que lo verifique. |

---

## 6. Dependencias de terceros relevantes

### 6.1 Backend (`medicfy-backend`)

| Paquete | Versión | Para qué se usa aquí |
|---|---|---|
| `@nestjs/common` · `core` · `platform-express` | ^10.4.15 | Framework del API. Nótese: **NestJS 10**, no 11 |
| `@nestjs/swagger` | ^8.1.0 | OpenAPI en `/api/docs`; el código documenta que es 3.0, no 3.1 |
| `@prisma/client` / `prisma` | ^5.22.0 | ORM y migraciones. **Prisma 5**, no 6 |
| `zod` | ^3.24.1 | Validación en el borde vía `ZodValidationPipe`; los tipos se derivan del esquema |
| `argon2` | ^0.41.1 | Hash de contraseñas (`password.service.ts`) |
| `jsonwebtoken` | ^9.0.2 | Access token de 15 min y `mfaSessionToken` parcial (`token.service.ts`) |
| `otpauth` | ^9.3.6 | TOTP: enrolamiento, verificación y URI para el QR (`totp.service.ts`) |
| `cookie-parser` | ^1.4.7 | Lee la cookie httpOnly del refresh token |
| `multer` | ^1.4.5-lts.1 | Subidas multipart en memoria (documentos, marca, resultados de laboratorio) |
| `pdfkit` | ^0.15.1 | Genera los PDF de receta y de orden de laboratorio |
| `zxcvbn` (en `packages/contracts`) | ^4.4.2 | Fuerza de contraseña en el validador compartido |
| `reflect-metadata` · `rxjs` | — | Requisitos de NestJS |
| `vitest` · `supertest` · `unplugin-swc` · `@swc/core` | — | Pruebas de integración; SWC emite los metadatos de decorador que esbuild no |
| `turbo` · `tsx` · `dotenv` · `typescript` | — | Tooling del monorepo |
| **No instalado pese a estar en el stack declarado** | — | Redis/BullMQ, AWS SDK / S3, Testcontainers, cliente de correo/SMS, pasarela de pago |

### 6.2 Frontend (`medicfy-frontend`)

| Paquete | Versión | Para qué se usa aquí |
|---|---|---|
| `next` | ^15.1.4 | App Router; `next/font/google` autohospeda Archivo, Source Sans 3 y Montserrat |
| `react` / `react-dom` | ^19.0.0 | React 19 |
| `tailwindcss` | ^3.4.17 | Sistema de diseño propio (`tailwind.config.ts` define `brand-*`, `critical-*`, `warn-*`, `success-*`, `danger-*`) |
| `react-hook-form` + `@hookform/resolvers` | ^7.54.2 / ^3.9.1 | Todos los formularios, con `zodResolver` contra los esquemas compartidos |
| `zod` | ^3.24.1 | Mismos contratos que el backend |
| `@medicfy/contracts` | workspace | Copia local del paquete de contratos |
| **`idb`** | ^8.0.1 | Envoltura de IndexedDB para `offline-draft-store.ts`: el borrador de nota se cifra con **AES-GCM** vía Web Crypto y la llave vive como `CryptoKey` no extraíble. Es la pieza que cumple la prohibición de `localStorage` para datos clínicos |
| `qrcode` | ^1.5.4 | QR de enrolamiento MFA en `/perfil` |
| `class-variance-authority` · `clsx` · `tailwind-merge` | — | Variantes de los primitivos de UI |
| `@playwright/test` · `vitest` | — | Declarados en `devDependencies` y **sin usar**: no hay configuración ni pruebas |
| **Ausente pese a `components.json`** | — | Ninguna dependencia de shadcn/ui ni Radix; los primitivos están escritos a mano |

### 6.3 Datos de terceros embebidos

| Recurso | Detalle |
|---|---|
| `medicfy-backend/prisma/data/cie10-dgis.json` | Catálogo CIE-10 completo y vigente de la Secretaría de Salud (DGIS/CEMECE) vía datos.gob.mx, CC-BY-4.0, descargado 2026-08-24; ~12,500 códigos con `VALID="SI"`. Se siembra en lotes de 2,000 |
| Escalas clínicas (`seed.ts`) | Glasgow (Teasdale & Jennett, *Lancet* 1974) y Apgar (Apgar, *Curr Res Anesth Analg* 1953), con la cita bibliográfica en el código. 16 campos, `specialtyId = null` |
| Catálogo de medicamentos | **10 filas sintéticas** escritas a mano, incluida Morfina (Grupo I) para poder probar el bloqueo. El propio seed advierte que las dosis y presentaciones son de ejemplo, no indicación clínica |

---

## 7. Cobertura del Escritorio de Consulta

Análisis región por región contra la descripción del encargo. Fuente: `medicfy-frontend/apps/web/src/app/(app)/consulta/[appointmentId]/*`.

### 7.1 Punto de entrada

Descrito: *"la consulta empieza con un clic sobre el renglón del paciente en la agenda del día"*.

Lo que hay: en `/agenda`, el renglón **no** es clicable como tal. El nombre del paciente es un enlace **al expediente**, no a la consulta; para entrar a la consulta hay que pulsar el botón "Iniciar" (o "Continuar consulta" si ya está `IN_PROGRESS`). A partir de ahí sí: `/consulta/[appointmentId]` dispara `POST /appointments/:id/start`, crea o recupera el encounter y decide `FIRST_VISIT` vs `FOLLOW_UP` sin intervención. **Un clic, en el botón correcto del renglón, no en el renglón.**

### 7.2 Zona 1 · Contexto persistente

| Elemento pedido | Estado | Evidencia |
|---|---|---|
| Identidad, edad, sexo | ✅ | `consulta-sidebar.tsx`: nombre completo enlazado al expediente, `medicfyId`, `patientAgeYears(birthDate)`, "Mujer"/"Hombre" |
| **Alergias activas destacadas** | ✅ | `AllergySummary` con `role="alert"`, borde/fondo `critical-600`/`critical-50`, icono ⚠ y texto — cumple la regla de que el color nunca sea el único portador de significado |
| Diagnósticos vigentes | ❌ | **No existe el concepto.** `EncounterDiagnosis` cuelga de cada encuentro; no hay lista de problemas activos, ni consulta que la derive, ni nada en el sidebar |
| Embarazo si aplica | ❌ | **Cero ocurrencias en todo el repo** de `embarazo`, `pregnan`, `gestac`, `FUM` o semanas de gestación — ni en el esquema, ni en migraciones, ni en TypeScript. Y ginecología es una de las cuatro especialidades del piloto |
| Medicación crónica | ⚠️ | Se muestran los `PatientMedication` con `status === "ACTIVE"`, que es el proxy más cercano; **no hay marca de cronicidad** en el modelo |
| Antecedentes | ✅ (extra) | `AntecedentesSummary` — no estaba en la descripción de Zona 1, pero está |
| Últimas 3 consultas | ✅ (extra) | Las 3 últimas firmadas, solo fecha y tipo |
| **"Arriba, siempre visible"** | ❌ | La región existe como **columna izquierda**, no como banda superior: `<aside className="... lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:w-72 lg:overflow-y-auto">`. En escritorio es fija con su propio scroll; por debajo de `lg` se apila arriba del formulario y **se va con el scroll** |

### 7.3 Zona 2 · Captura (SOAP)

| Elemento | Estado | Evidencia |
|---|---|---|
| Subjetivo | ✅ | "Motivo de consulta" + "Padecimiento actual" |
| Objetivo — signos vitales | ✅ | `VitalsFields`: 8 campos con `min`/`max` espejados del contrato Zod; **IMC calculado en servidor** con fórmula y versión guardadas (`vitals-calculations.util.ts`), nunca aceptado del cliente |
| Objetivo — escalas | ✅ (acotado) | `EscalasSection` lee `GET /specialty-field-schemas?section=ESCALAS` y agrupa por campo `COMPUTED`. Vista previa en cliente, cálculo autoritativo en servidor. **Solo Glasgow y Apgar, ambos con `specialtyId = null`**: ninguna escala específica de ginecología, pediatría o medicina interna |
| Objetivo — exploración física | ✅ | Campo opcional |
| Análisis | ✅ | Campo "Análisis" + `Icd10Picker` con la segunda ruta `codeAbsentReason` |
| Plan | ✅ | Campo "Plan" + "Pronóstico" opcional |
| Antecedentes según modo | ✅ | `FIRST_VISIT` abre el editor completo; `FOLLOW_UP` muestra el resumen colapsado con "Actualizar antecedentes" a un clic (M8-RN-012) |
| Autoguardado 10 s + sin conexión | ✅ | `use-encounter-autosave.ts`: intervalo de 10 s, guardado al ocultar la pestaña, respaldo cifrado en IndexedDB solo ante `NETWORK_ERROR`, y `fatalError` expuesto para que la pantalla decida (no reintenta errores reales del servidor) |
| Atajos de teclado | ✅ | `⌘/Ctrl+S` guardar · `⌘/Ctrl+Enter` firmar · `Alt+R` receta · `Alt+L` laboratorio · `Alt+1…9` insertar plantilla en el campo enfocado |
| Receta y orden sin salir de la pantalla | ✅ | `PrescriptionPanel` y `LabOrderPanel` sobre el componente `Panel` (deslizable desde la derecha, `Escape` cierra, foco devuelto al cerrar) |
| Cronómetro de la consulta | ✅ (extra) | Contador `m:ss` desde `startedAt` |
| Consulta completa **sin tocar el ratón** | ⚠️ | Los atajos cubren guardar/firmar/receta/laboratorio/plantillas, pero el `Icd10Picker`, el `MedicationPicker` y el editor de antecedentes son de clic; no hay navegación por regiones ni orden de tabulación diseñado. No verificable sin ejecutar |

### 7.4 Zona 3 · Panel de consulta (derecha)

| Elemento pedido | Estado | Evidencia |
|---|---|---|
| Hoja frontal | ❌ | No existe ese panel; los datos generales viven en otra pantalla (`/pacientes/[id]`, pestaña "Datos generales") |
| Historia | ⚠️ | Solo el resumen de antecedentes de la columna izquierda |
| Notas previas | ⚠️ | Solo **fechas y tipo** de las 3 últimas consultas firmadas. Para leer el contenido hay que **abandonar el escritorio** e ir a `/pacientes/[id]` → pestaña "Notas" |
| Estudios y resultados | ❌ | No hay nada de laboratorio en el escritorio salvo el panel de *emitir* orden. Los resultados están en `/pacientes/[id]` → "Órdenes y resultados" |
| **A la derecha** | ❌ | El único panel lateral persistente está a la **izquierda** (`aside` antes del formulario en un `flex-row`) |
| **Cajón deslizable en tableta** | ❌ | No hay cajón: por debajo de `lg` la columna simplemente se apila (`flex-col lg:flex-row`). El componente `Panel` sí es un cajón, pero solo lo usan receta y laboratorio |

### 7.5 Barra de cierre (abajo)

| Elemento | Estado | Evidencia |
|---|---|---|
| Fija abajo | ✅ | `<div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white p-4">` con `pb-24` en el contenedor para que nada quede tapado |
| Indicador de borrador autoguardado | ✅ | `IndicadorGuardado` con 4 estados (`guardado`, `guardando`, `sin-conexion`, `sin-respaldo`); aparece dos veces, en la barra superior y en la de cierre |
| "Firmar y cerrar consulta" | ✅ | Botón con `window.confirm` explícito ("una vez firmada, la nota no se puede editar — solo corregir con una nota nueva"), `POST .../sign`, limpieza del borrador local y redirección al expediente con `?justSigned=1`. Firmar **cierra la cita**: `signAndCompleteAppointment()` llama a `completeWithSignedNote()` |

### 7.6 Estimación

| Región | Cobertura estimada | Lo que falta |
|---|---|---|
| Zona 1 · Contexto persistente | ~55 % | Diagnósticos vigentes, embarazo, cronicidad; y está a la izquierda en lugar de arriba, sin persistencia real por debajo de `lg` |
| Zona 2 · Captura SOAP | ~85 % | Escalas solo genéricas (ninguna de las 4 especialidades), navegación completa sin ratón sin verificar, M8-RN-007 y M8-CA-006 sin evidencia |
| Zona 3 · Panel de consulta | ~35 % | Sin hoja frontal, sin lectura de notas previas, sin estudios/resultados, del lado equivocado y sin cajón para tableta |
| Barra de cierre | ~95 % | Nada material |
| **Global (promedio de las cuatro)** | **~65 %** | — |

### 7.7 Veredicto en tres frases

Calculo que **alrededor del 65 %** del Escritorio de Consulta descrito ya existe: la Zona 2 (nota SOAP con signos vitales, IMC y escalas calculados en servidor, autoguardado cada 10 s con respaldo cifrado sin conexión, atajos de teclado y paneles de receta y laboratorio que no obligan a navegar) y la barra de cierre (indicador de guardado + firmar-y-cerrar que además completa la cita) están prácticamente completas y respaldadas por el backend, con 93 endpoints y 155 casos de integración detrás. Lo que falta se concentra en las dos zonas de *contexto*: la Zona 1 existe como columna izquierda en vez de banda superior y le faltan tres de los seis elementos pedidos —diagnósticos vigentes, embarazo (cero ocurrencias en todo el repositorio, pese a que ginecología es especialidad del piloto) y medicación crónica como concepto—, y la Zona 3 sencillamente no está construida: leer una nota previa, la hoja frontal o un resultado de laboratorio obliga hoy a salir del escritorio hacia `/pacientes/[id]`, que es exactamente lo que el concepto central prohíbe. Me baso en la lectura directa de los seis archivos de `app/(app)/consulta/**`, del `usePatientClinical` que los alimenta y del `patient-clinical.service.ts` que responde: los datos para casi todo lo que falta en Zona 3 ya existen en `GET /records/patients/:id/timeline` — el hueco es de interfaz, no de backend.
