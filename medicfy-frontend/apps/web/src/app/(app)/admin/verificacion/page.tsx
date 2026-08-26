"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useSpecialties } from "@/lib/use-specialties";
import type { DoctorVerificationStatus } from "@/lib/use-doctor-profile";
import { Card, LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { SelectInput, FieldWrapper } from "@/components/ui/field";

interface AdminDoctorListItem {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  professionalLicense: string;
  primarySpecialtyId: string | null;
  verificationStatus: DoctorVerificationStatus;
  createdAt: string;
}

const STATUS_LABELS: Record<DoctorVerificationStatus, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Por revisar",
  IN_REVIEW: "En revisión",
  VERIFIED: "Verificado",
  VERIFIED_SPECIALTY_UNCONFIRMED: "Verificado (especialidad sin confirmar)",
  REJECTED: "Rechazado",
  SUSPENDED: "Suspendido",
};

const FILTER_OPTIONS: { value: DoctorVerificationStatus | ""; label: string }[] = [
  { value: "SUBMITTED", label: "Por revisar" },
  { value: "IN_REVIEW", label: "En revisión" },
  { value: "VERIFIED", label: "Verificado" },
  { value: "VERIFIED_SPECIALTY_UNCONFIRMED", label: "Verificado (especialidad sin confirmar)" },
  { value: "REJECTED", label: "Rechazado" },
  { value: "SUSPENDED", label: "Suspendido" },
  { value: "", label: "Todos" },
];

// ADM-01. Sin gate de rol en el cliente — si quien llama no es ADMIN,
// AdminGuard ya responde 403 y ErrorState lo muestra tal cual (mismo
// criterio que el resto del frontend: el backend es la fuente de
// autorización, no el cliente).
export default function AdminVerificacionPage() {
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

  return <VerificacionList accessToken={accessToken} />;
}

function VerificacionList({ accessToken }: { accessToken: string }) {
  const { specialties } = useSpecialties();
  const [status, setStatus] = useState<DoctorVerificationStatus | "">("SUBMITTED");
  const [doctors, setDoctors] = useState<AdminDoctorListItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    setDoctors(null);
    const query = status ? `?verification_status=${status}` : "";
    apiFetch<AdminDoctorListItem[]>(`/admin/doctors${query}`, { accessToken })
      .then(setDoctors)
      .catch((err: unknown) => setError(err));
  }, [accessToken, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">Cola de verificación</h1>
        <p className="text-base text-gray-500">Médicos que han enviado documentos para verificar su cédula.</p>
      </div>

      <Card>
        <div className="max-w-xs">
          <FieldWrapper label="Estado" htmlFor="status-filter">
            <SelectInput id="status-filter" value={status} onChange={(e) => setStatus(e.target.value as DoctorVerificationStatus | "")}>
              {FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectInput>
          </FieldWrapper>
        </div>

        <div className="mt-6">
          {doctors === null && !error ? <LoadingState /> : null}
          {error ? <ErrorState error={error} onRetry={load} /> : null}
          {doctors && doctors.length === 0 ? (
            <EmptyState title="Sin médicos en este estado" description="Cambia el filtro para ver otros estados." />
          ) : null}
          {doctors && doctors.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {doctors.map((doctor) => {
                const specialtyName = specialties.find((s) => s.id === doctor.primarySpecialtyId)?.nameEs ?? "Medicina General";
                return (
                  <li key={doctor.id}>
                    <Link
                      href={`/admin/verificacion/${doctor.id}`}
                      className="flex min-h-[44px] items-center justify-between gap-4 rounded-md border border-gray-300 p-3 hover:bg-gray-100"
                    >
                      <div>
                        <p className="text-base font-medium text-gray-900">
                          {doctor.legalFirstName} {doctor.legalLastName}
                        </p>
                        <p className="text-sm text-gray-500">
                          Cédula {doctor.professionalLicense} · {specialtyName}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-sm font-medium text-brand-700">{STATUS_LABELS[doctor.verificationStatus]}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </Card>
    </main>
  );
}
