import type { ReactNode } from "react";
import Link from "next/link";
import { IconShieldCheck, IconLock, IconClipboardList } from "@/components/ui/landing-icons";

const DEFAULT_TRUST_ITEMS = [
  { icon: IconShieldCheck, label: "Cédula profesional verificada ante la SEP" },
  { icon: IconLock, label: "Datos clínicos cifrados, siempre" },
  { icon: IconClipboardList, label: "Bitácora de cada acceso a un expediente" },
] as const;

// Layout compartido de login/registro-medico (PUB-04/PUB-03): panel de
// marca a la izquierda en escritorio (mismo tono que la landing —
// nunca un formulario flotando solo en blanco), formulario a la
// derecha. En móvil el panel se oculta y solo queda el logo arriba,
// siempre con un link de regreso a "/" — antes ninguna de las dos
// pantallas tenía forma de volver ni de cruzar a la otra.
export function AuthLayout({
  children,
  panelTitle,
  panelBody,
  trustItems = DEFAULT_TRUST_ITEMS,
}: {
  children: ReactNode;
  panelTitle: string;
  panelBody: string;
  trustItems?: readonly { icon: (props: { className?: string }) => ReactNode; label: string }[];
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col gap-8 px-6 py-8 sm:px-10 sm:py-10 lg:justify-center lg:px-16 lg:py-16">
        <Link href="/" className="font-brand w-fit text-xl font-bold text-brand-900">
          Medicfy
        </Link>
        <div className="mx-auto w-full max-w-md">{children}</div>
      </div>

      <div className="relative hidden flex-col justify-center gap-10 overflow-hidden bg-brand-900 px-12 py-16 text-white lg:flex lg:px-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-700/40 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-brand-500/20 blur-3xl"
        />
        <div className="relative flex flex-col gap-4">
          <h2 className="font-heading text-3xl leading-tight">{panelTitle}</h2>
          <p className="max-w-md text-lg text-brand-100">{panelBody}</p>
        </div>
        <ul className="relative flex flex-col gap-4">
          {trustItems.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-base text-brand-100">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                <Icon className="h-5 w-5 text-white" />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
