import { HttpStatus, Injectable } from "@nestjs/common";
import { z } from "zod";
import { ApiException } from "../../../common/api-exception";
import { signPurposeToken, verifyPurposeToken } from "../../../common/purpose-token.util";

// M8-RN-010/Fase 5 prompt 41: "URL prefirmada ≤5 min vía
// FileStoragePort". Token de propósito "document_view" (llave y
// audiencia propias, C-01): no sirve como token de acceso ni al revés.
// Firma inválida, vencida o de otro propósito colapsan en el mismo
// error genérico.
const DOCUMENT_VIEW_TOKEN_TTL_SECONDS = 5 * 60;

const documentViewTokenPayloadSchema = z.object({
  documentId: z.string().min(1),
  patientId: z.string().min(1),
  sub: z.string().uuid(),
});

export type DocumentViewTokenPayload = z.infer<typeof documentViewTokenPayloadSchema>;

@Injectable()
export class DocumentAccessService {
  signViewToken(documentId: string, patientId: string, doctorUserId: string): { token: string; expiresAt: Date } {
    const payload: DocumentViewTokenPayload = { documentId, patientId, sub: doctorUserId };
    const token = signPurposeToken("document_view", payload, DOCUMENT_VIEW_TOKEN_TTL_SECONDS);
    return { token, expiresAt: new Date(Date.now() + DOCUMENT_VIEW_TOKEN_TTL_SECONDS * 1000) };
  }

  verifyViewToken(token: string): DocumentViewTokenPayload {
    try {
      return verifyPurposeToken("document_view", token, documentViewTokenPayloadSchema);
    } catch {
      throw new ApiException("DOCUMENT_URL_EXPIRED", "El enlace del documento venció o no es válido — pide uno nuevo.", HttpStatus.UNAUTHORIZED);
    }
  }
}
