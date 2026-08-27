# CLAUDE.md — CONSTITUCIÓN DEL PROYECTO MEDICFY

> **Instrucciones para el agente de código.** Este archivo se carga automáticamente en cada sesión. Léelo completo antes de escribir una sola línea. Si algo de lo que te pidan contradice este archivo, **este archivo gana** y debes decirlo en voz alta antes de continuar.
>
> Guárdalo como `CLAUDE.md` en la raíz de cada monorepo (`medicfy-backend/` y `medicfy-frontend/`). Cursor lo lee como `.cursorrules`; OpenAI Codex y Gemini Code lo leen como `AGENTS.md` si se renombra.

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
| Archivos | S3 / R2, cifrado SSE-KMS, URLs prefirmadas <= 5 min |
| Pruebas | Vitest + Supertest + Testcontainers + Playwright |
| IaC | Terraform |

```
/apps
  /web          Next.js
  /api          NestJS
/packages
  /contracts    tipos y esquemas Zod compartidos web<->api
  /ui           componentes del design system
/infra          Terraform
/docs           especificacion y modulos
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
- Área táctil mínima 44x44 px.
- **El color nunca es el único portador de significado.** Alergia = color + icono + texto.
- `--critical-600` (rojo) está reservado a alertas de seguridad del paciente. **No se usa para errores de formulario.** Si el rojo aparece por un campo vacío, deja de significar peligro.
- Prohibido `localStorage` y `sessionStorage` para datos clínicos. El borrador de nota se guarda en IndexedDB cifrado y se sincroniza; todo lo demás vive en el servidor.
- Cada pantalla necesita sus cuatro estados: vacío, cargando, error y sin conexión. Un estado de error que solo dice "algo salió mal" no pasa revisión.
- Formularios: autoguardado con indicador visible en la nota clínica. **Perder texto clínico por un fallo de red es el peor bug posible en este producto.**

---

## 6. LA PANTALLA QUE DECIDE TODO: `DOC-06`

Es donde el médico pasa el 80% de su tiempo. Si es mediocre, ninguna otra importa. Requisitos duros:

- Una consulta de seguimiento completa **sin tocar el ratón** (navegación y atajos de teclado).
- Antecedentes, alergias y últimas 3 consultas visibles **sin scroll ni clic** en 1280x800.
- Autoguardado cada 10 s con funcionamiento sin conexión.
- Plantillas insertables por atajo de teclado.
- Emitir receta **sin salir de la pantalla** (panel lateral, no navegación).
- Dos modos: Historia Clínica (primera vez, objetivo 12-15 min) y Nota de Evolución (seguimiento, objetivo 3-4 min).
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
| **Grupo I-VI** | Clasificación de medicamentos de la Ley General de Salud art. 226. I y II son controlados |
| **Break-glass** | Acceso de emergencia a un expediente, con doble aprobación y notificación |
| **`care_relationship`** | Vínculo que autoriza a un médico a ver el expediente de un paciente |
| **SDG / FPP / FUM** | Semanas de gestación / fecha probable de parto / fecha de última menstruación |
| **Boyscout** | Práctica de mejorar el código existente que se toca, aunque no sea parte de la tarea |
| **TDD** | Test-Driven Development: primero escribe la prueba que falla, luego el código que la pasa |
| **Mock server** | `dev-server.mjs` — servidor HTTP local que simula la API sin base de datos real |

---

## 9. CÓMO LEVANTAR EL ENTORNO LOCAL

El proyecto corre en dos monorepos separados. Sigue este orden exacto; saltarte un paso romperá la app.

### Requisitos previos
- Node.js >= 20 (recomendado: v24.x)
- pnpm >= 9 (`npm install -g pnpm`)
- Git

### Paso a paso

```powershell
# 1. Clonar el repositorio
git clone https://github.com/Jorgetin221/Medicfy33.git
cd Medicfy33

# 2. Backend — instalar dependencias y generar Prisma Client
cd medicfy-backend
pnpm install --ignore-scripts
cd packages/contracts && node ./node_modules/typescript/bin/tsc && cd ../..
node ./node_modules/prisma/build/index.js generate

# 3. Backend — variables de entorno (solo la primera vez)
copy .env.example .env   # ajusta los valores si tienes PostgreSQL local

# 4. Backend — levantar el mock server (puerto 3001, sin PostgreSQL)
node dev-server.mjs      # dejalo corriendo en una terminal aparte

# 5. Frontend — instalar dependencias y compilar contratos
cd ../medicfy-frontend
pnpm install
cd packages/contracts && node ./node_modules/typescript/bin/tsc && cd ../..

# 6. Frontend — variables de entorno
#    Asegúrate de que exista: NEXT_PUBLIC_API_BASE_URL=http://localhost:3001

# 7. Frontend — levantar el servidor de desarrollo (puerto 3000)
cd apps/web
node ./node_modules/next/dist/bin/next dev
```

### URLs
- Frontend: http://localhost:3000
- Backend (mock): http://localhost:3001
- Health check: http://localhost:3001/health

### Credenciales de prueba (dev only — R7)
- **Médico:** `doctor@medicfy.dev` / `Medicfy2026!Doctor`
- **Admin:** `admin@medicfy.dev` / `Medicfy2026!Admin`

### Si el mock server no tiene el endpoint que necesitas
1. Abre `medicfy-backend/dev-server.mjs`.
2. Localiza la sección de rutas (agrupadas por módulo: `auth`, `appointments`, `patients`, `encounters`, `prescriptions`…).
3. Agrega el endpoint siguiendo el mismo patrón: `if (method === 'GET' && pathname === '/tu/ruta') { ... }`.
4. Devuelve datos ficticios que respeten los tipos del contrato en `packages/contracts/src/schemas/`.
5. **Nunca** pongas datos clínicos reales en el mock, aunque sea "para probar" (R7).

---

## 10. CONVENCIONES DE COMMITS Y RAMAS

### Rama de trabajo
Actualmente **solo existe `main`**. Todo el código va directamente a `main`. No crear ramas adicionales salvo indicación explícita del equipo.

### Formato del mensaje de commit

```
<tipo>(<módulo>): <descripción corta en imperativo>

<cuerpo opcional: qué problema resuelve y por qué esta solución>

Refs: <ID de regla de la especificación, ej. M8-RN-013>
```

**Tipos permitidos:**

| Tipo | Cuándo usarlo |
|---|---|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de bug |
| `test` | Solo añade o modifica pruebas |
| `refactor` | Mejora interna sin cambio de comportamiento |
| `docs` | Solo documentación |
| `chore` | Tareas de mantenimiento (deps, config) |
| `migration` | Migración de base de datos |

**Ejemplo correcto:**
```
feat(records): agregar cálculo de SDG por Naegele en embarazo activo

El servidor calcula las semanas de gestación a partir de FUM+280 o
de la FPP capturada por ultrasonido. Nunca se almacenan en BD.

Refs: M6-RN-018, M6-CA-002
```

### Cuándo commitear
- Al completar cada **paso de la Planificación** (ver §11).
- Nunca acumules más de una fase del flujo en un solo commit.
- Cada commit debe compilar y pasar las pruebas existentes. Si rompe algo, **no lo pushes**.

---

## 11. FLUJO DE TRABAJO OBLIGATORIO PARA TODO CAMBIO DE CÓDIGO

**Este flujo aplica a cualquier cambio, por pequeño que parezca.** No se salta ninguna fase. Si el cambio es trivial (typo, comentario), se permite comprimir Análisis + Planificación en un párrafo, pero las fases de Pruebas, Boyscout y Auditoría son siempre obligatorias.

```
ANÁLISIS → PLANIFICACIÓN → IMPLEMENTACIÓN → PRUEBAS → BOYSCOUT → AUDITORÍA → CIERRE
```

---

### FASE 1 — ANÁLISIS

Antes de tocar una sola línea de código:

1. **Lee la especificación** (`/docs/ESPECIFICACION_TECNICA_MEDICFY_MVP.md`) en la sección relevante.
2. **Identifica el alcance real** del cambio:
   - ¿Qué módulos del backend se ven afectados? (controllers, services, repositorios, esquemas Prisma)
   - ¿Qué componentes del frontend cambian? (páginas, componentes, hooks, contratos)
   - ¿Hay migraciones de base de datos necesarias?
   - ¿Se modifica algún contrato compartido (`packages/contracts`)? Si sí, ambos lados deben actualizarse en el mismo commit.
3. **Detecta dependencias ocultas:**
   - ¿Hay pruebas existentes que podrían romperse?
   - ¿Hay endpoints del mock server (`dev-server.mjs`) que necesiten actualizarse?
   - ¿Hay efectos sobre `audit_log`, permisos o `care_relationship`?
4. **Verifica las 7 Reglas** (§2). Si el cambio podría violar alguna, detente y comunícalo antes de continuar.
5. **Si hay ambigüedad clínica o normativa:** no inventes. Deja un comentario `// PENDIENTE: <pregunta concreta para Jorge>` y continúa solo con lo que es seguro.

> El análisis se documenta en el archivo de planificación (Fase 2). No es un paso mental: es texto escrito.

---

### FASE 2 — PLANIFICACIÓN

Crea el archivo `docs/planes/<YYYYMMDD>-<nombre-corto>.md` con esta estructura:

```markdown
# Plan: <título del cambio>

**Fecha:** YYYY-MM-DD
**Reglas de especificación involucradas:** M8-RN-XXX, M8-CA-XXX
**Estimación de pasos:** N commits

## Análisis de impacto
- Módulos backend afectados: ...
- Componentes frontend afectados: ...
- Contratos modificados: sí/no
- Migraciones necesarias: sí/no
- Riesgo de regresión: bajo/medio/alto — justificación

## Pasos de implementación
1. [ ] Paso 1 — descripción (commit: `feat(módulo): ...`)
2. [ ] Paso 2 — descripción (commit: `feat(módulo): ...`)

## Criterios de aceptación
- [ ] CA-1: ...
- [ ] CA-2: ...

## Plan de pruebas
- Pruebas de integración: qué endpoints y casos
- Pruebas E2E: qué flujos de usuario cubrir
- Pruebas negativas: qué debe estar prohibido y por qué
```

**Este archivo se commitea antes de escribir código de producción:**
```
docs(planes): plan de implementación para <nombre-corto>
```

---

### FASE 3 — IMPLEMENTACIÓN

Sigue el orden de pasos del plan. Por cada paso:

1. Escribe **primero la migración** (si aplica) y **luego la prueba que falla** (TDD).
2. Implementa el código hasta que la prueba pase.
3. Actualiza el contrato compartido si cambió la API.
4. Actualiza el mock server (`dev-server.mjs`) si el endpoint es nuevo o cambia su contrato.
5. Commitea solo ese paso con el formato de §10.
6. Marca el paso como `[x]` en el archivo de planificación.

**Reglas durante la implementación:**
- Nunca mezcles dos pasos del plan en un mismo commit.
- Si descubres que el plan era incorrecto, **actualiza el plan primero** y commitéalo antes de continuar.
- No dejes `console.log`, `TODO` sin ticket, ni código comentado sin explicación.

---

### FASE 4 — PRUEBAS

Una vez completados todos los pasos de implementación:

#### 4a. Pruebas de Backend (Vitest + Supertest — equivalente a xUnit en .NET)

```powershell
# Desde medicfy-backend/
pnpm test              # corre toda la suite
pnpm test --watch      # modo watch durante desarrollo
pnpm test --coverage   # con reporte de cobertura
```

Cada módulo nuevo debe tener:
- **Prueba unitaria del servicio:** casos felices + casos de error de dominio.
- **Prueba de integración del endpoint:** al menos una por método HTTP, incluyendo una **prueba negativa de autorización** (rol incorrecto → 403).
- **Prueba de auditoría:** que el acceso a datos clínicos quede registrado en `audit_log`.

Nombrado: `<módulo>.integration.spec.ts` para integración, `<módulo>.service.spec.ts` para unitarias.

#### 4b. Pruebas de Frontend (Vitest + Testing Library)

```powershell
# Desde medicfy-frontend/apps/web/
node ./node_modules/vitest/vitest.mjs run
```

Cada componente nuevo que maneje datos clínicos o pertenezca a `DOC-06` debe tener pruebas de:
- Renderizado correcto en estado vacío, cargando y con datos.
- Accesibilidad básica (roles ARIA, navegación por teclado si aplica).

#### 4c. Pruebas E2E (Playwright)

```powershell
# Desde medicfy-frontend/apps/web/
npx playwright test                    # todos los proyectos
npx playwright test --project=tableta  # resolución 1280x800
npx playwright test --project=teclado  # flujo sin ratón
npx playwright test --ui               # modo visual interactivo
```

Cada flujo de usuario nuevo que involucre `DOC-06` o la emisión de receta debe tener al menos un spec E2E que:
- Use datos semilla del `global-setup.ts`.
- Verifique el flujo completo de inicio a confirmación visible en UI.
- Incluya el caso de error más probable.

#### 4d. Criterio de paso
**Las tres suites deben estar en verde antes de pasar a la Fase 5.** No está permitido deshabilitar pruebas existentes para que pasen.

---

### FASE 5 — BOYSCOUT

> "Deja el código mejor de lo que lo encontraste." — Robert C. Martin

Revisa **todo el código que tocaste** (no solo el nuevo):

1. **Funciones modificadas:** ¿Están más claras que antes? ¿Se puede extraer alguna responsabilidad?
2. **Nombres:** ¿Las variables, funciones y clases dicen exactamente lo que hacen? Renombra si no.
3. **Comentarios obsoletos:** Elimina los que ya no aplican. Actualiza los que describan comportamiento que cambió.
4. **Duplicación:** Si descubriste lógica duplicada, extráela ahora.
5. **Manejo de errores incompleto:** ¿Los bloques `catch` registran suficiente contexto?
6. **Importaciones innecesarias:** Elimina las que ya no se usan.

Commitea las mejoras Boyscout separadas del código nuevo:
```
refactor(records): limpiar servicio de encuentros tras implementación de SDG
```

---

### FASE 6 — AUDITORÍA DE CALIDAD

Revisa el código implementado contra estos criterios antes de hacer push:

#### SOLID

| Principio | Qué revisar |
|---|---|
| **S** — Single Responsibility | ¿Cada clase/función tiene una sola razón para cambiar? |
| **O** — Open/Closed | ¿Se puede extender el comportamiento sin modificar código existente? |
| **L** — Liskov | ¿Las implementaciones son intercambiables sin romper el comportamiento esperado? |
| **I** — Interface Segregation | ¿Los contratos son pequeños y específicos? ¿Nadie depende de métodos que no usa? |
| **D** — Dependency Inversion | ¿Los módulos de alto nivel dependen de abstracciones, no de implementaciones concretas? |

#### Clean Code
- Funciones de máximo 20 líneas. Si supera ese límite sin justificación, extrae.
- Ningún nivel de anidación mayor a 3. Usa early returns.
- Nombres en inglés para código; español solo para mensajes visibles al usuario y comentarios de dominio clínico.
- Sin números mágicos: extrae constantes con nombre descriptivo.
- Sin estado global mutable fuera de la capa de base de datos.

#### Seguridad
- ¿Toda entrada del usuario pasa por validación Zod antes de llegar al servicio?
- ¿Los errores expuestos al cliente no revelan detalles de implementación ni stack traces?
- ¿Las URLs de archivos son prefirmadas con TTL <= 5 min?

Commitea las mejoras de auditoría en un commit separado:
```
refactor(prescriptions): aplicar principio S y extraer validación de dosis
```

---

### FASE 7 — CIERRE

1. **Actualiza el archivo de planificación**: marca todos los pasos como `[x]` y agrega:

   ```markdown
   ## Resultado final
   **Estado:** Completado
   **Commits incluidos:** (lista los títulos de commit)
   **Pruebas:** N backend / N frontend / N E2E — todas en verde
   **Notas para el equipo:** (decisiones tomadas, deuda técnica conocida, preguntas pendientes)
   ```

2. **Verifica una última vez** que el repo compila limpio y las pruebas pasan:
   ```powershell
   # Backend
   cd medicfy-backend && pnpm test

   # Frontend
   cd medicfy-frontend/apps/web
   node ./node_modules/vitest/vitest.mjs run
   npx playwright test
   ```

3. **Push a `main`:**
   ```powershell
   git push origin main
   ```

4. **No hagas push si:**
   - Alguna prueba está en rojo.
   - Hay `console.log` de debug sin limpiar.
   - El archivo de planificación no está actualizado.
   - Hay secretos o datos clínicos reales en el código.

---

## 12. PROTOCOLO ANTE AMBIGÜEDAD O BLOQUEO

Si durante cualquier fase encuentras algo que no sabes cómo resolver:

1. **No inventes** una regla de negocio clínica, normativa o de seguridad.
2. Deja un marcador en el código:
   ```typescript
   // PENDIENTE(jorge): descripción concreta de la duda. Ref: M8-RN-045
   ```
3. Documenta la pregunta en la sección "Notas para el equipo" del archivo de planificación.
4. Continúa con lo que sí está claro. No bloquees el trabajo completo por una ambigüedad.
5. Incluye `PENDIENTE:` en el cuerpo del commit para que sea buscable.
