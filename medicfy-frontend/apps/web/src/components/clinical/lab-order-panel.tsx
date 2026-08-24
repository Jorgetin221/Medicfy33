"use client";

import { useState } from "react";
import type { LabOrderCreateInput, LabOrderItemCreateInput } from "@medicfy/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput } from "@/components/ui/field";
import { Aviso } from "@/components/ui/alert";

// M10 (parcial en MVP): panel lateral, mismo patrón que
// PrescriptionPanel — "sin salir de la pantalla" (CLAUDE.md §6).
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
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issued, setIssued] = useState<{ folio: string; qrVerificationToken: string } | null>(null);

  function resetAll() {
    setItems([]);
    setStudyName("");
    setClinicalIndication("");
    setFastingRequired(false);
    setPassword("");
    setTotpCode("");
    setSubmitError(null);
    setIssued(null);
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
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const body: LabOrderCreateInput = { items, clinicalIndication, password, totpCode, ...(fastingRequired ? { fastingRequired: true } : {}) };
      const result = await apiFetch<{ folio: string; qrVerificationToken: string }>(`/lab-orders/encounters/${encounterId}`, {
        method: "POST",
        accessToken,
        body,
      });
      setIssued({ folio: result.folio, qrVerificationToken: result.qrVerificationToken });
      onIssued();
    } catch (error) {
      setSubmitError(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = items.length > 0 && clinicalIndication.trim().length > 0 && password.length > 0 && totpCode.length === 6;

  return (
    <Panel open={open} onClose={handleClose} title="Ordenar laboratorio">
      {issued ? (
        <div className="flex flex-col gap-4">
          <Aviso variant="exito" title={`Orden emitida — folio ${issued.folio}`}>
            <p className="mt-1 break-all">
              Verificación pública: <span className="font-mono">/verificar/{issued.qrVerificationToken}</span>
            </p>
          </Aviso>
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

          {submitError ? (
            <Aviso variant="critico" title="No se pudo emitir la orden">
              {submitError instanceof ApiError ? submitError.message : "Intenta de nuevo."}
            </Aviso>
          ) : null}

          <Button type="button" isLoading={isSubmitting} disabled={!canSubmit} onClick={() => void submit()}>
            Firmar y emitir orden
          </Button>
        </div>
      )}
    </Panel>
  );
}
