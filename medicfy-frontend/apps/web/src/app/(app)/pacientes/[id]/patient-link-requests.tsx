"use client";

import { useCallback, useEffect, useState } from "react";
import type { PatientIdentityData, PatientLinkRequestView } from "@medicfy/contracts";
import { apiFetch, expectArray } from "@/lib/api-client";
import { ErrorState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { formatCalendarDateLong, formatDateMedium } from "@/lib/i18n/format";
import { sexAtBirthLabel } from "@/lib/sex-label";
import { tokenPrimaryRole } from "@/lib/jwt-claims";

type IdentityField = { key: MessageKey; value: (d: PatientIdentityData) => string; compare: (d: PatientIdentityData) => string };

function normalizeForCompare(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function fullName(d: PatientIdentityData): string {
  return [d.firstName, d.lastNamePaternal, d.lastNameMaternal].filter(Boolean).join(" ");
}

// Aviso en la ficha cuando alguien se registró con el teléfono de este
// paciente: lo que esa persona escribió junto a lo que dice el
// expediente, para que el médico tratante apruebe o rechace. Solo para
// el médico — el servidor responde 403 a su asistente, así que ni se pide.
export function PatientLinkRequests({
  patientId,
  accessToken,
  onResolved,
}: {
  patientId: string;
  accessToken: string;
  onResolved?: () => void;
}) {
  const { t, locale } = useI18n();
  const { confirm, dialog } = useConfirmDialog();
  const isDoctor = tokenPrimaryRole(accessToken) === "DOCTOR";
  const [requests, setRequests] = useState<PatientLinkRequestView[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"aprobada" | "rechazada" | null>(null);

  const load = useCallback(async () => {
    if (!isDoctor) return;
    setLoadError(null);
    try {
      setRequests(expectArray<PatientLinkRequestView>(await apiFetch<unknown>(`/patients/${patientId}/link-requests`, { accessToken })));
    } catch (error) {
      setLoadError(error);
    }
  }, [isDoctor, patientId, accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const fields: IdentityField[] = [
    { key: "vinculacion.solicitudes.campos.nombre", value: fullName, compare: (d) => normalizeForCompare(fullName(d)) },
    { key: "vinculacion.solicitudes.campos.fechaNacimiento", value: (d) => formatCalendarDateLong(locale, d.birthDate), compare: (d) => d.birthDate },
    { key: "vinculacion.solicitudes.campos.sexo", value: (d) => sexAtBirthLabel(t, d.sexAtBirth), compare: (d) => d.sexAtBirth },
    { key: "vinculacion.solicitudes.campos.telefono", value: (d) => d.phoneE164, compare: (d) => d.phoneE164 },
    { key: "vinculacion.solicitudes.campos.correo", value: (d) => d.email, compare: (d) => d.email.toLowerCase() },
  ];

  async function decide(request: PatientLinkRequestView, decision: "approve" | "reject") {
    const accepted = await confirm(
      decision === "approve"
        ? {
            title: t("vinculacion.solicitudes.confirmarAprobarTitulo"),
            body: t("vinculacion.solicitudes.confirmarAprobarCuerpo", { correo: request.claimed.email, medicfyId: request.medicfyId }),
            confirmLabel: t("vinculacion.solicitudes.aprobar"),
          }
        : {
            title: t("vinculacion.solicitudes.confirmarRechazarTitulo"),
            body: t("vinculacion.solicitudes.confirmarRechazarCuerpo", { correo: request.claimed.email }),
            confirmLabel: t("vinculacion.solicitudes.rechazar"),
            destructive: true,
          }
    );
    if (!accepted) return;
    setActionError(null);
    setPendingId(request.id);
    try {
      await apiFetch(`/patient-link-requests/${request.id}/${decision}`, { method: "POST", accessToken });
      setOutcome(decision === "approve" ? "aprobada" : "rechazada");
      await load();
      onResolved?.();
    } catch (error) {
      setActionError(error);
    } finally {
      setPendingId(null);
    }
  }

  if (!isDoctor) return null;
  if (loadError) return <ErrorState error={loadError} onRetry={() => void load()} />;

  return (
    <>
      {outcome ? <Aviso variant="exito" title={t(`vinculacion.solicitudes.${outcome}`)} /> : null}
      {requests.map((request) => (
        <Aviso key={request.id} variant="advertencia" title={t("vinculacion.solicitudes.avisoTitulo")}>
          <div className="flex flex-col gap-3">
            <p>{t("vinculacion.solicitudes.avisoCuerpo")}</p>
            <p className="text-sm text-gray-500">{t("vinculacion.solicitudes.recibida", { fecha: formatDateMedium(locale, request.createdAt) })}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-left text-base">
                <thead>
                  <tr className="border-b border-gray-300 text-sm text-gray-500">
                    <th className="py-2 pr-3 font-medium" scope="col" />
                    <th className="py-2 pr-3 font-medium" scope="col">{t("vinculacion.solicitudes.columnaRegistro")}</th>
                    <th className="py-2 font-medium" scope="col">{t("vinculacion.solicitudes.columnaExpediente")}</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field) => {
                    const differs = field.compare(request.claimed) !== field.compare(request.record);
                    return (
                      <tr key={field.key} className="border-b border-gray-200 align-top">
                        <th className="py-2 pr-3 text-sm font-medium text-gray-500" scope="row">{t(field.key)}</th>
                        <td className="py-2 pr-3 text-gray-900">
                          {field.value(request.claimed)}
                          {differs ? (
                            <span className="ml-2 rounded-full border border-warn-600 px-2 py-0.5 text-sm text-warn-600">
                              ⚠ {t("vinculacion.solicitudes.distinto")}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 text-gray-900">{field.value(request.record)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" isLoading={pendingId === request.id} disabled={pendingId !== null} onClick={() => void decide(request, "approve")}>
                {t("vinculacion.solicitudes.aprobar")}
              </Button>
              <Button type="button" variant="destructive" disabled={pendingId !== null} onClick={() => void decide(request, "reject")}>
                {t("vinculacion.solicitudes.rechazar")}
              </Button>
            </div>
          </div>
        </Aviso>
      ))}
      {actionError ? <ErrorState error={actionError} /> : null}
      {dialog}
    </>
  );
}
