"use client";

import { useEffect, useState, type ReactNode } from "react";
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
  IconClipboardCheckNav,
  IconChevronNav,
  IconLogout,
} from "@/components/ui/nav-icons";

const NAV_LINKS = [
  { href: "/agenda", label: "Agenda", Icon: IconCalendarNav },
  { href: "/pacientes", label: "Pacientes", Icon: IconFolderNav },
  { href: "/pacientes/nuevo", label: "Nuevo paciente", Icon: IconPersonPlus },
  { href: "/disponibilidad", label: "Disponibilidad", Icon: IconClockNav },
  // Fase 6 · Prompt 45: bitácora de acceso — "panel de auditoría para
  // el médico titular: quién ha visto a sus pacientes".
  { href: "/auditoria", label: "Auditoría", Icon: IconClipboardCheckNav },
];

// Preferencia de UI (qué tan ancho se ve el rail), no dato clínico —
// localStorage es el mismo mecanismo ya usado para recordar la
// pestaña abierta del panel de consulta (consulta-zona3.tsx).
const COLLAPSE_STORAGE_KEY = "medicfy:nav-collapsed";

type IconComponent = (props: { className?: string }) => ReactNode;

// Rail de navegación lateral persistente para todas las pantallas
// autenticadas (dentro de app/(app)/layout.tsx) — reemplaza la barra
// horizontal de texto anterior. "Nueva cita" no tiene ícono propio:
// vive como acción dentro de Agenda/Pacientes, igual que antes.
//
// sticky + h-screen: antes el rail vivía en el flujo normal del
// documento y se iba con el scroll de la página en cualquier pantalla
// más alta que el viewport (ej. la bitácora de auditoría, un
// expediente largo) — pedido explícito del usuario de mantenerlo
// estable. Plegable + etiquetas de texto: mismo pedido, con la
// preferencia recordada por dispositivo.
export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { accessToken, isLoading, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1");
    } catch {
      // sin localStorage, se queda expandido — preferencia de UI, no
      // dato clínico, no es fatal perderla.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // no persistir no es fatal
      }
      return next;
    });
  }

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

  function itemClassName(active: boolean) {
    return `flex min-h-11 items-center gap-3 rounded-md px-3 ${collapsed ? "justify-center px-0" : ""} ${
      active ? "bg-rail-icon-active-bg text-rail-icon-active" : "text-rail-icon hover:bg-white/10"
    }`;
  }

  function NavLabel({ Icon, label }: { Icon: IconComponent; label: string }) {
    return (
      <>
        <Icon className="h-6 w-6 shrink-0" />
        {!collapsed ? <span className="truncate text-sm">{label}</span> : null}
      </>
    );
  }

  return (
    <nav
      aria-label="Navegación principal"
      className={`sticky top-0 flex h-screen shrink-0 flex-col gap-2 overflow-y-auto bg-rail-bg px-2 py-4 ${collapsed ? "w-16 items-center" : "w-56"}`}
    >
      <Link
        href="/agenda"
        aria-label="Medicfy — ir a Agenda"
        className={`mb-2 flex min-h-11 items-center gap-2 rounded-md bg-rail-icon-active-bg px-3 text-rail-icon-active ${collapsed ? "w-11 justify-center px-0" : ""}`}
      >
        <IconPulse className="h-6 w-6 shrink-0" />
        {!collapsed ? <span className="font-heading text-base">Medicfy</span> : null}
      </Link>

      <ul className="flex flex-1 flex-col gap-1">
        {NAV_LINKS.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link href={href} aria-label={label} title={collapsed ? label : undefined} aria-current={active ? "page" : undefined} className={itemClassName(active)}>
                <NavLabel Icon={Icon} label={label} />
              </Link>
            </li>
          );
        })}
      </ul>

      <ul className="flex flex-col gap-1">
        {isAdmin && (
          <li>
            <Link
              href="/admin"
              aria-label="Administración"
              title={collapsed ? "Administración" : undefined}
              aria-current={isActive("/admin") ? "page" : undefined}
              className={itemClassName(isActive("/admin"))}
            >
              <NavLabel Icon={IconShieldNav} label="Administración" />
            </Link>
          </li>
        )}
        <li>
          <Link
            href="/perfil"
            aria-label="Perfil"
            title={collapsed ? "Perfil" : undefined}
            aria-current={isActive("/perfil") ? "page" : undefined}
            className={itemClassName(isActive("/perfil"))}
          >
            <NavLabel Icon={IconUserCircle} label="Perfil" />
          </Link>
        </li>
        <li>
          <button type="button" onClick={handleLogout} aria-label="Cerrar sesión" title={collapsed ? "Cerrar sesión" : undefined} className={itemClassName(false)}>
            <NavLabel Icon={IconLogout} label="Cerrar sesión" />
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
            title={collapsed ? "Expandir" : undefined}
            className={itemClassName(false)}
          >
            <IconChevronNav className={`h-5 w-5 shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`} />
            {!collapsed ? <span className="truncate text-sm">Colapsar</span> : null}
          </button>
        </li>
      </ul>
    </nav>
  );
}
