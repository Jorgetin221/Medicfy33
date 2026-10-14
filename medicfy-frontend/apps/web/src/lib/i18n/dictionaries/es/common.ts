// Acciones y estados que se repiten en toda la plataforma. Si una
// cadena solo aparece en una pantalla, va en la sección de esa
// pantalla, no aquí: este archivo deja de ser útil en cuanto se
// convierte en un cajón de sastre.
export const common = {
  acciones: {
    guardar: "Guardar",
    guardando: "Guardando…",
    cancelar: "Cancelar",
    cerrar: "Cerrar",
    volver: "Volver",
    continuar: "Continuar",
    buscar: "Buscar",
    buscando: "Buscando…",
    filtrar: "Filtrar",
    limpiar: "Limpiar",
    agregar: "Agregar",
    quitar: "Quitar",
    editar: "Editar",
    ver: "Ver",
    verMas: "Ver más",
    verTodas: "Ver todas",
    reintentar: "Reintentar",
    descargar: "Descargar",
    subir: "Subir",
    confirmar: "Confirmar",
    enviar: "Enviar",
    enviando: "Enviando…",
    copiar: "Copiar",
    copiado: "Copiado",
  },
  estados: {
    cargando: "Cargando…",
    sinConexionTitulo: "Sin conexión",
    sinConexionCuerpo: "No se pudo contactar al servidor. Revisa tu conexión a internet e inténtalo de nuevo.",
    errorTitulo: "No se pudo cargar",
    vacioTitulo: "Nada que mostrar",
  },
  etiquetas: {
    si: "Sí",
    no: "No",
    opcional: "opcional",
    requerido: "requerido",
    de: "de",
    todas: "Todas",
    todos: "Todos",
    ninguno: "Ninguno",
    sinRegistro: "Sin registro",
    noEspecificado: "No especificado",
  },
  secciones: "Secciones",
  cerrarPanel: "Cerrar panel",
  idioma: {
    etiqueta: "Idioma",
    cambiar: "Cambiar idioma",
    // El nombre de cada idioma va en su propio idioma (LOCALE_LABELS
    // en config.ts), nunca traducido.
  },
};
