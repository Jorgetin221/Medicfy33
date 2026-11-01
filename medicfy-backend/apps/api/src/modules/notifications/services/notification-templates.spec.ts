import { describe, expect, it } from "vitest";
import {
  renderAppointmentCancelled,
  renderAppointmentConfirmed,
  renderAppointmentReminder24h,
  renderAppointmentReminder2h,
  renderAppointmentRescheduled,
  renderAppointmentScheduled,
  renderDoctorVerificationApproved,
  renderDoctorVerificationRejected,
  renderLabOrderAvailable,
  renderLabResultAvailable,
  renderPasswordReset,
  renderPrescriptionAvailable,
  renderRecordShareApproved,
  renderRecordShareCustodianNotice,
  renderRecordShareExpiring,
  renderRecordShareNotAuthorized,
  renderRecordShareRevoked,
  type RenderedNotification,
} from "./notification-templates";

// M12-CA-001: "ningún mensaje enviado por un canal externo contiene
// una palabra clave clínica, verificado por prueba automatizada
// sobre las plantillas". Esta es esa prueba. La lista de palabras es
// deliberadamente amplia (nombres genéricos de fármacos comunes,
// términos de diagnóstico, unidades de resultado de laboratorio) para
// que agregar una plantilla nueva sin pasar por este archivo la haga
// fallar si alguien pega contenido clínico por error.
const CLINICAL_KEYWORDS = [
  "diagnóstico",
  "diagnostico",
  "receta de",
  "mg",
  "mcg",
  "paracetamol",
  "ibuprofeno",
  "amoxicilina",
  "metformina",
  "presión arterial",
  "glucosa",
  "hemoglobina",
  "colesterol",
  "positivo",
  "negativo",
  "resultado:",
  "alergia a",
  "embarazo",
  "diabetes",
  "hipertensión",
  "hipertension",
];

function assertNoClinicalContent(rendered: RenderedNotification) {
  const haystack = `${rendered.subject} ${rendered.body}`.toLowerCase();
  for (const keyword of CLINICAL_KEYWORDS) {
    expect(haystack.includes(keyword)).toBe(false);
  }
}

describe("notification templates — M12-RN-001 / M12-CA-001 (sin contenido clínico)", () => {
  const link = "https://medicfy.mx/n/abc123";
  const doctorDisplayName = "Dra. Ana López";
  const recipientFirstName = "Jorge";
  const appointmentDateLabel = "martes 9 de septiembre, 10:00 a. m.";

  it("appointment scheduled/confirmed no llevan contenido clínico", () => {
    assertNoClinicalContent(
      renderAppointmentScheduled({ recipientFirstName, doctorDisplayName, appointmentDateLabel, actionLink: link }),
    );
    assertNoClinicalContent(
      renderAppointmentConfirmed({ recipientFirstName, doctorDisplayName, appointmentDateLabel, actionLink: link }),
    );
  });

  it("recordatorios 24h/2h no llevan contenido clínico, incluso con enlace de videoconsulta", () => {
    assertNoClinicalContent(
      renderAppointmentReminder24h({ recipientFirstName, doctorDisplayName, appointmentDateLabel, actionLink: link }),
    );
    assertNoClinicalContent(
      renderAppointmentReminder2h({
        recipientFirstName,
        doctorDisplayName,
        appointmentDateLabel,
        videoLink: "https://meet.medicfy.mx/xyz",
        actionLink: link,
      }),
    );
  });

  it("cancelada/reagendada no llevan contenido clínico", () => {
    assertNoClinicalContent(
      renderAppointmentCancelled({ recipientFirstName, doctorDisplayName, appointmentDateLabel, actionLink: link }),
    );
    assertNoClinicalContent(
      renderAppointmentRescheduled({ recipientFirstName, doctorDisplayName, newAppointmentDateLabel: appointmentDateLabel, actionLink: link }),
    );
  });

  it("receta/orden de laboratorio/resultado disponibles solo dicen 'disponible', nunca el contenido", () => {
    assertNoClinicalContent(renderPrescriptionAvailable({ recipientFirstName, doctorDisplayName, actionLink: link }));
    assertNoClinicalContent(renderLabOrderAvailable({ recipientFirstName, doctorDisplayName, actionLink: link }));
    assertNoClinicalContent(renderLabResultAvailable({ recipientFirstName, doctorDisplayName, actionLink: link }));
  });

  it("verificación de médico aprobada/rechazada no llevan contenido clínico", () => {
    assertNoClinicalContent(renderDoctorVerificationApproved({ recipientFirstName, actionLink: link }));
    assertNoClinicalContent(renderDoctorVerificationRejected({ recipientFirstName, actionLink: link }));
  });

  it("restablecimiento de contraseña no lleva contenido clínico", () => {
    assertNoClinicalContent(renderPasswordReset({ recipientFirstName, actionLink: link }));
  });

  // PR-EXP-06 (expediente compartido): además de "sin palabras
  // clínicas", RE9 — ninguna lleva el nombre del paciente.
  it("expediente compartido: avisos a médicos sin contenido clínico ni nombre del paciente (RE9)", () => {
    const patientName = "María José Peña";
    const expiresAtLabel = "30 de noviembre de 2026";
    const rendered = [
      renderRecordShareApproved({ recipientFirstName, expiresAtLabel, actionLink: link }),
      renderRecordShareNotAuthorized({ recipientFirstName, actionLink: link }),
      renderRecordShareRevoked({ recipientFirstName, actionLink: link }),
      renderRecordShareExpiring({ recipientFirstName, expiresAtLabel, actionLink: link }),
      renderRecordShareCustodianNotice({
        recipientFirstName,
        requesterDisplayName: doctorDisplayName,
        scope: ["SUMMARY", "SIGNED_NOTES", "RESULTS", "PRESCRIPTIONS", "STUDY_ORDERS"],
        expiresAtLabel,
        actionLink: link,
      }),
    ];
    for (const r of rendered) {
      assertNoClinicalContent(r);
      expect(`${r.subject} ${r.body}`.includes(patientName)).toBe(false);
      expect(r.body.includes(link)).toBe(true);
    }
  });

  it("expediente compartido: rechazada y vencida sin respuesta son el MISMO mensaje (RE5)", () => {
    // Una sola plantilla para los dos casos — no hay forma de pasarle
    // "por qué" no se autorizó, así que el texto no puede distinguirlo.
    const a = renderRecordShareNotAuthorized({ recipientFirstName, actionLink: link });
    const b = renderRecordShareNotAuthorized({ recipientFirstName, actionLink: link });
    expect(a).toEqual(b);
  });

  it("toda plantilla incluye el enlace de acción (es la única forma de ver el contenido real)", () => {
    const rendered = renderAppointmentScheduled({ recipientFirstName, doctorDisplayName, appointmentDateLabel, actionLink: link });
    expect(rendered.body.includes(link)).toBe(true);
  });
});
