"use client";

import { useRef, useState } from "react";
import { apiFetch, apiUpload } from "@/lib/api-client";
import type { TimelineLabOrder } from "@/lib/use-patient-clinical";
import { Card, EmptyState, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

const MX_TIME_ZONE = "America/Mexico_City";
function formatMxDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "long" }).format(new Date(iso));
}

const STATUS_LABEL: Record<TimelineLabOrder["status"], string> = {
  ISSUED: "Pendiente",
  RESULTS_UPLOADED: "Con resultados",
  CANCELLED: "Cancelada",
};

export function TabOrdenes({
  accessToken,
  patientId,
  labOrders,
  onChanged,
}: {
  accessToken: string;
  patientId: string;
  labOrders: TimelineLabOrder[];
  onChanged: () => void;
}) {
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function cancelOrder(id: string) {
    const reason = window.prompt("Motivo de cancelación:");
    if (!reason) return;
    setError(null);
    setCancellingId(id);
    try {
      await apiFetch(`/lab-orders/${id}/cancel`, { method: "POST", accessToken, body: { reason } });
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setCancellingId(null);
    }
  }

  async function uploadResult(labOrderId: string, file: File) {
    setError(null);
    setUploadingId(labOrderId);
    try {
      await apiUpload(`/lab-results/patients/${patientId}?labOrderId=${labOrderId}`, file, { accessToken });
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setUploadingId(null);
    }
  }

  if (labOrders.length === 0) {
    return <EmptyState title="Sin órdenes de laboratorio" description="Las órdenes que emitas desde una consulta aparecerán aquí." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <ErrorState error={error} /> : null}
      <ul className="flex flex-col gap-3">
        {labOrders.map((o) => (
          <li key={o.id}>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-medium text-gray-900">
                    Folio {o.folio} — {formatMxDate(o.issuedAt)}
                  </p>
                  <p className="text-sm text-gray-500">{o.clinicalIndication}</p>
                </div>
                <span
                  className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium ${
                    o.status === "CANCELLED" ? "border-danger-600 text-danger-600" : "border-success-600 text-success-600"
                  }`}
                >
                  {STATUS_LABEL[o.status]}
                </span>
              </div>
              <ul className="mt-2 flex flex-col gap-0.5">
                {o.items.map((item, i) => (
                  <li key={i} className="text-base text-gray-900">
                    {item.studyName}
                  </li>
                ))}
              </ul>
              {o.fastingRequired && <p className="mt-1 text-sm text-warn-600">Requiere ayuno</p>}
              <p className="mt-2 break-all text-sm text-gray-500">
                Verificación: <span className="font-mono">/verificar/{o.qrVerificationToken}</span>
              </p>
              {o.status !== "CANCELLED" && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <input
                    ref={(el) => {
                      fileInputRefs.current[o.id] = el;
                    }}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadResult(o.id, file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    isLoading={uploadingId === o.id}
                    onClick={() => fileInputRefs.current[o.id]?.click()}
                    className="min-h-11 px-3 text-sm"
                  >
                    Subir resultado
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    isLoading={cancellingId === o.id}
                    onClick={() => void cancelOrder(o.id)}
                    className="min-h-11 px-3 text-sm"
                  >
                    Cancelar orden
                  </Button>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
