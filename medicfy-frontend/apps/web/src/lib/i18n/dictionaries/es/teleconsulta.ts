// M7 (Teleconsulta, MVP): modal dentro de DOC-06 (ver
// teleconsulta-video-pane.tsx) que incrusta el enlace del proveedor
// externo (Daily.co); Medicfy no construye WebRTC propio.
export const teleconsulta = {
  titulo: "Teleconsulta",
  cargando: "Conectando con la videollamada…",
  avisoGrabacion: "Esta llamada no se grabará y no se comparte con nadie fuera de la consulta.",
  proveedorExterno: "La videollamada corre sobre un proveedor externo; Medicfy no almacena su contenido.",
  sinConexion: "Sin conexión a internet",
  sinConexionAyuda: "La videollamada necesita conexión. Vuelve a intentar cuando se restablezca.",
  noDisponible: {
    noConfigurado: "Teleconsulta no disponible",
    noConfiguradoAyuda: "Este consultorio todavía no tiene configurado el proveedor de videollamada. Contacta a soporte.",
    errorProveedor: "No se pudo conectar con el proveedor de videollamada",
    errorProveedorAyuda: "Intenta de nuevo en unos segundos. Si persiste, continúa la consulta por teléfono y documenta el cambio de modalidad.",
    reintentar: "Reintentar",
  },
  errorTitulo: "No se pudo abrir la teleconsulta",
};
