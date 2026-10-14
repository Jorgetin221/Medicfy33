// Catálogos del servidor que sí se traducen en el cliente.
//
// REGLA: aquí solo entra vocabulario de navegación con un catálogo
// cerrado, pequeño y de códigos estables. NO entran diagnósticos
// CIE-10, nombres de medicamento ni analitos de laboratorio: esos son
// dato clínico catalogado, se muestran exactamente como están
// registrados, y traducirlos en el cliente sería inventar
// terminología médica delante de quien prescribe.
export const catalogos = {
  // Las 4 especialidades del MVP, por `code` (no por nombre: el
  // nombre puede cambiar en el catálogo, el código no). Un código que
  // no esté aquí cae de vuelta al nameEs del servidor.
  especialidades: {
    GENERAL: "Medicina General",
    GINECOLOGIA_OBSTETRICIA: "Ginecología y Obstetricia",
    MEDICINA_INTERNA: "Medicina Interna",
    PEDIATRIA: "Pediatría",
  },
};
