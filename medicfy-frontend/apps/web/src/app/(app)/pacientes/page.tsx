"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, expectArray } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Card, LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { TextInput } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";
import { patientAgeYears, patientFullName } from "../consulta/[appointmentId]/types";

interface PatientListItem {
  id: string;
  medicfyId: string;
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal: string | null;
  birthDate: string;
  sexAtBirth: "F" | "M";
}

// DOC-04 del inventario de pantallas del MVP (ESPECIFICACION_TECNICA_
// MEDICFY_MVP.md §9.2) — nunca se había construido. Sin esto, un
// paciente cuya cita no es hoy no tenía ninguna forma de alcanzarse
// desde la interfaz: /agenda solo muestra las citas de hoy, y no
// existía ninguna otra pantalla que listara pacientes. GET /patients
// ya existe y ya filtra por care_relationship activo con el médico
// autenticado — sin cambios de backend.
export default function PacientesPage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !accessToken) router.replace("/login");
  }, [authLoading, accessToken, router]);

  if (authLoading || !accessToken) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <LoadingState />
      </main>
    );
  }

  return <PacientesContent accessToken={accessToken} />;
}

function PacientesContent({ accessToken }: { accessToken: string }) {
  const t = useT();
  const [patients, setPatients] = useState<PatientListItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    setError(null);
    apiFetch<unknown>("/patients", { accessToken })
      .then((data) => setPatients(expectArray<PatientListItem>(data)))
      .catch((err: unknown) => setError(err));
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!patients) return [];
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => patientFullName(p).toLowerCase().includes(q) || p.medicfyId.toLowerCase().includes(q));
  }, [patients, query]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl text-brand-900">{t("pacientes.titulo")}</h1>
          <p className="text-base text-gray-500">{t("pacientes.subtitulo")}</p>
        </div>
        <Link href="/pacientes/nuevo">
          <Button type="button">{t("pacientes.nuevoPaciente")}</Button>
        </Link>
      </div>

      {error ? <ErrorState error={error} onRetry={load} /> : null}
      {!patients && !error ? <LoadingState /> : null}

      {patients && patients.length === 0 ? (
        <EmptyState title={t("pacientes.sinPacientes")} description={t("pacientes.sinPacientesAyuda")} />
      ) : null}

      {patients && patients.length > 0 ? (
        <div className="flex flex-col gap-4">
          <TextInput
            placeholder={t("pacientes.buscarPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t("pacientes.buscarEtiqueta")}
          />
          {filtered.length === 0 ? (
            <EmptyState title={t("pacientes.sinResultadosPara", { consulta: query })} />
          ) : (
            <ul className="flex flex-col gap-2">
              {filtered.map((p) => (
                <li key={p.id}>
                  <Link href={`/pacientes/${p.id}`}>
                    <Card className="transition hover:border-brand-700">
                      <p className="text-base font-medium text-gray-900">{patientFullName(p)}</p>
                      <p className="text-sm text-gray-500">
                        {p.medicfyId} · {t("pacientes.anios", { n: patientAgeYears(p.birthDate) })} ·{" "}
                        {p.sexAtBirth === "F" ? t("pacientes.mujer") : t("pacientes.hombre")}
                      </p>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </main>
  );
}
