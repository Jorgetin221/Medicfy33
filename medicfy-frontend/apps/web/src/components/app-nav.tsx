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
  IconMegaphone,
  IconChevronNav,
  IconLogout,
  IconMenu,
  IconClose,
} from "@/components/ui/nav-icons";

const NAV_LINKS = [
  { href: "/agenda", label: "Agenda", Icon: IconCalendarNav },
  { href: "/pacientes", label: "Pacientes", Icon: IconFolderNav },
  { href: "/pacientes/nuevo", label: "Nuevo paciente", Icon: IconPersonPlus },
  { href: "/disponibilidad", label: "Disponibilidad", Icon: IconClockNav },
  // Fase 6 · Prompt 45: bitácora de acceso — "panel de auditoría para
  // el médico titular: quién ha visto a sus pacientes".
  { href: "/auditoria", label: "Auditoría", Icon: IconClipboardCheckNav },
  // M2B (spec §7, v2.2): publicaciones del médico y control de audiencia.
  { href: "/publicaciones", label: "Publicaciones", Icon: IconMegaphone },
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
  // Solo aplica bajo `md`. Deliberadamente NO se persiste: un panel que
  // tapa el contenido debe abrirse siempre cerrado, a diferencia de
  // `collapsed`, que es una preferencia de ancho del rail de escritorio.
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1");
    } catch {
      // sin localStorage, se queda expandido — preferencia de UI, no
      // dato clínico, no es fatal perderla.
    }
  }, []);

  // Navegar cierra el panel: en móvil tapa el contenido al que se acaba
  // de llegar.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

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

  // `collapsed` es preferencia del rail de escritorio: dentro del panel
  // móvil, que ya ocupa 256 px, esconder las etiquetas no ahorra nada y deja
  // una columna de íconos sin nombre. De ahí que se acote con `md:`.
  function itemClassName(active: boolean) {
    return `flex min-h-11 items-center gap-3 rounded-md px-3 ${collapsed ? "md:justify-center md:px-0" : ""} ${
      active ? "bg-rail-icon-active-bg text-rail-icon-active" : "text-rail-icon hover:bg-white/10"
    }`;
  }

  function NavLabel({ Icon, label }: { Icon: IconComponent; label: string }) {
    return (
      <>
        <Icon className="h-6 w-6 shrink-0" />
        <span className={`truncate text-sm ${collapsed ? "md:hidden" : ""}`}>{label}</span>
      </>
    );
  }

  // El rail vive en el flujo del documento en escritorio y se convierte en
  // panel lateral sobre el contenido bajo `md`. Antes era `w-56` fijo sin un
  // solo breakpoint: a 390 px dejaba 166 px de contenido y partía los nombres
  // de los pacientes letra a letra.
  const navClassName = [
    mobileOpen ? "fixed inset-y-0 left-0 z-50 flex w-64" : "hidden",
    "md:sticky md:top-0 md:z-auto md:flex md:h-screen md:shrink-0",
    collapsed ? "md:w-16 md:items-center" : "md:w-56",
    "h-screen flex-col gap-2 overflow-y-auto bg-rail-bg px-2 py-4",
  ].join(" ");

  return (
    <>
      {/* Encabezado móvil: sustituye al rail bajo `md`. `h-14` compensado con
          el `pt-14 md:pt-0` del contenido en (app)/layout.tsx. */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-1 bg-rail-bg px-2 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir navegación"
          aria-expanded={mobileOpen}
          aria-controls="nav-principal"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-rail-icon hover:bg-white/10"
        >
          <IconMenu className="h-6 w-6" />
        </button>
        <Link href="/agenda" aria-label="Medicfy — ir a Agenda" className="flex min-h-11 items-center gap-2 rounded-md px-2 text-rail-icon-active">
          <IconPulse className="h-6 w-6 shrink-0" />
          <span className="font-heading text-base">Medicfy</span>
        </Link>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 bg-overlay md:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      ) : null}

      <nav id="nav-principal" aria-label="Navegación principal" className={navClassName}>
        <div className="mb-2 flex items-center gap-1">
          <Link
            href="/agenda"
            aria-label="Medicfy — ir a Agenda"
            className={`flex min-h-11 flex-1 items-center gap-2 rounded-md bg-rail-icon-active-bg px-3 text-rail-icon-active ${collapsed ? "md:w-11 md:flex-none md:justify-center md:px-0" : ""}`}
          >
            <IconPulse className="h-6 w-6 shrink-0" />
            {!collapsed ? <span className="font-heading text-base">Medicfy</span> : <span className="font-heading text-base md:hidden">Medicfy</span>}
          </Link>
          {/* Cerrar alcanzable sin depender del velo (táctil y teclado). */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar navegación"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-rail-icon hover:bg-white/10 md:hidden"
          >
            <IconClose className="h-6 w-6" />
          </button>
        </div>

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
        {/* Plegar el rail no tiene sentido en el panel móvil: ahí se cierra. */}
        <li className="hidden md:block">
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
    </>
  );
}
