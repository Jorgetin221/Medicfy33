"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { tokenPrimaryRole } from "@/lib/jwt-claims";
import { Button } from "@/components/ui/button";

// v2.4 (spec §7, M3): header del home de descubrimiento del paciente
// y de /doctores — consciente del rol real de la sesión (nunca un
// ícono de notificaciones o buscador decorativo sin datos reales
// detrás, CLAUDE.md §7).
export function SiteHeader() {
  const router = useRouter();
  const { accessToken, isLoading, logout } = useAuth();
  const role = tokenPrimaryRole(accessToken);

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gray-300 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="font-brand text-xl font-bold text-brand-900">
          Medicfy
        </Link>
        <nav className="hidden items-center gap-4 sm:flex" aria-label="Principal">
          <Link href="/doctores" className="text-base font-medium text-gray-700 hover:text-brand-700">
            Especialistas
          </Link>
          {role === "PATIENT" ? (
            <Link href="/mi-cuenta" className="text-base font-medium text-gray-700 hover:text-brand-700">
              Mis citas
            </Link>
          ) : null}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          {isLoading ? null : accessToken ? (
            <>
              {role === "PATIENT" ? (
                <Link href="/mi-cuenta">
                  <Button variant="secondary" className="px-3 sm:px-4">
                    Mi cuenta
                  </Button>
                </Link>
              ) : (
                <Link href="/agenda">
                  <Button variant="secondary" className="px-3 sm:px-4">
                    Mi agenda
                  </Button>
                </Link>
              )}
              <button type="button" onClick={() => void handleLogout()} className="text-sm font-medium text-gray-500 underline">
                Salir
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex min-h-[44px] items-center rounded-md px-2 text-base font-medium text-brand-700 hover:underline sm:px-3"
              >
                Iniciar sesión
              </Link>
              <RegisterMenu />
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// Un botón, dos destinos: paciente sigue en /registro-paciente; médico
// va a /para-medicos — el mismo enlace que antes vivía como "¿Eres
// médico? Regístrate aquí" en el footer del home (ahora retirado de
// ahí, este menú es la única entrada).
function RegisterMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Button className="px-3 sm:px-4" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Regístrate
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 rounded-md border border-gray-300 bg-white p-2 shadow-card"
        >
          <Link
            href="/registro-paciente"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-[44px] items-center rounded-md px-3 text-base text-gray-900 hover:bg-gray-100"
          >
            Registrarme como paciente
          </Link>
          <Link
            href="/para-medicos"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-[44px] items-center rounded-md px-3 text-base text-gray-900 hover:bg-gray-100"
          >
            Registrarme como médico
          </Link>
        </div>
      ) : null}
    </div>
  );
}
