"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MEDICAL_FILE_MAX_BYTES, resolveMedicalFileFormat } from "@medicfy/contracts";
import { apiFetch, apiUpload, expectArray } from "@/lib/api-client";
import { ensureOpenEncounter } from "@/lib/ensure-open-encounter";
import { LabOrderPanel } from "@/components/clinical/lab-order-panel";
import { Aviso } from "@/components/ui/alert";
import type { TimelineLabOrder, TimelineStandaloneResult } from "@/lib/use-patient-clinical";
import { Card, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { FileDropZone } from "@/components/ui/file-drop-zone";
import { DocumentTile, DocumentViewer } from "@/components/clinical/document-tile";
import { useI18n } from "@/lib/i18n/context";
import { formatDateLong } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

// Un resultado subido — GET /lab-results/patients/:patientId, la
// misma forma que devuelve el POST de subida. TimelineLabOrder /
// TimelineStandaloneResult (use-patient-clinical.ts) no traen
// labOrderId por resultado ni el resultId de cada archivo, así que no
// alcanzan para armar el botón "Ver resultado" — esto sí.
interface LabResultRecord {
  id: string;
  // Nombre con el que se subió (null en resultados anteriores a 2026-10-16).
  originalFileName?: string | null;
  labOrderId: string | null;
  labName: string | null;
  resultDate: string | null;
  uploadedAt: string;
  uploadedByRole: "DOCTOR" | "PATIENT";
  reviewedAt: string | null;
  doctorComment: string | null;
}


const STATUS_LABEL_KEYS: Record<TimelineLabOrder["status"], MessageKey> = {
  ISSUED: "pacientes.ordenes.estado.ISSUED",
  RESULTS_UPLOADED: "pacientes.ordenes.estado.RESULTS_UPLOADED",
  CANCELLED: "pacientes.ordenes.estado.CANCELLED",
};

// Todos los formatos clínicos del catálogo compartido (PDF, imágenes,
// DICOM, Office, texto, HL7, video) — el mismo que valida el servidor.
// Se validan en canUpload(), no con `accept` en el <input>: Safari
// bloqueaba el botón "Cargar" incluso con un PDF (lib/file-accept.ts).
const BYTES_PER_MB = 1024 * 1024;

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
  const { t, locale } = useI18n();
  const { askReason, dialog } = useConfirmDialog();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [isUploadingStandalone, setIsUploadingStandalone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Consulta a la que se liga la orden nueva (ver ensureOpenEncounter).
  const [orderEncounterId, setOrderEncounterId] = useState<string | null>(null);
  const [isOpeningOrder, setIsOpeningOrder] = useState(false);
  // Formato o tamaño no válido: se avisa ANTES de subir, con el motivo.
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const standaloneFileInputRef = useRef<HTMLInputElement | null>(null);

  const [results, setResults] = useState<LabResultRecord[] | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  // Cada orden y cada resultado se muestran como una "mini carpeta" que
  // abre el documento en el visor del sistema (DocumentViewer), sin
  // descargarlo ni depender del visor de PDF del navegador.
  const [viewing, setViewing] = useState<{ title: string; path: string; downloadName: string } | null>(null);

  const loadResults = useCallback(() => {
    apiFetch<unknown>(`/lab-results/patients/${patientId}`, { accessToken })
      .then((data) => setResults(expectArray<LabResultRecord>(data)))
      .catch(setError);
  }, [patientId, accessToken]);

  useEffect(loadResults, [loadResults]);

  function resultTitle(result: LabResultRecord): string {
    return result.originalFileName || result.labName || t("pacientes.ordenes.resultado");
  }

  // Los resultados viven en su propio apartado: cada uno dice de qué
  // orden viene (o que llegó sin orden).
  function resultOrigin(result: LabResultRecord): string {
    const order = labOrders.find((o) => o.id === result.labOrderId);
    return order ? t("pacientes.ordenes.deLaOrden", { folio: order.folio }) : t("pacientes.ordenes.resultadoSinOrden");
  }

  function resultLabel(result: LabResultRecord): string {
    return (result.originalFileName && resolveMedicalFileFormat(result.originalFileName, "")?.label) || "LAB";
  }

  function canUpload(file: File): boolean {
    setUploadNotice(null);
    if (!resolveMedicalFileFormat(file.name, file.type)) {
      setUploadNotice(t("pacientes.ordenes.formatoNoPermitido", { nombre: file.name }));
      return false;
    }
    if (file.size > MEDICAL_FILE_MAX_BYTES) {
      setUploadNotice(t("pacientes.ordenes.archivoMuyGrande", { nombre: file.name, max: MEDICAL_FILE_MAX_BYTES / BYTES_PER_MB }));
      return false;
    }
    return true;
  }

  function openResult(result: LabResultRecord) {
    setViewing({
      title: resultTitle(result),
      path: `/lab-results/patients/${patientId}/${result.id}/file`,
      downloadName: result.originalFileName || `resultado-${result.uploadedAt.slice(0, 10)}`,
    });
  }

  function openOrder(order: TimelineLabOrder) {
    setViewing({
      title: t("pacientes.ordenes.ordenTitulo", { folio: order.folio }),
      path: `/lab-orders/${order.id}/pdf`,
      downloadName: `orden-${order.folio}.pdf`,
    });
  }

  async function markReviewed(resultId: string) {
    const doctorComment = await askReason({ title: t("pacientes.ordenes.revisarTitulo"), label: t("pacientes.ordenes.comentarioRevision"), minLength: 1 });
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

  function ResultTile({ result }: { result: LabResultRecord }) {
    return (
      <div className="flex flex-col gap-2">
        <DocumentTile
          title={resultTitle(result)}
          subtitle={`${formatDateLong(locale, result.resultDate ?? result.uploadedAt)} · ${resultOrigin(result)}`}
          fileLabel={resultLabel(result)}
          status={
            result.reviewedAt
              ? { label: t("pacientes.ordenes.revisado"), tone: "ok" }
              : { label: t("pacientes.ordenes.pendienteRevision"), tone: "pending" }
          }
          onOpen={() => openResult(result)}
        />
        {result.doctorComment ? (
          <p className="text-sm text-gray-700">{t("pacientes.ordenes.comentario", { texto: result.doctorComment })}</p>
        ) : null}
        {!result.reviewedAt ? (
          <Button
            type="button"
            variant="secondary"
            isLoading={reviewingId === result.id}
            onClick={() => void markReviewed(result.id)}
            className="min-h-11 px-3 text-sm"
          >
            {t("pacientes.ordenes.marcarRevisado")}
          </Button>
        ) : null}
      </div>
    );
  }

  async function cancelOrder(id: string) {
    const reason = await askReason({ title: t("pacientes.ordenes.cancelarTitulo"), label: t("pacientes.ordenes.motivoCancelacion"), destructive: true });
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
    if (!canUpload(file)) return;
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
    if (!canUpload(file)) return;
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

  // "Ordenar estudio" abre el panel de la orden aquí mismo (2026-10-17:
  // antes llevaba a una consulta nueva). M10-RN-001 — "la orden pertenece
  // a un encuentro" — se cumple ligándola a la consulta abierta sin cita
  // del paciente, que se crea en segundo plano si no existe.
  async function openNewOrder() {
    setError(null);
    setIsOpeningOrder(true);
    try {
      setOrderEncounterId(await ensureOpenEncounter(patientId, accessToken));
    } catch (err) {
      setError(err);
    } finally {
      setIsOpeningOrder(false);
    }
  }

  const allResults = results ?? [];

  // Dos columnas (pedido explícito, 2026-10-17): Resultados a la
  // izquierda con "Subir resultado", Órdenes a la derecha con
  // "+ Ordenar estudio", cada una con sus PDF debajo. Los resultados van
  // juntos en su apartado, nunca mezclados con las órdenes; cada carpeta
  // dice de qué orden viene. Se toman de /lab-results (traen el id del
  // archivo); el timeline solo los cuenta.
  // La columna entera acepta el archivo arrastrado: en Safari el
  // selector deja "Cargar" deshabilitado (components/ui/file-drop-zone.tsx).
  const resultsColumn = (
    <FileDropZone onFile={(file) => void uploadStandaloneResult(file)} disabled={isUploadingStandalone} className="-m-2 p-2">
      <section aria-labelledby="seccion-resultados" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="seccion-resultados" className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            {t("pacientes.ordenes.seccionResultados")} ({allResults.length})
          </h3>
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
            title={`${t("pacientes.ordenes.formatoPermitido")} · ${t("pacientes.ordenes.arrastrarAqui")}`}
            className="min-h-11 px-3 text-sm"
          >
            {t("pacientes.ordenes.subirResultado")}
          </Button>
        </div>
        {uploadNotice ? <Aviso variant="advertencia" title={uploadNotice} /> : null}
        {allResults.length === 0 ? (
          <p className="text-base text-gray-500">
            {standaloneResults.length > 0 ? t("clinico.pdf.cargando") : t("pacientes.ordenes.sinResultadosTodavia")}
          </p>
        ) : (
          <Card>
            {/* Carpetas del mismo ancho (10rem) que la de cada orden. */}
            <div className="grid grid-cols-[repeat(auto-fill,10rem)] gap-4">
              {allResults.map((r) => (
                <ResultTile key={r.id} result={r} />
              ))}
            </div>
          </Card>
        )}
      </section>
    </FileDropZone>
  );

  const ordersColumn = (
    <section aria-labelledby="seccion-ordenes" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="seccion-ordenes" className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {t("pacientes.ordenes.seccionOrdenes")} ({labOrders.length})
        </h3>
        <Button type="button" variant="secondary" isLoading={isOpeningOrder} onClick={() => void openNewOrder()} className="min-h-11 px-3 text-sm">
          {t("pacientes.ordenes.ordenarEstudio")}
        </Button>
      </div>
      {labOrders.length === 0 ? (
        <p className="text-base text-gray-500">{t("pacientes.ordenes.sinOrdenesTodavia")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {labOrders.map((o) => (
            <li key={o.id}>
              <FileDropZone onFile={(file) => void uploadResult(o.id, file)} disabled={o.status === "CANCELLED" || uploadingId === o.id}>
                <Card>
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="w-40 shrink-0">
                      <DocumentTile
                        title={t("pacientes.ordenes.ordenTitulo", { folio: o.folio })}
                        subtitle={formatDateLong(locale, o.issuedAt)}
                        fileLabel="PDF"
                        {...(o.status === "CANCELLED" ? { status: { label: t(STATUS_LABEL_KEYS[o.status]), tone: "cancelled" as const } } : {})}
                        onOpen={() => openOrder(o)}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-medium text-gray-900">
                            {t("pacientes.ordenes.folio", { folio: o.folio, fecha: formatDateLong(locale, o.issuedAt) })}
                          </p>
                          <p className="text-sm text-gray-500">{o.clinicalIndication}</p>
                        </div>
                        <span
                          className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium ${
                            o.status === "CANCELLED" ? "border-danger-600 text-danger-600" : "border-success-600 text-success-600"
                          }`}
                        >
                          {t(STATUS_LABEL_KEYS[o.status])}
                        </span>
                      </div>
                      <ul className="mt-2 flex flex-col gap-0.5">
                        {o.items.map((item, i) => (
                          <li key={i} className="text-base text-gray-900">
                            {item.studyName}
                          </li>
                        ))}
                      </ul>
                      {o.fastingRequired && <p className="mt-1 text-sm text-warn-600">{t("pacientes.ordenes.requiereAyuno")}</p>}
                      <p className="mt-1 text-sm text-gray-500">
                        {t("pacientes.ordenes.resultadosDeLaOrden", { n: allResults.filter((r) => r.labOrderId === o.id).length })}
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
                            {t("pacientes.ordenes.subirResultadoDeOrden")}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            isLoading={cancellingId === o.id}
                            onClick={() => void cancelOrder(o.id)}
                            className="min-h-11 px-3 text-sm"
                          >
                            {t("pacientes.ordenes.cancelarOrden")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </FileDropZone>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const previewPanel = (
    <DocumentViewer document={viewing} accessToken={accessToken} onClose={() => setViewing(null)} />
  );

  const orderPanel = orderEncounterId ? (
    <LabOrderPanel open onClose={() => setOrderEncounterId(null)} accessToken={accessToken} encounterId={orderEncounterId} onIssued={onChanged} />
  ) : null;

  return (
    <>
      {dialog}
      <div className="flex flex-col gap-6">
        {error ? <ErrorState error={error} /> : null}
        <div className="grid items-start gap-8 xl:grid-cols-2">
          {resultsColumn}
          {ordersColumn}
        </div>
        {previewPanel}
        {orderPanel}
      </div>
    </>
  );
}
