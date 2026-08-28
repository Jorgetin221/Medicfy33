import { HttpStatus, Injectable } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { ApiException } from "../../../common/api-exception";

// M8-RN-010/Fase 5 prompt 41: "URL prefirmada ≤5 min vía
// FileStoragePort" — mismo patrón que auth.service.ts usa para el
// token de sesión de MFA (jwt.sign con `purpose` + expiresIn corto,
// jwt.verify que colapsa firma inválida/vencida/purpose incorrecto en
// el mismo error genérico).
const DOCUMENT_VIEW_TOKEN_TTL_SECONDS = 5 * 60;

export interface DocumentViewTokenPayload {
  purpose: "document_view";
  documentId: string;
  patientId: string;
  sub: string;
}

function mustGetJwtSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET no está configurado.");
  }
  return secret;
}

@Injectable()
export class DocumentAccessService {
  signViewToken(documentId: string, patientId: string, doctorUserId: string): { token: string; expiresAt: Date } {
    const payload: DocumentViewTokenPayload = { purpose: "document_view", documentId, patientId, sub: doctorUserId };
    const token = jwt.sign(payload, mustGetJwtSecret(), { expiresIn: DOCUMENT_VIEW_TOKEN_TTL_SECONDS });
    return { token, expiresAt: new Date(Date.now() + DOCUMENT_VIEW_TOKEN_TTL_SECONDS * 1000) };
  }

  verifyViewToken(token: string): DocumentViewTokenPayload {
    let payload: DocumentViewTokenPayload;
    try {
      payload = jwt.verify(token, mustGetJwtSecret()) as DocumentViewTokenPayload;
    } catch {
      throw new ApiException("DOCUMENT_URL_EXPIRED", "El enlace del documento venció o no es válido — pide uno nuevo.", HttpStatus.UNAUTHORIZED);
    }
    if (payload.purpose !== "document_view") {
      throw new ApiException("DOCUMENT_URL_EXPIRED", "El enlace del documento venció o no es válido — pide uno nuevo.", HttpStatus.UNAUTHORIZED);
    }
    return payload;
  }
}
