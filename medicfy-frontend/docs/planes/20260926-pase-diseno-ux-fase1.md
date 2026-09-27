# Plan: Pase de diseño UX — Fase 1 (gobernanza del color, jerarquía de acciones, navegación móvil)

**Fecha:** 2026-09-26
**Reglas de especificación involucradas:** CLAUDE.md §5 (Reglas de Frontend) — no hay regla
numerada de la especificación para este pase: es deuda de diseño acumulada, auditada contra
el estándar que el propio proyecto ya fijó.
**Estimación de pasos:** 4 commits

## Análisis de impacto

- Módulos backend afectados: ninguno. Cero cambios de contrato, de Prisma y de endpoints.
- Componentes frontend afectados: `ui/button.tsx` (nueva variante), `app-nav.tsx`
  (responsive), `(app)/layout.tsx` (encabezado móvil), y los 12 puntos de llamada que
  hoy usan `variant="danger"`.
- Contratos modificados: no.
- Migraciones necesarias: no.
- Riesgo de regresión: **bajo-medio**. Es cambio puramente visual y de layout — ningún
  manejador `onClick`, ninguna ruta y ningún permiso cambian. El riesgo real no es funcional
  sino de *reconocimiento*: un médico acostumbrado a buscar el botón rojo para cancelar una
  cita tendrá que buscar el nuevo tratamiento. Se mitiga manteniendo la etiqueta de texto,
  la posición y el orden de los botones exactamente donde estaban: cambia el peso visual,
  no el mapa mental de la pantalla.

---

## Hallazgo que origina el plan

La auditoría se hizo sobre la aplicación corriendo (mock server + `next dev`), con capturas
de `/agenda`, `/pacientes`, `/login`, `/consulta/apt-1` y `/pacientes/pat-1` en 1440×900 y
390×844. Tres hallazgos justifican trabajo inmediato; el resto queda listado abajo como
fases posteriores.

### H1 — El rojo perdió su significado (§5)

§5 dice: *«`--critical-600` (rojo) está reservado a alertas de seguridad del paciente. Si el
rojo aparece por un campo vacío, deja de significar peligro.»*

La regla se cumple hoy **en el nombre del token y se viola en la pantalla**. `globals.css` lo
admite en su propio comentario: `--danger-600` y `--critical-600` son el mismo `#b3261e`, y
*«la separación es de gobernanza de uso, no de matiz visual»*. Pero la gobernanza vive en el
código y el médico solo ve color. Resultado medible en `/consulta/apt-1`: la alerta de alergia
a Penicilina y el botón «Quitar» de un diagnóstico son **el mismo rojo, en la misma pantalla,
a 1100 px de distancia vertical**. En `/agenda`, cada una de las tres tarjetas de cita lleva un
«Cancelar» rojo sólido — el elemento de mayor peso visual de la pantalla es la acción que
destruye trabajo, repetida tantas veces como citas tenga el día.

Un rojo que aparece doce veces por jornada en acciones rutinarias no alerta de nada.

### H2 — Jerarquía de acciones invertida

En `agenda/page.tsx:187-199`, `Iniciar` (la acción primaria: abrir la consulta, el corazón
del producto) es `variant="secondary"` — blanco con borde. `Cancelar` es `variant="danger"` —
rojo sólido. El botón que el médico debe pulsar decenas de veces al día pesa menos que el que
casi nunca debe pulsar. Lo mismo en el expediente y en los selectores de medicamento,
diagnóstico y estudio: `Quitar` es siempre el único elemento sólido del bloque.

### H3 — La aplicación es inusable en teléfono

`app-nav.tsx:120` fija `w-56` sin un solo breakpoint. A 390 px de ancho, el rail oscuro se
queda en su lugar y deja 166 px de contenido: los nombres de los pacientes se parten letra a
letra («Ana / Sofía / García / López»), «No se presentó» se parte en dos renglones dentro del
botón, y «+ Nueva cita» queda cortado fuera del viewport. No es una degradación estética: la
agenda del día no se puede leer ni operar desde un teléfono.

---

## Decisión de diseño: cómo se recupera el rojo

No basta con quitar rojos: hay que dejar una gramática que impida que vuelvan.

**Regla que se adopta — el rojo sólido nunca está en reposo.** Una superficie roja llena solo
puede aparecer *después* de que el usuario pidió la acción destructiva, es decir, dentro del
paso de confirmación. En una lista, una tarjeta o un formulario en reposo, lo destructivo se
marca con contorno y texto, nunca con relleno.

Esto da tres niveles, no dos:

| Variante | Tratamiento | Cuándo |
|---|---|---|
| `primary` | relleno `brand-700` | la acción que la pantalla existe para provocar. Una por vista. |
| `secondary` | blanco + borde `gray-300` | acciones de apoyo. |
| `destructive` **(nueva)** | blanco + borde y texto `danger-600` | destructivo en reposo: Cancelar cita, Quitar diagnóstico, Eliminar borrador. |
| `danger` (existente) | relleno `danger-600` | **solo** dentro de un diálogo/paso de confirmación ya abierto por el usuario, y en revocaciones administrativas irreversibles. |

`danger-600` sobre blanco da **6.5:1** de contraste — cumple WCAG 2.2 AA (§5) con margen. No
se requiere AAA: §5 lo exige para datos clínicos, y la etiqueta de un botón no lo es.

El color sigue sin ser el único portador de significado (§5): la etiqueta de texto («Cancelar»,
«Quitar») ya nombra la consecuencia, y no cambia en este pase.

**Lo que este pase NO toca:** `AllergySummary`, `Timeline critical` y cualquier otro uso de
`critical-*`. Ese rojo es el que se está protegiendo — sale ganando por contraste con el
entorno, sin que su propio código cambie una línea.

---

## Pasos de implementación

1. [ ] Agregar la variante `destructive` a `ui/button.tsx` y documentar la gramática de las
       cuatro variantes en el propio archivo (commit: `feat(ui): agregar variante destructive al boton`)
2. [ ] Migrar los 12 usos de `variant="danger"` a `destructive`, conservando `danger` solo en
       los pasos de confirmación y en las revocaciones de admin
       (commit: `refactor(ui): reservar el rojo solido a confirmaciones y alertas`)
3. [ ] Corregir la jerarquía de acciones de `/agenda`: `Iniciar` / `Continuar consulta` pasan a
       `primary` (commit: `fix(agenda): elevar Iniciar consulta a accion primaria`)
4. [ ] Navegación responsive: rail oculto bajo `md`, encabezado con menú y panel lateral
       (commit: `fix(ui): navegacion utilizable en telefono`)

## Criterios de aceptación

- [ ] CA-1: ningún botón de relleno rojo aparece en una pantalla en reposo. Verificable:
      `grep -rn 'variant="danger"' src` devuelve solo llamadas dentro de un bloque de
      confirmación o de administración, y cada una lleva comentario que lo justifica.
- [ ] CA-2: en `/agenda`, el elemento de mayor peso visual de cada tarjeta de cita es
      `Iniciar`, no `Cancelar`. Verificable por captura.
- [ ] CA-3: a 390 px de ancho, `/agenda` no produce desbordamiento horizontal y ningún
      nombre de paciente se parte en más de dos renglones. Verificable por captura.
- [ ] CA-4: el menú móvil se abre y cierra con teclado (`Escape`), expone `aria-expanded`
      y conserva área táctil de 44×44 px (§5).
- [ ] CA-5: `AllergySummary` y los usos de `critical-*` quedan byte a byte iguales.
- [ ] CA-6: `pnpm lint` y `pnpm typecheck` en verde.

## Plan de pruebas

- Pruebas de integración: no aplica — cero cambios de backend, contrato o endpoint.
- Pruebas E2E: no se agregan en este pase. Las E2E existentes seleccionan por rol y texto
  accesible (`getByRole('button', { name: 'Cancelar' })`), y ni el rol ni el nombre cambian:
  sirven como red de regresión tal cual están. Se corren para confirmarlo.
- Pruebas negativas / verificación visual: capturas antes-después de `/agenda`,
  `/consulta/apt-1` y `/pacientes` en 1440×900 y 390×844, contra la app corriendo.
- Revisión manual: recorrer `/agenda` con teclado (Tab/Escape) para el panel móvil.

---

## Fases posteriores (auditadas, fuera de este alcance)

Se dejan escritas para no perderlas; ninguna se implementa aquí.

- **F2 · Densidad de listas.** `/pacientes` gasta ~100 px de alto por paciente para tres
  líneas de texto y deja el 45 % derecho del viewport vacío; `/agenda` gasta ~180 px por cita.
  Ambas se romperán en cuanto el médico tenga 200 pacientes o 14 citas. Requiere decidir qué
  dato acompaña a cada fila (¿última consulta? ¿próxima cita?) — es decisión de producto.
- **F3 · `DOC-06` aprovecha mal el ancho.** La nota clínica —lo que el médico escribe— vive
  en una columna de ~300 px, mientras la columna derecha del expediente ocupa ~350 px
  mostrando «Abre una pestaña para consultar el expediente». El formulario mide 2 531 px de
  alto en una sola columna: doce campos apilados sin estructura visible. §6 la llama «la
  pantalla que decide todo»; merece su propio plan, no un arreglo de paso.
- **F4 · Campos de signos vitales desbordados.** En `vitals-fields.tsx` las etiquetas
  («Temperatura», «Frecuencia…») se cortan dentro de su caja a 1440 px.
- **F5 · El panel «Estados de cita»** es una leyenda estática ocupando permanentemente la
  columna derecha de `/agenda` —más espacio que «Siguiente», que sí es accionable—. Debería
  ser ayuda contextual.
- **F6 · `/login` sin «¿Olvidaste tu contraseña?»**. Hallazgo de producto, no de estética.
- **F7 · El cronómetro de consulta** («Tiempo transcurrido: 4:46 · objetivo 3–4 min —
  rebasado») pone presión de tiempo visible sobre un acto clínico. Es una decisión de
  producto con implicaciones éticas, no un detalle de UI.
- **F8 · Datos del mock en inglés.** La severidad de alergia llega como `CRITICAL` y se
  pinta tal cual en la alerta. `AllergySummary` hace lo correcto (severity es texto libre del
  médico); el dato ficticio de `dev-server.mjs` es el que está en inglés.
