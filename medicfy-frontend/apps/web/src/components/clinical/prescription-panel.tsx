"use client";

import { useState } from "react";
import type { PrescriptionCreateInput, PrescriptionItemCreateInput } from "@medicfy/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput } from "@/components/ui/field";
import { Aviso } from "@/components/ui/alert";
import { MedicationPicker, type MedicationCatalogEntry, type PrescriptionDraftItem } from "@/components/clinical/medication-picker";

interface IssuedPrescription {
  folio: string;
  qrVerificationToken: string | null;
  therapeuticDuplicates: string[];
}

function toWireItem(item: PrescriptionDraftItem): PrescriptionItemCreateInput {
  return {
    medicationCatalogId: item.medicationCatalogId,
    dose: item.dose,
    route: item.route,
    frequency: item.frequency,
    duration: item.duration,
    ...(item.quantity ? { quantity: item.quantity } : {}),
    ...(item.specialInstructions ? { specialInstructions: item.specialInstructions } : {}),
  };
}

// M9: panel lateral — "emitir receta sin salir de la pantalla"
// (CLAUDE.md §6). Dos caminos: electrónica (Grupos III-VI, firma con
// contraseña+TOTP) o registro de receta física (Grupos I/II — R5:
// bloqueo duro, Medicfy nunca la emite, solo la registra).
export function PrescriptionPanel({
  open,
  onClose,
  accessToken,
  encounterId,
  defaultDiagnosis,
  onIssued,
}: {
  open: boolean;
  onClose: () => void;
  accessToken: string;
  encounterId: string;
  defaultDiagnosis: string;
  onIssued: () => void;
}) {
  const [items, setItems] = useState<PrescriptionDraftItem[]>([]);
  const [diagnosisSnapshot, setDiagnosisSnapshot] = useState(defaultDiagnosis);
  const [generalInstructions, setGeneralInstructions] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [allergyConflict, setAllergyConflict] = useState<string[] | null>(null);
  const [allergyOverrideConfirmed, setAllergyOverrideConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issued, setIssued] = useState<IssuedPrescription | null>(null);

  const [blockedMedication, setBlockedMedication] = useState<MedicationCatalogEntry | null>(null);
  const [physicalFolio, setPhysicalFolio] = useState("");
  const [extDose, setExtDose] = useState("");
  const [extRoute, setExtRoute] = useState("");
  const [extFrequency, setExtFrequency] = useState("");
  const [extDuration, setExtDuration] = useState("");
  const [isSubmittingExternal, setIsSubmittingExternal] = useState(false);
  const [externalError, setExternalError] = useState<unknown>(null);
  const [externalRegistered, setExternalRegistered] = useState(false);

  function resetAll() {
    setItems([]);
    setDiagnosisSnapshot(defaultDiagnosis);
    setGeneralInstructions("");
    setPassword("");
    setTotpCode("");
    setAllergyConflict(null);
    setAllergyOverrideConfirmed(false);
    setSubmitError(null);
    setIssued(null);
    setBlockedMedication(null);
    setPhysicalFolio("");
    setExtDose("");
    setExtRoute("");
    setExtFrequency("");
    setExtDuration("");
    setExternalError(null);
    setExternalRegistered(false);
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  async function submitElectronic() {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const body: PrescriptionCreateInput = {
        diagnosisSnapshot,
        items: items.map(toWireItem),
        password,
        totpCode,
        ...(generalInstructions ? { generalInstructions } : {}),
        ...(allergyOverrideConfirmed ? { allergyOverrideConfirmed: true } : {}),
      };
      const result = await apiFetch<{
        prescription: { folio: string; qrVerificationToken: string | null };
        warnings: { therapeuticDuplicates: string[] };
      }>(`/prescriptions/encounters/${encounterId}`, { method: "POST", accessToken, body });
      setIssued({
        folio: result.prescription.folio,
        qrVerificationToken: result.prescription.qrVerificationToken,
        therapeuticDuplicates: result.warnings.therapeuticDuplicates,
      });
      onIssued();
    } catch (error) {
      if (error instanceof ApiError && error.code === "PRESCRIPTION_ALLERGY_CONFLICT") {
        const details = error.details as { medications?: string[] } | undefined;
        setAllergyConflict(details?.medications ?? []);
      } else {
        setSubmitError(error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitExternalPhysical() {
    if (!blockedMedication) return;
    setExternalError(null);
    setIsSubmittingExternal(true);
    try {
      await apiFetch(`/prescriptions/encounters/${encounterId}/external-physical`, {
        method: "POST",
        accessToken,
        body: {
          physicalFolio,
          genericName: blockedMedication.genericName,
          controlGroup: blockedMedication.controlGroup === "I" || blockedMedication.controlGroup === "II" ? blockedMedication.controlGroup : "II",
          dose: extDose,
          route: extRoute,
          frequency: extFrequency,
          duration: extDuration,
        },
      });
      setExternalRegistered(true);
      onIssued();
    } catch (error) {
      setExternalError(error);
    } finally {
      setIsSubmittingExternal(false);
    }
  }

  const canSubmitElectronic = items.length > 0 && diagnosisSnapshot.trim().length > 0 && password.length > 0 && totpCode.length === 6;

  return (
    <Panel open={open} onClose={handleClose} title="Emitir receta">
      {issued ? (
        <div className="flex flex-col gap-4">
          <Aviso variant="exito" title={`Receta emitida — folio ${issued.folio}`}>
            {issued.qrVerificationToken && (
              <p className="mt-1 break-all">
                Verificación pública: <span className="font-mono">/verificar/{issued.qrVerificationToken}</span>
              </p>
            )}
          </Aviso>
          {issued.therapeuticDuplicates.length > 0 && (
            <Aviso variant="advertencia" title="Posible duplicidad terapéutica">
              El paciente ya toma: {issued.therapeuticDuplicates.join(", ")}. Revisa antes de continuar.
            </Aviso>
          )}
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={resetAll}>
              Emitir otra receta
            </Button>
            <Button type="button" onClick={handleClose}>
              Cerrar
            </Button>
          </div>
        </div>
      ) : blockedMedication ? (
        <div className="flex flex-col gap-4">
          <Aviso variant="critico" title={`${blockedMedication.genericName} es Grupo ${blockedMedication.controlGroup}`}>
            COFEPRIS exige recetario físico para medicamentos Grupo I/II. Medicfy no puede emitir esta receta electrónicamente — puedes registrar
            aquí la receta que ya emitiste en tu recetario físico, para que quede en el expediente.
          </Aviso>
          {externalRegistered ? (
            <>
              <Aviso variant="exito" title="Receta física registrada en el expediente." />
              <Button type="button" onClick={handleClose}>
                Cerrar
              </Button>
            </>
          ) : (
            <>
              <FieldWrapper label="Folio del recetario físico" htmlFor="physical-folio">
                <TextInput id="physical-folio" value={physicalFolio} onChange={(e) => setPhysicalFolio(e.target.value)} />
              </FieldWrapper>
              <div className="grid grid-cols-2 gap-3">
                <FieldWrapper label="Dosis" htmlFor="ext-dose">
                  <TextInput id="ext-dose" value={extDose} onChange={(e) => setExtDose(e.target.value)} />
                </FieldWrapper>
                <FieldWrapper label="Vía" htmlFor="ext-route">
                  <TextInput id="ext-route" value={extRoute} onChange={(e) => setExtRoute(e.target.value)} />
                </FieldWrapper>
                <FieldWrapper label="Frecuencia" htmlFor="ext-frequency">
                  <TextInput id="ext-frequency" value={extFrequency} onChange={(e) => setExtFrequency(e.target.value)} />
                </FieldWrapper>
                <FieldWrapper label="Duración" htmlFor="ext-duration">
                  <TextInput id="ext-duration" value={extDuration} onChange={(e) => setExtDuration(e.target.value)} />
                </FieldWrapper>
              </div>
              {externalError ? <Aviso variant="critico" title="No se pudo registrar">{externalError instanceof ApiError ? externalError.message : "Intenta de nuevo."}</Aviso> : null}
              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={() => setBlockedMedication(null)}>
                  Volver a la búsqueda
                </Button>
                <Button
                  type="button"
                  isLoading={isSubmittingExternal}
                  disabled={!physicalFolio || !extDose || !extRoute || !extFrequency || !extDuration}
                  onClick={() => void submitExternalPhysical()}
                >
                  Registrar receta física
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <FieldWrapper label="Diagnóstico que motiva la receta" htmlFor="rx-diagnosis">
            <TextInput id="rx-diagnosis" value={diagnosisSnapshot} onChange={(e) => setDiagnosisSnapshot(e.target.value)} />
          </FieldWrapper>

          <MedicationPicker accessToken={accessToken} items={items} onChange={setItems} onBlockedSelected={setBlockedMedication} />

          <FieldWrapper label="Indicaciones generales (opcional)" htmlFor="rx-instructions">
            <TextInput id="rx-instructions" value={generalInstructions} onChange={(e) => setGeneralInstructions(e.target.value)} />
          </FieldWrapper>

          {allergyConflict && (
            <Aviso variant="critico" title="Alergia registrada">
              <p>El paciente tiene alergia a: {allergyConflict.join(", ")}.</p>
              <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-base">
                <input
                  type="checkbox"
                  checked={allergyOverrideConfirmed}
                  onChange={(e) => setAllergyOverrideConfirmed(e.target.checked)}
                  className="h-5 w-5"
                />
                Confirmo que deseo continuar a pesar de la alergia registrada.
              </label>
            </Aviso>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FieldWrapper label="Confirma tu contraseña" htmlFor="rx-password">
              <TextInput id="rx-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </FieldWrapper>
            <FieldWrapper label="Código de verificación (6 dígitos)" htmlFor="rx-totp">
              <TextInput
                id="rx-totp"
                inputMode="numeric"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              />
            </FieldWrapper>
          </div>

          {submitError ? (
            <Aviso variant="critico" title="No se pudo emitir la receta">
              {submitError instanceof ApiError ? submitError.message : "Intenta de nuevo."}
            </Aviso>
          ) : null}

          <Button
            type="button"
            isLoading={isSubmitting}
            disabled={!canSubmitElectronic || (allergyConflict !== null && !allergyOverrideConfirmed)}
            onClick={() => void submitElectronic()}
          >
            Firmar y emitir receta
          </Button>
        </div>
      )}
    </Panel>
  );
}
