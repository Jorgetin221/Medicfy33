"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { RecordShareGrantDetail } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useDoctorProfile } from "@/lib/use-doctor-profile";
import { Card, ErrorState, LoadingState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useI18n, useT } from "@/lib/i18n/context";
import { formatDateTimeMedium, formatDateTimeLong } from "@/lib/i18n/format";

// PR-EXP-05 — visor de sólo lectura. D-EXP-07: sin descarga, sin
// impresión (abajo, @media print vía Tailwind `print:`). La marca de
// agua NO es una protección real contra una captura de pantalla —
// eso no se puede impedir técnicamente (declarado explícitamente,
// como exige la letra, en 05-visor-medico-receptor.md decisión §6 y
// en el informe de esta fase) — es solo disuasiva/forense.
export default function ExpedienteCompartidoVisorPage() {
  const params = useParams<{ grantId: string }>();
  const router = useRouter();
  const t = useT();
  const { locale } = useI18n();
  const { accessToken, isLoading: authLoading } = useAuth();
  const { doctor } = useDoctorProfile(accessToken ?? null);
  const [detail, setDetail] = useState<RecordShareGrantDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [openedAt] = useState(() => new Date());

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.replace("/login");
      return;
    }
    if (!accessToken) return;
    apiFetch<RecordShareGrantDetail>(`/record-share/grants/${params.grantId}`, { accessToken })
      .then(setDetail)
      .catch((err: unknown) => setError(err));
  }, [authLoading, accessToken, params.grantId, router]);

  if (authLoading || !accessToken || (!detail && !error)) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <LoadingState />
      </main>
    );
  }

  if (error || !detail) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <ErrorState error={error} />
        <Link href="/expediente-compartido/compartidos-conmigo" className="mt-4 inline-block text-base font-medium text-brand-700 underline">
          {t("expedienteCompartido.compartidosConmigo.volver")}
        </Link>
      </main>
    );
  }

  const doctorLabel = doctor ? `${doctor.displayName ?? `${doctor.legalFirstName} ${doctor.legalLastName}`} · ${doctor.professionalLicense}` : "";
  const summary = detail.summary;

  return (
    <main className="relative mx-auto max-w-5xl p-6">
      {/* D-EXP-07/RESTRICCIONES: nada de lo de abajo se imprime — solo
          este aviso, que vive FUERA del contenedor print:hidden. */}
      <p className="hidden text-base text-gray-900 print:block">{t("expedienteCompartido.compartidosConmigo.avisoImpresion")}</p>

      <div className="relative print:hidden">
        <Watermark label={doctorLabel} openedAt={openedAt} grantId={detail.id} />

        <div className="relative z-10 flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl text-brand-900">{detail.patientName}</h1>
            <p className="text-sm text-gray-500">
              {t("expedienteCompartido.compartidosConmigo.columnas.custodio")}: {detail.custodianDisplayName}
            </p>
          </div>
          <Link href="/expediente-compartido/compartidos-conmigo">
            <Button variant="secondary">{t("expedienteCompartido.compartidosConmigo.volver")}</Button>
          </Link>
        </div>

        <Aviso variant="info" title={t("expedienteCompartido.compartidosConmigo.soloLectura", { fecha: formatDateTimeMedium(locale, detail.expiresAt) })} />

        {/* Alergias SIEMPRE primero (CLAUDE.md §6 / mismo criterio de Zona 1). */}
        <Section title={t("expedienteCompartido.compartidosConmigo.secciones.alergias")}>
          {summary.allergies.length === 0 ? (
            <p className="text-base text-gray-500">{t("expedienteCompartido.compartidosConmigo.sinAlergias")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {summary.allergies.map((a) => (
                <li key={a.id} className="rounded-md border border-danger-600 bg-white p-3 text-base text-gray-900">
                  <strong>{a.substance}</strong> — {a.severity} {a.reaction ? `· ${a.reaction}` : ""}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t("expedienteCompartido.compartidosConmigo.secciones.medicacion")}>
          <SimpleList items={summary.medications} empty={t("expedienteCompartido.compartidosConmigo.sinDatos")} render={(m) => `${m.genericName} — ${m.dose}, ${m.route}, ${m.frequency}`} />
        </Section>

        <Section title={t("expedienteCompartido.compartidosConmigo.secciones.diagnosticos")}>
          <SimpleList
            items={summary.activeDiagnoses}
            empty={t("expedienteCompartido.compartidosConmigo.sinDatos")}
            render={(d) => `${d.description}${d.icd10Code ? ` (${d.icd10Code})` : ""}`}
          />
        </Section>

        <Section title={t("expedienteCompartido.compartidosConmigo.secciones.antecedentes")}>
          <SimpleList items={summary.historyItems} empty={t("expedienteCompartido.compartidosConmigo.sinDatos")} render={(h) => `${h.subtype}: ${h.status}`} />
        </Section>

        {summary.pregnancy && (
          <Section title={t("expedienteCompartido.compartidosConmigo.secciones.embarazo")}>
            <p className="text-base text-gray-900">
              {summary.pregnancy.gestationalAge.weeks}.{summary.pregnancy.gestationalAge.days} SDG · FPP {formatDateTimeMedium(locale, summary.pregnancy.eddDate)}
            </p>
          </Section>
        )}

        {summary.latestVitals && (
          <Section title={t("expedienteCompartido.compartidosConmigo.secciones.signosVitales")}>
            <p className="text-base text-gray-900">
              TA {summary.latestVitals.bpSystolicMmHg ?? "—"}/{summary.latestVitals.bpDiastolicMmHg ?? "—"} · FC {summary.latestVitals.heartRateBpm ?? "—"} ·
              Temp {summary.latestVitals.temperatureC ?? "—"}°C · SpO2 {summary.latestVitals.spo2Percent ?? "—"}%
            </p>
          </Section>
        )}

        {summary.results !== null && (
          <Section title={t("expedienteCompartido.compartidosConmigo.secciones.resultados")}>
            <SimpleList items={summary.results} empty={t("expedienteCompartido.compartidosConmigo.sinDatos")} render={(r) => `${r.analyteName}: ${r.value} ${r.unit}`} />
          </Section>
        )}

        {summary.signedNotes !== null && (
          <Section title={t("expedienteCompartido.compartidosConmigo.secciones.notas")}>
            <SimpleList items={summary.signedNotes} empty={t("expedienteCompartido.compartidosConmigo.sinDatos")} render={(n) => `${n.chiefComplaint} — ${n.assessment}`} />
          </Section>
        )}

        {summary.prescriptions !== null && (
          <Section title={t("expedienteCompartido.compartidosConmigo.secciones.recetas")}>
            <SimpleList items={summary.prescriptions} empty={t("expedienteCompartido.compartidosConmigo.sinDatos")} render={(p) => `${p.folio} — ${p.diagnosisSnapshot}`} />
          </Section>
        )}

        {summary.studyOrders !== null && (
          <Section title={t("expedienteCompartido.compartidosConmigo.secciones.estudios")}>
            <SimpleList items={summary.studyOrders} empty={t("expedienteCompartido.compartidosConmigo.sinDatos")} render={(o) => `${o.folio} — ${o.clinicalIndication}`} />
          </Section>
        )}

        <p className="text-xs text-gray-400">
          {t("expedienteCompartido.compartidosConmigo.idAcceso")}: {detail.id} · {formatDateTimeLong(locale, openedAt.toISOString())}
        </p>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </Card>
  );
}

function SimpleList<T>({ items, empty, render }: { items: T[]; empty: string; render: (item: T) => string }) {
  if (items.length === 0) return <p className="text-base text-gray-500">{empty}</p>;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item, i) => (
        <li key={i} className="text-base text-gray-900">
          {render(item)}
        </li>
      ))}
    </ul>
  );
}

// "Sin botones de edición... etiqueta compartido por el paciente ·
// solo lectura" ya lo cubre el Aviso de arriba — la marca de agua es
// aparte, repetida en pantalla (letra: nombre, cédula, fecha/hora, id
// de acceso), nunca una sola vez en una esquina.
function Watermark({ label, openedAt, grantId }: { label: string; openedAt: Date; grantId: string }) {
  const text = `${label} · ${openedAt.toLocaleString()} · ${grantId}`;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none">
      <div className="grid grid-cols-2 gap-16 p-8 opacity-10 sm:grid-cols-3">
        {Array.from({ length: 24 }, (_, i) => (
          <span key={i} className="whitespace-nowrap text-xs text-gray-900 [transform:rotate(-20deg)]">
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
