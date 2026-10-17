import type { ui as es } from "../es/ui";

export const ui: typeof es = {
  estados: {
    errorInesperado: "Something unexpected went wrong.",
    algoSalioMal: "Something went wrong",
    sinConexion: "No connection",
  },
  password: {
    mostrar: "Show password",
    ocultar: "Hide password",
  },
  archivo: {
    sinArchivo: "No file",
    formatoNoPermitido: "“{nombre}” can't be uploaded here. Allowed formats: {permitidos}.",
    reemplazar: "Replace",
    subirImagen: "Upload image",
    restriccion: "JPG or PNG, 5 MB maximum.",
    vistaPrevia: "Preview of {etiqueta}",
  },
  fecha: {
    formato: "mm/dd/yyyy",
    abrirCalendario: "Open calendar",
    mesAnterior: "Previous month",
    mesSiguiente: "Next month",
    elegirMesAnio: "choose month and year",
    mes: "Month",
    anio: "Year",
    hoy: "Today",
    borrar: "Clear",
    listo: "Done",
  },
  guardado: {
    guardado: "Saved",
    guardando: "Saving…",
    sinConexion: "Offline — your changes are being saved on this device",
    sinRespaldo: "Offline with no local backup — do not close or reload this tab",
    alas: " at {hora}",
  },
  cita: {
    PENDING_PAYMENT: "Payment pending",
    SCHEDULED: "Scheduled",
    CONFIRMED: "Confirmed",
    IN_PROGRESS: "In consultation",
    COMPLETED: "Completed",
    CANCELLED_BY_PATIENT: "Cancelled (patient)",
    CANCELLED_BY_DOCTOR: "Cancelled (physician)",
    NO_SHOW: "No-show",
  },
};
