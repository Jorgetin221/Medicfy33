import { HttpStatus } from "@nestjs/common";
import { ApiException } from "./api-exception";

// Fase 4b: receta/orden ya no exigen encuentro FIRMADO (M9-RN-002 solo
// exige que "pertenezca a un clinical_encounter", no que esté firmado
// — el MVP original lo restringía a SIGNED por prudencia, pero eso
// bloqueaba el flujo del médico: hoy documenta y firma en el mismo
// paso). Se permite DRAFT o SIGNED; el único borrador rechazado es uno
// ya abandonado (72 h, M8-RN-003) — mismo umbral que
// ClinicalEncounterService.assertDraft(), pero ahí ese método también
// rechaza SIGNED (que aquí sí es válido) así que no se reutiliza
// directo.
const ABANDONED_AFTER_HOURS = 72;

interface EncounterForEditabilityCheck {
  status: "DRAFT" | "SIGNED";
  startedAt: Date;
  abandonedAt: Date | null;
}

export function assertEncounterEditableForDocuments(
  encounter: EncounterForEditabilityCheck | null,
  errorCode: string
): void {
  if (!encounter) {
    throw new ApiException(errorCode, "El encuentro clínico no existe.", HttpStatus.UNPROCESSABLE_ENTITY);
  }
  if (encounter.status === "DRAFT") {
    const ageHours = (Date.now() - encounter.startedAt.getTime()) / (1000 * 60 * 60);
    const isAbandoned = encounter.abandonedAt !== null || ageHours > ABANDONED_AFTER_HOURS;
    if (isAbandoned) {
      throw new ApiException(
        errorCode,
        "Este borrador lleva más de 72 horas sin firmarse y se marcó como abandonado — no se pueden emitir documentos.",
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }
  }
}
