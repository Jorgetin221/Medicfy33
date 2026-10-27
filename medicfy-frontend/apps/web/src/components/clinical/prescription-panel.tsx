"use client";

import { useRef, useState } from "react";
import type { PrescriptionCreateInput, PrescriptionItemCreateInput } from "@medicfy/contracts";
import { apiFetch, ApiError, newIdempotencyKey } from "@/lib/api-client";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput, Textarea } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { Aviso } from "@/components/ui/alert";
import { DocumentPreview } from "@/components/clinical/document-preview";
import { MedicationPicker, type MedicationCatalogEntry, type PrescriptionDraftItem } from "@/components/clinical/medication-picker";
import { useT } from "@/lib/i18n/context";


interface TherapeuticClassDuplicate {
  prescribedMedication: string;
  existingMedication: string;
}

interface InteractionWarning {
  severity: string;
  medications: [string, string];
  description: string;
  source: string;
}

interface IssuedPrescription {
  id: string;
  folio: string;
  qrVerificationToken: string | null;
  signatureRoute: "HANDWRITTEN_AFTER_PRINT" | "ELECTRONIC";
  therapeuticDuplicates: string[];
  therapeuticClassDuplicates: TherapeuticClassDuplicate[];
  interactionWarnings: InteractionWarning[];
}

type SignatureRoute = "HANDWRITTEN_AFTER_PRINT" | "ELECTRONIC";

function toWireItem(item: PrescriptionDraftItem): PrescriptionItemCreateInput {
  return {
    medicationCatalogId: item.medicationCatalogId,
    dose: item.dose,
    route: item.route,
    frequency: item.frequency,
    duration: item.duration,
    origin: item.origin,
    ...(item.doseUnit ? { doseUnit: item.doseUnit } : {}),
    ...(item.indication ? { indication: item.indication } : {}),
    ...(item.quantity ? { quantity: item.quantity } : {}),
    ...(item.specialInstructions ? { specialInstructions: item.specialInstructions } : {}),
    // Prompt 36: la procedencia lleva su receta de origen — el
    // servidor la revalida y fija la fecha de origen por su cuenta.
    ...(item.sourcePrescriptionId ? { sourcePrescriptionId: item.sourcePrescriptionId } : {}),
  };
}

// M9: panel lateral — "emitir receta sin salir de la pantalla"
// (CLAUDE.md §6). Dos caminos: electrónica (Grupos III-VI, firma con
// contraseña) o registro de receta física (Grupos I/II — R5:
// bloqueo duro, Medicfy nunca la emite, solo la registra).
export function PrescriptionPanel({
  open,
  onClose,
  accessToken,
  encounterId,
  patientId,
  defaultDiagnosis,
  onIssued,
}: {
  open: boolean;
  onClose: () => void;
  accessToken: string;
  encounterId: string;
  // Prompt 36 (F4): habilita "traer última receta" del mismo médico.
  patientId?: string;
  defaultDiagnosis: string;
  onIssued: () => void;
}) {
  const t = useT();
  const [items, setItems] = useState<PrescriptionDraftItem[]>([]);
  const [diagnosisSnapshot, setDiagnosisSnapshot] = useState(defaultDiagnosis);
  const [generalInstructions, setGeneralInstructions] = useState("");
  // Corrección v2.1 §1/§17.6: la firma digital nunca es obligatoria
  // para imprimir — null hasta que el médico elige, para no asumir
  // ninguna de las dos por defecto.
  const [signatureRoute, setSignatureRoute] = useState<SignatureRoute | null>(null);
  const [password, setPassword] = useState("");
  const [allergyConflict, setAllergyConflict] = useState<string[] | null>(null);
  // Prompt 34 (F4): el bloqueo por alergia se libera SOLO con una
  // justificación clínica escrita — nunca con un checkbox.
  const [allergyJustification, setAllergyJustification] = useState("");
  // Prompt 35 (F4): interacción GRAVE exige confirmación explícita.
  const [graveInteractions, setGraveInteractions] = useState<InteractionWarning[] | null>(null);
  const [interactionConfirmed, setInteractionConfirmed] = useState(false);
  const [isLoadingLast, setIsLoadingLast] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
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

  // A-14: una llave por receta que el médico intenta emitir. Se
  // conserva si reintenta tras un error (de red o de validación) y se
  // renueva al empezar otra — el servidor nunca emite dos folios para
  // el mismo intento.
  const idempotencyKeyRef = useRef(newIdempotencyKey());

  function resetAll() {
    idempotencyKeyRef.current = newIdempotencyKey();
    setItems([]);
    setDiagnosisSnapshot(defaultDiagnosis);
    setGeneralInstructions("");
    setSignatureRoute(null);
    setPassword("");
    setAllergyConflict(null);
    setAllergyJustification("");
    setGraveInteractions(null);
    setInteractionConfirmed(false);
    setLastError(null);
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
        ...(allergyJustification.trim().length >= 15 ? { allergyOverrideJustification: allergyJustification.trim() } : {}),
        ...(interactionConfirmed ? { interactionOverrideConfirmed: true } : {}),
      };
      const body: PrescriptionCreateInput =
        signatureRoute === "HANDWRITTEN_AFTER_PRINT"
          ? { ...base, signatureRoute: "HANDWRITTEN_AFTER_PRINT" }
          : { ...base, signatureRoute: "ELECTRONIC", password };
      const result = await apiFetch<{
        prescription: { id: string; folio: string; qrVerificationToken: string | null; signatureRoute: SignatureRoute };
        warnings: { therapeuticDuplicates: string[]; therapeuticClassDuplicates: TherapeuticClassDuplicate[] };
        interactionWarnings: InteractionWarning[];
      }>(`/prescriptions/encounters/${encounterId}`, { method: "POST", accessToken, body, idempotencyKey: idempotencyKeyRef.current });
      setIssued({
        id: result.prescription.id,
        folio: result.prescription.folio,
        qrVerificationToken: result.prescription.qrVerificationToken,
        signatureRoute: result.prescription.signatureRoute,
        therapeuticDuplicates: result.warnings.therapeuticDuplicates,
        therapeuticClassDuplicates: result.warnings.therapeuticClassDuplicates,
        interactionWarnings: result.interactionWarnings ?? [],
      });
      onIssued();
    } catch (error) {
      if (error instanceof ApiError && error.code === "PRESCRIPTION_ALLERGY_CONFLICT") {
        const details = error.details as { medications?: string[] } | undefined;
        setAllergyConflict(details?.medications ?? []);
      } else if (error instanceof ApiError && error.code === "PRESCRIPTION_INTERACTION_GRAVE") {
        const details = error.details as { interactions?: InteractionWarning[] } | undefined;
        setGraveInteractions(details?.interactions ?? []);
      } else {
        setSubmitError(error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // Prompt 36 (F4): "traer última receta" — las líneas de la última
  // receta del MISMO médico llegan como líneas EDITABLES, con su
  // procedencia y fecha de origen visibles. Nunca texto pegado.
  async function loadLastPrescription() {
    if (!patientId) return;
    setLastError(null);
    setIsLoadingLast(true);
    try {
      const result = await apiFetch<{
        prescription: { id: string; folio: string; issuedAt: string } | null;
        lines: {
          medicationCatalogId: string;
          genericName: string;
          presentation: string;
          dose: string;
          doseUnit: string | null;
          indication: string | null;
          route: string;
          frequency: string;
          duration: string;
          quantity: string | null;
          specialInstructions: string | null;
          origin: "HEREDADA";
          sourcePrescriptionId: string;
          sourceIssuedAt: string;
        }[];
      }>(`/prescriptions/patients/${patientId}/last`, { accessToken });
      if (!result.prescription || result.lines.length === 0) {
        setLastError(t("clinico.receta.sinRecetaAnterior"));
        return;
      }
      setItems([
        ...items,
        ...result.lines.map((l) => ({
          medicationCatalogId: l.medicationCatalogId,
          genericName: l.genericName,
          presentation: l.presentation,
          dose: l.dose,
          doseUnit: l.doseUnit ?? "",
          route: l.route,
          frequency: l.frequency,
          duration: l.duration,
          quantity: l.quantity ?? "",
          specialInstructions: l.specialInstructions ?? "",
          indication: l.indication ?? "",
          origin: l.origin,
          sourcePrescriptionId: l.sourcePrescriptionId,
          sourceIssuedAt: l.sourceIssuedAt,
        })),
      ]);
    } catch {
      setLastError(t("clinico.receta.noSePudoTraer"));
    } finally {
      setIsLoadingLast(false);
    }
  }

  // Prompt 38A: la impresión queda en bitácora, por documento.
  function registerPrinted() {
    if (!issued) return;
    void apiFetch(`/prescriptions/${issued.id}/register-printed`, { method: "POST", accessToken }).catch(() => undefined);
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
    (signatureRoute === "HANDWRITTEN_AFTER_PRINT" || (signatureRoute === "ELECTRONIC" && password.length > 0));

  return (
    <Panel open={open} onClose={handleClose} title={t("clinico.receta.panelTitulo")} wide={issued !== null}>
      {issued ? (
        <div className="flex flex-col gap-4">
          <Aviso variant="exito" title={t("clinico.receta.emitida", { folio: issued.folio })}>
            {issued.qrVerificationToken && (
              <p className="mt-1 break-all">
                {t("clinico.receta.verificacionPublica")} <span className="font-mono">/verificar/{issued.qrVerificationToken}</span>
              </p>
            )}
          </Aviso>
          {issued.signatureRoute === "HANDWRITTEN_AFTER_PRINT" && (
            <Aviso variant="advertencia" title={t("clinico.receta.firmaPendiente")}>
              {t("clinico.receta.firmaPendienteCuerpo")}
            </Aviso>
          )}
          {issued.interactionWarnings.length > 0 && (
            <Aviso variant="advertencia" title={t("clinico.receta.interaccionesInformadas")}>
              <ul className="list-disc pl-5">
                {issued.interactionWarnings.map((w, i) => (
                  <li key={i}>
                    [{w.severity}] {w.medications[0]} + {w.medications[1]}: {w.description}
                  </li>
                ))}
              </ul>
            </Aviso>
          )}
          {issued.therapeuticDuplicates.length > 0 && (
            <Aviso variant="advertencia" title={t("clinico.receta.duplicidad")}>
              {t("clinico.receta.duplicidadCuerpo", { medicamentos: issued.therapeuticDuplicates.join(", ") })}
            </Aviso>
          )}
          {issued.therapeuticClassDuplicates.length > 0 && (
            <Aviso variant="advertencia" title={t("clinico.receta.mismaClase")}>
              <ul className="list-disc pl-5">
                {issued.therapeuticClassDuplicates.map((d, i) => (
                  <li key={i}>
                    {t("clinico.receta.mismaClaseLinea", { recetado: d.prescribedMedication, existente: d.existingMedication })}
                  </li>
                ))}
              </ul>
              {t("clinico.receta.revisaAntes")}
            </Aviso>
          )}
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={resetAll}>
              {t("clinico.receta.emitirOtra")}
            </Button>
            <Button type="button" onClick={handleClose}>
              {t("common.acciones.cerrar")}
            </Button>
          </div>
          {/* La receta completa tal como se imprime, dentro del panel. */}
          <DocumentPreview
            path={`/prescriptions/${issued.id}/pdf`}
            accessToken={accessToken}
            downloadName={`receta-${issued.folio}.pdf`}
            onDownload={registerPrinted}
          />
        </div>
      ) : blockedMedication ? (
        <div className="flex flex-col gap-4">
          <Aviso
            variant="critico"
            title={t("clinico.receta.bloqueadoGrupo", { medicamento: blockedMedication.genericName, grupo: blockedMedication.controlGroup })}
          >
            {t("clinico.receta.bloqueadoCuerpo")}
          </Aviso>
          {externalRegistered ? (
            <>
              <Aviso variant="exito" title={t("clinico.receta.fisicaRegistrada")} />
              <Button type="button" onClick={handleClose}>
                {t("common.acciones.cerrar")}
              </Button>
            </>
          ) : (
            <>
              <FieldWrapper label={t("clinico.receta.folioFisico")} htmlFor="physical-folio">
                <TextInput id="physical-folio" value={physicalFolio} onChange={(e) => setPhysicalFolio(e.target.value)} />
              </FieldWrapper>
              <div className="grid grid-cols-2 gap-3">
                <FieldWrapper label={t("clinico.medicamentos.dosis")} htmlFor="ext-dose">
                  <TextInput id="ext-dose" value={extDose} onChange={(e) => setExtDose(e.target.value)} />
                </FieldWrapper>
                <FieldWrapper label={t("clinico.medicamentos.via")} htmlFor="ext-route">
                  <TextInput id="ext-route" value={extRoute} onChange={(e) => setExtRoute(e.target.value)} />
                </FieldWrapper>
                <FieldWrapper label={t("clinico.medicamentos.frecuencia")} htmlFor="ext-frequency">
                  <TextInput id="ext-frequency" value={extFrequency} onChange={(e) => setExtFrequency(e.target.value)} />
                </FieldWrapper>
                <FieldWrapper label={t("clinico.medicamentos.duracion")} htmlFor="ext-duration">
                  <TextInput id="ext-duration" value={extDuration} onChange={(e) => setExtDuration(e.target.value)} />
                </FieldWrapper>
              </div>
              {externalError ? <Aviso variant="error" title={t("clinico.receta.noSePudoRegistrar")}>
                  {externalError instanceof ApiError ? externalError.message : t("clinico.receta.intentaDeNuevo")}
                </Aviso> : null}
              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={() => setBlockedMedication(null)}>
                  {t("clinico.receta.volverABusqueda")}
                </Button>
                <Button
                  type="button"
                  isLoading={isSubmittingExternal}
                  disabled={!physicalFolio || !extDose || !extRoute || !extFrequency || !extDuration}
                  onClick={() => void submitExternalPhysical()}
                >
                  {t("clinico.receta.registrarFisica")}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <FieldWrapper label={t("clinico.receta.diagnosticoMotiva")} htmlFor="rx-diagnosis">
            <TextInput id="rx-diagnosis" value={diagnosisSnapshot} onChange={(e) => setDiagnosisSnapshot(e.target.value)} />
          </FieldWrapper>

          {patientId ? (
            <div className="flex flex-col gap-1">
              <Button type="button" variant="secondary" isLoading={isLoadingLast} onClick={() => void loadLastPrescription()} className="w-fit">
                {t("clinico.receta.traerUltima")}
              </Button>
              {lastError ? <p className="text-sm text-gray-500">{lastError}</p> : null}
            </div>
          ) : null}

          <MedicationPicker accessToken={accessToken} items={items} onChange={setItems} onBlockedSelected={setBlockedMedication} />

          <FieldWrapper label={t("clinico.receta.indicacionesGenerales")} htmlFor="rx-instructions">
            <TextInput id="rx-instructions" value={generalInstructions} onChange={(e) => setGeneralInstructions(e.target.value)} />
          </FieldWrapper>

          {allergyConflict && (
            <Aviso variant="critico" title={t("clinico.receta.alergiaBloqueado")}>
              <p>{t("clinico.receta.alergiaCuerpo", { agentes: allergyConflict.join(", ") })}</p>
              <p className="mt-1">{t("clinico.receta.alergiaDesbloqueo")}</p>
              <FieldWrapper label={t("clinico.receta.justificacion")} htmlFor="rx-allergy-justification">
                <Textarea
                  id="rx-allergy-justification"
                  rows={3}
                  value={allergyJustification}
                  onChange={(e) => setAllergyJustification(e.target.value)}
                  placeholder={t("clinico.receta.justificacionEjemplo")}
                />
              </FieldWrapper>
            </Aviso>
          )}

          {graveInteractions && (
            <Aviso variant="critico" title={t("clinico.receta.interaccionGrave")}>
              <ul className="list-disc pl-5">
                {graveInteractions.map((w, i) => (
                  <li key={i}>
                    <strong>
                      {w.medications[0]} + {w.medications[1]}
                    </strong>
                    : {w.description} <span className="text-sm">({w.source})</span>
                  </li>
                ))}
              </ul>
              <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-base">
                <input type="checkbox" checked={interactionConfirmed} onChange={(e) => setInteractionConfirmed(e.target.checked)} className="h-5 w-5" />
                {t("clinico.receta.confirmoInteraccion")}
              </label>
            </Aviso>
          )}

          {/* Corrección v2.1 §1/§17.6: la firma digital nunca es
              obligatoria para imprimir — el médico elige entre las
              dos rutas, ninguna es la opción "por defecto". */}
          <fieldset className="flex flex-col gap-2 rounded-md border border-gray-300 p-4">
            <legend className="px-1 text-sm font-medium text-gray-700">{t("clinico.receta.comoFirmar")}</legend>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-gray-100">
              <input
                type="radio"
                name="signatureRoute"
                className="mt-1 h-4 w-4"
                checked={signatureRoute === "HANDWRITTEN_AFTER_PRINT"}
                onChange={() => setSignatureRoute("HANDWRITTEN_AFTER_PRINT")}
              />
              <span>
                <span className="block text-base font-medium text-gray-900">{t("clinico.receta.imprimirYFirmar")}</span>
                <span className="block text-sm text-gray-500">{t("clinico.receta.imprimirYFirmarAyuda")}</span>
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
                <span className="block text-base font-medium text-gray-900">{t("clinico.receta.firmaDigital")}</span>
                <span className="block text-sm text-gray-500">{t("clinico.receta.firmaDigitalAyuda")}</span>
              </span>
            </label>
          </fieldset>

          {signatureRoute === "ELECTRONIC" && (
            <FieldWrapper label={t("clinico.receta.confirmaContrasena")} htmlFor="rx-password">
              <PasswordInput id="rx-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </FieldWrapper>
          )}

          {submitError ? (
            <Aviso variant="error" title={t("clinico.receta.noSePudoEmitir")}>
              {submitError instanceof ApiError ? submitError.message : t("clinico.receta.intentaDeNuevo")}
            </Aviso>
          ) : null}

          <Button
            type="button"
            isLoading={isSubmitting}
            disabled={
              !canSubmit ||
              (allergyConflict !== null && allergyJustification.trim().length < 15) ||
              (graveInteractions !== null && !interactionConfirmed)
            }
            onClick={() => void submitPrescription()}
          >
            {signatureRoute === "HANDWRITTEN_AFTER_PRINT" ? t("clinico.receta.generarParaFirma") : t("clinico.receta.firmarYEmitir")}
          </Button>
        </div>
      )}
    </Panel>
  );
}
