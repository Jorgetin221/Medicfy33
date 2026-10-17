"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useSpecialties } from "@/lib/use-specialties";
import { Card, LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput, SelectInput } from "@/components/ui/field";
import { IconShieldCheck } from "@/components/ui/landing-icons";
import { SiteHeader } from "@/components/site-header";
import { useT } from "@/lib/i18n/context";
import { useSpecialtyName } from "@/lib/i18n/catalog";

interface PublicDoctorSummary {
  id: string;
  slug: string;
  displayName: string | null;
  photoUrl: string | null;
  primarySpecialtyName: string | null;
  university: string | null;
  verified: boolean;
  acceptsTeleconsultation: boolean;
}
interface SearchResponse {
  items: PublicDoctorSummary[];
  nextCursor: string | null;
}

// M3 (spec §7, v2.3/v2.4): resultados de búsqueda, con filtros
// sincronizados a la URL para que sean compartibles (§13 del pedido
// del fundador). "cargar más" en vez de paginado numerado — más
// simple y suficiente para el volumen esperado.
export default function DoctoresPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <LoadingState />
        </div>
      }
    >
      <DoctoresContent />
    </Suspense>
  );
}

function DoctoresContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { specialties } = useSpecialties();
  const t = useT();
  const specialtyName = useSpecialtyName();

  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [specialty, setSpecialty] = useState(searchParams.get("specialty") ?? "");
  const [teleconsultation, setTeleconsultation] = useState(searchParams.get("teleconsultation") === "true");
  const [acceptsNewPatients, setAcceptsNewPatients] = useState(searchParams.get("acceptsNewPatients") === "true");

  const [results, setResults] = useState<PublicDoctorSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const buildQuery = useCallback(
    (cursor?: string) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (specialty) params.set("specialty", specialty);
      if (teleconsultation) params.set("teleconsultation", "true");
      if (acceptsNewPatients) params.set("acceptsNewPatients", "true");
      if (cursor) params.set("cursor", cursor);
      return params;
    },
    [q, specialty, teleconsultation, acceptsNewPatients]
  );

  const runSearch = useCallback(async () => {
    setError(null);
    setResults(null);
    try {
      const res = await apiFetch<SearchResponse>(`/doctors/public?${buildQuery().toString()}`);
      setResults(res.items);
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError(err);
    }
  }, [buildQuery]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // URL compartible: los filtros activos viven en la query string.
    const params = buildQuery();
    router.push(`/doctores${params.toString() ? `?${params.toString()}` : ""}`);
    void runSearch();
  }

  async function loadMore() {
    if (!nextCursor) return;
    setIsLoadingMore(true);
    try {
      const res = await apiFetch<SearchResponse>(`/doctors/public?${buildQuery(nextCursor).toString()}`);
      setResults((prev) => [...(prev ?? []), ...res.items]);
      setNextCursor(res.nextCursor);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <SiteHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <div>
          <h1 className="font-heading text-2xl text-brand-900">{t("directorio.titulo")}</h1>
          <p className="text-base text-gray-500">{t("directorio.subtitulo")}</p>
        </div>

        <Card>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldWrapper label={t("directorio.nombreMedico")} htmlFor="search-q">
                <TextInput id="search-q" placeholder={t("directorio.nombrePlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
              </FieldWrapper>
              <FieldWrapper label={t("directorio.especialidad")} htmlFor="search-specialty">
                <SelectInput id="search-specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
                  <option value="">{t("common.etiquetas.todas")}</option>
                  {specialties.map((s) => (
                    <option key={s.code} value={s.code}>
                      {specialtyName(s.code, s.nameEs)}
                    </option>
                  ))}
                </SelectInput>
              </FieldWrapper>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-base text-gray-900">
                <input type="checkbox" className="h-5 w-5" checked={teleconsultation} onChange={(e) => setTeleconsultation(e.target.checked)} />
                {t("directorio.consultaEnLinea")}
              </label>
              <label className="flex items-center gap-2 text-base text-gray-900">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={acceptsNewPatients}
                  onChange={(e) => setAcceptsNewPatients(e.target.checked)}
                />
                {t("directorio.aceptaPacientes")}
              </label>
            </div>
            <Button type="submit" className="w-fit">
              {t("common.acciones.buscar")}
            </Button>
          </form>
        </Card>

        {results === null && !error ? <LoadingState /> : null}
        {error ? <ErrorState error={error} onRetry={runSearch} /> : null}
        {results && results.length === 0 ? (
          <EmptyState title={t("directorio.sinResultados")} description={t("directorio.sinResultadosAyuda")} />
        ) : null}

        {results && results.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((doctor) => (
                <DoctorCard key={doctor.id} doctor={doctor} />
              ))}
            </div>
            {nextCursor ? (
              <Button type="button" variant="secondary" isLoading={isLoadingMore} onClick={() => void loadMore()} className="mx-auto">
                {t("directorio.cargarMas")}
              </Button>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}

function DoctorCard({ doctor }: { doctor: PublicDoctorSummary }) {
  const t = useT();
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {doctor.photoUrl ? (
          <img src={doctor.photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-400" aria-hidden="true">
            {doctor.displayName ? doctor.displayName.charAt(0).toUpperCase() : "?"}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-gray-900">{doctor.displayName ?? t("landing.destacados.perfilEnConfiguracion")}</p>
          <p className="truncate text-sm text-gray-500">{doctor.primarySpecialtyName ?? t("catalogos.especialidades.GENERAL")}</p>
        </div>
      </div>
      {doctor.verified ? (
        <span className="inline-flex w-fit items-center gap-1 text-sm font-medium text-success-600">
          <IconShieldCheck className="h-4 w-4" />
          {t("landing.destacados.verificado")}
        </span>
      ) : null}
      {doctor.university ? <p className="text-sm text-gray-600">{doctor.university}</p> : null}
      {doctor.acceptsTeleconsultation ? <p className="text-sm text-gray-500">{t("directorio.ofreceTeleconsulta")}</p> : null}
      <Link href={`/dr/${doctor.slug}`}>
        <Button type="button" variant="secondary" className="w-full">
          {t("landing.destacados.verPerfil")}
        </Button>
      </Link>
    </Card>
  );
}
