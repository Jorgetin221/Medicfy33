"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PatientShareRequestItem } from "@medicfy/contracts";
import { apiFetch, expectArray } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { IconBell, IconLogout, IconPulse } from "@/components/ui/nav-icons";
import { useT } from "@/lib/i18n/context";

// Encabezado del portal del paciente (/mi-cuenta y sus subpáginas). La
// campana lleva a las notificaciones: hoy, solicitudes de médicos para
// ver su expediente. El contador es solo un aviso — si la consulta
// falla, la campana se muestra sin número en vez de romper la pantalla.
export function PatientPortalHeader({ accessToken, refreshKey = 0 }: { accessToken: string; refreshKey?: number }) {
  const t = useT();
  const router = useRouter();
  const { logout } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<unknown>("/record-share/me/requests", { accessToken })
      .then((data) => {
        // Solo lo que necesita una decisión del paciente: lo que ya
        // autorizó y espera a su médico no cuenta.
        if (!cancelled) setPendingCount(expectArray<PatientShareRequestItem>(data).filter((r) => !r.awaitingCustodian).length);
      })
      .catch(() => {
        if (!cancelled) setPendingCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshKey]);

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  const bellLabel = pendingCount > 0 ? t("expedienteCompartido.bandeja.campanaPendientes", { n: pendingCount }) : t("expedienteCompartido.bandeja.campana");

  return (
    <header className="flex items-center justify-between border-b border-gray-300 bg-white px-6 py-4">
      <Link href="/mi-cuenta" className="flex items-center gap-2 font-heading text-lg text-brand-900">
        <IconPulse className="h-6 w-6 text-brand-700" />
        Medicfy BETA
      </Link>
      <div className="flex items-center gap-4">
        <Link
          href="/mi-cuenta/notificaciones"
          aria-label={bellLabel}
          title={bellLabel}
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100"
        >
          <IconBell className="h-6 w-6" />
          {pendingCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute right-0.5 top-0.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-warn-600 px-1 text-xs font-semibold text-white"
            >
              {pendingCount}
            </span>
          ) : null}
        </Link>
        <button type="button" onClick={() => void handleLogout()} className="flex min-h-11 items-center gap-2 text-sm font-medium text-gray-700">
          <IconLogout className="h-5 w-5" />
          {t("nav.rail.cerrarSesion")}
        </button>
      </div>
    </header>
  );
}
