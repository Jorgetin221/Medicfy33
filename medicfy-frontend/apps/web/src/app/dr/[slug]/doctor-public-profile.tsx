"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EDUCATIONAL_POST_CATEGORIES, type PostCategory } from "@medicfy/contracts";
import { apiFetch, ApiError, expectArray } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { tokenPrimaryRole } from "@/lib/jwt-claims";
import { Card, LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldWrapper, SelectInput } from "@/components/ui/field";
import { IconShieldCheck } from "@/components/ui/landing-icons";
import { useI18n, useT, type TranslateFn } from "@/lib/i18n/context";
import { INTL_LOCALE, type Locale } from "@/lib/i18n/config";
import { formatDateLong, formatTime, formatWeekdayLong, toIsoDateKey } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/dictionaries";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

// M2B (spec §7, v2.2). Mismo criterio de "redeclarar, no importar
// tipos del backend" que el resto de este archivo.
const CATEGORY_LABEL_KEYS: Record<PostCategory, MessageKey> = {
  HEALTH_EDUCATION: "perfilPublico.categorias.HEALTH_EDUCATION",
  HEALTH_TIP: "perfilPublico.categorias.HEALTH_TIP",
  HEALTH_FACT: "perfilPublico.categorias.HEALTH_FACT",
  PROFESSIONAL_UPDATE: "perfilPublico.categorias.PROFESSIONAL_UPDATE",
  CONGRESS: "perfilPublico.categorias.CONGRESS",
  RESEARCH: "perfilPublico.categorias.RESEARCH",
  CERTIFICATION: "perfilPublico.categorias.CERTIFICATION",
  PATIENT_NOTICE: "perfilPublico.categorias.PATIENT_NOTICE",
  PREVENTION: "perfilPublico.categorias.PREVENTION",
  LIFESTYLE: "perfilPublico.categorias.LIFESTYLE",
  VIDEO: "perfilPublico.categorias.VIDEO",
  PHOTO: "perfilPublico.categorias.PHOTO",
  ANNOUNCEMENT: "perfilPublico.categorias.ANNOUNCEMENT",
};
const EDUCATIONAL_SET = new Set<string>(EDUCATIONAL_POST_CATEGORIES);

// Estilo "hace 2 días" para que el feed se sienta vivo, sin pretender
// más precisión de la que aporta — pasado un mes, mejor una fecha real.
// Intl.RelativeTimeFormat hace la concordancia de cada idioma sola
// ("hace 2 días" / "2 days ago"), que a mano se vuelve una tabla de
// plurales por idioma.
function relativeTime(locale: Locale, t: TranslateFn, iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return t("perfilPublico.justoAhora");
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: "auto", style: "short" });
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return rtf.format(-days, "day");
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return rtf.format(-weeks, "week");
  return formatDateLong(locale, iso);
}

function mxDateKey(iso: string): string {
  return toIsoDateKey(iso);
}
function mxDateLabel(locale: Locale, dateKey: string): string {
  // En inglés el día de la semana ya viene en mayúscula; en español
  // no, y aquí encabeza una línea.
  const label = formatWeekdayLong(locale, new Date(`${dateKey}T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function mxTime(locale: Locale, iso: string): string {
  return formatTime(locale, iso);
}

// Mismos shapes que doctor-public-view.ts (backend) — este archivo no
// importa tipos del backend (ningún otro screen de esta app lo hace),
// así que se redeclaran aquí, igual que DoctorProfile en
// use-doctor-profile.ts.
interface PublicPracticeLocation {
  id: string;
  name: string;
  addressStreet: string | null;
  addressExt: string | null;
  addressInt: string | null;
  addressColonia: string | null;
  addressMunicipality: string | null;
  addressState: string | null;
  addressPostalCode: string | null;
  phone: string | null;
  isPrimary: boolean;
}
interface PublicDoctor {
  id: string;
  slug: string;
  displayName: string | null;
  photoUrl: string | null;
  biography: string | null;
  primarySpecialtyName: string | null;
  yearsExperience: number | null;
  languages: string[];
  university: string | null;
  verified: boolean;
  acceptsNewPatients: boolean;
  acceptsTeleconsultation: boolean;
  isBookable: boolean;
  practiceLocations: PublicPracticeLocation[];
}
interface PublicService {
  id: string;
  name: string;
  durationMinutes: number;
}
interface AvailableSlot {
  startAt: string;
  endAt: string;
}
interface PublicPostMedia {
  id: string;
  mediaType: string;
  displayOrder: number;
}
interface PublicPost {
  id: string;
  title: string | null;
  body: string;
  category: PostCategory;
  publishedAt: string | null;
  media: PublicPostMedia[];
}

function formatLocationAddress(loc: PublicPracticeLocation): string {
  return [loc.addressStreet, loc.addressColonia, loc.addressMunicipality, loc.addressState].filter(Boolean).join(", ") || "Dirección no publicada";
}

export function DoctorPublicProfile({ slug }: { slug: string }) {
  const t = useT();
  const [doctor, setDoctor] = useState<PublicDoctor | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PublicDoctor>(`/doctors/${slug}/public`)
      .then((data) => {
        if (!cancelled) setDoctor(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const notFound = error instanceof ApiError && error.status === 404;

  if (notFound) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
        <Card>
          <Aviso variant="advertencia" title={t("perfilPublico.noEncontradoTitulo")}>
            {t("perfilPublico.noEncontradoCuerpo")}
          </Aviso>
        </Card>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <ErrorState error={error} />
      </main>
    );
  }

  if (!doctor) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center p-6">
        <LoadingState />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <HeroSection doctor={doctor} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr] lg:items-start">
        <div className="flex flex-col gap-6 lg:sticky lg:top-6">
          {doctor.biography ? (
            <Card>
              <h2 className="font-heading text-lg text-brand-900">{t("perfilPublico.acercaDe")}</h2>
              <p className="mt-3 whitespace-pre-line text-base text-gray-900">{doctor.biography}</p>
            </Card>
          ) : null}
          <LocationsSection locations={doctor.practiceLocations} teleconsultation={doctor.acceptsTeleconsultation} />
          <AvailabilitySection doctor={doctor} />
        </div>
        <PostsSection slug={doctor.slug} doctor={doctor} />
      </div>
    </main>
  );
}

function HeroSection({ doctor }: { doctor: PublicDoctor }) {
  const t = useT();

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: doctor.displayName ?? t("perfilPublico.perfilEnMedicfy"), url });
        return;
      } catch {
        // Usuario canceló el share nativo — cae al copiar el enlace.
      }
    }
    await navigator.clipboard.writeText(url);
  }

  const facts: string[] = [];
  if (doctor.yearsExperience !== null)
    facts.push(`📅 ${t("perfilPublico.aniosExperiencia", { anios: doctor.yearsExperience })}`);
  if (doctor.university) facts.push(`🎓 ${doctor.university}`);
  if (doctor.languages.length > 0) facts.push(`🗣️ ${doctor.languages.join(", ")}`);
  if (doctor.acceptsTeleconsultation) facts.push(`💻 ${t("perfilPublico.ofreceTeleconsulta")}`);

  return (
    <Card>
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        {doctor.photoUrl ? (
          <img src={doctor.photoUrl} alt={doctor.displayName ?? t("perfilPublico.fotoDelMedico")} className="h-28 w-28 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-gray-100 text-3xl text-gray-400" aria-hidden="true">
            {doctor.displayName ? doctor.displayName.charAt(0).toUpperCase() : "?"}
          </div>
        )}
        <div className="flex-1">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <h1 className="font-heading text-2xl text-brand-900">{doctor.displayName ?? t("landing.destacados.perfilEnConfiguracion")}</h1>
            {doctor.verified ? (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-success-600" title={t("perfilPublico.medicoVerificado")}>
                <IconShieldCheck className="h-5 w-5" />
                {t("landing.destacados.verificado")}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-base font-medium text-brand-700">{doctor.primarySpecialtyName ?? t("catalogos.especialidades.GENERAL")}</p>

          {facts.length > 0 ? (
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              {facts.map((fact) => (
                <span key={fact} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                  {fact}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <Button type="button" variant="secondary" onClick={() => void share()} className="shrink-0">
          Compartir perfil
        </Button>
      </div>
      {!doctor.acceptsNewPatients ? (
        <div className="mt-4">
          <Aviso variant="advertencia" title={t("perfilPublico.noAceptaPacientes")} />
        </div>
      ) : null}
    </Card>
  );
}

// M2B (spec §7, v2.2): solo visibility=PUBLIC y status=PUBLISHED
// llegan aquí — el backend ya filtró (toPublicPostView), esta sección
// no vuelve a decidir nada, solo pinta lo que recibió. Sin contadores
// de like/comentario/guardar: no existen (comentarios/reacciones
// quedaron fuera de esta versión, spec §7 M2B) — mostrarlos sería una
// función que no hace nada (CLAUDE.md §25).
function PostsSection({ slug, doctor }: { slug: string; doctor: PublicDoctor }) {
  const { t, locale } = useI18n();
  const [posts, setPosts] = useState<PublicPost[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<unknown>(`/doctors/${slug}/public/posts`)
      .then((data) => {
        if (!cancelled) setPosts(expectArray<PublicPost>(data));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) return null; // sección secundaria — un fallo aquí no debe tumbar el resto del perfil
  if (posts === null) {
    return (
      <Card>
        <h2 className="font-heading text-xl text-brand-900">{t("perfilPublico.publicaciones")}</h2>
        <div className="mt-4">
          <LoadingState />
        </div>
      </Card>
    );
  }
  if (posts.length === 0) {
    return (
      <Card>
        <h2 className="font-heading text-xl text-brand-900">{t("perfilPublico.publicaciones")}</h2>
        <div className="mt-4">
          <EmptyState title={t("perfilPublico.sinPublicaciones")} />
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {posts.map((post) => (
        <Card key={post.id}>
          <div className="flex items-center gap-3">
            {doctor.photoUrl ? (
              <img src={doctor.photoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm text-gray-400" aria-hidden="true">
                {doctor.displayName ? doctor.displayName.charAt(0).toUpperCase() : "?"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium text-gray-900">{doctor.displayName ?? t("landing.misMedicos.medico")}</p>
              {post.publishedAt ? <p className="text-sm text-gray-500">{relativeTime(locale, t, post.publishedAt)}</p> : null}
            </div>
            <span className="shrink-0 rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">
              {t(CATEGORY_LABEL_KEYS[post.category])}
            </span>
          </div>

          {post.title ? <p className="mt-3 font-heading text-lg text-brand-900">{post.title}</p> : null}
          <p className="mt-1 whitespace-pre-line text-base text-gray-900">{post.body}</p>
          {post.media.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {post.media.map((m) => (
                <img
                  key={m.id}
                  src={`${API_BASE_URL}/doctors/${slug}/public/posts/${post.id}/media/${m.id}`}
                  alt=""
                  className="h-48 w-full max-w-sm rounded-md object-cover"
                />
              ))}
            </div>
          ) : null}
          {EDUCATIONAL_SET.has(post.category) ? (
            <p className="mt-3 border-t border-gray-200 pt-3 text-sm text-gray-500">{t("perfilPublico.disclaimerEducativo")}</p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

// M5-RN-009/M5-RN-010 (spec §7, v2.3): "Book Appointment" real —
// POST /doctors/{id}/public-appointments, autenticado como PATIENT,
// patientId siempre resuelto del token en el servidor (nunca de este
// formulario). Sin sesión de paciente, el slot manda a /login con
// ?redirect de vuelta a este perfil — nunca un botón que no hace nada.
function AvailabilitySection({ doctor }: { doctor: PublicDoctor }) {
  const { accessToken } = useAuth();
  const { t, locale } = useI18n();
  const isPatientSession = !!accessToken && tokenPrimaryRole(accessToken) === "PATIENT";

  const [services, setServices] = useState<PublicService[] | null>(null);
  const [servicesError, setServicesError] = useState<unknown>(null);
  const [serviceId, setServiceId] = useState("");
  const [slots, setSlots] = useState<AvailableSlot[] | null>(null);
  const [slotsError, setSlotsError] = useState<unknown>(null);
  const [bookingError, setBookingError] = useState<unknown>(null);
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);
  const [booked, setBooked] = useState<AvailableSlot | null>(null);

  useEffect(() => {
    if (!doctor.isBookable || !isPatientSession) return;
    apiFetch<unknown>(`/doctors/${doctor.slug}/public/services`)
      .then((data) => setServices(expectArray<PublicService>(data)))
      .catch((err: unknown) => setServicesError(err));
  }, [doctor.slug, doctor.isBookable, isPatientSession]);

  const loadSlots = useCallback(async () => {
    if (!serviceId) return;
    setSlotsError(null);
    setSlots(null);
    try {
      setSlots(expectArray<AvailableSlot>(await apiFetch<unknown>(`/doctors/${doctor.id}/availability?service_id=${serviceId}`)));
    } catch (err) {
      setSlotsError(err);
    }
  }, [doctor.id, serviceId]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  async function book(slot: AvailableSlot) {
    if (!accessToken) return;
    setBookingError(null);
    setBookingSlot(slot.startAt);
    try {
      await apiFetch(`/doctors/${doctor.id}/public-appointments`, {
        method: "POST",
        accessToken,
        body: { serviceId, startsAt: slot.startAt },
      });
      setBooked(slot);
    } catch (err) {
      setBookingError(err);
      if (err instanceof ApiError && err.code === "SLOT_TAKEN") {
        await loadSlots();
      }
    } finally {
      setBookingSlot(null);
    }
  }

  if (!doctor.isBookable) {
    return (
      <Card>
        <h2 className="font-heading text-xl text-brand-900">{t("perfilPublico.disponibilidad")}</h2>
        <div className="mt-4">
          <Aviso variant="info" title={t("perfilPublico.noAgendable")}>
            {t("perfilPublico.noAgendableCuerpo")}
          </Aviso>
        </div>
      </Card>
    );
  }

  if (booked) {
    return (
      <Card>
        <Aviso variant="exito" title={t("perfilPublico.citaAgendada")}>
          {t("perfilPublico.citaAgendadaCuerpo", {
            fecha: mxDateLabel(locale, mxDateKey(booked.startAt)),
            hora: mxTime(locale, booked.startAt),
          })}
        </Aviso>
        <Link href="/mi-cuenta" className="mt-3 inline-block text-sm font-medium text-brand-700 underline">
          {t("perfilPublico.verMisCitas")}
        </Link>
      </Card>
    );
  }

  if (!isPatientSession) {
    return (
      <Card>
        <h2 className="font-heading text-xl text-brand-900">{t("perfilPublico.disponibilidad")}</h2>
        <p className="text-sm text-gray-500">{t("perfilPublico.iniciaSesionParaAgendar")}</p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="font-heading text-xl text-brand-900">{t("perfilPublico.disponibilidad")}</h2>
      <p className="text-sm text-gray-500">{t("perfilPublico.eligeServicio")}</p>

      <div className="mt-4">
        {services === null && !servicesError ? <LoadingState /> : null}
        {servicesError ? <ErrorState error={servicesError} /> : null}
        {services && services.length === 0 ? <EmptyState title={t("perfilPublico.sinServicios")} /> : null}
        {services && services.length > 0 ? (
          <FieldWrapper label={t("perfilPublico.servicio")} htmlFor="public-service">
            <SelectInput id="public-service" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">{t("auth.campos.selecciona")}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.durationMinutes} min
                </option>
              ))}
            </SelectInput>
          </FieldWrapper>
        ) : null}
      </div>

      {serviceId ? (
        <div className="mt-4">
          {slots === null && !slotsError ? <LoadingState /> : null}
          {slotsError ? <ErrorState error={slotsError} onRetry={loadSlots} /> : null}
          {slots && slots.length === 0 ? <EmptyState title={t("perfilPublico.sinEspacios")} /> : null}
          {bookingError ? (
            <div className="mb-3">
              <ErrorState error={bookingError} />
            </div>
          ) : null}
          {slots && slots.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {slots.slice(0, 24).map((slot) =>
                isPatientSession ? (
                  <li key={slot.startAt}>
                    <button
                      type="button"
                      disabled={bookingSlot !== null}
                      onClick={() => void book(slot)}
                      className="min-h-[44px] rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 hover:bg-brand-100 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {bookingSlot === slot.startAt
                        ? t("perfilPublico.agendando")
                        : `${mxDateLabel(locale, mxDateKey(slot.startAt))} · ${mxTime(locale, slot.startAt)}`}
                    </button>
                  </li>
                ) : (
                  <li key={slot.startAt}>
                    <Link
                      href={`/login?redirect=${encodeURIComponent(`/dr/${doctor.slug}`)}`}
                      className="inline-flex min-h-[44px] items-center rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 hover:bg-brand-100"
                    >
                      {mxDateLabel(locale, mxDateKey(slot.startAt))} · {mxTime(locale, slot.startAt)}
                    </Link>
                  </li>
                )
              )}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function LocationsSection({ locations, teleconsultation }: { locations: PublicPracticeLocation[]; teleconsultation: boolean }) {
  const t = useT();
  if (locations.length === 0 && !teleconsultation) return null;

  return (
    <Card>
      <h2 className="font-heading text-xl text-brand-900">{t("perfilPublico.consultorios")}</h2>
      <div className="mt-4 flex flex-col gap-3">
        {locations.map((loc) => (
          <div key={loc.id} className="rounded-md border border-gray-300 p-4">
            <p className="text-base font-medium text-gray-900">
              {loc.name}
              {loc.isPrimary ? <span className="ml-2 text-sm font-normal text-brand-700">{t("perfilPublico.principal")}</span> : null}
            </p>
            <p className="text-sm text-gray-600">{formatLocationAddress(loc)}</p>
            {loc.phone ? (
              <a href={`tel:${loc.phone}`} className="mt-1 inline-block text-sm font-medium text-brand-700 underline">
                {loc.phone}
              </a>
            ) : null}
          </div>
        ))}
        {locations.length === 0 && teleconsultation ? (
          <p className="text-base text-gray-500">{t("perfilPublico.soloTeleconsulta")}</p>
        ) : null}
      </div>
    </Card>
  );
}
