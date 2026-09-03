"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useSpecialties } from "@/lib/use-specialties";
import { Card, LoadingState, EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { IconShieldCheck, IconLock, IconClipboardList, IconStethoscope } from "@/components/ui/landing-icons";
import { SiteHeader } from "@/components/site-header";

// v2.4 (spec §7, M3): home de descubrimiento del paciente — reemplaza
// lo que vivía en "/" (reclutamiento de médicos, ahora en
// /para-medicos). Cada sección consume un endpoint real; nada aquí es
// una maqueta (CLAUDE.md §7).
const TRUST_ITEMS = [
  { icon: IconShieldCheck, label: "Especialistas con cédula verificada ante la SEP" },
  { icon: IconLock, label: "Tus datos, cifrados siempre" },
  { icon: IconClipboardList, label: "Bitácora de cada acceso a tu expediente" },
] as const;

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

export default function HomePage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [q, setQ] = useState("");

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/doctores${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <SiteHeader />

      <main>
        {/* Hero + búsqueda */}
        <section className="bg-white px-6 py-16 md:py-20">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
            <span className="w-fit rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-900">
              Médicos verificados en Guadalajara
            </span>
            <h1 className="font-heading text-3xl leading-tight text-brand-900 md:text-[44px]">
              Encuentra al especialista que necesitas
            </h1>
            <p className="text-lg text-gray-700">Conecta con médicos verificados y conoce su formación antes de agendar.</p>

            <form onSubmit={onSearch} className="mt-2 flex w-full max-w-xl flex-col gap-3 sm:flex-row">
              <TextInput
                aria-label="Especialidad o nombre del médico"
                placeholder="Ej. Cardiología, Dra. López…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" className="sm:w-auto">
                Buscar
              </Button>
            </form>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link href="/doctores?teleconsultation=true" className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-brand-100">
                Consulta en línea
              </Link>
              <Link
                href="/doctores?acceptsNewPatients=true"
                className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-brand-100"
              >
                Acepta pacientes nuevos
              </Link>
            </div>
          </div>

          <ul className="mx-auto mt-10 flex max-w-4xl flex-wrap items-center justify-center gap-3">
            {TRUST_ITEMS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm"
              >
                <Icon className="h-5 w-5 shrink-0 text-brand-700" />
                {label}
              </li>
            ))}
          </ul>
        </section>

        {accessToken ? <MyDoctorsSection accessToken={accessToken} /> : null}

        <SpecialtiesSection />
        <FeaturedDoctorsSection />
      </main>

      <footer className="border-t border-gray-300 bg-white px-6 py-10">
        <div className="mx-auto max-w-6xl text-center sm:text-left">
          <p className="font-brand text-base text-brand-900">Medicfy</p>
          <p className="text-sm text-gray-500">Encuentra y conoce a tu médico, dentro de la plataforma.</p>
        </div>
      </footer>
    </div>
  );
}

function SpecialtiesSection() {
  const { specialties, isLoading } = useSpecialties();
  if (isLoading || specialties.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl text-brand-900">Explora por especialidad</h2>
        <Link href="/doctores" className="text-sm font-medium text-brand-700 underline">
          Ver todas →
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {specialties.slice(0, 12).map((s) => (
          <Link
            key={s.code}
            href={`/doctores?specialty=${s.code}`}
            className="flex items-center gap-3 rounded-lg border border-gray-300 bg-white p-4 transition-shadow hover:shadow-card"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand-700">
              <IconStethoscope className="h-5 w-5" />
            </span>
            <span className="text-base font-medium text-gray-900">{s.nameEs}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function FeaturedDoctorsSection() {
  const [doctors, setDoctors] = useState<PublicDoctorSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ items: PublicDoctorSummary[] }>("/doctors/public?limit=6")
      .then((res) => {
        if (!cancelled) setDoctors(res.items);
      })
      .catch(() => {
        if (!cancelled) setDoctors([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (doctors === null) {
    return (
      <section className="mx-auto max-w-6xl px-6 py-12">
        <LoadingState />
      </section>
    );
  }
  if (doctors.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl text-brand-900">Especialistas que podrían ayudarte</h2>
        <Link href="/doctores" className="text-sm font-medium text-brand-700 underline">
          Ver todos →
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {doctors.map((d) => (
          <Card key={d.id} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              {d.photoUrl ? (
                <img src={d.photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-400" aria-hidden="true">
                  {d.displayName ? d.displayName.charAt(0).toUpperCase() : "?"}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-base font-medium text-gray-900">{d.displayName ?? "Perfil en configuración"}</p>
                <p className="truncate text-sm text-gray-500">{d.primarySpecialtyName ?? "Medicina General"}</p>
              </div>
            </div>
            {d.verified ? (
              <span className="inline-flex w-fit items-center gap-1 text-sm font-medium text-success-600">
                <IconShieldCheck className="h-4 w-4" />
                Verificado
              </span>
            ) : null}
            <Link href={`/dr/${d.slug}`}>
              <Button type="button" variant="secondary" className="w-full">
                Ver perfil
              </Button>
            </Link>
          </Card>
        ))}
      </div>
    </section>
  );
}

interface LinkedDoctor {
  id: string;
  slug: string;
  displayName: string | null;
  photoUrl: string | null;
  primarySpecialtyName: string;
  verified: boolean;
}
interface FeedPost {
  id: string;
  doctor: LinkedDoctor;
  title: string | null;
  body: string;
  publishedAt: string | null;
}

// M3-RN-007 (v2.4): "Tus médicos" — solo visible con sesión de
// paciente y al menos un care_relationship activo. El feed reutiliza
// las rutas de publicaciones que ya existen por médico (M2B); no hay
// un endpoint de feed agregado nuevo en el servidor.
function MyDoctorsSection({ accessToken }: { accessToken: string }) {
  const [doctors, setDoctors] = useState<LinkedDoctor[] | null>(null);
  const [feed, setFeed] = useState<FeedPost[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<LinkedDoctor[]>("/patients/me/doctors", { accessToken })
      .then((data) => {
        if (!cancelled) setDoctors(data);
      })
      .catch(() => {
        if (!cancelled) setDoctors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!doctors || doctors.length === 0) {
      setFeed(doctors ? [] : null);
      return;
    }
    let cancelled = false;
    Promise.all(
      doctors.slice(0, 5).map((doc) =>
        apiFetch<Omit<FeedPost, "doctor">[]>(`/doctors/${doc.slug}/public/posts`)
          .then((posts) => posts.slice(0, 2).map((p) => ({ ...p, doctor: doc })))
          .catch(() => [])
      )
    ).then((byDoctor) => {
      if (cancelled) return;
      const merged = byDoctor
        .flat()
        .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
        .slice(0, 6);
      setFeed(merged);
    });
    return () => {
      cancelled = true;
    };
  }, [doctors]);

  if (doctors === null) return null;
  if (doctors.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <h2 className="font-heading text-2xl text-brand-900">Tus médicos</h2>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {doctors.map((d) => (
          <Card key={d.id} className="flex items-center gap-3">
            {d.photoUrl ? (
              <img src={d.photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 text-lg text-gray-400" aria-hidden="true">
                {d.displayName ? d.displayName.charAt(0).toUpperCase() : "?"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium text-gray-900">{d.displayName ?? "Médico"}</p>
              <p className="truncate text-sm text-gray-500">{d.primarySpecialtyName}</p>
            </div>
            <Link href={`/dr/${d.slug}`} className="shrink-0 text-sm font-medium text-brand-700 underline">
              Ver perfil
            </Link>
          </Card>
        ))}
      </div>

      {feed && feed.length > 0 ? (
        <div className="mt-8">
          <h3 className="font-heading text-lg text-brand-900">Actualizaciones de tus médicos</h3>
          <div className="mt-4 flex flex-col gap-3">
            {feed.map((post) => (
              <Card key={post.id} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{post.doctor.displayName ?? "Tu médico"}</p>
                  <p className="truncate text-base text-gray-700">{post.title ?? post.body}</p>
                </div>
                <Link href={`/dr/${post.doctor.slug}`} className="shrink-0 text-sm font-medium text-brand-700 underline">
                  Ver
                </Link>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
      {feed && feed.length === 0 ? <EmptyState title="Sin actualizaciones recientes de tus médicos" /> : null}
    </section>
  );
}
