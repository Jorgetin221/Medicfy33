"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, expectArray } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useSpecialties } from "@/lib/use-specialties";
import type { DoctorVerificationStatus } from "@/lib/use-doctor-profile";
import { Card, LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { SelectInput, FieldWrapper } from "@/components/ui/field";
import { useT, type TranslateFn } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";

interface AdminDoctorListItem {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  professionalLicense: string;
  primarySpecialtyId: string | null;
  verificationStatus: DoctorVerificationStatus;
  createdAt: string;
  // M13-CA-003: calculado en el servidor (ver doctor-verification.service.ts) —
  // el frontend solo formatea, no calcula horario (CLAUDE.md §4).
  businessHoursWaiting: number;
}

// M13-CA-003: "alerta a las 24 h hábiles" — solo tiene sentido mientras
// el médico sigue en cola, no después de resuelto.
const PENDING_STATUSES: DoctorVerificationStatus[] = ["SUBMITTED", "IN_REVIEW"];

function formatAntiguedad(t: TranslateFn, hours: number): string {
  if (hours < 24) return t("admin.cola.horasEnCola", { h: hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? t("admin.cola.diaEnCola", { d: days }) : t("admin.cola.diasEnCola", { d: days });
}

const STATUS_LABEL_KEYS: Record<DoctorVerificationStatus, MessageKey> = {
  DRAFT: "admin.verificacionEstado.DRAFT",
  SUBMITTED: "admin.verificacionEstado.SUBMITTED",
  IN_REVIEW: "admin.verificacionEstado.IN_REVIEW",
  VERIFIED: "admin.verificacionEstado.VERIFIED",
  VERIFIED_SPECIALTY_UNCONFIRMED: "admin.verificacionEstado.VERIFIED_SPECIALTY_UNCONFIRMED",
  REJECTED: "admin.verificacionEstado.REJECTED",
  SUSPENDED: "admin.verificacionEstado.SUSPENDED",
};

const FILTER_OPTIONS: { value: DoctorVerificationStatus | ""; labelKey: MessageKey }[] = [
  { value: "SUBMITTED", labelKey: "admin.verificacionEstado.SUBMITTED" },
  { value: "IN_REVIEW", labelKey: "admin.verificacionEstado.IN_REVIEW" },
  { value: "VERIFIED", labelKey: "admin.verificacionEstado.VERIFIED" },
  { value: "VERIFIED_SPECIALTY_UNCONFIRMED", labelKey: "admin.verificacionEstado.VERIFIED_SPECIALTY_UNCONFIRMED" },
  { value: "REJECTED", labelKey: "admin.verificacionEstado.REJECTED" },
  { value: "SUSPENDED", labelKey: "admin.verificacionEstado.SUSPENDED" },
  { value: "", labelKey: "admin.verificacionEstado.TODOS" },
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
  const t = useT();
  const { specialties } = useSpecialties();
  const [status, setStatus] = useState<DoctorVerificationStatus | "">("SUBMITTED");
  const [doctors, setDoctors] = useState<AdminDoctorListItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    setDoctors(null);
    const query = status ? `?verification_status=${status}` : "";
    apiFetch<unknown>(`/admin/doctors${query}`, { accessToken })
      .then((data) => setDoctors(expectArray<AdminDoctorListItem>(data)))
      .catch((err: unknown) => setError(err));
  }, [accessToken, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">{t("admin.cola.titulo")}</h1>
        <p className="text-base text-gray-500">{t("admin.cola.subtitulo")}</p>
      </div>

      <Card>
        <div className="max-w-xs">
          <FieldWrapper label={t("admin.cola.estado")} htmlFor="status-filter">
            <SelectInput id="status-filter" value={status} onChange={(e) => setStatus(e.target.value as DoctorVerificationStatus | "")}>
              {FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </SelectInput>
          </FieldWrapper>
        </div>

        <div className="mt-6">
          {doctors === null && !error ? <LoadingState /> : null}
          {error ? <ErrorState error={error} onRetry={load} /> : null}
          {doctors && doctors.length === 0 ? (
            <EmptyState title={t("admin.cola.vacio")} description={t("admin.cola.vacioAyuda")} />
          ) : null}
          {doctors && doctors.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {doctors.map((doctor) => {
                const specialtyName = specialties.find((s) => s.id === doctor.primarySpecialtyId)?.nameEs ?? t("catalogos.especialidades.GENERAL");
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
                          {t("admin.usuarios.cedula", { numero: doctor.professionalLicense })} · {specialtyName} · {formatAntiguedad(t, doctor.businessHoursWaiting)}
                        </p>
                        {PENDING_STATUSES.includes(doctor.verificationStatus) && doctor.businessHoursWaiting >= 24 ? (
                          <span className="mt-1 inline-block rounded-full border border-danger-600 px-2 py-0.5 text-xs font-semibold text-danger-600">
                            {t("admin.cola.masDe24hBadge")}
                          </span>
                        ) : null}
                      </div>
                      <span className="whitespace-nowrap text-sm font-medium text-brand-700">{t(STATUS_LABEL_KEYS[doctor.verificationStatus])}</span>
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
