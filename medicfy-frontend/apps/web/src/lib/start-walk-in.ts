import { apiFetch } from "./api-client";

// Pedido explícito del usuario (2026-10-27): "iniciar consulta sin
// cita" y "iniciar consulta desde la agenda" deben llegar a LA MISMA
// pantalla (/consulta/[appointmentId]) — esto crea una cita real para
// ahora mismo (ver AppointmentStateMachineService.startWalkIn) y
// devuelve su id para navegar ahí. Sin esto, DOC-06 tendría que
// existir dos veces: una vez con cita y otra sin ella.
export async function startWalkInAppointment(patientId: string, accessToken: string): Promise<string> {
  const appointment = await apiFetch<{ id: string }>("/appointments/walk-in", {
    method: "POST",
    accessToken,
    body: { patientId },
  });
  return appointment.id;
}
