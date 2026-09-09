# Medicfy — resumen para dar contexto a una IA

> Este documento es un **briefing**, no la especificación completa. Está pensado para pegarlo como contexto inicial a otra IA (asistente de código, chat, etc.) que necesite entender qué es Medicfy sin leer todo el repositorio. La fuente de verdad completa sigue siendo `medicfy-backend/docs/ESPECIFICACION_TECNICA_MEDICFY_MVP.md` (registro de cambios en su §17) y `CLAUDE.md` en la raíz de cada monorepo.

## 1. Qué es Medicfy, en una frase

Medicfy es el **expediente clínico electrónico** (conforme a NOM-004), **receta electrónica con validez legal** y **órdenes de laboratorio** para el médico privado mexicano — mercado inicial: Zona Metropolitana de Guadalajara.

No es un CRUD genérico: guarda datos clínicos de personas reales bajo obligación legal de conservación e inmutabilidad. Un bug aquí no es un ticket — es un expediente que no defiende a un médico en una demanda, o una dosis mal leída.

## 2. Posicionamiento — la decisión estratégica más importante

Medicfy se lanza como **herramienta clínica del médico**, no como **directorio de pacientes**. La razón: no competir con Doctoralia en efecto de red antes de tener densidad de médicos. Esta recomendación se relajó parcialmente después (ver M3 en la tabla de módulos) por decisión explícita del fundador, con esa tensión ya sobre la mesa — no porque se abandonara la estrategia original.

## 3. Las siete reglas que no se rompen (R1–R7)

Cualquier tarea que las viole debe **detenerse y decirlo**, nunca implementarse "temporalmente" ni detrás de un flag.

| Regla | Contenido |
|---|---|
| **R1** | El expediente es **append-only**. Nunca `UPDATE`/`DELETE` sobre `clinical_notes`, `prescriptions`, `lab_orders`, `audit_log` — ni por ORM, ni el superadministrador. Corregir = insertar una nota nueva referenciando la original. Se hace cumplir con `GRANT` de PostgreSQL, no solo en código. |
| **R2** | **Ningún dato clínico sale por un canal externo.** Correos, SMS, logs, trazas de error, URLs, analítica — nunca nombre de medicamento, diagnóstico, valor de resultado ni contenido de nota. Se manda un enlace autenticado de vida corta. |
| **R3** | **Toda lectura de dato clínico se registra en `audit_log`** antes de responder — actor, rol, `patient_id`, IP, `request_id`, resultado. Incluye accesos denegados. |
| **R4** | **Nadie accede a un expediente sin `care_relationship` activo.** Admin/soporte nunca ven contenido clínico, solo metadatos. Acceso de emergencia (*break-glass*) exige justificación + doble aprobación + notificación al paciente. |
| **R5** | **Medicamentos controlados Grupos I y II están bloqueados.** Bloqueo duro, nunca advertencia ni *override*. COFEPRIS exige recetario físico — se ofrece registrar la receta física externa. |
| **R6** | **Una receta no se emite sin todos los campos del art. 33** del Reglamento de Insumos para la Salud, guardados como *snapshot* en la receta — nunca resueltos por `join` al imprimir. |
| **R7** | **Datos sintéticos fuera de producción**, siempre. Nunca copiar producción a `staging`, ni "anonimizada". |

## 4. Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript estricto, React 19, Tailwind |
| Backend | NestJS + TypeScript estricto |
| Base de datos | PostgreSQL 16 + Prisma |
| IA | API de Anthropic (Claude) — lectura clínica de apoyo y OCR de laboratorio, ver §7 |
| Pruebas | Vitest + Supertest + Playwright |

Prohibido sin autorización explícita: microservicios, Kafka/RabbitMQ, Kubernetes, GraphQL, event sourcing/CQRS, MongoDB, Firebase, `localStorage` para datos clínicos.

## 5. Estructura del repositorio

Monorepo único en git (`Medicfy33` en GitHub) con **dos monorepos internos independientes**, cada uno con su propio `package.json`/`pnpm-lock.yaml`:

```
medicfy-backend/    NestJS — apps/api, packages/contracts, prisma/
medicfy-frontend/   Next.js — apps/web, packages/contracts
docs/               documentación transversal (este archivo, medicfy-58-prompts.md)
```

`packages/contracts` (esquemas Zod compartidos web↔api) existe **duplicado físicamente** en ambos monorepos — no es un symlink ni un paquete publicado. Cada cambio de esquema se copia a mano al otro repo y se recompila (`tsc`) en ambos. Esto es una decisión operativa conocida, no un descuido.

Cada monorepo tiene su propio `CLAUDE.md` con las reglas de este documento más convenciones de flujo de trabajo (commits, fases de desarrollo, definition of done).

## 6. Conceptos centrales del modelo de datos

- **`User`** → puede ser `PATIENT`, `DOCTOR`, `ASSISTANT`, `LAB`, `SUPPORT`, `ADMIN`, `SUPERADMIN` o `CURATOR` (curador de catálogos clínicos cerrados).
- **`Patient`** / **`Doctor`** — perfiles; un `Doctor` tiene cédula profesional, especialidad, estado de verificación.
- **`care_relationship`** — el vínculo que autoriza a un médico a ver el expediente de un paciente (creado por cita, autorización explícita del paciente, o alta directa por el médico). Caduca a los 18 meses sin interacción. **Es la puerta de R4.**
- **`ClinicalEncounter`** — una consulta. Vive en estado `DRAFT` (autoguardado libremente en `draftContent`) hasta firmarse.
- **`ClinicalNote`** — la nota NOM-004, **inmutable una vez creada** (se inserta una sola vez, al firmar). Corregir = nota nueva con `isCorrectionOfNoteId`.
- **`VitalSignSet`**, **`NoteLabResult`**, **`EncounterDiagnosis`** — sub-registros tipados y congelados en el mismo momento que la nota, con el mismo patrón append-only.
- **`Prescription`** / **`LabOrder`** — documentos legales con folio, QR de verificación pública, hash de contenido, snapshot de datos del médico y del paciente.
- **`AuditLog`** — la bitácora de R3, nunca contiene el valor clínico, solo metadatos del acceso.
- **`ClinicalCatalogTerm`** — vocabularios clínicos cerrados (alergias, antecedentes, estudios, banderas rojas, etc.), curados por el rol `CURATOR`; ninguna pantalla de captura escribe texto libre en estos dominios.

## 7. Módulos construidos (estado real al día de hoy)

| Módulo | Qué hace | Estado |
|---|---|---|
| **M1 — Identidad y auth** | Registro médico/paciente, verificación de correo/teléfono, login, MFA (TOTP) obligatorio tras 3 inicios de sesión sin activarlo, aviso de inactividad, contraseña con visibilidad | Construido |
| **M2 / M2B / M3 / M5b — "Marketplace"** | Perfil público del médico, publicaciones con audiencia (pública/solo mis pacientes/privada) con likes y comentarios, directorio con búsqueda, agendamiento público real del paciente (`care_relationship` vía `origin=APPOINTMENT`, `patientId` siempre resuelto del token, nunca del body) | Construido — reversión consciente de la exclusión original de "directorio" (§2), documentada en el registro de cambios de la especificación |
| **M4 — Agenda** | Disponibilidad, reglas y excepciones, slots, citas | Construido |
| **M6 — Facturación** | Suscripción del médico a la plataforma. **El pago de la consulta ocurre fuera de la plataforma, a propósito** (M6-RN-006) — Medicfy no es pasarela de pago paciente↔médico | Parcial (suscripción sí; nada de pagos de consulta) |
| **M8 — Expediente / DOC-06** | La pantalla de consulta: signos vitales con rangos por edad y marca de crítico, escalas clínicas (Glasgow, Apgar, Bishop, EVA), antecedentes heredables por plantilla, percentilas de crecimiento (OMS/CDC), diagnósticos CIE-10, cancelación de nota firmada (nunca borrado), protocolos longitudinales de seguimiento | Construido — es el núcleo del producto |
| **M9 — Recetas** | Firma electrónica con reautenticación (contraseña + TOTP) o impresa/firma de puño y letra, interacciones fármaco-fármaco, cruce de alergias con justificación clínica obligatoria, bloqueo duro Grupos I/II (R5), catálogo de medicamentos con autoservicio del médico (agrega uno nuevo declarando su grupo de control explícitamente, sin aprobación de admin) | Construido |
| **M10 — Laboratorio** | Emisión de orden en PDF con folio/QR, analitos estructurados (no el PDF como fuente de verdad), **lectura automática de hojas de laboratorio por visión de Claude** (imagen o PDF, cualquier formato — nunca se guarda nada sin que el médico revise cada valor), marcado determinista de fuera de rango/crítico contra el rango impreso o una tabla propia curada, sección tipada congelada en la nota firmada | Construido — ver detalle en §8 |
| **Fase 8 — "El Segundo Lector"** | Asistente de IA de apoyo (nunca diagnostica ni prescribe): lectura estructurada por fase de la consulta con diferenciales/banderas rojas citando fuentes de una lista cerrada de autoridades clínicas, resumen objetivo rápido siempre visible en la pantalla de consulta, filtro determinista de banderas rojas independiente del modelo (umbrales de signos vitales + catálogo de síntomas) | Construido |
| **Catálogos y curaduría** | Vocabularios clínicos cerrados con normalización, detección de duplicados, bandeja de curador, fusión sin borrado | Construido |
| **Auditoría / Admin** | Panel de metadatos (nunca contenido clínico), reportes de bitácora | Parcial |

Lo que **no** existe todavía y nadie ha pedido inventar: mensajería médico-paciente, reseñas/calificaciones de pacientes sobre médicos, pasarela de pago para la consulta, escalamiento activo (push/SMS) de valores críticos de laboratorio.

## 8. El Segundo Lector y la lectura de laboratorio — cómo se usa la IA aquí

Es importante que una IA que ayude en este proyecto entienda que **la IA nunca decide nada clínico por sí sola** en Medicfy:

- El asistente clínico ("Segundo Lector") solo **señala qué mirar y con qué respaldo** — el médico decide siempre. Nunca sugiere una dosis exacta, nunca un diagnóstico definitivo (siempre "diferencial" o "sospecha"), y toda fuente citada debe venir de una lista cerrada de autoridades (OMS, CENETEC, NICE, etc.).
- La lectura automática de una hoja de laboratorio (por visión de Claude) es **solo transcripción**: extrae analito/valor/unidad/rango con un nivel de confianza honesto por valor, y **nada llega al expediente sin que el médico lo confirme campo por campo** ("regla de oro"). Si un valor de confianza baja no se confirma explícitamente, el sistema lo rechaza.
- El **marcado de fuera de rango/crítico nunca lo decide el modelo** — lo decide una función determinista del servidor contra el rango impreso en la hoja o una tabla de referencia propia (curada, con aprobación de un rol específico).

## 9. La pantalla que decide todo: DOC-06

El médico pasa el 80% de su tiempo aquí. Requisitos duros:

- Consulta de seguimiento completa **sin tocar el mouse**.
- Antecedentes, alergias y últimas 3 consultas visibles **sin scroll ni clic** en 1280×800.
- Autoguardado cada 10 s, funciona sin conexión.
- Emitir receta **sin salir de la pantalla**.
- Dos modos: Historia clínica (primera vez, 12–15 min objetivo) y Nota de evolución (seguimiento, 3–4 min objetivo).
- Mide el tiempo entre abrir y firmar cada nota — es la métrica del negocio, no telemetría opcional.

## 10. Seguridad y cumplimiento, en la práctica

- **NOM-004 / NOM-024** — estructura mínima del expediente y trazabilidad; guían qué campos son obligatorios en la nota y la receta.
- Texto clínico nunca menor a 16px; el color nunca es el único portador de significado (una alergia lleva color + ícono + texto); rojo reservado estrictamente a alertas de seguridad del paciente, nunca a errores de formulario.
- El *break-glass* (acceso de emergencia sin `care_relationship`) exige doble aprobación y notifica al paciente — no es un atajo técnico, es un procedimiento con consecuencias.
- Las claves de API (Anthropic, etc.) viven solo en variables de entorno no versionadas — nunca en el repositorio ni en logs.

## 11. Si esta IA va a tocar código

- La especificación (`ESPECIFICACION_TECNICA_MEDICFY_MVP.md`) es la única fuente de reglas de negocio — nunca se inventa una regla clínica, dosis o rango de referencia sin citarla o marcarla explícitamente como pendiente de validación médica.
- Todo cambio de esquema en `packages/contracts` se replica a mano en **ambos** monorepos y se recompila en ambos.
- Toda migración de base de datos debe ir acompañada del `GRANT` de PostgreSQL correspondiente — una tabla nueva sin `GRANT` no hereda permisos automáticamente.
- Ninguna funcionalidad fuera del alcance del MVP se implementa "porque es fácil" sin autorización explícita, aunque parezca una mejora obvia.
