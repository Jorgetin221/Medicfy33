"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClinicalNoteDraftUpdateInput } from "@medicfy/contracts";
import { apiFetch, ApiError } from "./api-client";
import { saveDraftLocally, clearDraftLocally } from "./offline-draft-store";
import type { SaveState } from "@/components/ui/save-indicator";

// Prompt 15: "autoguardado con rebote de 2 segundos y también al
// perder el foco". El rebote sustituye al intervalo fijo de 10s del
// borrador anterior de CLAUDE.md §6 — el documento de 58 prompts es
// la letra vigente.
const AUTOSAVE_DEBOUNCE_MS = 2_000;

// El asistente clínico lee el borrador DEL SERVIDOR. Si el médico
// escribe un signo vital y dispara un pase antes del rebote de 2 s, el
// modelo leería la versión anterior — "la IA no toma los signos
// vitales". La pestaña del asistente vive en otro árbol de componentes
// que el formulario, así que el hook registra aquí su "guardar ya" por
// encuentro y flushEncounterDraft() lo invoca antes de cada pase.
const draftFlushers = new Map<string, () => Promise<void>>();

export async function flushEncounterDraft(encounterId: string): Promise<void> {
  await draftFlushers.get(encounterId)?.();
}

interface UseEncounterAutosaveArgs {
  encounterId: string | null;
  accessToken: string | null;
  values: ClinicalNoteDraftUpdateInput;
  // false mientras el encounter ya está SIGNED (solo lectura) o
  // mientras aún no se resolvió — no tiene caso autoguardar entonces.
  enabled: boolean;
}

// DOC-06/CLAUDE.md §5-§6: "Autoguardado cada 10s con funcionamiento
// sin conexión" + "indicador visible". El servidor es la fuente
// primaria mientras hay red; IndexedDB cifrado (offline-draft-store)
// es la red de seguridad solo para cuando PATCH falla por falta de
// conexión — nunca para errores reales del servidor (esos se
// exponen como fatalError, no se reintentan silenciosamente).
export function useEncounterAutosave({ encounterId, accessToken, values, enabled }: UseEncounterAutosaveArgs) {
  const [saveState, setSaveState] = useState<SaveState>("guardado");
  const [fatalError, setFatalError] = useState<unknown>(null);
  // Prompt 15: "indicador visible de guardado con la hora".
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const valuesRef = useRef(values);
  valuesRef.current = values;
  const lastSavedJsonRef = useRef<string>(JSON.stringify(values));
  const savingRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const attemptSave = useCallback(async () => {
    if (!encounterId || !accessToken || !enabledRef.current || savingRef.current) return;
    const currentJson = JSON.stringify(valuesRef.current);
    if (currentJson === lastSavedJsonRef.current) return;

    let finishInFlight: () => void = () => undefined;
    inFlightRef.current = new Promise<void>((resolve) => {
      finishInFlight = resolve;
    });
    savingRef.current = true;
    setSaveState("guardando");
    try {
      await apiFetch(`/records/encounters/${encounterId}/note`, {
        method: "PATCH",
        accessToken,
        body: valuesRef.current,
      });
      lastSavedJsonRef.current = currentJson;
      setSaveState("guardado");
      setLastSavedAt(new Date());
      setFatalError(null);
      await clearDraftLocally(encounterId);
    } catch (error) {
      const isNetworkError = error instanceof ApiError && error.code === "NETWORK_ERROR";
      if (isNetworkError) {
        const backedUp = await saveDraftLocally(encounterId, valuesRef.current);
        setSaveState(backedUp ? "sin-conexion" : "sin-respaldo");
      } else {
        // Error real del servidor (p. ej. ENCOUNTER_ALREADY_SIGNED,
        // ENCOUNTER_ABANDONED) — reintentar cada 10s no lo resuelve;
        // la pantalla decide qué hacer (típicamente pasar a
        // solo-lectura), no este hook.
        setFatalError(error);
      }
    } finally {
      savingRef.current = false;
      inFlightRef.current = null;
      finishInFlight();
    }
  }, [encounterId, accessToken]);

  // Si ya hay un guardado en vuelo, se espera y luego se guarda lo que
  // haya cambiado mientras tanto.
  useEffect(() => {
    if (!encounterId) return undefined;
    const flush = async () => {
      if (inFlightRef.current) await inFlightRef.current;
      await attemptSave();
    };
    draftFlushers.set(encounterId, flush);
    return () => {
      if (draftFlushers.get(encounterId) === flush) draftFlushers.delete(encounterId);
    };
  }, [encounterId, attemptSave]);

  // Rebote de 2s: cada cambio de valores reinicia el temporizador; a
  // los 2s de quietud, se guarda.
  const valuesJson = JSON.stringify(values);
  useEffect(() => {
    if (!encounterId || !accessToken || !enabled) return undefined;
    if (valuesJson === lastSavedJsonRef.current) return undefined;
    const timeout = setTimeout(() => {
      void attemptSave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [encounterId, accessToken, enabled, attemptSave, valuesJson]);

  // "también al perder el foco" — el blur de la ventana guarda ya.
  useEffect(() => {
    function handleWindowBlur() {
      void attemptSave();
    }
    window.addEventListener("blur", handleWindowBlur);
    return () => window.removeEventListener("blur", handleWindowBlur);
  }, [attemptSave]);

  // "Perder texto clínico por un fallo de red es el peor bug posible
  // en este producto" (CLAUDE.md §5) — no esperar hasta 10s si el
  // médico ya está saliendo de la pestaña.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") void attemptSave();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [attemptSave]);

  return {
    saveState,
    lastSavedAt,
    fatalError,
    clearFatalError: () => setFatalError(null),
    saveNow: attemptSave,
  };
}
