// Vinculación entre pacientes creados por el médico y cuentas de
// paciente: enlace de activación, solicitudes de vinculación por
// teléfono y advertencia de posible duplicado.
export const vinculacion = {
  ficha: {
    titulo: "Cuenta del paciente",
    cargando: "Cargando el estado de la cuenta…",
    cuentaActiva: "Cuenta activa",
    cuentaActivaAyuda: "El paciente ya tiene su cuenta de Medicfy vinculada a este expediente.",
    sinCuenta: "Este paciente todavía no tiene cuenta en Medicfy. Genera un enlace de activación y compártelo con él (por ejemplo, por WhatsApp).",
    generar: "Generar enlace de activación",
    generarOtro: "Generar un enlace nuevo",
    enlaceVigente:
      "Hay un enlace vigente, generado el {creado} y válido hasta el {vence}. Por seguridad no se puede volver a mostrar: si lo necesitas, genera uno nuevo y el anterior dejará de funcionar.",
    enlaceGenerado: "Enlace generado. Es de un solo uso y vence el {vence}. Compártelo solo con el paciente.",
    etiquetaEnlace: "Enlace de activación",
    copiar: "Copiar",
    copiado: "Copiado",
    whatsapp: "Compartir por WhatsApp",
    generarQr: "Generar QR",
    qrAlt: "Código QR del enlace de activación de {nombre}",
    qrAyuda: "Pide al paciente que lo escanee con la cámara de su celular. Es el mismo enlace: de un solo uso y vence en 7 días.",
    descargarQr: "Descargar QR",
    mensajeWhatsapp:
      "Hola {nombre}, este es tu enlace para activar tu cuenta de Medicfy y tener acceso a tu expediente: {url} — es personal, de un solo uso y vence en 7 días.",
    menorTitulo: "Paciente menor de edad",
    menorCuerpo:
      "La activación de cuenta para menores de edad (a través de su tutor) todavía no está disponible en Medicfy, así que no se puede generar un enlace para este paciente.",
  },
  solicitudes: {
    avisoTitulo: "Solicitud de vinculación pendiente",
    avisoCuerpo:
      "Alguien creó una cuenta con el mismo teléfono que este paciente. Compara sus datos con los del expediente antes de decidir: si apruebas, esa cuenta tendrá acceso a este expediente.",
    recibida: "Recibida el {fecha}",
    columnaRegistro: "Lo que escribió al registrarse",
    columnaExpediente: "Lo que dice el expediente",
    distinto: "Distinto",
    campos: {
      nombre: "Nombre",
      fechaNacimiento: "Fecha de nacimiento",
      sexo: "Sexo al nacer",
      telefono: "Teléfono",
      correo: "Correo",
    },
    aprobar: "Aprobar vinculación",
    rechazar: "Rechazar",
    confirmarAprobarTitulo: "¿Aprobar la vinculación?",
    confirmarAprobarCuerpo:
      "La cuenta {correo} tendrá acceso al expediente {medicfyId}. Hazlo solo si confirmaste que es la misma persona.",
    confirmarRechazarTitulo: "¿Rechazar la solicitud?",
    confirmarRechazarCuerpo: "La cuenta {correo} no tendrá acceso a este expediente.",
    aprobada: "Vinculación aprobada. El paciente ya tiene acceso a su cuenta.",
    rechazada: "Solicitud rechazada. La cuenta quedó sin acceso a este expediente.",
    listadoTitulo: "Solicitudes de vinculación pendientes",
    listadoCuerpo: "Personas que se registraron con el teléfono de uno de tus pacientes y esperan que confirmes su identidad:",
    revisar: "Revisar",
  },
  duplicado: {
    titulo: "Posible paciente duplicado",
    cuerpo:
      "Ya tienes un paciente con el mismo teléfono y la misma fecha de nacimiento. Revisa que no sea la misma persona antes de crear otro expediente.",
    abrir: "Abrir expediente",
    continuar: "Continuar de todos modos",
  },
  activar: {
    metaTitulo: "Activar cuenta — Medicfy BETA",
    panelTitulo: "Tu expediente, ahora también contigo",
    panelCuerpo: "Tu médico te compartió este enlace para que tengas acceso a tu información y a tus citas.",
    cargando: "Verificando tu enlace…",
    titulo: "Activa tu cuenta",
    saludo: "Hola, {nombre}",
    confirmaIdentidad: "Este enlace es para el expediente {medicfyId}. Si no eres {nombre}, no continúes y avisa a tu médico.",
    subtitulo:
      "Elige el correo y la contraseña con los que vas a entrar. Si ya te habías registrado en Medicfy, usa ese mismo correo y su contraseña.",
    activar: "Activar mi cuenta",
    invalidoTitulo: "Enlace no válido",
    invalidoCuerpo: "Este enlace ya no es válido. Pide a tu médico uno nuevo.",
    irAlInicio: "Ir al inicio",
  },
  // Mensaje neutro: nunca dice qué expediente coincidió, de quién ni
  // cuántos.
  revisionPendiente: {
    titulo: "Tu cuenta fue creada",
    cuerpo:
      "Tu cuenta fue creada. Tu médico debe confirmar tu identidad para darte acceso a tu expediente. También puedes pedirle tu enlace de activación.",
  },
};
