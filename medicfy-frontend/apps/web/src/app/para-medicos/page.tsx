import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/states";
import { IconFile, IconPrescription, IconCalendar, IconShieldCheck, IconLock, IconClipboardList } from "@/components/ui/landing-icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { getTranslator } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/dictionaries";

// PUB-01. No hay criterios de aceptación específicos en la
// especificación más allá del nombre de la pantalla — es la puerta de
// entrada del reclutamiento de médicos: "se vende al médico" (§1.3),
// no un directorio de pacientes. Cada afirmación de esta página
// corresponde a un módulo real del MVP (M2, M4, M8, M9, M15); nada
// aquí promete algo que el producto no hace todavía.
//
// Reubicada desde "/" en v2.4 (spec §7, M3): el fundador pidió que
// "/" pasara a ser el home de descubrimiento del paciente. Esta
// pantalla se conserva íntegra, sin cambios de copy, solo de ruta —
// el embudo de registro de médicos no se descarta.
const FEATURES: { icon: (p: { className?: string }) => React.ReactNode; titleKey: MessageKey; bodyKey: MessageKey }[] = [
  { icon: IconFile, titleKey: "paraMedicos.caracteristicas.expedienteTitulo", bodyKey: "paraMedicos.caracteristicas.expedienteCuerpo" },
  { icon: IconPrescription, titleKey: "paraMedicos.caracteristicas.recetaTitulo", bodyKey: "paraMedicos.caracteristicas.recetaCuerpo" },
  { icon: IconCalendar, titleKey: "paraMedicos.caracteristicas.agendaTitulo", bodyKey: "paraMedicos.caracteristicas.agendaCuerpo" },
  { icon: IconShieldCheck, titleKey: "paraMedicos.caracteristicas.cedulaTitulo", bodyKey: "paraMedicos.caracteristicas.cedulaCuerpo" },
];

const STEPS: { titleKey: MessageKey; bodyKey: MessageKey }[] = [
  { titleKey: "paraMedicos.pasos.unoTitulo", bodyKey: "paraMedicos.pasos.unoCuerpo" },
  { titleKey: "paraMedicos.pasos.dosTitulo", bodyKey: "paraMedicos.pasos.dosCuerpo" },
  { titleKey: "paraMedicos.pasos.tresTitulo", bodyKey: "paraMedicos.pasos.tresCuerpo" },
];

const TRUST_ITEMS: { icon: (p: { className?: string }) => React.ReactNode; labelKey: MessageKey }[] = [
  { icon: IconLock, labelKey: "paraMedicos.confianza.cifrado" },
  { icon: IconClipboardList, labelKey: "paraMedicos.confianza.bitacora" },
  { icon: IconShieldCheck, labelKey: "paraMedicos.confianza.controlados" },
];

// Componente de servidor: el idioma sale de la cookie, no de un hook.
export default async function ParaMedicosPage() {
  const t = await getTranslator();

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-gray-300 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="font-brand text-xl font-bold text-brand-900">
            Medicfy BETA
          </Link>
          <nav className="flex items-center gap-1 sm:gap-4" aria-label={t("nav.publico.principal")}>
            <LanguageSwitcher showLabel={false} />
            <Link
              href="/login"
              className="inline-flex min-h-[44px] items-center rounded-md px-2 text-base font-medium text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:px-3"
            >
              {t("nav.publico.iniciarSesion")}
            </Link>
            <ButtonLink href="/registro-medico" className="px-3 sm:px-4">{t("nav.publico.registrate")}</ButtonLink>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:grid-cols-2 md:items-center md:py-24">
          <div className="flex flex-col gap-6 motion-safe:animate-[fade-in-up_0.6s_ease-out_both]">
            <span className="w-fit rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-900">
              {t("paraMedicos.hero.insignia")}
            </span>
            <h1 className="font-heading text-3xl leading-tight text-brand-900 md:text-[44px]">
              {t("paraMedicos.hero.titulo")}
            </h1>
            <p className="text-lg text-gray-700">
              {t("paraMedicos.hero.subtitulo")}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <ButtonLink href="/registro-medico" className="w-full sm:w-auto">{t("paraMedicos.hero.cta")}</ButtonLink>
              <ButtonLink href="/login" variant="secondary" className="sm:hidden w-full">{t("paraMedicos.hero.yaTengoCuenta")}</ButtonLink>
            </div>
            <p className="text-sm text-gray-500">{t("paraMedicos.hero.nota")}</p>
          </div>

          <div
            className="mx-auto mb-8 w-full max-w-sm motion-safe:animate-[fade-in-up_0.7s_ease-out_0.12s_both]"
            aria-hidden="true"
          >
            <Card className="flex flex-col gap-3">
              <p className="text-sm font-medium text-gray-500">{t("paraMedicos.maqueta.titulo")}</p>
              <AgendaMockRow time="09:00" label={t("paraMedicos.maqueta.seguimiento")} status={t("paraMedicos.maqueta.confirmada")} statusClass="border-success-600 text-success-600" />
              <AgendaMockRow time="10:30" label={t("paraMedicos.maqueta.primeraVez")} status={t("paraMedicos.maqueta.enCurso")} statusClass="border-brand-700 text-brand-700" />
              <AgendaMockRow time="12:00" label={t("paraMedicos.maqueta.seguimiento")} status={t("paraMedicos.maqueta.agendada")} statusClass="border-gray-500 text-gray-700" />
            </Card>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-gray-300 bg-gray-100 px-6 py-16 md:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="font-heading text-2xl text-brand-900">{t("paraMedicos.caracteristicas.titulo")}</h2>
            <p className="mt-2 max-w-2xl text-base text-gray-700">
              {t("paraMedicos.caracteristicas.subtitulo")}
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, titleKey, bodyKey }) => (
                <Card
                  key={titleKey}
                  className="flex flex-col gap-3 transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(0,0,0,0.1),0_2px_6px_rgba(0,0,0,0.06)]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand-100 text-brand-700">
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="font-heading text-lg text-brand-900">{t(titleKey)}</h3>
                  <p className="text-base text-gray-700">{t(bodyKey)}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="px-6 py-16 md:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="font-heading text-2xl text-brand-900">{t("paraMedicos.pasos.titulo")}</h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.titleKey} className="flex flex-col gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-900 font-heading text-base text-white">
                    {i + 1}
                  </span>
                  <h3 className="font-heading text-lg text-brand-900">{t(step.titleKey)}</h3>
                  <p className="text-base text-gray-700">{t(step.bodyKey)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Trust strip */}
        <section className="border-y border-gray-300 bg-gray-100 px-6 py-8">
          <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3">
            {TRUST_ITEMS.map(({ icon: Icon, labelKey }) => (
              <li
                key={labelKey}
                className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm"
              >
                <Icon className="h-5 w-5 shrink-0 text-brand-700" />
                {t(labelKey)}
              </li>
            ))}
          </ul>
        </section>

        {/* Final CTA */}
        <section className="bg-brand-900 px-6 py-16 text-center md:py-20">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-6">
            <h2 className="font-heading text-2xl text-white md:text-3xl">{t("paraMedicos.cta.titulo")}</h2>
            <p className="text-lg text-brand-100">{t("paraMedicos.cta.cuerpo")}</p>
            <ButtonLink href="/registro-medico" variant="secondary">{t("paraMedicos.hero.cta")}</ButtonLink>
          </div>
        </section>
      </main>

      <footer className="px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
          <div>
            <p className="font-brand text-base text-brand-900">Medicfy BETA</p>
            <p className="text-sm text-gray-500">{t("paraMedicos.footer.lema")}</p>
          </div>
          <p className="text-sm text-gray-500">© {new Date().getFullYear()} Medicfy · {t("paraMedicos.footer.ciudad")}</p>
        </div>
      </footer>
    </>
  );
}

function AgendaMockRow({
  time,
  label,
  status,
  statusClass,
}: {
  time: string;
  label: string;
  status: string;
  statusClass: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-gray-300 px-3 py-2">
      <div>
        <p className="text-sm font-medium text-gray-900">{time}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass}`}>{status}</span>
    </div>
  );
}
