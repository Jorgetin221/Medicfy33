"use client";

import { useState } from "react";
import { apiFetch, apiFetchBlob } from "@/lib/api-client";
import type { TimelinePrescription } from "@/lib/use-patient-clinical";
import { Card, EmptyState, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

const MX_TIME_ZONE = "America/Mexico_City";
function formatMxDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "long" }).format(new Date(iso));
}

const STATUS_LABEL: Record<TimelinePrescription["status"], string> = {
  ISSUED: "Vigente",
  CANCELLED: "Cancelada",
  PENDING_HANDWRITTEN_SIGNATURE: "Pendiente de firma autógrafa",
};
const STATUS_CLASS: Record<TimelinePrescription["status"], string> = {
  ISSUED: "border-success-600 text-success-600",
  CANCELLED: "border-danger-600 text-danger-600",
  PENDING_HANDWRITTEN_SIGNATURE: "border-warn-600 text-warn-600",
};

// M9-RN-006: cancelar nunca modifica la receta original — inserta
// PrescriptionCancellation. El folio/contenido de la receta ya
// emitida es inmutable siempre (R1).
export function TabRecetas({
  accessToken,
  prescriptions,
  onChanged,
}: {
  accessToken: string;
  prescriptions: TimelinePrescription[];
  onChanged: () => void;
}) {
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function cancelPrescription(id: string) {
    const reason = window.prompt("Motivo de cancelación:");
    if (!reason) return;
    setError(null);
    setCancellingId(id);
    try {
      await apiFetch(`/prescriptions/${id}/cancel`, { method: "POST", accessToken, body: { reason } });
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setCancellingId(null);
    }
  }

  // Corrección v2.1 §17.4: declaración manual del médico de que ya
  // firmó a mano y entregó la receta — nunca una verificación
  // automática. Vive aquí (no en el panel de emisión) porque el
  // médico puede cerrar ese panel antes de firmar físicamente.
  async function confirmHandwrittenDelivery(id: string) {
    if (!window.confirm("¿Confirmas que ya firmaste esta receta a mano y se la entregaste al paciente?")) return;
    setError(null);
    setConfirmingId(id);
    try {
      await apiFetch(`/prescriptions/${id}/confirm-handwritten-delivery`, { method: "POST", accessToken });
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setConfirmingId(null);
    }
  }

  async function downloadPdf(id: string) {
    setError(null);
    setDownloadingId(id);
    try {
      const blob = await apiFetchBlob(`/prescriptions/${id}/pdf`, { accessToken });
      if (blob) window.open(URL.createObjectURL(blob), "_blank");
    } catch (err) {
      setError(err);
    } finally {
      setDownloadingId(null);
    }
  }

  if (prescriptions.length === 0) {
    return <EmptyState title="Sin recetas emitidas" description="Las recetas que emitas desde una consulta aparecerán aquí." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <ErrorState error={error} /> : null}
      <ul className="flex flex-col gap-3">
        {prescriptions.map((p) => (
          <li key={p.id}>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-medium text-gray-900">
                    Folio {p.folio} — {formatMxDate(p.issuedAt)}
                  </p>
                  <p className="text-sm text-gray-500">{p.diagnosisSnapshot}</p>
                </div>
                <span className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium ${STATUS_CLASS[p.status]}`}>
                  {STATUS_LABEL[p.status]}
                </span>
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {p.items.map((item, i) => (
                  <li key={i} className="text-base text-gray-900">
                    {item.genericName} — {item.dose}, {item.route}, {item.frequency}, {item.duration}
                  </li>
                ))}
              </ul>
              {p.qrVerificationToken && (
                <p className="mt-2 break-all text-sm text-gray-500">
                  Verificación: <span className="font-mono">/verificar/{p.qrVerificationToken}</span>
                </p>
              )}
              {p.prescriptionType === "ELECTRONIC" && (
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    isLoading={downloadingId === p.id}
                    onClick={() => void downloadPdf(p.id)}
                    className="min-h-11 px-3 text-sm"
                  >
                    Descargar PDF
                  </Button>
                  {p.status === "PENDING_HANDWRITTEN_SIGNATURE" && (
                    <Button
                      type="button"
                      isLoading={confirmingId === p.id}
                      onClick={() => void confirmHandwrittenDelivery(p.id)}
                      className="min-h-11 px-3 text-sm"
                    >
                      Marcar como firmada y entregada
                    </Button>
                  )}
                  {p.status !== "CANCELLED" && (
                    <Button
                      type="button"
                      variant="danger"
                      isLoading={cancellingId === p.id}
                      onClick={() => void cancelPrescription(p.id)}
                      className="min-h-11 px-3 text-sm"
                    >
                      Cancelar receta
                    </Button>
                  )}
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
