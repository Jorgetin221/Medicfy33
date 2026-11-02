import type { vinculacion as es } from "../es/vinculacion";

export const vinculacion: typeof es = {
  ficha: {
    titulo: "Patient account",
    cargando: "Loading account status…",
    cuentaActiva: "Active account",
    cuentaActivaAyuda: "This patient's Medicfy account is already linked to this record.",
    sinCuenta: "This patient doesn't have a Medicfy account yet. Generate an activation link and share it with them (for example, over WhatsApp).",
    generar: "Generate activation link",
    generarOtro: "Generate a new link",
    enlaceVigente:
      "There is an active link, generated on {creado} and valid until {vence}. For security it can't be shown again: if you need it, generate a new one and the previous one will stop working.",
    enlaceGenerado: "Link generated. It can be used once and expires on {vence}. Share it only with the patient.",
    etiquetaEnlace: "Activation link",
    copiar: "Copy",
    copiado: "Copied",
    whatsapp: "Share on WhatsApp",
    mensajeWhatsapp:
      "Hi {nombre}, here is your link to activate your Medicfy account and access your record: {url} — it's personal, single-use and expires in 7 days.",
    menorTitulo: "Underage patient",
    menorCuerpo:
      "Account activation for minors (through their guardian) isn't available in Medicfy yet, so an activation link can't be generated for this patient.",
  },
  solicitudes: {
    avisoTitulo: "Pending link request",
    avisoCuerpo:
      "Someone created an account with this patient's phone number. Compare their details with the record before deciding: if you approve, that account will have access to this record.",
    recibida: "Received on {fecha}",
    columnaRegistro: "What they entered when signing up",
    columnaExpediente: "What the record says",
    distinto: "Different",
    campos: {
      nombre: "Name",
      fechaNacimiento: "Date of birth",
      sexo: "Sex at birth",
      telefono: "Phone",
      correo: "Email",
    },
    aprobar: "Approve link",
    rechazar: "Reject",
    confirmarAprobarTitulo: "Approve the link?",
    confirmarAprobarCuerpo:
      "The account {correo} will have access to record {medicfyId}. Only do this if you confirmed it is the same person.",
    confirmarRechazarTitulo: "Reject the request?",
    confirmarRechazarCuerpo: "The account {correo} won't have access to this record.",
    aprobada: "Link approved. The patient now has access to their account.",
    rechazada: "Request rejected. The account has no access to this record.",
    listadoTitulo: "Pending link requests",
    listadoCuerpo: "People who signed up with one of your patients' phone numbers and are waiting for you to confirm their identity:",
    revisar: "Review",
  },
  duplicado: {
    titulo: "Possible duplicate patient",
    cuerpo:
      "You already have a patient with the same phone number and date of birth. Make sure it isn't the same person before creating another record.",
    abrir: "Open record",
    continuar: "Continue anyway",
  },
  activar: {
    metaTitulo: "Activate account — Medicfy BETA",
    panelTitulo: "Your record, now with you too",
    panelCuerpo: "Your physician shared this link so you can access your information and your appointments.",
    cargando: "Checking your link…",
    titulo: "Activate your account",
    saludo: "Hi, {nombre}",
    confirmaIdentidad: "This link is for record {medicfyId}. If you are not {nombre}, don't continue and let your physician know.",
    subtitulo:
      "Choose the email and password you'll sign in with. If you had already signed up on Medicfy, use that same email and its password.",
    activar: "Activate my account",
    invalidoTitulo: "Invalid link",
    invalidoCuerpo: "This link is no longer valid. Ask your physician for a new one.",
    irAlInicio: "Go to home",
  },
  revisionPendiente: {
    titulo: "Your account was created",
    cuerpo:
      "Your account was created. Your physician must confirm your identity to give you access to your record. You can also ask them for your activation link.",
  },
};
