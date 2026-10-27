import { apiFetch, ApiError } from "./api-client";
import { clearAllDraftsLocally, clearDraftLocally, listLocalDraftEncounterIds, loadDraftRecordLocally } from "./offline-draft-store";

interface EncounterState {
  status: "DRAFT" | "SIGNED";
  updatedAt: string;
}

const SYNC_TIMEOUT_MS = 10_000;

// M-21: antes, cerrar sesión dejaba los borradores clínicos cifrados en
// el equipo (que en un consultorio suele ser compartido). Ahora cada
// respaldo local se sube al servidor si es más nuevo que lo que hay
// allá (A-20) y se borra; uno que ya no aplica (nota firmada, servidor
// más nuevo) se borra sin subir. Solo lo que no se pudo subir por falta
// de red se conserva, cifrado, para no perder texto clínico.
// Devuelve cuántos quedaron sin sincronizar.
export async function syncAndClearLocalDrafts(accessToken: string | null): Promise<number> {
  const ids = await listLocalDraftEncounterIds();
  let unsynced = 0;
  for (const encounterId of ids) {
    const record = await loadDraftRecordLocally(encounterId);
    if (!record) continue;
    try {
      const server = await apiFetch<EncounterState>(`/records/encounters/${encounterId}`, { accessToken, timeoutMs: SYNC_TIMEOUT_MS });
      if (server.status === "DRAFT" && record.updatedAt > new Date(server.updatedAt)) {
        await apiFetch(`/records/encounters/${encounterId}/note`, {
          method: "PATCH",
          accessToken,
          body: record.draft,
          timeoutMs: SYNC_TIMEOUT_MS,
        });
      }
      await clearDraftLocally(encounterId);
    } catch (error) {
      if (error instanceof ApiError && error.code === "NETWORK_ERROR") {
        unsynced += 1;
      } else {
        // El servidor ya no acepta este borrador (firmado, abandonado,
        // sin acceso): conservarlo no lo hace recuperable.
        await clearDraftLocally(encounterId);
      }
    }
  }
  if (unsynced === 0) await clearAllDraftsLocally();
  return unsynced;
}
