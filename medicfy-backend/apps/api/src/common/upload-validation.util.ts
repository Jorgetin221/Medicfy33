import { HttpStatus } from "@nestjs/common";
import type { Request } from "express";
import type { Express } from "express";
import { MEDICAL_FILE_FORMATS, resolveMedicalFileFormat } from "@medicfy/contracts";
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

// Resultados que el médico sube en "Órdenes y resultados" (§6.7): todos
// los formatos clínicos del catálogo compartido (MEDICAL_FILE_FORMATS —
// PDF, imágenes, DICOM, Office, texto, HL7, video), a petición explícita
// del usuario (2026-10-16). labResultFileFilter (PDF/JPG/PNG) se queda
// para la lectura automática de hojas, que solo entiende esos formatos.
// Decide por extensión además del tipo MIME: varios navegadores mandan
// application/octet-stream para .dcm, .heic o .hl7.
export function medicalFileFilter(
  _req: Request,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void
): void {
  if (resolveMedicalFileFormat(file.originalname, file.mimetype)) {
    callback(null, true);
    return;
  }
  callback(
    new ApiException(
      "LAB_RESULT_FILE_TYPE_NOT_ALLOWED",
      "Formato no permitido. Se aceptan PDF, imágenes (JPG, PNG, HEIC, TIFF…), DICOM, Word, Excel, texto, HL7 y video.",
      HttpStatus.BAD_REQUEST,
      { allowed: MEDICAL_FILE_FORMATS.map((f) => f.label), received: file.mimetype }
    ),
    false
  );
}
