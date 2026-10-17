import { apiFetch, expectArray } from "./api-client";

interface EncounterListItem {
  id: string;
  status: "DRAFT" | "SIGNED";
  appointmentId: string | null;
}

// La consulta abierta SIN cita del paciente: la que ya existe en
// borrador o una nueva (Primera vez si nunca se ha firmado otra,
// Seguimiento si sí). La usan "Iniciar consulta sin cita" y los botones
// "Emitir receta" / "Ordenar estudio" del expediente: M9-RN-002 exige
// que toda receta y orden pertenezca a una consulta, y así quedan en la
// misma que el médico ve al abrir la consulta del paciente.
export async function ensureOpenEncounter(patientId: string, accessToken: string): Promise<string> {
  const encounters = expectArray<EncounterListItem>(await apiFetch<unknown>(`/records/patients/${patientId}/encounters`, { accessToken }));
  const existingDraft = encounters.find((e) => e.status === "DRAFT" && !e.appointmentId);
  if (existingDraft) return existingDraft.id;

  const hasSignedBefore = encounters.some((e) => e.status === "SIGNED");
  const created = await apiFetch<{ id: string }>(`/records/patients/${patientId}/encounters`, {
    method: "POST",
    accessToken,
    body: { patientId, encounterType: hasSignedBefore ? "FOLLOW_UP" : "FIRST_VISIT" },
  });
  return created.id;
}
