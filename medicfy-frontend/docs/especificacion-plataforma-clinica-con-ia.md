<!--
ESTADO: COMPLETO — pegado por el usuario el 2026-08-25 en dos mensajes
(el primero se cortó a la mitad de la tabla de §37 por el límite de
50,000 caracteres; el segundo trajo el resto de §37 más §38-40). Este
archivo existe para que el documento nunca vuelva a perderse en una
compactación — la vez anterior que se pegó, el texto crudo se volvió
irrecuperable después de compactar la conversación.

No es la fuente única de requisitos del MVP — esa sigue siendo
ESPECIFICACION_TECNICA_MEDICFY_MVP.md v2.0 (CLAUDE.md §1). Este
documento es la visión más amplia (plataforma clínica con IA,
Opción A/B, teleconsulta) referenciada en las correcciones v2.1 ya
aplicadas esta sesión (ruta de firma autógrafa vs. electrónica en
recetas y, después, en órdenes de laboratorio).
-->

# Especificación: plataforma clínica con IA (v2.1 corregida)

## 1. Corrección principal de esta versión

La firma digital o electrónica **no será obligatoria para imprimir la receta**.

La plataforma ofrecerá dos rutas válidas y claramente separadas:

1. **Receta para firma autógrafa después de imprimir**
   - El médico revisa y finaliza el contenido.
   - La plataforma genera la versión definitiva para impresión.
   - El documento incluye un espacio visible para la firma autógrafa.
   - El médico imprime y firma con tinta antes de entregarla.
   - No se exige cargar una firma digital ni insertar una imagen de firma.

2. **Receta con firma digital o electrónica opcional**
   - El médico revisa y finaliza el contenido.
   - Selecciona el mecanismo electrónico configurado por la institución.
   - Firma dentro de la plataforma.
   - El sistema genera el documento firmado, verificable y auditable.

La elección se presenta al emitir la receta:

```text
¿Cómo desea firmar esta receta?

[ Imprimir y firmar a mano ]    [ Firmar digitalmente ]

La firma digital es opcional. Si imprime la receta, fírmela a mano
antes de entregarla al paciente.
```

### Regla crítica

La plataforma puede exigir que la información esté completa y revisada antes de producir una receta definitiva, pero **no debe condicionar la impresión a una firma digital**.

---

## 2. Objetivo del producto

Construir una plataforma clínica centrada en una consulta continua, desde el registro de antecedentes hasta la receta, reduciendo doble captura y manteniendo al médico en control.

La experiencia debe permitir:

- Registrar o consultar el expediente del paciente.
- Capturar antecedentes heredofamiliares, personales y clínicos.
- Realizar consultas presenciales o en línea.
- Registrar interrogatorio, exploración, estudios, evaluación y plan.
- Generar en paralelo un borrador estructurado asistido por IA.
- Presentar hipótesis diagnósticas explicables, no un diagnóstico autónomo.
- Crear una receta revisable.
- Elegir firma autógrafa posterior a la impresión o firma digital/electrónica opcional.
- Cerrar la nota con trazabilidad y permitir adendas sin alterar el original.

El producto no debe convertirse en un formulario interminable ni en un chat aislado. Debe funcionar como un espacio clínico único, progresivo y seguro.

---

## 3. Principios de diseño

### 3.1 El médico conserva la decisión

La IA propone, organiza, señala y redacta borradores. El profesional acepta, modifica o rechaza. Ninguna sugerencia de IA entra silenciosamente al expediente definitivo.

### 3.2 Una sola captura, varios usos

Un dato confirmado debe reutilizarse en:

- Resumen del paciente.
- Nota clínica.
- Panel de IA.
- Impresión diagnóstica.
- Plan terapéutico.
- Receta.
- Indicaciones y seguimiento.

### 3.3 Borrador separado del registro oficial

El contenido generado por IA debe permanecer en un espacio de borrador hasta que el médico lo confirme. La interfaz debe distinguir siempre:

- Dato original del expediente.
- Dato capturado durante la consulta.
- Sugerencia de IA pendiente.
- Contenido aceptado por el médico.
- Documento final cerrado o emitido.

### 3.4 Seguridad visible sin fricción innecesaria

Las alertas críticas son prominentes; las sugerencias informativas no interrumpen. La interfaz no debe producir fatiga de alertas.

### 3.5 Presencial y en línea comparten el mismo expediente

La modalidad cambia la distribución de la pantalla y algunas validaciones, pero no crea un registro clínico paralelo.

### 3.6 Firma y emisión son procesos distintos

- **Finalizar contenido:** bloquear la versión clínica aprobada.
- **Elegir método de firma:** autógrafa o digital/electrónica.
- **Emitir:** producir una copia identificable para entrega.

Esta separación evita obligar al médico a usar una firma digital para poder imprimir.

---

## 4. Alcance funcional

### Incluido

- Pacientes y expedientes.
- Agenda y sala de espera.
- Consulta presencial.
- Teleconsulta.
- Historia clínica y antecedentes.
- Signos vitales y exploración.
- Carga de estudios y documentos.
- Nota de evolución.
- Asistencia con IA en dos modalidades.
- Impresión diagnóstica y diagnósticos confirmados.
- Plan clínico.
- Receta y documentos de salida.
- Impresión, firma opcional y auditoría.
- Seguimiento y recordatorios.
- Roles, permisos, privacidad y trazabilidad.

### Fuera del primer alcance

- Diagnóstico autónomo sin validación profesional.
- Prescripción autónoma por IA.
- Firma de documentos por la IA.
- Sustitución de criterio médico.
- Flujos completos de hospitalización, cirugía o urgencias.
- Prescripción especial de medicamentos controlados sin un módulo regulatorio específico.
- Facturación, inventario y farmacia, salvo integraciones posteriores.

---

## 5. Roles y permisos

| Rol | Capacidades principales | Restricciones clave |
|---|---|---|
| Médico tratante | Consultar expediente, documentar, validar IA, cerrar nota, prescribir, elegir método de firma | Sólo dentro de pacientes y sedes autorizadas |
| Enfermería | Preparar consulta, signos vitales, cuestionarios, adjuntos | No confirma diagnósticos ni emite recetas |
| Asistente/recepción | Agenda, identidad, consentimientos administrativos | No accede a secciones clínicas innecesarias |
| Paciente | Completar cuestionarios, ver documentos autorizados, entrar a teleconsulta | No modifica notas clínicas |
| Administrador clínico | Catálogos, plantillas, permisos y configuración | No altera notas cerradas |
| Auditor | Consulta de registros y bitácoras | Sólo lectura y acceso justificado |
| Soporte técnico | Estado del sistema y metadatos mínimos | Sin acceso clínico por defecto |

### Permisos sensibles separados

No basta con un permiso genérico de "médico". Deben existir permisos independientes para:

- Ver expediente.
- Crear o editar nota.
- Cerrar nota.
- Generar receta.
- Emitir receta para firma autógrafa.
- Aplicar firma digital/electrónica.
- Cancelar o sustituir receta.
- Descargar documentos.
- Acceder a audio o transcripciones.
- Consultar bitácora.

---

## 6. Mapa general de navegación

```text
Inicio
├── Agenda
│   ├── Citas de hoy
│   ├── Sala de espera
│   └── Teleconsultas
├── Pacientes
│   ├── Buscar/crear paciente
│   └── Expediente
│       ├── Resumen
│       ├── Antecedentes
│       ├── Consultas
│       ├── Estudios
│       ├── Recetas
│       ├── Documentos
│       └── Auditoría autorizada
├── Consulta activa
│   ├── Historia y motivo
│   ├── Exploración
│   ├── Evaluación
│   ├── Plan
│   ├── Receta
│   └── Asistente IA
└── Configuración
    ├── Profesionales y sedes
    ├── Plantillas
    ├── Catálogos
    ├── Firma digital/electrónica
    ├── Consentimientos
    └── Seguridad
```

---

## 7. Resumen permanente del paciente

En la parte superior de cualquier consulta debe mostrarse una banda compacta con:

- Nombre completo.
- Identificador interno.
- Edad y fecha de nacimiento.
- Sexo registrado y datos clínicamente relevantes configurables.
- Alergias y reacciones.
- Alertas críticas.
- Embarazo o lactancia cuando corresponda y esté documentado.
- Medicación activa.
- Enfermedades crónicas relevantes.
- Modalidad de consulta.
- Médico responsable.

### Comportamiento

- Las alergias graves nunca se ocultan en una pestaña.
- Al seleccionar una alerta se abre su fuente y fecha.
- Los datos históricos no se reemplazan con una sugerencia de IA.
- Debe ser posible corregir un dato, conservando su historial.

---

## 8. Flujo completo de consulta

```text
Identificar paciente
   ↓
Verificar consentimiento y modalidad
   ↓
Revisar resumen y alertas
   ↓
Actualizar antecedentes
   ↓
Capturar motivo y padecimiento actual
   ↓
Interrogatorio por aparatos y sistemas
   ↓
Signos vitales y exploración
   ↓
Revisar estudios y tratamientos previos
   ↓
IA organiza hallazgos y propone pendientes
   ↓
Médico define evaluación e impresión diagnóstica
   ↓
Médico establece plan e indicaciones
   ↓
Crear y validar receta si corresponde
   ↓
Elegir: imprimir para firma autógrafa o firma digital opcional
   ↓
Cerrar nota y programar seguimiento
```

La plataforma guarda borradores automáticamente, pero no debe convertirlos en documentos definitivos sin una acción explícita del profesional.

---

## 9. Inicio de consulta

### 9.1 Acciones iniciales

1. Abrir una cita o buscar al paciente.
2. Confirmar identidad con al menos dos datos.
3. Seleccionar tipo de nota y especialidad.
4. Elegir modalidad: presencial, videollamada o llamada autorizada.
5. Confirmar ubicación del paciente y datos de contacto en teleconsulta.
6. Revisar alertas y resumen.
7. Recuperar borrador si existe o iniciar una nueva consulta.

### 9.2 Prevención de errores de paciente

- Mostrar nombre y fecha de nacimiento al iniciar, prescribir, firmar y emitir.
- Si hay dos expedientes parecidos, mostrar advertencia de posible duplicado.
- Si la sesión permanece inactiva, bloquearla y exigir reautenticación.
- La IA recibe sólo el contexto del expediente actualmente activo.

---

## 10. Antecedentes clínicos

Los antecedentes deben poder capturarse como datos estructurados y como notas breves. Cada elemento conserva fuente, fecha, autor y estado de verificación.

### 10.1 Antecedentes heredofamiliares

Registrar por familiar o línea familiar:

- Parentesco.
- Vivo, fallecido o desconocido.
- Edad actual o edad de fallecimiento.
- Causa de fallecimiento si se conoce.
- Diabetes.
- Hipertensión.
- Cardiopatía o evento vascular.
- Cáncer y tipo.
- Enfermedad renal.
- Enfermedades hereditarias o congénitas.
- Trastornos neurológicos o psiquiátricos relevantes.
- Enfermedades autoinmunes.
- Otros antecedentes.
- Negados, desconocidos o no investigados.

#### UX recomendada

- Vista rápida por tarjetas: madre, padre, hermanos, hijos y otros.
- Botones `Niega`, `Desconoce` y `Agregar detalle`.
- Resumen automático editable: "Padre con diabetes tipo 2; madre con hipertensión".
- La IA puede detectar contradicciones, pero no debe corregirlas sin confirmación.

### 10.2 Antecedentes personales no patológicos

- Vivienda y servicios.
- Alimentación e hidratación.
- Higiene.
- Actividad física.
- Sueño.
- Ocupación y exposiciones.
- Viajes relevantes.
- Tabaquismo.
- Alcohol.
- Otras sustancias.
- Vacunación.
- Animales, vectores y riesgos ambientales cuando proceda.

### 10.3 Antecedentes personales patológicos

- Enfermedades previas y activas.
- Hospitalizaciones.
- Cirugías.
- Traumatismos.
- Transfusiones.
- Alergias y tipo de reacción.
- Medicamentos actuales y adherencia.
- Enfermedades infecciosas relevantes.
- Discapacidad y apoyos.
- Salud mental.
- Antecedentes gineco-obstétricos, pediátricos u otros según plantilla.

### 10.4 Reglas de actualización

- Mostrar `Sin cambios desde…` para acelerar seguimientos.
- Permitir confirmar antecedentes sin volver a escribirlos.
- Una negación debe ser explícita; un campo vacío no significa "negado".
- Registrar quién confirmó la información y cuándo.
- No borrar el valor histórico al actualizarlo.

---

## 11. Motivo de consulta y padecimiento actual

### 11.1 Motivo de consulta

Captura breve, idealmente en palabras del paciente.

### 11.2 Padecimiento actual

La interfaz debe guiar sin imponer una plantilla rígida:

- Inicio y cronología.
- Localización.
- Características.
- Intensidad y escalas.
- Factores desencadenantes.
- Agravantes y atenuantes.
- Síntomas asociados.
- Evolución.
- Tratamientos intentados y respuesta.
- Impacto funcional.
- Datos de alarma interrogados.
- Contexto epidemiológico cuando aplique.

### 11.3 Asistencia automática

Mientras el médico captura, la IA puede construir un borrador narrativo y una lista de datos faltantes. Debe evitar preguntas ya contestadas en otra sección.

Ejemplo:

```text
Sugerencias pendientes
• Falta precisar duración exacta.
• No se documentó presencia o ausencia de fiebre.
• El paciente mencionó un medicamento, pero no la dosis.
```

Cada sugerencia incluye `Agregar`, `Descartar` o `Preguntar`.

---

## 12. Interrogatorio, signos vitales y exploración

### 12.1 Interrogatorio por aparatos y sistemas

- Secciones plegables por sistema.
- Valores `Positivo`, `Negativo`, `No interrogado` y `No aplica`.
- Positivos visibles en el resumen.
- La IA puede sugerir sistemas relevantes según el motivo, sin ocultar los demás.

### 12.2 Signos vitales

- Tensión arterial.
- Frecuencia cardiaca.
- Frecuencia respiratoria.
- Temperatura.
- Saturación de oxígeno.
- Peso, talla e IMC.
- Dolor.
- Glucosa u otros valores configurables.

#### Validaciones

- Unidad visible.
- Rango plausible, no sólo rango "normal".
- Confirmación ante valores improbables.
- Fecha, hora, dispositivo y responsable cuando estén disponibles.
- Tendencia frente a consultas anteriores.

### 12.3 Exploración física presencial

- Estado general.
- Cabeza y cuello.
- Cardiovascular.
- Respiratorio.
- Abdomen.
- Extremidades.
- Neurológico.
- Piel.
- Exploración dirigida por especialidad.

### 12.4 Exploración en línea

La nota debe identificar expresamente las limitaciones de la modalidad. Separar:

- Observaciones realizadas por video.
- Maniobras guiadas al paciente.
- Mediciones aportadas por el paciente y su dispositivo.
- Información no evaluable a distancia.
- Razón para convertir a atención presencial o urgente.

Nunca copiar una exploración física normal presencial dentro de una teleconsulta si no fue realizada.

---

## 13. Estudios, documentos y línea de tiempo

La consulta debe permitir revisar y adjuntar:

- Laboratorio.
- Imagenología.
- Patología.
- Notas previas.
- Recetas anteriores.
- Documentos externos.
- Fotografías clínicas con consentimiento.
- Datos de dispositivos autorizados.

### Comportamiento recomendado

- Vista cronológica y por categoría.
- Extracción asistida de valores, siempre marcada como pendiente de revisión.
- Comparación de tendencias.
- Enlace desde cada dato resumido hacia el documento fuente.
- Sin sobrescribir el archivo original.

---

## 14. Módulo de IA: opción A y opción B

Las dos opciones pueden coexistir. La recomendación es implementar **A como comportamiento predeterminado** y habilitar **B sólo con consentimiento explícito y controles visibles**.

### 14.1 Opción A: copiloto lateral visible

Un panel de IA permanece al lado de la consulta y se alimenta de los campos que el profesional va completando.

#### Qué muestra

- Resumen clínico en construcción.
- Información faltante relevante.
- Posibles inconsistencias.
- Datos de alarma.
- Hipótesis diagnósticas para considerar.
- Sugerencias de plan sujetas a revisión.
- Borrador de nota.
- Borrador de receta basado sólo en el plan confirmado.

#### Ventajas

- Transparencia: el médico ve qué hace la IA.
- Menor riesgo de captura oculta.
- Fácil aceptación o rechazo por bloque.
- Adecuada para iniciar el producto.

#### Interacción

Cada tarjeta debe mostrar:

- Qué se sugiere.
- Por qué se sugiere.
- De qué datos proviene.
- Nivel de certeza o limitación.
- Acciones: `Aceptar`, `Editar`, `Descartar`, `Ver evidencia`.

### 14.2 Opción B: asistente ambiental en segundo plano

Con consentimiento previo, el sistema puede transcribir la conversación clínica y convertirla en un borrador estructurado.

#### Controles obligatorios

- Aviso y consentimiento antes de iniciar.
- Indicador permanente de micrófono/transcripción activa.
- Botones visibles `Pausar`, `Reanudar` y `Detener`.
- Posibilidad de marcar conversación no clínica para excluirla.
- Política explícita de audio: si se almacena, por cuánto tiempo y quién accede.
- Alternativa de transcripción temporal sin conservar audio cuando sea viable.
- Revisión completa antes de incorporar contenido.

#### Qué puede preparar

- Motivo de consulta.
- Cronología del padecimiento.
- Síntomas positivos y negativos mencionados.
- Antecedentes actualizados.
- Medicación y alergias mencionadas.
- Borrador de evaluación y plan discutidos.
- Tareas pendientes.

#### Qué no debe hacer

- Guardar audio sin consentimiento.
- Convertir una inferencia en un hecho.
- Atribuir una frase a la persona equivocada.
- Firmar la nota.
- Confirmar un diagnóstico.
- Prescribir o emitir una receta.

### 14.3 Recomendación híbrida

```text
Opción B prepara borradores desde la conversación
                  ↓
Opción A los muestra, explica y permite revisarlos
                  ↓
El médico acepta o corrige
                  ↓
Sólo el contenido confirmado pasa al expediente
```

El panel puede actualizarse en segundo plano, pero no debe modificar en silencio los campos oficiales. Puede rellenar una **capa de borrador** visualmente diferenciada.

---

## 15. Impresión diagnóstica asistida

El término recomendado en la interfaz es **"Impresión diagnóstica asistida por IA"** o **"Hipótesis para revisión"**, no "diagnóstico automático".

### 15.1 Entrada del modelo

Sólo datos necesarios y autorizados de:

- Motivo y padecimiento actual.
- Antecedentes relevantes.
- Alergias y medicación.
- Signos vitales.
- Exploración.
- Estudios seleccionados.
- Edad y otros datos clínicamente pertinentes.

### 15.2 Salida esperada

Por cada hipótesis:

- Nombre de la posibilidad diagnóstica.
- Evidencia a favor tomada de la consulta.
- Evidencia en contra o datos ausentes.
- Preguntas o exploraciones que ayudarían a discriminar.
- Señales de alarma relacionadas.
- Nivel de incertidumbre expresado con prudencia.
- Referencias clínicas configuradas cuando corresponda.

### 15.3 Acciones del médico

- `Agregar como diagnóstico de trabajo`.
- `Agregar como diagnóstico diferencial`.
- `Editar`.
- `Descartar`.
- `Solicitar explicación`.

### 15.4 Reglas de seguridad

- No presentar una sola respuesta como certeza.
- No generar diagnósticos si el contexto es insuficiente sin advertirlo.
- Priorizar la detección de urgencias sobre la comodidad del flujo.
- Las alertas de emergencia no deben esperar a que termine la consulta.
- El diagnóstico final conserva autoría médica.
- Registrar versión del modelo, entrada relevante, salida y decisión del médico.

---

## 16. Evaluación y plan

### 16.1 Evaluación

- Diagnóstico principal confirmado por el médico.
- Diagnósticos secundarios.
- Diagnósticos diferenciales.
- Problemas activos.
- Estado: probable, confirmado, descartado, en estudio o antecedente.
- Código clínico cuando proceda, sin obligar a codificar antes de razonar.

### 16.2 Plan

- Estudios solicitados.
- Tratamiento farmacológico.
- Tratamiento no farmacológico.
- Educación al paciente.
- Signos de alarma.
- Referencia o interconsulta.
- Incapacidad u otros documentos según permisos.
- Seguimiento y plazo.
- Criterios para acudir a urgencias.

### 16.3 Reconciliación

Antes de terminar, la plataforma compara:

- Problemas vs. plan.
- Medicación actual vs. nuevas indicaciones.
- Alergias vs. medicamentos propuestos.
- Receta vs. plan documentado.
- Seguimiento vs. riesgo registrado.

Las discrepancias aparecen como elementos revisables, no como cambios automáticos.

---

## 17. Receta médica

La receta es un documento derivado de una decisión profesional. La IA puede preparar un borrador, pero el médico debe seleccionar, completar y validar cada medicamento.

### 17.1 Contenido mínimo de interfaz

#### Datos del profesional y establecimiento

- Nombre del profesional.
- Profesión o especialidad configurada.
- Institución que expidió el título, cuando corresponda al formato aplicable.
- Número de cédula profesional o autorización aplicable.
- Datos del establecimiento.
- Domicilio del establecimiento.
- Contacto institucional configurado.

#### Datos de la receta

- Folio único.
- Lugar y fecha de expedición.
- Paciente correctamente identificado.
- Medicamentos e indicaciones.
- Advertencias y seguimiento.
- Método de firma elegido.
- Espacio para firma autógrafa o evidencia verificable de firma digital/electrónica.

#### Por cada medicamento

- Denominación genérica y, si se permite, presentación.
- Forma farmacéutica.
- Concentración.
- Dosis.
- Vía.
- Frecuencia.
- Duración.
- Cantidad total cuando aplique.
- Instrucciones adicionales.
- Motivo de cambio o suspensión si se modifica tratamiento previo.

### 17.2 Construcción de la receta

1. El médico selecciona `Crear receta`.
2. La plataforma propone elementos del plan ya confirmado.
3. Cada medicamento comienza en estado `Borrador`.
4. Se ejecutan validaciones de integridad y seguridad configuradas.
5. El médico corrige y confirma.
6. La plataforma muestra una vista previa exacta.
7. El médico selecciona el método de firma.
8. Se genera la versión correspondiente.

### 17.3 Validaciones

- Paciente correcto.
- Alergias conocidas.
- Duplicidad terapéutica.
- Posibles interacciones según fuente configurada.
- Dosis, unidad, vía, frecuencia y duración completas.
- Rangos especiales pediátricos, geriátricos, embarazo o función renal sólo cuando haya datos suficientes.
- Advertencia si falta información necesaria para una comprobación.
- Correspondencia entre plan y receta.

Las validaciones clínicas no deben presentarse como garantía de seguridad absoluta.

### 17.4 Ruta 1: imprimir y firmar a mano

Esta debe ser una ruta de primer nivel, no una excepción escondida.

#### Flujo

```text
Receta en borrador
      ↓
Revisión y validación del médico
      ↓
Seleccionar "Imprimir y firmar a mano"
      ↓
Generar PDF definitivo con folio y espacio de firma
      ↓
Imprimir
      ↓
Firma autógrafa del profesional
      ↓
Entrega física al paciente
```

#### Reglas

- No solicitar firma digital.
- No insertar por defecto una imagen de firma.
- Incluir una línea o área clara para firma autógrafa.
- Mostrar antes de imprimir: "Firme la receta a mano antes de entregarla".
- Conservar en la plataforma la versión exacta que se generó.
- Registrar fecha, hora, usuario, folio e impresora si está disponible.
- Permitir marcar manualmente `Firmada y entregada` sin afirmar que el sistema verificó físicamente la firma.
- Una reimpresión conserva relación con la emisión original y queda auditada.

#### Estado sugerido

`Impresa — pendiente de firma autógrafa` hasta que el profesional confirme `Firmada y entregada`.

### 17.5 Ruta 2: firma digital o electrónica opcional

#### Flujo

```text
Receta en borrador
      ↓
Revisión y validación del médico
      ↓
Seleccionar "Firmar digitalmente"
      ↓
Autenticación reforzada
      ↓
Aplicar mecanismo institucional
      ↓
Generar documento verificable
      ↓
Entregar, descargar o imprimir copia
```

#### Reglas

- Esta opción es voluntaria para el usuario cuando la ruta autógrafa sea aplicable.
- La firma debe vincularse con la versión exacta del documento.
- Cualquier cambio posterior invalida la firma y crea una nueva versión.
- Debe registrarse identidad, fecha, hora, método y resultado de verificación.
- Si sólo se inserta una imagen de firma, la interfaz no debe llamarla "firma digital criptográfica".
- La institución debe definir qué mecanismo cumple sus requisitos jurídicos y operativos.

### 17.6 Selector de método

El selector aparece después de la revisión, antes de emitir:

```text
Emitir receta

Método de firma
(•) Imprimir y firmar a mano
    Genera la receta con un espacio para su firma autógrafa.

( ) Firma digital o electrónica
    Firma dentro de la plataforma usando el mecanismo configurado.

[Volver a editar]                         [Continuar]
```

Debe recordar la preferencia del profesional, pero solicitar confirmación para cada receta.

### 17.7 Teleconsulta y entrega de receta

En consulta en línea se ofrecen rutas según configuración y normativa aplicable:

- Firma digital/electrónica y entrega segura del documento electrónico.
- Impresión y firma autógrafa por el médico, seguida de entrega física, recolección o mensajería autorizada.
- Impresión de una copia informativa claramente identificada cuando el original deba entregarse por otra vía.

No debe asumirse que una fotografía o escaneo de una receta autógrafa sustituye al original para todos los medicamentos o escenarios. Los medicamentos sujetos a control requieren flujos y validaciones regulatorias específicos.

### 17.8 Cancelación, sustitución y reimpresión

- Un documento emitido no se sobrescribe.
- `Cancelar` exige motivo y permiso.
- `Sustituir` crea una receta nueva enlazada con la anterior.
- La reimpresión muestra el mismo folio y número de copia o la política institucional definida.
- El paciente y los usuarios autorizados deben ver el estado vigente.

---

## 18. Nota clínica, cierre y adendas

La receta y la nota son documentos relacionados, pero su firma no debe modelarse como si fuera exactamente el mismo proceso.

### 18.1 Cierre de nota

Antes de cerrar:

- Mostrar resumen completo.
- Señalar campos obligatorios faltantes.
- Mostrar sugerencias de IA todavía no resueltas.
- Confirmar diagnósticos y plan.
- Confirmar modalidad y limitaciones de teleconsulta.
- Guardar autoría, fecha y hora.

### 18.2 Documento cerrado

- No se edita silenciosamente.
- Los cambios posteriores se realizan mediante adenda.
- La adenda contiene autor, momento, motivo y referencia al documento original.
- La firma o cierre de la nota se configura según las obligaciones aplicables a la institución.

### 18.3 Independencia de la receta

- La receta puede prepararse durante la consulta.
- Debe estar clínicamente validada antes de producir una versión definitiva.
- Para la ruta impresa, el sistema genera el documento y la firma autógrafa ocurre después.
- Para la ruta electrónica, el sistema aplica la firma antes de emitir el archivo firmado.
- Cerrar la nota no equivale por sí solo a confirmar que una receta impresa ya fue firmada a mano.

---

## 19. Estados y máquinas de transición

### 19.1 Consulta

```text
Programada → En espera → En curso → En revisión → Cerrada
                   ↘ Cancelada      ↘ Borrador recuperable
Cerrada → Adenda
```

### 19.2 Sugerencia de IA

```text
Generada → Vista → Aceptada
                 ↘ Editada y aceptada
                 ↘ Descartada
                 ↘ Expirada por cambio de contexto
```

### 19.3 Receta

```text
Borrador
  ↓
Validada por el médico
  ↓
Lista para emisión
  ├── Imprimir y firmar a mano
  │      ↓
  │   Impresa — pendiente de firma autógrafa
  │      ↓ confirmación manual
  │   Firmada y entregada
  │
  └── Firma digital/electrónica
         ↓
      Firmada electrónicamente
         ↓
      Emitida
```

Desde estados emitidos pueden existir `Reimpresa`, `Cancelada` o `Sustituida`, siempre con auditoría.

### 19.4 Restricciones de transición

- No pasar de `Borrador` a una emisión definitiva con datos obligatorios incompletos.
- No llamar `Firmada autógrafamente` a una receta sólo porque fue impresa.
- No llamar `Firmada digitalmente` a un documento que sólo contiene una imagen no verificada.
- No modificar una receta emitida; sustituirla.
- No permitir que la IA cambie estados de firma o emisión.

---

## 20. UX de consulta presencial

### Escritorio

```text
┌──────────────────────────────────────────────────────────────────┐
│ Paciente · alertas · alergias · modalidad · cronómetro          │
├──────────────┬──────────────────────────────┬────────────────────┤
│ Navegación   │ Formulario clínico           │ Copiloto IA        │
│ 18–20 %      │ 52–58 %                      │ 24–28 %            │
│              │                              │                    │
│ Antecedentes │ Sección activa               │ Resumen            │
│ Padecimiento │ Captura estructurada         │ Pendientes         │
│ Exploración  │ y narrativa                  │ Alertas             │
│ Evaluación   │                              │ Hipótesis           │
│ Plan/Receta  │                              │ Borrador de nota    │
├──────────────┴──────────────────────────────┴────────────────────┤
│ Guardado · Volver · Revisar consulta · Finalizar                 │
└──────────────────────────────────────────────────────────────────┘
```

### Comportamiento

- Panel de IA redimensionable y plegable.
- Navegación muestra avance sin obligar a un orden absoluto.
- Guardado automático con indicador legible.
- Atajos de teclado para usuarios frecuentes.
- Evitar modales que cubran información clínica esencial.

---

## 21. UX de teleconsulta

La videollamada no debe colocarse encima del formulario ni relegarse a una miniatura inútil. Se requiere una distribución adaptable.

### 21.1 Pantalla amplia

```text
┌──────────────────────────────────────────────────────────────────┐
│ Paciente · ubicación · conexión · alertas · tiempo               │
├────────────────────┬──────────────────────────┬──────────────────┤
│ Videollamada       │ Consulta                 │ IA               │
│ 30 %               │ 46 %                     │ 24 %             │
│                    │                          │                  │
│ video del paciente │ sección clínica activa  │ pendientes       │
│ video del médico   │ y documentos            │ resumen/alertas  │
│ audio/conexión     │                          │                  │
├────────────────────┴──────────────────────────┴──────────────────┤
│ Micrófono · Cámara · Compartir · Pausar IA · Finalizar           │
└──────────────────────────────────────────────────────────────────┘
```

### 21.2 Modo enfoque clínico

Al redactar evaluación o receta:

- Video se reduce a una columna de 22–25 %.
- Formulario ocupa 50–56 %.
- IA mantiene 22–25 % o se pliega.
- Un clic restaura el video grande.

### 21.3 Pantalla mediana

- Video fijo en la parte superior o lateral.
- Consulta como panel principal.
- IA en cajón lateral deslizable.
- Alertas críticas permanecen visibles aunque el panel de IA esté cerrado.

### 21.4 Móvil o tableta pequeña

- Una tarea principal por pantalla.
- Video flotante movible.
- Pestañas `Consulta`, `Video` e `IA`.
- Acceso inmediato a silenciar, cámara y emergencia.
- La emisión de receta requiere revisión en pantalla completa.

### 21.5 Contingencias

- Si falla el video, registrar cambio de modalidad.
- Mostrar teléfono de respaldo autorizado.
- Guardar el borrador sin cerrar la nota.
- Si el cuadro no es adecuado para atención remota, mostrar flujo de referencia presencial o urgente.
- No grabar la videollamada por defecto.

---

## 22. Componentes de interfaz

### 22.1 Panel de IA

Pestañas sugeridas:

- `Resumen`.
- `Pendientes`.
- `Seguridad`.
- `Diagnóstico`.
- `Nota`.

### 22.2 Indicadores de procedencia

Usar etiquetas consistentes:

- `Expediente`.
- `Paciente`.
- `Capturado hoy`.
- `Transcripción`.
- `Sugerido por IA`.
- `Confirmado por médico`.

El color nunca será el único indicador.

### 22.3 Acciones masivas

Se puede aceptar un resumen por sección, pero los elementos de alto riesgo —alergias, diagnósticos, medicamentos, dosis y signos de alarma— requieren confirmación individual.

### 22.4 Prevención de clics accidentales

- `Cerrar nota`, `Emitir`, `Firmar` y `Cancelar` no deben estar juntos ni verse iguales.
- Vista previa obligatoria antes de emisión.
- Confirmación reforzada para firma digital.
- Para imprimir, confirmación explícita del método autógrafo; no confirmación de una firma que aún no ocurrió.

---

## 23. Arquitectura funcional propuesta

```text
Aplicación web/móvil
        ↓
Capa de identidad y permisos
        ↓
API clínica y orquestador de consulta
 ├── Pacientes y expedientes
 ├── Notas y antecedentes
 ├── Agenda/teleconsulta
 ├── Medicación y recetas
 ├── Documentos y firmas
 ├── Consentimientos
 └── Auditoría
        ↓
Capa de IA aislada
 ├── Redacción estructurada
 ├── Detección de pendientes
 ├── Seguridad clínica
 ├── Hipótesis explicables
 └── Evaluación y monitoreo
        ↓
Almacenamiento cifrado y servicios de interoperabilidad
```

### Separaciones importantes

- El motor de IA no escribe directamente en la base clínica definitiva.
- El servicio de firma no comparte llaves privadas con el modelo de IA.
- El generador de PDF usa una versión inmutable de la receta.
- El servicio de impresión recibe sólo el documento autorizado.
- Audio y transcripción tienen políticas separadas del expediente.

---

## 24. Modelo de datos esencial

### Paciente

- `patient_id`.
- Identificadores y datos demográficos.
- Contacto.
- Alertas.
- Consentimientos.

### Antecedente

- `history_item_id`.
- Categoría y subtipo.
- Familiar relacionado si aplica.
- Valor estructurado.
- Texto complementario.
- Estado: presente, negado, desconocido, no investigado.
- Fuente, autor y fecha de verificación.

### Consulta

- `encounter_id`.
- Paciente, profesional y sede.
- Modalidad.
- Inicio y cierre.
- Secciones clínicas.
- Estado.
- Versiones y adendas.

### Sugerencia de IA

- `suggestion_id`.
- Consulta y sección.
- Tipo.
- Contenido.
- Evidencia o campos fuente.
- Modelo y versión.
- Fecha.
- Decisión del usuario.
- Texto final aceptado, si cambió.

### Receta

- `prescription_id` y folio visible.
- Consulta y paciente.
- Profesional responsable.
- Versión.
- Medicamentos.
- Estado clínico.
- Método de firma: `pendiente`, `autografa_post_impresion`, `digital_electronica`.
- Estado de firma.
- Huella del documento.
- Emisiones y reimpresiones.
- Cancelación o sustitución.

### Evento de documento

- Documento y versión.
- Acción: vista previa, finalización, impresión, firma, descarga, envío, reimpresión, cancelación.
- Usuario, fecha y dispositivo.
- Resultado.
- Motivo cuando corresponda.

---

## 25. API y eventos sugeridos

Ejemplos conceptuales, no contratos definitivos:

```text
POST /encounters
PATCH /encounters/{id}/sections/{section}
POST /encounters/{id}/ai-suggestions
POST /ai-suggestions/{id}/accept
POST /ai-suggestions/{id}/reject
POST /encounters/{id}/clinical-review
POST /prescriptions
POST /prescriptions/{id}/validate
POST /prescriptions/{id}/finalize
POST /prescriptions/{id}/issue-for-handwritten-signature
POST /prescriptions/{id}/apply-electronic-signature
POST /prescriptions/{id}/mark-handwritten-signed-and-delivered
POST /prescriptions/{id}/reprint
POST /prescriptions/{id}/cancel
POST /encounters/{id}/close
POST /encounters/{id}/addenda
```

### Idempotencia

Las operaciones de firma, impresión, emisión y cancelación deben usar claves de idempotencia para evitar documentos duplicados por doble clic o reconexión.

### Eventos de dominio

```text
EncounterStarted
PatientHistoryConfirmed
AISuggestionCreated
AISuggestionResolved
ClinicalReviewCompleted
PrescriptionValidated
PrescriptionFinalized
PrescriptionIssuedForHandwrittenSignature
PrescriptionPrinted
PrescriptionHandwrittenDeliveryConfirmed
PrescriptionElectronicallySigned
PrescriptionReprinted
PrescriptionCancelled
EncounterClosed
AddendumCreated
```

---

## 26. Prompt maestro para la IA clínica

Este prompt es una base funcional. Debe complementarse con políticas, fuentes clínicas, pruebas y controles técnicos.

```text
ROL
Eres un asistente de documentación y apoyo a la decisión clínica. Ayudas al
profesional a organizar la información de la consulta, identificar datos
faltantes, redactar borradores y presentar hipótesis explicables.

AUTORIDAD
El profesional de la salud conserva toda decisión clínica. No confirmes un
diagnóstico, no prescribas de forma autónoma, no firmes, no emitas documentos
y no representes que una sugerencia fue aceptada si el profesional no lo hizo.

FUENTES
Usa únicamente la información autorizada de la consulta activa y las fuentes
clínicas configuradas. Distingue hechos documentados, afirmaciones del paciente,
datos históricos, hallazgos del profesional e inferencias. No inventes datos.

DOCUMENTACIÓN
Genera contenido en una capa de borrador. Para cada dato importante indica su
procedencia. Si existen contradicciones, muéstralas. Si falta información,
formula preguntas breves y priorizadas. Nunca cambies silenciosamente el
expediente definitivo.

SEGURIDAD
Destaca primero signos de alarma y posibles situaciones urgentes. Explica la
razón de la alerta. Si el contexto es insuficiente, dilo expresamente. No
presentes las comprobaciones de alergias, interacciones o dosis como garantía
absoluta.

IMPRESIÓN DIAGNÓSTICA
Presenta varias hipótesis razonables cuando proceda. Para cada una muestra datos
a favor, datos en contra o ausentes, preguntas discriminantes y nivel de
incertidumbre. Nombra la salida "hipótesis para revisión" o "impresión
diagnóstica asistida". El diagnóstico final corresponde al profesional.

PLAN Y RECETA
Sólo prepara un borrador de receta a partir de decisiones que el profesional
haya confirmado. No completes dosis, vía, frecuencia o duración mediante una
suposición. Señala datos faltantes y posibles conflictos para revisión.

FIRMA Y EMISIÓN DE RECETA
Existen dos rutas válidas:
1) imprimir la receta definitiva y firmarla de manera autógrafa después de la
   impresión; esta ruta no requiere firma digital;
2) aplicar una firma digital o electrónica dentro de la plataforma, de forma
   opcional, mediante el mecanismo institucional configurado.

Nunca bloquees la impresión por ausencia de firma digital cuando el profesional
haya elegido la ruta de firma autógrafa. Antes de generar la versión definitiva,
sí exige que el contenido haya sido revisado y esté completo. En la ruta impresa,
el documento debe incluir espacio para la firma y recordar que debe firmarse a
mano antes de entregarse. No afirmes que una receta impresa ya está firmada.

Una imagen insertada de una firma no debe describirse como firma digital
criptográfica. La IA no puede seleccionar el método, aplicar la firma, confirmar
la entrega ni cambiar el estado de emisión.

TELECONSULTA
Distingue observación por video, maniobras guiadas, mediciones aportadas por el
paciente y elementos no evaluables a distancia. No redactes hallazgos de una
exploración presencial que no ocurrió. Señala cuándo la limitación de la
modalidad amerita valoración presencial o urgente.

FORMATO DE RESPUESTA
Devuelve secciones estructuradas:
- resumen actualizado;
- datos faltantes priorizados;
- inconsistencias;
- alertas de seguridad;
- hipótesis para revisión con explicación;
- borrador de nota;
- posibles elementos del plan ya confirmados;
- borrador de receta incompleto cuando falten datos.

Para cada sugerencia incluye su evidencia y permite aceptar, editar o descartar.
```

### Prompt específico para generación de documentos

```text
Genera exactamente la versión aprobada de la receta. No agregues medicamentos,
dosis ni indicaciones. Si el método es AUTOGRAFA_POST_IMPRESION, crea el PDF con
folio, datos obligatorios, espacio visible para firma y la leyenda operativa
"Firmar a mano antes de entregar"; no solicites ni incrustes firma digital. Si el
método es DIGITAL_ELECTRONICA, envía el documento inmutable al servicio de firma;
no simules la firma desde el modelo. Devuelve errores de datos como bloqueos
explícitos y no completes campos por inferencia.
```

---

## 27. Reglas de automatización

### Permitido automáticamente

- Guardar borrador.
- Actualizar el resumen de IA.
- Señalar un campo faltante.
- Ordenar cronológicamente.
- Calcular valores determinísticos, mostrando fórmula y unidades.
- Preparar una vista previa.
- Recordar la preferencia de firma sin ejecutarla.

### Requiere confirmación del médico

- Incorporar antecedentes nuevos.
- Aceptar texto generado.
- Seleccionar diagnóstico.
- Ordenar estudios.
- Añadir medicamentos.
- Finalizar una receta.
- Elegir método de firma.
- Imprimir la versión definitiva.
- Aplicar firma digital/electrónica.
- Marcar una receta autógrafa como firmada y entregada.
- Cerrar nota.

### Prohibido para la IA

- Ocultar una alerta.
- Inventar un hallazgo.
- Firmar por el profesional.
- Emitir una receta sin acción humana.
- Marcar como autógrafa una firma no observada.
- Acceder a otro expediente sin autorización.
- Usar datos clínicos para entrenar modelos fuera de las bases consentidas y contratadas.

---

## 28. Privacidad y consentimiento

### 28.1 Datos de salud

Tratar toda la información clínica como sensible y aplicar:

- Finalidad definida.
- Minimización.
- Consentimientos y avisos de privacidad adecuados.
- Acceso por rol y relación asistencial.
- Cifrado en tránsito y reposo.
- Registro de accesos y exportaciones.
- Retención y eliminación conforme a obligaciones aplicables.
- Proceso para derechos de los titulares y atención de incidentes.

### 28.2 Consentimiento para IA ambiental

Debe ser independiente de aceptar atención médica. Debe explicar:

- Qué se capta.
- Para qué se usa.
- Si se almacena audio.
- Cuánto tiempo se conserva.
- Quién procesa la información.
- Cómo se pausa o retira el consentimiento.
- Qué alternativa existe sin transcripción ambiental.

### 28.3 Proveedores de IA

- Contratos y ubicación de procesamiento.
- Prohibición de entrenamiento no autorizado.
- Controles de subencargados.
- Redacción o seudonimización cuando sea apropiada.
- Evaluación periódica de seguridad.

---

## 29. Seguridad técnica

- Autenticación multifactor para profesionales.
- Sesiones cortas y bloqueo por inactividad.
- Principio de menor privilegio.
- Separación por institución y sede.
- Cifrado administrado y rotación de llaves.
- Bitácora inmutable o con protección contra manipulación.
- Detección de descargas anómalas.
- Copias de seguridad probadas.
- Plan de continuidad y recuperación.
- Gestión de vulnerabilidades.
- Pruebas de penetración.
- Inventario de integraciones.
- Firma de URLs temporales para documentos.
- Secretos y certificados fuera del código.
- Autenticación reforzada al firmar digitalmente.

### Huella documental

Cada receta definitiva debe tener una huella criptográfica de su contenido. La impresión autógrafa conserva esa versión exacta; la firma electrónica debe vincularse con esa misma huella.

---

## 30. Auditoría

Registrar, como mínimo:

- Usuario y rol.
- Paciente y consulta.
- Acción.
- Fecha y hora confiables.
- Resultado.
- Campos modificados, sin exponer innecesariamente el valor en registros técnicos.
- Sugerencias de IA aceptadas o descartadas.
- Versión del modelo.
- Método de firma elegido.
- Generación, impresión, firma electrónica, descarga, envío, reimpresión y cancelación.
- Confirmación manual de firma autógrafa y entrega, identificándola como declaración del usuario.

La bitácora no debe permitir que un usuario borre sus propios eventos.

---

## 31. Accesibilidad y usabilidad

- Navegación completa por teclado.
- Foco visible.
- Etiquetas asociadas a campos.
- Contraste suficiente.
- No depender sólo de color.
- Mensajes de error junto al campo y resumen general.
- Tamaños táctiles adecuados.
- Subtítulos o transcripción en teleconsulta cuando sea posible y consentido.
- Preferencias de texto y densidad.
- Lenguaje comprensible para el paciente.
- Compatibilidad con tecnologías de asistencia.

---

## 32. Manejo de errores y casos límite

### Conectividad intermitente

- Guardado local cifrado y sincronización segura, si la arquitectura lo permite.
- Indicador `Sin conexión`.
- No duplicar firma ni emisión al reconectar.
- Bloquear una emisión si no puede verificarse el folio o guardar la auditoría.

### Sesión expirada

- Conservar el borrador de forma segura.
- Reautenticar antes de cerrar, firmar o emitir.

### Cambio de paciente

- Cancelar solicitudes de IA en curso.
- Limpiar contexto temporal.
- Confirmar antes de abandonar contenido no guardado.

### Error de impresión

- La generación del PDF no equivale necesariamente a impresión física.
- Permitir reintento sin crear otra receta.
- Registrar cada intento y el resultado conocido.
- Si se genera una nueva versión, usar un evento y folio según política institucional.

### Firma digital no disponible

- Ofrecer la ruta `Imprimir y firmar a mano` cuando sea legal y operativamente aplicable.
- No perder el contenido revisado.
- Mostrar el motivo técnico sin presentar la receta como ya firmada.

### Error después de emitir

- No editar el archivo original.
- Cancelar o sustituir con motivo.
- Conservar relación entre versiones.

---

## 33. Criterios de aceptación

### Consulta y antecedentes

- El médico puede completar una consulta de inicio a fin sin duplicar datos.
- Los antecedentes heredofamiliares distinguen presente, negado, desconocido y no investigado.
- Cada actualización conserva fuente, autor y fecha.
- Las alergias críticas permanecen visibles.

### IA

- La IA trabaja en una capa de borrador.
- Toda sugerencia importante muestra procedencia.
- El usuario puede aceptar, editar o descartar.
- Una sugerencia descartada no reaparece sin nueva evidencia.
- La IA no firma, prescribe ni emite.
- El diagnóstico final requiere acción explícita del profesional.

### Teleconsulta

- En escritorio son utilizables simultáneamente video, consulta e IA.
- El médico puede plegar IA y ampliar video o formulario.
- La nota diferencia hallazgos remotos y limitaciones.
- Una caída de conexión no destruye el borrador.

### Receta

- Una receta incompleta no puede producirse como versión definitiva.
- La plataforma ofrece claramente las dos rutas de firma.
- El médico puede imprimir la receta definitiva **sin configurar ni aplicar firma digital**.
- La versión impresa contiene un espacio para firma autógrafa.
- Antes de imprimir se recuerda firmar a mano antes de entregar.
- Imprimir no cambia automáticamente el estado a `Firmada autógrafamente`.
- La confirmación `Firmada y entregada` queda identificada como registro manual.
- La firma digital/electrónica es opcional y requiere autenticación reforzada.
- Una receta firmada electrónicamente no puede modificarse.
- Reimpresiones, cancelaciones y sustituciones quedan auditadas.
- La IA no puede elegir el método de firma.

### Seguridad

- Un usuario sin permiso no puede consultar, imprimir ni descargar una receta.
- Cada acceso y emisión queda registrado.
- Cambiar de paciente elimina el contexto de IA anterior.
- Las operaciones repetidas no crean firmas o recetas duplicadas.

---

## 34. Pruebas específicas de la corrección de firma

### Escenario A: impresión sin firma digital

```gherkin
Dado que el médico validó una receta completa
Y no tiene una firma digital configurada
Cuando elige "Imprimir y firmar a mano"
Entonces la plataforma genera el PDF definitivo
Y el PDF incluye un espacio para firma autógrafa
Y la plataforma no solicita configurar una firma digital
Y el estado queda "Impresa — pendiente de firma autógrafa"
```

### Escenario B: confirmación posterior

```gherkin
Dado que la receta fue impresa para firma autógrafa
Cuando el médico confirma "Firmada y entregada"
Entonces la plataforma registra usuario, fecha y hora
Y muestra que se trata de una confirmación manual
Y no altera la versión del documento
```

### Escenario C: firma digital opcional

```gherkin
Dado que la institución tiene un mecanismo electrónico configurado
Y el médico validó la receta
Cuando elige "Firmar digitalmente"
Entonces la plataforma solicita autenticación reforzada
Y firma la versión exacta e inmutable
Y genera evidencia verificable
Y registra el evento de firma
```

### Escenario D: cambio después de la vista previa

```gherkin
Dado que existe una vista previa definitiva
Cuando el médico vuelve a editar un medicamento
Entonces la vista previa anterior queda invalidada
Y debe realizarse una nueva validación
Y cualquier firma previa no se reutiliza
```

### Escenario E: imagen de firma

```gherkin
Dado que la institución permite insertar una imagen de firma
Cuando se genera el documento
Entonces la interfaz la describe de acuerdo con su naturaleza
Y no afirma que es una firma digital criptográfica
Y su uso depende de la política jurídica aprobada
```

---

## 35. Métricas de éxito

### Operativas

- Tiempo medio de documentación.
- Porcentaje de consultas cerradas el mismo día.
- Datos duplicados por consulta.
- Errores de receta detectados antes de emisión.
- Reimpresiones y sustituciones.
- Fallas de teleconsulta.

### De IA

- Tasa de aceptación y edición por tipo de sugerencia.
- Falsas alertas.
- Omisiones de alertas críticas en evaluación controlada.
- Contradicciones introducidas.
- Tiempo ahorrado sin pérdida de calidad.
- Diferencias de desempeño por edad, sexo, idioma y población pertinente.

### De experiencia

- Satisfacción del profesional.
- Satisfacción del paciente.
- Clics para completar una consulta.
- Porcentaje de uso de firma autógrafa y electrónica.
- Abandono en el paso de emisión.

Las métricas de velocidad nunca deben incentivar notas incompletas ni aceptación ciega de IA.

---

## 36. Roadmap recomendado

### Fase 1: expediente y consulta segura

- Pacientes, agenda y roles.
- Antecedentes completos.
- Consulta y nota de evolución.
- Receta en PDF.
- Ruta de impresión para firma autógrafa.
- Auditoría y cierre.

### Fase 2: copiloto visible — opción A

- Resumen automático.
- Detección de campos faltantes.
- Borrador de nota.
- Sugerencias explicables.
- Evaluaciones de seguridad.

### Fase 3: teleconsulta

- Video integrado.
- Diseño dividido adaptable.
- Consentimientos.
- Contingencias.
- Entrega segura de documentos.

### Fase 4: IA ambiental — opción B

- Transcripción consentida.
- Controles de pausa y eliminación.
- Separación por hablante.
- Extracción estructurada.
- Revisión comparativa con el audio cuando exista autorización.

### Fase 5: firma e interoperabilidad avanzada

- Firma digital/electrónica opcional.
- Verificación documental.
- Integraciones con laboratorios, imagen, farmacia y otros sistemas.
- Catálogos y estándares interoperables.

---

## 37. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Médico confía demasiado en IA | Explicaciones, incertidumbre, revisión obligatoria y capacitación |
| IA inventa datos | Capa de borrador, evidencia por campo y pruebas sistemáticas |
| Exceso de alertas | Priorización por gravedad y medición de falsas alertas |
| Captura ambiental no consentida | Consentimiento independiente e indicador permanente |
| Mezcla de expedientes | Banda de identidad, aislamiento de contexto y confirmaciones |
| Teleconsulta usada para un cuadro no adecuado | Triage, límites documentados y conversión a presencial/urgencias |
| Firma digital obligatoria innecesaria | Dos rutas explícitas; impresión con firma autógrafa posterior |
| Receta impresa marcada como firmada sin estarlo | Estado `Pendiente de firma autógrafa` y confirmación manual posterior |
| Imagen confundida con firma digital | Terminología y evidencia técnica diferenciadas |
| Documento alterado después de firma | Versiones inmutables y huellas criptográficas |
| Filtración de datos | Cifrado, mínimos privilegios, monitoreo y respuesta a incidentes |
| Incumplimiento local | Revisión sanitaria y jurídica antes de activar cada función |

---

## 38. Decisiones recomendadas

1. Implementar primero el copiloto visible de la opción A.
2. Tratar la opción B como función adicional con consentimiento y madurez operativa.
3. Mantener la IA fuera de la firma y la emisión.
4. Presentar hipótesis explicadas, no un diagnóstico autónomo.
5. Compartir una sola consulta clínica para modalidad presencial y en línea.
6. Usar pantalla dividida adaptable durante teleconsulta.
7. Mantener el borrador de IA separado del expediente oficial.
8. Implementar desde la primera versión la impresión para firma autógrafa.
9. Incorporar firma digital/electrónica como opción, no como requisito para imprimir.
10. Validar por separado los flujos de medicamentos controlados y documentos especiales.

---

## 39. Referencias normativas y de diseño

Para una implementación en México deben revisarse, entre otras disposiciones aplicables:

- [NOM-004-SSA3-2012, Del expediente clínico — Diario Oficial de la Federación](https://dof.gob.mx/normasOficiales/4909/SALUD/SALUD.html).
- [NOM-024-SSA3-2012, Sistemas de información de registro electrónico para la salud — Diario Oficial de la Federación](https://dof.gob.mx/normasOficiales/4956/SALUD1/SALUD1.html).
- [Ley General de Salud, texto vigente publicado por la Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf).
- [Reglamento de la Ley General de Salud en Materia de Prestación de Servicios de Atención Médica](https://www.diputados.gob.mx/LeyesBiblio/regley/Reg_LGS_MPSAM_170718.pdf). Su artículo 64 contempla para la receta la firma autógrafa o, si se cuenta con medios tecnológicos, firma digital o electrónica, además de otros datos requeridos.
- [Ley Federal de Protección de Datos Personales en Posesión de los Particulares, texto vigente](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf).

### Nota de cumplimiento

Estas referencias orientan el diseño, pero no sustituyen una matriz jurídica de requisitos. La institución debe verificar disposiciones federales y locales, reglas de receta por tipo de medicamento, conservación documental, firma utilizada, telemedicina, privacidad, avisos y consentimientos antes de salir a producción.

---

## 40. Resultado final esperado

El médico abre al paciente y recorre una consulta continua. Mientras captura o conversa —con consentimiento si hay transcripción— la IA prepara un borrador visible, detecta pendientes y presenta hipótesis explicables. El médico conserva el control, confirma la evaluación, define el plan y revisa la receta.

Al emitirla puede:

- **Imprimirla y firmarla a mano después**, sin necesitar firma digital; o
- **Firmarla digital/electrónicamente dentro de la plataforma**, si lo desea y el mecanismo está configurado.

La consulta puede ser presencial o en línea, con una distribución de pantalla que mantiene visibles al paciente, el expediente y la asistencia de IA. Todo cambio relevante, impresión, firma, emisión o decisión sobre una sugerencia queda trazado.
