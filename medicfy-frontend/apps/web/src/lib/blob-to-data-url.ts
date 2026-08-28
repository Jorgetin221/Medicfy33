// Compartido entre los visores de PDF/imagen embebidos (resultados de
// laboratorio y documentos del panel de consulta) — un <img src> no
// puede leer un Blob directamente, así que se convierte a data: URL.
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
