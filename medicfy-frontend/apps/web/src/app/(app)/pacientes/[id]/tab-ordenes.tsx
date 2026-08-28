"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, apiFetchBlob, apiUpload } from "@/lib/api-client";
import { blobToDataUrl } from "@/lib/blob-to-data-url";
import type { TimelineLabOrder, TimelineStandaloneResult } from "@/lib/use-patient-clinical";
import { Card, EmptyState, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { PdfViewer } from "@/components/clinical/pdf-viewer";

// Un resultado subido — GET /lab-results/patients/:patientId, la
// misma forma que devuelve el POST de subida. TimelineLabOrder /
// TimelineStandaloneResult (use-patient-clinical.ts) no traen
// labOrderId por resultado ni el resultId de cada archivo, así que no
// alcanzan para armar el botón "Ver resultado" — esto sí.
interface LabResultRecord {
  id: string;
  labOrderId: string | null;
  labName: string | null;
  resultDate: string | null;
  uploadedAt: string;
  uploadedByRole: "DOCTOR" | "PATIENT";
  reviewedAt: string | null;
  doctorComment: string | null;
}

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

// Especificación §14 (M10, casos límite): "Estudios de imagen → se
// aceptan como adjunto PDF/JPG; sin visor DICOM." Se agrega PNG por
// ser el mismo trío que ya acepta el resto de la app para documentos
// escaneados (§9, perfil del médico). El servidor (labResultFileFilter,
// lab-results.controller.ts) es la autoridad real — esto es solo el
// filtro nativo del selector de archivo y el texto de ayuda.
const LAB_RESULT_ACCEPT = "application/pdf,image/jpeg,image/png";
const LAB_RESULT_FORMAT_HINT = "PDF, JPG o PNG · máx. 10 MB";

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

  // Antes solo se mostraba el estado ("Pendiente de revisión") sin
  // ninguna forma de abrir el archivo — GET .../file ya existía en el
  // backend, solo faltaba conectarlo aquí.
  const [results, setResults] = useState<LabResultRecord[] | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  // "Ver sin descargar" pasó por dos intentos fallidos: window.open()
  // tras un await ya no cuenta como gesto directo del usuario para
  // varios navegadores (lo bloquean o lo mandan a descargas), y una
  // URL blob:/data: en un <iframe> depende de que ESE navegador traiga
  // habilitado su visor de PDF nativo — no es parejo entre navegadores
  // ni configuraciones. PdfViewer (pdf.js) dibuja el PDF con Canvas,
  // sin depender de ningún visor externo. Para imágenes sí basta un
  // <img> normal — ahí nunca hubo el problema.
  const [preview, setPreview] = useState<{ mimeType: string; pdfData: ArrayBuffer | null; imageUrl: string | null; downloadUrl: string } | null>(null);

  const loadResults = useCallback(() => {
    apiFetch<LabResultRecord[]>(`/lab-results/patients/${patientId}`, { accessToken })
      .then(setResults)
      .catch(setError);
  }, [patientId, accessToken]);

  useEffect(loadResults, [loadResults]);

  async function viewResult(resultId: string) {
    setError(null);
    setViewingId(resultId);
    try {
      const blob = await apiFetchBlob(`/lab-results/patients/${patientId}/${resultId}/file`, { accessToken });
      if (!blob) return;
      const downloadUrl = URL.createObjectURL(blob);
      if (blob.type === "application/pdf") {
        setPreview({ mimeType: blob.type, pdfData: await blob.arrayBuffer(), imageUrl: null, downloadUrl });
      } else {
        setPreview({ mimeType: blob.type, pdfData: null, imageUrl: await blobToDataUrl(blob), downloadUrl });
      }
    } catch (err) {
      setError(err);
    } finally {
      setViewingId(null);
    }
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.downloadUrl);
    setPreview(null);
  }

  async function markReviewed(resultId: string) {
    const doctorComment = window.prompt("Comentario de revisión (obligatorio):");
    if (!doctorComment || !doctorComment.trim()) return;
    setError(null);
    setReviewingId(resultId);
    try {
      await apiFetch(`/lab-results/patients/${patientId}/${resultId}/review`, { method: "POST", accessToken, body: { doctorComment } });
      loadResults();
    } catch (err) {
      setError(err);
    } finally {
      setReviewingId(null);
    }
  }

  function ResultRow({ result }: { result: LabResultRecord }) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-300 px-3 py-2">
        <div>
          <p className="text-base text-gray-900">
            {result.labName || "Resultado"}
            {result.resultDate ? ` · estudio del ${formatMxDate(result.resultDate)}` : ""}
          </p>
          <p className="text-sm text-gray-500">
            Subido {formatMxDate(result.uploadedAt)} por {result.uploadedByRole === "DOCTOR" ? "el médico" : "el paciente"}
            {result.doctorComment ? ` · "${result.doctorComment}"` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium ${
              result.reviewedAt ? "border-success-600 text-success-600" : "border-warn-600 text-warn-600"
            }`}
          >
            {result.reviewedAt ? "Revisado" : "Pendiente de revisión"}
          </span>
          <Button type="button" variant="secondary" isLoading={viewingId === result.id} onClick={() => void viewResult(result.id)} className="min-h-11 px-3 text-sm">
            Ver resultado
          </Button>
          {!result.reviewedAt ? (
            <Button
              type="button"
              variant="secondary"
              isLoading={reviewingId === result.id}
              onClick={() => void markReviewed(result.id)}
              className="min-h-11 px-3 text-sm"
            >
              Marcar como revisado
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

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
      loadResults();
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
      loadResults();
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
        accept={LAB_RESULT_ACCEPT}
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
      <span className="text-sm text-gray-500">{LAB_RESULT_FORMAT_HINT}</span>
    </div>
  );

  const standaloneSection = standaloneResults.length > 0 && (
    <div>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Resultados sin orden</h3>
      <ul className="flex flex-col gap-2">
        {standaloneResults.map((r) => {
          const loaded = results?.find((full) => full.id === r.id);
          return (
            <li key={r.id}>
              {loaded ? (
                <ResultRow result={loaded} />
              ) : (
                // Mientras carga /lab-results/patients/:id (loadResults),
                // se muestra el resumen que ya trajo el timeline del
                // paciente para no dejar la pantalla en blanco.
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
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  const previewPanel = (
    <Panel open={preview !== null} onClose={closePreview} title="Resultado de laboratorio" wide>
      {preview ? (
        <div className="flex flex-col gap-3">
          <a href={preview.downloadUrl} download className="w-fit text-sm font-medium text-brand-700 underline">
            Descargar archivo original
          </a>
          {preview.pdfData ? (
            <PdfViewer data={preview.pdfData} />
          ) : preview.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URL, no Next Image loader aplica
            <img src={preview.imageUrl} alt="Resultado de laboratorio" className="max-w-full" />
          ) : null}
        </div>
      ) : null}
    </Panel>
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
        {previewPanel}
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
              {results && results.some((r) => r.labOrderId === o.id) ? (
                <div className="mt-3 flex flex-col gap-2">
                  {results
                    .filter((r) => r.labOrderId === o.id)
                    .map((r) => (
                      <ResultRow key={r.id} result={r} />
                    ))}
                </div>
              ) : null}
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
                      accept={LAB_RESULT_ACCEPT}
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
                    <span className="text-sm text-gray-500">{LAB_RESULT_FORMAT_HINT}</span>
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
      {previewPanel}
    </div>
  );
}
