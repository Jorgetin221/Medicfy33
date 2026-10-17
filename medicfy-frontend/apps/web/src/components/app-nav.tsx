"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { tokenPrimaryRole } from "@/lib/jwt-claims";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import {
  IconPulse,
  IconCalendarNav,
  IconFolderNav,
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

// La etiqueta se guarda como clave, no como texto: el rail se pinta en
// el idioma que el médico haya elegido.
// "Nuevo paciente" no va aquí (2026-10-16): ya está como acción dentro de
// Pacientes, y en el rail solo ocupaba espacio.
const NAV_LINKS: { href: string; labelKey: MessageKey; Icon: IconComponent }[] = [
  { href: "/agenda", labelKey: "nav.rail.agenda", Icon: IconCalendarNav },
  { href: "/pacientes", labelKey: "nav.rail.pacientes", Icon: IconFolderNav },
  { href: "/disponibilidad", labelKey: "nav.rail.disponibilidad", Icon: IconClockNav },
  // Fase 6 · Prompt 45: bitácora de acceso — "panel de auditoría para
  // el médico titular: quién ha visto a sus pacientes".
  { href: "/auditoria", labelKey: "nav.rail.auditoria", Icon: IconClipboardCheckNav },
  // M2B (spec §7, v2.2): publicaciones del médico y control de audiencia.
  { href: "/publicaciones", labelKey: "nav.rail.publicaciones", Icon: IconMegaphone },
];

export const ALL_NAV_HREFS = [
  ...NAV_LINKS.map((link) => link.href),
  "/admin",
  "/perfil",
];

export function isNavLinkActive(
  pathname: string,
  href: string,
  allHrefs: readonly string[] = ALL_NAV_HREFS
): boolean {
  const matches = pathname === href || pathname.startsWith(`${href}/`);
  if (!matches) return false;

  // Si hay otro enlace del nav que también coincida con la ruta actual pero sea
  // más específico (ruta más larga, ej. /pacientes/nuevo vs /pacientes), el
  // enlace padre no se activa.
  const hasMoreSpecificMatch = allHrefs.some(
    (other) =>
      other !== href &&
      other.length > href.length &&
      (pathname === other || pathname.startsWith(`${other}/`))
  );

  return !hasMoreSpecificMatch;
}

// Preferencia de UI (qué tan ancho se ve el rail), no dato clínico —
// localStorage es el mismo mecanismo ya usado para recordar la
// pestaña abierta del panel de consulta (consulta-zona3.tsx).
const COLLAPSE_STORAGE_KEY = "medicfy:nav-collapsed";

// Ancho del rail en escritorio (md:w-56 / md:w-16), publicado como
// variable CSS para que lo fijo a la pantalla (la barra de firma de la
// consulta) empiece donde termina el rail en vez de taparle la parte
// de abajo. Bajo `md` el rail no ocupa espacio: la variable no aplica.
export const RAIL_WIDTH_CSS_VAR = "--app-rail-width";
const RAIL_WIDTH = { expanded: "14rem", collapsed: "4rem" } as const;

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
  const t = useT();
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

  const railVisible = !isLoading && Boolean(accessToken);
  useEffect(() => {
    if (!railVisible) return undefined;
    const root = document.documentElement;
    root.style.setProperty(RAIL_WIDTH_CSS_VAR, collapsed ? RAIL_WIDTH.collapsed : RAIL_WIDTH.expanded);
    return () => {
      root.style.removeProperty(RAIL_WIDTH_CSS_VAR);
    };
  }, [collapsed, railVisible]);

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
    return isNavLinkActive(pathname, href, ALL_NAV_HREFS);
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
    "h-screen flex-col gap-2 overflow-y-auto bg-rail-bg px-2 py-3",
  ].join(" ");

  return (
    <>
      {/* Encabezado móvil: sustituye al rail bajo `md`. `h-14` compensado con
          el `pt-14 md:pt-0` del contenido en (app)/layout.tsx. */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-1 bg-rail-bg px-2 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label={t("nav.rail.abrirNavegacion")}
          aria-expanded={mobileOpen}
          aria-controls="nav-principal"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-rail-icon hover:bg-white/10"
        >
          <IconMenu className="h-6 w-6" />
        </button>
        <Link href="/agenda" aria-label={t("nav.rail.irAAgenda")} className="flex min-h-11 items-center gap-2 rounded-md px-2 text-rail-icon-active">
          <IconPulse className="h-6 w-6 shrink-0" />
          <span className="font-heading text-base">Medicfy BETA</span>
        </Link>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 bg-overlay md:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      ) : null}

      <nav id="nav-principal" aria-label={t("nav.rail.navegacionPrincipal")} className={navClassName}>
        <div className="mb-2 flex items-center gap-1">
          <Link
            href="/agenda"
            aria-label={t("nav.rail.irAAgenda")}
            className={`flex min-h-11 flex-1 items-center gap-2 rounded-md bg-rail-icon-active-bg px-3 text-rail-icon-active ${collapsed ? "md:w-11 md:flex-none md:justify-center md:px-0" : ""}`}
          >
            <IconPulse className="h-6 w-6 shrink-0" />
            {!collapsed ? <span className="font-heading text-base">Medicfy BETA</span> : <span className="font-heading text-base md:hidden">Medicfy BETA</span>}
          </Link>
          {/* Cerrar alcanzable sin depender del velo (táctil y teclado). */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label={t("nav.rail.cerrarNavegacion")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-rail-icon hover:bg-white/10 md:hidden"
          >
            <IconClose className="h-6 w-6" />
          </button>
        </div>

      <ul className="flex flex-1 flex-col gap-1">
        {NAV_LINKS.map(({ href, labelKey, Icon }) => {
          const active = isActive(href);
          const label = t(labelKey);
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
              aria-label={t("nav.rail.administracion")}
              title={collapsed ? t("nav.rail.administracion") : undefined}
              aria-current={isActive("/admin") ? "page" : undefined}
              className={itemClassName(isActive("/admin"))}
            >
              <NavLabel Icon={IconShieldNav} label={t("nav.rail.administracion")} />
            </Link>
          </li>
        )}
        <li>
          <Link
            href="/perfil"
            aria-label={t("nav.rail.perfil")}
            title={collapsed ? t("nav.rail.perfil") : undefined}
            aria-current={isActive("/perfil") ? "page" : undefined}
            className={itemClassName(isActive("/perfil"))}
          >
            <NavLabel Icon={IconUserCircle} label={t("nav.rail.perfil")} />
          </Link>
        </li>
        {/* El idioma se cambia desde cualquier pantalla autenticada, no
            solo desde Perfil: es una preferencia de lectura, y quien la
            necesita es porque no está entendiendo lo que ve ahora. */}
        <li className={collapsed ? "md:flex md:justify-center" : ""}>
          <LanguageSwitcher tone="rail" showLabel={!collapsed} align="side" />
        </li>
        <li>
          <button type="button" onClick={handleLogout} aria-label={t("nav.rail.cerrarSesion")} title={collapsed ? t("nav.rail.cerrarSesion") : undefined} className={itemClassName(false)}>
            <NavLabel Icon={IconLogout} label={t("nav.rail.cerrarSesion")} />
          </button>
        </li>
      </ul>
      </nav>

      {/* Plegar/desplegar: pestaña redonda montada sobre el borde derecho
          del rail, a media altura. Va FUERA del <nav> y con posición fija
          porque el rail tiene scroll propio (overflow-y-auto) y recortaría
          cualquier cosa que sobresalga de su borde. Se ancla con el mismo
          --app-rail-width que publica este componente. Área táctil de
          44x44 (§5) con un círculo visible más pequeño al centro. Solo
          escritorio: en móvil el panel se cierra, no se pliega. */}
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? t("nav.rail.expandirBarra") : t("nav.rail.colapsarBarra")}
        aria-controls="nav-principal"
        aria-expanded={!collapsed}
        title={collapsed ? t("nav.rail.expandirBarra") : t("nav.rail.colapsarBarra")}
        className="group fixed top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center md:flex"
        style={{ left: `calc(var(${RAIL_WIDTH_CSS_VAR}, 0px) - 22px)` }}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 shadow-card transition-colors group-hover:bg-brand-100 group-hover:text-brand-900">
          <IconChevronNav className={`h-4 w-4 shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </span>
      </button>
    </>
  );
}
