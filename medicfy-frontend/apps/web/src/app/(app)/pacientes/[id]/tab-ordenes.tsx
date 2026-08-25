"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, apiFetchBlob, apiUpload } from "@/lib/api-client";
import type { TimelineLabOrder, TimelineStandaloneResult } from "@/lib/use-patient-clinical";
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

const STANDALONE_STATUS_LABEL: Record<TimelineStandaloneResult["status"], string> = {
  PENDING_REVIEW: "Pendiente de revisión",
  REVIEWED: "Revisado",
};

export function TabOrdenes({
  accessToken,
  patientId,
  labOrders,
  standaloneResults,
  onChanged,
}: {
  accessToken: string;
  patientId: string;
  labOrders: TimelineLabOrder[];
  standaloneResults: TimelineStandaloneResult[];
  onChanged: () => void;
}) {
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isUploadingStandalone, setIsUploadingStandalone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const standaloneFileInputRef = useRef<HTMLInputElement | null>(null);

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

  async function downloadPdf(labOrderId: string) {
    setError(null);
    setDownloadingId(labOrderId);
    try {
      const blob = await apiFetchBlob(`/lab-orders/${labOrderId}/pdf`, { accessToken });
      if (blob) window.open(URL.createObjectURL(blob), "_blank");
    } catch (err) {
      setError(err);
    } finally {
      setDownloadingId(null);
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

  // §6.7: lab_order_id es NULLABLE en el modelo — un resultado puede
  // subirse sin estar ligado a una orden emitida por Medicfy (p. ej.
  // estudios que el paciente ya trae de otro lado). El backend ya
  // acepta labOrderId opcional (lab-results.controller.ts); esto solo
  // conecta esa ruta que no tenía UI.
  async function uploadStandaloneResult(file: File) {
    setError(null);
    setIsUploadingStandalone(true);
    try {
      await apiUpload(`/lab-results/patients/${patientId}`, file, { accessToken });
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setIsUploadingStandalone(false);
    }
  }

  // M10-RN-001: "la orden pertenece a un encuentro, igual que la
  // receta" — no se puede emitir desde aquí directamente, el botón
  // abre (o continúa) una consulta, donde vive el panel real.
  const actionsHeader = (
    <div className="flex flex-wrap items-center gap-3">
      <Link href={`/consulta/paciente/${patientId}`}>
        <Button type="button" variant="secondary" className="min-h-11 px-3 text-sm">
          + Ordenar estudio
        </Button>
      </Link>
      <input
        ref={standaloneFileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadStandaloneResult(file);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="secondary"
        isLoading={isUploadingStandalone}
        onClick={() => standaloneFileInputRef.current?.click()}
        className="min-h-11 px-3 text-sm"
      >
        Subir resultado
      </Button>
    </div>
  );

  const standaloneSection = standaloneResults.length > 0 && (
    <div>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Resultados sin orden</h3>
      <ul className="flex flex-col gap-2">
        {standaloneResults.map((r) => (
          <li key={r.id}>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-medium text-gray-900">{r.labName || "Resultado sin nombre de laboratorio"}</p>
                  <p className="text-sm text-gray-500">
                    {r.resultDate ? `Fecha del estudio: ${formatMxDate(r.resultDate)} · ` : ""}
                    Subido {formatMxDate(r.uploadedAt)} por {r.uploadedByRole === "DOCTOR" ? "el médico" : "el paciente"}
                  </p>
                </div>
                <span
                  className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium ${
                    r.status === "REVIEWED" ? "border-success-600 text-success-600" : "border-warn-600 text-warn-600"
                  }`}
                >
                  {STANDALONE_STATUS_LABEL[r.status]}
                </span>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );

  if (labOrders.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {actionsHeader}
        {error ? <ErrorState error={error} /> : null}
        {standaloneResults.length === 0 ? (
          <EmptyState
            title="Sin órdenes de laboratorio"
            description="Ordena un estudio desde una consulta, o sube directo un resultado que el paciente ya traiga de otro lado."
          />
        ) : (
          standaloneSection
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {actionsHeader}
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
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  isLoading={downloadingId === o.id}
                  onClick={() => void downloadPdf(o.id)}
                  className="min-h-11 px-3 text-sm"
                >
                  Descargar PDF
                </Button>
                {o.status !== "CANCELLED" && (
                  <>
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
                  </>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {standaloneSection}
    </div>
  );
}
