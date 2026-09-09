"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, expectArray } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Card, LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { FieldWrapper, TextInput } from "@/components/ui/field";

interface AdminDoctorSearchResult {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  professionalLicense: string;
  verificationStatus: string;
  subscriptionStatus: string | null;
  createdAt: string;
}

interface AdminPatientSearchResult {
  id: string;
  medicfyId: string;
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal: string | null;
  appointmentCount: number;
  linkedDoctorCount: number;
  createdAt: string;
}

interface AdminUsersSearchResponse {
  doctors: AdminDoctorSearchResult[];
  patients: AdminPatientSearchResult[];
}

// M13-RN-001: esta pantalla nunca pide ni muestra contenido clínico —
// solo identidad, conteos y (para médicos) el estado de suscripción
// placeholder que ya existe en el esquema. Búsqueda sin gate de rol en
// el cliente, mismo criterio que el resto de /admin (ver admin/page.tsx).
export default function AdminUsuariosPage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.replace("/login");
    }
  }, [authLoading, accessToken, router]);

  if (authLoading || !accessToken) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <LoadingState />
      </main>
    );
  }

  return <UsuariosSearch accessToken={accessToken} />;
}

function UsuariosSearch({ accessToken }: { accessToken: string }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AdminUsersSearchResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isSearching, setIsSearching] = useState(false);

  const search = useCallback(
    (q: string) => {
      if (q.trim().length === 0) {
        setResult(null);
        setError(null);
        return;
      }
      setIsSearching(true);
      apiFetch<unknown>(`/admin/users?q=${encodeURIComponent(q)}`, { accessToken })
        .then((data) => {
          const parsed = data as { doctors: unknown; patients: unknown };
          setResult({
            doctors: expectArray<AdminDoctorSearchResult>(parsed.doctors),
            patients: expectArray<AdminPatientSearchResult>(parsed.patients),
          });
          setError(null);
        })
        .catch((err: unknown) => setError(err))
        .finally(() => setIsSearching(false));
    },
    [accessToken]
  );

  // Debounce de 300ms — mismo patrón que medication-picker.tsx.
  useEffect(() => {
    const timeout = setTimeout(() => search(query), 300);
    return () => clearTimeout(timeout);
  }, [query, search]);

  const hasSearched = query.trim().length > 0;
  const totalResults = (result?.doctors.length ?? 0) + (result?.patients.length ?? 0);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">Usuarios</h1>
        <p className="text-base text-gray-500">
          Búsqueda de médicos y pacientes por nombre, cédula, Medicfy ID o correo — sin contenido clínico.
        </p>
      </div>

      <Card>
        <FieldWrapper label="Buscar" htmlFor="admin-users-q">
          <TextInput
            id="admin-users-q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, cédula, Medicfy ID o correo…"
          />
        </FieldWrapper>

        <div className="mt-6">
          {!hasSearched ? <EmptyState title="Escribe para buscar" description="Los resultados aparecen mientras escribes." /> : null}
          {hasSearched && isSearching && !result ? <LoadingState /> : null}
          {error ? <ErrorState error={error} onRetry={() => search(query)} /> : null}
          {hasSearched && result && !error && totalResults === 0 ? (
            <EmptyState title="Sin resultados" description="Prueba con otro nombre, cédula o correo." />
          ) : null}

          {result && result.doctors.length > 0 ? (
            <section className="mb-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Médicos</h2>
              <ul className="flex flex-col gap-2">
                {result.doctors.map((doctor) => (
                  <li key={doctor.id} className="rounded-md border border-gray-300 p-3">
                    <p className="text-base font-medium text-gray-900">
                      {doctor.legalFirstName} {doctor.legalLastName}
                    </p>
                    <p className="text-sm text-gray-500">
                      Cédula {doctor.professionalLicense} · {doctor.verificationStatus}
                      {doctor.subscriptionStatus ? ` · ${doctor.subscriptionStatus}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {result && result.patients.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Pacientes</h2>
              <ul className="flex flex-col gap-2">
                {result.patients.map((patient) => (
                  <li key={patient.id} className="rounded-md border border-gray-300 p-3">
                    <p className="text-base font-medium text-gray-900">
                      {patient.firstName} {patient.lastNamePaternal} {patient.lastNameMaternal ?? ""}
                    </p>
                    <p className="text-sm text-gray-500">
                      {patient.medicfyId} · {patient.appointmentCount} {patient.appointmentCount === 1 ? "consulta" : "consultas"} ·{" "}
                      {patient.linkedDoctorCount} {patient.linkedDoctorCount === 1 ? "médico vinculado" : "médicos vinculados"}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </Card>
    </main>
  );
}
