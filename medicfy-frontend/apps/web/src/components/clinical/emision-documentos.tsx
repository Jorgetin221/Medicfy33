"use client";

import { useEffect, useState } from "react";
import { apiFetchBlob, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { PrescriptionPanel } from "@/components/clinical/prescription-panel";
import { LabOrderPanel } from "@/components/clinical/lab-order-panel";

// Fase 4 / prompts 32-38A — el PLAN DEL PACIENTE: receta, órdenes de
// estudio e indicaciones son documentos independientes ("el paciente
// recibe solo lo que le corresponde"), cada uno con su PDF y su
// bitácora de emisión e impresión. Fase 4b: ya no exige nota firmada
// (encounter-editable.util.ts en el backend) — este bloque vive tanto
// en la nota en borrador (ConsultaForm) como en la vista post-firma.
export function EmisionDocumentos({
  accessToken,
  encounterId,
  patientId,
  defaultDiagnosis,
  hasPatientInstructions,
  onNextPatient,
  onOpenStateChange,
}: {
  accessToken: string;
  encounterId: string;
  patientId: string;
  defaultDiagnosis: string;
  // La nota firmada capturó indicaciones al paciente → hay PDF propio.
  hasPatientInstructions: boolean;
  // Prompt 16: encadenar — presente solo justo después de firmar.
  onNextPatient?: () => void;
  // Fase 4b: el formulario de la nota lo usa para no dejar firmar
  // mientras un panel de receta/orden está abierto con edición sin
  // guardar (ver ConsultaForm).
  onOpenStateChange?: (isOpen: boolean) => void;
}) {
  const [rxOpen, setRxOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);

  useEffect(() => {
    onOpenStateChange?.(rxOpen || labOpen);
  }, [rxOpen, labOpen, onOpenStateChange]);
  const [isDownloadingIndicaciones, setIsDownloadingIndicaciones] = useState(false);
  const [indicacionesError, setIndicacionesError] = useState<unknown>(null);

  async function downloadIndicaciones() {
    setIndicacionesError(null);
    setIsDownloadingIndicaciones(true);
    try {
      const blob = await apiFetchBlob(`/records/encounters/${encounterId}/indicaciones/pdf`, { accessToken });
      if (!blob) {
        setIndicacionesError(new Error("No se encontró el PDF de indicaciones."));
        return;
      }
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (error) {
      setIndicacionesError(error);
    } finally {
      setIsDownloadingIndicaciones(false);
    }
  }

  return (
    <Card data-testid="emision-documentos">
      <p className="text-sm font-medium text-gray-500">Documentos de esta consulta</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={() => setRxOpen(true)} className="min-h-11 px-3 text-sm">
          Emitir receta
        </Button>
        <Button type="button" variant="secondary" onClick={() => setLabOpen(true)} className="min-h-11 px-3 text-sm">
          Ordenar estudios
        </Button>
        {hasPatientInstructions ? (
          <Button
            type="button"
            variant="secondary"
            isLoading={isDownloadingIndicaciones}
            onClick={() => void downloadIndicaciones()}
            className="min-h-11 px-3 text-sm"
          >
            Imprimir indicaciones al paciente
          </Button>
        ) : null}
        {onNextPatient ? (
          <Button type="button" onClick={onNextPatient} className="min-h-11 px-4">
            Siguiente paciente
          </Button>
        ) : null}
      </div>
      {indicacionesError ? (
        <Aviso variant="advertencia" title="No se pudo abrir el PDF de indicaciones">
          {indicacionesError instanceof ApiError ? indicacionesError.message : "Intenta de nuevo."}
        </Aviso>
      ) : null}

      <PrescriptionPanel
        open={rxOpen}
        onClose={() => setRxOpen(false)}
        accessToken={accessToken}
        encounterId={encounterId}
        patientId={patientId}
        defaultDiagnosis={defaultDiagnosis}
        onIssued={() => undefined}
      />
      <LabOrderPanel open={labOpen} onClose={() => setLabOpen(false)} accessToken={accessToken} encounterId={encounterId} onIssued={() => undefined} />
    </Card>
  );
}
