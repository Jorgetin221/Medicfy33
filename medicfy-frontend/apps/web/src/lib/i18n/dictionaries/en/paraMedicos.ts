import type { paraMedicos as es } from "../es/paraMedicos";

// NOM-004 y la SEP se nombran tal cual: son la norma y la autoridad
// mexicanas, y traducirlas las volvería irreconocibles para el médico
// que las conoce por su nombre.
export const paraMedicos: typeof es = {
  hero: {
    insignia: "For private-practice physicians in Guadalajara",
    titulo: "Your practice — no WhatsApp, no spreadsheets, no paper prescription pad",
    subtitulo:
      "A NOM-004-compliant clinical record, legally valid electronic prescriptions, and your day's schedule, all in one place.",
    cta: "Create a free account",
    yaTengoCuenta: "I already have an account",
    nota: "We verify your license with the SEP. No credit card.",
  },
  maqueta: {
    titulo: "Today's schedule",
    seguimiento: "Follow-up visit",
    primeraVez: "First visit",
    confirmada: "Confirmed",
    enCurso: "In progress",
    agendada: "Scheduled",
  },
  caracteristicas: {
    titulo: "Everything your practice needs",
    subtitulo: "This isn't a directory that gets you seen. It's the clinical tool you use every day.",
    expedienteTitulo: "NOM-004 clinical record",
    expedienteCuerpo:
      "A complete clinical history built visit by visit. Never overwritten, never lost.",
    recetaTitulo: "Legally valid prescriptions",
    recetaCuerpo:
      "Issue one without leaving the consultation. Controlled medications are blocked by design, not by a warning.",
    agendaTitulo: "Your day's schedule",
    agendaCuerpo:
      "History, allergies and your most recent visits with each patient, visible without jumping between WhatsApp and a notebook.",
    cedulaTitulo: "Verified license",
    cedulaCuerpo:
      "Your profile shows your verified professional license — the kind of trust a generic directory can't offer.",
  },
  pasos: {
    titulo: "How it works",
    unoTitulo: "Create your account",
    unoCuerpo:
      "Sign up with your professional license. We check it against the SEP registry before you see any patients.",
    dosTitulo: "Set up your practice",
    dosCuerpo: "Add your hours, your services and, if you have them, your assistants.",
    tresTitulo: "See patients and document",
    tresCuerpo: "Every visit is recorded, every prescription ready in seconds, with no extra paperwork.",
  },
  confianza: {
    cifrado: "Clinical data encrypted",
    bitacora: "Every access logged",
    controlados: "Controlled substances blocked by design",
  },
  cta: {
    titulo: "Start documenting today's visit",
    cuerpo: "Create your account in a few minutes and verify your professional license.",
  },
  footer: {
    lema: "The clinical tool for Mexico's private-practice physicians.",
    ciudad: "Guadalajara, Jalisco",
  },
};
