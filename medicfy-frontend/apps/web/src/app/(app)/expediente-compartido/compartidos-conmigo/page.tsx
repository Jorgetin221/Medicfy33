"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RecordShareGrantMine } from "@medicfy/contracts";
import { apiFetch, expectArray } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { useI18n, useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { formatDateTimeMedium } from "@/lib/i18n/format";

// PR-EXP-05 — "Compartidos conmigo": bandeja del médico RECEPTOR. A
// diferencia de "Mis solicitudes" (lo que ESTE médico pidió), aquí
// cada fila ya es acceso autorizado — por eso sí muestra el nombre
// del paciente (decisión §4 de 05-visor-medico-receptor.md).
export default function CompartidosConmigoPage() {
  const router = useRouter();
  const t = useT();
  const { locale } = useI18n();
  const { accessToken, isLoading: authLoading } = useAuth();
  const [grants, setGrants] = useState<RecordShareGrantMine[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const list = expectArray<RecordShareGrantMine>(await apiFetch<unknown>("/record-share/grants/mine", { accessToken }));
      setGrants(list);
    } catch (error) {
      setLoadError(error);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.replace("/login");
      return;
    }
    if (accessToken) void load();
  }, [authLoading, accessToken, router, load]);

  if (authLoading || !accessToken || grants === null) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        {loadError ? <ErrorState error={loadError} onRetry={load} /> : <LoadingState />}
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl text-brand-900">{t("expedienteCompartido.compartidosConmigo.titulo")}</h1>
          <p className="text-base text-gray-500">{t("expedienteCompartido.compartidosConmigo.subtitulo")}</p>
        </div>
        <Link href="/expediente-compartido/mis-solicitudes" className="flex min-h-11 items-center text-base font-medium text-brand-700 underline">
          {t("expedienteCompartido.misSolicitudes.titulo")}
        </Link>
      </div>

      {loadError ? <ErrorState error={loadError} onRetry={load} /> : null}

      {grants.length === 0 ? (
        <EmptyState title={t("expedienteCompartido.compartidosConmigo.vacio")} />
      ) : (
        <ul className="flex flex-col gap-3">
          {grants.map((grant) => (
            <li key={grant.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-base font-medium text-gray-900">{grant.patientName}</p>
                  <p className="text-sm text-gray-500">
                    {t("expedienteCompartido.compartidosConmigo.columnas.custodio")}: {grant.custodianDisplayName}
                  </p>
                  <p className="text-sm text-gray-500">
                    {grant.scope.map((scope) => t(`expedienteCompartido.solicitar.alcanceOpciones.${scope}` as MessageKey)).join(" · ")}
                  </p>
                  <p className="text-sm text-gray-500">
                    {t("expedienteCompartido.compartidosConmigo.columnas.vence")}: {formatDateTimeMedium(locale, grant.expiresAt)}
                  </p>
                </div>
                <Link href={`/expediente-compartido/compartidos-conmigo/${grant.id}`}>
                  <Button>{t("expedienteCompartido.compartidosConmigo.abrir")}</Button>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
