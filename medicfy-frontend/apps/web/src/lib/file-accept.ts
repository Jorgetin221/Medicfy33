// Safari en macOS deshabilita el botón "Cargar" del selector de archivos
// cuando no logra traducir la lista del atributo `accept` a tipos del
// sistema: el médico veía su PDF seleccionado y no podía subirlo (pasaba
// tanto con "application/pdf,image/jpeg,image/png" como con la lista
// ampliada). Por eso ningún <input type="file"> de la app lleva `accept`:
// el selector muestra todos los archivos y la app valida con esta
// función, con la misma sintaxis que `accept` (".pdf", "image/png",
// "image/*"), y avisa con un mensaje claro si el formato no aplica.
export function fileMatchesAccept(file: { name: string; type: string }, accept: string): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => {
      if (entry.startsWith(".")) return name.endsWith(entry);
      if (entry.endsWith("/*")) return type.startsWith(entry.slice(0, -1));
      return type === entry;
    });
}

const LABEL_BY_SUBTYPE: Record<string, string> = { jpeg: "JPG", "svg+xml": "SVG" };

// "image/png,image/jpeg" → "PNG, JPG", para el aviso al médico.
export function acceptLabel(accept: string): string {
  const labels = accept
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .map((entry) => {
      const raw = entry.startsWith(".") ? entry.slice(1) : (entry.split("/")[1] ?? entry);
      return LABEL_BY_SUBTYPE[raw] ?? raw.toUpperCase();
    });
  return [...new Set(labels)].join(", ");
}
