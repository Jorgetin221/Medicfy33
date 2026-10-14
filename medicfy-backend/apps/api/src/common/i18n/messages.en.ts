// Traducción al inglés de los mensajes de error que viajan al cliente.
//
// La CLAVE es el mensaje español literal que lanza `new ApiException`.
// Se traduce en el filtro de excepciones (common/api-exception.filter.ts),
// no en cada servicio: así la lógica de negocio se queda escrita en un
// solo idioma y no hay 149 archivos que mantener sincronizados.
//
// Un mensaje sin entrada aquí sale en español. messages.spec.ts falla
// si alguien agrega un ApiException nuevo y olvida traducirlo, así que
// esta tabla no se queda atrás en silencio.
//
// NO se traduce nada de lo que se PERSISTE ni de lo que se IMPRIME:
// expediente, receta, orden de laboratorio y audit_log siguen en
// español por obligación legal (NOM-004, art. 33 del Reglamento de
// Insumos para la Salud; CLAUDE.md R6).
export const MESSAGES_EN: Record<string, string> = {
  "Alergia no encontrada.": "Allergy not found.",
  "Analito no encontrado.": "Analyte not found.",
  "Antecedente no encontrado.": "History item not found.",
  "Archivo no encontrado.": "File not found.",
  "Cada estudio lleva su motivo del catálogo (diagnóstico inicial, control, tamizaje, preoperatorio, urgencia) — sin motivo, la orden no se emite.":
    "Every study carries its reason from the catalog (initial diagnosis, monitoring, screening, preoperative, urgent) — without a reason, the order is not issued.",
  "Canal inválido. Usa EMAIL o WHATSAPP.": "Invalid channel. Use EMAIL or WHATSAPP.",
  "Candidata no encontrada.": "Candidate not found.",
  "Captura la FUM o la FPP por ultrasonido.": "Enter the last menstrual period or the ultrasound-estimated due date.",
  "Cita no encontrada.": "Appointment not found.",
  "Consultorio no encontrado.": "Practice location not found.",
  "Contraseña incorrecta.": "Incorrect password.",
  "Código de verificación inválido.": "Invalid verification code.",
  "Código inválido o expirado.": "Invalid or expired code.",
  "Código inválido.": "Invalid code.",
  "Datos de entrada inválidos.": "Invalid input data.",
  "Debes adjuntar un archivo.": "You must attach a file.",
  "Debes tener la verificación en dos pasos activada para firmar documentos clínicos.":
    "You must have two-step verification enabled to sign clinical documents.",
  "Diagnóstico no encontrado para este paciente.": "Diagnosis not found for this patient.",
  "Documento no encontrado.": "Document not found.",
  "El bloque gineco-obstétrico no está habilitado para este paciente — habilítalo explícitamente primero.":
    "The obstetric and gynecologic block is not enabled for this patient — enable it explicitly first.",
  "El encuentro a ligar no existe o no pertenece a este paciente.":
    "The encounter to link does not exist or does not belong to this patient.",
  "El encuentro clínico no existe.": "The clinical encounter does not exist.",
  "El enlace del documento venció o no es válido — pide uno nuevo.":
    "The document link has expired or is not valid — request a new one.",
  "El medicamento anclado no existe en el catálogo.": "The anchored medication does not exist in the catalog.",
  "El paciente de la ruta no coincide con el del cuerpo.": "The patient in the route does not match the one in the body.",
  "El paciente tiene una alergia registrada a uno de estos medicamentos. El bloqueo solo se libera capturando una justificación clínica, que queda registrada y firmada en el expediente.":
    "The patient has a recorded allergy to one of these medications. The block is only lifted by entering a clinical justification, which is recorded and signed into the patient's record.",
  "El registro de embarazo requiere sexo al nacer F.": "Recording a pregnancy requires sex at birth F.",
  "El término destino debe estar activo — no se puede fusionar hacia un término obsoleto o ya fusionado.":
    "The target term must be active — you cannot merge into an obsolete or already merged term.",
  "El término destino debe existir, estar activo y ser del mismo dominio que la solicitud.":
    "The target term must exist, be active, and belong to the same domain as the request.",
  "Embarazo no encontrado para esta paciente.": "Pregnancy not found for this patient.",
  "Encuentro no encontrado.": "Encounter not found.",
  "Enlace inválido o expirado.": "Invalid or expired link.",
  "Especialidad no encontrada en el catálogo.": "Specialty not found in the catalog.",
  "Esta cita cambió de estado antes de poder reagendarla.":
    "This appointment changed status before it could be rescheduled.",
  "Esta cita no se puede reagendar en su estado actual.": "This appointment cannot be rescheduled in its current status.",
  "Esta cita ya alcanzó el máximo de reagendas (2).": "This appointment has reached the maximum number of reschedules (2).",
  "Esta cédula profesional ya está registrada en otra cuenta.":
    "This professional license is already registered to another account.",
  "Esta extracción no está pendiente de revisión.": "This extraction is not awaiting review.",
  "Esta instancia ya está cerrada.": "This instance is already closed.",
  "Esta nota ya está cancelada.": "This note is already cancelled.",
  "Esta orden ya fue cancelada.": "This order has already been cancelled.",
  "Esta receta no se emitió por la ruta de firma autógrafa.":
    "This prescription was not issued through the handwritten-signature route.",
  "Esta receta ya fue cancelada.": "This prescription has already been cancelled.",
  "Esta receta ya fue confirmada como firmada y entregada.":
    "This prescription has already been confirmed as signed and delivered.",
  "Esta regla se traslapa con una regla existente del mismo médico y modalidad.":
    "This rule overlaps an existing rule for the same physician and modality.",
  "Esta solicitud ya fue resuelta.": "This request has already been resolved.",
  "Este bloqueo afecta citas ya agendadas. Cancélalas o reagéndalas antes de crear el bloqueo.":
    "This block affects appointments that are already booked. Cancel or reschedule them before creating the block.",
  "Este borrador lleva más de 72 horas sin firmarse y se marcó como abandonado — no se pueden emitir documentos.":
    "This draft has gone more than 72 hours without being signed and was marked abandoned — no documents can be issued.",
  "Este borrador lleva más de 72 horas sin firmarse y se marcó como abandonado.":
    "This draft has gone more than 72 hours without being signed and was marked abandoned.",
  "Este correo ya está registrado. Si ya tienes cuenta, inicia sesión; si quieres añadir un rol, contacta a soporte.":
    "This email is already registered. If you already have an account, sign in; to add a role, contact support.",
  "Este diagnóstico ya está descartado.": "This diagnosis has already been ruled out.",
  "Este embarazo ya está cerrado.": "This pregnancy is already closed.",
  "Este encuentro ya fue firmado y no se puede modificar.": "This encounter has been signed and cannot be modified.",
  "Este horario excede la ventana máxima de agenda del médico.":
    "This time is beyond the physician's maximum booking window.",
  "Este horario no respeta la antelación mínima del médico.":
    "This time does not respect the physician's minimum booking notice.",
  "Este horario ya no está disponible.": "This time is no longer available.",
  "Este medicamento requiere recetario físico con código de barras de COFEPRIS. Medicfy no puede emitir esta receta electrónicamente.":
    "This medication requires a paper prescription pad with a COFEPRIS barcode. Medicfy cannot issue this prescription electronically.",
  "Este médico no tiene consultorio activo ni teleconsulta habilitada.":
    "This physician has no active practice location and no teleconsultation enabled.",
  "Estos campos no se pueden modificar una vez verificada la cuenta. Contacta a soporte.":
    "These fields cannot be modified once the account is verified. Contact support.",
  "Excepción no encontrada.": "Exception not found.",
  "Extracción no encontrada.": "Extraction not found.",
  "Hay interacciones GRAVES entre lo prescrito y/o la medicación vigente — confirma explícitamente para continuar.":
    "There are SEVERE interactions between what is prescribed and/or the current medication — confirm explicitly to continue.",
  "Indica el término existente al que se fusiona.": "Specify the existing term to merge into.",
  "Instancia de protocolo no encontrada.": "Protocol instance not found.",
  "Invitación inválida o expirada.": "Invalid or expired invitation.",
  "La cita cambió de estado antes de completar esta transición.":
    "The appointment changed status before this transition could complete.",
  "La nota firmada no capturó indicaciones al paciente — no hay documento que emitir.":
    "The signed note recorded no patient instructions — there is no document to issue.",
  "La nota no existe o no pertenece a este encuentro.": "The note does not exist or does not belong to this encounter.",
  "La nota que se intenta corregir no existe o no pertenece a este encuentro.":
    "The note you are trying to correct does not exist or does not belong to this encounter.",
  "La paciente ya tiene un embarazo activo registrado — ciérralo antes de registrar otro.":
    "This patient already has an active pregnancy recorded — close it before recording another.",
  "La receta de origen de una línea heredada no existe o no pertenece a este paciente y médico.":
    "The source prescription of a carried-over line does not exist or does not belong to this patient and physician.",
  "Las indicaciones se emiten desde una nota firmada de este paciente.":
    "Instructions are issued from a signed note for this patient.",
  "Medicamento no encontrado.": "Medication not found.",
  "Metadatos inválidos.": "Invalid metadata.",
  "Motivo de cancelación inválido.": "Invalid cancellation reason.",
  "Médico no encontrado.": "Physician not found.",
  "Necesitas una cuenta de paciente para agendar. Regístrate primero.":
    "You need a patient account to book. Sign up first.",
  "No autenticado.": "Not authenticated.",
  "No hay sesión activa.": "There is no active session.",
  "No hay un PDF disponible para esta orden.": "There is no PDF available for this order.",
  "No hay un PDF disponible para esta receta.": "There is no PDF available for this prescription.",
  "No se pudo determinar el paciente de la solicitud.": "The patient for this request could not be determined.",
  "No se pudo resolver médico o paciente para el registro.":
    "The physician or patient for this record could not be resolved.",
  "No se pudo resolver médico o paciente para la orden.": "The physician or patient for this order could not be resolved.",
  "No se pudo resolver médico o paciente para la receta.":
    "The physician or patient for this prescription could not be resolved.",
  "No se pudo verificar tu identidad para firmar.": "Your identity could not be verified for signing.",
  "No tienes un vínculo activo con este médico.": "You have no active relationship with this physician.",
  "No tienes un vínculo activo con este paciente. El vínculo se crea con una cita o autorización del paciente.":
    "You have no active relationship with this patient. The relationship is created by an appointment or the patient's authorization.",
  "No tienes un vínculo con este paciente. Regístralo desde tu lista de pacientes, o espera a que agende él mismo.":
    "You have no relationship with this patient. Register them from your patient list, or wait for them to book themselves.",
  "Orden de laboratorio no encontrada.": "Lab order not found.",
  "Orden no encontrada.": "Order not found.",
  "Paciente no encontrado.": "Patient not found.",
  "Plantilla no encontrada.": "Template not found.",
  "Primero debes iniciar el registro de verificación en dos pasos.":
    "You must start two-step verification enrollment first.",
  "Protocolo no encontrado o inactivo.": "Protocol not found or inactive.",
  "Publicación no encontrada.": "Post not found.",
  "Rango de referencia no encontrado.": "Reference range not found.",
  "Receta no encontrada para este paciente.": "Prescription not found for this patient.",
  "Receta no encontrada.": "Prescription not found.",
  "Regla de disponibilidad no encontrada.": "Availability rule not found.",
  "Resultado no encontrado.": "Result not found.",
  "Servicio no encontrado para este médico.": "Service not found for this physician.",
  "Servicio no encontrado.": "Service not found.",
  "Sesión no encontrada en esta instancia.": "Session not found in this instance.",
  "Solicitud de término no encontrada.": "Term request not found.",
  "Solo se puede corregir un encuentro ya firmado. Un borrador se edita directamente.":
    "Only a signed encounter can be corrected. A draft is edited directly.",
  "Solo se puede fusionar dentro del mismo dominio.": "Merging is only possible within the same domain.",
  "Solo se puede reintentar una hoja cuya lectura falló.": "Only a report whose reading failed can be retried.",
  "Solo un médico con vínculo activo puede acceder a este expediente.":
    "Only a physician with an active relationship can access this record.",
  "Solo un médico o su asistente puede gestionar esta agenda.":
    "Only a physician or their assistant can manage this schedule.",
  "Solo un médico puede administrar plantillas de antecedentes.":
    "Only a physician can manage clinical history templates.",
  "Solo un médico puede agregar medicamentos al catálogo.": "Only a physician can add medications to the catalog.",
  "Solo un médico tiene plantillas de nota.": "Only a physician has note templates.",
  "Todavía no has subido este archivo.": "You haven't uploaded this file yet.",
  "Todavía no tienes un expediente de paciente propio.": "You don't have a patient record of your own yet.",
  "Tu cuenta está suspendida. No puedes crear ni publicar contenido nuevo.":
    "Your account is suspended. You cannot create or publish new content.",
  "Término de catálogo no encontrado.": "Catalog term not found.",
  "Un embarazo cerrado no se edita.": "A closed pregnancy cannot be edited.",
  "Un término no se puede fusionar consigo mismo.": "A term cannot be merged into itself.",
  "Una o más especialidades secundarias no existen en el catálogo.":
    "One or more secondary specialties do not exist in the catalog.",
  "Uno de los estudios no existe en el catálogo — solicita el término al curador (R2), no hay texto libre.":
    "One of the studies does not exist in the catalog — request the term from the curator (R2); free text is not allowed.",
  "Uno o más medicamentos no existen en el catálogo.": "One or more medications do not exist in the catalog.",
  "Usuario no encontrado.": "User not found.",
  "Ya tienes el máximo de invitaciones pendientes (3).": "You already have the maximum pending invitations (3).",
  "cursor inválido.": "Invalid cursor.",
  "docType inválido.": "Invalid docType.",
  "kind inválido.": "Invalid kind.",
  "mediaType inválido.": "Invalid mediaType.",
  "Correo o contraseña incorrectos.": "Incorrect email or password.",
  "Cuenta bloqueada temporalmente por múltiples intentos fallidos.":
    "Account temporarily locked after multiple failed attempts.",
  "Debes aceptar la versión vigente del aviso de privacidad para continuar.":
    "You must accept the current version of the privacy notice to continue.",
  "Debes activar la verificación en dos pasos para continuar.":
    "You must turn on two-step verification to continue.",
  "Sesión de verificación inválida o expirada.": "Invalid or expired verification session.",
  "Sesión inválida o expirada.": "Invalid or expired session.",
  "Token inválido o expirado.": "Invalid or expired token.",
  "Tu cuenta de médico aún no está verificada.": "Your physician account is not verified yet.",
  "Verifica tu correo electrónico antes de iniciar sesión.": "Verify your email address before signing in.",
  // Respaldo del filtro cuando algo revienta sin ser ApiException.
  "Ocurrió un error inesperado.": "Something unexpected went wrong.",
};

// Los mensajes que interpolan un valor (nombre de un término, conteo,
// código CIE-10…) no se pueden buscar por igualdad. Cada patrón captura
// las partes variables y las vuelve a insertar sin tocarlas: un nombre
// de medicamento o un código de catálogo NO se traduce.
export const MESSAGE_PATTERNS_EN: { pattern: RegExp; en: (m: RegExpMatchArray) => string }[] = [
  {
    pattern: /^Formato no permitido — solo se aceptan PDF, JPG o PNG\.$/,
    en: () => "Format not allowed — only PDF, JPG or PNG are accepted.",
  },
  {
    pattern: /^"(.+)" es equivalente, tras normalizar, al término existente "(.+)" \(id (.+)\) en el dominio "(.+)"\.$/,
    en: (m) => `"${m[1]}" is equivalent, after normalization, to the existing term "${m[2]}" (id ${m[3]}) in domain "${m[4]}".`,
  },
  {
    pattern: /^Ya existe un término con la clave "(.+)" o forma normalizada equivalente en el dominio "(.+)"\.$/,
    en: (m) => `A term with the key "${m[1]}" or an equivalent normalized form already exists in domain "${m[2]}".`,
  },
  {
    pattern: /^Ciclo de fusión detectado en el término "(.+)" \((.+)\)\.$/,
    en: (m) => `Merge cycle detected in term "${m[1]}" (${m[2]}).`,
  },
  {
    pattern: /^"(.+)" ya existe en el catálogo como "(.+)" — úsalo directamente\.$/,
    en: (m) => `"${m[1]}" already exists in the catalog as "${m[2]}" — use it directly.`,
  },
  {
    pattern: /^Aprobar exige la clave del término nuevo y su sistema de codificación \(o "PROPIETARIO"\)\.$/,
    en: () => 'Approving requires the new term\'s key and its coding system (or "PROPIETARIO").',
  },
  {
    pattern: /^La candidata "(.+)" tiene confianza baja y necesita confirmación explícita o corrección antes de aceptarse\.$/,
    en: (m) => `Candidate "${m[1]}" has low confidence and needs explicit confirmation or correction before it can be accepted.`,
  },
  {
    pattern: /^"(.+)" ya existe en el catálogo — búscalo y selecciónalo en vez de agregarlo de nuevo\.$/,
    en: (m) => `"${m[1]}" already exists in the catalog — search for it and select it instead of adding it again.`,
  },
  {
    pattern: /^El atajo Alt\+(.+) ya está asignado a "(.+)"\.$/,
    en: (m) => `The Alt+${m[1]} shortcut is already assigned to "${m[2]}".`,
  },
  {
    pattern: /^La especialidad "(.+)" no existe\.$/,
    en: (m) => `Specialty "${m[1]}" does not exist.`,
  },
  {
    pattern: /^Hay (.+) antecedente\(s\) heredados de plantilla sin revisar — revísalos antes de firmar\.$/,
    en: (m) => `There are ${m[1]} history item(s) inherited from a template that are unreviewed — review them before signing.`,
  },
  {
    pattern: /^Hay signos vitales en rango CRÍTICO \((.+)\) — confirma explícitamente que son correctos antes de firmar\.$/,
    en: (m) => `There are vital signs in the CRITICAL range (${m[1]}) — confirm explicitly that they are correct before signing.`,
  },
  {
    pattern: /^Código\(s\) CIE-10 inexistentes en el catálogo: (.+)\.$/,
    en: (m) => `ICD-10 code(s) not present in the catalog: ${m[1]}.`,
  },
  {
    pattern: /^El antecedente "(.+)" no existe en el catálogo\. Solicítalo al curador desde "solicitar término nuevo"\.$/,
    en: (m) => `History item "${m[1]}" does not exist in the catalog. Request it from the curator under "request a new term".`,
  },
  {
    pattern: /^El antecedente "(.+)" quedó obsoleto en el catálogo\.$/,
    en: (m) => `History item "${m[1]}" is obsolete in the catalog.`,
  },
  {
    pattern: /^La sustancia "(.+)" no existe en el catálogo\.$/,
    en: (m) => `Substance "${m[1]}" does not exist in the catalog.`,
  },
  {
    pattern: /^El agente "(.+)" no existe en el catálogo de alergias — solicítalo al curador\.$/,
    en: (m) => `Agent "${m[1]}" does not exist in the allergy catalog — request it from the curator.`,
  },
  {
    pattern: /^(.+): el valor mínimo permitido es (.+)\.$/,
    en: (m) => `${m[1]}: the minimum allowed value is ${m[2]}.`,
  },
  {
    pattern: /^(.+): el valor máximo permitido es (.+)\.$/,
    en: (m) => `${m[1]}: the maximum allowed value is ${m[2]}.`,
  },
  {
    pattern: /^(.+): el valor no corresponde a ninguna opción válida\.$/,
    en: (m) => `${m[1]}: the value does not match any valid option.`,
  },
  {
    pattern: /^section debe ser uno de: (.+)\.$/,
    en: (m) => `section must be one of: ${m[1]}.`,
  },
  {
    pattern: /^No se puede pasar de (.+) a (.+)\.$/,
    en: (m) => `Cannot move from ${m[1]} to ${m[2]}.`,
  },
];
