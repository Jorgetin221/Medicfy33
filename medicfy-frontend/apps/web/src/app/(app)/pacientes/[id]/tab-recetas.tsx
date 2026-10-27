"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { ensureOpenEncounter } from "@/lib/ensure-open-encounter";
import { PrescriptionPanel } from "@/components/clinical/prescription-panel";
import type { TimelinePrescription } from "@/lib/use-patient-clinical";
import { Card, EmptyState, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { DocumentViewer } from "@/components/clinical/document-tile";
import { useI18n } from "@/lib/i18n/context";
import { formatDateLong } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

const STATUS_LABEL_KEY: Record<TimelinePrescription["status"], MessageKey> = {
  ISSUED: "pacientes.recetas.vigente",
  CANCELLED: "pacientes.recetas.cancelada",
  PENDING_HANDWRITTEN_SIGNATURE: "pacientes.recetas.pendienteFirma",
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
  patientId,
  prescriptions,
  onChanged,
}: {
  accessToken: string;
  patientId: string;
  prescriptions: TimelinePrescription[];
  onChanged: () => void;
}) {
  const { t, locale } = useI18n();
  const { confirm, askReason, dialog } = useConfirmDialog();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ id: string; title: string; path: string; downloadName: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  // Consulta a la que se liga la receta nueva (ver ensureOpenEncounter).
  const [rxEncounterId, setRxEncounterId] = useState<string | null>(null);
  const [isOpeningRx, setIsOpeningRx] = useState(false);

  async function cancelPrescription(id: string) {
    const reason = await askReason({ title: t("pacientes.recetas.cancelarTitulo"), label: t("pacientes.recetas.motivoCancelacion"), destructive: true });
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
    if (!(await confirm({ title: t("pacientes.recetas.confirmarEntrega") }))) return;
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

  // La receta se abre en el visor del sistema; descargarla o imprimirla
  // desde ahí queda en la bitácora de impresión (Prompt 38A).
  function openPrescription(prescription: TimelinePrescription) {
    setViewing({
      id: prescription.id,
      title: t("pacientes.recetas.recetaTitulo", { folio: prescription.folio }),
      path: `/prescriptions/${prescription.id}/pdf`,
      downloadName: `receta-${prescription.folio}.pdf`,
    });
  }

  function registerPrinted() {
    if (!viewing) return;
    void apiFetch(`/prescriptions/${viewing.id}/register-printed`, { method: "POST", accessToken }).catch(() => undefined);
  }

  // "Emitir receta" abre el panel de receta aquí mismo (2026-10-17: antes
  // llevaba a una consulta nueva). M9-RN-002 — "toda receta pertenece a
  // un encuentro" — se cumple ligándola a la consulta abierta sin cita
  // del paciente, que se crea en segundo plano si no existe.
  async function openNewPrescription() {
    setError(null);
    setIsOpeningRx(true);
    try {
      setRxEncounterId(await ensureOpenEncounter(patientId, accessToken));
    } catch (err) {
      setError(err);
    } finally {
      setIsOpeningRx(false);
    }
  }

  const nuevaRecetaButton = (
    <Button type="button" variant="secondary" isLoading={isOpeningRx} onClick={() => void openNewPrescription()} className="min-h-11 px-3 text-sm">
      {t("pacientes.recetas.emitirReceta")}
    </Button>
  );

  const prescriptionPanel = rxEncounterId ? (
    <PrescriptionPanel
      open
      onClose={() => setRxEncounterId(null)}
      accessToken={accessToken}
      encounterId={rxEncounterId}
      patientId={patientId}
      defaultDiagnosis=""
      onIssued={onChanged}
    />
  ) : null;

  if (prescriptions.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div>{nuevaRecetaButton}</div>
        {error ? <ErrorState error={error} /> : null}
        <EmptyState title={t("pacientes.recetas.sinRecetas")} description={t("pacientes.recetas.sinRecetasAyuda")} />
        {prescriptionPanel}
      </div>
    );
  }

  return (
    <>
      {dialog}
      <div className="flex flex-col gap-3">
        <div>{nuevaRecetaButton}</div>
        {error ? <ErrorState error={error} /> : null}
        <ul className="flex flex-col gap-3">
          {prescriptions.map((p) => (
            <li key={p.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-medium text-gray-900">
                      {t("pacientes.recetas.folio", { folio: p.folio, fecha: formatDateLong(locale, p.issuedAt) })}
                    </p>
                    <p className="text-base text-gray-500">{p.diagnosisSnapshot}</p>
                  </div>
                  <span className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium ${STATUS_CLASS[p.status]}`}>
                    {t(STATUS_LABEL_KEY[p.status])}
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
                    {t("pacientes.recetas.verificacion")} <span className="font-mono">/verificar/{p.qrVerificationToken}</span>
                  </p>
                )}
                {p.prescriptionType === "ELECTRONIC" && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Button type="button" variant="secondary" onClick={() => openPrescription(p)} className="min-h-11 px-3 text-sm">
                      {t("pacientes.recetas.verReceta")}
                    </Button>
                    {p.status === "PENDING_HANDWRITTEN_SIGNATURE" && (
                      <Button
                        type="button"
                        isLoading={confirmingId === p.id}
                        onClick={() => void confirmHandwrittenDelivery(p.id)}
                        className="min-h-11 px-3 text-sm"
                      >
                        {t("pacientes.recetas.marcarFirmada")}
                      </Button>
                    )}
                    {p.status !== "CANCELLED" && (
                      <Button
                        type="button"
                        variant="destructive"
                        isLoading={cancellingId === p.id}
                        onClick={() => void cancelPrescription(p.id)}
                        className="min-h-11 px-3 text-sm"
                      >
                        {t("pacientes.recetas.cancelarReceta")}
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
        <DocumentViewer document={viewing} accessToken={accessToken} onClose={() => setViewing(null)} onDownload={registerPrinted} />
        {prescriptionPanel}
      </div>
    </>
  );
}
