// Mensajes de validación de formulario.
//
// La fuente de verdad son los esquemas Zod de `@medicfy/contracts`,
// que están duplicados a mano entre este repo y medicfy-backend y que
// el servidor también usa para validar. Cambiarlos para que emitieran
// claves en vez de texto habría obligado a tocar las dos copias y la
// validación del backend a la vez, así que el español de aquí es una
// COPIA EXACTA del mensaje que emite el contrato, y la traducción se
// hace al vuelo al pintar el error (lib/i18n/validation.ts).
//
// Si cambias un mensaje en packages/contracts, cámbialo aquí también:
// la clave es el texto español literal. Un mensaje sin entrada no
// rompe nada — se muestra en español.
export const validacion = {
  "Agrega al menos una presentación.": "Agrega al menos una presentación.",
  "CURP inválida.": "CURP inválida.",
  "Un diagnóstico con código CIE-10 no lleva razón de ausencia de código.":
    "Un diagnóstico con código CIE-10 no lleva razón de ausencia de código.",
  "Captura la FUM, la FPP por ultrasonido, o ambas.": "Captura la FUM, la FPP por ultrasonido, o ambas.",
  "Clave de catálogo inválida.": "Clave de catálogo inválida.",
  "Con estado activo o suspendido, cantidad y unidad/frecuencia son obligatorias.":
    "Con estado activo o suspendido, cantidad y unidad/frecuencia son obligatorias.",
  "Confirma tu contraseña para cancelar.": "Confirma tu contraseña para cancelar.",
  "Confirma tu contraseña para firmar.": "Confirma tu contraseña para firmar.",
  "Debe ser un dígito del 1 al 9.": "Debe ser un dígito del 1 al 9.",
  "Debes aceptar el aviso de privacidad.": "Debes aceptar el aviso de privacidad.",
  "Debes aceptar el tratamiento de datos sensibles de salud.": "Debes aceptar el tratamiento de datos sensibles de salud.",
  "Debes ser mayor de edad para registrarte por tu cuenta. Un adulto responsable puede darte de alta como paciente.":
    "Debes ser mayor de edad para registrarte por tu cuenta. Un adulto responsable puede darte de alta como paciente.",
  "El análisis es obligatorio.": "El análisis es obligatorio.",
  "El contenido no puede estar vacío.": "El contenido no puede estar vacío.",
  "El código de verificación debe tener 6 dígitos.": "El código de verificación debe tener 6 dígitos.",
  "La fecha final debe ser posterior a la inicial.": "La fecha final debe ser posterior a la inicial.",
  "El rango de fechas no puede pasar de 60 días.": "El rango de fechas no puede pasar de 60 días.",
  "La contraseña no puede pasar de 128 caracteres.": "La contraseña no puede pasar de 128 caracteres.",
  "El código debe tener 6 dígitos.": "El código debe tener 6 dígitos.",
  "Escribe el código de 6 dígitos de tu app o un código de respaldo de 10 caracteres.":
    "Escribe el código de 6 dígitos de tu app o un código de respaldo de 10 caracteres.",
  "El diagnóstico es obligatorio.": "El diagnóstico es obligatorio.",
  "El folio del recetario físico es obligatorio.": "El folio del recetario físico es obligatorio.",
  "El motivo de cancelación es obligatorio.": "El motivo de cancelación es obligatorio.",
  "El motivo de consulta debe tener al menos 3 caracteres.": "El motivo de consulta debe tener al menos 3 caracteres.",
  "El motivo de rechazo es obligatorio y debe ser descriptivo.": "El motivo de rechazo es obligatorio y debe ser descriptivo.",
  "El motivo de solicitud es obligatorio.": "El motivo de solicitud es obligatorio.",
  "Escribe el nombre del estudio (mínimo 3 caracteres).": "Escribe el nombre del estudio (mínimo 3 caracteres).",
  "Cada estudio es del catálogo o escrito por el médico, no ambos.": "Cada estudio es del catálogo o escrito por el médico, no ambos.",
  "El nombre del analito es obligatorio.": "El nombre del analito es obligatorio.",
  "El nombre genérico debe tener al menos 2 caracteres.": "El nombre genérico debe tener al menos 2 caracteres.",
  "El padecimiento actual es obligatorio.": "El padecimiento actual es obligatorio.",
  "El plan es obligatorio.": "El plan es obligatorio.",
  "El precio debe ser un entero entre 1 y 99,999 MXN.": "El precio debe ser un entero entre 1 y 99,999 MXN.",
  "Escribe el agente completo (mínimo 3 caracteres). Si no hay alergias, no captures una fila.":
    "Escribe el agente completo (mínimo 3 caracteres). Si no hay alergias, no captures una fila.",
  "Fecha de nacimiento fuera de rango (entre hoy y hace 120 años).": "Fecha de nacimiento fuera de rango (entre hoy y hace 120 años).",
  "Fecha inválida — usa AAAA-MM-DD.": "Fecha inválida: usa AAAA-MM-DD.",
  "Fecha inválida, usa formato YYYY-MM-DD.": "Fecha inválida, usa formato YYYY-MM-DD.",
  "Hora inválida, usa formato HH:MM.": "Hora inválida, usa formato HH:MM.",
  "Ingresa un correo electrónico válido.": "Ingresa un correo electrónico válido.",
  "Ingresa un teléfono a 10 dígitos.": "Ingresa un teléfono a 10 dígitos.",
  "Justifica clínicamente (mínimo 15 caracteres) por qué procede a pesar de la alergia registrada.":
    "Justifica clínicamente (mínimo 15 caracteres) por qué procede a pesar de la alergia registrada.",
  "La biografía debe tener al menos 50 caracteres.": "La biografía debe tener al menos 50 caracteres.",
  "La biografía no puede incluir teléfono ni correo de contacto.": "La biografía no puede incluir teléfono ni correo de contacto.",
  "La biografía no puede superar 2,000 caracteres.": "La biografía no puede superar 2,000 caracteres.",
  "La cédula profesional debe tener 7 u 8 dígitos numéricos.": "La cédula profesional debe tener 7 u 8 dígitos numéricos.",
  "La hora de inicio debe ser antes que la hora de fin.": "La hora de inicio debe ser antes que la hora de fin.",
  "La indicación clínica es obligatoria.": "La indicación clínica es obligatoria.",
  "La justificación debe ser descriptiva.": "La justificación debe ser descriptiva.",
  "La plantilla no puede estar vacía.": "La plantilla no puede estar vacía.",
  "La unidad es obligatoria.": "La unidad es obligatoria.",
  "Nunca se sugiere un solo diferencial: 0, o al menos 2.": "Nunca se sugiere un solo diferencial: 0, o al menos 2.",
  "Paciente menor de edad: se requiere registro de tutor.": "Paciente menor de edad: se requiere registro de tutor.",
  "Ponle un nombre a la plantilla.": "Ponle un nombre a la plantilla.",
  "Se requiere al menos un diagnóstico con código CIE-10.": "Se requiere al menos un diagnóstico con código CIE-10.",
  "Se requiere al menos un estudio.": "Se requiere al menos un estudio.",
  "Se requiere al menos un medicamento.": "Se requiere al menos un medicamento.",
  "Se requiere al menos una candidata.": "Se requiere al menos una candidata.",
  "Una candidata incluida necesita nombre, valor y unidad confirmados.": "Una candidata incluida necesita nombre, valor y unidad confirmados.",
  "Usa al menos 8 caracteres (letras, números o símbolos).": "Usa al menos 8 caracteres (letras, números o símbolos).",
  "Usa el formato YYYY-MM-DD.": "Usa el formato YYYY-MM-DD.",
  "familyRelationship es obligatorio para category=HEREDOFAMILIAR.": "familyRelationship es obligatorio para category=HEREDOFAMILIAR.",
  "familyRelationship solo aplica a category=HEREDOFAMILIAR.": "familyRelationship solo aplica a category=HEREDOFAMILIAR.",
  "startAt debe ser antes que endAt.": "startAt debe ser antes que endAt.",
};
