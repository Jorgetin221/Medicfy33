// Formatos de archivo que un médico sube al expediente como resultado
// de estudios (§6.7). Un solo catálogo para el frontend (selector de
// archivo, carpeta y visor), el API (validación y tipo al servirlo) y
// el mock local — antes cada lado tenía su propia lista de PDF/JPG/PNG.
//
// Ampliado a petición explícita del usuario (2026-10-16): "que no solo
// sean archivos PDF, todo el formato que usan los médicos". DICOM,
// Office y video se ACEPTAN como archivo adjunto — Medicfy no los
// interpreta ni trae visor DICOM (especificación §14); se descargan.
//
// La EXTENSIÓN manda sobre el tipo MIME que reporta el navegador:
// Safari y Chrome mandan "" o application/octet-stream para .dcm,
// .heic o .hl7, y el filtro anterior los rechazaba sin explicación.
// Archivo puro (sin imports): el mock lo importa con el type-stripping
// de Node.

export type MedicalFilePreview = "pdf" | "image" | "video" | "text" | "none";

export interface MedicalFileFormat {
  extensions: readonly string[];
  // El primero es el que se usa al servir el archivo.
  mimeTypes: readonly string[];
  label: string;
  preview: MedicalFilePreview;
}

export const MEDICAL_FILE_FORMATS: readonly MedicalFileFormat[] = [
  { extensions: [".pdf"], mimeTypes: ["application/pdf"], label: "PDF", preview: "pdf" },
  { extensions: [".jpg", ".jpeg"], mimeTypes: ["image/jpeg"], label: "JPG", preview: "image" },
  { extensions: [".png"], mimeTypes: ["image/png"], label: "PNG", preview: "image" },
  { extensions: [".webp"], mimeTypes: ["image/webp"], label: "WEBP", preview: "image" },
  { extensions: [".gif"], mimeTypes: ["image/gif"], label: "GIF", preview: "image" },
  { extensions: [".bmp"], mimeTypes: ["image/bmp"], label: "BMP", preview: "image" },
  // Fotos de iPhone y escaneos: la mayoría de los navegadores no los
  // dibujan, se ofrecen para descargar.
  { extensions: [".heic"], mimeTypes: ["image/heic"], label: "HEIC", preview: "none" },
  { extensions: [".heif"], mimeTypes: ["image/heif"], label: "HEIF", preview: "none" },
  { extensions: [".tif", ".tiff"], mimeTypes: ["image/tiff"], label: "TIFF", preview: "none" },
  // Imagenología (rayos X, TAC, RM, ultrasonido).
  { extensions: [".dcm", ".dicom"], mimeTypes: ["application/dicom"], label: "DICOM", preview: "none" },
  { extensions: [".zip"], mimeTypes: ["application/zip", "application/x-zip-compressed"], label: "ZIP", preview: "none" },
  // Reportes de laboratorio y documentos de oficina.
  { extensions: [".doc"], mimeTypes: ["application/msword"], label: "DOC", preview: "none" },
  {
    extensions: [".docx"],
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    label: "DOCX",
    preview: "none",
  },
  { extensions: [".xls"], mimeTypes: ["application/vnd.ms-excel"], label: "XLS", preview: "none" },
  {
    extensions: [".xlsx"],
    mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    label: "XLSX",
    preview: "none",
  },
  { extensions: [".odt"], mimeTypes: ["application/vnd.oasis.opendocument.text"], label: "ODT", preview: "none" },
  { extensions: [".ods"], mimeTypes: ["application/vnd.oasis.opendocument.spreadsheet"], label: "ODS", preview: "none" },
  { extensions: [".rtf"], mimeTypes: ["application/rtf", "text/rtf"], label: "RTF", preview: "none" },
  { extensions: [".txt"], mimeTypes: ["text/plain"], label: "TXT", preview: "text" },
  { extensions: [".csv"], mimeTypes: ["text/csv"], label: "CSV", preview: "text" },
  // Interoperabilidad: reportes HL7 v2 y documentos CDA (XML).
  { extensions: [".xml"], mimeTypes: ["application/xml", "text/xml"], label: "XML", preview: "text" },
  { extensions: [".hl7"], mimeTypes: ["application/hl7-v2"], label: "HL7", preview: "text" },
  // Clips de ultrasonido o endoscopia.
  { extensions: [".mp4"], mimeTypes: ["video/mp4"], label: "MP4", preview: "video" },
  { extensions: [".mov"], mimeTypes: ["video/quicktime"], label: "MOV", preview: "video" },
];

// Videos y estudios DICOM pesan más que un PDF: 10 MB se quedaba corto.
export const MEDICAL_FILE_MAX_BYTES = 50 * 1024 * 1024;

// Para el atributo `accept` del <input type="file">: extensiones Y
// tipos MIME, porque cada navegador filtra con uno u otro.
export const MEDICAL_FILE_ACCEPT = MEDICAL_FILE_FORMATS.flatMap((f) => [...f.extensions, ...f.mimeTypes]).join(",");

const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

// null = formato no permitido. Por extensión primero; si el archivo no
// trae extensión conocida, por el tipo MIME (salvo los genéricos).
export function resolveMedicalFileFormat(fileName: string, mimeType: string): MedicalFileFormat | null {
  const extension = extensionOf(fileName);
  const byExtension = MEDICAL_FILE_FORMATS.find((f) => f.extensions.includes(extension));
  if (byExtension) return byExtension;
  const mime = mimeType.toLowerCase();
  if (GENERIC_MIME_TYPES.has(mime)) return null;
  return MEDICAL_FILE_FORMATS.find((f) => f.mimeTypes.includes(mime)) ?? null;
}

// Tipo con el que se sirve un archivo ya guardado, a partir de su
// nombre (fileKey u original).
export function medicalFileMimeType(fileName: string): string {
  return resolveMedicalFileFormat(fileName, "")?.mimeTypes[0] ?? "application/octet-stream";
}

export function medicalFilePreview(mimeType: string): MedicalFilePreview {
  const format = MEDICAL_FILE_FORMATS.find((f) => f.mimeTypes.includes(mimeType.toLowerCase()));
  if (format) return format.preview;
  return mimeType.startsWith("text/") ? "text" : "none";
}
