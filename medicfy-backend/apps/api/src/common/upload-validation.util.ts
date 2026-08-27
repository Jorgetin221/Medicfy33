import { HttpStatus } from "@nestjs/common";
import type { Request } from "express";
import type { Express } from "express";
import { ApiException } from "./api-exception";

// M10 "Casos límite" (especificación §14, línea 985): "Estudios de
// imagen → se aceptan como adjunto PDF/JPG; sin visor DICOM." Se
// agrega PNG porque es el mismo trío ya aceptado para documentos de
// perfil (§9, línea 701, PDF/JPG/PNG ≤10 MB) — un resultado de
// laboratorio escaneado o exportado como PNG es el mismo tipo de
// archivo que un documento de perfil, y la especificación nunca
// justifica tratarlos distinto. DICOM se excluye a propósito: la
// especificación lo prohíbe explícitamente aquí ("sin visor DICOM"),
// a diferencia de los adjuntos clínicos generales de M8 (línea 887)
// que sí lo permiten — son dos superficies distintas.
export const LAB_RESULT_ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const LAB_RESULT_ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
// Mismo límite que documentos de perfil (línea 701) — no hay uno
// propio para resultados de laboratorio en la especificación.
export const LAB_RESULT_MAX_FILE_BYTES = 10 * 1024 * 1024;

export function labResultFileFilter(
  _req: Request,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void
): void {
  if (!(LAB_RESULT_ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
    callback(
      new ApiException(
        "LAB_RESULT_FILE_TYPE_NOT_ALLOWED",
        `Formato no permitido — solo se aceptan PDF, JPG o PNG.`,
        HttpStatus.BAD_REQUEST,
        { allowed: LAB_RESULT_ALLOWED_MIME_TYPES, received: file.mimetype }
      ),
      false
    );
    return;
  }
  callback(null, true);
}
