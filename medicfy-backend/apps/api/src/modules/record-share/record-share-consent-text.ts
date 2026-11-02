import { SHARE_DURATION_DAYS_OPTIONS } from "@medicfy/contracts";
import { sha256Hex } from "./record-share-crypto.util";

// 🔒 PENDIENTE REVISIÓN LEGAL (D-EXP-12). Texto definido por el usuario
// el 2026-11-02. A diferencia de la versión anterior (reglas fijas, sin
// datos de la solicitud), este texto SÍ lleva el nombre del médico que
// solicita y la fecha de vencimiento: el paciente debe leer exactamente
// eso. Por eso no hay una sola constante que hashear — se hashea el
// texto YA COMPLETADO que vio el paciente (texto + casilla), y el
// servidor vuelve a completarlo al decidir para comprobar que coincide.
//
// Espejo legible: docs/expediente-compartido/consentimiento-v0.md.
export const RECORD_SHARE_CONSENT_VERSION = "v1-2026-11-02";

const MEXICO_TIME_ZONE = "America/Mexico_City";
const DATE_FORMAT = new Intl.DateTimeFormat("es-MX", { timeZone: MEXICO_TIME_ZONE, dateStyle: "long" });
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface RenderedRecordShareConsent {
  durationDays: number;
  text: string;
  acknowledgement: string;
  // sha256 de `text` + casilla: lo que se guarda como evidencia.
  sha256: string;
}

export function renderRecordShareConsent(requesterName: string, durationDays: number, startsAt: Date): RenderedRecordShareConsent {
  const expiresAt = new Date(startsAt.getTime() + durationDays * ONE_DAY_MS);
  const text = `Autorizar acceso a tu expediente

El/la Dr(a). ${requesterName} solicita ver tu expediente clínico.

Si autorizas, podrá consultar en modo solo lectura la información registrada por los médicos que te han atendido en Medicfy, incluyendo:

• Notas de consulta, diagnósticos y tratamientos
• Recetas
• Estudios de laboratorio e imagen
• Alergias y antecedentes

El acceso:

• Será únicamente para tu atención médica.
• Estará vigente hasta el ${DATE_FORMAT.format(expiresAt)}.
• Quedará registrado, y podrás ver cuándo lo consultó.
• Puedes revocarlo en cualquier momento desde tu cuenta.`;
  const acknowledgement = `Entiendo que el/la Dr(a). ${requesterName} podrá ver la información que otros médicos registraron sobre mí y autorizo el acceso.`;
  return { durationDays, text, acknowledgement, sha256: sha256Hex(`${text}\n\n${acknowledgement}`) };
}

// Nombre legal (sin "Dr." del nombre público, que el texto ya antepone).
export function requesterLegalName(doctor: { legalFirstName: string; legalLastName: string }): string {
  return `${doctor.legalFirstName} ${doctor.legalLastName}`.trim();
}

// El texto completado para cada duración que el paciente puede elegir
// (nunca más larga que la pedida). Se calcula en el servidor: ninguna
// fecha se calcula en el navegador.
export function consentOptionsFor(requestedDurationDays: number, requesterName: string, now: Date): RenderedRecordShareConsent[] {
  return SHARE_DURATION_DAYS_OPTIONS.filter((days) => days <= requestedDurationDays).map((days) =>
    renderRecordShareConsent(requesterName, days, now)
  );
}
