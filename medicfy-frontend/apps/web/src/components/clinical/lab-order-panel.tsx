"use client";

import { useState } from "react";
import type { LabOrderCreateInput, LabOrderItemCreateInput } from "@medicfy/contracts";
import { apiFetch, apiFetchBlob, ApiError } from "@/lib/api-client";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput } from "@/components/ui/field";
import { Aviso } from "@/components/ui/alert";

interface IssuedLabOrder {
  id: string;
  folio: string;
  qrVerificationToken: string;
  signatureRoute: SignatureRoute;
}

type SignatureRoute = "HANDWRITTEN_AFTER_PRINT" | "ELECTRONIC";

// M10 (parcial en MVP): panel lateral, mismo patrón que
// PrescriptionPanel — "sin salir de la pantalla" (CLAUDE.md §6). A
// diferencia de recetas (M9-RN-009), ninguna regla M10 exige
// contraseña+TOTP — la firma electrónica es opcional (a petición
// explícita del usuario, 2026-08-25), mismas dos rutas que ya usa
// PrescriptionPanel.
export function LabOrderPanel({
  open,
  onClose,
  accessToken,
  encounterId,
  onIssued,
}: {
  open: boolean;
  onClose: () => void;
  accessToken: string;
  encounterId: string;
  onIssued: () => void;
}) {
  const [items, setItems] = useState<LabOrderItemCreateInput[]>([]);
  const [studyName, setStudyName] = useState("");
  const [clinicalIndication, setClinicalIndication] = useState("");
  const [fastingRequired, setFastingRequired] = useState(false);
  // Igual que en PrescriptionPanel: null hasta que el médico elige,
  // ninguna ruta es la opción "por defecto".
  const [signatureRoute, setSignatureRoute] = useState<SignatureRoute | null>(null);
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issued, setIssued] = useState<IssuedLabOrder | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<unknown>(null);

  function resetAll() {
    setItems([]);
    setStudyName("");
    setClinicalIndication("");
    setFastingRequired(false);
    setSignatureRoute(null);
    setPassword("");
    setTotpCode("");
    setSubmitError(null);
    setIssued(null);
    setPdfError(null);
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  function addStudy() {
    if (!studyName.trim()) return;
    setItems([...items, { studyName: studyName.trim() }]);
    setStudyName("");
  }

  function removeStudy(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  async function submit() {
    if (!signatureRoute) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const base = { items, clinicalIndication, ...(fastingRequired ? { fastingRequired: true } : {}) };
      const body: LabOrderCreateInput =
        signatureRoute === "HANDWRITTEN_AFTER_PRINT"
          ? { ...base, signatureRoute: "HANDWRITTEN_AFTER_PRINT" }
          : { ...base, signatureRoute: "ELECTRONIC", password, totpCode };
      const result = await apiFetch<{ id: string; folio: string; qrVerificationToken: string; signatureRoute: SignatureRoute }>(
        `/lab-orders/encounters/${encounterId}`,
        { method: "POST", accessToken, body }
      );
      setIssued({ id: result.id, folio: result.folio, qrVerificationToken: result.qrVerificationToken, signatureRoute: result.signatureRoute });
      onIssued();
    } catch (error) {
      setSubmitError(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Mismo patrón que PrescriptionPanel.downloadPdf(): el endpoint
  // exige JwtAuthGuard, así que hay que traer los bytes con fetch
  // autenticado y abrirlos como blob en vez de un <a href> normal.
  async function downloadPdf() {
    if (!issued) return;
    setPdfError(null);
    setIsDownloadingPdf(true);
    try {
      const blob = await apiFetchBlob(`/lab-orders/${issued.id}/pdf`, { accessToken });
      if (!blob) {
        setPdfError(new Error("No se encontró el PDF de esta orden."));
        return;
      }
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (error) {
      setPdfError(error);
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  const hasRequiredContent = items.length > 0 && clinicalIndication.trim().length > 0;
  const canSubmit =
    hasRequiredContent &&
    (signatureRoute === "HANDWRITTEN_AFTER_PRINT" || (signatureRoute === "ELECTRONIC" && password.length > 0 && totpCode.length === 6));

  return (
    <Panel open={open} onClose={handleClose} title="Ordenar laboratorio">
      {issued ? (
        <div className="flex flex-col gap-4">
          <Aviso variant="exito" title={`Orden emitida — folio ${issued.folio}`}>
            <p className="mt-1 break-all">
              Verificación pública: <span className="font-mono">/verificar/{issued.qrVerificationToken}</span>
            </p>
          </Aviso>
          {issued.signatureRoute === "HANDWRITTEN_AFTER_PRINT" && (
            <Aviso variant="advertencia" title="Firma pendiente">
              Imprime esta orden y fírmala a mano antes de entregarla al paciente. Si ya tienes una firma visual cargada en tu perfil, el PDF ya
              la incluye como referencia.
            </Aviso>
          )}
          <Button type="button" variant="secondary" isLoading={isDownloadingPdf} onClick={() => void downloadPdf()} className="w-fit">
            Descargar / imprimir PDF
          </Button>
          {pdfError ? (
            <Aviso variant="advertencia" title="No se pudo abrir el PDF">
              {pdfError instanceof ApiError ? pdfError.message : "Intenta de nuevo."}
            </Aviso>
          ) : null}
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={resetAll}>
              Ordenar otro estudio
            </Button>
            <Button type="button" onClick={handleClose}>
              Cerrar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {items.length > 0 && (
            <ul className="flex flex-col gap-2">
              {items.map((item, index) => (
                <li key={`${item.studyName}-${index}`} className="flex items-center justify-between rounded-md border border-gray-300 px-3 py-2">
                  <span className="text-base text-gray-900">{item.studyName}</span>
                  <Button type="button" variant="danger" onClick={() => removeStudy(index)} className="min-h-11 px-3 text-sm">
                    Quitar
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-end gap-2">
            <FieldWrapper label="Estudio" htmlFor="lab-study" hint="p. ej. Biometría hemática completa">
              <TextInput id="lab-study" value={studyName} onChange={(e) => setStudyName(e.target.value)} />
            </FieldWrapper>
            <Button type="button" variant="secondary" onClick={addStudy} disabled={!studyName.trim()} className="mb-1 min-h-11 px-3 text-sm">
              Agregar
            </Button>
          </div>

          <FieldWrapper label="Indicación clínica" htmlFor="lab-indication">
            <TextInput id="lab-indication" value={clinicalIndication} onChange={(e) => setClinicalIndication(e.target.value)} />
          </FieldWrapper>

          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-base text-gray-700">
            <input type="checkbox" checked={fastingRequired} onChange={(e) => setFastingRequired(e.target.checked)} className="h-5 w-5" />
            Requiere ayuno
          </label>

          {/* Mismo principio que PrescriptionPanel: la firma
              electrónica nunca es obligatoria, el médico elige. */}
          <fieldset className="flex flex-col gap-2 rounded-md border border-gray-300 p-4">
            <legend className="px-1 text-sm font-medium text-gray-700">¿Cómo desea firmar esta orden?</legend>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-gray-100">
              <input
                type="radio"
                name="labSignatureRoute"
                className="mt-1 h-4 w-4"
                checked={signatureRoute === "HANDWRITTEN_AFTER_PRINT"}
                onChange={() => setSignatureRoute("HANDWRITTEN_AFTER_PRINT")}
              />
              <span>
                <span className="block text-base font-medium text-gray-900">Imprimir y firmar a mano</span>
                <span className="block text-sm text-gray-500">
                  No pide contraseña ni código. Si ya tienes una firma visual cargada en tu perfil, se incluye en el PDF como referencia.
                </span>
              </span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-gray-100">
              <input
                type="radio"
                name="labSignatureRoute"
                className="mt-1 h-4 w-4"
                checked={signatureRoute === "ELECTRONIC"}
                onChange={() => setSignatureRoute("ELECTRONIC")}
              />
              <span>
                <span className="block text-base font-medium text-gray-900">Firma digital o electrónica</span>
                <span className="block text-sm text-gray-500">Firma dentro de Medicfy confirmando tu contraseña y un código de verificación.</span>
              </span>
            </label>
          </fieldset>

          {signatureRoute === "ELECTRONIC" && (
            <div className="grid grid-cols-2 gap-3">
              <FieldWrapper label="Confirma tu contraseña" htmlFor="lab-password">
                <TextInput id="lab-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </FieldWrapper>
              <FieldWrapper label="Código de verificación (6 dígitos)" htmlFor="lab-totp">
                <TextInput
                  id="lab-totp"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                />
              </FieldWrapper>
            </div>
          )}

          {submitError ? (
            <Aviso variant="critico" title="No se pudo emitir la orden">
              {submitError instanceof ApiError ? submitError.message : "Intenta de nuevo."}
            </Aviso>
          ) : null}

          <Button type="button" isLoading={isSubmitting} disabled={!canSubmit} onClick={() => void submit()}>
            {signatureRoute === "HANDWRITTEN_AFTER_PRINT" ? "Generar orden para firma" : "Firmar y emitir orden"}
          </Button>
        </div>
      )}
    </Panel>
  );
}
