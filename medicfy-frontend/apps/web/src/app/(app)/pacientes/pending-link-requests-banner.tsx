"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PatientLinkRequestView } from "@medicfy/contracts";
import { apiFetch, expectArray } from "@/lib/api-client";
import { Aviso } from "@/components/ui/alert";
import { useI18n } from "@/lib/i18n/context";
import { formatDateMedium } from "@/lib/i18n/format";
import { tokenPrimaryRole } from "@/lib/jwt-claims";

// Listado de solicitudes de vinculación pendientes sobre los pacientes
// del médico. Cada una lleva a la ficha, donde se comparan los datos y
// se decide. Solo médico (el asistente recibe 403). Si la consulta
// falla, no se muestra nada: es un aviso, no el contenido de la pantalla.
export function PendingLinkRequestsBanner({ accessToken }: { accessToken: string }) {
  const { t, locale } = useI18n();
  const isDoctor = tokenPrimaryRole(accessToken) === "DOCTOR";
  const [requests, setRequests] = useState<PatientLinkRequestView[]>([]);

  useEffect(() => {
    if (!isDoctor) return;
    let cancelled = false;
    apiFetch<unknown>("/patient-link-requests", { accessToken })
      .then((data) => {
        if (!cancelled) setRequests(expectArray<PatientLinkRequestView>(data));
      })
      .catch(() => {
        if (!cancelled) setRequests([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isDoctor, accessToken]);

  if (requests.length === 0) return null;

  return (
    <Aviso variant="advertencia" title={t("vinculacion.solicitudes.listadoTitulo")}>
      <p>{t("vinculacion.solicitudes.listadoCuerpo")}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {requests.map((request) => (
          <li key={request.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-base text-gray-900">
              {[request.record.firstName, request.record.lastNamePaternal, request.record.lastNameMaternal].filter(Boolean).join(" ")} ·{" "}
              {request.medicfyId} · {t("vinculacion.solicitudes.recibida", { fecha: formatDateMedium(locale, request.createdAt) })}
            </span>
            <Link href={`/pacientes/${request.patientId}`} className="inline-flex min-h-[44px] items-center text-base font-medium text-brand-700 underline">
              {t("vinculacion.solicitudes.revisar")}
            </Link>
          </li>
        ))}
      </ul>
    </Aviso>
  );
}
