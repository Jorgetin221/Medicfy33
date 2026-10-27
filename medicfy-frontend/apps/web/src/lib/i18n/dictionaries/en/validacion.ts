import type { validacion as es } from "../es/validacion";

// La clave es el mensaje español literal que emite @medicfy/contracts.
// Términos que NO se traducen: CURP y cédula profesional son
// documentos oficiales mexicanos sin equivalente en inglés, y FUM/FPP
// se expanden porque sus siglas no existen en inglés clínico.
export const validacion: typeof es = {
  "Agrega al menos una presentación.": "Add at least one presentation.",
  "CURP inválida.": "Invalid CURP.",
  "Un diagnóstico con código CIE-10 no lleva razón de ausencia de código.":
    "A diagnosis with an ICD-10 code doesn't take a missing-code reason.",
  "Captura la FUM, la FPP por ultrasonido, o ambas.":
    "Enter the last menstrual period, the ultrasound-estimated due date, or both.",
  "Clave de catálogo inválida.": "Invalid catalog key.",
  "Con estado activo o suspendido, cantidad y unidad/frecuencia son obligatorias.":
    "When the status is active or suspended, amount and unit/frequency are required.",
  "Confirma tu contraseña para cancelar.": "Confirm your password to cancel.",
  "Confirma tu contraseña para firmar.": "Confirm your password to sign.",
  "Debe ser un dígito del 1 al 9.": "Must be a digit from 1 to 9.",
  "Debes aceptar el aviso de privacidad.": "You must accept the privacy notice.",
  "Debes aceptar el tratamiento de datos sensibles de salud.":
    "You must consent to the processing of sensitive health data.",
  "Debes ser mayor de edad para registrarte por tu cuenta. Un adulto responsable puede darte de alta como paciente.":
    "You must be of legal age to register on your own. A responsible adult can register you as a patient.",
  "El análisis es obligatorio.": "The assessment is required.",
  "El contenido no puede estar vacío.": "Content cannot be empty.",
  "El código de verificación debe tener 6 dígitos.": "The verification code must be 6 digits.",
  "La fecha final debe ser posterior a la inicial.": "The end date must be after the start date.",
  "El rango de fechas no puede pasar de 60 días.": "The date range cannot exceed 60 days.",
  "La contraseña no puede pasar de 128 caracteres.": "The password cannot be longer than 128 characters.",
  "El código debe tener 6 dígitos.": "The code must be 6 digits.",
  "Escribe el código de 6 dígitos de tu app o un código de respaldo de 10 caracteres.":
    "Enter the 6-digit code from your app or a 10-character backup code.",
  "El diagnóstico es obligatorio.": "The diagnosis is required.",
  "El folio del recetario físico es obligatorio.": "The paper prescription pad number is required.",
  "El motivo de cancelación es obligatorio.": "A cancellation reason is required.",
  "El motivo de consulta debe tener al menos 3 caracteres.": "The reason for visit must be at least 3 characters.",
  "El motivo de rechazo es obligatorio y debe ser descriptivo.": "A rejection reason is required and must be descriptive.",
  "El motivo de solicitud es obligatorio.": "A reason for the request is required.",
  "Escribe el nombre del estudio (mínimo 3 caracteres).": "Type the study name (3 characters minimum).",
  "Cada estudio es del catálogo o escrito por el médico, no ambos.": "Each study is either from the catalog or typed in by the physician, not both.",
  "El nombre del analito es obligatorio.": "The analyte name is required.",
  "El nombre genérico debe tener al menos 2 caracteres.": "The generic name must be at least 2 characters.",
  "El padecimiento actual es obligatorio.": "The history of present illness is required.",
  "El plan es obligatorio.": "The plan is required.",
  "El precio debe ser un entero entre 1 y 99,999 MXN.": "The price must be a whole number between 1 and 99,999 MXN.",
  "Escribe el agente completo (mínimo 3 caracteres). Si no hay alergias, no captures una fila.":
    "Write out the full agent (3 characters minimum). If there are no allergies, don't add a row.",
  "Fecha de nacimiento fuera de rango (entre hoy y hace 120 años).":
    "Date of birth out of range (between today and 120 years ago).",
  "Fecha inválida — usa AAAA-MM-DD.": "Invalid date: use YYYY-MM-DD.",
  "Fecha inválida, usa formato YYYY-MM-DD.": "Invalid date, use the YYYY-MM-DD format.",
  "Hora inválida, usa formato HH:MM.": "Invalid time, use the HH:MM format.",
  "Ingresa un correo electrónico válido.": "Enter a valid email address.",
  "Ingresa un teléfono a 10 dígitos.": "Enter a 10-digit phone number.",
  "Justifica clínicamente (mínimo 15 caracteres) por qué procede a pesar de la alergia registrada.":
    "Give a clinical justification (15 characters minimum) for proceeding despite the recorded allergy.",
  "La biografía debe tener al menos 50 caracteres.": "The biography must be at least 50 characters.",
  "La biografía no puede incluir teléfono ni correo de contacto.":
    "The biography cannot include a contact phone number or email address.",
  "La biografía no puede superar 2,000 caracteres.": "The biography cannot exceed 2,000 characters.",
  "La cédula profesional debe tener 7 u 8 dígitos numéricos.":
    "The professional license (cédula profesional) must be 7 or 8 digits.",
  "La hora de inicio debe ser antes que la hora de fin.": "The start time must be before the end time.",
  "La indicación clínica es obligatoria.": "The clinical indication is required.",
  "La justificación debe ser descriptiva.": "The justification must be descriptive.",
  "La plantilla no puede estar vacía.": "The template cannot be empty.",
  "La unidad es obligatoria.": "The unit is required.",
  "Nunca se sugiere un solo diferencial: 0, o al menos 2.":
    "Never suggest a single differential: either none, or at least 2.",
  "Paciente menor de edad: se requiere registro de tutor.": "Patient is a minor: a guardian record is required.",
  "Ponle un nombre a la plantilla.": "Give the template a name.",
  "Se requiere al menos un diagnóstico con código CIE-10.": "At least one diagnosis with an ICD-10 code is required.",
  "Se requiere al menos un estudio.": "At least one study is required.",
  "Se requiere al menos un medicamento.": "At least one medication is required.",
  "Se requiere al menos una candidata.": "At least one candidate is required.",
  "Una candidata incluida necesita nombre, valor y unidad confirmados.":
    "An included candidate needs a confirmed name, value and unit.",
  "Usa al menos 8 caracteres (letras, números o símbolos).": "Use at least 8 characters (letters, numbers or symbols).",
  "Usa el formato YYYY-MM-DD.": "Use the YYYY-MM-DD format.",
  "familyRelationship es obligatorio para category=HEREDOFAMILIAR.":
    "familyRelationship is required when category=HEREDOFAMILIAR.",
  "familyRelationship solo aplica a category=HEREDOFAMILIAR.":
    "familyRelationship only applies to category=HEREDOFAMILIAR.",
  "startAt debe ser antes que endAt.": "startAt must be before endAt.",
};
