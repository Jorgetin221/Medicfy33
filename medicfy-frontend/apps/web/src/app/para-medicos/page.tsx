import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/states";
import { IconFile, IconPrescription, IconCalendar, IconShieldCheck, IconLock, IconClipboardList } from "@/components/ui/landing-icons";

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
const FEATURES = [
  {
    icon: IconFile,
    title: "Expediente NOM-004",
    body: "Historial clínico completo que se construye consulta a consulta. Nunca se sobrescribe ni se pierde.",
  },
  {
    icon: IconPrescription,
    title: "Receta con validez legal",
    body: "Emítela sin salir de la consulta. Los medicamentos controlados quedan bloqueados por diseño, no por advertencia.",
  },
  {
    icon: IconCalendar,
    title: "Agenda del día",
    body: "Antecedentes, alergias y tus últimas consultas con cada paciente, visibles sin saltar entre WhatsApp y una libreta.",
  },
  {
    icon: IconShieldCheck,
    title: "Cédula verificada",
    body: "Tu perfil muestra tu cédula profesional verificada — la confianza que un directorio genérico no puede dar.",
  },
] as const;

const STEPS = [
  {
    title: "Crea tu cuenta",
    body: "Regístrate con tu cédula profesional. La verificamos contra el registro de la SEP antes de que recibas pacientes.",
  },
  {
    title: "Configura tu consultorio",
    body: "Agrega tus horarios, tus servicios y, si los tienes, a tus asistentes.",
  },
  {
    title: "Atiende y documenta",
    body: "Cada consulta queda registrada, cada receta lista en segundos, sin papeleo extra.",
  },
] as const;

const TRUST_ITEMS = [
  { icon: IconLock, label: "Datos clínicos cifrados" },
  { icon: IconClipboardList, label: "Bitácora de cada acceso" },
  { icon: IconShieldCheck, label: "Controlados bloqueados por diseño" },
] as const;

export default function ParaMedicosPage() {
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand-900 focus:px-4 focus:py-2 focus:text-white"
      >
        Saltar al contenido principal
      </a>

      <header className="sticky top-0 z-40 border-b border-gray-300 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="font-brand text-xl font-bold text-brand-900">
            Medicfy
          </Link>
          <nav className="flex items-center gap-1 sm:gap-4" aria-label="Principal">
            <Link
              href="/login"
              className="inline-flex min-h-[44px] items-center rounded-md px-2 text-base font-medium text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:px-3"
            >
              Iniciar sesión
            </Link>
            <Link href="/registro-medico">
              <Button className="px-3 sm:px-4">Regístrate</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main id="contenido">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:grid-cols-2 md:items-center md:py-24">
          <div className="flex flex-col gap-6 motion-safe:animate-[fade-in-up_0.6s_ease-out_both]">
            <span className="w-fit rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-900">
              Para médicos privados en Guadalajara
            </span>
            <h1 className="font-heading text-3xl leading-tight text-brand-900 md:text-[44px]">
              Tu consultorio, sin WhatsApp, sin Excel y sin recetario de papel
            </h1>
            <p className="text-lg text-gray-700">
              Expediente clínico conforme a NOM-004, receta electrónica con validez legal y la agenda de tu día, en
              un solo lugar.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/registro-medico">
                <Button className="w-full sm:w-auto">Crear cuenta gratis</Button>
              </Link>
              <Link href="/login" className="sm:hidden">
                <Button variant="secondary" className="w-full">
                  Ya tengo cuenta
                </Button>
              </Link>
            </div>
            <p className="text-sm text-gray-500">Verificamos tu cédula ante la SEP. Sin tarjeta de crédito.</p>
          </div>

          <div
            className="relative mx-auto mb-8 w-full max-w-sm motion-safe:animate-[fade-in-up_0.7s_ease-out_0.12s_both]"
            aria-hidden="true"
          >
            <Card className="relative z-10 flex flex-col gap-3">
              <p className="text-sm font-medium text-gray-500">Agenda de hoy</p>
              <AgendaMockRow time="09:00" label="Consulta de seguimiento" status="Confirmada" statusClass="border-success-600 text-success-600" />
              <AgendaMockRow time="10:30" label="Primera vez" status="En curso" statusClass="border-brand-700 text-brand-700" />
              <AgendaMockRow time="12:00" label="Consulta de seguimiento" status="Agendada" statusClass="border-gray-500 text-gray-700" />
            </Card>
            <div className="absolute -bottom-5 -right-5 z-0 hidden rounded-lg border border-gray-300 bg-white p-4 shadow-card sm:block">
              <p className="flex items-center gap-2 text-sm font-medium text-success-600">
                <IconPrescription className="h-5 w-5" /> Receta lista
              </p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-gray-300 bg-gray-100 px-6 py-16 md:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="font-heading text-2xl text-brand-900">Todo lo que necesita tu consultorio</h2>
            <p className="mt-2 max-w-2xl text-base text-gray-700">
              No es un directorio con visibilidad. Es la herramienta clínica del día a día.
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <Card
                  key={title}
                  className="flex flex-col gap-3 transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(0,0,0,0.1),0_2px_6px_rgba(0,0,0,0.06)]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand-100 text-brand-700">
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="font-heading text-lg text-brand-900">{title}</h3>
                  <p className="text-base text-gray-700">{body}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="px-6 py-16 md:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="font-heading text-2xl text-brand-900">Cómo funciona</h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex flex-col gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-900 font-heading text-base text-white">
                    {i + 1}
                  </span>
                  <h3 className="font-heading text-lg text-brand-900">{step.title}</h3>
                  <p className="text-base text-gray-700">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Trust strip */}
        <section className="border-y border-gray-300 bg-gray-100 px-6 py-8">
          <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3">
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

        {/* Final CTA */}
        <section className="bg-brand-900 px-6 py-16 text-center md:py-20">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-6">
            <h2 className="font-heading text-2xl text-white md:text-3xl">Empieza a documentar tu consulta de hoy</h2>
            <p className="text-lg text-brand-100">Crea tu cuenta en unos minutos y verifica tu cédula profesional.</p>
            <Link href="/registro-medico">
              <Button variant="secondary">Crear cuenta gratis</Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
          <div>
            <p className="font-brand text-base text-brand-900">Medicfy</p>
            <p className="text-sm text-gray-500">La herramienta clínica del médico privado mexicano.</p>
          </div>
          <p className="text-sm text-gray-500">© {new Date().getFullYear()} Medicfy · Guadalajara, Jalisco</p>
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
