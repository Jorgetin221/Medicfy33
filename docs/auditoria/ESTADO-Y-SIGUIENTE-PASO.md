# Medicfy — estado al 27 de agosto de 2026 (2ª sesión) y siguiente paso

> Documento de traspaso. Si eres una sesión nueva retomando este trabajo,
> **lee esto primero** y luego `docs/auditoria/P6-remediacion.md`.

## Dónde estamos en el plan de 58 prompts

| Bloque | Estado |
|---|---|
| **Bloque 0 · Diagnóstico** (prompts 1–6) | **Terminado.** Informes en `docs/auditoria/P1`…`P6`. |
| **Remediación previa a la Fase 0** | **Terminada y VERIFICADA: la suite completa corrió en verde.** |
| **Fase 0 · Catálogos** (prompts 7–11) | **Terminada** (con dos piezas que esperan decisión de Jorge, ver abajo). |
| **Fase 1 · Escritorio de Consulta** (prompts 12–17) | **En curso — los tres hallazgos que P6 le asigna (#18, #19, #20) están cerrados y verificados.** |

## Verificación de la suite (esta sesión)

`binaries.prisma.sh` sigue bloqueado en este entorno; se desbloqueó
compilando el engine de Prisma **desde el código fuente** (tag 5.22.0 de
`prisma/prisma-engines`, commit exacto `605197…` — el que el cliente
espera). Receta completa en la "Nota operativa" de abajo. Con eso:

- **218 pruebas de API + 30 de contratos en verde, 0 fallos** (4 `it.todo`),
  contra Postgres 16 real con las 22 migraciones y el seed aplicados.
- Los cuatro arreglos del Bloque 0 quedaron **verificados ejecutando**:
  los tres IDOR (`m5a`, `lab-results`) y `REVOKE DELETE` (`append-only`).
- Typecheck estricto y eslint limpios en backend y frontend.
- `next build` del frontend: **verificado** — compila y prerenderiza las
  13 rutas usando el mecanismo oficial de mock de fuentes de next/font
  (`NEXT_FONT_GOOGLE_MOCKED_RESPONSES`); en la Mac las fuentes se
  descargan normal.

## Qué se construyó en la Fase 0 (prompts 7–11)

**Prompt 7-8 (ya existían):** esquema `ClinicalCatalogTerm`, normalizador
(ñ protegida, plural -as/-os), índice único `(domain, normalizedTerm)`.

**Prompt 9 — dominios y terminología:**
- La lista de dominios de catálogo quedó **cerrada en el contrato**
  (`CATALOG_DOMAINS` en `catalog.schema.ts`): ALERGIA_AGENTE,
  ESTUDIO_LABORATORIO, LABORATORIO_CLINICO, VIA_ADMINISTRACION,
  FRECUENCIA_DOSIS, ANTECEDENTE. La columna sigue siendo String (agregar
  un dominio = cambio de código, no migración).
- El clúster de respuestas negativas («Ninguno/Ninguna/Negados/SANO») —
  el grupo que P4 §4.4 señaló como sin dueño — se sembró como término
  canónico **"Negado"** del dominio ANTECEDENTE con las variantes como
  sinónimos curados (`prisma/seed.ts`).
- El enum de 30 subtipos de antecedentes sigue siendo la fuente primaria.

**Prompt 10 — rol curador:**
- `CURATOR` agregado a `RoleName` (migración `20260827040000`);
  `CuratorGuard` (acepta CURATOR y SUPERADMIN para el arranque; ADMIN
  a propósito NO).
- `curatedBy` ahora es **FK real a users(id)** (migración `20260827040100`)
  y lo fija **siempre el servidor** con el actor autenticado — se eliminó
  del contrato de entrada.
- API nueva en `catalog.controller.ts`: GET `/catalogs/:domain` (lectura
  con búsqueda normalizada y por sinónimos, cualquier autenticado),
  POST `/catalogs/:domain/terms`, POST `/catalogs/terms/:id/merge`,
  POST `/catalogs/terms/:id/obsolete`, GET `/catalogs/:domain/duplicates`
  (todo curador; **no existe DELETE**). Cada mutación queda en `audit_log`.
- Informes del curador (P4 §6.10, "escotilla medida"): GET
  `/catalogs/reports/antecedentes-otro` y `/reports/diagnosticos-sin-codigo`
  — frecuencias del texto libre, umbral mínimo de 2, acceso auditado.

**Prompt 11 — cero duplicados:**
- `create()` ahora rechaza también colisiones contra **sinónimos** (ambas
  direcciones: término nuevo vs sinónimos existentes, y sinónimos nuevos
  vs términos existentes) — cerraba el hueco de P4 §4.6.
- 20 pruebas nuevas: `catalog-api.integration.spec.ts` (8, incluye la
  prueba negativa de autorización DOCTOR→403) y ampliaciones en
  `clinical-catalog.integration.spec.ts`.

**Remediaciones inmediatas de P4 §6.1–6.4 (iban con la fase):**
- Seis vocabularios cerrados con `z.enum` en los contratos:
  `allergyType`, `severity`, `source` (alergia), `source` y `route`
  (medicación), `bloodType` (cerrado ANTES de exponerse en la UI).
- `substance` de alergia: `min(3)` — mata los falsos positivos por
  subcadena corta («no», «x») del cruce alergia↔receta.
- `EncounterDiagnosis.description`: `.max(500)` (era el único campo sin tope).
- Frontend: los cinco `<TextInput>` correspondientes ahora son
  `<SelectInput>` (`tab-antecedentes.tsx`), con etiquetas compartidas
  desde los contratos.
- Plantillas de nota (#14): vista previa del contenido exacto + aviso de
  datos identificables antes de guardar (`note-template-bar.tsx`).
- `packages/contracts` **re-sincronizado** entre backend y frontend
  (idénticos otra vez; la divergencia de P1 quedó cerrada — la
  consolidación física en un solo paquete sigue pendiente, #10).

## Qué se construyó de la Fase 1 (27 ago, misma sesión)

**#18 — Embarazo** (no existía en ninguna parte del repositorio):
- Modelo `PatientPregnancy` + migración `20260827050000`: FUM opcional,
  FPP siempre presente (servidor: FUM+280 por Naegele, o la capturada
  por ultrasonido), método de datación explícito, un solo ACTIVE por
  paciente (índice único parcial de Postgres), DELETE revocado.
- Las SDG se calculan al LEER a partir de la FPP y nunca se almacenan.
- Endpoints bajo `/records/patients/:id/pregnancy` (GET/POST/PATCH/close),
  todos tras CareRelationshipGuard y con bitácora. Una FUM recordada
  tarde no degrada una datación por ultrasonido.
- Zona 1: banner "🤰 Embarazo: X.Y SDG · FPP …" bajo el encabezado.

**#19 — Diagnósticos vigentes** (no había lista de problemas activos):
- `GET /records/patients/:id/active-diagnoses`: vista DERIVADA de los
  diagnósticos de consultas firmadas — deduplicada por CIE-10, o por
  descripción normalizada (el normalizador del catálogo) cuando no hay
  código; con conteo de repeticiones y orden por más reciente. Sin
  tabla nueva y sin ciclo de vida inventado: marcar un problema como
  "resuelto" es una regla clínica que queda para Jorge.
- Zona 1: sección "Diagnósticos vigentes" (top 5) antes de Antecedentes.

**#20 — Infraestructura de pruebas de frontend** (había CERO pruebas de UI):
- Vitest + Testing Library (`apps/web/vitest.config.ts`): primeras 5
  pruebas de componente, sobre la Zona 1 (banner de embarazo,
  diagnósticos vigentes, últimas 3 firmadas, estados vacíos).
- **Playwright a 1280×800** (`playwright.config.ts`, proyecto
  "tableta"): el criterio duro de DOC-06 ahora es una prueba que corre
  — `e2e/doc06-tableta.spec.ts` verifica la Zona 1 COMPLETA visible
  sin scroll ni clic (nombre, embarazo, diagnósticos, antecedentes,
  alergias, últimas 3 consultas, cada caja dentro de los 800px) y los
  objetivos táctiles de 44px (R8). `e2e/global-setup.ts` siembra
  doctora verificada + paciente con la Zona 1 poblada por la API real.
- Para correrlo: API en :3001, web en :3000 (`next start` tras build),
  `npx playwright test` en apps/web. En entornos con Chromium
  preinstalado: `E2E_CHROMIUM_PATH=<binario>`.
- Verificado en esta sesión: 2/2 e2e en verde contra la pila completa
  (Postgres real + API real + build de producción del web).

Suite total tras la Fase 1 parcial: **227 API + 30 contratos + 5 UI +
3 e2e**, typecheck y lint limpios en ambos árboles.

**Segundo bloque de la Fase 1 (misma sesión):**
- **Consulta sin ratón, probada**: `e2e/doc06-teclado.spec.ts` ejecuta
  una consulta de seguimiento completa solo con teclado — nota, alta de
  diagnóstico con ↑/↓/Enter en el buscador CIE-10 (navegación de
  combobox agregada al picker, con roles ARIA), Ctrl+Enter para firmar,
  confirmación nativa y redirección con toast. 3/3 e2e en verde.
- **M8-RN-013 persistida**: `timeToSignSeconds` en ClinicalEncounter,
  fijada por el SERVIDOR al firmar (migración `20260827060000`), con
  prueba de integración. Es tiempo de reloj de pared: un borrador
  retomado días después la infla, y eso queda visible a propósito.
- **Dos modos con objetivo visible**: el cronómetro de DOC-06 muestra
  "objetivo 12–15 min" / "3–4 min" según el modo y avisa con TEXTO
  (no solo color) al rebasarlo.
- El autoguardado offline (IndexedDB cifrado) YA EXISTÍA
  (`offline-draft-store.ts` + `use-encounter-autosave.ts`).

**Qué le queda a la Fase 1:** prueba dedicada del almacén offline
(fake-indexeddb) y el cierre formal contra el texto de los prompts
12-17 — **el documento de 58 prompts no está en el repo**; con él a la
mano se verifica prompt por prompt.

## Decisiones tomadas por delegación (revisar cuando Jorge quiera)

1. Valores exactos de los enums clínicos (tipos de alergia, severidades
   LEVE/MODERADA/GRAVE, fuentes, 10 vías de administración) — salen de
   P4 §2.7-2.8 y de los hints que ya estaban en los formularios, pero son
   vocabulario clínico: **merecen su ojo de médico**.
2. `CuratorGuard` acepta SUPERADMIN mientras no exista flujo de alta de
   curadores.
3. La prueba vieja «origin=APPOINTMENT al agendar» se convirtió en
   `it.todo` para M5b: contradecía la remediación IDOR #1 (agendar ya no
   emite vínculo; ese origen queda para cuando agende el PACIENTE).

## Lo que sigue pendiente de Jorge

De las siete decisiones 🔒 del documento de 58 prompts siguen abiertas:
su material clínico real (prompt 24), base de medicamentos (33), alcance
de la firma (43), contenido mínimo NOM-004 (46), dónde corre el modelo de
IA (49) y la lista de banderas rojas (52). La terminología de
antecedentes (9) quedó resuelta con el enum de 30 + el término "Negado";
si quiere ampliar el vocabulario, el flujo del curador ya existe.

## Siguiente paso, en orden

1. En la Mac (único paso que exige su terminal — su Postgres local no es
   alcanzable desde la sesión): `bash scripts/sync-dev.sh` dentro de
   `medicfy-backend/`. En `medicfy-frontend`: `pnpm install && pnpm build`.
2. **Continuar la Fase 1**: consulta de seguimiento sin ratón (prueba
   de teclado e2e), autoguardado sin conexión y métrica abrir→firmar
   persistida — de preferencia con el texto de los prompts 12-17 a la
   mano.

## Historial de git

```
(nuevo)  Fase 0 (prompts 7-11): rol curador, API de catálogos, vocabularios cerrados
(nuevo)  Bloque 0 verificado: suite completa en verde (218 pruebas)
257fb0b  Documenta el estado de traspaso del Bloque 0
abf9ec0  Bloque 0: cierra los tres IDOR, el cruce de alergia y el borrado clínico
1e4a98e  Punto de retorno: trabajo en curso antes de la remediación del Bloque 0
```

## Nota operativa — cómo correr la suite donde binaries.prisma.sh está bloqueado

1. `git clone --depth 1 --branch 5.22.0 https://github.com/prisma/prisma-engines.git`
   (el tag 5.22.0 ES el commit `605197…` que el cliente busca).
2. Quitar `rust-toolchain.toml` (fija 1.82, cuya descarga también está
   bloqueada) y compilar con el toolchain instalado:
   `cargo build -p query-engine-node-api`. Con rustc ≥1.90, el crate
   `metrics 0.23` necesita un parche de una línea (transmute explícito en
   `recorder/mod.rs`, rust-lang/rust#141402).
3. `prisma generate` sin red: `PRISMA_QUERY_ENGINE_LIBRARY=/ruta/dummy
   PRISMA_SCHEMA_ENGINE_BINARY=/ruta/dummy npx prisma generate` (archivos
   vacíos; los env-override saltan la descarga).
4. Copiar `target/debug/libquery_engine.so` como
   `libquery_engine-debian-openssl-3.0.x.so.node` dentro de
   `node_modules/.pnpm/@prisma+client…/node_modules/.prisma/client/`
   (en las DOS copias de `.pnpm` si existen).
5. Migraciones sin schema-engine: aplicar los `migration.sql` en orden con
   `psql` y registrar a mano en `_prisma_migrations`.

Git deja archivos de bloqueo que no se pueden borrar cuando el permiso de
borrado del puente de dispositivos se cae: renombrarlos a `.git/_basura/`
antes de cada comando de git. `_to_delete/` y `.git/_basura/` se pueden
borrar a mano sin consecuencias.

Y **ResearcherTin** (`~/Downloads/ResearcherTin`): respaldado en git
(commit `91095cd`); Jorge todavía no ha dicho qué sigue ahí.
