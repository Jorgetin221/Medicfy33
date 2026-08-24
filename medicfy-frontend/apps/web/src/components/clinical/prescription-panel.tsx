"use client";

import { useState } from "react";
import type { PrescriptionCreateInput, PrescriptionItemCreateInput } from "@medicfy/contracts";
import { apiFetch, apiFetchBlob, ApiError } from "@/lib/api-client";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput } from "@/components/ui/field";
import { Aviso } from "@/components/ui/alert";
import { MedicationPicker, type MedicationCatalogEntry, type PrescriptionDraftItem } from "@/components/clinical/medication-picker";

interface TherapeuticClassDuplicate {
  prescribedMedication: string;
  existingMedication: string;
}

interface IssuedPrescription {
  id: string;
  folio: string;
  qrVerificationToken: string | null;
  signatureRoute: "HANDWRITTEN_AFTER_PRINT" | "ELECTRONIC";
  therapeuticDuplicates: string[];
  therapeuticClassDuplicates: TherapeuticClassDuplicate[];
}

type SignatureRoute = "HANDWRITTEN_AFTER_PRINT" | "ELECTRONIC";

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
  // Corrección v2.1 §1/§17.6: la firma digital nunca es obligatoria
  // para imprimir — null hasta que el médico elige, para no asumir
  // ninguna de las dos por defecto.
  const [signatureRoute, setSignatureRoute] = useState<SignatureRoute | null>(null);
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [allergyConflict, setAllergyConflict] = useState<string[] | null>(null);
  const [allergyOverrideConfirmed, setAllergyOverrideConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issued, setIssued] = useState<IssuedPrescription | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<unknown>(null);

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
    setSignatureRoute(null);
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

  async function submitPrescription() {
    if (!signatureRoute) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const base = {
        diagnosisSnapshot,
        items: items.map(toWireItem),
        ...(generalInstructions ? { generalInstructions } : {}),
        ...(allergyOverrideConfirmed ? { allergyOverrideConfirmed: true } : {}),
      };
      const body: PrescriptionCreateInput =
        signatureRoute === "HANDWRITTEN_AFTER_PRINT"
          ? { ...base, signatureRoute: "HANDWRITTEN_AFTER_PRINT" }
          : { ...base, signatureRoute: "ELECTRONIC", password, totpCode };
      const result = await apiFetch<{
        prescription: { id: string; folio: string; qrVerificationToken: string | null; signatureRoute: SignatureRoute };
        warnings: { therapeuticDuplicates: string[]; therapeuticClassDuplicates: TherapeuticClassDuplicate[] };
      }>(`/prescriptions/encounters/${encounterId}`, { method: "POST", accessToken, body });
      setIssued({
        id: result.prescription.id,
        folio: result.prescription.folio,
        qrVerificationToken: result.prescription.qrVerificationToken,
        signatureRoute: result.prescription.signatureRoute,
        therapeuticDuplicates: result.warnings.therapeuticDuplicates,
        therapeuticClassDuplicates: result.warnings.therapeuticClassDuplicates,
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

  // El endpoint exige JwtAuthGuard — un <a href> normal no manda el
  // header Authorization (el access token vive solo en memoria de
  // React, nunca en una cookie), así que hay que traer los bytes con
  // fetch autenticado y abrirlos como blob. Mismo patrón que ya usa
  // Perfil para logo/firma (apiFetchBlob).
  async function downloadPdf() {
    if (!issued) return;
    setPdfError(null);
    setIsDownloadingPdf(true);
    try {
      const blob = await apiFetchBlob(`/prescriptions/${issued.id}/pdf`, { accessToken });
      if (!blob) {
        setPdfError(new Error("No se encontró el PDF de esta receta."));
        return;
      }
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (error) {
      setPdfError(error);
    } finally {
      setIsDownloadingPdf(false);
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

  const hasRequiredContent = items.length > 0 && diagnosisSnapshot.trim().length > 0;
  const canSubmit =
    hasRequiredContent &&
    (signatureRoute === "HANDWRITTEN_AFTER_PRINT" || (signatureRoute === "ELECTRONIC" && password.length > 0 && totpCode.length === 6));

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
          {issued.signatureRoute === "HANDWRITTEN_AFTER_PRINT" && (
            <Aviso variant="advertencia" title="Firma pendiente">
              Imprime esta receta y fírmala a mano antes de entregarla al paciente. Cuando la hayas entregado, márcalo en la pestaña de Recetas del
              expediente.
            </Aviso>
          )}
          {issued.therapeuticDuplicates.length > 0 && (
            <Aviso variant="advertencia" title="Posible duplicidad terapéutica">
              El paciente ya toma: {issued.therapeuticDuplicates.join(", ")}. Revisa antes de continuar.
            </Aviso>
          )}
          {issued.therapeuticClassDuplicates.length > 0 && (
            <Aviso variant="advertencia" title="Misma clase terapéutica que un medicamento ya activo">
              <ul className="list-disc pl-5">
                {issued.therapeuticClassDuplicates.map((d, i) => (
                  <li key={i}>
                    {d.prescribedMedication} es de la misma clase que {d.existingMedication}, que el paciente ya toma.
                  </li>
                ))}
              </ul>
              Revisa antes de continuar.
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

          {/* Corrección v2.1 §1/§17.6: la firma digital nunca es
              obligatoria para imprimir — el médico elige entre las
              dos rutas, ninguna es la opción "por defecto". */}
          <fieldset className="flex flex-col gap-2 rounded-md border border-gray-300 p-4">
            <legend className="px-1 text-sm font-medium text-gray-700">¿Cómo desea firmar esta receta?</legend>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-gray-100">
              <input
                type="radio"
                name="signatureRoute"
                className="mt-1 h-4 w-4"
                checked={signatureRoute === "HANDWRITTEN_AFTER_PRINT"}
                onChange={() => setSignatureRoute("HANDWRITTEN_AFTER_PRINT")}
              />
              <span>
                <span className="block text-base font-medium text-gray-900">Imprimir y firmar a mano</span>
                <span className="block text-sm text-gray-500">Genera la receta con un espacio para tu firma autógrafa. No pide contraseña ni código.</span>
              </span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-gray-100">
              <input
                type="radio"
                name="signatureRoute"
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
          )}

          {submitError ? (
            <Aviso variant="critico" title="No se pudo emitir la receta">
              {submitError instanceof ApiError ? submitError.message : "Intenta de nuevo."}
            </Aviso>
          ) : null}

          <Button
            type="button"
            isLoading={isSubmitting}
            disabled={!canSubmit || (allergyConflict !== null && !allergyOverrideConfirmed)}
            onClick={() => void submitPrescription()}
          >
            {signatureRoute === "HANDWRITTEN_AFTER_PRINT" ? "Generar receta para firma" : "Firmar y emitir receta"}
          </Button>
        </div>
      )}
    </Panel>
  );
}
