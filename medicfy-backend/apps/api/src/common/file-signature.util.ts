import { HttpStatus, StreamableFile } from "@nestjs/common";
import { ApiException } from "./api-exception";

// Auditoría 2026-10-21 (M-07). El tipo de archivo se decidía solo por
// el Content-Type que manda el cliente: un HTML renombrado a .pdf
// pasaba como PDF. Para los formatos que el sistema muestra en línea
// (PDF e imágenes) se exige que los primeros bytes correspondan.
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  "application/pdf": (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
  "image/jpeg": (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
};

// Solo se verifica lo que se sabe verificar; otros formatos clínicos
// (DICOM, Office, HL7…) se sirven siempre como descarga, nunca en línea
// (ver fileResponse).
export function assertContentMatchesDeclaredType(buffer: Buffer, mimeType: string): void {
  const check = SIGNATURES[mimeType];
  if (check && !check(buffer)) {
    throw new ApiException(
      "FILE_CONTENT_MISMATCH",
      "El contenido del archivo no corresponde a su tipo. Vuelve a exportarlo o escanearlo.",
      HttpStatus.BAD_REQUEST
    );
  }
}

const INLINE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);

// M-07: un .xml, .csv, .txt o .html servido en línea podía
// interpretarse en el navegador. Solo PDF e imágenes se muestran en
// línea; todo lo demás se entrega como descarga (y la CSP del API ya
// lleva "sandbox").
export function fileResponse(buffer: Buffer, contentType: string): StreamableFile {
  return new StreamableFile(buffer, {
    type: contentType,
    disposition: INLINE_TYPES.has(contentType) ? "inline" : "attachment",
  });
}
