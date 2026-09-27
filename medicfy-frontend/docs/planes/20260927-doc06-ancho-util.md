# Plan: `DOC-06` — recuperar el ancho útil de la nota clínica

**Fecha:** 2026-09-27
**Reglas de especificación involucradas:** CLAUDE.md §6 (`DOC-06`), §5 (reglas de frontend).
Continúa la fase F3 listada en `20260926-pase-diseno-ux-fase1.md`.
**Estimación de pasos:** 2 commits

## Análisis de impacto

- Módulos backend afectados: ninguno. Cero cambios de contrato, Prisma o endpoints.
- Componentes frontend afectados: `consulta-screen.tsx` (contenedor `<main>` de las tres
  zonas) y `consulta-zona3.tsx` (el `<aside>`). `paciente-consulta-screen.tsx` comparte el
  mismo patrón y se revisa en el mismo paso.
- Contratos modificados: no.
- Migraciones necesarias: no.
- Riesgo de regresión: **medio**. `DOC-06` es "la pantalla que decide todo" (§6) y tiene tres
  specs E2E que miden geometría a 1280×800. El riesgo real no es romper una función —no se
  toca ningún manejador— sino mover una referencia espacial que el médico ya memorizó. Se
  mitiga no moviendo nada de sitio: Zona 1 y Zona 3 conservan su ancho y su orden; lo único
  que cambia es cuánto espacio recibe la columna central.

## Hallazgo que origina el plan

Medido en el navegador contra el backend real, con una paciente sembrada:

| Viewport | `<main>` | Zona 1 | **Nota clínica** | Zona 3 | Alto de página |
|---|---|---|---|---|---|
| 1280×800 | 1056 | 288 | **338** | 384 | 4 479 px |
| 1440×900 | 1152 | 288 | **384** | 384 | 4 110 px |
| 1920×1080 | 1152 | 288 | **384** | 384 | 4 110 px |

Dos conclusiones:

1. **La nota nunca es más ancha que el panel de referencia que tiene al lado.** A 1280 es
   incluso 46 px más angosta. El médico escribe el documento médico-legal en la columna más
   estrecha de la pantalla, junto a un panel de consulta que ocupa más.
2. **Un monitor más grande no aporta nada.** De 1440 a 1920 la nota sigue en 384 px. El
   `<main>` está topado con `max-w-6xl` (1152 px), un ancho de columna de lectura pensado
   para artículos, aplicado a una estación de trabajo clínica de tres zonas.

`max-w-6xl` es la causa única de ambos. Con Zona 1 (`lg:w-72` = 288) y Zona 3 (`w-96` = 384)
fijas, más `p-6` y dos `gap-6`, el reparto es aritmética: la central se queda con lo que
sobra de 1152, y lo que sobra son 384 px.

## Decisión de diseño

**El ancho sobrante pertenece a la nota.** Zona 1 y Zona 3 muestran contenido de tamaño
conocido (identificación, alergias, diagnósticos, pestañas del expediente): crecen mal y no
ganan nada con más espacio. La nota es el único contenido productivo de la pantalla y el
único cuya calidad depende del espacio. Así que las laterales quedan fijas y la central
absorbe todo el crecimiento.

Se quita el tope y se sustituye por uno muy holgado (`max-w-[2200px]`), no por "sin límite":
en un monitor ultrapanorámico una nota de 1600 px produce renglones ilegibles. 2200 px de
`<main>` dejan la nota en ~1400 px, que sigue siendo cómodo.

**Zona 3 pasa a `sticky` con su propio scroll**, como ya lo está Zona 1
(`lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:overflow-y-auto`). Hoy no lo está: al bajar
por una nota de 4 000 px el expediente se va con el scroll, justo cuando el médico lo
necesita para contrastar lo que escribe. La asimetría entre las dos laterales no parece
deliberada — Zona 1 tiene el tratamiento correcto y Zona 3 se quedó sin él.

### Corrección al plan (durante la implementación)

Quitar el tope arregló 1440 y 1920, pero **a 1280 no cambió nada**: ahí el límite no era
`max-w-6xl` sino el rail de navegación, que se lleva 224 px del viewport. El `<main>` sigue
midiendo 1056 px y la nota se quedaba en 338, todavía más angosta que Zona 3 (384). CA-2
fallaba en el viewport que §6 declara de referencia.

Se añade un tramo de ancho a Zona 3: **320 px entre 1024 y 1535, 384 px a partir de 1536**.
Donde el espacio es escaso, el panel de referencia cede; donde sobra, lo recupera.

Se descartó la alternativa de plegar el rail automáticamente en `DOC-06`. Es mejor idea de
producto —durante una consulta el médico no navega, escribe— pero `collapsed` es una
preferencia del usuario persistida en `localStorage`, y plegarla desde la pantalla exige
coordinar estado entre `AppNav` y la página sin pisar lo que el médico eligió. Es un cambio
mayor que este plan, y queda anotado para decidirse aparte.

También se descartó angostar Zona 1: su contenido es justo lo que §6 exige ver sin scroll a
1280×800, y hacerla más estrecha lo vuelve más alto.

**Lo que este pase NO toca:** la altura de 4 000 px. Reestructurar el formulario en secciones
plegables afecta el requisito de §6 de completar una consulta de seguimiento sin tocar el
ratón —un acordeón añade pasos de teclado— y merece decidirse con criterio clínico, no de
paso. Se mide el efecto que el ancho tiene sobre la altura y se reporta; nada más.

## Pasos de implementación

1. [ ] `<main>` de `DOC-06` deja de topar en `max-w-6xl`; el ancho sobrante va a la columna
       central (commit: `fix(consulta): dar el ancho sobrante a la nota clinica`)
2. [ ] Zona 3: tramo de ancho 320/384 y `sticky` con scroll propio, en paridad con Zona 1
       (commit: `fix(consulta): ajustar y fijar el panel del expediente`)

## Criterios de aceptación

- [ ] CA-1: a 1920×1080 la nota mide **más de 800 px** (hoy 384).
- [ ] CA-2: en los tres viewports la nota es **más ancha que Zona 3**, nunca al revés.
- [ ] CA-3: a 1280×800 se conserva §6 — alergias, antecedentes y últimas consultas visibles
      sin scroll ni clic. Verificable con el spec `doc06-tableta.spec.ts`.
- [ ] CA-4: Zona 1 conserva 288 px y el orden de las tres zonas no cambia. Zona 3 mide 320
      entre 1024 y 1535, y 384 a partir de 1536 (ver corrección al plan).
- [ ] CA-5: al hacer scroll 2 000 px en la nota, el panel de Zona 3 sigue visible.
- [ ] CA-6: sin desbordamiento horizontal en 1280, 1440 y 1920.
- [ ] CA-7: `tsc --noEmit` y `eslint` limpios.

## Plan de pruebas

- Pruebas de integración: no aplica — cero cambios de backend.
- Pruebas E2E: `doc06-tableta.spec.ts` mide geometría a 1280×800 y es la red de regresión
  natural de este cambio. **Nota:** la suite no puede sembrar hoy (`e2e/global-setup.ts`
  quedó desfasado: firmar un encuentro exige `password` y `totpCode` y el setup no los
  manda). Es deuda anterior a este plan; mientras siga, la verificación de §6 se hace por
  medición directa en el navegador, documentada abajo, y no por el spec.
- Verificación visual: medición programática de anchos y altura en 1280/1440/1920 antes y
  después, más captura de cada uno.
