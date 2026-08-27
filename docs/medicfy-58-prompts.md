# Medicfy · 58 prompts en orden

**Del estado actual del MVP a la app terminada, siguiendo el plan del Escritorio de Consulta.**

Cada prompt es una unidad de trabajo. Se ejecutan **en orden**: cada uno asume que el anterior quedó terminado y verificado. Los prompts 1 a 6 auditan lo que ya existe; del 7 al 56 construyen las fases; el 57 y el 58 cierran.

*Versión 2 — se agregó el Bloque 9, la Fase 8 del módulo de IA (prompts 49 a 56). El cierre pasó a 57 y 58.*

---

## Cómo usarlo

1. **Pega el _Contexto fijo_ al inicio de cada sesión nueva** con la IA. Sin él, los prompts pierden la mitad de su sentido.
2. **Un prompt por vez.** No pegues dos juntos: la IA los mezcla y ninguno queda bien.
3. **No avances hasta que pase la verificación.** Cada prompt trae al final un bloque «✅ Antes de avanzar». Si no se cumple, el siguiente prompt es *«No se cumplió X. Corrígelo.»*, no el número siguiente de la lista.
4. **Cuando la IA proponga algo que contradiga las reglas permanentes, gana la regla.** Las ocho reglas no se negocian por conveniencia de implementación.
5. Los prompts marcados **🔒 decisión humana** requieren que tú decidas algo antes de ejecutarlos. Están señalados.

---

## Contexto fijo

> Copia este bloque completo al inicio de cada sesión.

```
Estoy construyendo Medicfy, un expediente clínico electrónico mexicano (PWA) para
médicos de consulta privada. Especialidades del piloto: medicina general,
ginecología, pediatría y medicina interna.

CONCEPTO CENTRAL — el Escritorio de Consulta.
La consulta empieza con un clic sobre el renglón del paciente en la agenda del día,
y a partir de ahí el médico no abandona la pantalla. Cuatro regiones fijas:

  Zona 1 · Contexto persistente (arriba, siempre visible)
    Identidad, edad, sexo, ALERGIAS ACTIVAS destacadas, diagnósticos vigentes,
    embarazo si aplica, medicación crónica.
  Zona 2 · Captura (centro)
    Nota SOAP: subjetivo, objetivo con signos vitales y escalas, análisis, plan.
  Zona 3 · Consulta (derecha)
    Panel con hoja frontal, historia, notas previas, estudios y resultados.
    Panel fijo en escritorio, cajón deslizable en tableta.
  Barra de cierre (abajo)
    Borrador autoguardado y "firmar y cerrar consulta".

REGLAS PERMANENTES (invariantes; se verifican en CADA entrega, no una sola vez):
  R1  Nada se borra. No existe eliminación física de datos clínicos. Toda
      corrección genera un registro nuevo que referencia al anterior.
  R2  Los catálogos son cerrados. Ningún endpoint de captura puede insertar en
      una tabla de catálogo. El alta de términos es un flujo aparte con rol curador.
  R3  Texto libre sólo donde hay razonamiento: subjetivo y análisis. Todo lo demás
      —diagnóstico, fármaco, signo vital, estudio, antecedente— es estructurado y
      referenciado a catálogo.
  R4  Autorización por recurso. Cada lectura y escritura verifica que ESTE médico
      tiene relación con ESTE paciente. La sesión válida no basta.
  R5  Identificadores no adivinables en rutas y APIs. El folio legible existe sólo
      para hablar con personas.
  R6  Bitácora de todo. Lectura y escritura de datos clínicos quedan registradas
      con usuario, paciente, recurso y momento.
  R7  Cada campo clínico nace con su equivalencia HL7 FHIR declarada, o con la
      razón documentada de por qué no tiene equivalente.
  R8  Funciona en tableta. Toda pantalla del escritorio se usa con el dedo, en
      horizontal, junto al paciente. Objetivos táctiles de 44 px mínimo.

FORMA DE TRABAJO:
- Trabajamos por fases. No avanzamos a la siguiente hasta que existan pruebas
  automatizadas que ejerciten todos los criterios de aceptación de la actual.
- Responde en español.
- Si algo del código actual contradice estas reglas, dímelo ANTES de escribir código.
- Si un requisito es ambiguo, pregunta en lugar de suponer.
- No inventes requisitos normativos ni cifras: si no lo sabes, dilo.
```

---

# Bloque 0 · Diagnóstico del código actual

*Seis prompts para saber exactamente dónde estás parado. Ninguno escribe código.*

### 1 · Inventario del repositorio

```
Recorre el repositorio completo y devuélveme un inventario, sin escribir ni
modificar código:

1. Módulos existentes y su estado aparente (terminado, a medias, esqueleto).
2. Rutas del frontend y qué pantalla renderiza cada una.
3. Entidades del modelo de datos, con sus campos y tipos.
4. Endpoints del backend, agrupados por recurso, con método y qué hacen.
5. Pruebas existentes: qué cubren y qué no.
6. Dependencias de terceros relevantes y para qué se usan.

Formato: tablas. Marca con "?" lo que no puedas determinar leyendo el código.
Al final, en tres frases, dime qué porcentaje del Escritorio de Consulta descrito
en el contexto crees que ya existe.
```

> ✅ **Antes de avanzar:** tienes el inventario y entiendes qué módulos existen. Guárdalo: los prompts siguientes lo dan por conocido.

### 2 · Auditoría contra las ocho reglas permanentes

```
Audita el código actual contra las reglas permanentes R1 a R8 del contexto.

Para cada regla:
- Estado: CUMPLE / CUMPLE PARCIALMENTE / NO CUMPLE / NO APLICA TODAVÍA.
- Evidencia concreta: archivo y línea donde se cumple o se rompe.
- Qué haría falta para cumplirla.

No propongas rediseños generales. Sólo hallazgos verificables contra el código.
Ordena el resultado por gravedad, no por número de regla.
```

> ✅ **Antes de avanzar:** tienes una lista de incumplimientos con archivo y línea.

### 3 · Auditoría del modelo de datos clínicos

```
Revisa el modelo de datos y devuélveme una tabla con TODOS los campos que hoy
guardan información clínica:

| Campo | Entidad | Tipo actual | ¿Debería ser estructurado? | Catálogo o terminología que le corresponde | Equivalencia FHIR |

Aplica la regla R3: texto libre sólo en subjetivo y análisis. Marca en rojo
cualquier campo de diagnóstico, medicamento, signo vital, estudio o antecedente
que hoy sea texto libre.

Al final, dime cuáles de esos cambios exigen migración de datos existentes y
cuáles no.
```

> ✅ **Antes de avanzar:** sabes exactamente qué campos hay que estructurar y cuáles exigen migración.

### 4 · Auditoría de catálogos

```
Busca en el código todos los puntos donde un usuario de captura puede crear un
término nuevo en un catálogo clínico: endpoints, formularios con campos de texto
libre que después se guardan como opciones, "otro / especifique", altas
implícitas.

Para cada uno dime: dónde está, qué catálogo afecta, y qué pasaría si mil médicos
lo usaran durante dos años.

Contexto de por qué importa: en el sistema que estamos tomando como referencia,
esta puerta abierta produjo 140 antecedentes con duplicados por mayúsculas y
ortografía, y una entrada de catálogo que contenía la descripción clínica de un
paciente concreto, visible para toda la institución.
```

> ✅ **Antes de avanzar:** tienes la lista de puertas abiertas que hay que cerrar en la Fase 0.

### 5 · Auditoría de autorización y exposición

```
Enumera cada endpoint del backend y para cada uno responde:

1. ¿Verifica que el usuario autenticado tiene relación con el paciente del
   recurso, o sólo que la sesión es válida? (regla R4)
2. ¿El identificador del paciente o del recurso viaja en la ruta o en la query
   string? ¿Es consecutivo o adivinable? (regla R5)
3. ¿Registra el acceso en bitácora? (regla R6)
4. ¿Devuelve más campos de los que la pantalla necesita?

Marca los casos donde cambiar un número en la URL daría acceso al expediente de
otro paciente. Ésos van primero.
```

> ✅ **Antes de avanzar:** sabes si hoy es posible enumerar expedientes cambiando un número.

### 6 · Plan de remediación ordenado

```
Con los hallazgos de los prompts 2 a 5, arma un plan de remediación:

| # | Hallazgo | Gravedad | Esfuerzo | ¿Bloquea alguna fase? | ¿Exige migración? |

Ordénalo por riesgo real, no por facilidad. Separa lo que hay que arreglar ANTES
de seguir construyendo de lo que puede repararse dentro de su fase.

Al final dime, en un párrafo, si conviene arreglar sobre lo existente o si algún
módulo está tan comprometido que sale más barato rehacerlo.
```

> ✅ **Antes de avanzar:** tienes el plan y decidiste qué se arregla ya y qué se arregla dentro de su fase.

---

# Bloque 1 · Fase 0 — Cimiento de catálogos

**Hito de la fase:** existe un conjunto de catálogos clínicos cerrados, versionados y sin duplicados, y ninguna pantalla de captura puede escribir en ellos.

### 7 · Tabla base de catálogo

```
Diseña e implementa la tabla base de catálogo clínico con estos campos:
clave, término preferido, sinónimos, código externo, sistema de codificación,
versión, estado (activo / obsoleto / fusionado), fecha de alta, referencia de
fusión, y a quién pertenece la curaduría.

Requisitos:
- Un término NUNCA se borra: se marca obsoleto o se fusiona apuntando al que lo
  sustituye.
- Los registros clínicos históricos siguen apuntando al término original aunque
  éste se fusione; las consultas nuevas resuelven al término vigente.
- Todo catálogo declara su sistema de codificación externo o queda documentado
  explícitamente como propietario.

Entrégame el esquema, las migraciones y el repositorio de acceso. Explica cómo
resuelves la fusión sin romper el histórico.
```

### 8 · Normalizador y detección de duplicados

```
Implementa el normalizador de términos que usará el catálogo: minúsculas, sin
acentos, sin puntuación final, colapso de espacios múltiples.

Con él:
- Impide dar de alta un término cuya forma normalizada ya exista en el mismo
  catálogo: devuelve conflicto y señala cuál es el término existente.
- Escribe un reporte que recorra todos los catálogos y liste duplicados
  potenciales.

Prueba el normalizador contra estos casos reales del sistema de referencia, que
deben detectarse como duplicados entre sí:
"Dislipidemias" / "Dislipidemia"
"hipotiroidismo" / "HIPOTIROIDISMO" / "Tiroideas."
"Ninguno" / "Ninguna" / "Negados" / "SANO"
```

### 9 · Poblar los catálogos iniciales

```
Puebla los catálogos que Medicfy necesita, con datos curados y sin duplicados:

- Antecedentes, por grupo: heredofamiliares, personales patológicos generales,
  exantemáticas, crónico-degenerativas, adicciones, infectocontagiosas.
- Alergias: agentes comunes y grupos de fármacos.
- Sustancias psicoactivas (lista estándar tipo NIDA).
- Vías de administración.
- Tipos de estudio y estudios concretos, en dos niveles.
- Motivos de solicitud de estudio.
- Tipos de nota, con clave corta.
- Tipos de documento del expediente, incluyendo aviso de privacidad y
  consentimiento informado.
- Estados civiles, ocupaciones, entidades federativas, aseguradoras.

Para cada catálogo indica de dónde sale cada término y qué sistema de codificación
externo le corresponde. Si para alguno no existe una fuente estándar razonable,
dilo en lugar de inventarla. Marca los términos que necesitan validación de un
médico antes de darse por buenos.
```

> 🔒 **Decisión humana:** la terminología de antecedentes (SNOMED CT tiene costo de licencia en algunos usos). Decide antes de ejecutar el prompt 9 si licencias o construyes catálogo propio, y díselo a la IA.

### 10 · Rol curador y cierre de las puertas

```
Implementa el cierre de catálogos:

1. Rol "curador de catálogo" con su bandeja de solicitudes de término nuevo.
2. Flujo: el médico solicita un término desde la captura, la solicitud queda
   pendiente, el curador la aprueba, la rechaza o la fusiona con una existente.
3. Cierra TODAS las puertas que encontraste en el prompt 4: ningún endpoint de
   captura puede insertar en un catálogo, aunque el usuario sea médico.
4. En la interfaz de captura, sustituye cualquier campo de texto libre que
   alimentaba un catálogo por un buscador sobre el catálogo cerrado más un enlace
   "solicitar término nuevo".

La regla R2 debe quedar imposible de violar por diseño, no por disciplina.
```

### 11 · Pruebas de la Fase 0

```
Escribe las pruebas automatizadas que ejercitan los criterios de aceptación de la
Fase 0. Deben fallar si alguien rompe la regla en el futuro:

1. Una petición de creación de término desde cualquier endpoint de captura
   devuelve error de autorización, aunque el usuario sea médico.
2. Insertar un término cuya forma normalizada ya existe devuelve conflicto y
   señala el término existente.
3. Fusionar dos términos deja los registros clínicos previos intactos, y las
   consultas nuevas resuelven al término vigente.
4. El reporte de duplicados sobre los catálogos poblados devuelve cero.

Corre la suite completa y muéstrame el resultado.
```

> ✅ **Fase 0 terminada cuando:** las cuatro pruebas pasan y el reporte de duplicados devuelve cero.

---

# Bloque 2 · Fase 1 — El escritorio

**Hito de la fase:** el médico abre la agenda del día, hace un clic sobre un paciente, y queda dentro de una pantalla de consulta con las tres zonas, que no pierde su trabajo si se interrumpe.

### 12 · Ruta de consulta desde la agenda

```
Implementa la entrada a la consulta:

- Desde la agenda del día, un clic sobre el renglón del paciente abre la pantalla
  de consulta con el paciente ya en contexto. Sin buscador intermedio.
- Abrir la consulta mueve la cita al estado "en consulta".
- Sólo el médico asignado a la cita puede abrirla; cualquier otro recibe error de
  autorización (regla R4).
- La ruta usa un identificador no adivinable, no el consecutivo del paciente
  (regla R5).

Entrégame la ruta, el controlador, el guard de autorización y la transición de
estado de la cita. Dime cómo encaja con la máquina de estados de citas que ya
existe.
```

### 13 · Zona 1 — Barra de contexto persistente

```
Construye la Zona 1 del Escritorio de Consulta: la barra de contexto persistente.

Contenido, en este orden de prominencia:
1. ALERGIAS ACTIVAS, destacadas en rojo con el tipo de reacción. Si no hay
   alergias registradas, dilo explícitamente: "sin alergias registradas" no es lo
   mismo que un espacio vacío.
2. Nombre, edad calculada, sexo.
3. Diagnósticos vigentes con su código.
4. Embarazo, si aplica.
5. Medicación crónica vigente (conteo, expandible).

Requisitos:
- Se lee de una vista materializada. No dispara consultas al cambiar de pestaña.
- Es visible sin hacer scroll, siempre.
- Nada comercial ni administrativo ocupa este espacio: es el renglón que el médico
  lee antes de prescribir.
```

### 14 · Zona 3 — Panel lateral, esqueleto

```
Construye el esqueleto de la Zona 3: el panel de consulta.

- Pestañas: Hoja frontal, Historia, Notas, Estudios, Resultados. Vacías por ahora.
- Panel fijo a la derecha en escritorio; cajón deslizable sobre la nota por debajo
  de 1024 px de ancho (regla R8).
- Carga diferida: ninguna pestaña se renderiza ni pide datos hasta que se abre.
- Abrir, cambiar de pestaña o cerrar el panel NO interrumpe ni pierde la captura
  en curso.
- Recuerda por médico cuál pestaña quedó abierta.

Muéstrame cómo garantizas que la carga inicial de la consulta no descarga el
contenido de las pestañas no abiertas.
```

### 15 · Borrador autoguardado

```
Implementa el borrador de la nota:

- Autoguardado con rebote de 2 segundos y también al perder el foco.
- Indicador visible de "guardado" con la hora.
- El borrador pertenece a un par cita–médico. Si ya existe uno abierto, se
  recupera en lugar de crear otro.
- Recargar el navegador a media captura recupera el borrador íntegro, incluido el
  punto de scroll.
- Un borrador NO es un documento clínico: no aparece en el expediente, no es
  visible para nadie más que su autor, y no emite documentos.

Explícame qué pasa si el médico pierde conexión a media consulta y vuelve diez
minutos después.
```

### 16 · Encadenar consultas

```
Añade el botón "siguiente paciente": al cerrar o guardar la consulta actual,
encadena directamente a la siguiente cita del día del mismo médico, con el nuevo
paciente ya en contexto.

Si no hay siguiente cita, regresa a la agenda del día.

Además, verifica que la autorización por recurso (R4) se revalúa en cada salto:
que la cita anterior quede cerrada no debe dejar abierta ninguna sesión de lectura
sobre ese paciente.
```

### 17 · Pruebas de la Fase 1

```
Escribe y ejecuta las pruebas de los criterios de aceptación de la Fase 1:

1. Desde la agenda del día, dos clics bastan para estar escribiendo en la nota del
   paciente correcto.
2. Recargar el navegador a media captura recupera el borrador íntegro, incluido el
   punto de scroll.
3. Con paciente alérgico registrado, la alerta de alergia es visible sin hacer
   scroll y sin abrir nada.
4. En una tableta de 10 pulgadas en horizontal, la nota es usable y el panel
   lateral se abre y cierra con el dedo. Objetivos táctiles de 44 px mínimo.
5. Un médico distinto al asignado que intenta abrir esa consulta recibe error de
   autorización.

Para el punto 4, usa pruebas de viewport y de tamaño de objetivo táctil, no una
inspección visual.
```

> ✅ **Fase 1 terminada cuando:** las cinco pruebas pasan, incluida la de tableta.

---

# Bloque 3 · Fase 2 — Historia clínica estructurada

**Hito de la fase:** una primera consulta completa se documenta marcando casillas y comentando, no redactando párrafos, y el resultado queda como datos consultables.

### 18 · Modelo longitudinal de antecedentes

```
Diseña el modelo de antecedentes del paciente.

Requisito central: la historia clínica es longitudinal. Se ACTUALIZA, no se
reescribe. Cada cambio conserva el valor anterior con su fecha y su autor
(regla R1).

Cada antecedente registrado es: referencia al término del catálogo + estado
(presente / ausente / se desconoce) + comentario libre + fecha + autor + marca de
"heredado de plantilla, sin revisar".

Entrégame el esquema, las migraciones y cómo consultas "el estado de este
antecedente hoy" y "cómo cambió en el tiempo" sin dos modelos distintos.
Declara la equivalencia FHIR de cada campo (regla R7).
```

### 19 · Bloques de antecedentes con check y comentario

```
Construye la pantalla de antecedentes con el patrón "check + comentario":

- Cada antecedente es un renglón del catálogo con una casilla y un campo de
  comentario opcional.
- Agrupados por bloque: heredofamiliares, personales patológicos por grupo,
  no patológicos, gineco-obstétricos, alergias, medicación crónica, discapacidades.
- Indicador de avance: cuántos bloques van completos.
- Buscador sobre el catálogo cerrado, y enlace "solicitar término nuevo" que abre
  el flujo del prompt 10. NUNCA un campo de texto que cree términos.

El objetivo de diseño es que documentar una primera consulta sea marcar, no
redactar. Mídelo: dime cuántas interacciones toma completar un bloque típico.
```

### 20 · Heredofamiliares con parentesco por columna

```
Implementa el bloque de antecedentes heredofamiliares como matriz:

- Filas: padecimientos del catálogo.
- Columnas: padre, madre, abuelos paternos, abuelos maternos, hermanos, hijos.
- Cada intersección es una casilla; cada fila tiene además un comentario.

Este modelo permite después calcular riesgo familiar por padecimiento. Diseña el
esquema pensando en esa consulta futura, no sólo en la captura.

Entrégame también cómo se representa "se desconoce" distinto de "no lo tiene".
```

### 21 · Toxicomanías con cuantificación

```
Implementa el bloque de toxicomanías sobre el catálogo de sustancias:

Por cada sustancia marcada: estado (activo / suspendido / negado), cantidad,
unidad, frecuencia, edad de inicio y fecha de suspensión.

Cálculos automáticos y almacenados, con la fórmula y su versión:
- Índice tabáquico en paquetes-año: (cigarros al día × años) / 20.
- Consumo de alcohol en unidades estándar por semana.

La cantidad y la frecuencia son obligatorias cuando el estado es activo o
suspendido. Un "sí fuma" sin cantidad no sirve para ningún cálculo de riesgo.

Verifica el índice tabáquico con este caso: 6 cigarros al día durante 12 años debe
dar 3.6 paquetes-año.
```

### 22 · Gineco-obstétricos condicionados

```
Implementa el bloque gineco-obstétrico:

Campos: edad de menarca; características de la menstruación (duración, cantidad,
frecuencia, dolor, otras secreciones); actividad sexual (edad de inicio, número de
compañeros, método anticonceptivo, periodicidad, infecciones de transmisión
sexual); fórmula obstétrica (gestas, partos, cesáreas, abortos); antecedentes
perinatales.

Regla de presentación: el bloque se muestra según el sexo registrado del paciente,
y puede habilitarse manualmente cuando corresponda. NO se muestra a todos por
omisión. En el sistema de referencia se mostraba a todos los pacientes, lo que
ensucia la captura y la impresión.

Este bloque es crítico para el piloto de ginecología: revísalo con detalle.
```

### 23 · Alergias y plantillas

```
Dos entregables en este prompt.

A) Alergias estructuradas:
   agente (del catálogo), tipo de reacción, gravedad, fecha de inicio, autor.
   Las alergias a fármaco quedan referenciadas al catálogo de medicamentos, para
   que la verificación de prescripción de la Fase 4 pueda usarlas. Una alergia
   registrada queda disponible de inmediato en la barra de contexto.

B) Plantillas de antecedentes:
   por especialidad y por perfil de paciente, aplicables en un clic.
   Aplicar una plantilla marca cada dato como "heredado". La nota NO se puede
   firmar mientras existan datos heredados sin revisar: el intento devuelve error
   indicando cuáles faltan.

La plantilla sustituye al botón "duplicar nota" del sistema de referencia, que
institucionaliza el copy-forward. La diferencia está en la marca de heredado y en
el bloqueo de firma.
```

### 24 · Pruebas de la Fase 2

```
Escribe y ejecuta las pruebas de la Fase 2:

1. Ningún campo de antecedente acepta un término que no exista en catálogo.
2. Un paciente con sexo masculino no muestra el bloque gineco-obstétrico salvo
   habilitación explícita.
3. Registrar tabaquismo con cantidad y años produce el índice tabáquico calculado
   y almacenado. Caso de prueba: 6 cigarros al día durante 12 años = 3.6.
4. Modificar un antecedente conserva y permite consultar el valor previo con fecha
   y autor.
5. Aplicar una plantilla y firmar sin revisar devuelve error indicando los campos
   heredados pendientes.

Criterio adicional, medido con material clínico real: documentar una primera
consulta completa toma menos de diez minutos. Si no tengo el material todavía,
dime exactamente qué necesitas de mí para poder medirlo.
```

> 🔒 **Decisión humana:** el criterio de los diez minutos necesita tu material clínico real — el texto de una primera consulta y uno de seguimiento, con el orden en que llenas los campos y las frases que repites. Sin eso, las plantillas se diseñan a ciegas.

> ✅ **Fase 2 terminada cuando:** las cinco pruebas pasan y mediste el tiempo de una primera consulta.

---

# Bloque 4 · Fase 3 — La nota como datos

**Hito de la fase:** la nota de consulta se guarda como campos tipados, no como HTML, y sus signos vitales se pueden graficar en el tiempo.

### 25 · Modelo de nota

```
Diseña el modelo de la nota de consulta con campos separados, no un bloque de
HTML:

motivo de consulta, subjetivo, objetivo, análisis, plan; más tipo de nota tomado
de catálogo, autor, especialidad, fecha, cita asociada y estado (borrador /
firmada / con adenda / cancelada).

Regla R3: texto libre SÓLO en subjetivo y análisis, y con formato mínimo — sin
editor de texto enriquecido con estilos arbitrarios. El resto es estructurado.

Si hoy la nota se guarda como HTML de un editor, dime qué migración hace falta y
qué se pierde en el camino.

Declara la equivalencia FHIR de cada campo (regla R7).
```

### 26 · Signos vitales como entidad

```
Implementa los signos vitales como entidad propia por nota, no como campos sueltos
de texto:

presión sistólica y diastólica SEPARADAS, frecuencia cardiaca, frecuencia
respiratoria, temperatura, saturación de oxígeno, peso, talla, perímetro cefálico
y perímetro abdominal.

Cada uno con su unidad explícita y sus rangos de validación por edad. Marca de
"fuera de rango" y de "valor crítico".

Un signo vital fuera del rango crítico exige confirmación explícita del médico
antes de permitir guardar.

En el sistema de referencia la presión arterial era un solo campo de texto, y por
eso no se puede graficar ni detectar una crisis hipertensiva. No repitas eso.
```

### 27 · Cálculos del servidor

```
Implementa los cálculos derivados, ejecutados SIEMPRE en el servidor:

- IMC a partir de peso y talla.
- Superficie corporal.
- Percentilas de peso y talla en pacientes pediátricos, por edad y sexo.

Requisitos:
- Se almacenan junto con la fórmula usada y su versión.
- NUNCA se capturan a mano. Si el cliente envía un valor calculado por su cuenta,
  el servidor lo ignora y recalcula.
- Declara qué fórmula usas para superficie corporal y por qué.

Casos de verificación: peso 78.4 kg y talla 1.58 m deben dar IMC 31.4. Verifica
también tu fórmula de superficie corporal contra un caso publicado, y dime cuál
usaste.
```

### 28 · Diagnósticos codificados

```
Implementa los diagnósticos de la nota:

- Referenciados al catálogo de diagnósticos, con su código visible.
- Tipo: presuntivo, definitivo, descartado.
- Fecha de registro y autor.
- Un diagnóstico definitivo pasa a la lista de diagnósticos vigentes del paciente
  y aparece en la barra de contexto.
- Descartar un diagnóstico no lo borra: cambia su tipo y conserva el histórico
  (regla R1).

Diseña el modelo de forma que admita una codificación compuesta en el futuro
—un código principal más códigos adicionales por especialidad— sin cambiar el
esquema. Explícame cómo.
```

### 29 · Motor de escalas por especialidad

```
Implementa un motor de escalas clínicas declarativo:

- Una escala se define como DATOS: nombre, especialidad, reactivos, tipo de
  respuesta por reactivo, ponderación, interpretación de resultado.
- Se asignan escalas por especialidad; aparecen embebidas dentro de la nota, en
  el bloque objetivo.
- Dar de alta una escala nueva NO requiere desplegar código.

Configura estas como primer conjunto: escala visual análoga de dolor, Glasgow,
Apgar, percentilas de peso y talla pediátricas, Bishop, y riesgo cardiovascular.

Para cada una, cita la fuente de la que tomas los reactivos y la interpretación.
Si no puedes verificar alguna, déjala pendiente y dímelo en lugar de inventar los
valores.
```

### 30 · Gráficas históricas

```
Implementa las gráficas de evolución que se muestran en la pestaña Resultados del
panel lateral:

- Presión arterial (sistólica y diastólica), peso, talla e IMC a lo largo de las
  consultas.
- Cada gráfica con su banda de rango normal de fondo y el punto más reciente
  destacado.
- En pediatría, las curvas de percentilas correspondientes.

Requisito: se calculan leyendo campos estructurados, sin procesar una sola cadena
de texto. Si para alguna hace falta interpretar texto, es señal de que el prompt
26 quedó incompleto.
```

### 31 · Exportación FHIR y pruebas de la Fase 3

```
Dos entregables.

A) Exportación: una nota completa se exporta como paquete HL7 FHIR válido.
   Verifica el resultado contra el validador oficial y muéstrame la salida.

B) Pruebas de los criterios de aceptación de la Fase 3:
   1. La presión arterial de las últimas doce consultas se grafica sin procesar
      texto.
   2. Capturar peso y talla produce IMC calculado por el servidor; enviar un IMC
      distinto por API se ignora.
   3. Una saturación de 78 % exige confirmación antes de permitir guardar.
   4. Dar de alta una escala nueva por configuración la hace disponible en la nota
      sin desplegar.
   5. Una nota completa se exporta a un paquete FHIR válido.
   6. En pediatría, peso y talla producen la percentila correspondiente a la edad.
```

> ✅ **Fase 3 terminada cuando:** las seis pruebas pasan y el validador FHIR acepta el paquete.

---

# Bloque 5 · Fase 4 — El plan que el paciente se lleva

**Hito de la fase:** receta, órdenes de estudio e indicaciones salen del mismo flujo, verificadas contra las alergias del paciente, y es imposible prescribir a ciegas.

> 🔒 **Decisión humana antes del prompt 33:** cuál base comercial de medicamentos con interacciones vas a licenciar. El modelo de datos de la receta depende de esa elección.

### 32 · Modelo de receta

```
Diseña el modelo de receta con líneas estructuradas:

Por cada línea: medicamento del catálogo, presentación, concentración, dosis,
unidad de dosis, vía de administración, frecuencia, duración, indicación, y
procedencia (nueva / heredada de la receta del [fecha]).

La receta pertenece a una nota firmada. Un borrador no emite recetas.

La medicación vigente del paciente se actualiza automáticamente con cada receta
emitida, y es lo que se muestra en la barra de contexto de la Zona 1.

Declara la equivalencia FHIR de cada campo (regla R7).
```

### 33 · Integración del catálogo de medicamentos

```
Integra la base de medicamentos licenciada.

Entrégame:
- El modelo de sincronización: cómo se actualiza el catálogo sin romper recetas
  históricas que apuntan a versiones anteriores.
- El buscador de la interfaz: por principio activo y por nombre comercial, con
  presentación y concentración.
- Cómo se resuelve un medicamento que desaparece del catálogo pero existe en
  recetas antiguas.

Si la base licenciada trae grupos terapéuticos y familias de fármacos, mapea la
relación "principio activo pertenece a grupo", porque el prompt 34 la necesita.
```

### 34 · Verificación de alergia bloqueante

```
Implementa la verificación de alergia en la prescripción. Es la mejora más
importante de todo el proyecto sobre el sistema de referencia, donde las alergias
eran un botón que el médico debía recordar oprimir.

Comportamiento:
- Al agregar CADA fármaco a la receta, se verifica automáticamente contra las
  alergias registradas del paciente, por principio activo Y por grupo terapéutico.
- Si hay coincidencia, la acción se BLOQUEA. No es una advertencia que se cierra.
- El bloqueo se libera únicamente capturando una justificación clínica, que queda
  registrada en el expediente y firmada por el médico.
- El mensaje dice qué alergia, con qué reacción, quién la registró y cuándo, y por
  qué el fármaco coincide.

Caso de prueba obligatorio: paciente con alergia a penicilina y reacción
anafiláctica; prescribir amoxicilina debe bloquear, explicando que la amoxicilina
pertenece al grupo de las penicilinas.
```

### 35 · Interacciones y duplicidad

```
Implementa las verificaciones restantes sobre la receta, usando la base
licenciada:

- Interacción grave: advierte y exige confirmación explícita.
- Interacción moderada: informa, sin bloquear.
- Duplicidad terapéutica: dos fármacos del mismo grupo en la misma receta, o uno
  nuevo que duplica la medicación vigente del paciente.

Todas las verificaciones se hacen contra la receta en curso MÁS la medicación
crónica vigente del paciente, no sólo contra lo que se está escribiendo.

Toda advertencia mostrada y toda confirmación del médico quedan en bitácora.
```

### 36 · Traer última receta

```
Implementa "traer última receta":

- Recupera las líneas de la receta anterior del mismo médico como líneas
  editables, no como texto pegado.
- Cada línea muestra su procedencia y la fecha de la receta original.
- Editar una línea la marca como modificada.
- Las verificaciones de alergia, interacción y duplicidad se ejecutan sobre las
  líneas traídas, no sólo sobre las nuevas.

En consultas de seguimiento de crónicos —diabetes, hipertensión, dislipidemia— la
mayor parte de la receta se repite. Esta función es de las que más tiempo ahorran,
pero sólo si no se convierte en copiar sin revisar.
```

### 37 · Órdenes de estudio e indicaciones

```
Implementa el resto del plan:

A) Órdenes de estudio en dos niveles:
   el tipo de estudio filtra el catálogo de estudios concretos.
   Motivo de solicitud OBLIGATORIO, tomado de catálogo cerrado. No existe la
   opción de dejarlo vacío: intentar guardar sin motivo devuelve error de
   validación.
   Más observaciones clínicas para quien recibe la orden.

B) Indicaciones para el paciente:
   campo propio, en lenguaje llano, separado de la nota técnica. Es lo que se
   imprime y el paciente se lleva.

C) Próxima cita sugerida desde el plan, que enlaza con la agenda.
```

### 38 · Documentos y pruebas de la Fase 4

```
Dos entregables.

A) Generación de documentos:
   Receta, orden de estudios e indicaciones como PDF INDEPENDIENTES, generados a
   partir de la nota firmada. Nunca desde un borrador.
   Con hoja membretada opcional, y con nombre, cédula profesional y firma del
   médico.
   Bitácora de emisión e impresión por documento: quién, cuándo, cuántas veces.

B) Pruebas de los criterios de aceptación de la Fase 4:
   1. Prescribir penicilina a un paciente con alergia a penicilina registrada
      bloquea el guardado y exige justificación.
   2. Prescribir dos fármacos con interacción grave conocida produce advertencia
      con confirmación obligatoria.
   3. "Traer última receta" carga las líneas anteriores marcadas con su fecha de
      origen, editables una por una.
   4. Intentar guardar una orden de estudio sin motivo devuelve error de
      validación.
   5. La receta emitida en PDF contiene nombre, cédula y firma del médico, y su
      folio queda en bitácora.
   6. Después de emitir una receta, la medicación vigente en la barra de contexto
      la refleja.
```

> ✅ **Fase 4 terminada cuando:** las seis pruebas pasan, en especial la 1.

---

# Bloque 6 · Fase 5 — El panel de consulta

**Hito de la fase:** durante la consulta, el médico no necesita salir de la pantalla para consultar absolutamente nada del paciente.

### 39 · Hoja frontal e historia en lectura

```
Llena las dos primeras pestañas del panel lateral:

A) Hoja frontal: identificación, domicilio, diagnósticos activos, cirugías,
   alergias, última consulta, medicación vigente y próxima cita. Una sola pantalla,
   sin scroll si es posible.

B) Historia: los bloques de antecedentes de la Fase 2 en modo lectura,
   colapsables, con la fecha de última actualización de cada bloque.

Ambas de sólo lectura durante la consulta. Ninguna acción de estas pestañas
interrumpe la captura de la nota.
```

### 40 · Línea de tiempo de notas

```
Implementa la pestaña "Notas" del panel:

- Línea de tiempo con las notas previas del paciente: tipo, médico, especialidad
  y fecha.
- Filtro por tipo de nota y por rango de fechas.
- Búsqueda por texto dentro de las notas.
- Ver la nota completa sin salir del panel ni perder la captura en curso.
- Las adendas se muestran SIEMPRE junto a su nota original, nunca la reemplazan.
- Las notas canceladas se muestran marcadas como canceladas, no se ocultan.
```

### 41 · Documentos con acceso controlado

```
Implementa la pestaña "Estudios y documentos":

- Carga de archivo con categoría del catálogo, fecha del estudio (distinta de la
  fecha de carga), descripción y autor de la carga.
- Visor de PDF e imagen embebido, sin descargar el archivo al equipo del médico.
- Los archivos se sirven con URL firmadas de vida corta. NO existe enlace
  permanente a un archivo clínico.
- Toda apertura de documento queda en bitácora de acceso (regla R6).

Verifica: una URL de documento copiada y abierta pasado su tiempo de vida debe
devolver error.
```

### 42 · Resultados y pruebas de la Fase 5

```
Dos entregables.

A) Pestaña "Resultados":
   Resultados de laboratorio como analitos estructurados: nombre del analito
   (mapeado a LOINC), valor, unidad y rango de referencia. NO como un PDF adjunto
   ni como número de orden.
   Marca de fuera de rango. Gráfica de tendencia por analito, con su rango de
   referencia de fondo.
   Acción "marcar como revisado", que deja constancia.

B) Pruebas de los criterios de aceptación de la Fase 5:
   1. Los cinco accesos más frecuentes —última nota, alergias, medicación vigente,
      último laboratorio, último estudio de imagen— están a un clic desde la nota
      abierta.
   2. Abrir el panel no interrumpe ni pierde la captura en curso.
   3. Una URL de documento copiada y abierta pasado su tiempo de vida devuelve
      error.
   4. La carga inicial de la consulta no descarga el contenido de las pestañas no
      abiertas.
   5. Un analito con seis mediciones se grafica con su rango de referencia de fondo.
```

> ✅ **Fase 5 terminada cuando:** las cinco pruebas pasan.

---

# Bloque 7 · Fase 6 — Firma e inalterabilidad

**Hito de la fase:** una nota firmada no se puede modificar ni borrar por ningún camino, y toda corrección deja rastro. **Ésta es la puerta de producción: nada llega a un paciente real sin ella.**

> 🔒 **Decisión humana antes del prompt 43:** firma simple con reautenticación, o firma electrónica avanzada con certificado. La segunda es más sólida y bastante más cara.

### 43 · Firma de la nota

```
Implementa la firma de la nota:

- Requiere reautenticación del médico en el momento de firmar.
- Estampa nombre completo, cédula profesional y sello de tiempo.
- Firmar CIERRA la nota: a partir de ahí no se modifica por ningún camino.
- Al firmar, la cita pasa a "Atendida" y se emiten los documentos del plan.
- La firma no procede si quedan datos heredados sin revisar (prompt 23) o si
  falta contenido obligatorio (prompt 46).

Muéstrame en qué capa impides la modificación: si es sólo en el controlador, no
sirve. Debe ser imposible desde cualquier ruta, incluida una consulta directa a la
base de datos por parte de la aplicación.
```

### 44 · Adenda y cancelación

```
Implementa las dos únicas formas de corregir una nota firmada:

A) ADENDA: una nota nueva que referencia a la firmada, con su propio autor, su
   propia firma y su propio momento. La original permanece íntegra y visible.

B) CANCELACIÓN: motivo obligatorio tomado de catálogo, más firma. El registro se
   marca cancelado, NUNCA se elimina, y sigue siendo consultable.

Elimina del sistema cualquier operación de borrado de datos clínicos que hayas
encontrado en la auditoría del prompt 2. No debe quedar ninguna, ni siquiera
detrás de un rol de administrador.

La impresión y el envío de documentos sólo proceden sobre notas firmadas.
```

### 45 · Integridad y bitácora

```
Implementa la capa de auditoría:

- Sello de integridad por nota firmada, verificable de forma independiente, que
  permita detectar cualquier alteración posterior del contenido.
- Bitácora de acceso consultable: quién leyó qué expediente, cuándo y desde dónde.
  Incluye las lecturas del propio médico tratante.
- Panel de auditoría para el médico titular: quién ha visto a sus pacientes.
- La bitácora es append-only y no se puede editar ni purgar desde la aplicación.

Explícame cómo verificar el sello de integridad de una nota sin confiar en el
propio sistema que la guardó.
```

### 46 · Contenido mínimo y pruebas de la Fase 6

```
Dos entregables.

A) Prueba de contenido obligatorio:
   Implementa la validación del contenido mínimo de la nota y de la historia
   clínica conforme a la NOM-004-SSA3-2012, que se ejecuta ANTES de permitir la
   firma.
   IMPORTANTE: no inventes el listado. Trabaja sobre la lista de campos
   obligatorios que yo te voy a proporcionar, validada por un médico y por mi
   abogado. Si no la tienes todavía, dime exactamente qué necesitas y detente.

B) Pruebas de los criterios de aceptación de la Fase 6:
   1. No existe ninguna ruta de API, rol o consulta contemplada que modifique el
      contenido de una nota firmada.
   2. Una adenda se muestra siempre junto a la nota original, nunca la reemplaza
      en la línea de tiempo.
   3. Cancelar una nota exige motivo de catálogo y firma; la nota sigue siendo
      consultable, marcada como cancelada.
   4. El sello de integridad permite detectar cualquier alteración posterior.
   5. La bitácora refleja cada lectura de expediente.
   6. La validación de contenido mínimo impide firmar una nota incompleta.
```

> 🔒 **Decisión humana:** el listado de contenido mínimo de NOM-004 necesita validación de un médico y de tu abogado. No dejes que la IA lo invente — es exactamente el tipo de dato donde una alucinación te cuesta una verificación sanitaria.

> ✅ **Fase 6 terminada cuando:** las seis pruebas pasan. **Hasta aquí, no hay producción.**

---

# Bloque 8 · Fase 7 — Protocolos longitudinales

**Hito de la fase:** existe un modelo genérico de tratamiento con protocolo, sesiones numeradas y cierre explícito, y el control prenatal es su primera instancia configurada, no código nuevo.

### 47 · Modelo genérico de protocolo

```
Implementa el modelo de tratamiento con protocolo. Es la generalización del módulo
de quimioterapia del sistema de referencia, que se modela como
línea de tratamiento → esquema → ciclo → día del ciclo, con fecha propuesta
separada de la fecha real y cierre explícito.

A) Definición de protocolo (DATOS, no código): nombre, especialidad, sesiones
   esperadas, ventana de tiempo de cada sesión, datos a capturar por sesión,
   criterios de cierre.

B) Instancia por paciente: estado, fecha de inicio, sesión actual, motivo de
   cierre.

C) Sesión: fecha propuesta, fecha real, si cumplió la ventana, y liga a la nota de
   esa visita.

Reglas: una sesión fuera de ventana se REGISTRA como tal, no se rechaza. Cerrar
una instancia exige motivo: completado, abandonado, cambio de plan, referido. Un
paciente puede tener varias instancias, incluso del mismo protocolo, en momentos
distintos.
```

### 48 · Primeros protocolos y pruebas de la Fase 7

```
Dos entregables.

A) Configura como DATOS, sin escribir código nuevo:
   - Control prenatal: visitas esperadas por semana de gestación, con sus ventanas
     y los datos que se capturan en cada una.
   - Esquema de vacunación infantil.
   Cita la fuente de la que tomas el calendario de cada uno. Si no puedes
   verificarla, déjalo pendiente y dímelo.

B) Vista de adherencia: qué sesiones se cumplieron dentro de ventana y cuáles no.

C) Pruebas de los criterios de aceptación de la Fase 7:
   1. Definir un protocolo nuevo por configuración lo hace agendable y capturable
      sin desplegar código.
   2. El control prenatal muestra las visitas esperadas por semana de gestación y
      marca las cumplidas fuera de ventana.
   3. Cerrar una instancia sin motivo devuelve error de validación.
   4. Cada sesión queda ligada a la nota de la consulta correspondiente.
```

> ✅ **Fase 7 terminada cuando:** las cuatro pruebas pasan y el control prenatal funciona sin código específico.
---

# Bloque 9 · Fase 8 — El Segundo Lector

**Hito de la fase:** durante la consulta el médico tiene una segunda lectura estructurada de lo que lleva escrito, puede preguntarle, y nada de lo que ella dice entra al expediente sin un clic suyo sobre un elemento concreto.

> 🔒 **Decisión humana antes del prompt 49:** dónde corre el modelo. Proveedor externo con contrato de tratamiento de datos y cláusula de no entrenamiento, o infraestructura propia. Cambia el aviso de privacidad que firma el paciente.

### 49 · Contrato de salida

```
Antes de conectar ningún modelo, define el CONTRATO de salida del asistente
clínico. No debe devolver prosa: debe devolver un objeto que la interfaz
renderiza y que se puede medir.

Implementa el esquema con estos bloques, todos obligatorios aunque vayan vacíos:

  meta: version_modelo, version_prompt, pase, momento, hash_contexto,
        confianza_global, por_que_esa_confianza
  resumen: 3 a 5 líneas
  hallazgos_clave: [{ id, dato, de_donde }]
  banderas_rojas: [{ id, hallazgo, por_que_importa, que_hacer,
                     urgencia: inmediata | misma_consulta | seguimiento }]
  diferenciales: [{ id, diagnostico, codigo_sugerido, probabilidad_relativa,
                    a_favor[], en_contra[], que_lo_confirmaria[],
                    que_lo_descartaria[] }]
  falta_por_preguntar: [{ id, pregunta, para_que }]
  falta_por_explorar:  [{ id, maniobra, para_que }]
  estudios_sugeridos:  [{ id, estudio, para_que, cambia_la_conducta_si }]
  plan_sugerido:       [{ id, intervencion, precaucion, fuente_id }]
  no_puedo_saber: [ "..." ]
  fuentes: [{ id, afirmacion_id, fuente, anio }]

Reglas del contrato:
- TODO elemento lleva id propio: sin eso no se puede aceptar uno y descartar
  otro, ni medir qué proporción se acepta.
- Nunca un diagnóstico único: mínimo dos diferenciales, siempre con a favor y
  en contra.
- no_puedo_saber se llena aunque vaya vacío.
- Toda afirmación del plan lleva fuente_id. Sin fuente, el elemento se emite
  igual pero la interfaz lo marca como sin respaldo verificable.

Impón el esquema en la llamada al modelo (salida estructurada forzada), no
sólo por instrucción en el prompt. Escribe el validador y las pruebas del
contrato antes de conectar nada.
```

### 50 · Ensamblador de contexto

```
Implementa el ensamblador que arma el contexto que se le manda al modelo en
cada pase. Se arma en el servidor, campo por campo, a partir de datos
estructurados. NUNCA se manda el expediente completo.

Bloques del contexto:
  Paciente      edad en años, sexo, embarazo si aplica
  Seguridad     alergias activas con reacción y gravedad
  Problemas     diagnósticos vigentes con código y fecha
  Medicación    medicación crónica vigente con dosis y vía
  Antecedentes  sólo los marcados presentes, con su comentario
  Laboratorio   últimos analitos con valor, unidad, rango y fecha
  Trayectoria   resumen de las últimas 3 notas, no las notas completas
  Actual        la nota en curso, por campos
  Encuadre      especialidad del médico y tipo de consulta

Requisitos:
- SEUDONIMIZACIÓN antes de salir del servidor: fuera nombre, apellidos, CURP,
  domicilio, teléfono, correo y folio. La edad y el sexo se conservan porque
  cambian el razonamiento; la identidad no aporta nada al diferencial.
- Se REGISTRA exactamente qué contexto se envió en cada pase, con su hash.
- Contexto incremental: el bloque estable (paciente, seguridad, problemas,
  medicación, antecedentes) se arma una vez por consulta y se reutiliza; sólo
  cambia la parte de la nota en curso.

Escribe una prueba que falle si algún dato identificable llega al payload.
```

### 51 · Los cuatro pases

```
Implementa los disparadores del asistente. Ni con cada tecla ni sólo al final:
por sección completada, más un pase final.

  Pase 1 · tras el subjetivo    → qué falta preguntar y banderas rojas del relato
  Pase 2 · tras el objetivo     → diferenciales preliminares
  Pase 3 · tras el análisis     → diferenciales afinados, estudios y conducta
  Pase 4 · al pedir el cierre   → revisión final (prompt 55)

Un bloque se considera estable cuando el médico sale del campo, hay contenido
mínimo, y pasan 3 segundos sin cambios. Más un botón "Volver a leer" siempre
disponible.

Reglas:
- Cada pase reemplaza al anterior en pantalla, pero los anteriores se conservan.
- Si el médico dispara un pase mientras otro corre, el anterior se CANCELA.
- El pase es un parámetro del mismo prompt, no cuatro prompts distintos.
- Respuesta por partes: resumen y banderas rojas primero, diferenciales después.
- Tope de gasto por consulta, con comportamiento definido al alcanzarlo.
- DEGRADACIÓN HONESTA: si el modelo no responde a tiempo, la pestaña dice que no
  está disponible y la consulta continúa. El asistente NUNCA bloquea la consulta
  ni la firma.
```

### 52 · Filtro de seguridad del servidor

```
Un prompt bien escrito reduce el riesgo, no lo elimina. Implementa las
verificaciones que corren DESPUÉS de la respuesta del modelo y ANTES de
mostrarla:

1. ALERGIAS. Ningún fármaco sugerido llega a la pantalla si el paciente tiene
   alergia registrada a ese principio activo o a su grupo. Reutiliza la misma
   verificación de la Fase 4. Si el modelo lo sugirió, muéstralo tachado y
   explica por qué se descartó: eso le enseña al médico que el filtro existe.
2. DOSIS. Ninguna dosis se muestra sin contrastarla contra el catálogo
   licenciado. Si no se puede verificar, se muestra la intervención sin dosis.
3. INTERACCIONES contra la medicación vigente del paciente.
4. EMBARAZO Y EDAD: filtro por contraindicación y por rango pediátrico.
5. FUENTES: toda afirmación sin fuente_id se muestra en gris, marcada como sin
   respaldo verificable. No se oculta, se degrada visualmente.
6. BANDERAS ROJAS: lista de condiciones que se muestran aunque el médico no
   haya abierto la pestaña. La lista la define un médico, no tú ni el modelo.
   Si no la tienes todavía, dime qué necesitas y detente en este punto.

Escribe una prueba por cada filtro, con un caso que lo dispare.
```

### 53 · La pestaña Asistente

```
Construye la quinta pestaña del panel lateral (Zona 3).

Comportamiento: un punto en la pestaña indica que hay una lectura nueva. NO se
abre sola, no salta un cuadro de diálogo, no roba el foco. Única excepción: una
bandera roja de urgencia inmediata.

Orden del contenido, de arriba abajo:
  1. Banderas rojas, si las hay
  2. Resumen de la consulta hasta ahora
  3. Qué falta preguntar y qué falta explorar  ← arriba de los diferenciales
     a propósito: durante la consulta es más accionable
  4. Diferenciales, cada uno como tarjeta expandible con a favor, en contra y
     qué lo confirmaría
  5. Estudios y plan sugeridos, con su fuente
  6. Lo que no puedo saber

Tres acciones POR ELEMENTO, nunca en bloque:
  Aceptar   → entra a la nota. Un diferencial como diagnóstico presuntivo; un
              estudio a las órdenes; una pregunta al subjetivo como pendiente.
              Queda con origen IA, versión de prompt, momento y quién aceptó.
  Descartar → lo quita de la vista, opcionalmente con motivo de una lista corta.
  Preguntar → abre el campo de pregunta con ese elemento como asunto.

PROHIBIDO un botón "aceptar todo". La fricción de aceptar uno por uno es lo que
mantiene al médico leyendo lo que acepta.
```

### 54 · Preguntarle al asistente

```
Implementa la conversación acotada a la consulta en curso:

- Campo de pregunta dentro de la pestaña, con el contexto ya cargado: el médico
  no tiene que explicarle el caso.
- Las preguntas y respuestas se guardan en el ANEXO, no en la nota clínica.
- Cada respuesta sigue las mismas reglas: fuentes por afirmación, y decir cuándo
  no sabe.
- Sugerencias de arranque contextuales, para que no tenga que redactar:
  "¿por qué pusiste ese diferencial primero?", "¿qué me estoy perdiendo?",
  "¿esto cambia con su función renal?"
- La conversación NO modifica la lectura estructurada. Si sale algo valioso, el
  médico dispara "volver a leer" o lo escribe él.
- Límite de turnos por consulta para acotar costo. Al alcanzarlo se dice
  claramente, en lugar de degradar la calidad en silencio.
```

### 55 · La revisión de cierre

```
Implementa el pase 4: la pantalla que aparece al presionar "firmar y cerrar
consulta", ANTES de la firma.

Revisa cinco cosas:
  Omisiones                  algo documentado que no se exploró
  Contradicciones            entre la nota y la historia clínica del paciente
  Diferencia con tu criterio el diagnóstico que se va a firmar contra el primer
                             diferencial del asistente, con el argumento
  Plan incompleto            ajustes sin cita de control, órdenes sin motivo
  Coherencia interna         diagnósticos que no aparecen en subjetivo ni objetivo

Reglas de diseño, todas importantes:
- MÁXIMO TRES observaciones, ordenadas por gravedad, y sólo las que cambiarían
  la conducta. Si aparece cargada de cosas irrelevantes, el médico aprende a
  saltarla en dos días y pierdes el módulo entero.
- Si no hay nada que decir, la pantalla dice "sin observaciones" y desaparece
  sola.
- NO BLOQUEA la firma. El médico lee, corrige lo que quiera y firma.
- Única excepción: una bandera roja de urgencia inmediata exige un acuse
  explícito —"la vi y decido continuar"— que queda registrado.
- La revisión y lo que el médico decida con ella quedan en el anexo, no en la
  nota.
```

### 56 · Datos, métricas y pruebas de la Fase 8

```
Tres entregables.

A) MODELO DE DATOS del anexo, separado de la nota y sujeto a R1, R4 y R6:
   LecturaAsistente     id, nota_id, pase, disparador, momento, version_modelo,
                        version_prompt, contexto_enviado, hash_contexto,
                        salida_estructurada, latencia_ms, costo, estado
   SugerenciaAsistente  id, lectura_id, tipo, contenido, estado
                        (pendiente/aceptada/descartada), quien, cuando,
                        motivo_descarte
   PreguntaAsistente    id, nota_id, pregunta, respuesta, momento, fuentes
   AcuseBanderaRoja     id, lectura_id, bandera_id, quien, cuando, decision
   VersionPrompt        id, version, contenido, vigente_desde, autor, motivo

   Nada se borra, ni siquiera si la nota se cancela.

B) MÉTRICAS instrumentadas desde el primer día:
   1. Proporción de consultas donde el médico abre la pestaña
   2. Sugerencias aceptadas sobre mostradas, POR TIPO
   3. Concordancia entre el primer diferencial y el diagnóstico firmado
   4. Banderas rojas relevantes sobre banderas rojas mostradas ← la más
      importante: es la que detecta fatiga de alerta
   5. Tiempo de consulta con y sin el módulo
   6. Costo por consulta

C) PRUEBAS de los criterios de aceptación de la Fase 8:
   1. Ninguna ruta permite que el asistente escriba en la nota sin un acto
      explícito del médico sobre un elemento con id.
   2. Ningún dato identificable del paciente sale en el contexto enviado.
   3. Un fármaco con alergia registrada nunca llega a la pantalla como
      sugerencia activa.
   4. Con el modelo caído, la consulta se captura y se firma con normalidad.
   5. La revisión de cierre nunca muestra más de tres observaciones.
   6. Cada lectura queda guardada con su contexto, su versión de modelo y su
      versión de prompt.
   7. Aceptar una sugerencia deja registro de origen, versión, momento y autor.
```

> 🔒 **Decisión humana:** la lista de banderas rojas del prompt 52 la define un médico. Ni tú ni el modelo. Y díles a los médicos del piloto, **desde el principio**, que vas a medir la concordancia entre lo que sugiere la IA y lo que ellos firman, y para qué sirve: mejorar el módulo, no evaluarlos. Si lo descubren después, pierdes el piloto y la relación.

> ✅ **Fase 8 terminada cuando:** las siete pruebas pasan, en especial la 1 y la 3.


---

# Bloque 10 · Cierre

### 57 · Repaso adversarial

```
Cambia de papel: ya no construyes, intentas romper.

Actúa como un auditor externo hostil que quiere demostrar que Medicfy no es apto
para uso clínico. Con acceso al código completo, intenta encontrar:

1. Una forma —cualquiera— de modificar o borrar una nota firmada. Rutas de API,
   roles, tareas programadas, migraciones, comandos de mantenimiento, todo.
2. Una forma de leer el expediente de un paciente que no te corresponde.
3. Una forma de prescribir un fármaco al que el paciente es alérgico sin dejar
   justificación.
4. Una forma de insertar un término en un catálogo desde una pantalla de captura.
5. Un dato clínico que se guarde como texto libre y debería ser estructurado.
6. Una pantalla del escritorio de consulta inutilizable en tableta.
7. Un cálculo derivado que se acepte del cliente sin recalcular.
8. Un enlace a un archivo clínico que no caduque.
9. Una forma de que el asistente de IA escriba en la nota sin un acto explícito
   del médico sobre un elemento concreto.
10. Un dato identificable del paciente que salga en el contexto enviado al
    modelo.
11. Un fármaco sugerido por la IA que llegue a la pantalla pese a haber alergia
    registrada.

Por cada hallazgo: cómo se explota, qué se rompe, y la corrección mínima.
Sé exhaustivo y desconfiado. Si no encuentras nada en alguno de los once puntos,
dilo explícitamente en lugar de rellenar.
```

> ✅ **Antes de avanzar:** corrige todo lo que salga de este prompt antes del 58. Este repaso vale más que las nueve fases si encuentra algo.

### 58 · Preparación del piloto

```
Prepara el lanzamiento del piloto con médicos reales:

1. Datos semilla: catálogos poblados, un consultorio de prueba, y un conjunto de
   pacientes ficticios que ejerciten los casos límite (paciente alérgico, paciente
   pediátrico, paciente embarazada, paciente con protocolo abierto). Ningún dato
   real de paciente en semillas.
2. Respaldo y restauración: procedimiento probado de extremo a extremo, con
   tiempo de recuperación medido.
3. Portabilidad: exportación del expediente completo de un paciente a solicitud
   suya, en formato interoperable, con registro de la entrega.
4. Guía de instalación y de operación, escrita para alguien que no construyó el
   sistema.
5. Lista de verificación de lanzamiento: qué tiene que estar cierto antes de que
   el primer paciente real entre al sistema, incluyendo las seis pruebas de la
   Fase 6.
6. Plan de las primeras dos semanas: qué se mide, qué se pregunta a los médicos,
   y qué señales harían que se detenga el piloto.

Al final, dime con honestidad qué queda sin terminar y qué riesgo implica.
```

---

## Resumen de la secuencia

| Bloque | Prompts | Qué produce |
|---|---|---|
| 0 · Diagnóstico | 1–6 | Saber dónde estás y qué hay que reparar |
| 1 · Fase 0 · Catálogos | 7–11 | Catálogos cerrados, versionados, sin duplicados |
| 2 · Fase 1 · Escritorio | 12–17 | La pantalla de consulta que no se abandona |
| 3 · Fase 2 · Historia | 18–24 | Primera consulta marcando, no redactando |
| 4 · Fase 3 · Nota | 25–31 | La nota como datos graficables y exportables |
| 5 · Fase 4 · Plan | 32–38 | Receta segura, órdenes justificadas, documentos |
| 6 · Fase 5 · Panel | 39–42 | Todo el expediente a un clic sin salir |
| 7 · Fase 6 · Firma | 43–46 | Expediente inalterable · **puerta de producción** |
| 8 · Fase 7 · Protocolos | 47–48 | Control prenatal y vacunación por configuración |
| 9 · Fase 8 · El Segundo Lector | 49–56 | El asistente de IA que nunca escribe en la nota |
| 10 · Cierre | 57–58 | Repaso adversarial y preparación del piloto |

## Las siete decisiones que no delegues

Están marcadas 🔒 a lo largo del documento. Reunidas:

1. **Terminología de antecedentes** — antes del prompt 9. SNOMED CT licenciado o catálogo propio.
2. **Base de medicamentos** — antes del prompt 33. Cuál licencias; de ella depende el modelo de la receta.
3. **Alcance de la firma** — antes del prompt 43. Simple con reautenticación, o avanzada con certificado.
4. **Contenido mínimo NOM-004** — antes del prompt 46. Validado por un médico y por tu abogado, nunca por la IA.
5. **Dónde corre el modelo de IA** — antes del prompt 49. Proveedor externo con contrato de tratamiento de datos y cláusula de no entrenamiento, o infraestructura propia. Cambia el aviso de privacidad que firma el paciente.
6. **La lista de banderas rojas** — antes del prompt 52. La define un médico, nunca el modelo ni tú.
7. **Tu material clínico real** — antes del prompt 24. El texto de una primera consulta y uno de seguimiento, con el orden en que llenas los campos y las frases que repites. Sin eso, las plantillas se diseñan a ciegas y el criterio de los diez minutos no se puede medir.

Dos más que conviene decidir temprano aunque no bloqueen un prompt concreto: el **bloqueo duro por alergia** (correcto clínicamente, irrita a algunos médicos — confírmalo con los del piloto antes del prompt 34) y el **aislamiento entre consultorios** (esquema por consultorio o fila con políticas; cambiar de opinión después es una migración).
