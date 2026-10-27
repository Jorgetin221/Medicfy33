"use client";

import { useEffect, useRef, useState } from "react";
import type { LabOrderCreateInput } from "@medicfy/contracts";
import { apiFetch, ApiError, expectArray, newIdempotencyKey } from "@/lib/api-client";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { Aviso } from "@/components/ui/alert";
import { DocumentPreview } from "@/components/clinical/document-preview";
import { useT } from "@/lib/i18n/context";
import { LAB_CUSTOM_STUDY_MIN_LENGTH } from "@medicfy/contracts";

// Búsqueda sin acentos ni mayúsculas: "biometria" encuentra "Biometría".
function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function matchesSearch(term: CatalogTerm, query: string): boolean {
  const q = normalizeSearch(query.trim());
  if (!q) return true;
  return [term.preferredTerm, ...(term.synonyms ?? [])].some((name) => normalizeSearch(name).includes(q));
}

// Prompt 37 (F4): el estudio viene del catálogo en DOS niveles (el
// tipo vive en externalCode del término) y cada estudio lleva su
// MOTIVO, también de catálogo — sin motivo, la orden no se emite.
interface CatalogTerm {
  key: string;
  preferredTerm: string;
  externalCode?: string | null;
  synonyms?: string[];
}

// Del catálogo (studyKey) o escrito por el médico (customStudyName,
// 2026-10-17: "un apartado para escribir su propio estudio").
interface DraftStudy {
  studyKey?: string;
  customStudyName?: string;
  studyLabel: string;
  motiveKey: string;
  motiveLabel: string;
  notes?: string;
}

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
// reautenticación — la firma electrónica es opcional (a petición
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
  const t = useT();
  const [items, setItems] = useState<DraftStudy[]>([]);
  const [tipos, setTipos] = useState<CatalogTerm[]>([]);
  const [estudios, setEstudios] = useState<CatalogTerm[]>([]);
  const [motivos, setMotivos] = useState<CatalogTerm[]>([]);
  const [tipoKey, setTipoKey] = useState("");
  const [studyKey, setStudyKey] = useState("");
  const [studySearch, setStudySearch] = useState("");
  const [customStudy, setCustomStudy] = useState("");
  const [motiveKey, setMotiveKey] = useState("");
  const [clinicalIndication, setClinicalIndication] = useState("");
  const [fastingRequired, setFastingRequired] = useState(false);
  // Igual que en PrescriptionPanel: null hasta que el médico elige,
  // ninguna ruta es la opción "por defecto".
  const [signatureRoute, setSignatureRoute] = useState<SignatureRoute | null>(null);
  const [password, setPassword] = useState("");
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issued, setIssued] = useState<IssuedLabOrder | null>(null);

  useEffect(() => {
    if (!open) return;
    apiFetch<unknown>("/catalogs/TIPO_ESTUDIO", { accessToken }).then((data) => setTipos(expectArray<CatalogTerm>(data))).catch(() => setTipos([]));
    apiFetch<unknown>("/catalogs/ESTUDIO_LABORATORIO", { accessToken }).then((data) => setEstudios(expectArray<CatalogTerm>(data))).catch(() => setEstudios([]));
    apiFetch<unknown>("/catalogs/MOTIVO_ESTUDIO", { accessToken }).then((data) => setMotivos(expectArray<CatalogTerm>(data))).catch(() => setMotivos([]));
  }, [open, accessToken]);

  // A-14: una llave por orden que el médico intenta emitir. Se
  // conserva si reintenta tras un error (de red o de validación) y se
  // renueva al empezar otra — el servidor nunca emite dos folios para
  // el mismo intento.
  const idempotencyKeyRef = useRef(newIdempotencyKey());

  function resetAll() {
    idempotencyKeyRef.current = newIdempotencyKey();
    setItems([]);
    setTipoKey("");
    setStudyKey("");
    setStudySearch("");
    setCustomStudy("");
    setMotiveKey("");
    setClinicalIndication("");
    setFastingRequired(false);
    setSignatureRoute(null);
    setPassword("");
    setSubmitError(null);
    setIssued(null);
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  const customStudyName = customStudy.trim();
  const canAddStudy = Boolean(motiveKey) && (Boolean(studyKey) || customStudyName.length >= LAB_CUSTOM_STUDY_MIN_LENGTH);

  function addStudy() {
    const motive = motivos.find((m) => m.key === motiveKey);
    if (!motive || !canAddStudy) return;
    const study = estudios.find((e) => e.key === studyKey);
    const entry: DraftStudy = study
      ? { studyKey: study.key, studyLabel: study.preferredTerm, motiveKey: motive.key, motiveLabel: motive.preferredTerm }
      : { customStudyName, studyLabel: customStudyName, motiveKey: motive.key, motiveLabel: motive.preferredTerm };
    setItems([...items, entry]);
    setStudyKey("");
    setStudySearch("");
    setCustomStudy("");
    setMotiveKey("");
  }

  function removeStudy(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  async function submit() {
    if (!signatureRoute) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const base = {
        items: items.map((i) => ({
          ...(i.studyKey ? { studyKey: i.studyKey } : { customStudyName: i.customStudyName ?? i.studyLabel }),
          motiveKey: i.motiveKey,
          ...(i.notes ? { notes: i.notes } : {}),
        })),
        clinicalIndication,
        ...(fastingRequired ? { fastingRequired: true } : {}),
      };
      const body: LabOrderCreateInput =
        signatureRoute === "HANDWRITTEN_AFTER_PRINT"
          ? { ...base, signatureRoute: "HANDWRITTEN_AFTER_PRINT" }
          : { ...base, signatureRoute: "ELECTRONIC", password };
      const result = await apiFetch<{ id: string; folio: string; qrVerificationToken: string; signatureRoute: SignatureRoute }>(
        `/lab-orders/encounters/${encounterId}`,
        { method: "POST", accessToken, body, idempotencyKey: idempotencyKeyRef.current }
      );
      setIssued({ id: result.id, folio: result.folio, qrVerificationToken: result.qrVerificationToken, signatureRoute: result.signatureRoute });
      onIssued();
    } catch (error) {
      setSubmitError(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasRequiredContent = items.length > 0 && clinicalIndication.trim().length > 0;
  const canSubmit =
    hasRequiredContent &&
    (signatureRoute === "HANDWRITTEN_AFTER_PRINT" || (signatureRoute === "ELECTRONIC" && password.length > 0));

  return (
    <Panel open={open} onClose={handleClose} title={t("clinico.orden.panelTitulo")} wide={issued !== null}>
      {issued ? (
        <div className="flex flex-col gap-4">
          <Aviso variant="exito" title={t("clinico.orden.emitida", { folio: issued.folio })}>
            <p className="mt-1 break-all">
              {t("clinico.orden.verificacionPublica")} <span className="font-mono">/verificar/{issued.qrVerificationToken}</span>
            </p>
          </Aviso>
          {issued.signatureRoute === "HANDWRITTEN_AFTER_PRINT" && (
            <Aviso variant="advertencia" title={t("clinico.orden.firmaPendiente")}>
              {t("clinico.orden.firmaPendienteCuerpo")}
            </Aviso>
          )}
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={resetAll}>
              {t("clinico.orden.ordenarOtro")}
            </Button>
            <Button type="button" onClick={handleClose}>
              {t("common.acciones.cerrar")}
            </Button>
          </div>
          {/* La orden completa tal como se imprime: membrete, paciente,
              estudios y firma — el mismo PDF que queda en el expediente. */}
          <DocumentPreview path={`/lab-orders/${issued.id}/pdf`} accessToken={accessToken} downloadName={`orden-${issued.folio}.pdf`} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {items.length > 0 && (
            <ul className="flex flex-col gap-2">
              {items.map((item, index) => (
                <li key={`${item.studyKey ?? item.customStudyName}-${index}`} className="flex items-center justify-between rounded-md border border-gray-300 px-3 py-2">
                  <span>
                    <span className="block text-base text-gray-900">{item.studyLabel}</span>
                    {item.customStudyName ? <span className="block text-sm text-gray-500">{t("clinico.orden.estudioFueraCatalogo")}</span> : null}
                    <span className="block text-sm text-gray-500">{t("clinico.orden.motivoLinea", { motivo: item.motiveLabel })}</span>
                  </span>
                  <Button type="button" variant="destructive" onClick={() => removeStudy(index)} className="min-h-11 px-3 text-sm">
                    {t("common.acciones.quitar")}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {/* Dos niveles: tipo (laboratorio / imagen / gabinete) y
              estudio del catálogo, con buscador. Si no está, el médico
              lo escribe (customStudyName); el motivo siempre de catálogo. */}
          <div className="grid grid-cols-1 gap-3">
            <FieldWrapper label={t("clinico.orden.tipoEstudio")} htmlFor="lab-tipo">
              <select
                id="lab-tipo"
                value={tipoKey}
                onChange={(e) => {
                  setTipoKey(e.target.value);
                  setStudyKey("");
                }}
                className="min-h-11 w-full rounded-md border border-gray-300 px-3 text-base"
              >
                <option value="">{t("clinico.orden.todosLosTipos")}</option>
                {tipos.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.preferredTerm}
                  </option>
                ))}
              </select>
            </FieldWrapper>
            <FieldWrapper label={t("clinico.orden.buscarEstudio")} htmlFor="lab-study-search">
              <TextInput
                id="lab-study-search"
                value={studySearch}
                onChange={(e) => setStudySearch(e.target.value)}
                placeholder={t("clinico.orden.buscarEstudioEjemplo")}
              />
            </FieldWrapper>
            <FieldWrapper label={t("clinico.orden.estudioCatalogo")} htmlFor="lab-study">
              <select
                id="lab-study"
                value={studyKey}
                onChange={(e) => {
                  setStudyKey(e.target.value);
                  if (e.target.value) setCustomStudy("");
                }}
                className="min-h-11 w-full rounded-md border border-gray-300 px-3 text-base"
              >
                <option value="">{t("clinico.orden.seleccionaEstudio")}</option>
                {estudios
                  .filter((e) => (!tipoKey || e.externalCode === tipoKey) && matchesSearch(e, studySearch))
                  .map((e) => (
                    <option key={e.key} value={e.key}>
                      {e.preferredTerm}
                    </option>
                  ))}
              </select>
            </FieldWrapper>
            <FieldWrapper label={t("clinico.orden.estudioPropio")} htmlFor="lab-custom-study" hint={t("clinico.orden.estudioPropioAyuda")}>
              <TextInput
                id="lab-custom-study"
                value={customStudy}
                maxLength={200}
                onChange={(e) => {
                  setCustomStudy(e.target.value);
                  if (e.target.value.trim()) setStudyKey("");
                }}
                placeholder={t("clinico.orden.estudioPropioEjemplo")}
              />
            </FieldWrapper>
            <FieldWrapper label={t("clinico.orden.motivoEstudio")} htmlFor="lab-motive" hint={t("clinico.orden.motivoAyuda")}>
              <select
                id="lab-motive"
                value={motiveKey}
                onChange={(e) => setMotiveKey(e.target.value)}
                className="min-h-11 w-full rounded-md border border-gray-300 px-3 text-base"
              >
                <option value="">{t("clinico.orden.seleccionaMotivo")}</option>
                {motivos.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.preferredTerm}
                  </option>
                ))}
              </select>
            </FieldWrapper>
            <Button type="button" variant="secondary" onClick={addStudy} disabled={!canAddStudy} className="w-fit min-h-11 px-3 text-sm">
              {t("clinico.orden.agregarEstudio")}
            </Button>
          </div>

          <FieldWrapper label={t("clinico.orden.indicacionClinica")} htmlFor="lab-indication">
            <TextInput id="lab-indication" value={clinicalIndication} onChange={(e) => setClinicalIndication(e.target.value)} />
          </FieldWrapper>

          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-base text-gray-700">
            <input type="checkbox" checked={fastingRequired} onChange={(e) => setFastingRequired(e.target.checked)} className="h-5 w-5" />
            {t("clinico.orden.requiereAyuno")}
          </label>

          {/* Mismo principio que PrescriptionPanel: la firma
              electrónica nunca es obligatoria, el médico elige. */}
          <fieldset className="flex flex-col gap-2 rounded-md border border-gray-300 p-4">
            <legend className="px-1 text-sm font-medium text-gray-700">{t("clinico.orden.comoFirmar")}</legend>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-gray-100">
              <input
                type="radio"
                name="labSignatureRoute"
                className="mt-1 h-4 w-4"
                checked={signatureRoute === "HANDWRITTEN_AFTER_PRINT"}
                onChange={() => setSignatureRoute("HANDWRITTEN_AFTER_PRINT")}
              />
              <span>
                <span className="block text-base font-medium text-gray-900">{t("clinico.receta.imprimirYFirmar")}</span>
                <span className="block text-sm text-gray-500">{t("clinico.orden.imprimirYFirmarAyuda")}</span>
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
                <span className="block text-base font-medium text-gray-900">{t("clinico.receta.firmaDigital")}</span>
                <span className="block text-sm text-gray-500">{t("clinico.receta.firmaDigitalAyuda")}</span>
              </span>
            </label>
          </fieldset>

          {signatureRoute === "ELECTRONIC" && (
            <FieldWrapper label={t("clinico.receta.confirmaContrasena")} htmlFor="lab-password">
              <PasswordInput id="lab-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </FieldWrapper>
          )}

          {submitError ? (
            <Aviso variant="error" title={t("clinico.orden.noSePudoEmitir")}>
              {submitError instanceof ApiError ? submitError.message : t("clinico.receta.intentaDeNuevo")}
            </Aviso>
          ) : null}

          <Button type="button" isLoading={isSubmitting} disabled={!canSubmit} onClick={() => void submit()}>
            {signatureRoute === "HANDWRITTEN_AFTER_PRINT" ? t("clinico.orden.generarParaFirma") : t("clinico.orden.firmarYEmitir")}
          </Button>
        </div>
      )}
    </Panel>
  );
}
