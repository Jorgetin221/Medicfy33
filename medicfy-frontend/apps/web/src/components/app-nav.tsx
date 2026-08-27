"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { tokenPrimaryRole } from "@/lib/jwt-claims";
import {
  IconPulse,
  IconCalendarNav,
  IconFolderNav,
  IconPersonPlus,
  IconClockNav,
  IconUserCircle,
  IconShieldNav,
  IconLogout,
} from "@/components/ui/nav-icons";

const NAV_LINKS = [
  { href: "/agenda", label: "Agenda", Icon: IconCalendarNav },
  { href: "/pacientes", label: "Pacientes", Icon: IconFolderNav },
  { href: "/pacientes/nuevo", label: "Nuevo paciente", Icon: IconPersonPlus },
  { href: "/disponibilidad", label: "Disponibilidad", Icon: IconClockNav },
];

// Rail de navegación lateral persistente para todas las pantallas
// autenticadas (dentro de app/(app)/layout.tsx) — reemplaza la barra
// horizontal de texto anterior. "Nueva cita" no tiene ícono propio:
// vive como acción dentro de Agenda/Pacientes, igual que antes.
export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { accessToken, isLoading, logout } = useAuth();

  if (isLoading || !accessToken) {
    return null;
  }

  const isAdmin = tokenPrimaryRole(accessToken) === "ADMIN";

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav
      aria-label="Navegación principal"
      className="flex w-16 shrink-0 flex-col items-center gap-2 bg-rail-bg px-2 py-4"
    >
      <Link
        href="/agenda"
        aria-label="Medicfy — ir a Agenda"
        className="mb-4 flex min-h-11 min-w-11 items-center justify-center rounded-md bg-rail-icon-active-bg text-rail-icon-active"
      >
        <IconPulse className="h-6 w-6" />
      </Link>

      <ul className="flex flex-1 flex-col items-center gap-1">
        {NAV_LINKS.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-label={label}
                title={label}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 min-w-11 items-center justify-center rounded-md ${
                  active ? "bg-rail-icon-active-bg text-rail-icon-active" : "text-rail-icon hover:bg-white/10"
                }`}
              >
                <Icon className="h-6 w-6" />
              </Link>
            </li>
          );
        })}
      </ul>

      <ul className="flex flex-col items-center gap-1">
        {isAdmin && (
          <li>
            <Link
              href="/admin"
              aria-label="Administración"
              title="Administración"
              aria-current={isActive("/admin") ? "page" : undefined}
              className={`flex min-h-11 min-w-11 items-center justify-center rounded-md ${
                isActive("/admin") ? "bg-rail-icon-active-bg text-rail-icon-active" : "text-rail-icon hover:bg-white/10"
              }`}
            >
              <IconShieldNav className="h-6 w-6" />
            </Link>
          </li>
        )}
        <li>
          <Link
            href="/perfil"
            aria-label="Perfil"
            title="Perfil"
            aria-current={isActive("/perfil") ? "page" : undefined}
            className={`flex min-h-11 min-w-11 items-center justify-center rounded-md ${
              isActive("/perfil") ? "bg-rail-icon-active-bg text-rail-icon-active" : "text-rail-icon hover:bg-white/10"
            }`}
          >
            <IconUserCircle className="h-6 w-6" />
          </Link>
        </li>
        <li>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-rail-icon hover:bg-white/10"
          >
            <IconLogout className="h-6 w-6" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
