import type { directorio as esDirectorio, verificacionPublica as esVerificacion } from "../es/directorio";

export const directorio: typeof esDirectorio = {
  titulo: "Specialists",
  subtitulo: "Search by name or specialty, and filter for what you need.",
  nombreMedico: "Physician name",
  nombrePlaceholder: "e.g. Dr. López",
  especialidad: "Specialty",
  consultaEnLinea: "Online consultation",
  aceptaPacientes: "Accepting new patients",
  sinResultados: "No results",
  sinResultadosAyuda: "Try another name, another specialty, or remove some filters.",
  cargarMas: "Load more",
  ofreceTeleconsulta: "Offers teleconsultation",
  medicoEnMedicfy: "Physician on Medicfy",
};

// "Céd." se conserva: es como aparece impresa la cédula profesional en
// la receta, y esta pantalla existe para cotejar un documento físico.
export const verificacionPublica: typeof esVerificacion = {
  titulo: "Document verification",
  verificando: "Verifying…",
  noEncontradoTitulo: "Document not found",
  noEncontradoCuerpo:
    "This link doesn't match a prescription or order issued by Medicfy, or the code is incomplete.",
  canceladoTitulo: "Document cancelled",
  canceladoReceta: "This prescription was cancelled by the physician and is no longer valid.",
  canceladoOrden: "This lab order was cancelled by the physician and is no longer valid.",
  vigenteReceta: "Prescription valid",
  vigenteOrden: "Lab order valid",
  folio: "Folio",
  fechaEmision: "Issued on",
  medico: "Physician",
  cedulaAbreviada: "Céd.",
  paciente: "Patient",
  nota:
    "This check confirms the document was issued by Medicfy. It does not show diagnosis, medications or results, to protect patient confidentiality.",
};
