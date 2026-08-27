# Medicfy — estado al 27 de agosto de 2026 y siguiente paso

> Documento de traspaso. Si eres una sesión nueva retomando este trabajo,
> **lee esto primero** y luego `docs/auditoria/P6-remediacion.md`.

## Dónde estamos en el plan de 58 prompts

| Bloque | Estado |
|---|---|
| **Bloque 0 · Diagnóstico** (prompts 1–6) | **Terminado.** Informes en `docs/auditoria/P1`…`P6`. |
| **Remediación previa a la Fase 0** | **Escrita y commiteada. Falta correr la suite.** |
| **Fase 0 · Catálogos** (prompts 7–11) | No empezada. Parte del prompt 7/8 ya existía en el árbol. |

## Historial de git

```
abf9ec0  Bloque 0: cierra los tres IDOR, el cruce de alergia y el borrado clínico
1e4a98e  Punto de retorno: trabajo en curso antes de la remediación del Bloque 0
370d811  M2 (perfil médico y verificación)     ← último commit anterior a esta sesión
```

`1e4a98e` es el checkpoint del trabajo que Jorge tenía sin commitear (módulo
`catalog`, escalas por especialidad, cálculo de signos vitales, 3 migraciones).
Para deshacer sólo la remediación sin perder eso: `git reset --hard 1e4a98e`.

## Lo que quedó verificado ejecutando el código

- **Cruce receta ↔ alergias** — `apps/api/src/modules/prescriptions/allergy-cross-check.util.ts`
  (nuevo). Cruza por principio activo, nombre comercial y grupo terapéutico vía
  prefijo ATC. El caso obligatorio del prompt 34 (alergia a penicilinas +
  amoxicilina) dispara; la alergia capturada como «no» ya no dispara con
  Naproxeno y se reporta como **no verificable**. 20 pruebas en verde.
- **Normalizador de catálogos** — `apps/api/src/modules/catalog/term-normalizer.util.ts`.
  `ñ` protegida antes de quitar diacríticos; número gramatical sólo en `-as`/`-os`.
  `diabetes`, `análisis`, `crisis`, `dosis`, `lupus`, `atlas` quedan intactos.
  20 pruebas en verde, en `term-normalizer.spec.ts` (separado del spec de integración).
- **`REVOKE DELETE`** — `prisma/migrations/20260827030000_r1_revoke_delete_on_clinical_tables/`.
  Aplicado contra un Postgres 16 real: los cinco `DELETE` dan `permission denied`
  y `UPDATE` sigue vivo. `note_templates` queda fuera a propósito.

## Lo que falta correr

Los tres IDOR están escritos con sus pruebas de regresión, pero **la suite de
integración nunca se ejecutó** porque el contenedor no podía descargar los
motores de Prisma (`binaries.prisma.sh` bloqueado).

| Arreglo | Archivo | Prueba |
|---|---|---|
| `POST /appointments` ya no se auto-emite el vínculo | `scheduling/services/appointment-state-machine.service.ts` | `m5a.integration.spec.ts` |
| `GET /patients/:id` filtra por vínculo y audita | `scheduling/patients.controller.ts`, `services/patient.service.ts` | `m5a.integration.spec.ts` |
| `reviewResult` compara `result.patientId` | `labs/services/lab-order.service.ts` | `lab-results.integration.spec.ts` |
| `REVOKE DELETE` fijado por prueba | — | `records/append-only.integration.spec.ts` |

El typecheck se revisó: **ningún error es propio**; los 115 que salían venían
todos del cliente de Prisma sin generar.

## Siguiente paso, en orden

```bash
cd ~/Medicfy\ 3/medicfy-backend
pnpm install
npx prisma generate
npx prisma migrate deploy      # aplica 20260827030000_r1_revoke_delete...
pnpm test
```

Si algo sale rojo, arreglar y commitear encima de `abf9ec0`. Si todo pasa, la
remediación previa está cerrada y sigue la **Fase 0 (prompts 7 a 11)**.

## Decisiones de Jorge ya tomadas en esta sesión

1. **FHIR (R7)** — declarar la equivalencia de cada campo conforme se avanza por
   las fases; la exportación validada del prompt 31 se difiere. No exige migración.
2. **Normalizador** — resuelve formato y número; los sinónimos sin raíz común
   («Negados» = «SANO») van al campo `synonyms` con curaduría manual. El criterio
   de «cero duplicados» del prompt 11 se apoya en las dos cosas.
3. **Bloqueo por alergia** — se corrigió el cruce ya, pero el bloqueo sigue siendo
   **confirmación**, no bloqueo duro, hasta que Jorge lo pruebe con los médicos del
   piloto. El prompt 34 pide bloqueo duro con justificación firmada: falta esa parte.

## Lo que sigue pendiente de Jorge

De las siete decisiones 🔒 del documento de 58 prompts, siguen abiertas:
su material clínico real (prompt 24), terminología de antecedentes (9), base de
medicamentos (33), alcance de la firma (43), contenido mínimo NOM-004 (46,
necesita médico y abogado), dónde corre el modelo de IA (49, necesita abogado) y
la lista de banderas rojas (52, necesita médico).

Y **ResearcherTin** (`~/Downloads/ResearcherTin`): respaldado en git con el commit
`91095cd`, pero Jorge todavía no ha dicho qué sigue ahí.

## Nota operativa

Git deja archivos de bloqueo que no se pueden borrar cuando el permiso de borrado
del puente de dispositivos se cae. Se resuelve renombrándolos a `.git/_basura/`
antes de cada comando de git. Las carpetas `_to_delete/` y `.git/_basura/` se
pueden borrar a mano sin consecuencias.
