import type { SVGProps } from "react";

// Set de íconos de línea para el rail de navegación lateral
// (components/app-nav.tsx). Igual que landing-icons.tsx: no hay
// librería de íconos en el proyecto (CLAUDE.md §4 prohíbe dependencias
// sin justificar) — SVG inline por el mismo motivo, sin compartir el
// módulo con landing-icons.tsx porque ese set está explícitamente
// acotado a la landing pública.
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

export function IconPulse(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 12h4l2.5-7L13 19l2.5-7H21" />
    </svg>
  );
}

export function IconCalendarNav(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v4M16 3v4" />
    </svg>
  );
}

export function IconFolderNav(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18Z" />
    </svg>
  );
}

export function IconPersonPlus(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M18.5 8v5M16 10.5h5" />
    </svg>
  );
}

export function IconClockNav(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconUserCircle(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.3 18.2a6.5 6.5 0 0 1 11.4 0" />
    </svg>
  );
}

export function IconShieldNav(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 5 6v6c0 4.2 2.9 7.3 7 8.5 4.1-1.2 7-4.3 7-8.5V6l-7-2.5Z" />
    </svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h3" />
      <path d="M20 12H10.5" />
      <path d="m16 7.5 4.5 4.5-4.5 4.5" />
    </svg>
  );
}
