# CLAUDE.md — CONSTITUCIÓN DEL PROYECTO MEDICFY

> **Instrucciones para el agente de código.** Este archivo se carga automáticamente en cada sesión. Léelo completo antes de escribir una sola línea. Si algo de lo que te pidan contradice este archivo, **este archivo gana** y debes decirlo en voz alta antes de continuar.
>
> Guárdalo como `CLAUDE.md` en la raíz del repositorio (o `AGENTS.md` según la herramienta que uses; Cursor lo lee como `.cursorrules`).

---

## 1. QUÉ ESTÁS CONSTRUYENDO

Medicfy es la herramienta clínica del médico privado mexicano: expediente clínico electrónico conforme a NOM-004, receta electrónica con validez legal, y órdenes de laboratorio. Mercado inicial: Zona Metropolitana de Guadalajara.

**Esto no es un CRUD.** Guarda datos clínicos de personas reales bajo obligación legal de conservación e inmutabilidad. Un bug aquí no es un ticket: es un expediente que no defiende a un médico en una demanda, o una dosis mal leída.

**Fuente de requisitos:** `ESPECIFICACION_TECNICA_MEDICFY_MVP.md` v2.0. Está en `/docs`. Es la única fuente. Si algo no está ahí, no está en el MVP.

---

## 2. LAS SIETE REGLAS QUE NO SE ROMPEN

Si una tarea te pide violar una de estas, **detente y dilo**. No la implementes "temporalmente", no la dejes con un TODO, no la pongas detrás de un flag.

**R1 — El expediente es append-only.** No existe `UPDATE` ni `DELETE` sobre `clinical_notes`, `prescriptions`, `lab_orders` ni `audit_log`. Ni por ORM, ni por consulta directa, ni por script de migración, ni por el superadministrador. Corregir una nota firmada = insertar una nota nueva con `is_correction_of_note_id`. Esto se hace cumplir a nivel de permisos de PostgreSQL (`GRANT`), no solo en el código de aplicación.

**R2 — Ningún dato clínico sale por un canal externo.** Correos, WhatsApp, SMS, logs, mensajes de error, trazas de Sentry, URLs y analítica **nunca** contienen nombre de medicamento, diagnóstico, valor de resultado ni contenido de nota. Se envía un enlace autenticado de vida corta. Si vas a registrar un objeto en un log, sanitízalo primero.

**R3 — Toda lectura de dato clínico se registra en `audit_log`** antes de responder, con actor, rol, `patient_id`, IP, `request_id` y resultado. Sin excepción, incluidos los accesos denegados.

**R4 — Nadie accede a un expediente sin `care_relationship` activo.** El administrador y el soporte **nunca** ven contenido clínico; solo metadatos. El acceso de emergencia (break-glass) exige justificación escrita, aprobación de un segundo administrador y notificación al paciente.

**R5 — Medicamentos controlados Grupos I y II están bloqueados.** Bloqueo duro, no advertencia, no `override`. COFEPRIS exige recetario físico. En su lugar se ofrece registrar la receta física externa (M9-RN-014).

**R6 — Una receta no se emite sin todos los campos del art. 33 del Reglamento de Insumos para la Salud**, y los datos legales se guardan como *snapshot* en la receta, nunca resueltos por `join` al imprimir.

**R7 — Datos sintéticos en todos los entornos que no sean producción.** Nunca copies producción a `staging`, ni siquiera "anonimizada". Los *seeds* generan pacientes ficticios.

---

## 3. STACK Y ESTRUCTURA

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript estricto, React 19, Tailwind, shadcn/ui |
| Backend | NestJS + TypeScript estricto |
| Base de datos | PostgreSQL 16 + Prisma |
| Colas | Redis + BullMQ |
| Archivos | S3 / R2, cifrado SSE-KMS, URLs prefirmadas ≤5 min |
| Pruebas | Vitest + Supertest + Testcontainers + Playwright |
| IaC | Terraform |

```
/apps
  /web          Next.js
  /api          NestJS
/packages
  /contracts    tipos y esquemas Zod compartidos web↔api
  /ui           componentes del design system
/infra          Terraform
/docs           especificación y módulos
/prisma         esquema y migraciones
```

**Monolito modular.** Un módulo NestJS por módulo funcional (`identity`, `doctors`, `scheduling`, `records`, `prescriptions`, `labs`, `billing`, `notifications`, `admin`, `audit`). Los módulos se comunican por servicios de aplicación, nunca importando repositorios ajenos. Esa frontera es lo que permitirá partirlo después si hace falta; hoy no hace falta.

**Prohibido sin autorización explícita:** microservicios, Kafka, RabbitMQ, Kubernetes, GraphQL, event sourcing, CQRS, MongoDB, Firebase, `localStorage` para datos clínicos.

---

## 4. CÓMO ESCRIBES CÓDIGO AQUÍ

**Convenciones**
- TypeScript en modo estricto. `any` prohibido; si es inevitable, comenta por qué.
- Validación de entrada con Zod en el borde (DTO), tipos derivados del esquema.
- Fechas: `TIMESTAMPTZ` en base de datos, UTC en el servidor, presentación en `America/Mexico_City` con IANA. **Ningún cálculo de horario en el navegador.**
- Dinero: enteros en centavos, nunca `float`.
- Errores: formato uniforme `{ error: { code, message, details, request_id } }`. Los códigos están en la especificación §7.
- Idempotencia obligatoria en creación de citas, recetas y pagos, y en todos los webhooks (unicidad por `provider_event_id` en base de datos).
- Nada de secretos en el repositorio. Variables de entorno tipadas y validadas al arranque.

**Orden de trabajo en cada tarea**
1. Lee la sección correspondiente de la especificación y cita el ID de la regla (`M8-RN-002`) en el commit.
2. Escribe primero la migración de base de datos y la prueba que falla.
3. Implementa.
4. Verifica los criterios de aceptación (`M8-CA-00X`) uno por uno, nombrándolos.
5. Si encuentras una ambigüedad en la especificación, **pregunta**. No inventes una regla de negocio clínica.

**Definition of done** — una tarea no está terminada si le falta cualquiera de estas:
- [ ] Migración de Prisma versionada y reversible
- [ ] Pruebas unitarias del dominio y de integración del endpoint
- [ ] Autorización verificada con prueba negativa (un rol que no debe poder, no puede)
- [ ] Registro en `audit_log` si toca datos clínicos
- [ ] Contrato OpenAPI actualizado
- [ ] Criterios de aceptación de la especificación citados y verificados
- [ ] Sin `any`, sin `console.log`, sin secretos, sin datos clínicos en logs

---

## 5. REGLAS DE FRONTEND

- **Texto clínico mínimo 16 px.** Dosis, alergias y valores de resultado nunca en tamaño menor. Un error de lectura de dosis es un evento adverso.
- Contraste WCAG 2.2 AA en todo; AAA en datos clínicos.
- Área táctil mínima 44×44 px.
- **El color nunca es el único portador de significado.** Alergia = color + icono + texto.
- `--critical-600` (rojo) está reservado a alertas de seguridad del paciente. **No se usa para errores de formulario.** Si el rojo aparece por un campo vacío, deja de significar peligro.
- Prohibido `localStorage` y `sessionStorage` para datos clínicos. El borrador de nota se guarda en IndexedDB cifrado y se sincroniza; todo lo demás vive en el servidor.
- Cada pantalla necesita sus cuatro estados: vacío, cargando, error y sin conexión. Un estado de error que solo dice "algo salió mal" no pasa revisión.
- Formularios: autoguardado con indicador visible en la nota clínica. **Perder texto clínico por un fallo de red es el peor bug posible en este producto.**

---

## 6. LA PANTALLA QUE DECIDE TODO: `DOC-06`

Es donde el médico pasa el 80% de su tiempo. Si es mediocre, ninguna otra importa. Requisitos duros:

- Una consulta de seguimiento completa **sin tocar el ratón** (navegación y atajos de teclado).
- Antecedentes, alergias y últimas 3 consultas visibles **sin scroll ni clic** en 1280×800.
- Autoguardado cada 10 s con funcionamiento sin conexión.
- Plantillas insertables por atajo de teclado.
- Emitir receta **sin salir de la pantalla** (panel lateral, no navegación).
- Dos modos: Historia Clínica (primera vez, objetivo 12–15 min) y Nota de Evolución (seguimiento, objetivo 3–4 min).
- Los antecedentes **se capturan una vez** y se arrastran; no se recapturan nunca.
- El sistema mide el tiempo entre abrir y firmar cada nota (`M8-RN-013`). Es la métrica del negocio, no telemetría opcional.

---

## 7. LO QUE NO DEBES HACER NUNCA

- Inventar una regla clínica, una dosis, un rango de referencia o un requisito normativo. Si no está en la especificación, pregunta.
- Sugerir diagnósticos o tratamientos desde código. Medicfy no diagnostica.
- Añadir dependencias sin justificarlas.
- "Simplificar" una regla de auditoría, de inmutabilidad o de permisos porque complica la implementación. Esa complicación es el producto.
- Escribir migraciones que borren o alteren datos clínicos existentes.
- Implementar funciones que no estén en el alcance del MVP (§2.1 de la especificación) aunque parezcan fáciles.
- Dar por terminada una tarea sin ejecutar las pruebas.

---

## 8. GLOSARIO

| Término | Significado |
|---|---|
| **NOM-004** | Norma mexicana del expediente clínico. Define la estructura mínima obligatoria |
| **NOM-024** | Norma de sistemas de registro electrónico en salud: trazabilidad, bitácora, respaldo |
| **Cédula profesional** | Identificador del médico emitido por la SEP. Inmutable tras verificación |
| **Encuentro** (`encounter`) | Una consulta. Contenedor de la nota, diagnósticos, receta y órdenes |
| **Nota de evolución** | Documentación de una consulta de seguimiento |
| **Grupo I–VI** | Clasificación de medicamentos de la Ley General de Salud art. 226. I y II son controlados |
| **Break-glass** | Acceso de emergencia a un expediente, con doble aprobación y notificación |
| **`care_relationship`** | Vínculo que autoriza a un médico a ver el expediente de un paciente |
| **SDG / FPP / FUM** | Semanas de gestación / fecha probable de parto / fecha de última menstruación |
