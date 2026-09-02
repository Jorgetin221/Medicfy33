import type { SVGProps } from "react";

// Set de íconos de línea minimalistas para la landing (PUB-01). No hay
// librería de íconos en el proyecto todavía (CLAUDE.md §4: "añadir
// dependencias sin justificarlas" está prohibido) — SVG inline es
// suficiente para seis usos puntuales.
type IconProps = SVGProps<SVGSVGElement>;

const base: IconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export function IconFile(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5" />
      <path d="M9 12h6M9 15.5h6M9 8.5h2" />
    </svg>
  );
}

export function IconPrescription(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M8.5 7.5h7" />
      <path d="m8.5 12 2.6 2.6L15.5 10" />
    </svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v4M16 3v4" />
      <path d="M7.5 13h3M7.5 16.5h3M13.5 13h3M13.5 16.5h3" />
    </svg>
  );
}

export function IconShieldCheck(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 5 6v6c0 4.2 2.9 7.3 7 8.5 4.1-1.2 7-4.3 7-8.5V6l-7-2.5Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="1.5" />
      <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
    </svg>
  );
}

export function IconClipboardList(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 4.5h10a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" />
      <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z" />
      <path d="M9 11h6M9 14.5h6M9 8h2" />
    </svg>
  );
}

// v2.4 (M3): un solo ícono, reutilizado en cada tarjeta de
// especialidad — consistente a propósito, no finge una ilustración
// distinta por especialidad que no existe.
export function IconStethoscope(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3.5v6a4 4 0 0 0 8 0v-6" />
      <path d="M6 3.5H4.5M14 3.5h1.5" />
      <path d="M10 13.5v3a5 5 0 0 0 10 0v-1.2" />
      <circle cx="20.5" cy="14.3" r="1.7" />
    </svg>
  );
}
