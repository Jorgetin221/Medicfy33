import type { teleconsulta as es } from "../es/teleconsulta";

export const teleconsulta: typeof es = {
  titulo: "Teleconsultation",
  cargando: "Connecting to the video call…",
  avisoGrabacion: "This call is not recorded and is not shared with anyone outside the consultation.",
  proveedorExterno: "The video call runs on an external provider; Medicfy does not store its content.",
  sinConexion: "No internet connection",
  sinConexionAyuda: "The video call needs a connection. Try again once it's back.",
  noDisponible: {
    noConfigurado: "Teleconsultation unavailable",
    noConfiguradoAyuda: "This practice hasn't configured a video call provider yet. Contact support.",
    errorProveedor: "Couldn't connect to the video call provider",
    errorProveedorAyuda: "Try again in a few seconds. If it keeps failing, continue the consultation by phone and document the change in modality.",
    reintentar: "Retry",
  },
  errorTitulo: "Couldn't open the teleconsultation",
};
