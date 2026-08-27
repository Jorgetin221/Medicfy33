# P6 · Plan de remediación ordenado

Síntesis de los hallazgos de P2 a P5. **Todo lo que aparece aquí como CONFIRMADO fue verificado leyendo el archivo y la línea citados, o ejecutando el código.** Lo que viene de un solo agente sin verificación independiente está marcado *(sin verificar)*.

Orden: por **riesgo real**, no por facilidad.

---

## Tabla de remediación

| # | Hallazgo | Gravedad | Esfuerzo | ¿Bloquea fase? | ¿Migración? |
|---|---|---|---|---|---|
| 1 | `POST /appointments` se auto-emite el vínculo médico–paciente | **Crítica** | Medio | Todas (R4) | No |
| 2 | `GET /patients/:id` sin autorización ni bitácora | **Crítica** | Bajo | Fase 1 | No |
| 3 | Cruce de alergia por subcadena: penicilina→amoxicilina NO bloquea | **Crítica clínica** | Medio | Fase 4 | No |
| 4 | `reviewResult` escribe en el expediente de otro paciente | Alta | Bajo | Fase 5 | No |
| 5 | El bloqueo por alergia es blando (booleano, sin justificación) | Alta | Bajo | Fase 4 | No |
| 6 | `GRANT ... DELETE` sobre 6 tablas clínicas | Alta (R1) | Bajo | Fase 6 | Sí (SQL) |
| 7 | Bitácora ausente en 13 de 40 endpoints con datos de paciente | Alta (R6) | Medio | Fase 6 | No |
| 8 | Signos vitales en un `Json` sin esquema | Alta (R3) | Alto | Fase 3 | **Sí** |
| 9 | Alergias en texto libre (`substance`, `severity`, `reaction`) | Alta (R3) | Alto | Fase 4 | **Sí** |
| 10 | `packages/contracts` duplicado y ya divergido | Alta | Medio | Todas | No |
| 11 | Medicación del paciente sin FK a catálogo | Media | Medio | Fase 4 | **Sí** |
| 12 | Normalizador: detecta 1 de 6 pares exigidos por el prompt 8 | Media | Bajo | Fase 0 | No |
| 13 | Normalizador colapsa `ñ`→`n`: «año»=«ano», «muñeca»=«muneca» | Media | Trivial | Fase 0 | No |
| 14 | `NoteTemplate` guarda texto clínico del paciente como plantilla | Media | Bajo | Fase 2 | No |
| 15 | Módulo `catalog` sin controlador, sin rol curador, 0 consumidores | Media | Alto | Fase 0 | No |
| 16 | Diagnóstico sin FK a `icd10_codes` y nullable a propósito | Media | Medio | Fase 3 | Parcial |
| 17 | No existe catálogo de estudios; `studyName` libre, LOINC nunca se captura | Media | Alto | Fase 4/5 | **Sí** |
| 18 | Embarazo no existe en ninguna parte del repositorio | Media | Medio | Fase 1 (Zona 1) | No |
| 19 | No hay lista de diagnósticos vigentes (problemas activos) | Media | Medio | Fase 1 (Zona 1) | No |
| 20 | Frontend con cero pruebas; sin `vitest.config` ni `playwright.config` | Media | Medio | Fase 1 (prueba de tableta) | No |
| 21 | 0 de 118 campos clínicos declaran equivalencia FHIR | Media (R7) | Alto | Fase 3 | No |
| 22 | Duplicidad terapéutica por igualdad exacta de cadena | Baja | Bajo | Fase 4 | No |
| 23 | PWA sin manifest ni service worker | Baja | Bajo | — | No |
| 24 | `ClinicalAttachment`: tabla completa que ningún archivo referencia | Baja | Bajo | Fase 5 | No |

---

## Qué se arregla ANTES de seguir construyendo

Siete cosas. El criterio es simple: **cada fase nueva que se construya encima hereda el agujero, y arreglarlo después cuesta más.**

**1 · Los tres IDOR (#1, #2, #4).** El proyecto ya tiene un guard de relación médico–paciente bien construido —`common/guards/care-relationship.guard.ts`: resuelve el paciente por varios ids, falla cerrado, caduca a 18 meses, audita el rechazo—. El problema no es que falte, es que tres endpoints quedaron fuera de él y uno de ellos lo anula por completo. Mientras `POST /appointments` pueda emitirse su propio vínculo con cualquier `patientId`, **el guard es decorativo en todo el sistema**: no hay puerta que cerrar en las fases siguientes si esta queda abierta.

**2 · El cruce de alergia (#3, #5).** Es la única falla del inventario que puede dañar a un paciente. Y es exactamente el caso de prueba obligatorio del prompt 34, así que de todas formas hay que arreglarlo antes de la Fase 4 — pero conviene hacerlo ya, porque hoy el sistema da una falsa sensación de seguridad a quien lo esté probando.

**3 · `REVOKE DELETE` sobre las seis tablas clínicas (#6).** Una migración de una página. R1 dice "nada se borra" y hoy la base de datos permite borrar diagnósticos, alergias, medicamentos, estudios de una orden y antecedentes. Es barato ahora y caro después, cuando haya datos.

**4 · El bug de la `ñ` (#13).** Diez minutos. En un catálogo clínico en español, «año» y «ano» colapsando al mismo término normalizado es un falso positivo que el índice único convierte en un rechazo que nadie puede resolver.

**5 · Consolidar `packages/contracts` (#10).** Está físicamente duplicado entre `medicfy-backend` y `medicfy-frontend`, y ya divergió: `catalog.schema.ts` sólo existe en el backend. Cada fase nueva empeora la divergencia y multiplica el trabajo de mantenerlos a mano.

---

## Qué se repara dentro de su fase

- **Fase 0 (catálogos):** #12, #14, #15. El normalizador y el rol curador son literalmente el contenido de los prompts 8 y 10.
- **Fase 1 (escritorio):** #18, #19, #20. Embarazo y diagnósticos vigentes son contenido de la Zona 1; la infraestructura de pruebas de frontend es lo que hace medible el criterio de tableta.
- **Fase 2 (historia):** #14 si no se hizo antes.
- **Fase 3 (la nota como datos):** #8, #16, #21. La migración de los signos vitales es el corazón del prompt 26.
- **Fase 4 (el plan):** #9, #11, #17, #22.
- **Fase 5 (panel):** #24.
- **Fase 6 (firma):** #7, y la verificación de que #6 quedó cerrado.

---

## ¿Arreglar sobre lo existente o rehacer?

**Arreglar sobre lo existente. Ningún módulo justifica rehacerse.**

La arquitectura del backend es sólida y en varios puntos es mejor de lo que suele verse: identificadores UUID en los 33 modelos sin un solo `autoincrement()`, tablas clínicas inmutables por `GRANT` a nivel de Postgres —no por disciplina de la aplicación—, una restricción `EXCLUDE` que resuelve la concurrencia de agenda en la base de datos y no en un chequeo previo, 185 casos de integración que golpean Postgres de verdad y una prueba de carga con k6. Los cálculos derivados de IMC y escalas ya se hacen en servidor con fórmula y versión almacenadas, y el esquema Zod `.strict()` impide que el cliente mande su propio valor. Eso no se tira.

Las fallas son **localizadas, no estructurales**: tres endpoints que no pasan por un guard que ya existe y funciona; cuatro líneas de comparación de cadenas en el cruce de alergia; una migración acotada para sacar los signos vitales del blob JSON. Rehacer costaría meses y perdería las pruebas que hoy son la mejor garantía del proyecto.

Hay una excepción parcial, y no es un módulo: **la duplicación de `packages/contracts`**. No es rehacer, es consolidar, y debe pasar antes de que se construyan más fases encima.

Lo que sí está más atrás de lo que parece es el **frontend**. El backend expone casi todo lo que la Zona 3 necesita (`GET /records/patients/:id/timeline` ya devuelve buena parte), pero la pantalla donde el médico pasa el 80 % del tiempo no tiene ni una prueba y varias piezas del Escritorio no existen todavía. El trabajo restante del Escritorio de Consulta es sobre todo interfaz, no backend.

---

## Tres contradicciones que necesitan que tú decidas

No son hallazgos técnicos: son choques entre documentos, y ninguno se resuelve escribiendo código.

**A · FHIR.** R7 exige que *cada campo clínico nazca con su equivalencia FHIR declarada*. Hoy son 0 de 118, y no por descuido: `docs/ESPECIFICACION_TECNICA_MEDICFY_MVP.md:186` difiere FHIR explícitamente a la v3.0. La regla permanente y la especificación vigente dicen cosas distintas.

**B · El normalizador.** El prompt 8 exige que «Dislipidemias»/«Dislipidemia» y «Ninguno»/«Ninguna»/«Negados»/«SANO» se detecten como duplicados. El comentario del código dice que eso quedó fuera de alcance *confirmado contigo*, porque no es un problema de formato. Ejecuté el normalizador: detecta 1 de 6 pares. Alguno de los dos documentos tiene que ceder.

**C · El bloqueo por alergia.** El prompt 34 pide bloqueo duro que sólo se libera capturando una justificación clínica que queda firmada en el expediente. Hoy es un booleano `allergyOverrideConfirmed` en el cuerpo de la petición, sin justificación y sin registro. El documento de prompts ya anticipa que esto irrita a algunos médicos y sugiere confirmarlo con los del piloto.

---

## Numeración de reglas: un riesgo silencioso

`medicfy-backend/CLAUDE.md:23-35` define su **propio** conjunto R1–R7, distinto del R1–R8 del contexto fijo. En el código, «R3» significa *bitácora* (la R6 del contexto) y «R5» significa otra cosa. Cualquier verificación futura que diga "cumple R3" está apuntando a la regla equivocada. Conviene renombrar uno de los dos conjuntos antes de que se escriban más comentarios y más pruebas encima.
